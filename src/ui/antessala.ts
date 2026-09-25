// As leituras que chegam enquanto a chamada está abrindo.
//
// Entre gravar a sessão e a tela da chamada montar, quem ouve o leitor ainda é
// o repouso, que só diz "foi lido" e não grava presença. Com o app ocupado essa
// janela passa de instantânea, e o crachá de quem encostou logo depois do
// clique se perdia. A antessala guarda essas leituras, na ordem, e a tela da
// chamada as processa ao montar como se tivessem chegado a ela.

import type { Leitura } from '../portas/LeitorDeCracha.ts'

export class Antessala {
  #abrindo = false
  #retidas: Leitura[] = []

  /** A chamada começou a abrir: daqui até `entregar`, as leituras esperam. */
  abrir(): void {
    this.#abrindo = true
  }

  /** Guarda a leitura se a chamada está abrindo. Devolve se guardou. */
  reter(leitura: Leitura): boolean {
    if (!this.#abrindo) return false
    this.#retidas.push(leitura)
    return true
  }

  /** A chamada assumiu o leitor (ou não abriu): devolve o que esperava, uma vez. */
  entregar(): Leitura[] {
    const retidas = this.#retidas
    this.#retidas = []
    this.#abrindo = false
    return retidas
  }
}
