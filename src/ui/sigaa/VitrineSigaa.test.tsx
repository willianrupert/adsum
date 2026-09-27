import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CenasDoSigaa } from './VitrineSigaa.tsx'

describe('a janela do SIGAA na vitrine', () => {
  it('mostra os três estados com gente inventada, e Preencher recomeça a cena', async () => {
    const usuario = userEvent.setup()
    render(<CenasDoSigaa embrulho={({ titulo, children }) => <section aria-label={titulo}>{children}</section>} />)
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Preencher 1 aula' }))
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
  })
})
