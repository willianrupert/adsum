// O que roda quando o professor clica no favorito, na página do SIGAA. É o
// ponto de entrada do `javascript:` que `construir.ts` gera.

import { DESTINO } from './destino.ts'
import { lancarPeloFavorito } from './ligacao.ts'
import { LOCALIZADOR_SIGAA } from './localizadorSigaa.ts'
import { criarPaginaSigaa } from './paginaSigaa.ts'

lancarPeloFavorito({
  pagina: criarPaginaSigaa(document, LOCALIZADOR_SIGAA),
  janela: window,
  abrir: (url, nome, recursos) => window.open(url, nome, recursos),
  destino: DESTINO,
  gerarId: () => crypto.randomUUID(),
})
