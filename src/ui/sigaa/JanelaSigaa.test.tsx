import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import App from '../../App.tsx'

afterEach(() => {
  window.location.hash = ''
})

describe('#/sigaa, a janela do favorito', () => {
  it('abrir durante a aula não fecha a chamada da janela principal', async () => {
    const principal = new RepositorioDexie()
    await principal.abrir()
    await principal.abrirSessao({ turma: 'CIN0144 · T01', abertaEm: new Date().toISOString(), uidHashProfessor: 'prof' })

    window.location.hash = '#/sigaa'
    render(<App />)
    // No jsdom não há `window.opener`: a folha pede para abrir pela planilha.
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()
    await waitFor(async () => expect(await principal.sessaoAberta()).toBeDefined())
    expect(screen.queryByRole('button', { name: /Começar a chamada/ })).not.toBeInTheDocument()
    await principal.encerrarSessao()
    await principal.fechar()
  })

  // Ligada para todos desde 01/10/2026, por decisão do autor: sem modo de ensaio.
  it('abre sem o modo de ensaio', async () => {
    window.location.hash = '#/sigaa'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()
  })
})
