// Aula com mais de um professor (`docs/13`). A quinta de CIN0144: das 8h às
// 10h um professor, das 10h às 12h outro, e no SIGAA uma coluna só, de
// máximo 4. A regra por enquanto é simples: cada professor lança a sua
// parte; o Adsum escreve só em coluna vazia, e na coluna que outra pessoa
// já lançou ele não escreve nada e diz o que lançar à mão.

import { describe, expect, it } from 'vitest'
import type { Aula } from '../grade.ts'
import type { Evento, Matriculado } from '../tipos.ts'
import { conciliar } from './conciliar.ts'
import { planejar } from './plano.ts'
import { comoDia, type Celula, type Conciliada, type LeituraPlanilha, type LinhaDeAuditoria } from './tipos.ts'

const TURMA = 'CIN0144 · T01'
const QUI = comoDia('2026-10-15')!
const QUINTA = 4
const MAXIMO = 4

/** A grade do professor na quinta. Das 10h às 11h40 são duas aulas de 50 min. */
const bloco = (inicio: string, fim: string): Aula => ({ uidHashProfessor: 'p', dia: QUINTA, inicio, fim, turma: TURMA })
const DO_PAULO = [bloco('10:00', '11:40')]
const O_DIA_TODO = [bloco('08:00', '11:40')]

const aluno = (matricula: string): Matriculado => ({
  turma: TURMA,
  chave: matricula,
  matricula,
  nome: `Aluno ${matricula.slice(-2)}`,
  nomeCompleto: `ALUNO ${matricula.slice(-2)} INVENTADO`,
  papel: 'aluno',
})
const ANA = '20260000001'
const BRENO = '20260000002'
const CAIO = '20260000003'
const TURMA_TODA = [ANA, BRENO, CAIO].map(aluno)

let numero = 0
function ev(parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento {
  numero += 1
  return {
    eventoId: `web-teste-${numero}`,
    quando: new Date(`${QUI}T10:${String(numero % 60).padStart(2, '0')}:00`).toISOString(),
    turma: TURMA,
    uidHash: 'x',
    nome: '',
    ...parcial,
  }
}
/** A chamada do Paulo na quinta: quem ele viu no bloco dele. Mais recente primeiro. */
const chamada = (presentes: string[]) =>
  [ev({ origem: 'professor', resultado: 'ok' }), ...presentes.map((m) => ev({ origem: 'cracha', resultado: 'ok', matricula: m, nome: m }))].reverse()

const V: Celula = { tipo: 'vazia' }
const L = (faltas: number): Celula => ({ tipo: 'lancada', faltas })

function pagina(celulas: Record<string, Celula>, maximo = MAXIMO): LeituraPlanilha {
  const lancada = Object.values(celulas).some((c) => c.tipo === 'lancada')
  return {
    id: 'l1',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'CIN0144 - APRENDIZADO INVENTADO - Turma: 01 (2026.2)',
    colunas: [{ indice: 0, dia: QUI, maximo, ...(lancada ? { marca: 'lancado' as const } : {}) }],
    linhas: Object.entries(celulas).map(([matricula, celula], indice) => ({ indice, matricula, celulas: [celula] })),
  }
}

/** O Adsum deste computador preencheu a célula numa leitura anterior. */
const preencheu = (matricula: string, valor: number): LinhaDeAuditoria => ({
  turma: TURMA,
  quando: '2026-10-15T13:10:00.000Z',
  acao: 'preenchimento',
  versaoSigaa: '4.15.0.206',
  dia: QUI,
  matricula,
  lido: '',
  proposto: String(valor),
  aplicado: String(valor),
})

const conciliarCom = (leitura: LeituraPlanilha, { aulas = DO_PAULO, presentes = [CAIO], auditoria = [] as LinhaDeAuditoria[] } = {}) =>
  conciliar({ leitura, turma: TURMA, matriculados: TURMA_TODA, eventos: chamada(presentes), ajustes: [], aulas, auditoria })

const celula = (r: ReturnType<typeof conciliar>, matricula: string) => r.celulas.find((c) => c.matricula === matricula) as Conciliada

describe('a parte de cada professor vem da grade dele', () => {
  it('ausente ao bloco das 10h às 12h leva 2, não os 4 da coluna', () => {
    const r = conciliarCom(pagina({ [ANA]: V, [CAIO]: V }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
    expect(celula(r, CAIO)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
    expect(r.compartilhados).toEqual([{ dia: QUI, parte: 2, maximo: MAXIMO }])
  })

  it('com a grade cobrindo o dia todo, ausente leva o máximo, como sempre', () => {
    const r = conciliarCom(pagina({ [ANA]: V }), { aulas: O_DIA_TODO })
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: MAXIMO })
    expect(r.compartilhados).toEqual([])
  })

  it('sem grade para o dia, ausente leva o máximo, como sempre', () => {
    const r = conciliarCom(pagina({ [ANA]: V }), { aulas: [] })
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: MAXIMO })
  })

  it('a grade nunca passa do máximo da coluna', () => {
    const r = conciliarCom(pagina({ [ANA]: V }, 1))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 1 })
  })
})

describe('a aula compartilhada que outra pessoa já lançou: o Adsum não escreve, e diz o que lançar à mão', () => {
  // O Ricardo lançou: ANA veio (0), BRENO faltou (2), CAIO faltou (2).
  // No bloco do Paulo: ANA e BRENO faltaram, CAIO veio.
  const doRicardo = () => pagina({ [ANA]: L(0), [BRENO]: L(2), [CAIO]: L(2) })

  it('nada a escrever, nenhuma diferença célula a célula, e a lista de quem faltou ao bloco', () => {
    const r = conciliarCom(doRicardo())
    for (const m of [ANA, BRENO, CAIO]) expect(celula(r, m).categoria).toBe('fora')
    expect(planejar(r, [])).toEqual([])
    expect(r.lancadasPorOutro).toEqual([{ dia: QUI, parte: 2, presentes: 1, ausentes: [ANA, BRENO] }])
  })

  it('ninguém faltou ao bloco: nada a lançar à mão, e nenhum aviso', () => {
    const r = conciliarCom(doRicardo(), { presentes: [ANA, BRENO, CAIO] })
    for (const m of [ANA, BRENO, CAIO]) expect(celula(r, m).categoria).toBe('fora')
    expect(r.lancadasPorOutro).toEqual([])
  })

  it('lançada à mão igual à chamada do Adsum: confere, sem aviso', () => {
    const r = conciliarCom(pagina({ [ANA]: L(2), [BRENO]: L(2), [CAIO]: L(0) }))
    for (const m of [ANA, BRENO, CAIO]) expect(celula(r, m).categoria).toBe('confere')
    expect(r.lancadasPorOutro).toEqual([])
  })

  it('lançada pelo próprio Adsum, e o outro professor somou depois: sem aviso, e a soma dele não é diferença', () => {
    const auditoria = [preencheu(ANA, 2), preencheu(BRENO, 2), preencheu(CAIO, 0)]
    // O Ricardo somou 2 para BRENO e para CAIO, que faltaram ao bloco dele.
    const r = conciliarCom(pagina({ [ANA]: L(2), [BRENO]: L(4), [CAIO]: L(2) }), { auditoria })
    expect(celula(r, ANA).categoria).toBe('confere')
    expect(celula(r, BRENO).categoria).toBe('fora')
    expect(celula(r, CAIO).categoria).toBe('fora')
    expect(r.lancadasPorOutro).toEqual([])
    expect(planejar(r, [])).toEqual([])
  })

  it('lançada pelo próprio Adsum, e o número caiu abaixo da parte dele: isso é diferença', () => {
    const auditoria = [preencheu(ANA, 2)]
    const r = conciliarCom(pagina({ [ANA]: L(0) }), { auditoria })
    expect(celula(r, ANA)).toMatchObject({ categoria: 'diverge', sigaa: 0, esperado: 2 })
  })

  it('vazia na aula já lançada continua de fora: pode ser quem entrou depois na turma', () => {
    const r = conciliarCom(pagina({ [ANA]: L(0), [BRENO]: V }))
    expect(celula(r, BRENO).categoria).toBe('fora')
  })

  it('aula de um professor só, já lançada: a conferência de sempre, célula a célula', () => {
    const r = conciliarCom(pagina({ [ANA]: L(0) }), { aulas: O_DIA_TODO })
    expect(celula(r, ANA)).toMatchObject({ categoria: 'diverge', sigaa: 0, esperado: MAXIMO })
    expect(r.lancadasPorOutro).toEqual([])
  })
})
