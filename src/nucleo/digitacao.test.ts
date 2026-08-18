import { describe, expect, it } from 'vitest'
import { INTERVALO_MAXIMO_MS, foiDigitadoPorMaquina, interpretarDigitacao, type Tecla } from './digitacao.ts'
import { uidParaHex } from './uid.ts'

/** Uma rajada com intervalo fixo entre as teclas. */
function digitar(texto: string, intervalo: number): Tecla[] {
  return [...texto].map((caractere, i) => ({ caractere, em: i * intervalo }))
}

describe('separar o dongle de quem digita', () => {
  // Não é heurística frágil: um leitor HID solta o UID em dezenas de
  // milissegundos, e ninguém digita oito caracteres com 20 ms entre eles.
  it('rajada rápida é máquina', () => {
    expect(foiDigitadoPorMaquina(digitar('04a23b91', 15))).toBe(true)
  })

  it('digitação humana não é', () => {
    expect(foiDigitadoPorMaquina(digitar('04a23b91', 120))).toBe(false)
  })

  it('uma pausa no meio já desqualifica', () => {
    const teclas = digitar('04a23b91', 15)
    teclas[4].em += INTERVALO_MAXIMO_MS * 3
    for (let i = 5; i < teclas.length; i++) teclas[i].em += INTERVALO_MAXIMO_MS * 3
    expect(foiDigitadoPorMaquina(teclas)).toBe(false)
  })

  it('tecla solta não vira leitura', () => {
    expect(interpretarDigitacao(digitar('04a2', 10))).toBeUndefined()
  })
})

describe('formatos que o dongle pode imprimir', () => {
  it('lê hexadecimal de 4 bytes', () => {
    const lido = interpretarDigitacao(digitar('04A23B91', 12))
    expect(lido?.formato).toBe('hexadecimal')
    expect(uidParaHex(lido!.uid)).toBe('04a23b91')
  })

  it('lê hexadecimal de 7 bytes, que é o outro comprimento comum', () => {
    const lido = interpretarDigitacao(digitar('04aa1b2c3d4e5f', 12))
    expect(uidParaHex(lido!.uid)).toBe('04aa1b2c3d4e5f')
  })

  it('lê decimal de 10 dígitos como quatro bytes', () => {
    const lido = interpretarDigitacao(digitar('0077740945', 12))
    expect(lido?.formato).toBe('decimal')
    expect(uidParaHex(lido!.uid)).toBe('04a23b91')
  })

  // Comprimento fora do padrão é recusa, nunca palpite: um UID inventado vira
  // presença de ninguém, e ninguém descobre.
  it('recusa comprimento que não existe no padrão', () => {
    expect(interpretarDigitacao(digitar('04a23b9112', 12))).toBeUndefined()
  })

  it('guarda o texto cru, que é o que dirá o formato do dongle real', () => {
    expect(interpretarDigitacao(digitar('04A23B91', 12))?.cru).toBe('04A23B91')
  })
})
