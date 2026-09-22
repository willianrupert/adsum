import { afterEach, describe, expect, it } from 'vitest'
import { caminhoDoDiario, descarregar, esquecerDiario, ligarDiario, linhasDoDiario, registrar } from './diario.ts'
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
})
