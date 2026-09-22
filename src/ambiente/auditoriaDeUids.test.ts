import { beforeEach, describe, expect, it } from 'vitest'
import { anotarUid, CAMINHO_DA_AUDITORIA, esquecerAuditoria } from './auditoriaDeUids.ts'
import { ler } from './pasta.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { auditoriaDeUidsLigada, definirAuditoriaDeUids } from './preferencias.ts'

const SAL = '00112233445566778899aabbccddeeff'
const UID = hexParaUid('04a23b91')
const hash = () => calcularUidHash(SAL, UID)

beforeEach(() => {
  esquecerAuditoria()
  window.localStorage.clear()
})

describe('código real de cada crachá, na pasta', () => {
  it('uma linha por crachá, na primeira leitura, com o hash que liga ao vínculo', async () => {
    const { handle } = criarPastaFalsa()
    expect(await anotarUid(handle, hash, UID, new Date('2026-09-24T13:00:00Z'), 'Dongle USB')).toBe(true)
    expect(await anotarUid(handle, hash, UID, new Date('2026-09-24T13:05:00Z'), 'Dongle USB')).toBe(false)

    const linhas = (await ler(handle, CAMINHO_DA_AUDITORIA))!.trim().split('\n')
    // `text()` descarta o BOM ao ler; ele está lá para o Excel.
    expect(linhas[0].replace('\uFEFF', '')).toBe('uid_hex;uid_hash;primeira_leitura;leitor')
    expect(linhas.slice(1)).toEqual([
      `04a23b91;${await calcularUidHash(SAL, UID)};2026-09-24T13:00:00.000Z;Dongle USB`,
    ])
  })

  it('não repete um crachá que já estava no arquivo de outra abertura do app', async () => {
    const { handle } = criarPastaFalsa()
    await anotarUid(handle, hash, UID, new Date(), 'Dongle USB')
    esquecerAuditoria()
    expect(await anotarUid(handle, hash, UID, new Date(), 'Dongle USB')).toBe(false)
  })

  it('dois crachás quase juntos, o mesmo crachá duas vezes: uma linha só', async () => {
    const { handle } = criarPastaFalsa()
    const [a, b] = await Promise.all([
      anotarUid(handle, hash, UID, new Date(), 'Dongle USB'),
      anotarUid(handle, hash, UID, new Date(), 'Dongle USB'),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect((await ler(handle, CAMINHO_DA_AUDITORIA))!.trim().split('\n')).toHaveLength(2)
  })

  it('vem ligado na fase de testes, e desliga', () => {
    expect(auditoriaDeUidsLigada()).toBe(true)
    definirAuditoriaDeUids(false)
    expect(auditoriaDeUidsLigada()).toBe(false)
  })
})
