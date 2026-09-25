import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  caminhoDoDiario,
  descarregar,
  esquecerDiario,
  ligarDiario,
  linhasDoDiario,
  registrar,
  semDono,
} from './diario.ts'
import { ler } from './pasta.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'

afterEach(esquecerDiario)

describe('diário de diagnóstico', () => {
  it('uma linha por registro, com hora, tipo e campos, sem os vazios', () => {
    registrar('cracha', { hash: 'abcd1234', evento: undefined, decisao: 'presenca' })
    const [linha] = linhasDoDiario()
    expect(linha).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \| cracha \| hash=abcd1234 \| decisao=presenca$/)
  })

  it('grava na pasta em lote, um arquivo por dia', async () => {
    const { handle } = criarPastaFalsa()
    ligarDiario(handle)
    registrar('app_aberto', { versao: 'x' })
    registrar('cracha', { decisao: 'presenca' })
    await descarregar()

    const hoje = new Date()
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const texto = await ler(handle, caminhoDoDiario(dia))
    expect(texto?.trim().split('\n')).toHaveLength(2)
  })

  it('sem pasta, nada se perde da memória e nada tenta gravar', async () => {
    registrar('cracha')
    await descarregar()
    expect(linhasDoDiario()).toHaveLength(1)
  })

  // Revisão de 25/09/2026: o diário é lido linha a linha no zip de sexta, e
  // cada um destes casos entregava lá uma linha partida, repetida ou ausente.

  it('mensagem com quebra de linha ou barra vertical continua numa linha só', () => {
    registrar('erro', { mensagem: 'falhou\nna linha 2 | e aqui', onde: 'a|b' })
    const linhas = linhasDoDiario()
    expect(linhas).toHaveLength(1)
    expect(linhas[0].split(' | ')).toHaveLength(4)
    expect(linhas[0]).not.toContain('\n')
  })

  it('falha no meio de um lote não grava de novo o dia que já tinha ido', async () => {
    vi.useFakeTimers()
    try {
      const { handle, raiz } = criarPastaFalsa()
      vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 59))
      registrar('cracha', { n: 1 })
      vi.setSystemTime(new Date(2026, 8, 25, 0, 0, 1))
      registrar('cracha', { n: 2 })

      // O segundo dia falha uma vez: a pasta caiu entre um arquivo e outro.
      const original = handle.getDirectoryHandle.bind(handle)
      let chamadas = 0
      handle.getDirectoryHandle = (async (nome: string, opcoes?: { create?: boolean }) => {
        const pasta = await original(nome, opcoes)
        const getFile = pasta.getFileHandle.bind(pasta)
        pasta.getFileHandle = (async (arquivo: string, o?: { create?: boolean }) => {
          if (arquivo === '2026-09-25.log' && chamadas++ === 0) throw new Error('pasta desmontada')
          return getFile(arquivo, o)
        }) as typeof pasta.getFileHandle
        return pasta
      }) as typeof handle.getDirectoryHandle

      ligarDiario(handle)
      await descarregar()
      await descarregar()

      const diagnostico = raiz.pastas.get('diagnostico')!
      expect(diagnostico.arquivos.get('2026-09-24.log')!.trim().split('\n')).toHaveLength(1)
      expect(diagnostico.arquivos.get('2026-09-25.log')!.trim().split('\n')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('quem pede para descarregar espera a gravação que já estava em andamento', async () => {
    const { handle, raiz } = criarPastaFalsa()
    ligarDiario(handle)
    registrar('cracha', { n: 1 })
    const primeira = descarregar()
    // A tela de diagnóstico pede de novo antes de ler o arquivo.
    await descarregar()
    const arquivos = raiz.pastas.get('diagnostico')?.arquivos
    expect([...(arquivos?.values() ?? [])].join('')).toContain('n=1')
    await primeira
  })

  it('tarefa que falha antes de virar promessa também vai para o diário', async () => {
    semDono('efeito de teste', () => {
      throw new Error('quebrou na hora')
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(linhasDoDiario().join('\n')).toContain('quebrou na hora')
  })
})
