// O `RigDeCracha` contra uma porta serial de mentira, mas fiel ao protocolo
// real do `.ino`: resposta só depois que o comando "termina" (o firmware é
// síncrono ali dentro), e ecos que ninguém pediu são ignorados.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RigDeCracha } from './rigDeCracha.ts'

function criarPortaFalsa() {
  let controlador!: ReadableStreamDefaultController<Uint8Array>
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controlador = c
    },
  })
  const escritas: string[] = []
  const writable = new WritableStream<Uint8Array>({
    write(pedaco) {
      escritas.push(new TextDecoder().decode(pedaco))
    },
  })
  const porta: PortaSerial = {
    readable,
    writable,
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getInfo: () => ({}),
  }
  return {
    porta,
    escritas,
    responder: (texto: string) => controlador.enqueue(new TextEncoder().encode(texto)),
    cair: () => controlador.error(new Error('cabo puxado')),
  }
}

function servicoCom(porta: PortaSerial) {
  const servico = new EventTarget() as ServicoSerial
  servico.getPorts = vi.fn(async () => [porta])
  servico.requestPort = vi.fn(async () => porta)
  return servico
}

let rig: RigDeCracha | undefined
afterEach(async () => {
  await rig?.desconectar()
  rig = undefined
})

describe('RigDeCracha: conexão', () => {
  it('conectar() abre a porta e confirma com PING/PONG', async () => {
    const falsa = criarPortaFalsa()
    rig = new RigDeCracha({ serial: servicoCom(falsa.porta) })
    const abrir = rig.conectar()
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('PING\n'))
    falsa.responder('PONG\n')
    await abrir
    expect(rig.conectado).toBe(true)
  })

  it('a saudação PRONTO, se vier, não é confundida com resposta de comando', async () => {
    const falsa = criarPortaFalsa()
    rig = new RigDeCracha({ serial: servicoCom(falsa.porta) })
    const abrir = rig.conectar()
    falsa.responder('PRONTO adsum-rig-de-crachas\n')
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('PING\n'))
    falsa.responder('PONG\n')
    await abrir
    expect(rig.conectado).toBe(true)
  })

  it('sem Web Serial no navegador, conectar() explica em vez de estourar sem contexto', async () => {
    rig = new RigDeCracha({ serial: undefined })
    await expect(rig.conectar()).rejects.toThrow('Web Serial')
  })
})

describe('RigDeCracha: iniciar() — reconexão sem diálogo', () => {
  it('com porta já autorizada, reconecta sozinho e confirma com PING', async () => {
    const falsa = criarPortaFalsa()
    rig = new RigDeCracha({ serial: servicoCom(falsa.porta) })
    const iniciar = rig.iniciar()
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('PING\n'))
    falsa.responder('PONG\n')
    await iniciar
    expect(rig.conectado).toBe(true)
  })

  it('sem porta nenhuma autorizada, fica quieto — quem chama decide se é problema', async () => {
    const servico = new EventTarget() as ServicoSerial
    servico.getPorts = vi.fn(async () => [])
    servico.requestPort = vi.fn()
    rig = new RigDeCracha({ serial: servico })

    await expect(rig.iniciar()).resolves.toBeUndefined()
    expect(rig.conectado).toBe(false)
    expect(servico.requestPort).not.toHaveBeenCalled()
  })
})

describe('RigDeCracha: protocolo de comando', () => {
  async function conectado() {
    const falsa = criarPortaFalsa()
    rig = new RigDeCracha({ serial: servicoCom(falsa.porta) })
    const abrir = rig.conectar()
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('PING\n'))
    falsa.responder('PONG\n')
    await abrir
    falsa.escritas.length = 0
    return falsa
  }

  it('definir() manda SET e espera OK', async () => {
    const falsa = await conectado()
    const chamada = rig!.definir(3, '1700000009', 120)
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('SET 3 1700000009 120\n'))
    falsa.responder('OK\n')
    await expect(chamada).resolves.toBeUndefined()
  })

  it('ERR rejeita com a mensagem do firmware', async () => {
    const falsa = await conectado()
    const chamada = rig!.definir(999, '123', 0)
    await vi.waitFor(() => expect(falsa.escritas.length).toBeGreaterThan(0))
    falsa.responder('ERR indice fora do intervalo\n')
    await expect(chamada).rejects.toThrow('ERR indice fora do intervalo')
  })

  it('disparar() só resolve quando a resposta chega — o firmware é síncrono durante a rajada', async () => {
    const falsa = await conectado()
    const chamada = rig!.disparar(0)
    await new Promise((r) => setTimeout(r, 20))
    expect(falsa.escritas.join('')).toBe('CARD 0\n')
    // Ainda pendente: nada resolveu sem resposta.
    let resolveu = false
    void chamada.then(() => (resolveu = true))
    await new Promise((r) => setTimeout(r, 20))
    expect(resolveu).toBe(false)
    falsa.responder('OK\n')
    await chamada
  })

  it('dois comandos em paralelo são recusados: o protocolo é uma pergunta de cada vez', async () => {
    const falsa = await conectado()
    const primeiro = rig!.disparar(0)
    await expect(rig!.disparar(1)).rejects.toThrow('em andamento')
    falsa.responder('OK\n')
    await primeiro
  })

  it('sem resposta, expira com uma mensagem clara em vez de travar pra sempre', async () => {
    await conectado()
    await expect(rig!.enviar('PING', 30)).rejects.toThrow('Sem resposta')
  })

  it('cabo puxado durante o comando não deixa a promessa pendurada', async () => {
    const falsa = await conectado()
    const chamada = rig!.ping()
    falsa.cair()
    await expect(chamada).rejects.toThrow()
  })
})
