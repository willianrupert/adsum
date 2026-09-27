// O adaptador DOM do favorito, sobre uma tabela inventada: o que se prova aqui
// é o mecanismo (escrever com eventos, pintar, a barra), não o HTML do SIGAA,
// que só o portão A traz.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarPaginaSigaa, LOCALIZADOR_SEM_HTML, type Localizador } from './paginaSigaa.ts'

const inventado: Localizador = {
  extrair: () => ({ rodape: '', cabecalhoTurma: '', meses: [], dias: [], linhas: [] }),
  celula: (doc, linha, coluna) => doc.querySelector<HTMLInputElement>(`#c-${linha}-${coluna}`) ?? undefined,
}

beforeEach(() => {
  document.body.innerHTML = '<table><tr><td><input id="c-0-0" value=""></td></tr></table>'
  document.body.removeAttribute('style')
})

describe('a página do SIGAA, pelo favorito', () => {
  it('escreve o valor e avisa a página como uma pessoa digitando', () => {
    const pagina = criarPaginaSigaa(document, inventado)
    const input = document.querySelector<HTMLInputElement>('#c-0-0')!
    const eventos: string[] = []
    input.addEventListener('input', () => eventos.push('input'))
    input.addEventListener('change', () => eventos.push('change'))
    pagina.escrever(0, 0, '2')
    expect(input.value).toBe('2')
    expect(pagina.valor(0, 0)).toBe('2')
    expect(eventos).toEqual(['input', 'change'])
  })

  it('pinta de azul com a dica, e despinta devolvendo o estilo de antes', () => {
    const pagina = criarPaginaSigaa(document, inventado)
    const input = document.querySelector<HTMLInputElement>('#c-0-0')!
    input.style.background = 'rgb(1, 2, 3)'
    pagina.pintar(0, 0, 'mudou', 'Adsum: presente. Antes: vazia.')
    expect(input.style.background).not.toBe('rgb(1, 2, 3)')
    expect(input.title).toBe('Adsum: presente. Antes: vazia.')
    pagina.pintar(0, 0)
    expect(input.style.background).toBe('rgb(1, 2, 3)')
    expect(input.title).toBe('')
  })

  it('a barra no pé reserva o próprio espaço, troca de texto sem se duplicar, e o Desfazer chama de volta', () => {
    const pagina = criarPaginaSigaa(document, inventado)
    const desfazer = vi.fn()
    pagina.mostrarBarra({ texto: 'Adsum preencheu 1 aula.', aoDesfazer: desfazer })
    pagina.mostrarBarra({ texto: 'Adsum preencheu 2 aulas.', aoDesfazer: desfazer })
    const barras = document.querySelectorAll('[data-adsum="barra"]')
    expect(barras).toHaveLength(1)
    expect(barras[0].getAttribute('role')).toBe('status')
    expect(barras[0].textContent).toContain('Adsum preencheu 2 aulas.')
    expect(document.body.style.paddingBottom).not.toBe('')
    ;(barras[0].querySelector('button[data-adsum="desfazer"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(desfazer).toHaveBeenCalledTimes(1)
  })

  it('sem Desfazer, a barra não mostra o botão; e ela pode ser fechada', () => {
    const pagina = criarPaginaSigaa(document, inventado)
    pagina.mostrarBarra({ texto: 'Nada a preencher.' })
    const barra = document.querySelector('[data-adsum="barra"]')!
    expect(barra.querySelector('[data-adsum="desfazer"]')).toBeNull()
    ;(barra.querySelector('button[data-adsum="fechar"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('[data-adsum="barra"]')).toBeNull()
    expect(document.body.style.paddingBottom).toBe('')
  })

  it('enquanto não há HTML real, nenhuma página é reconhecida como a planilha', () => {
    expect(criarPaginaSigaa(document, LOCALIZADOR_SEM_HTML).extrair()).toBeUndefined()
  })
})
