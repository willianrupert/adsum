// Gera o `javascript:` do favorito a partir de `entrada.ts`. Roda no Node, no
// build e no teste; nunca no navegador.

import { rolldown } from 'rolldown'

/**
 * Favorito grande demais é sinal de que entrou o que não devia (React, o Adsum
 * inteiro). Desde a leitura real (passo 14 do `docs/11`) ele leva a leitura e
 * o validador do Adsum e o localizador da planilha, por decisão: ~16 KB.
 */
export const TETO_DO_FAVORITO = 32 * 1024

export async function construirFavorito(): Promise<string> {
  // Relativo à raiz do projeto, de onde o build e os testes rodam.
  const pacote = await rolldown({ input: 'src/favorito/entrada.ts', platform: 'browser' })
  const { output } = await pacote.generate({ format: 'iife', minify: true })
  await pacote.close()
  return `javascript:${encodeURIComponent(output[0].code)}`
}
