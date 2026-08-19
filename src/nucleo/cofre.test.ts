import { describe, expect, it } from 'vitest'
import {
  VERSAO,
  deJsonCompartilhado,
  deJsonVinculos,
  paraJsonCompartilhado,
  paraJsonVinculos,
} from './cofre.ts'
import type { Vinculo } from './tipos.ts'

const VINCULOS: Vinculo[] = [
  {
    uidHash: '309940e145b847cf',
    papel: 'aluno',
    nome: 'Willian Neves',
    matricula: '20250023010',
    criadoEm: '2026-08-18T10:00:00.000Z',
  },
]

describe('arquivos do cofre', () => {
  it('faz a volta escrita → leitura', () => {
    expect(deJsonVinculos(paraJsonVinculos(VINCULOS)).conteudo).toEqual(VINCULOS)
  })

  it('grava legível, para conferir sem o app', () => {
    expect(paraJsonVinculos(VINCULOS)).toContain('\n  "versao"')
  })

  it('carimba versão e hora', () => {
    const envelope = JSON.parse(paraJsonVinculos(VINCULOS))
    expect(envelope.versao).toBe(VERSAO)
    expect(Number.isNaN(Date.parse(envelope.gravadoEm))).toBe(false)
  })

  // Abrir um arquivo do futuro e gravar por cima descartaria em silêncio o que
  // a versão nova sabia e esta não. Melhor recusar.
  it('recusa arquivo de versão mais nova em vez de truncá-lo', () => {
    const futuro = JSON.stringify({ versao: VERSAO + 1, conteudo: [] })
    const { conteudo, problemas } = deJsonVinculos(futuro)
    expect(conteudo).toBeUndefined()
    expect(problemas[0].motivo).toMatch(/versão mais nova/)
  })

  it('recusa arquivo sem versão, que não se sabe como ler', () => {
    expect(deJsonVinculos('[]').problemas[0].motivo).toMatch(/versao/)
  })

  it('diz qual arquivo está quebrado, não só que quebrou', () => {
    expect(deJsonVinculos('{ isto não é json').problemas[0].motivo).toMatch(/vinculos\.json/)
  })
})

describe('arquivo para outro professor', () => {
  // Sem o mesmo sal, os hashes de um professor são ruído para o outro. Exportar
  // só os vínculos daria a impressão de funcionar — que é pior que não ter.
  it('leva o sal junto, senão a lista chega inútil', () => {
    const texto = paraJsonCompartilhado({ salHex: 'a'.repeat(32), vinculos: VINCULOS })
    const { conteudo } = deJsonCompartilhado(texto)
    expect(conteudo?.salHex).toBe('a'.repeat(32))
    expect(conteudo?.vinculos).toEqual(VINCULOS)
  })

  it('recusa arquivo de versão mais nova, como os outros do cofre', () => {
    const futuro = JSON.stringify({ versao: 99, conteudo: {} })
    expect(deJsonCompartilhado(futuro).problemas[0].motivo).toMatch(/versão mais nova/)
  })
})
