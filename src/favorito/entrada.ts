// O que roda quando o professor clica no favorito, na página do SIGAA. É o
// ponto de entrada do `javascript:` que `construir.ts` gera.
//
// Roda dentro de um iframe vazio que o próprio favorito cria: a página do
// SIGAA troca métodos nativos (Prototype e Ext), e aqui eles são os do
// navegador. A página, a janela e o `open` são os de fora, do iframe pai.

import { DESTINO } from './destino.ts'
import { lancarPeloFavorito } from './ligacao.ts'
import { LOCALIZADOR_SIGAA } from './localizadorSigaa.ts'
import { criarPaginaSigaa } from './paginaSigaa.ts'

const casa: Window = window.frameElement ? window.parent : window
type Enviar = (janela: { postMessage(m: unknown, o: string): void }, mensagem: unknown, origem: string) => void
// Não importa `ENVIAR` de `construir.ts`: aquele arquivo roda no Node e puxaria o rolldown.
const enviar = (window as unknown as { adsumEnviar?: Enviar }).adsumEnviar

lancarPeloFavorito({
  pagina: criarPaginaSigaa(casa.document, LOCALIZADOR_SIGAA),
  janela: casa,
  abrir: (url, nome, recursos) => casa.open(url, nome, recursos),
  destino: DESTINO,
  gerarId: () => crypto.randomUUID(),
  enviar,
})
