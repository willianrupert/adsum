// Gera o `javascript:` do favorito a partir de `entrada.ts`. Roda no Node, no
// build e no teste; nunca no navegador.

import { rolldown } from 'rolldown'
import type { Destino } from './ligacao.ts'

/**
 * Favorito grande demais é sinal de que entrou o que não devia (React, o Adsum
 * inteiro). Desde a leitura real (passo 14 do `docs/11`) ele leva a leitura e
 * o validador do Adsum e o localizador da planilha, por decisão: ~16 KB.
 */
export const TETO_DO_FAVORITO = 32 * 1024

/** O código do favorito, sem o `javascript:`. A bancada (`scripts/bancada_sigaa.mjs`) o serve assim. */
export async function codigoDoFavorito(opcoes: { destino?: Destino } = {}): Promise<string> {
  const { destino } = opcoes
  // Relativo à raiz do projeto, de onde o build e os testes rodam. O destino de
  // ensaio entra aqui, no pacote: nada na página do SIGAA consegue trocá-lo.
  const pacote = await rolldown({
    input: 'src/favorito/entrada.ts',
    platform: 'browser',
    plugins: destino
      ? [{ name: 'destino-da-bancada', load: (id: string) => (id.endsWith('/favorito/destino.ts') ? `export const DESTINO = ${JSON.stringify(destino)}` : null) }]
      : [],
  })
  const { output } = await pacote.generate({ format: 'iife', minify: true })
  await pacote.close()
  return emAmbienteLimpo(output[0].code)
}

/** O nome, no iframe, da função de envio que o carregador deixa (`entrada.ts`). */
export const ENVIAR = 'adsumEnviar'

/**
 * O favorito roda num iframe vazio, invisível, que fica na página: a planilha
 * do SIGAA carrega Prototype 1.6 e Ext, que trocam `Array.from`, `entries`,
 * `reduce`, `Object.values` e outros por versões que fazem outra coisa. Um
 * iframe tem os nativos do navegador. Vai como `<script>`, não por `eval`: é
 * o mesmo tipo de código que o próprio `javascript:` já é.
 *
 * A mensagem para o Adsum sai por uma função criada aqui fora: o navegador dá
 * como remetente a janela de quem chama `postMessage`, e o Adsum só aceita a
 * janela que o abriu, a da planilha, não o iframe.
 */
export function emAmbienteLimpo(codigo: string): string {
  return `(function(c){var f=document.createElement("iframe");f.setAttribute("data-adsum","favorito");f.style.display="none";document.body.appendChild(f);var w=f.contentWindow;w.${ENVIAR}=function(j,m,o){j.postMessage(m,o)};var d=w.document,s=d.createElement("script");s.textContent=c;(d.head||d.documentElement).appendChild(s)})(${JSON.stringify(codigo)});`
}

export async function construirFavorito(opcoes: { destino?: Destino } = {}): Promise<string> {
  return `javascript:${encodeURIComponent(await codigoDoFavorito(opcoes))}`
}

/**
 * O favorito para a tela, como módulo `virtual:favorito` (`FAVORITO`, o
 * `javascript:` inteiro): gerado no build, nunca à mão, para o que o professor
 * arrasta ser sempre o do código publicado. Usado pelo `vite.config.ts` e pelo
 * `vitest.config.ts`.
 */
export function pluginDoFavorito(opcoes: { destino?: Destino } = {}) {
  const id = 'virtual:favorito'
  return {
    name: 'favorito-do-adsum',
    resolveId: (fonte: string) => (fonte === id ? `\0${id}` : null),
    async load(modulo: string) {
      if (modulo !== `\0${id}`) return null
      return `export const FAVORITO = ${JSON.stringify(await construirFavorito(opcoes))}`
    },
  }
}
