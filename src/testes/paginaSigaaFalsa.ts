// A planilha do SIGAA em memória, para testar o favorito sem o HTML real.
// Guarda o que foi escrito, pintado e mostrado, e deixa o teste mexer numa
// célula "à mão" entre a leitura e o preenchimento.

import type { PaginaDePlanilha } from '../favorito/pagina.ts'
import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'

export class PaginaSigaaFalsa implements PaginaDePlanilha {
  readonly bruto: BrutoPlanilha | undefined
  readonly valores: string[][]
  readonly pinturas = new Map<string, { marca?: 'mudou'; dica?: string }>()
  barra?: { texto: string; aoDesfazer?: () => void }
  escritas = 0

  constructor(bruto: BrutoPlanilha | undefined) {
    this.bruto = bruto
    this.valores = bruto?.linhas.map((l) => l.celulas.map((c) => c.valor)) ?? []
  }

  extrair(): BrutoPlanilha | undefined {
    return this.bruto && structuredClone(this.bruto)
  }

  valor(linha: number, coluna: number): string | undefined {
    return this.valores[linha]?.[coluna]
  }

  escrever(linha: number, coluna: number, valor: string): void {
    this.escritas += 1
    this.valores[linha][coluna] = valor
  }

  pintar(linha: number, coluna: number, marca?: 'mudou', dica?: string): void {
    this.pinturas.set(`${linha}|${coluna}`, { marca, dica })
  }

  mostrarBarra(barra: { texto: string; aoDesfazer?: () => void }): void {
    this.barra = barra
  }

  /** O professor digitando na célula, fora do favorito. */
  digitar(linha: number, coluna: number, valor: string): void {
    this.valores[linha][coluna] = valor
  }
}
