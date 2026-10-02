// Quanto vale a falta em cada aula (`docs/13`): o professor escolhe, na
// folha, porque só ele sabe se a chamada foi da aula inteira ou só do bloco
// dele. A quinta de CIN0144 tem 4 aulas no SIGAA e dois professores; quem
// faltou ao bloco do Paulo leva 2. Sem escolha, vem a da última aula do mesmo
// dia da semana, e sem nenhuma, o máximo da coluna, como sempre foi.

import { describe, expect, it } from 'vitest'
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

const conciliarCom = (leitura: LeituraPlanilha, dias: string[], { auditoria = [] as LinhaDeAuditoria[], escolhas = {} as Partial<Record<Dia, number>> } = {}) =>
  conciliar({ leitura, turma: TURMA, matriculados: TURMA_TODA, eventos: chamadas(...dias), ajustes: [], auditoria, escolhas })

const celula = (r: ReturnType<typeof conciliar>, matricula: string, dia: Dia) => r.celulas.find((c) => c.matricula === matricula && c.dia === dia) as Conciliada

describe('quanto vale a falta: o professor escolhe', () => {
  it('sem escolha e sem aula anterior, o máximo da coluna, como sempre foi', () => {
    const r = conciliarCom(pagina([QUI, 4, V, V]), [QUI])
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 4 })
    expect(r.valorDaFalta).toEqual([{ dia: QUI, valor: 4, maximo: 4 }])
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

describe('sem escolha nesta folha, vem a da última aula do mesmo dia da semana', () => {
  it('a quinta passada foi lançada com 2: a quinta de agora já vem com 2', () => {
    const r = conciliarCom(pagina([QUI_ANTES, 4, L(0), L(2)], [QUI, 4, V, V]), [QUI_ANTES, QUI], { auditoria: [preencheu(QUI_ANTES, 2)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
  })

  it('a terça não muda a quinta: cada dia da semana tem a sua', () => {
    const r = conciliarCom(pagina([TER, 4, L(0), L(4)], [QUI, 4, V, V]), [TER, QUI], { auditoria: [preencheu(TER, 4)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 4 })
    const s = conciliarCom(pagina([TER, 2, L(0), L(2)], [QUI, 4, V, V]), [TER, QUI], { auditoria: [preencheu(TER, 2)] })
    expect(celula(s, BRENO, QUI)).toMatchObject({ esperado: 4 })
  })

  it('a mais recente vale', () => {
    const auditoria = [preencheu(comoDia('2026-10-01')!, 4), preencheu(QUI_ANTES, 2)]
    const r = conciliarCom(pagina([QUI, 4, V, V]), [QUI], { auditoria })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })

  it('a da semana passada nunca passa do máximo desta coluna', () => {
    const r = conciliarCom(pagina([QUI, 2, V, V]), [QUI], { auditoria: [preencheu(QUI_ANTES, 4)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ esperado: 2 })
  })
})

describe('na conferência depois, a aula lançada é comparada com o que foi escolhido', () => {
  it('lançada pelo Adsum com 2: confere, sem escolha nenhuma nesta folha', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(2)]), [QUI], { auditoria: [preencheu(QUI, 2)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'confere', valor: 2 })
  })

  it('lançada à mão com 2, numa turma em que a quinta vale 2: confere', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(2)]), [QUI], { auditoria: [preencheu(QUI_ANTES, 2)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'confere', valor: 2 })
  })

  it('lançada à mão com 4, numa turma em que a quinta vale 2: diferença, como sempre', () => {
    const r = conciliarCom(pagina([QUI, 4, L(0), L(4)]), [QUI], { auditoria: [preencheu(QUI_ANTES, 2)] })
    expect(celula(r, BRENO, QUI)).toMatchObject({ categoria: 'diverge', sigaa: 4, esperado: 2 })
  })
})
