// A bolinha de conexão contra o `LeitorSerial` de verdade, com uma porta
// serial de mentira só na borda com o navegador (o jsdom não tem Web Serial).
// Verde tem que significar sinal de vida recente, e mais nada.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeitorSerial } from '../adaptadores/leitor/LeitorSerial.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { IndicadorDoLeitor } from './IndicadorDoLeitor.tsx'

function servicoComPorta() {
  let controlador!: ReadableStreamDefaultController<Uint8Array>
  const porta: PortaSerial = {
    readable: new ReadableStream<Uint8Array>({
      start(c) {
        controlador = c
      },
    }),
    writable: new WritableStream<Uint8Array>(),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getInfo: () => ({}),
  }
  const servico = new EventTarget() as ServicoSerial
  servico.getPorts = vi.fn(async () => [porta])
  servico.requestPort = vi.fn(async () => porta)
  return { servico, enviar: (t: string) => controlador.enqueue(new TextEncoder().encode(t)) }
}

let leitor: { parar(): Promise<void> } | undefined
afterEach(async () => {
  cleanup()
  await leitor?.parar()
  leitor = undefined
  vi.useRealTimers()
})

describe('IndicadorDoLeitor', () => {
  it('leitor de teclado não mostra nada: não há como saber, e verde falso mentiria', async () => {
    const teclado = new LeitorTeclado()
    leitor = teclado
    await teclado.iniciar()
    const { container } = render(<IndicadorDoLeitor leitor={teclado} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('só fica verde depois do sinal de vida, e volta a alerta quando ele some', async () => {
    let agora = 10_000
    const { servico, enviar } = servicoComPorta()
    const serial = new LeitorSerial({ serial: servico, agora: () => agora })
    leitor = serial
    await serial.iniciar()
    render(<IndicadorDoLeitor leitor={serial} />)

    // Conectado mas ainda calado: não é verde.
    expect(screen.getByRole('status')).toHaveTextContent('Leitor sem sinal')
    expect(document.querySelector('.ponto--leitor-ok')).toBeNull()

    enviar('#HB pn532=ok\n')
    await waitFor(() => expect(serial.situacao().vivo).toBe(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Leitor conectado'))
    expect(document.querySelector('.ponto--leitor-ok')).not.toBeNull()

    // Quatro segundos sem sinal: o relógio da tela denuncia sozinho.
    agora += 4_000
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Leitor sem sinal'), {
      timeout: 2500,
    })
  })

  it('módulo de leitura com erro é vermelho, mesmo com o aparelho vivo', async () => {
    const { servico, enviar } = servicoComPorta()
    const serial = new LeitorSerial({ serial: servico })
    leitor = serial
    await serial.iniciar()
    render(<IndicadorDoLeitor leitor={serial} />)

    enviar('#HB pn532=erro\n')
    await waitFor(() => expect(serial.situacao().modulo).toBe('erro'))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Leitor sem módulo de leitura'),
    )
    expect(document.querySelector('.ponto--leitor-grave')).not.toBeNull()
  })

  it('sem porta autorizada é "desconectado"', async () => {
    const servico = new EventTarget() as ServicoSerial
    servico.getPorts = vi.fn(async () => [])
    servico.requestPort = vi.fn()
    const serial = new LeitorSerial({ serial: servico })
    leitor = serial
    await serial.iniciar()
    await act(async () => {
      render(<IndicadorDoLeitor leitor={serial} />)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Leitor desconectado')
  })
})
