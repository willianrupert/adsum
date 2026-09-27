import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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

afterEach(() => window.localStorage.removeItem('adsum.modoDev'))

describe('Lançar no SIGAA, à mão', () => {
  it('mostra, aula por aula, quem faltou, e copia a lista inteira', async () => {
    const usuario = userEvent.setup()
    // Depois do `setup`: ele instala a própria área de transferência.
    const copiar = vi.spyOn(navigator.clipboard, 'writeText')
    renderizarCom(bancada, <PainelLancarNoSigaa turmas={[TURMA]} />)
    await usuario.click(screen.getByRole('button', { name: /Lançar no SIGAA/ }))

    expect(await screen.findByText(/13\/10: todos presentes, exceto:/)).toBeInTheDocument()
    expect(screen.getByText(/BRENO LIMA INVENTADO \(1\), matrícula 2/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Copiar a lista' }))
    await waitFor(() => expect(copiar).toHaveBeenCalledWith(expect.stringContaining('BRENO LIMA INVENTADO (1)')))
    expect(await screen.findByText('Copiado.')).toBeInTheDocument()
  })

  it('só aparece nos Ajustes com o modo de desenvolvimento ligado, enquanto a v2 não sai', async () => {
    const { unmount } = renderizarCom(bancada, <TelaRepositorio />)
    await screen.findByText('Sua turma')
    expect(screen.queryByRole('button', { name: /Lançar no SIGAA/ })).not.toBeInTheDocument()
    unmount()

    window.localStorage.setItem('adsum.modoDev', 'sim')
    renderizarCom(bancada, <TelaRepositorio />)
    expect(await screen.findByRole('button', { name: /Lançar no SIGAA/ })).toBeInTheDocument()
  })
})
