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
  return output[0].code
}

export async function construirFavorito(): Promise<string> {
  return `javascript:${encodeURIComponent(await codigoDoFavorito())}`
}
