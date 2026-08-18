// O dongle que "digita" o crachá.
//
// Leitor HID de teclado não pede permissão, não precisa de driver e funciona em
// qualquer navegador — inclusive Safari e Firefox, onde WebSerial e WebNFC não
// existem. Para o sistema operacional ele é um teclado, e é isso que o torna o
// caminho mais simples de todos.
//
// O problema que isso cria: as teclas dele chegam misturadas com as de quem
// está digitando. A separação é pelo **ritmo** — o dongle solta o UID inteiro em
// dezenas de milissegundos, e nenhum humano digita oito caracteres com 20 ms
// entre eles. Não é heurística frágil: é uma ordem de grandeza de diferença.

import type { Uid } from './tipos.ts'

/** Acima disto, é gente digitando. Um leitor HID fica bem abaixo de 20 ms. */
export const INTERVALO_MAXIMO_MS = 60

/** Menos que isto não é UID nenhum, é tecla solta. */
export const MINIMO_DE_CARACTERES = 6

export interface Tecla {
  caractere: string
  em: number
}

export interface Digitacao {
  uid: Uid
  /** Como veio, antes de virar bytes. Aparece no diagnóstico. */
  cru: string
  formato: 'hexadecimal' | 'decimal'
}

function hexParaBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Decimal de 10 dígitos é o outro formato comum: o leitor imprime o UID de
 * 4 bytes como número. Convertido em big-endian, que é o mais frequente —
 * **e é justamente por não haver certeza que o diagnóstico mostra o cru**: com
 * o dongle na mão, um toque diz qual dos dois é.
 */
function decimalParaBytes(texto: string): Uint8Array | undefined {
  const valor = Number(texto)
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > 0xffffffff) return undefined
  return Uint8Array.from([
    (valor >>> 24) & 0xff,
    (valor >>> 16) & 0xff,
    (valor >>> 8) & 0xff,
    valor & 0xff,
  ])
}

/** Rápido o bastante para ser máquina? */
export function foiDigitadoPorMaquina(teclas: Tecla[]): boolean {
  if (teclas.length < MINIMO_DE_CARACTERES) return false
  for (let i = 1; i < teclas.length; i++) {
    if (teclas[i].em - teclas[i - 1].em > INTERVALO_MAXIMO_MS) return false
  }
  return true
}

/**
 * Converte uma rajada de teclas num UID, ou devolve `undefined` quando aquilo
 * não era um crachá. Nunca adivinha: comprimento fora do padrão é recusa.
 */
export function interpretarDigitacao(teclas: Tecla[]): Digitacao | undefined {
  if (!foiDigitadoPorMaquina(teclas)) return undefined

  const cru = teclas.map((t) => t.caractere).join('').trim()

  if (/^[0-9a-fA-F]+$/.test(cru) && cru.length % 2 === 0 && [8, 14, 20].includes(cru.length)) {
    return { uid: hexParaBytes(cru.toLowerCase()), cru, formato: 'hexadecimal' }
  }

  if (/^\d+$/.test(cru)) {
    const bytes = decimalParaBytes(cru)
    if (bytes) return { uid: bytes, cru, formato: 'decimal' }
  }

  return undefined
}
