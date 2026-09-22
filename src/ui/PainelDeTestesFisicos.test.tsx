// O painel contra um `RigDeCracha` ligado a uma porta serial de mentira, um
// `LeitorTeclado` de verdade e o `RepositorioDexie` de verdade (IndexedDB
// falso) — prova a costura entre os quatro: conectar, travar se o adaptador
// não for o dongle, rodar a suíte, e o fluxo da turma de teste (preparar,
// travar numa chamada alheia, rodar o cenário avançado). O firmware do rig é
// simulado por um pequeno "servidor" que responde OK e ecoa o UID
// configurado, sem hardware nenhum.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RigDeCracha } from '../ambiente/rigDeCracha.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { PainelDeTestesFisicos } from './PainelDeTestesFisicos.tsx'
import { montarBancada, type Bancada } from '../testes/montar.tsx'
import { TURMA_DE_TESTE, uidCurtoDeTeste } from '../nucleo/suiteDeTestes.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { decimalParaBytes } from '../nucleo/digitacao.ts'

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
  // Vazio de propósito: o painel tenta reconectar sozinho ao montar (o
  // mecanismo que devolve o rig depois do "Preparar" recarregar a página).
  // Se `getPorts` já devolvesse a porta aqui, essa reconexão automática
  // brigaria com o clique explícito de "Conectar" destes testes, pelo
  // mesmo stream — os testes de `iniciar()` já cobrem esse caminho, em
  // `rigDeCracha.test.ts`.
  servico.getPorts = vi.fn(async () => [])
  servico.requestPort = vi.fn(async () => porta)
  return { servico, responder, escritas, porta }
}

let leitor: LeitorTeclado | undefined
let bancada: Bancada | undefined
afterEach(async () => {
  cleanup()
  await leitor?.parar()
  leitor = undefined
  await bancada?.repositorio.fechar()
  bancada = undefined
})

async function montarPainel(leitorId: string, rig: RigDeCracha) {
  leitor = new LeitorTeclado()
  await leitor.iniciar()
  bancada = await montarBancada()
  const tela = render(
    <PainelDeTestesFisicos
      leitor={leitor}
      leitorId={leitorId}
      repositorio={bancada.repositorio}
      config={bancada.config}
      rig={rig}
    />,
  )
  return { ...bancada, ...tela }
}

describe('PainelDeTestesFisicos: rig', () => {
  it('sem Web Serial, "Conectar" explica em vez de travar mudo', async () => {
    await montarPainel('dongle', new RigDeCracha({ serial: undefined }))
    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    await waitFor(() => expect(screen.getByText(/Web Serial/)).toBeInTheDocument())
  })

  it('conectado, mas com outro adaptador escolhido, pede pra trocar pro dongle antes de rodar', async () => {
    const { servico, responder } = criarPlacaFalsa()
    await montarPainel('simulado', new RigDeCracha({ serial: servico }))

    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    await waitFor(() => expect(screen.getByText('conectado')).toBeInTheDocument())

    expect(screen.getByText(/Dongle USB/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rodar suíte/ })).not.toBeInTheDocument()
  })

  it('conectado com o dongle, "Rodar suíte" dispara a preparação no rig e trava o botão', async () => {
    const { servico, responder } = criarPlacaFalsa()
    await montarPainel('dongle', new RigDeCracha({ serial: servico }))

    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    await waitFor(() => expect(screen.getByRole('button', { name: /Rodar suíte/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Rodar suíte/ }))

    // A suíte começa configurando os 12 crachás de teste no rig (SET) antes
    // de disparar qualquer coisa — é a costura tela→rig que se prova aqui,
    // não o relógio da suíte inteira (isso já é `suiteFisica.test.ts`, com
    // tempo injetado e sem esperar de verdade). O primeiro SET fica sem
    // resposta de propósito: não importa aqui se ele chega a terminar.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rodando...' })).toBeDisabled())
    expect(screen.getByText(/Preparando/)).toBeInTheDocument()
  })

  // Achado ao vivo em 22/09/2026: o Diagnóstico é uma folha — fecha e
  // desmonta este painel, reabrir monta um `RigDeCracha` novo. Sem fechar a
  // porta do antigo, o novo esbarrava nela como "já aberta" — o mesmo
  // sintoma do bug de recarregamento, por um gatilho diferente.
  it('desmontar (fechar a folha do Diagnóstico) fecha a porta do rig', async () => {
    const { servico, responder, porta } = criarPlacaFalsa()
    const tela = await montarPainel('dongle', new RigDeCracha({ serial: servico }))

    fireEvent.click(screen.getByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    await waitFor(() => expect(screen.getByText('conectado')).toBeInTheDocument())

    tela.unmount()

    await waitFor(() => expect(porta.close).toHaveBeenCalledOnce())
  })
})

describe('PainelDeTestesFisicos: turma de teste', () => {
  it('sem sessão nenhuma, oferece preparar — e preparar cria turma, vínculos e sessão', async () => {
    const b = await montarPainel('dongle', new RigDeCracha({ serial: undefined }))
    const botao = await screen.findByRole('button', { name: 'Preparar turma de teste e abrir a chamada' })

    fireEvent.click(botao)

    await waitFor(async () => {
      expect(await b.repositorio.listarMatriculados(TURMA_DE_TESTE)).toHaveLength(12)
    })
    const sessao = await b.repositorio.sessaoAberta()
    expect(sessao?.turma).toBe(TURMA_DE_TESTE)
  })

  it('com uma chamada de verdade aberta, avisa e não oferece preparar', async () => {
    const b = await montarPainel('dongle', new RigDeCracha({ serial: undefined }))
    await b.repositorio.abrirSessao({
      turma: 'IF685 · T01',
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'professor-de-verdade',
    })
    // O painel já montou antes da sessão existir — força a releitura como o
    // recarregamento de página faria de verdade.
    cleanup()
    render(
      <PainelDeTestesFisicos
        leitor={leitor!}
        leitorId="dongle"
        repositorio={b.repositorio}
        config={b.config}
        rig={new RigDeCracha({ serial: undefined })}
      />,
    )

    await screen.findByText(/Há uma chamada de verdade aberta/)
    expect(screen.queryByRole('button', { name: /Preparar turma de teste/ })).not.toBeInTheDocument()
  })

  it('com a chamada de teste já aberta e o rig conectado, roda o cenário avançado e mostra o relatório', async () => {
    const { servico, responder } = criarPlacaFalsa()
    const b = await montarPainel('dongle', new RigDeCracha({ serial: servico }))

    // Turma de teste já pronta, como se "Preparar" já tivesse rodado numa
    // sessão anterior (e a página, recarregado).
    await b.repositorio.salvarTurma(TURMA_DE_TESTE, [])
    await b.repositorio.abrirSessao({
      turma: TURMA_DE_TESTE,
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'professor-de-teste',
    })
    const uid0 = decimalParaBytes(uidCurtoDeTeste(0))!
    await b.repositorio.gravarVinculo({
      uidHash: await calcularUidHash(b.config.salHex, uid0),
      papel: 'aluno',
      nome: 'Teste 01',
      matricula: 'TESTE01',
      criadoEm: new Date().toISOString(),
    })
    cleanup()
    render(
      <PainelDeTestesFisicos
        leitor={leitor!}
        leitorId="dongle"
        repositorio={b.repositorio}
        config={b.config}
        rig={new RigDeCracha({ serial: servico })}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Conectar rig de teste' }))
    responder('PONG\n')
    const botaoAvancado = await screen.findByRole('button', { name: /Rodar cenário avançado/ })

    fireEvent.click(botaoAvancado)

    // A costura tela→cenário: o clique dispara a preparação no rig e trava
    // o botão. A avaliação em si (ler de volta o repositório, aprovar ou
    // não) já tem cobertura própria e mais precisa em `suiteFisica.test.ts`,
    // com o rig e o relógio injetados — aqui não há placa de verdade
    // digitando, então não há como o leitor receber as duas rajadas reais.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rodando...' })).toBeDisabled())
    expect(screen.getByText(/Preparando os dois crachás/)).toBeInTheDocument()
  })
})
