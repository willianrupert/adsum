// Quanto vale a falta em cada aula (`docs/13`). O "número de aulas" do SIGAA
// é um teto, não o que aconteceu: a quinta de CIN0144 aceita até 4, e quem
// faltou ao bloco do Paulo leva 2. O padrão é o que a grade do professor marca
// para aquele dia da semana; sem grade, o teto mais comum da planilha. O
// professor muda na folha, aula por aula.

import { describe, expect, it } from 'vitest'
import type { Aula } from '../grade.ts'
import type { Evento, Matriculado } from '../tipos.ts'
import { conciliar } from './conciliar.ts'
import { comoDia, type Celula, type Conciliada, type Dia, type LeituraPlanilha, type LinhaDeAuditoria } from './tipos.ts'

const TURMA = 'CIN0144 · T01'
const QUI = comoDia('2026-10-15')!
const QUI_ANTES = comoDia('2026-10-08')!
const TER = comoDia('2026-10-13')!
const ANA = '20260000001'
const BRENO = '20260000002'

const aluno = (matricula: string): Matriculado => ({
  turma: TURMA,
  chave: matricula,
  matricula,
  nome: `Aluno ${matricula.slice(-2)}`,
  nomeCompleto: `ALUNO ${matricula.slice(-2)} INVENTADO`,
  papel: 'aluno',
})
const TURMA_TODA = [ANA, BRENO].map(aluno)

let numero = 0
function ev(dia: string, parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento {
  numero += 1
  return {
    eventoId: `web-teste-${numero}`,
    quando: new Date(`${dia}T10:${String(numero % 60).padStart(2, '0')}:00`).toISOString(),
    turma: TURMA,
    uidHash: 'x',
    nome: '',
    ...parcial,
  }
}
/** Em cada dia, a chamada com a ANA presente e o BRENO ausente. Mais recente primeiro. */
const chamadas = (...dias: string[]) =>
  dias.flatMap((d) => [ev(d, { origem: 'professor', resultado: 'ok' }), ev(d, { origem: 'cracha', resultado: 'ok', matricula: ANA, nome: ANA })]).reverse()

const V: Celula = { tipo: 'vazia' }
const L = (faltas: number): Celula => ({ tipo: 'lancada', faltas })

/** Uma coluna por dia, `[dia, máximo, ANA, BRENO]`. */
function pagina(...colunas: [Dia, number, Celula, Celula][]): LeituraPlanilha {
  return {
    id: 'l1',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'CIN0144 - APRENDIZADO INVENTADO - Turma: 01 (2026.2)',
    colunas: colunas.map(([dia, maximo, ...celulas], indice) => ({
      indice,
      dia,
      maximo,
      ...(celulas.some((c) => c.tipo === 'lancada') ? { marca: 'lancado' as const } : {}),
    })),
    linhas: [ANA, BRENO].map((matricula, i) => ({ indice: i, matricula, celulas: colunas.map((c) => c[2 + i] as Celula) })),
  }
}

/** O Adsum preencheu a célula do BRENO com `valor` faltas, naquele dia. */
const preencheu = (dia: Dia, valor: number, quando = `${dia}T13:10:00.000Z`): LinhaDeAuditoria => ({
  turma: TURMA,
  quando,
  acao: 'preenchimento',
  versaoSigaa: '4.15.0.206',
  dia,
  matricula: BRENO,
  lido: '',
  proposto: String(valor),
  aplicado: String(valor),
})

/** A grade do professor: um bloco na quinta. Das 10h às 11h40 são duas aulas de 50 min. */
const naQuinta = (inicio: string, fim: string): Aula[] => [{ uidHashProfessor: 'p', dia: 4, inicio, fim, turma: TURMA }]
const DUAS = naQuinta('10:00', '11:40')
const QUATRO = naQuinta('08:00', '11:40')

const conciliarCom = (
  leitura: LeituraPlanilha,
  dias: string[],
  { auditoria = [] as LinhaDeAuditoria[], escolhas = {} as Partial<Record<Dia, number>>, aulas = [] as Aula[] } = {},
) => conciliar({ leitura, turma: TURMA, matriculados: TURMA_TODA, eventos: chamadas(...dias), ajustes: [], auditoria, escolhas, aulas })

const celula = (r: ReturnType<typeof conciliar>, matricula: string, dia: Dia) => r.celulas.find((c) => c.matricula === matricula && c.dia === dia) as Conciliada

describe('quanto vale a falta: o professor escolhe', () => {
  it('sem escolha e sem aula anterior, o teto mais comum da planilha: a quinta que aceita até 4 vem com 2', () => {
    const r = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI_ANTES, 2, L(0), L(2)], [QUI, 4, V, V]), [QUI])
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
    expect(r.valorDaFalta).toEqual([{ dia: QUI, valor: 2, maximo: 4 }])
  })

  it('a aula que o SIGAA aceita até 12 também vem com o comum, e não com o teto', () => {
    const r = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI_ANTES, 2, L(0), L(2)], [QUI, 12, V, V]), [QUI])
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })

  it('o comum nunca passa do teto da aula', () => {
    const r = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI_ANTES, 2, L(0), L(2)], [QUI, 1, V, V]), [QUI])
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 1 })
  })

  it('numa planilha de uma aula só, o comum é o teto dela', () => {
    const r = conciliarCom(pagina([QUI, 4, V, V]), [QUI])
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 4 })
  })

  it('com a escolha, quem faltou leva o número escolhido, e quem veio continua 0', () => {
    const r = conciliarCom(pagina([QUI, 4, V, V]), [QUI], { escolhas: { [QUI]: 2 } })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
    expect(celula(r, ANA, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
    expect(r.valorDaFalta).toEqual([{ dia: QUI, valor: 2, maximo: 4 }])
  })

  it('a escolha fica entre 1 e o máximo da coluna', () => {
    expect(celula(conciliarCom(pagina([QUI, 4, V, V]), [QUI], { escolhas: { [QUI]: 9 } }), BRENO, QUI)).toMatchObject({ esperado: 4 })
    expect(celula(conciliarCom(pagina([QUI, 4, V, V]), [QUI], { escolhas: { [QUI]: 0 } }), BRENO, QUI)).toMatchObject({ esperado: 1 })
  })
})

describe('o padrão é o que a grade marca', () => {
  it('a grade marca duas aulas na quinta, e o SIGAA aceita até 4: quem faltou leva 2', () => {
    const r = conciliarCom(pagina([QUI, 4, V, V]), [QUI], { aulas: DUAS })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
    expect(r.valorDaFalta).toEqual([{ dia: QUI, valor: 2, maximo: 4 }])
  })

  it('a grade marca quatro: o padrão é 4, e o professor pode mudar para 3', () => {
    expect(celula(conciliarCom(pagina([QUI, 4, V, V]), [QUI], { aulas: QUATRO }), BRENO, QUI)).toMatchObject({ esperado: 4 })
    expect(celula(conciliarCom(pagina([QUI, 4, V, V]), [QUI], { aulas: QUATRO, escolhas: { [QUI]: 3 } }), BRENO, QUI)).toMatchObject({ esperado: 3 })
  })

  it('a grade nunca passa do teto da aula', () => {
    expect(celula(conciliarCom(pagina([QUI, 2, V, V]), [QUI], { aulas: QUATRO }), BRENO, QUI)).toMatchObject({ esperado: 2 })
  })

  it('a grade de outro dia da semana não vale para a quinta', () => {
    const naTerca: Aula[] = [{ uidHashProfessor: 'p', dia: 2, inicio: '08:00', fim: '11:40', turma: TURMA }]
    const r = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI_ANTES, 2, L(0), L(2)], [QUI, 4, V, V]), [QUI], { aulas: naTerca })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })

  it('a grade de outra turma não vale', () => {
    const deOutra: Aula[] = [{ uidHashProfessor: 'p', dia: 4, inicio: '08:00', fim: '11:40', turma: 'OUTRA · T01' }]
    const r = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI_ANTES, 2, L(0), L(2)], [QUI, 4, V, V]), [QUI], { aulas: deOutra })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })

  it('a escolha numa quinta não vira o padrão da seguinte: a grade é a configuração', () => {
    const r = conciliarCom(pagina([QUI_ANTES, 4, L(0), L(1)], [QUI, 4, V, V]), [QUI_ANTES, QUI], { aulas: DUAS, auditoria: [preencheu(QUI_ANTES, 1)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })
})

describe('na conferência depois, a aula lançada é comparada com o que foi escolhido', () => {
  it('lançada pelo Adsum com 1, contra uma grade de 2: confere, porque foi o que o professor escolheu', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(1)]), [QUI], { aulas: DUAS, auditoria: [preencheu(QUI, 1)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'confere', valor: 1 })
  })

  it('lançada à mão com 2, numa quinta em que a grade marca 2: confere', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(2)]), [QUI], { aulas: DUAS })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'confere', valor: 2 })
  })

  it('lançada à mão com 4, numa quinta em que a grade marca 2: diferença, como sempre', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(4)]), [QUI], { aulas: DUAS })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'diverge', sigaa: 4, esperado: 2 })
  })
})
