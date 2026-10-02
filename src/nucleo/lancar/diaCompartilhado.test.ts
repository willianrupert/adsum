// Dia com mais de um professor (`docs/13`). A quinta de CIN0144: das 8h às
// 10h um professor, das 10h às 12h outro, e no SIGAA uma coluna só, de
// máximo 4. Cada computador com o Adsum é um nó sem canal com o outro; o
// único estado comum é o número da célula, e cada nó guarda a própria parte
// no livro-razão (a auditoria da pasta).
//
// Estes testes vieram antes do código, e falham até ele existir. Os que já
// passam guardam o que não pode mudar no caminho.

import { describe, expect, it } from 'vitest'
import { sorteador } from '../../testes/planilhaSigaa.ts'
import type { Aula } from '../grade.ts'
import type { Evento, Matriculado } from '../tipos.ts'
import { conciliar } from './conciliar.ts'
import { planejar } from './plano.ts'
import { comoDia, type Celula, type ChaveDeSoma, type Conciliada, type LeituraPlanilha, type LinhaDeAuditoria } from './tipos.ts'

const TURMA = 'CIN0144 · T01'
const QUI = comoDia('2026-10-15')!
const QUINTA = 4
const MAXIMO = 4

/** A grade de cada professor na quinta: duas aulas de 50 min cada. */
const bloco = (inicio: string, fim: string, professor: string): Aula => ({ uidHashProfessor: professor, dia: QUINTA, inicio, fim, turma: TURMA })
const DO_PAULO = [bloco('10:00', '11:40', 'paulo')]
const DO_RICARDO = [bloco('08:00', '09:40', 'ricardo')]
const O_DIA_TODO = [bloco('08:00', '11:40', 'paulo')]

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
function ev(parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>, hora = '10'): Evento {
  numero += 1
  return {
    eventoId: `web-teste-${numero}`,
    quando: new Date(`${QUI}T${hora}:${String(numero % 60).padStart(2, '0')}:00`).toISOString(),
    turma: TURMA,
    uidHash: 'x',
    nome: '',
    ...parcial,
  }
}
/** A chamada de um professor na quinta: quem ele viu no bloco dele. Mais recente primeiro. */
const chamada = (presentes: string[], hora = '10') =>
  [ev({ origem: 'professor', resultado: 'ok' }, hora), ...presentes.map((m) => ev({ origem: 'cracha', resultado: 'ok', matricula: m, nome: m }, hora))].reverse()

const V: Celula = { tipo: 'vazia' }
const L = (faltas: number): Celula => ({ tipo: 'lancada', faltas })

function pagina(celulas: Record<string, Celula>, lancada = Object.values(celulas).some((c) => c.tipo === 'lancada')): LeituraPlanilha {
  return {
    id: 'l1',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'CIN0144 - APRENDIZADO INVENTADO - Turma: 01 (2026.2)',
    colunas: [{ indice: 0, dia: QUI, maximo: MAXIMO, ...(lancada ? { marca: 'lancado' as const } : {}) }],
    linhas: Object.entries(celulas).map(([matricula, celula], indice) => ({ indice, matricula, celulas: [celula] })),
  }
}

const chave = (ligada: boolean, em = '2026-10-15T13:00:00.000Z'): ChaveDeSoma => ({ turma: TURMA, dia: QUI, ligada, em })

const linhaDoLivro = (acao: LinhaDeAuditoria['acao'], matricula: string, lido: string, aplicado: string, quando: string): LinhaDeAuditoria => ({
  turma: TURMA,
  quando,
  acao,
  versaoSigaa: '4.15.0.206',
  dia: QUI,
  matricula,
  lido,
  proposto: aplicado,
  aplicado,
})
/** O nó somou: leu `lido` e escreveu `aplicado`. */
const somou = (matricula: string, lido: number, aplicado: number) => linhaDoLivro('preenchimento', matricula, String(lido), String(aplicado), '2026-10-15T13:10:00.000Z')
/** Uma leitura depois mostrou o que ele escreveu: a soma chegou ao SIGAA. */
const conferiu = (matricula: string, lido: number) => linhaDoLivro('conferencia', matricula, String(lido), '', '2026-10-15T13:20:00.000Z')

interface No {
  aulas?: Aula[]
  eventos: Evento[]
  auditoria?: LinhaDeAuditoria[]
  chaves?: ChaveDeSoma[]
}

const conciliarNo = (no: No, leitura: LeituraPlanilha) =>
  conciliar({ leitura, turma: TURMA, matriculados: TURMA_TODA, eventos: no.eventos, ajustes: [], aulas: no.aulas, auditoria: no.auditoria, chaves: no.chaves })

const celula = (r: ReturnType<typeof conciliar>, matricula: string) => r.celulas.find((c) => c.matricula === matricula) as Conciliada

describe('a parte de cada professor vem da grade dele', () => {
  it('ausente ao bloco das 10h às 12h leva 2, não os 4 da coluna (o defeito no ar)', () => {
    const r = conciliarNo({ aulas: DO_PAULO, eventos: chamada([ANA]) }, pagina({ [ANA]: V, [BRENO]: V }))
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
  })

  it('presente continua 0', () => {
    const r = conciliarNo({ aulas: DO_PAULO, eventos: chamada([ANA]) }, pagina({ [ANA]: V, [BRENO]: V }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
  })

  it('com a grade cobrindo o dia todo, ausente leva o máximo, como hoje', () => {
    const r = conciliarNo({ aulas: O_DIA_TODO, eventos: chamada([ANA]) }, pagina({ [ANA]: V, [BRENO]: V }))
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aLancar', esperado: MAXIMO })
  })

  it('sem grade para o dia, ausente leva o máximo, como hoje', () => {
    const r = conciliarNo({ eventos: chamada([ANA]) }, pagina({ [ANA]: V, [BRENO]: V }))
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aLancar', esperado: MAXIMO })
  })
})

describe('a chave: somar sobre o número de outro professor', () => {
  // O Ricardo lançou: ANA veio (0), BRENO faltou (2), CAIO faltou (2).
  // No bloco do Paulo: ANA e BRENO faltaram, CAIO veio.
  const doRicardo = () => pagina({ [ANA]: L(0), [BRENO]: L(2), [CAIO]: L(2) })
  const paulo = (chaves: ChaveDeSoma[] = []): No => ({ aulas: DO_PAULO, eventos: chamada([CAIO]), chaves })

  it('sem a chave, o número do outro professor é dele: nada a escrever, e não é divergência', () => {
    const r = conciliarNo(paulo(), doRicardo())
    for (const m of [ANA, BRENO, CAIO]) expect(celula(r, m).categoria).toBe('deOutroProfessor')
    expect(planejar(r, [])).toEqual([])
  })

  it('com a chave, quem faltou ao bloco leva a parte somada ao que está lá, e só se a célula ainda mostrar o mesmo número', () => {
    const r = conciliarNo(paulo([chave(true)]), doRicardo())
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aSomar', sigaa: 0, parte: 2 })
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aSomar', sigaa: 2, parte: 2 })
    expect(celula(r, CAIO).categoria).toBe('confere')
    expect(planejar(r, [])).toEqual([
      { linha: 0, coluna: 0, antes: 0, valor: 2 },
      { linha: 1, coluna: 0, antes: 2, valor: 4 },
    ])
  })

  it('desligar depois vale: a chave mais nova manda', () => {
    const r = conciliarNo(paulo([chave(true, '2026-10-15T13:00:00.000Z'), chave(false, '2026-10-15T13:05:00.000Z')]), doRicardo())
    expect(celula(r, ANA).categoria).toBe('deOutroProfessor')
    expect(planejar(r, [])).toEqual([])
  })

  it('se a soma passaria do máximo, nada é escrito, e o caso é dito', () => {
    // O outro professor contou o dia inteiro: 4 já é o teto.
    const r = conciliarNo(paulo([chave(true)]), pagina({ [ANA]: L(4) }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'passaDoMaximo', sigaa: 4, parte: 2 })
    expect(planejar(r, [])).toEqual([])
  })

  it('vazia em coluna já lançada continua de fora, mesmo com a chave: pode ser quem entrou depois na turma', () => {
    const r = conciliarNo(paulo([chave(true)]), pagina({ [ANA]: L(0), [BRENO]: V }, true))
    expect(celula(r, BRENO).categoria).toBe('fora')
  })
})

describe('o livro-razão: cada computador soma uma vez só', () => {
  const paulo = (auditoria: LinhaDeAuditoria[]): No => ({ aulas: DO_PAULO, eventos: chamada([]), auditoria, chaves: [chave(true)] })

  it('depois de somar, a mesma célula não ganha outra soma', () => {
    const r = conciliarNo(paulo([somou(ANA, 0, 2), conferiu(ANA, 2)]), pagina({ [ANA]: L(2) }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'somada', aplicado: 2 })
    expect(planejar(r, [])).toEqual([])
  })

  it('o outro professor somou depois: o Adsum percebe pelo número maior, e não mexe', () => {
    const r = conciliarNo(paulo([somou(ANA, 0, 2), conferiu(ANA, 2)]), pagina({ [ANA]: L(4) }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'somada', aplicado: 2, outroSomou: 2 })
    expect(planejar(r, [])).toEqual([])
  })

  it('o número caiu depois da soma confirmada: correção ou gravação concorrente, e o Adsum só avisa', () => {
    const r = conciliarNo(paulo([somou(ANA, 0, 2), conferiu(ANA, 2)]), pagina({ [ANA]: L(0) }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'mudouDepois', lido: 0, aplicado: 2, sigaa: 0 })
    expect(planejar(r, [])).toEqual([])
  })

  it('a soma que não chegou ao SIGAA (página fechada antes de gravar) pode ser feita de novo', () => {
    const r = conciliarNo(paulo([somou(ANA, 0, 2)]), pagina({ [ANA]: L(0) }))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'naoChegou', sigaa: 0, parte: 2 })
    expect(planejar(r, [])).toEqual([{ linha: 0, coluna: 0, antes: 0, valor: 2 }])
  })
})

/** A página depois de o favorito aplicar o plano: compare-and-set, como na página de verdade. */
function aplicar(leitura: LeituraPlanilha, instrucoes: { linha: number; coluna: number; antes: unknown; valor: number }[]): LeituraPlanilha {
  const linhas = leitura.linhas.map((l) => ({ ...l, celulas: [...l.celulas] }))
  for (const i of instrucoes) {
    const atual = linhas[i.linha].celulas[i.coluna]
    const mostra = atual.tipo === 'vazia' ? 'vazia' : atual.tipo === 'lancada' ? atual.faltas : 'bloqueada'
    if (mostra !== i.antes) throw new Error(`a célula ${i.linha}×${i.coluna} mostra ${String(mostra)}, e a instrução esperava ${String(i.antes)}`)
    linhas[i.linha].celulas[i.coluna] = L(i.valor)
  }
  return { ...leitura, colunas: leitura.colunas.map((c) => ({ ...c, marca: 'lancado' as const })), linhas }
}

/** O que o nó anota no livro-razão ao preencher, e a leitura seguinte que confirma. */
function anotar(leitura: LeituraPlanilha, instrucoes: { linha: number; antes: unknown; valor: number }[]): LinhaDeAuditoria[] {
  return instrucoes.flatMap((i) => {
    const matricula = leitura.linhas[i.linha].matricula
    const lido = i.antes === 'vazia' ? '' : String(i.antes)
    return [linhaDoLivro('preenchimento', matricula, lido, String(i.valor), '2026-10-15T13:10:00.000Z'), conferiu(matricula, i.valor)]
  })
}

describe('as leis do dia compartilhado, em 300 turmas sorteadas', () => {
  const SEMENTES = Array.from({ length: 300 }, (_, i) => i + 1)
  const MATRICULAS = Array.from({ length: 12 }, (_, i) => `202600000${String(i + 10)}`)

  function sortear(semente: number) {
    const s = sorteador(semente)
    const noBlocoDoRicardo = MATRICULAS.filter(() => s.chance(0.7))
    const noBlocoDoPaulo = MATRICULAS.filter(() => s.chance(0.7))
    const esperado = new Map(MATRICULAS.map((m) => [m, (noBlocoDoRicardo.includes(m) ? 0 : 2) + (noBlocoDoPaulo.includes(m) ? 0 : 2)]))
    const ricardo: No = { aulas: DO_RICARDO, eventos: chamada(noBlocoDoRicardo, '08'), chaves: [chave(true)] }
    const paulo: No = { aulas: DO_PAULO, eventos: chamada(noBlocoDoPaulo, '10'), chaves: [chave(true)] }
    const vazia = pagina(Object.fromEntries(MATRICULAS.map((m) => [m, V])), false)
    return { ricardo, paulo, vazia, esperado }
  }

  const valores = (leitura: LeituraPlanilha) =>
    new Map(leitura.linhas.map((l) => [l.matricula, l.celulas[0].tipo === 'lancada' ? l.celulas[0].faltas : undefined]))

  const conciliarCom = (no: No, leitura: LeituraPlanilha) =>
    conciliar({ leitura, turma: TURMA, matriculados: MATRICULAS.map(aluno), eventos: no.eventos, ajustes: [], aulas: no.aulas, auditoria: no.auditoria, chaves: no.chaves })
  const lancarCom = (no: No, leitura: LeituraPlanilha) => {
    const plano = planejar(conciliarCom(no, leitura), [])
    return { leitura: aplicar(leitura, plano), no: { ...no, auditoria: [...(no.auditoria ?? []), ...anotar(leitura, plano)] } }
  }

  function paraCada(lei: (semente: number) => void) {
    for (const semente of SEMENTES) {
      try {
        lei(semente)
      } catch (erro) {
        throw new Error(`semente ${semente}: ${(erro as Error).message}`, { cause: erro })
      }
    }
  }

  it('a ordem não importa: Ricardo e depois Paulo, ou o contrário, terminam com a soma das duas partes', () => {
    paraCada((semente) => {
      const { ricardo, paulo, vazia, esperado } = sortear(semente)
      const rp = lancarCom(paulo, lancarCom(ricardo, vazia).leitura).leitura
      const pr = lancarCom(ricardo, lancarCom(paulo, vazia).leitura).leitura
      expect(valores(rp)).toEqual(esperado)
      expect(valores(pr)).toEqual(esperado)
    })
  })

  it('uma vez por nó: lançar de novo, depois de tudo, não escreve nada', () => {
    paraCada((semente) => {
      const { ricardo, paulo, vazia } = sortear(semente)
      const primeiro = lancarCom(ricardo, vazia)
      const segundo = lancarCom(paulo, primeiro.leitura)
      expect(planejar(conciliarCom(primeiro.no, segundo.leitura), [])).toEqual([])
      expect(planejar(conciliarCom(segundo.no, segundo.leitura), [])).toEqual([])
    })
  })

  it('nunca diminui, e nunca passa do máximo', () => {
    paraCada((semente) => {
      const s = sorteador(semente + 1000)
      const { paulo } = sortear(semente)
      const qualquer = pagina(Object.fromEntries(MATRICULAS.map((m) => [m, L(s.entre(0, MAXIMO))])))
      for (const i of planejar(conciliarCom(paulo, qualquer), [])) {
        const antes = qualquer.linhas[i.linha].celulas[i.coluna]
        if (antes.tipo === 'lancada') expect(i.valor).toBeGreaterThanOrEqual(antes.faltas)
        expect(i.valor).toBeLessThanOrEqual(MAXIMO)
      }
    })
  })
})

