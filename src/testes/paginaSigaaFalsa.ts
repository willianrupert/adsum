// A planilha do SIGAA em memória, para testar o favorito sem a página real.
// Parte do mesmo bruto que o favorito extrai (`docs/12`): uma grade de textos
// por aluno e aula, com `T` no trancado, como a página desenha. Guarda o que
// foi escrito, pintado e mostrado, e deixa o teste mexer numa célula "à mão".

import type { PaginaDePlanilha } from '../favorito/pagina.ts'
import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'

export class PaginaSigaaFalsa implements PaginaDePlanilha {
  readonly bruto: BrutoPlanilha | undefined
  /** `ID_MAT` de cada linha, na ordem da página. */
  readonly ids: string[]
  readonly valores: string[][]
  readonly pinturas = new Map<string, { marca?: 'mudou' | 'falta'; dica?: string }>()
  barra?: { texto: string; aoDesfazer?: () => void }
  escritas = 0

  constructor(bruto: BrutoPlanilha | undefined) {
    this.bruto = bruto
    const porAluno = new Map<string, string[]>()
    for (const r of bruto?.auxAlunos.split(';').map((x) => x.split(',')) ?? []) {
      const texto = r[11] === 'true' ? 'T' : r[5] === 'null' ? '' : r[5]
      porAluno.set(r[0], [...(porAluno.get(r[0]) ?? []), texto])
    }
    this.ids = [...porAluno.keys()]
    this.valores = [...porAluno.values()]
  }

  /** O bruto com o texto atual das células, como o favorito de verdade extrai. */
  extrair(): BrutoPlanilha | undefined {
    if (!this.bruto) return undefined
    return { ...structuredClone(this.bruto), textos: Object.fromEntries(this.ids.map((id, i) => [id, [...this.valores[i]]])) }
  }

  valor(linha: number, coluna: number): string | undefined {
    return this.valores[linha]?.[coluna]
  }

  escrever(linha: number, coluna: number, valor: string): void {
    this.escritas += 1
    this.valores[linha][coluna] = valor
  }

  pintar(linha: number, coluna: number, marca?: 'mudou' | 'falta', dica?: string): void {
    this.pinturas.set(`${linha}|${coluna}`, { marca, dica })
  }

  mostrarBarra(barra: { texto: string; aoDesfazer?: () => void }): void {
    this.barra = barra
  }

  /** O que a página já coletou; muda a cada coleta, como o campo `form:frequencias`. */
  #coletas = 0

  marcoDeColeta(): string {
    return String(this.#coletas)
  }

  /** O salvamento automático do SIGAA passando (`docs/12`). */
  coletar(): void {
    this.#coletas += 1
  }

  /** O professor digitando na célula, fora do favorito. */
  digitar(linha: number, coluna: number, valor: string): void {
    this.valores[linha][coluna] = valor
  }
}
