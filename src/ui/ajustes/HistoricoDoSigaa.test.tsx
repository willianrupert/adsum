import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import { comoDia, type LinhaDeAuditoria } from '../../nucleo/lancar/tipos.ts'
import { HistoricoDoSigaa } from './HistoricoDoSigaa.tsx'

let repositorio: RepositorioDexie
let n = 0

beforeEach(async () => {
  repositorio = new RepositorioDexie(`adsum-historico-${n++}`)
  await repositorio.abrir()
})
afterEach(async () => repositorio.fechar())

const preenchida = (turma: string, quando: string, dia: string, matricula: string, valor: string): LinhaDeAuditoria => ({
  turma,
  quando,
  acao: 'preenchimento',
  versaoSigaa: '4.15.0.206',
  dia: comoDia(dia)!,
  matricula,
  lido: '',
  proposto: valor,
  aplicado: valor,
})

describe('o histórico em Ajustes', () => {
  it('um lançamento por linha, o mais novo primeiro', async () => {
    const turma = 'CIN0114 · T01'
    const quando = new Date(2026, 8, 29, 18, 40).toISOString()
    await repositorio.acrescentarAuditoriaSigaa([
      preenchida(turma, quando, '2026-09-01', '1', '2'),
      preenchida(turma, quando, '2026-09-01', '2', '0'),
      preenchida(turma, quando, '2026-09-03', '1', '0'),
    ])
    render(<HistoricoDoSigaa turmas={[turma]} repositorio={repositorio} />)
    expect(await screen.findByText('CIN0114 · T01, 29/09 às 18:40: 2 aulas, 1 falta')).toBeInTheDocument()
  })

  it('sem lançamento, diz que não há', async () => {
    render(<HistoricoDoSigaa turmas={['CIN0114 · T01']} repositorio={repositorio} />)
    expect(await screen.findByText('Nenhum lançamento ainda.')).toBeInTheDocument()
  })
})
