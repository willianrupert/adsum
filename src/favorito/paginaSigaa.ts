// A planilha do SIGAA vista pelo favorito, no DOM.
//
// O que depende do HTML do docente (onde estão as células, os cabeçalhos, o
// máximo) mora inteiro num `Localizador`, e o de hoje não reconhece página
// nenhuma: ele só é escrito com o HTML real salvo (portão A do `docs/08`).
// Escrever, pintar e a barra são nossos, e valem para qualquer HTML.

import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'
import type { PaginaDePlanilha } from './pagina.ts'

export interface Localizador {
  extrair(documento: Document): BrutoPlanilha | undefined
  celula(documento: Document, linha: number, coluna: number): HTMLInputElement | undefined
}

/** Até o portão A: o favorito diz que esta não é a planilha, em vez de adivinhar. */
export const LOCALIZADOR_SEM_HTML: Localizador = {
  extrair: () => undefined,
  celula: () => undefined,
}

const AZUL = 'rgba(0, 113, 227, 0.18)'

export function criarPaginaSigaa(documento: Document, localizador: Localizador): PaginaDePlanilha {
  const estiloOriginal = new WeakMap<HTMLInputElement, { fundo: string; titulo: string }>()
  const celula = (linha: number, coluna: number) => localizador.celula(documento, linha, coluna)
  let espacoOriginal: string | undefined

  const fecharBarra = () => {
    documento.querySelector('[data-adsum="barra"]')?.remove()
    if (espacoOriginal !== undefined) documento.body.style.paddingBottom = espacoOriginal
    espacoOriginal = undefined
  }

  return {
    extrair: () => localizador.extrair(documento),
    valor: (linha, coluna) => celula(linha, coluna)?.value,
    escrever(linha, coluna, valor) {
      const alvo = celula(linha, coluna)
      if (!alvo) return
      alvo.value = valor
      // Como uma pessoa digitando: a página pode depender disso para o Gravar.
      alvo.dispatchEvent(new Event('input', { bubbles: true }))
      alvo.dispatchEvent(new Event('change', { bubbles: true }))
    },
    pintar(linha, coluna, marca, dica) {
      const alvo = celula(linha, coluna)
      if (!alvo) return
      if (!estiloOriginal.has(alvo)) estiloOriginal.set(alvo, { fundo: alvo.style.background, titulo: alvo.title })
      const original = estiloOriginal.get(alvo)!
      alvo.style.background = marca === 'mudou' ? AZUL : original.fundo
      alvo.title = marca === 'mudou' ? (dica ?? '') : original.titulo
    },
    mostrarBarra({ texto, aoDesfazer }) {
      fecharBarra()
      const barra = documento.createElement('div')
      barra.dataset.adsum = 'barra'
      barra.setAttribute('role', 'status')
      barra.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;gap:12px;align-items:center;' +
        'padding:10px 16px;font:15px/1.3 -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#fff;' +
        'box-shadow:0 -1px 0 rgba(0,0,0,.12)'
      const frase = documento.createElement('span')
      frase.style.flex = '1'
      frase.textContent = texto
      barra.append(frase)
      const botao = (rotulo: string, papel: string, acao: () => void) => {
        const b = documento.createElement('button')
        b.type = 'button'
        b.dataset.adsum = papel
        b.textContent = rotulo
        b.style.cssText = 'font:inherit;border:0;border-radius:999px;padding:6px 14px;cursor:pointer;background:#f5f5f7;color:#0071e3'
        b.addEventListener('click', acao)
        barra.append(b)
      }
      if (aoDesfazer) botao('Desfazer', 'desfazer', aoDesfazer)
      botao('Fechar', 'fechar', fecharBarra)
      espacoOriginal = documento.body.style.paddingBottom
      documento.body.style.paddingBottom = '56px'
      documento.body.append(barra)
    },
  }
}
