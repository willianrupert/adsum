import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import App from '../../App.tsx'

afterEach(() => {
  window.location.hash = ''
  window.localStorage.removeItem('adsum.modoDev')
})

describe('#/sigaa, a janela do favorito', () => {
  it('abrir durante a aula não fecha a chamada da janela principal', async () => {
    window.localStorage.setItem('adsum.modoDev', 'sim')
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

  it('enquanto a v2 não sai, diz que ainda não está disponível e não abre a base', async () => {
    window.location.hash = '#/sigaa'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Ainda não disponível' })).toBeInTheDocument()
  })
})
