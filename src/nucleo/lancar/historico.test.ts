import { describe, expect, it } from 'vitest'
import { historicoDeLancamentos } from './historico.ts'
import { comoDia, type LinhaDeAuditoria } from './tipos.ts'

const linha = (turma: string, quando: string, acao: LinhaDeAuditoria['acao'], dia: string, matricula: string, aplicado: string): LinhaDeAuditoria => ({
  turma,
  quando,
  acao,
  versaoSigaa: '4.15.0.206',
  dia: comoDia(dia)!,
  matricula,
  lido: '',
  proposto: aplicado,
  aplicado,
})

describe('o histórico dos lançamentos', () => {
  it('um Preencher vira uma linha: aulas, faltas e presenças, o mais novo primeiro', () => {
    const antes = '2026-09-22T21:40:00.000Z'
    const depois = '2026-09-29T21:40:00.000Z'
    const h = historicoDeLancamentos([
      linha('CIN0114 · T01', antes, 'preenchimento', '2026-09-22', '1', '0'),
      linha('CIN0114 · T01', depois, 'preenchimento', '2026-09-01', '1', '2'),
      linha('CIN0114 · T01', depois, 'preenchimento', '2026-09-01', '2', '0'),
      linha('CIN0114 · T01', depois, 'preenchimento', '2026-09-03', '1', '0'),
      linha('CIN0114 · T01', depois, 'conferencia', '2026-08-25', '3', ''),
      linha('IF685 · T01', antes, 'aceite', '2026-09-22', '9', '0'),
    ])
    expect(h).toEqual([
      { turma: 'CIN0114 · T01', quando: depois, dias: ['2026-09-01', '2026-09-03'], faltas: 1, presencas: 2 },
      { turma: 'CIN0114 · T01', quando: antes, dias: ['2026-09-22'], faltas: 0, presencas: 1 },
    ])
  })

  it('duas turmas no mesmo instante são dois lançamentos', () => {
    const q = '2026-09-29T21:40:00.000Z'
    const h = historicoDeLancamentos([linha('A', q, 'preenchimento', '2026-09-01', '1', '0'), linha('B', q, 'preenchimento', '2026-09-01', '1', '2')])
    expect(h.map((l) => l.turma).sort()).toEqual(['A', 'B'])
  })

  it('sem preenchimento, histórico vazio', () => {
    expect(historicoDeLancamentos([])).toEqual([])
  })
})
