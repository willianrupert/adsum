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

/**
 * Acima disto, é gente digitando.
 *
 * Medido com o dongle de verdade, 10/09/2026: cinco rajadas do mesmo crachá,
 * maior intervalo entre caracteres em cada uma — 16, 32, 17, 17, 17 ms. O
 * palpite anterior ("bem abaixo de 20 ms") errou o pico por 12 ms; 60 ms
 * continua certo, com folga confortável mesmo no pior caso medido.
 */
export const INTERVALO_MAXIMO_MS = 60

/** Menos que isto não é UID nenhum, é tecla solta. */
export const MINIMO_DE_CARACTERES = 6

/** Separadores que os leitores costumam imprimir entre os bytes. */
export const SEPARADORES = /[\s:.-]/g

export interface Tecla {
  caractere: string
  em: number
}

export interface Digitacao {
  uid: Uid
  /** Como veio, antes de qualquer limpeza. Aparece no diagnóstico. */
  cru: string
  formato: 'hexadecimal' | 'decimal'
  /**
   * O mesmo UID com os bytes na ordem inversa.
   *
   * Alguns leitores imprimem em little-endian, e não há como saber qual é o
   * certo sem comparar com outra fonte. O diagnóstico mostra os dois para que
   * uma conferência a olho resolva — em vez de o app escolher errado em
   * silêncio e o vínculo não bater com o do celular.
   */
  invertido: string
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
function inverter(bytes: Uint8Array): string {
  return Array.from(bytes)
    .reverse()
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * O texto de um crachá, já sem a pergunta "foi máquina?" — para quem entrega
 * a linha inteira e não uma rajada de teclas (o leitor serial). Nunca
 * adivinha: comprimento fora do padrão é recusa.
 */
export function interpretarTexto(cru: string): Digitacao | undefined {
  const texto = cru.trim()
  // A mesma guarda de `foiDigitadoPorMaquina`: um decimal curto é número
  // válido em 32 bits, e sem isto "12345" viraria um crachá.
  if (texto.length < MINIMO_DE_CARACTERES) return undefined

  // De fábrica, esses leitores costumam separar os bytes com dois-pontos —
  // `1D:F3:1F:D3:1B:10:80`. Recusar por causa do separador seria recusar o
  // dongle no estado em que ele chega da caixa.
  const limpo = texto.replace(/[\s:.-]/g, '')

  if (/^[0-9a-fA-F]+$/.test(limpo) && [8, 14, 20].includes(limpo.length)) {
    const uid = hexParaBytes(limpo.toLowerCase())
    return { uid, cru: texto, formato: 'hexadecimal', invertido: inverter(uid) }
  }

  if (/^\d+$/.test(limpo)) {
    const uid = decimalParaBytes(limpo)
    if (uid) return { uid, cru: texto, formato: 'decimal', invertido: inverter(uid) }
  }

  return undefined
}

export function interpretarDigitacao(teclas: Tecla[]): Digitacao | undefined {
  if (!foiDigitadoPorMaquina(teclas)) return undefined
  const cru = teclas.map((t) => t.caractere).join('').trim()
  const lido = interpretarTexto(cru)
  // `cru` de antes: quem lê o diagnóstico vê a rajada como veio.
  return lido && { ...lido, cru }
}
