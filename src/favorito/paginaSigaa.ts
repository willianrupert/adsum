// A planilha do SIGAA vista pelo favorito, no DOM.
//
// O que depende do HTML do SIGAA (onde estão os dados e as células) mora num
// `Localizador`; o da planilha real é `localizadorSigaa.ts`. Escrever, pintar
// e a barra são nossos. Célula de tabela recebe o número como texto, que é o
// que a coleta do SIGAA lê (`docs/12`); campo de formulário recebe valor e
// eventos, como quem digita.

import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'
import type { PaginaDePlanilha } from './pagina.ts'

export interface Localizador {
  extrair(documento: Document): BrutoPlanilha | undefined
  celula(documento: Document, linha: number, coluna: number): HTMLElement | undefined
  /** Depois de escrever: o que a página precisa refazer (os totais da linha, na planilha). */
  depoisDeEscrever?(documento: Document, celula: HTMLElement): void
  /** O que muda quando a página coleta os valores para o servidor. */
  marcoDeColeta?(documento: Document): string | undefined
}

/** Página que o favorito não reconhece: ele diz que não é a planilha, em vez de adivinhar. */
export const LOCALIZADOR_SEM_HTML: Localizador = {
  extrair: () => undefined,
  celula: () => undefined,
}

// Pelo nome da etiqueta, não por `instanceof`: o favorito roda num iframe
// próprio (`construir.ts`), e as classes de lá não são as da página.
const ehCampo = (el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
  el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'

/** Aberta em edição pelo professor: nunca é vazia para o favorito, que não escreve por cima. */
export const EM_EDICAO = '(em edição)'

const AZUL = 'rgba(0, 113, 227, 0.18)'

export function criarPaginaSigaa(documento: Document, localizador: Localizador): PaginaDePlanilha {
  const estiloOriginal = new WeakMap<HTMLElement, { fundo: string; titulo: string }>()
  const celula = (linha: number, coluna: number) => localizador.celula(documento, linha, coluna)
  let espacoOriginal: string | undefined

  const fecharBarra = () => {
    documento.querySelector('[data-adsum="barra"]')?.remove()
    if (espacoOriginal !== undefined) documento.body.style.paddingBottom = espacoOriginal
    espacoOriginal = undefined
  }

  return {
    extrair: () => localizador.extrair(documento),
    marcoDeColeta: () => localizador.marcoDeColeta?.(documento),
    valor(linha, coluna) {
      const alvo = celula(linha, coluna)
      if (!alvo) return undefined
      if (ehCampo(alvo)) return alvo.value
      const aberta = alvo.querySelector('input, select, textarea')
      if (aberta) return (aberta as HTMLInputElement).value || EM_EDICAO
      return alvo.textContent ?? ''
    },
    escrever(linha, coluna, valor) {
      const alvo = celula(linha, coluna)
      if (!alvo) return
      if (ehCampo(alvo)) {
        alvo.value = valor
        // Como uma pessoa digitando: a página pode depender disso para gravar.
        const Evento = documento.defaultView?.Event ?? Event
        alvo.dispatchEvent(new Evento('input', { bubbles: true }))
        alvo.dispatchEvent(new Evento('change', { bubbles: true }))
      } else {
        alvo.textContent = valor
      }
      localizador.depoisDeEscrever?.(documento, alvo)
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
      // Um cartão que flutua no pé da planilha, claro ou escuro como o
      // sistema: as mesmas cores do Adsum (`estilo.css`), sem vidro, porque
      // contraste aqui é requisito. Estilo em linha: a página do SIGAA não
      // tem as folhas de estilo do Adsum.
      const escuro = documento.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches === true
      const cor = escuro
        ? { fundo: '#1c1c1e', tinta: '#f5f5f7', botao: '#2c2c2e', acao: '#0a84ff', sombra: '0 8px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08)' }
        : { fundo: '#ffffff', tinta: '#1d1d1f', botao: '#f5f5f7', acao: '#0071e3', sombra: '0 8px 30px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06)' }
      const barra = documento.createElement('div')
      barra.dataset.adsum = 'barra'
      barra.dataset.tema = escuro ? 'escuro' : 'claro'
      barra.setAttribute('role', 'status')
      barra.style.cssText =
        'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;box-sizing:border-box;' +
        'width:max-content;max-width:min(680px,calc(100vw - 32px));display:flex;gap:10px;align-items:center;' +
        `padding:12px 12px 12px 18px;border-radius:16px;background:${cor.fundo};color:${cor.tinta};box-shadow:${cor.sombra};` +
        'font:15px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased'
      const frase = documento.createElement('span')
      frase.style.flex = '1'
      frase.textContent = texto
      barra.append(frase)
      const botao = (rotulo: string, papel: string, acao: () => void) => {
        const b = documento.createElement('button')
        b.type = 'button'
        b.dataset.adsum = papel
        b.textContent = rotulo
        b.style.cssText = `flex:none;font:inherit;font-weight:590;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;background:${cor.botao};color:${cor.acao}`
        b.addEventListener('click', acao)
        barra.append(b)
      }
      if (aoDesfazer) botao('Desfazer', 'desfazer', aoDesfazer)
      botao('Fechar', 'fechar', fecharBarra)
      espacoOriginal = documento.body.style.paddingBottom
      documento.body.style.paddingBottom = '96px'
      documento.body.append(barra)
    },
  }
}
