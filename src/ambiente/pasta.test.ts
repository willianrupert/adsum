import { describe, expect, it } from 'vitest'
import { acrescentar, escrever, ler } from './pasta.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'

// A pasta falsa imita o `createWritable` de verdade: cada fluxo escreve numa
// cópia, e o `close` troca o arquivo inteiro. Duas gravações soltas no mesmo
// arquivo, então, fazem a segunda apagar a primeira.
describe('gravação na pasta sob carga', () => {
  it('acréscimos simultâneos no mesmo arquivo não perdem linha', async () => {
    const { handle } = criarPastaFalsa()
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => acrescentar(handle, 'registros/t.csv', `linha ${i}\n`, 'cabecalho\n')),
    )
    const linhas = (await ler(handle, 'registros/t.csv'))!.trim().split('\n')
    expect(linhas[0]).toBe('cabecalho')
    expect(linhas).toHaveLength(51)
    expect(new Set(linhas).size).toBe(51)
  })

  it('reescritas do mesmo arquivo terminam na ordem em que foram pedidas', async () => {
    const { handle } = criarPastaFalsa()
    await Promise.all(Array.from({ length: 20 }, (_, i) => escrever(handle, 'vinculos.json', `versão ${i}`)))
    expect(await ler(handle, 'vinculos.json')).toBe('versão 19')
  })

  it('uma gravação que falha não trava as seguintes do mesmo arquivo', async () => {
    const { handle } = criarPastaFalsa()
    const original = handle.getFileHandle.bind(handle)
    let primeira = true
    handle.getFileHandle = (async (nome: string, opcoes?: { create?: boolean }) => {
      if (primeira) {
        primeira = false
        throw new Error('pasta desmontada')
      }
      return original(nome, opcoes)
    }) as typeof handle.getFileHandle
    const falha = acrescentar(handle, 'a.log', 'antes\n')
    await expect(falha).rejects.toThrow('pasta desmontada')
    await acrescentar(handle, 'a.log', 'depois\n')
    expect(await ler(handle, 'a.log')).toBe('depois\n')
  })
})
