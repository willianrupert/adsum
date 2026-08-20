import { describe, expect, it } from 'vitest'
import { BYTES_DO_SAL, calcularUidHash, salValido, sortearSal } from './hash.ts'
import { hexParaUid } from './uid.ts'

const SAL = '000102030405060708090a0b0c0d0e0f'

describe('uid_hash', () => {
  // Valor congelado. Se este teste quebrar, a regra do hash mudou — e mudar a
  // regra invalida todo vínculo e toda grade já gravados, aqui e em qualquer cópia.
  // Quebrou sem querer? É bug. Quebrou de propósito? É migração, não commit.
  it('bate com o vetor conhecido', async () => {
    expect(await calcularUidHash(SAL, hexParaUid('04a23b91'))).toBe('309940e145b847cf')
  })

  it('tem 8 bytes em hexadecimal', async () => {
    const hash = await calcularUidHash(SAL, hexParaUid('04a23b91'))
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('é determinístico', async () => {
    const uid = hexParaUid('0471c2d8')
    expect(await calcularUidHash(SAL, uid)).toBe(await calcularUidHash(SAL, uid))
  })

  it('muda com o sal — é o que dá privacidade ao hash', async () => {
    const uid = hexParaUid('0471c2d8')
    const outro = 'ffeeddccbbaa99887766554433221100'
    expect(await calcularUidHash(SAL, uid)).not.toBe(await calcularUidHash(outro, uid))
  })

  it('separa UIDs diferentes, inclusive de comprimentos diferentes', async () => {
    const hashes = await Promise.all(
      ['04a23b91', '0471c2d8', '04aa1b2c3d4e5f'].map((h) => calcularUidHash(SAL, hexParaUid(h))),
    )
    expect(new Set(hashes).size).toBe(3)
  })

  it('recusa sal de tamanho errado em vez de improvisar', async () => {
    await expect(calcularUidHash('00ff', hexParaUid('04a23b91'))).rejects.toThrow(/16 bytes/)
    expect(salValido('00ff')).toBe(false)
    expect(salValido(SAL)).toBe(true)
  })

  it('sorteia sal do tamanho certo e não repetido', () => {
    const sorteios = new Set(Array.from({ length: 50 }, sortearSal))
    expect(sorteios.size).toBe(50)
    for (const sal of sorteios) {
      expect(salValido(sal)).toBe(true)
      expect(sal).toHaveLength(BYTES_DO_SAL * 2)
    }
  })
})
