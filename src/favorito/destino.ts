// Para onde o favorito abre a janela. Casa com o `base` do `vite.config.ts`
// (`/adsum/`) e com a rota `#/sigaa`: renomear o repositório sem ajustar aqui
// faz o favorito abrir uma página que não existe.

import type { Destino } from './ligacao.ts'

const ORIGEM = 'https://willianrupert.github.io'

export const DESTINO: Destino = { origem: ORIGEM, url: `${ORIGEM}/adsum/#/sigaa` }
