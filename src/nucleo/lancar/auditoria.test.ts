import { describe, expect, it } from 'vitest'
import { ajustesDaAuditoria, CABECALHO_DA_AUDITORIA, deCsvDaAuditoria, linhaDaAuditoria } from './auditoria.ts'
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
