import { describe, expect, it } from 'vitest'
import { conciliar, escolherTurma } from './conciliar.ts'
import { comoDia, type AjusteSigaa, type Celula, type ColunaDia, type Conciliada, type LeituraPlanilha } from './tipos.ts'
import type { Evento, Matriculado } from '../tipos.ts'

const TURMA = 'CIN0144 · T01'
const TER = comoDia('2026-10-13')!
const QUI = comoDia('2026-10-15')!
const ANA = '20260000001'
const BRENO = '20260000002'

const aluno = (matricula: string, nome: string, turma = TURMA): Matriculado => ({
  turma,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: nome.toUpperCase() + ' INVENTADA',
  papel: 'aluno',
})
const TURMA_TODA = [aluno(ANA, 'Ana Clara'), aluno(BRENO, 'Breno Lima')]

let numero = 0
function ev(dia: string, parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento {
  numero += 1
  return {
    eventoId: `web-teste-${dia.replaceAll('-', '')}-${numero}`,
    quando: new Date(`${dia}T10:${String(numero % 60).padStart(2, '0')}:00`).toISOString(),
    turma: TURMA,
    uidHash: 'x',
    nome: '',
    ...parcial,
  }
}
const abriu = (dia: string, turma = TURMA) => ev(dia, { origem: 'professor', resultado: 'ok', turma })
const cracha = (dia: string, matricula: string, resultado: Evento['resultado'] = 'ok') =>
  ev(dia, { origem: 'cracha', resultado, matricula, nome: matricula })
const aMao = (dia: string, matricula: string, resultado: 'ok' | 'removido') =>
  ev(dia, { origem: 'manual', resultado, matricula, nome: matricula })
/** Mais recente primeiro, como `listarEventos`. */
const log = (...eventos: Evento[]) => [...eventos].reverse()

const V: Celula = { tipo: 'vazia' }
const L = (faltas: number): Celula => ({ tipo: 'lancada', faltas })

function leitura(
  linhas: Record<string, Celula[]>,
  colunas: { dia: string; maximo?: number; marca?: ColunaDia['marca'] }[] = [{ dia: TER, maximo: 2 }],
): LeituraPlanilha {
  return {
    id: 'l1',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
    colunas: colunas.map((c, indice) => ({ indice, ...c, dia: comoDia(c.dia)! })),
    linhas: Object.entries(linhas).map(([matricula, celulas], indice) => ({ indice, matricula, celulas })),
  }
}

function relatorio(
  l: LeituraPlanilha,
  eventos: Evento[],
  ajustes: AjusteSigaa[] = [],
  matriculados: Matriculado[] = TURMA_TODA,
) {
  return conciliar({ leitura: l, turma: TURMA, matriculados, eventos, ajustes })
}

const celula = (r: ReturnType<typeof conciliar>, matricula: string, dia: string = TER) =>
  r.celulas.find((c) => c.matricula === matricula && c.dia === dia) as Conciliada

describe('conciliar: a tabela de categorias', () => {
  it('vazia e presente: a lançar 0', () => {
    const r = relatorio(leitura({ [ANA]: [V] }), log(abriu(TER), cracha(TER, ANA)))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 0, linha: 0, coluna: 0 })
  })

  it('vazia e ausente: a lançar o máximo do dia, não um número fixo', () => {
    const r = relatorio(leitura({ [BRENO]: [V] }, [{ dia: TER, maximo: 3 }]), log(abriu(TER)))
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aLancar', esperado: 3 })
  })

  it('vazia sem chamada no Adsum: fora, o dia não é inventado', () => {
    const r = relatorio(leitura({ [ANA]: [V] }), [])
    expect(celula(r, ANA).categoria).toBe('fora')
  })

  it('bloqueada: fora, mesmo com chamada', () => {
    const r = relatorio(leitura({ [ANA]: [{ tipo: 'bloqueada', motivo: 'trancado' }] }), log(abriu(TER), cracha(TER, ANA)))
    expect(celula(r, ANA).categoria).toBe('fora')
  })

  it('lançada igual ao Adsum: confere', () => {
    const r = relatorio(leitura({ [ANA]: [L(0)], [BRENO]: [L(2)] }), log(abriu(TER), cracha(TER, ANA)))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'confere', valor: 0, ajustada: false })
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'confere', valor: 2, ajustada: false })
  })

  it('lançada diferente do Adsum: diverge, com os dois valores', () => {
    const r = relatorio(leitura({ [ANA]: [L(2)] }), log(abriu(TER), cracha(TER, ANA)))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'diverge', sigaa: 2, esperado: 0 })
  })

  it('lançada sem chamada no Adsum: só no SIGAA', () => {
    const r = relatorio(leitura({ [ANA]: [L(1)] }), [])
    expect(celula(r, ANA)).toMatchObject({ categoria: 'soNoSigaa', sigaa: 1 })
  })
})

describe('conciliar: o que decide a presença', () => {
  it('é a mesma regra da planilha de faltas: à mão conta, "Não presente" é falta, crachá repetido é presença', () => {
    const r = relatorio(
      leitura({ [ANA]: [V], [BRENO]: [V] }),
      log(abriu(TER), cracha(TER, ANA), cracha(TER, ANA, 'duplicado'), cracha(TER, BRENO), aMao(TER, BRENO, 'removido')),
    )
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'aLancar', esperado: 2 })

    const soAMao = relatorio(leitura({ [ANA]: [V] }), log(abriu(TER), aMao(TER, ANA, 'ok')))
    expect(celula(soAMao, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
  })

  it('eventos de outra turma não contam', () => {
    const outra = { ...cracha(TER, ANA), turma: 'CIN0144 · T02' }
    const r = relatorio(leitura({ [ANA]: [V] }), log(abriu(TER), outra))
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 2 })
  })

  it('chamada num dia que a página não tem: nada é lançado em outro dia', () => {
    const r = relatorio(leitura({ [ANA]: [V] }), log(abriu(QUI), cracha(QUI, ANA)))
    expect(celula(r, ANA).categoria).toBe('fora')
    expect(r.semOndeLancar).toEqual([{ dia: QUI, motivo: 'semColuna' }])
  })
})

describe('conciliar: o ajuste do professor', () => {
  const ajuste = (valor: number, em: string, matricula = ANA): AjusteSigaa => ({ turma: TURMA, dia: TER, matricula, valor, em })

  it('manda sobre a chamada, e a célula que bate com ele confere ajustada', () => {
    const eventos = log(abriu(TER), cracha(TER, ANA))
    const r = relatorio(leitura({ [ANA]: [L(2)] }), eventos, [ajuste(2, '2026-10-20T10:00:00Z')])
    expect(celula(r, ANA)).toMatchObject({ categoria: 'confere', valor: 2, ajustada: true })
  })

  it('o mais recente vence, em qualquer ordem', () => {
    const eventos = log(abriu(TER))
    const ajustes = [ajuste(1, '2026-10-21T10:00:00Z'), ajuste(0, '2026-10-20T10:00:00Z')]
    const r = relatorio(leitura({ [ANA]: [V] }), eventos, ajustes)
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 1 })
  })

  it('fora da faixa da página, ou num dia sem máximo, não é lançado', () => {
    const eventos = log(abriu(TER), cracha(TER, ANA))
    const acima = relatorio(leitura({ [ANA]: [V] }, [{ dia: TER, maximo: 2 }]), eventos, [ajuste(3, '2026-10-20T10:00:00Z')])
    expect(celula(acima, ANA).categoria).toBe('fora')
    const semMaximo = relatorio(leitura({ [ANA]: [V] }, [{ dia: TER }]), [], [ajuste(1, '2026-10-20T10:00:00Z')])
    expect(celula(semMaximo, ANA).categoria).toBe('fora')
  })

  it('no mesmo instante, vence o gravado depois: Desfazer logo depois de Aceitar desfaz', () => {
    const eventos = log(abriu(TER), cracha(TER, ANA))
    const mesmoInstante = '2026-10-20T10:00:00.000Z'
    const r = relatorio(leitura({ [ANA]: [L(2)] }), eventos, [ajuste(2, mesmoInstante), ajuste(0, mesmoInstante)])
    expect(celula(r, ANA)).toMatchObject({ categoria: 'diverge', sigaa: 2, esperado: 0 })
  })

  it('de outra turma não conta', () => {
    const r = relatorio(leitura({ [ANA]: [V] }), log(abriu(TER), cracha(TER, ANA)), [
      { ...ajuste(2, '2026-10-20T10:00:00Z'), turma: 'CIN0144 · T02' },
    ])
    expect(celula(r, ANA)).toMatchObject({ categoria: 'aLancar', esperado: 0 })
  })
})

describe('conciliar: o que fica fora da grade', () => {
  it('matrícula da página sem par no Adsum: listada, e nunca recebe falta', () => {
    const estranho = '20269990000'
    const r = relatorio(leitura({ [ANA]: [V], [estranho]: [V] }), log(abriu(TER), cracha(TER, ANA)))
    expect(r.semParSigaa).toEqual([estranho])
    expect(celula(r, estranho).categoria).toBe('fora')

    const lancada = relatorio(leitura({ [estranho]: [L(2)] }), log(abriu(TER)))
    expect(celula(lancada, estranho)).toMatchObject({ categoria: 'soNoSigaa', sigaa: 2 })
  })

  it('matriculado do Adsum sem linha na página: listado', () => {
    const r = relatorio(leitura({ [ANA]: [V] }), log(abriu(TER)))
    expect(r.semParAdsum).toEqual([BRENO])
  })

  it('professor da turma não é aluno sem par', () => {
    const prof = { ...aluno('999', 'Prof'), papel: 'professor' as const }
    const r = relatorio(leitura({ [ANA]: [V], [BRENO]: [V] }), log(abriu(TER)), [], [...TURMA_TODA, prof])
    expect(r.semParAdsum).toEqual([])
  })

  it('chamada em dia que não é coluna, ou é feriado ou cancelada: sem onde lançar', () => {
    const r = relatorio(
      leitura(
        { [ANA]: [{ tipo: 'bloqueada', motivo: 'feriado' }, { tipo: 'bloqueada', motivo: 'cancelada' }] },
        [{ dia: TER, maximo: 2, marca: 'feriado' }, { dia: QUI, maximo: 2, marca: 'cancelada' }],
      ),
      log(abriu(TER), abriu(QUI), abriu('2026-10-20')),
    )
    expect(r.semOndeLancar).toEqual([
      { dia: TER, motivo: 'feriado' },
      { dia: QUI, motivo: 'cancelada' },
      { dia: '2026-10-20', motivo: 'semColuna' },
    ])
  })

  it('aula já lançada no SIGAA é do professor: vazia ali fica como está, contada; lançada ali continua conferida', () => {
    // Na planilha real, quem entrou na turma depois ficou vazio nas aulas já lançadas.
    const r = relatorio(
      leitura({ [ANA]: [V], [BRENO]: [L(2)] }, [{ dia: TER, maximo: 2, marca: 'lancado' }]),
      log(abriu(TER), cracha(TER, BRENO)),
    )
    expect(celula(r, ANA).categoria).toBe('fora')
    expect(celula(r, BRENO)).toMatchObject({ categoria: 'diverge', sigaa: 2, esperado: 0 })
    expect(r.vaziasEmAulaLancada).toEqual([{ dia: TER, quantas: 1 }])
  })

  it('aula suspensa e chamada fora do período letivo também não têm onde lançar, com o motivo', () => {
    const fora = { tipo: 'bloqueada' as const, motivo: 'foraDoPeriodo' as const }
    const r = relatorio(
      leitura({ [ANA]: [{ tipo: 'bloqueada', motivo: 'suspensa' }, fora], [BRENO]: [{ tipo: 'bloqueada', motivo: 'suspensa' }, fora] }, [
        { dia: TER, maximo: 2, marca: 'suspensa' },
        { dia: QUI, maximo: 2 },
      ]),
      log(abriu(TER), abriu(QUI)),
    )
    expect(r.semOndeLancar).toEqual([
      { dia: TER, motivo: 'suspensa' },
      { dia: QUI, motivo: 'foraDoPeriodo' },
    ])
    expect(r.semMaximo).toEqual([])
  })

  it('dia com chamada e sem máximo: o dia inteiro fica fora, e vai para "sem máximo"', () => {
    const r = relatorio(leitura({ [ANA]: [V], [BRENO]: [V] }, [{ dia: TER }]), log(abriu(TER), cracha(TER, ANA)))
    expect(r.semMaximo).toEqual([TER])
    expect(r.celulas.map((c) => c.categoria)).toEqual(['fora', 'fora'])
  })

  it('dia sem máximo: a célula já lançada também fica fora, e não vira "só no SIGAA"', () => {
    const r = relatorio(leitura({ [ANA]: [L(0)], [BRENO]: [L(2)] }, [{ dia: TER }]), log(abriu(TER), cracha(TER, ANA)))
    expect(r.celulas.map((c) => c.categoria)).toEqual(['fora', 'fora'])
  })

  it('dia sem máximo e sem chamada não é problema de ninguém', () => {
    const r = relatorio(leitura({ [ANA]: [V] }, [{ dia: TER }]), [])
    expect(r.semMaximo).toEqual([])
  })

  it('uma célula por par linha × coluna, e nenhum nome no relatório', () => {
    const r = relatorio(
      leitura({ [ANA]: [V, L(0)], [BRENO]: [L(2), V] }, [{ dia: TER, maximo: 2 }, { dia: QUI, maximo: 2 }]),
      log(abriu(TER), cracha(TER, ANA), abriu(QUI)),
    )
    expect(r.celulas).toHaveLength(4)
    expect(JSON.stringify(r)).not.toMatch(/Ana|Breno|INVENTADA/)
  })
})

describe('qual turma', () => {
  const pagina = (cabecalho: string, matriculas: string[]) => ({
    ...leitura(Object.fromEntries(matriculas.map((m) => [m, [V]]))),
    cabecalhoTurma: cabecalho,
  })
  const CAB = 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)'

  it('a do código do cabeçalho cujas matrículas cobrem a página', () => {
    const t02 = [aluno('3', 'Caio', 'CIN0144 · T02'), aluno('4', 'Duda', 'CIN0144 · T02')]
    const outra = [aluno(ANA, 'Ana Clara', 'CIN0114 · T01')]
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), [...TURMA_TODA, ...t02, ...outra])).toEqual({ turma: TURMA })
    expect(escolherTurma(pagina(CAB, ['3', '4']), [...TURMA_TODA, ...t02])).toEqual({ turma: 'CIN0144 · T02' })
  })

  it('aceita alguns sem par, não a maioria', () => {
    const dez = Array.from({ length: 10 }, (_, i) => aluno(String(100 + i), `A${i}`))
    const pag = (quantosDeFora: number) =>
      pagina(CAB, [...dez.slice(quantosDeFora).map((a) => a.matricula), ...Array.from({ length: quantosDeFora }, (_, i) => `x${i}`)])
    expect(escolherTurma(pag(2), dez)).toEqual({ turma: TURMA })
    expect(escolherTurma(pag(3), dez)).toMatchObject({ recusa: 'nenhuma' })
  })

  it('o código pode estar em qualquer lugar do nome que o professor deu à turma', () => {
    const nomeada = TURMA_TODA.map((a) => ({ ...a, turma: '2026.2 - CIN0144 - TURMA A' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), nomeada)).toEqual({ turma: '2026.2 - CIN0144 - TURMA A' })
  })

  it('a mesma gente em outra disciplina não serve: o código decide', () => {
    const outraDisciplina = TURMA_TODA.map((a) => ({ ...a, turma: '2026.2 - CIN0114 - TURMA A' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), outraDisciplina)).toMatchObject({ recusa: 'nenhuma' })
  })

  it('turma sem código no nome, com as matrículas: proposta, para o professor confirmar', () => {
    const semCodigo = TURMA_TODA.map((a) => ({ ...a, turma: 'Programação, turma da manhã' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), semCodigo)).toEqual({ confirmar: 'Programação, turma da manhã', codigo: 'CIN0144' })
  })

  it('confirmada uma vez, a turma sem código não é perguntada de novo', () => {
    const semCodigo = TURMA_TODA.map((a) => ({ ...a, turma: 'Programação' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), semCodigo, { CIN0144: 'Programação' })).toEqual({ turma: 'Programação' })
    // A lembrança de outra turma, ou de outro código, não vale.
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), semCodigo, { CIN0144: 'Outra' })).toEqual({ confirmar: 'Programação', codigo: 'CIN0144' })
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), semCodigo, { CIN0114: 'Programação' })).toEqual({ confirmar: 'Programação', codigo: 'CIN0144' })
  })

  it('a turma com o código ganha da que não tem, sem perguntar', () => {
    const semCodigo = TURMA_TODA.map((a) => ({ ...a, turma: 'Programação' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), [...TURMA_TODA, ...semCodigo])).toEqual({ turma: TURMA })
  })

  it('sem código no nome e sem as matrículas: recusa', () => {
    const outra = [aluno('7', 'Caio', 'Programação'), aluno('8', 'Duda', 'Programação')]
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), outra)).toMatchObject({ recusa: 'nenhuma' })
  })

  it('duas turmas sem código cobrem a página: as duas, para o professor escolher', () => {
    const manha = TURMA_TODA.map((a) => ({ ...a, turma: 'Programação' }))
    const copia = TURMA_TODA.map((a) => ({ ...a, turma: 'Programação (cópia)' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), [...manha, ...copia])).toEqual({ recusa: 'duas', candidatas: ['Programação', 'Programação (cópia)'] })
  })

  it('códigos de outros formatos: IF685, e o código que o anonimizador inventa', () => {
    const if685 = TURMA_TODA.map((a) => ({ ...a, turma: 'IF685 · T01' }))
    expect(escolherTurma(pagina('IF685 - ALGORITMOS - Turma: 01 (2026.2)', [ANA, BRENO]), if685)).toEqual({ turma: 'IF685 · T01' })
    const teste = TURMA_TODA.map((a) => ({ ...a, turma: '2026.2 - TESTE01 - TURMA A' }))
    expect(escolherTurma(pagina('TESTE01 - INVENTADA - Turma: 01 (2026.2)', [ANA, BRENO]), teste)).toEqual({ turma: '2026.2 - TESTE01 - TURMA A' })
  })

  it('nenhuma turma com o código: recusa', () => {
    expect(escolherTurma(pagina('CIN9999 - OUTRA - Turma: 01 (2026.2)', [ANA]), TURMA_TODA)).toMatchObject({ recusa: 'nenhuma' })
  })

  it('cabeçalho sem código legível: recusa', () => {
    expect(escolherTurma(pagina('Frequência', [ANA]), TURMA_TODA)).toMatchObject({ recusa: 'nenhuma' })
  })

  it('duas turmas que cobrem a página: recusa, com as duas', () => {
    const copia = TURMA_TODA.map((a) => ({ ...a, turma: 'CIN0144 · T01b' }))
    expect(escolherTurma(pagina(CAB, [ANA, BRENO]), [...TURMA_TODA, ...copia])).toEqual({
      recusa: 'duas',
      candidatas: [TURMA, 'CIN0144 · T01b'],
    })
  })
})
