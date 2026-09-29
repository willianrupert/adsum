// O que a planilha do SIGAA faz com os nativos do JavaScript, medido na página
// real em 29/09/2026 (Prototype 1.6.0.3 e Ext; ver `docs/12`). Não é o código
// dessas bibliotecas: é o comportamento que quebrou o favorito, reescrito para
// o teste conseguir pôr a página no mesmo estado. `desfazer` devolve os nativos.

type Trocas = [alvo: object, nome: string, versao: unknown][]

export function trocarNativosComoOSigaa(ambiente: typeof globalThis): () => void {
  const { Array, Object } = ambiente
  const trocas: Trocas = [
    // `entries` vira `toArray`: devolve o próprio array.
    [Array.prototype, 'entries', function (this: unknown[]) { return this }],
    // `Array.from` vira `$A`: ignora a função e só copia o que tem índice.
    [Array, 'from', (x: ArrayLike<unknown> | null | undefined) => {
      if (!x) return []
      const r: unknown[] = []
      for (let i = 0; i < (x.length ?? 0); i++) r.push(x[i])
      return r
    }],
    // `reduce` não reduz: devolve o array, ou o único item.
    [Array.prototype, 'reduce', function (this: unknown[]) { return this.length > 1 ? this : this[0] }],
    // `toJSON` em array: `JSON.stringify` passa a devolver texto dentro de texto.
    [Array.prototype, 'toJSON', function (this: unknown[]) { return '[' + this.map(String).join(', ') + ']' }],
    // `Object.values` e `Object.keys` por `for...in`: pegam o que foi herdado.
    [Object, 'values', (o: Record<string, unknown>) => { const r = []; for (const k in o) r.push(o[k]); return r }],
    [Object, 'keys', (o: Record<string, unknown>) => { const r = []; for (const k in o) r.push(k); return r }],
  ]
  const antes = trocas.map(([alvo, nome]) => Object.getOwnPropertyDescriptor(alvo, nome))
  for (const [alvo, nome, versao] of trocas) Object.defineProperty(alvo, nome, { value: versao, writable: true, configurable: true, enumerable: false })
  return () =>
    trocas.forEach(([alvo, nome], i) => {
      const d = antes[i]
      if (d) Object.defineProperty(alvo, nome, d)
      else delete (alvo as Record<string, unknown>)[nome]
    })
}
