// O que o favorito precisa da planilha do SIGAA, e nada mais. O adaptador de
// verdade (`paginaSigaa.ts`) espera o HTML real (portão A); os testes usam
// `testes/paginaSigaaFalsa.ts`.

import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'

export interface PaginaDePlanilha {
  /** Os textos da planilha, ou `undefined` se esta página não é ela. */
  extrair(): BrutoPlanilha | undefined
  /** O valor da célula agora, que pode não ser o lido: o professor digita. */
  valor(linha: number, coluna: number): string | undefined
  escrever(linha: number, coluna: number, valor: string): void
  /** `mudou` é o azul; sem marca, a célula volta ao natural. */
  pintar(linha: number, coluna: number, marca?: 'mudou', dica?: string): void
  mostrarBarra(barra: { texto: string; aoDesfazer?: () => void }): void
  /**
   * Muda quando a página recolhe os valores das células para o servidor (o
   * salvamento automático da planilha, ou o Gravar). Depois disso, desfazer
   * não volta a célula a vazio (`docs/12`).
   */
  marcoDeColeta?(): string | undefined
}
