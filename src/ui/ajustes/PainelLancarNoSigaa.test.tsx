import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../../testes/montar.tsx'
import type { Evento } from '../../nucleo/tipos.ts'
import { TelaRepositorio } from '../TelaRepositorio.tsx'
import { PainelLancarNoSigaa } from './PainelLancarNoSigaa.tsx'

const TURMA = 'CIN0144 · T01'
let bancada: Bancada
let k = 0
const ev = (dia: string, parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento => ({
  eventoId: `web-t-${dia.replaceAll('-', '')}-${++k}`,
  quando: new Date(`${dia}T10:${String(k).padStart(2, '0')}:00`).toISOString(),
  turma: TURMA,
  uidHash: 'x',
  nome: '',
  ...parcial,
})

beforeEach(async () => {
  bancada = await montarBancada()
  await bancada.repositorio.salvarTurma(TURMA, [
    { turma: TURMA, chave: '1', matricula: '1', nome: 'Ana Clara', nomeCompleto: 'ANA CLARA INVENTADA', papel: 'aluno' },
    { turma: TURMA, chave: '2', matricula: '2', nome: 'Breno Lima', nomeCompleto: 'BRENO LIMA INVENTADO', papel: 'aluno' },
  ])
  for (const e of [ev('2026-10-13', { origem: 'professor', resultado: 'ok' }), ev('2026-10-13', { origem: 'cracha', resultado: 'ok', matricula: '1' })]) {
    await bancada.repositorio.acrescentarEvento(e)
  }
})

describe('Lançar no SIGAA, nos Ajustes', () => {
  it('oferece o favorito e o histórico, e não a lista à mão', async () => {
    const usuario = userEvent.setup()
    renderizarCom(bancada, <PainelLancarNoSigaa turmas={[TURMA]} />)
    await usuario.click(screen.getByRole('button', { name: /Lançar no SIGAA/ }))
    expect(screen.getByRole('link', { name: 'Adsum' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhum lançamento ainda.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar a lista' })).not.toBeInTheDocument()
  })

  // Ligada para todos desde 01/10/2026, por decisão do autor: sem modo de ensaio.
  it('aparece nos Ajustes sem o modo de ensaio', async () => {
    renderizarCom(bancada, <TelaRepositorio />)
    expect(await screen.findByRole('button', { name: /Lançar no SIGAA/ })).toBeInTheDocument()
  })
})
