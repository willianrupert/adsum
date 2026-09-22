// O `LeitorSerial` contra uma porta serial de mentira, mas de streams de
// verdade: o que chega é `Uint8Array` em pedaços, como o Chrome entrega, e não
// uma string pronta. Os dois UIDs são os medidos com o dongle real em
// 10/09/2026 — a mesma conferência de `LeitorTeclado.test.ts`, agora passando
// pela linha que o firmware do ESP32 manda. Se a ordem dos bytes divergir, o
// `uid_hash` muda e os vínculos existentes deixam de casar: é isto que se prova.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeitorSerial } from './LeitorSerial.ts'
import { uidParaHex } from '../../nucleo/uid.ts'
import type { Leitura, Recusa } from '../../portas/LeitorDeCracha.ts'

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
    enviar: (texto: string) => controlador.enqueue(new TextEncoder().encode(texto)),
    cair: () => controlador.error(new Error('cabo puxado')),
  }
}

function criarServicoFalso(autorizadas: PortaSerial[], escolhida?: PortaSerial) {
  const servico = new EventTarget() as ServicoSerial
  servico.getPorts = vi.fn(async () => autorizadas)
  servico.requestPort = vi.fn(async () => {
    if (!escolhida) throw new Error('cancelado')
    return escolhida
  })
  return servico
}

let leitor: LeitorSerial | undefined
afterEach(async () => {
  await leitor?.parar()
  leitor = undefined
})

async function iniciarCom(falsa: ReturnType<typeof criarPortaFalsa>, agora?: () => number) {
  leitor = new LeitorSerial({ serial: criarServicoFalso([falsa.porta]), agora })
  const leituras: Leitura[] = []
  leitor.aoLer((l) => leituras.push(l))
  await leitor.iniciar()
  return leituras
}

describe('LeitorSerial: leitura', () => {
  it('lê os dois UIDs medidos com o dongle, na ordem certa dos bytes', async () => {
    const falsa = criarPortaFalsa()
    const leituras = await iniciarCom(falsa)
    // A linha chega quebrada ao meio, como uma porta serial de verdade faz.
    falsa.enviar('093014')
    falsa.enviar('8883\n2367396804\n')
    await vi.waitFor(() => expect(leituras).toHaveLength(2))
    expect(uidParaHex(leituras[0].uid)).toBe('3770f213')
    expect(uidParaHex(leituras[1].uid)).toBe('8d1b9bc4')
    expect(leituras[0].origem).toBe('Leitor USB (serial)')
  })

  it('lê UID de 7 bytes em hexadecimal, e aceita fim de linha do Windows', async () => {
    const falsa = criarPortaFalsa()
    const leituras = await iniciarCom(falsa)
    falsa.enviar('04a2248a123456\r\n')
    await vi.waitFor(() => expect(leituras).toHaveLength(1))
    expect(uidParaHex(leituras[0].uid)).toBe('04a2248a123456')
  })

  it('linha que não é UID é recusada e contada, nunca vira leitura em silêncio', async () => {
    const falsa = criarPortaFalsa()
    const leituras = await iniciarCom(falsa)
    falsa.enviar('lixo\n12345\n0930148883\n')
    await vi.waitFor(() => expect(leituras).toHaveLength(1))
    const d = await leitor!.diagnostico()
    expect(d.detalhes['linhas recusadas']).toBe('2')
    expect(d.detalhes['últimas recusas']).toContain('lixo')
  })

  it('linhas com # são do aparelho e nunca viram crachá', async () => {
    const falsa = criarPortaFalsa()
    const leituras = await iniciarCom(falsa)
    falsa.enviar('#ADSUM-LEITOR 1\n#HB pn532=ok\n')
    await vi.waitFor(async () => expect((await leitor!.diagnostico()).detalhes['último sinal de vida']).not.toBe('—'))
    expect(leituras).toHaveLength(0)
    expect((await leitor!.diagnostico()).detalhes['linhas recusadas']).toBe('0')
  })
})

describe('LeitorSerial: recusa avisada', () => {
  it('linha que não é UID emite a recusa, e linha do aparelho (#) não', async () => {
    const falsa = criarPortaFalsa()
    await iniciarCom(falsa)
    const recusas: Recusa[] = []
    leitor!.aoRecusar((r) => recusas.push(r))
    falsa.enviar('#HB pn532=ok\nlixo\n')
    await vi.waitFor(() => expect(recusas).toHaveLength(1))
    expect(recusas[0]).toMatchObject({ motivo: 'linha', cru: 'lixo' })
  })
})

describe('LeitorSerial: sinal de vida', () => {
  it('só está vivo com sinal recente, e diz quando o módulo de leitura está com erro', async () => {
    let agora = 1_000
    const falsa = criarPortaFalsa()
    await iniciarCom(falsa, () => agora)
    expect(leitor!.situacao()).toEqual({ vivo: false, modulo: 'desconhecido' })

    falsa.enviar('#HB pn532=ok\n')
    await vi.waitFor(() => expect(leitor!.situacao().vivo).toBe(true))
    expect(leitor!.situacao().modulo).toBe('ok')

    agora += 2_500
    expect(leitor!.situacao().vivo).toBe(true)
    agora += 1_000 // 3,5 s sem sinal
    expect(leitor!.situacao()).toEqual({ vivo: false, modulo: 'desconhecido' })

    falsa.enviar('#HB pn532=erro\n')
    await vi.waitFor(() => expect(leitor!.situacao().modulo).toBe('erro'))
  })
})

describe('LeitorSerial: conexão', () => {
  it('sem porta autorizada não abre diálogo sozinho: fica em erro e explica', async () => {
    const servico = criarServicoFalso([])
    leitor = new LeitorSerial({ serial: servico })
    await leitor.iniciar()
    expect(leitor.estado()).toBe('erro')
    expect(servico.requestPort).not.toHaveBeenCalled()
    expect((await leitor.diagnostico()).motivo).toContain('Conectar leitor USB')
  })

  it('conectar() abre o diálogo, abre a porta escolhida e passa a ler', async () => {
    const falsa = criarPortaFalsa()
    const servico = criarServicoFalso([], falsa.porta)
    leitor = new LeitorSerial({ serial: servico })
    const leituras: Leitura[] = []
    leitor.aoLer((l) => leituras.push(l))
    await leitor.iniciar()
    expect(leitor.estado()).toBe('erro')

    await leitor.conectar()
    expect(servico.requestPort).toHaveBeenCalledOnce()
    expect(leitor.estado()).toBe('lendo')
    falsa.enviar('0930148883\n')
    await vi.waitFor(() => expect(leituras).toHaveLength(1))
  })

  it('fechar o diálogo de escolha não muda nada', async () => {
    const servico = criarServicoFalso([])
    leitor = new LeitorSerial({ serial: servico })
    await leitor.iniciar()
    await leitor.conectar()
    expect(leitor.estado()).toBe('erro')
  })

  it('cabo puxado vira erro visível, não silêncio', async () => {
    const falsa = criarPortaFalsa()
    await iniciarCom(falsa)
    expect(leitor!.estado()).toBe('lendo')
    falsa.cair()
    await vi.waitFor(() => expect(leitor!.estado()).toBe('erro'))
    expect((await leitor!.diagnostico()).motivo).toContain('desconectado')
  })

  it('porta ocupada por outra aba vira erro com o motivo', async () => {
    const falsa = criarPortaFalsa()
    falsa.porta.open = vi.fn(async () => {
      throw new Error('Failed to open serial port.')
    })
    leitor = new LeitorSerial({ serial: criarServicoFalso([falsa.porta]) })
    await leitor.iniciar()
    expect(leitor.estado()).toBe('erro')
    expect((await leitor.diagnostico()).motivo).toContain('Failed to open')
  })

  it('sem Web Serial no navegador, não está disponível', async () => {
    leitor = new LeitorSerial({ serial: undefined })
    // `navigator.serial` não existe no jsdom, então o padrão também cai aqui.
    expect(await leitor.estaDisponivel()).toBe(false)
  })
})

describe('LeitorSerial: confirmação', () => {
  it('confirmarGravacao() manda OK ao aparelho', async () => {
    const falsa = criarPortaFalsa()
    await iniciarCom(falsa)
    await leitor!.confirmarGravacao()
    await vi.waitFor(() => expect(falsa.escritas.join('')).toBe('OK\n'))
  })

  it('sem porta aberta, confirmar não faz nada e não estoura', async () => {
    leitor = new LeitorSerial({ serial: criarServicoFalso([]) })
    await expect(leitor.confirmarGravacao()).resolves.toBeUndefined()
  })
})
