import { describe, expect, it } from 'vitest'
import { Antessala } from './antessala.ts'

const leitura = (n: number) => ({ uid: Uint8Array.from([n]), em: new Date(n), origem: 'teste' })

describe('Antessala', () => {
  it('fechada, não guarda nada', () => {
    const sala = new Antessala()
    expect(sala.reter(leitura(1))).toBe(false)
    expect(sala.entregar()).toEqual([])
  })

  it('abrindo, guarda na ordem e entrega uma vez só', () => {
    const sala = new Antessala()
    sala.abrir()
    expect(sala.reter(leitura(1))).toBe(true)
    expect(sala.reter(leitura(2))).toBe(true)
    expect(sala.entregar().map((l) => l.uid[0])).toEqual([1, 2])
    expect(sala.entregar()).toEqual([])
    expect(sala.reter(leitura(3))).toBe(false)
  })
})
