import { describe, expect, it } from 'vitest'
import { brutoDaLeitura, gerarCenario, sorteador } from '../../testes/planilhaSigaa.ts'
import { PLANILHA_CIN0114 } from '../../testes/planilhaReal.ts'
import { lerPlanilha, type BrutoPlanilha } from './leitura.ts'
import type { Celula } from './tipos.ts'

/** Um dia depois da captura: as aulas até 29/09 já aconteceram. */
const DIA_DA_CAPTURA = new Date('2026-09-29T12:00:00')
const FIM_DO_SEMESTRE = new Date('2026-12-20T12:00:00')

const daCaptura = (mudar: (b: BrutoPlanilha) => void = () => {}): BrutoPlanilha => {
  const b: BrutoPlanilha = {
    legenda: PLANILHA_CIN0114.legenda,
    periodo: { ...PLANILHA_CIN0114.periodo },
    auxAulas: PLANILHA_CIN0114.auxAulas,
    auxAlunos: PLANILHA_CIN0114.auxAlunos,
  }
  mudar(b)
  return b
}

const contar = (celulas: Celula[]) => {
  const c: Record<string, number> = {}
  for (const x of celulas) {
    const k = x.tipo === 'lancada' ? `lancada ${x.faltas}` : x.tipo === 'bloqueada' ? `bloqueada ${x.motivo}` : 'vazia'
    c[k] = (c[k] ?? 0) + 1
  }
  return c
}

/** Uma planilha pequena, escrita à mão no formato da página (`docs/12`). */
function pequena(): BrutoPlanilha {
  const aula = (d: number, max = 2, lancada = false, feriado = false, cancelada = false, suspensa = false) =>
    [d, 10, max, `Tue Oct ${d} 00:00:00 BRT 2026`, lancada, feriado, cancelada, false, 2026, suspensa].join(',')
  const reg = (id: number, mat: string, d: number, faltas: string, flags: { trancado?: boolean; depois?: boolean; bloqueado?: boolean } = {}) =>
    [id, mat, 'ALUNO INVENTADO', d, 10, faltas, 0, false, 2, id + 1000, `Tue Oct ${d} 00:00:00 BRT 2026`, !!flags.trancado, !!flags.depois, true, !!flags.bloqueado, false].join(',')
  return {
    legenda: 'CIN0144 - DISCIPLINA INVENTADA (60h) - Turma: 01 (2026.2)',
    periodo: { inicio: '2026-08-10 00:00:00.0', fim: '2026-12-12 00:00:00.0' },
    auxAulas: [aula(13, 2, true), aula(15), aula(20, 2, false, true)].join(';'),
    auxAlunos: [
      reg(1, '20260000001', 13, '0'), reg(1, '20260000001', 15, 'null'), reg(1, '20260000001', 20, 'null'),
      reg(2, '20260000002', 13, '2'), reg(2, '20260000002', 15, 'null', { trancado: true }), reg(2, '20260000002', 20, 'null'),
    ].join(';'),
  }
}

describe('lerPlanilha, sobre a planilha real de CIN0114', () => {
  it('lê as 38 aulas e os 45 alunos sem problema nenhum', () => {
    const r = lerPlanilha(daCaptura(), 'l-1', DIA_DA_CAPTURA)
    expect(r.problemas).toEqual([])
    expect(r.leitura!.colunas).toHaveLength(38)
    expect(r.leitura!.linhas).toHaveLength(45)
    expect(r.leitura!.cabecalhoTurma).toMatch(/^CIN0114 - /)
  })

  it('traz o que o docs/12 descreve: máximos de 2, 4 e 12, 12 lançadas e 1 feriado', () => {
    const { colunas } = lerPlanilha(daCaptura(), 'l-1', DIA_DA_CAPTURA).leitura!
    const maximos: Record<string, number> = {}
    for (const c of colunas) maximos[String(c.maximo)] = (maximos[String(c.maximo)] ?? 0) + 1
    expect(maximos).toEqual({ 2: 36, 4: 1, 12: 1 })
    expect(colunas.filter((c) => c.marca === 'lancado')).toHaveLength(12)
    expect(colunas.filter((c) => c.marca === 'feriado')).toHaveLength(1)
  })

  it('vazio é null, presente é 0; o que ainda não aconteceu fica bloqueado como futuro', () => {
    const celulas = lerPlanilha(daCaptura(), 'l-1', DIA_DA_CAPTURA).leitura!.linhas.flatMap((l) => l.celulas)
    // Vazias: 15 por dia nos 4 primeiros lançados (quem entrou depois) e as 3 aulas
    // ainda não lançadas até 29/09, inclusive a do próprio dia. O resto é futuro.
    expect(contar(celulas)).toEqual({ 'lancada 0': 329, 'lancada 2': 151, vazia: 195, 'bloqueada futura': 990, 'bloqueada feriado': 45 })
  })

  it('no fim do semestre, as aulas não lançadas viram vazias', () => {
    const celulas = lerPlanilha(daCaptura(), 'l-1', FIM_DO_SEMESTRE).leitura!.linhas.flatMap((l) => l.celulas)
    expect(contar(celulas)).toEqual({ 'lancada 0': 329, 'lancada 2': 151, vazia: 195 + 990, 'bloqueada feriado': 45 })
  })

  it('o texto atual da célula vale mais que o registro: o professor pode ter clicado antes', () => {
    const b = daCaptura()
    const primeiro = b.auxAlunos.split(';')[0].split(',')[0]
    const vazioNoDia1 = lerPlanilha(b, 'l', FIM_DO_SEMESTRE).leitura!.linhas[0].celulas[0]
    expect(vazioNoDia1).toEqual({ tipo: 'vazia' })
    b.textos = { [primeiro]: ['2'] }
    expect(lerPlanilha(b, 'l', FIM_DO_SEMESTRE).leitura!.linhas[0].celulas[0]).toEqual({ tipo: 'lancada', faltas: 2 })
  })
})

describe('lerPlanilha: as regras da página', () => {
  it('feriado vem antes de trancado, como a página desenha', () => {
    const l = lerPlanilha(pequena(), 'l', FIM_DO_SEMESTRE).leitura!
    expect(l.linhas[1].celulas).toEqual([
      { tipo: 'lancada', faltas: 2 },
      { tipo: 'bloqueada', motivo: 'trancado' },
      { tipo: 'bloqueada', motivo: 'feriado' },
    ])
    expect(l.colunas.map((c) => c.marca)).toEqual(['lancado', undefined, 'feriado'])
  })

  it('data fora do período letivo fica bloqueada, como a página recusa', () => {
    const b = pequena()
    b.periodo.fim = '2026-10-14 00:00:00.0'
    const l = lerPlanilha(b, 'l', FIM_DO_SEMESTRE).leitura!
    expect(l.linhas[0].celulas[1]).toEqual({ tipo: 'bloqueada', motivo: 'foraDoPeriodo' })
  })

  it('matrícula ilegível tira só aquela linha, com o motivo, e as outras mantêm o lugar', () => {
    const b = pequena()
    b.auxAlunos = b.auxAlunos.replaceAll('20260000001', 'sem-numero')
    const r = lerPlanilha(b, 'l', FIM_DO_SEMESTRE)
    expect(r.problemas).toEqual([{ onde: 'aluno 1', conteudo: 'sem-numero', motivo: 'matrícula ilegível' }])
    expect(r.leitura!.linhas.map((x) => [x.indice, x.matricula])).toEqual([[1, '20260000002']])
  })

  it('máximo zero ou ilegível fica ausente, com aviso: a conciliação não lança o dia', () => {
    const b = pequena()
    b.auxAulas = b.auxAulas.replace('15,10,2,', '15,10,0,')
    const r = lerPlanilha(b, 'l', FIM_DO_SEMESTRE)
    expect(r.leitura!.colunas[1].maximo).toBeUndefined()
    expect(r.problemas).toEqual([{ onde: 'aula 2', conteudo: '0', motivo: 'máximo ilegível' }])
  })
})

describe('lerPlanilha: o que recusa a leitura inteira', () => {
  it.each<[string, (b: BrutoPlanilha) => void, RegExp]>([
    ['aula com campos a menos', (b) => (b.auxAulas = b.auxAulas.replace(',2026,false', ',2026')), /formato/],
    ['registro com campos a menos', (b) => (b.auxAlunos = b.auxAlunos.replace(/,false$/, '')), /formato/],
    ['dia que não existe', (b) => (b.auxAulas = b.auxAulas.replace('15,10,', '31,9,')), /aula 2/],
    ['duas aulas no mesmo dia', (b) => (b.auxAulas = b.auxAulas.replace('15,10,', '13,10,')), /repetid/],
    ['aluno com aulas a menos', (b) => (b.auxAlunos = b.auxAlunos.split(';').slice(0, 5).join(';')), /aluno 2/],
    ['registros fora da ordem das aulas', (b) => {
      const r = b.auxAlunos.split(';')
      ;[r[0], r[1]] = [r[1], r[0]]
      b.auxAlunos = r.join(';')
    }, /ordem/],
    ['matrícula repetida', (b) => (b.auxAlunos = b.auxAlunos.replaceAll('20260000002', '20260000001')), /repetid/],
    ['faltas que não são número', (b) => (b.auxAlunos = b.auxAlunos.replace(',13,10,0,', ',13,10,F,')), /aluno 1/],
    ['texto de célula que não é número', (b) => (b.textos = { '1': ['x'] }), /aluno 1/],
    ['período letivo ilegível', (b) => (b.periodo.inicio = 'agosto'), /período/],
  ])('%s', (_, estragar, motivo) => {
    const b = pequena()
    estragar(b)
    const r = lerPlanilha(b, 'l', FIM_DO_SEMESTRE)
    expect(r.leitura).toBeUndefined()
    expect(r.problemas.map((p) => `${p.onde}: ${p.motivo}`).join(' | ')).toMatch(motivo)
  })
})

describe('lerPlanilha nunca lança', () => {
  it('diante de qualquer coisa que chegue de outra janela', () => {
    const s = sorteador(42)
    const lixo = (): unknown => [null, 1, 'a', [], {}, true, undefined, 'x,y;z'][s.entre(0, 7)]
    const casos: unknown[] = [undefined, null, 0, 'texto', [], {}]
    for (let i = 0; i < 300; i++) {
      const b = pequena() as unknown as Record<string, unknown>
      b[['legenda', 'periodo', 'auxAulas', 'auxAlunos', 'textos'][s.entre(0, 4)]] = lixo()
      casos.push(b)
    }
    for (const caso of casos) {
      const r = lerPlanilha(caso, 'l', FIM_DO_SEMESTRE)
      if (!r.leitura) expect(r.problemas.length).toBeGreaterThan(0)
    }
  })
})

describe('ida e volta', () => {
  it('ler o bruto de uma leitura gerada devolve a mesma leitura, em 300 cenários', () => {
    for (let semente = 1; semente <= 300; semente++) {
      const { leitura } = gerarCenario(semente)
      const r = lerPlanilha(brutoDaLeitura(leitura), leitura.id, FIM_DO_SEMESTRE)
      expect(r.leitura, `semente ${semente}`).toEqual(leitura)
      // O gerador também faz dias sem máximo, que a página real não tem: vira aviso, não recusa.
      expect(r.problemas.every((p) => p.motivo === 'máximo ilegível'), `semente ${semente}`).toBe(true)
    }
  })
})

// Achado pela mutação (30/09/2026): a tela mostra onde, conteúdo e motivo
// (`CLAUDE.md`, "Leitura de CSV nunca descarta linha em silêncio"), e os
// testes acima só conferiam um pedaço do texto. "Item 6" errado por um manda
// o professor procurar no lugar errado.
describe('lerPlanilha: o problema diz onde, o quê e por quê, exatamente', () => {
  it.each<[string, (b: BrutoPlanilha) => BrutoPlanilha, object]>([
    ['registro com campos a menos', (b) => ({ ...b, auxAlunos: b.auxAlunos.replace(/,false$/, '') }), { onde: 'alunos, item 6', motivo: 'formato desconhecido: 15 campos, esperado 16' }],
    ['aula com campos a mais', (b) => ({ ...b, auxAulas: b.auxAulas.replace('20,10,2,', '20,10,2,x,') }), { onde: 'aulas, item 3', motivo: 'formato desconhecido: 11 campos, esperado 10' }],
    ['dia que não existe', (b) => ({ ...b, auxAulas: b.auxAulas.replace('15,10,', '31,9,') }), { onde: 'aula 2', conteudo: '31/9/2026', motivo: 'data ilegível' }],
    ['aluno com aulas a menos', (b) => ({ ...b, auxAlunos: b.auxAlunos.split(';').slice(0, 5).join(';') }), { onde: 'aluno 2', motivo: '2 aulas, e a planilha tem 3' }],
    ['faltas que não são número', (b) => ({ ...b, auxAlunos: b.auxAlunos.replace(',15,10,null,', ',15,10,F,') }), { onde: 'aluno 1, aula 2', conteudo: 'F', motivo: 'valor ilegível' }],
    ['período letivo ilegível', (b) => ({ ...b, periodo: { ...b.periodo, inicio: 'agosto' } }), { onde: 'período', conteudo: 'agosto', motivo: 'período letivo ilegível' }],
    ['sem aula nenhuma', (b) => ({ ...b, auxAulas: '' }), { onde: 'aulas', motivo: 'vazio' }],
    ['aulas que não são texto', (b) => ({ ...b, auxAulas: 3 as unknown as string }), { onde: 'aulas', motivo: 'formato desconhecido' }],
    ['a página inteira que não é objeto', () => [] as unknown as BrutoPlanilha, { onde: 'página', motivo: 'formato desconhecido' }],
  ])('%s', (_, estragar, problema) => {
    expect(lerPlanilha(estragar(pequena()), 'l', FIM_DO_SEMESTRE)).toEqual({ problemas: [problema] })
  })
})
