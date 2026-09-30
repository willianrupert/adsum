import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CenasDoSigaa } from './VitrineSigaa.tsx'

describe('a janela do SIGAA na vitrine', () => {
  it('mostra os estados com gente inventada, e Preencher recomeça a cena', async () => {
    const usuario = userEvent.setup()
    render(<CenasDoSigaa embrulho={({ titulo, children }) => <section aria-label={titulo}>{children}</section>} />)
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Qual é a turma desta planilha?' })).toBeInTheDocument()
    expect(await screen.findByText('O SIGAA não tem aula neste dia. Em qual aula ela entra?')).toBeInTheDocument()

    const lancar = screen.getByRole('region', { name: 'SIGAA: há o que lançar' })
    const antes = within(lancar).getByRole('heading', { name: '1 aula para lançar' })
    await usuario.click(within(lancar).getByRole('button', { name: 'Preencher 1 aula' }))
    // O Preencher grava antes de fechar: até lá, o título na tela ainda é o da
    // cena antiga. Procurar logo depois do clique achava esse, que em seguida
    // saía (visto com a suíte em paralelo).
    await waitFor(() => expect(antes).not.toBeInTheDocument())
    expect(await within(lancar).findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
  })
})
