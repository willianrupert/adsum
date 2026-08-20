import { describe, expect, it } from 'vitest'
import { uidInedito, hexParaUid, uidLegivel, uidParaHex } from './uid.ts'

describe('UID', () => {
  it('faz a volta hex → bytes → hex', () => {
    for (const hex of ['04a23b91', '04aa1b2c3d4e5f', '04aa1b2c3d4e5f607182']) {
      expect(uidParaHex(hexParaUid(hex))).toBe(hex)
    }
  })

  it('aceita os três comprimentos do padrão', () => {
    expect(hexParaUid('04a23b91')).toHaveLength(4)
    expect(hexParaUid('04aa1b2c3d4e5f')).toHaveLength(7)
    expect(hexParaUid('04aa1b2c3d4e5f607182')).toHaveLength(10)
  })

  // Um UID de 5 bytes não existe no padrão. Aceitar em silêncio é como um
  // truncamento vira hash errado sem ninguém notar.
  it('recusa comprimento fora do padrão', () => {
    expect(() => hexParaUid('04a23b9112')).toThrow(/5 bytes/)
  })

  it('recusa entrada que não é hexadecimal par', () => {
    expect(() => hexParaUid('04a23b9')).toThrow(/par/)
    expect(() => hexParaUid('04a23bzz')).toThrow(/hexadecimal/)
    expect(() => hexParaUid('')).toThrow()
  })

  it('tolera maiúsculas e separadores, que é como o UID aparece escrito', () => {
    expect(uidParaHex(hexParaUid('04:A2:3B:91'))).toBe('04a23b91')
    expect(uidParaHex(hexParaUid('04 A2 3B 91'))).toBe('04a23b91')
    expect(uidParaHex(hexParaUid('04-a2-3b-91'))).toBe('04a23b91')
  })

  it('escreve legível para conferência a olho nu', () => {
    expect(uidLegivel(hexParaUid('04a23b91'))).toBe('04 a2 3b 91')
  })
})

// Existe para o ensaio conseguir produzir "crachá desconhecido", que depois da
// cerimônia era impossível de alcançar: o baralho é finito e, cadastrado
// inteiro, toda carta vira gente conhecida.
describe('um UID que o baralho não tem', () => {
  it('nunca devolve carta do baralho', () => {
    const baralho = Array.from({ length: 40 }, (_, i) =>
      i.toString(16).padStart(8, '0'),
    )
    for (let i = 0; i < 200; i++) {
      expect(baralho).not.toContain(uidInedito(baralho))
    }
  })

  it('tem a forma de um UID de 4 bytes', () => {
    expect(uidInedito()).toMatch(/^[0-9a-f]{8}$/)
  })
})
