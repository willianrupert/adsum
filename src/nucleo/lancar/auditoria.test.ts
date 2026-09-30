import { describe, expect, it } from 'vitest'
import { ajustesDaAuditoria, CABECALHO_DA_AUDITORIA, deCsvDaAuditoria, linhaDaAuditoria, remanejosDaAuditoria } from './auditoria.ts'
import { comoDia, type LinhaDeAuditoria } from './tipos.ts'

const TURMA = 'CIN0144 · T01'
const linha = (parcial: Partial<LinhaDeAuditoria> = {}): LinhaDeAuditoria => ({
  turma: TURMA,
  quando: '2026-10-20T13:00:00.000Z',
  acao: 'preenchimento',
  versaoSigaa: '4.15.0.206',
  dia: comoDia('2026-10-13')!,
  matricula: '20260000001',
  lido: '',
  proposto: '2',
  aplicado: '2',
  ...parcial,
})
const arquivo = (...linhas: string[]) => '﻿' + [CABECALHO_DA_AUDITORIA, ...linhas].join('\n') + '\n'

describe('sigaa/<turma>.csv', () => {
  it('o cabeçalho é o do docs/08, sem turma e sem nome', () => {
    expect(CABECALHO_DA_AUDITORIA).toBe('quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado')
  })

  it('ida e volta de cada ação', () => {
    const linhas = [
      linha(),
      linha({ acao: 'conferencia', lido: '1', proposto: '0', aplicado: '' }),
      linha({ acao: 'desfeito', lido: '', proposto: '2', aplicado: '' }),
      linha({ acao: 'aceite', lido: '1', proposto: '0', aplicado: '1' }),
      linha({ acao: 'conferencia', lido: 'trancado', proposto: '', aplicado: '' }),
    ]
    expect(deCsvDaAuditoria(arquivo(...linhas.map(linhaDaAuditoria)), TURMA)).toEqual({ itens: linhas, problemas: [] })
  })

  it('separador e quebra de linha dentro de um campo não partem a linha', () => {
    const suja = linha({ versaoSigaa: '4;15\n0' })
    const texto = linhaDaAuditoria(suja)
    expect(texto.split(';')).toHaveLength(8)
    expect(texto).not.toMatch(/\n/)
  })

  it.each([
    ['colunas a menos', '2026-10-20T13:00:00.000Z;preenchimento;4.15;2026-10-13;20260000001;;2'],
    ['data da ação ilegível', 'ontem;preenchimento;4.15;2026-10-13;20260000001;;2;2'],
    ['dia da aula ilegível', '2026-10-20T13:00:00.000Z;preenchimento;4.15;13/10/2026;20260000001;;2;2'],
    ['ação desconhecida', '2026-10-20T13:00:00.000Z;gravado;4.15;2026-10-13;20260000001;;2;2'],
    ['aceite sem valor', '2026-10-20T13:00:00.000Z;aceite;4.15;2026-10-13;20260000001;1;0;'],
  ])('linha ruim vira problema com número e conteúdo, e as outras seguem: %s', (_, ruim) => {
    const r = deCsvDaAuditoria(arquivo(linhaDaAuditoria(linha()), ruim), TURMA)
    expect(r.itens).toEqual([linha()])
    expect(r.problemas).toEqual([expect.objectContaining({ linha: 3, texto: ruim })])
  })

  it('arquivo vazio ou só com cabeçalho não é problema', () => {
    expect(deCsvDaAuditoria('', TURMA)).toEqual({ itens: [], problemas: [] })
    expect(deCsvDaAuditoria(arquivo(), TURMA)).toEqual({ itens: [], problemas: [] })
  })
})

describe('os ajustes vêm das linhas de aceite', () => {
  it('cada aceite é um ajuste com o valor aceito e a hora dele; as outras ações não', () => {
    const linhas = [
      linha(),
      linha({ acao: 'aceite', lido: '1', proposto: '0', aplicado: '1', quando: '2026-10-20T13:05:00.000Z' }),
      linha({ acao: 'aceite', lido: '1', proposto: '0', aplicado: '0', quando: '2026-10-20T13:06:00.000Z' }),
    ]
    expect(ajustesDaAuditoria(linhas)).toEqual([
      { turma: TURMA, dia: '2026-10-13', matricula: '20260000001', valor: 1, em: '2026-10-20T13:05:00.000Z' },
      { turma: TURMA, dia: '2026-10-13', matricula: '20260000001', valor: 0, em: '2026-10-20T13:06:00.000Z' },
    ])
  })
})

describe('a aula que mudou de data, na auditoria', () => {
  // `dia_aula` é a aula do SIGAA; `lido` é o dia da chamada; sem matrícula: vale para a turma.
  const remanejo = (de: string, para: string, quando = '2026-10-16T10:00:00.000Z') =>
    linha({ acao: 'remanejo', quando, dia: comoDia(para)!, matricula: '', lido: de, proposto: para, aplicado: para })

  it('ida e volta, e cada linha volta a ser a decisão', () => {
    const linhas = [remanejo('2026-10-15', '2026-10-13'), remanejo('2026-10-15', '2026-10-15', '2026-10-17T10:00:00.000Z')]
    const { itens, problemas } = deCsvDaAuditoria(arquivo(...linhas.map(linhaDaAuditoria)), TURMA)
    expect(problemas).toEqual([])
    expect(itens).toEqual(linhas)
    expect(remanejosDaAuditoria(itens)).toEqual([
      { turma: TURMA, de: '2026-10-15', para: '2026-10-13', em: '2026-10-16T10:00:00.000Z' },
      { turma: TURMA, de: '2026-10-15', para: '2026-10-15', em: '2026-10-17T10:00:00.000Z' },
    ])
  })

  it('remanejo sem o dia da chamada é problema, com o motivo', () => {
    const { itens, problemas } = deCsvDaAuditoria(arquivo(linhaDaAuditoria(remanejo('15/10', '2026-10-13'))), TURMA)
    expect(itens).toEqual([])
    expect(problemas).toMatchObject([{ linha: 2, motivo: 'remanejo sem o dia da chamada' }])
  })
})

// Achados pela mutação (30/09/2026).
describe('sigaa/<turma>.csv: o que a mutação achou sem teste', () => {
  it('o campo sujo vira um espaço só, sem sobra nas pontas', () => {
    expect(linhaDaAuditoria(linha({ versaoSigaa: ' 4;;15\r\n0 ' })).split(';')[2]).toBe('4 15 0')
  })

  it('espaços em volta dos campos, linha em branco e cabeçalho com espaço não viram problema', () => {
    const texto = `${CABECALHO_DA_AUDITORIA} \n   \n${linhaDaAuditoria(linha()).split(';').map((c) => ` ${c} `).join(';')}\r\n`
    expect(deCsvDaAuditoria(texto, TURMA)).toEqual({ itens: [linha()], problemas: [] })
  })

  it('aceite de dia com 12 aulas vale 12; valor com letra não é aceite', () => {
    const aceite = (aplicado: string) => linhaDaAuditoria(linha({ acao: 'aceite', lido: '0', proposto: '0', aplicado }))
    const { itens, problemas } = deCsvDaAuditoria(arquivo(aceite('12'), aceite('2a'), aceite('a2')), TURMA)
    expect(itens.map((l) => l.aplicado)).toEqual(['12'])
    expect(problemas.map((p) => [p.linha, p.motivo])).toEqual([[3, 'aceite sem o valor aceito'], [4, 'aceite sem o valor aceito']])
    const soltas = ['12', '2a', 'a2'].map((aplicado) => linha({ acao: 'aceite', aplicado }))
    expect(ajustesDaAuditoria(soltas).map((a) => a.valor)).toEqual([12])
  })

  it.each([
    ['colunas a menos', '2026-10-20T13:00:00.000Z;preenchimento;4.15;2026-10-13;20260000001;;2', '7 colunas, esperado 8'],
    ['data da ação ilegível', 'ontem;preenchimento;4.15;2026-10-13;20260000001;;2;2', '"ontem" não é uma data'],
    ['dia da aula ilegível', '2026-10-20T13:00:00.000Z;preenchimento;4.15;13/10/2026;20260000001;;2;2', '"13/10/2026" não é um dia de aula'],
    ['ação desconhecida', '2026-10-20T13:00:00.000Z;gravado;4.15;2026-10-13;20260000001;;2;2', 'ação desconhecida: "gravado"'],
  ])('o motivo diz o que estava errado: %s', (_, ruim, motivo) => {
    expect(deCsvDaAuditoria(arquivo(ruim), TURMA).problemas).toEqual([{ linha: 2, texto: ruim, motivo }])
  })

  it('só remanejo vira remanejo, entre linhas de outras ações', () => {
    const remanejo = linha({ acao: 'remanejo', matricula: '', lido: '2026-10-15', proposto: '2026-10-13', aplicado: '2026-10-13' })
    const outras = [linha(), linha({ acao: 'aceite', lido: '1', aplicado: '1' }), linha({ acao: 'conferencia', lido: '2026-10-15' })]
    expect(remanejosDaAuditoria([...outras, remanejo])).toEqual([{ turma: TURMA, de: '2026-10-15', para: '2026-10-13', em: remanejo.quando }])
  })
})
