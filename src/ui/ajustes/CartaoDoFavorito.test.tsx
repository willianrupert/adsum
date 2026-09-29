// O favorito chega ao professor por aqui: o botão que se arrasta para a barra
// de favoritos leva o `javascript:` gerado no build, e clicar nele dentro do
// Adsum não roda nada, só explica o gesto.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FAVORITO } from 'virtual:favorito'
import { CartaoDoFavorito } from './CartaoDoFavorito.tsx'

describe('o cartão do favorito', () => {
  it('oferece o favorito gerado no build, para arrastar', () => {
    render(<CartaoDoFavorito />)
    const botao = screen.getByRole('link', { name: 'Adsum' })
    expect(FAVORITO.startsWith('javascript:')).toBe(true)
    expect(botao.getAttribute('href')).toBe(FAVORITO)
    expect(botao.getAttribute('draggable')).toBe('true')
    expect(screen.getByText('Arraste o botão para a barra de favoritos. Na planilha de frequência do SIGAA, clique nele.')).toBeInTheDocument()
  })

  it('clicado aqui, não roda: diz que é para arrastar', async () => {
    const usuario = userEvent.setup()
    render(<CartaoDoFavorito />)
    await usuario.click(screen.getByRole('link', { name: 'Adsum' }))
    expect(screen.getByRole('status')).toHaveTextContent('É para arrastar, não clicar. Leve o botão até a barra de favoritos.')
    expect(document.querySelector('[data-adsum="barra"]')).toBeNull()
  })
})
