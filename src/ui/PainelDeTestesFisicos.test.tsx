// O painel contra um `RigDeCracha` ligado a uma porta serial de mentira e um
// `LeitorTeclado` de verdade — prova a costura entre os três: conectar,
// travar se o adaptador não for o dongle, rodar a suíte e mostrar o
// relatório. O firmware do rig é simulado por um pequeno "servidor" que
// responde OK e ecoa o UID configurado, sem hardware nenhum.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RigDeCracha } from '../ambiente/rigDeCracha.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { PainelDeTestesFisicos } from './PainelDeTestesFisicos.tsx'

/**
 * Um PN532... não, um ESP32-S3 de mentira: entende só o suficiente do
 * protocolo (`SET`/`CARD`/`HUMAN`/`PING`) pra responder OK, e ecoa o UID
 * configurado como se estivesse digitando — só que aqui, sem HID nenhum, o
 * teste é quem decide se a leitura "chega" no `LeitorTeclado`.
 */
function criarPlacaFalsa() {
  let controlador!: ReadableStreamDefaultController<Uint8Array>
  const escritas: string[] = []
  const porta: PortaSerial = {
    readable: new ReadableStream<Uint8Array>({
      start(c) {
        controlador = c
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(pedaco) {
        escritas.push(new TextDecoder().decode(pedaco))
      },
    }),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getInfo: () => ({}),
  }
  const responder = (texto: string) => controlador.enqueue(new TextEncoder().encode(texto))
  const servico = new EventTarget() as ServicoSerial
  servico.getPorts = vi.fn(async () => [porta])
  servico.requestPort = vi.fn(async () => porta)
  return { servico, responder }
}

let leitor: LeitorTeclado | undefined
afterEach(async () => {
  cleanup()
  await leitor?.parar()
  leitor = undefined
})

describe('PainelDeTestesFisicos', () => {
  it('sem Web Serial, "Conectar" explica em vez de travar mudo', async () => {
    leitor = new LeitorTeclado()
    const usuario = { click: fireEvent.click }
    render(<PainelDeTestesFisicos leitor={leitor} leitorId="dongle" rig={new RigDeCracha({ serial: undefined })} />)

    usuario.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    await waitFor(() => expect(screen.getByText(/Web Serial/)).toBeInTheDocument())
  })

  it('conectado, mas com outro adaptador escolhido, pede pra trocar pro dongle antes de rodar', async () => {
    leitor = new LeitorTeclado()
    const { servico, responder } = criarPlacaFalsa()
    render(<PainelDeTestesFisicos leitor={leitor} leitorId="simulado" rig={new RigDeCracha({ serial: servico })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    await waitFor(() => expect(screen.getByText('conectado')).toBeInTheDocument())

    expect(screen.getByText(/Dongle USB/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rodar suíte/ })).not.toBeInTheDocument()
  })

  it('conectado com o dongle, "Rodar suíte" dispara a preparação no rig e trava o botão', async () => {
    leitor = new LeitorTeclado()
    await leitor.iniciar()
    const { servico, responder } = criarPlacaFalsa()

    render(<PainelDeTestesFisicos leitor={leitor} leitorId="dongle" rig={new RigDeCracha({ serial: servico })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    await waitFor(() => expect(screen.getByText('conectado')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Rodar suíte/ }))

    // A suíte começa configurando os 12 crachás de teste no rig (SET) antes
    // de disparar qualquer coisa — é a costura tela→rig que se prova aqui,
    // não o relógio da suíte inteira (isso já é `suiteFisica.test.ts`, com
    // tempo injetado e sem esperar de verdade). O primeiro SET fica sem
    // resposta de propósito: não importa aqui se ele chega a terminar.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rodando...' })).toBeDisabled())
    expect(screen.getByText(/Preparando/)).toBeInTheDocument()
  })
})
