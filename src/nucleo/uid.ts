// UID como bytes, nunca como número. Prefixo NXP fixo e comprimento variável
// tornam qualquer atalho numérico errado mais cedo ou mais tarde.

import type { Uid } from './tipos.ts'

const COMPRIMENTOS_VALIDOS = [4, 7, 10]

export function uidParaHex(uid: Uid): string {
  return Array.from(uid, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexParaUid(hex: string): Uid {
  const limpo = hex.trim().toLowerCase().replace(/[\s:-]/g, '')
  if (limpo.length === 0 || limpo.length % 2 !== 0) {
    throw new Error(`UID precisa de um número par de dígitos hexadecimais: "${hex}"`)
  }
  if (!/^[0-9a-f]+$/.test(limpo)) {
    throw new Error(`UID tem caractere que não é hexadecimal: "${hex}"`)
  }
  const bytes = new Uint8Array(limpo.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(limpo.slice(i * 2, i * 2 + 2), 16)
  }
  if (!COMPRIMENTOS_VALIDOS.includes(bytes.length)) {
    throw new Error(
      `UID de ${bytes.length} bytes; esperado ${COMPRIMENTOS_VALIDOS.join(', ')}`,
    )
  }
  return bytes
}

/** `04 a2 3b 91` — como aparece no diagnóstico, para conferir a olho nu. */
export function uidLegivel(uid: Uid): string {
  return Array.from(uid, (b) => b.toString(16).padStart(2, '0')).join(' ')
}
