import { describe, expect, it } from 'vitest'
import { criarAgendador, type Escopo } from './agendador.ts'

const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms))

describe('agendador', () => {
  it('uma rajada de pedidos vira no máximo duas execuções, nunca em paralelo', async () => {
    let emAndamento = 0
    let maximo = 0
    const execucoes: Escopo[] = []
    const agendar = criarAgendador(async (escopo) => {
      emAndamento++
      maximo = Math.max(maximo, emAndamento)
      execucoes.push(escopo)
      await esperar(5)
      emAndamento--
    })
    await Promise.all(Array.from({ length: 30 }, () => agendar('T01')))
    expect(maximo).toBe(1)
    expect(execucoes).toEqual(['T01', 'T01'])
  })

  it('quem pede espera uma execução que começou depois do pedido', async () => {
    let estado = 0
    let visto = -1
    const agendar = criarAgendador(async () => {
      const lido = estado
      await esperar(5)
      visto = lido
    })
    const primeira = agendar()
    await esperar(1)
    estado = 1
    await agendar()
    expect(visto).toBe(1)
    await primeira
  })

  it('turmas diferentes na mesma rajada viram todas', async () => {
    const execucoes: Escopo[] = []
    const agendar = criarAgendador(async (escopo) => {
      execucoes.push(escopo)
      await esperar(2)
    })
    const a = agendar('T01')
    const b = agendar('T01')
    const c = agendar('T02')
    await Promise.all([a, b, c])
    expect(execucoes).toEqual(['T01', undefined])
  })

  it('uma falha chega a quem pediu e não trava os pedidos seguintes', async () => {
    let vez = 0
    const agendar = criarAgendador(async () => {
      if (vez++ === 0) throw new Error('pasta caiu')
    })
    await expect(agendar()).rejects.toThrow('pasta caiu')
    await expect(agendar()).resolves.toBeUndefined()
  })
})
