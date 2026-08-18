// uid_hash = primeiros 8 bytes de SHA-256(sal ‖ uid), em hexadecimal.
//
// O sal não é enfeite: UID de 4 bytes com prefixo NXP fixo deixa 2²⁴
// possibilidades, e a força bruta recupera o UID de um hash sem sal em
// segundos. Como o `uid_hash` é justamente o que vai para a planilha, hash sem
// sal transformaria "o nome não trafega" em promessa vazia.

import type { Uid, UidHash } from './tipos.ts'

export const BYTES_DO_SAL = 16
const BYTES_DO_HASH = 8

export function sortearSal(): string {
  const sal = new Uint8Array(BYTES_DO_SAL)
  crypto.getRandomValues(sal)
  return Array.from(sal, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function salValido(salHex: string): boolean {
  return new RegExp(`^[0-9a-f]{${BYTES_DO_SAL * 2}}$`).test(salHex.trim().toLowerCase())
}

function salParaBytes(salHex: string): Uint8Array {
  if (!salValido(salHex)) {
    throw new Error(`Sal precisa de ${BYTES_DO_SAL} bytes em hexadecimal`)
  }
  const limpo = salHex.trim().toLowerCase()
  const bytes = new Uint8Array(BYTES_DO_SAL)
  for (let i = 0; i < BYTES_DO_SAL; i++) {
    bytes[i] = Number.parseInt(limpo.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function calcularUidHash(salHex: string, uid: Uid): Promise<UidHash> {
  const sal = salParaBytes(salHex)
  const entrada = new Uint8Array(sal.length + uid.length)
  entrada.set(sal, 0)
  entrada.set(uid, sal.length)
  const digestao = await crypto.subtle.digest('SHA-256', entrada)
  return Array.from(new Uint8Array(digestao).slice(0, BYTES_DO_HASH), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
