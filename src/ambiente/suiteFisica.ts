// Orquestra a suíte de testes físicos: dispara cenários no rig (a porta
// nativa dele, HID, está fora do alcance deste arquivo) e observa o que
// chega no `leitor` de verdade do app (`aoLer`/`aoRecusar`) — nunca finge,
// nunca lê a tela. Só existe no modo de ensaio (`TelaDiagnostico`, gated
// lá); depende de `LeitorTeclado`, porque só ele recebe teclado do sistema
// operacional — quem chama confere `leitorId === 'dongle'` antes de rodar.

import { avaliarCenario, avaliarPerdaDeFoco, uidDeTeste, type EventoObservado, type ResultadoCenario } from '../nucleo/suiteDeTestes.ts'
import { ehQueRecusa, type LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { RigDeCracha } from './rigDeCracha.ts'

const QUANTIDADE = 12

function capturar(leitor: LeitorDeCracha): { eventos: EventoObservado[]; parar: () => void } {
  const eventos: EventoObservado[] = []
  const pararLer = leitor.aoLer(() => eventos.push({ tipo: 'aceita', em: performance.now() }))
  const pararRecusa = ehQueRecusa(leitor)
    ? leitor.aoRecusar((r) => eventos.push({ tipo: 'recusa', motivo: r.motivo, em: performance.now() }))
    : () => {}
  return {
    eventos,
    parar: () => {
      pararLer()
      pararRecusa()
    },
  }
}

/** Injetáveis para teste: sem esperar de verdade, e sem abrir janela real. */
export interface DependenciasDaSuite {
  esperar?: (ms: number) => Promise<void>
  abrirJanelaAuxiliar?: () => { focus(): void; close(): void } | null
}

async function cenario(nome: string, corpo: () => Promise<ResultadoCenario>): Promise<ResultadoCenario> {
  try {
    return await corpo()
  } catch (erro) {
    return { nome, aprovado: false, detalhe: `Falhou: ${(erro as Error).message}` }
  }
}

export async function rodarSuiteFisica(
  rig: RigDeCracha,
  leitor: LeitorDeCracha,
  aoProgredir: (mensagem: string) => void,
  dependencias: DependenciasDaSuite = {},
): Promise<ResultadoCenario[]> {
  const esperar = dependencias.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const abrirJanelaAuxiliar =
    dependencias.abrirJanelaAuxiliar ?? (() => window.open('about:blank', '_blank', 'width=100,height=100'))

  const resultados: ResultadoCenario[] = []

  aoProgredir('Preparando os crachás de teste...')
  try {
    for (let i = 0; i < QUANTIDADE; i++) await rig.definir(i, uidDeTeste(i), 140)
  } catch (erro) {
    // Sem os crachás definidos, nenhum cenário tem o que disparar — um erro
    // aqui é fatal pra suíte inteira, mas ainda vira relatório, não exceção.
    return [
      {
        nome: 'Preparação',
        aprovado: false,
        detalhe: `Não deu pra configurar os crachás de teste no rig: ${(erro as Error).message}`,
      },
    ]
  }

  // 1) Ritmo normal — 800 a 1200 ms entre crachás, o caso comum de sala.
  resultados.push(
    await cenario('Ritmo normal', async () => {
      aoProgredir('Ritmo normal: disparando 12 crachás...')
      const captura = capturar(leitor)
      for (let i = 0; i < QUANTIDADE; i++) {
        await rig.disparar(i)
        if (i < QUANTIDADE - 1) await esperar(800 + Math.random() * 400)
      }
      captura.parar()
      return avaliarCenario({ nome: 'Ritmo normal', aceitas: QUANTIDADE, recusas: 0 }, captura.eventos)
    }),
  )

  // 2) Fila apressada — 500 ms fixos: o cenário que expôs o bug de
  // 15/09/2026 (INTERVALO_MAXIMO_MS medindo atraso de processamento como se
  // fosse digitação humana, com a aba ocupada por uma turma grande).
  resultados.push(
    await cenario('Fila apressada (500 ms)', async () => {
      aoProgredir('Fila apressada: disparando 12 crachás a 500 ms...')
      const captura = capturar(leitor)
      for (let i = 0; i < QUANTIDADE; i++) {
        await rig.disparar(i)
        if (i < QUANTIDADE - 1) await esperar(500)
      }
      captura.parar()
      return avaliarCenario({ nome: 'Fila apressada (500 ms)', aceitas: QUANTIDADE, recusas: 0 }, captura.eventos)
    }),
  )

  // 3) Digitação humana — tem que continuar sendo recusada, senão o app
  // aceitaria qualquer um digitando um número no campo errado.
  resultados.push(
    await cenario('Digitação humana (recusada)', async () => {
      aoProgredir('Digitação humana: não deve virar leitura...')
      const captura = capturar(leitor)
      await rig.digitacaoHumana(uidDeTeste(99), 120)
      await esperar(300)
      captura.parar()
      return avaliarCenario(
        { nome: 'Digitação humana (recusada)', aceitas: 0, recusas: 1, motivoRecusa: 'ritmo' },
        captura.eventos,
      )
    }),
  )

  // 4) Perda de foco — a suspeita mais recorrente do incidente do
  // Prof. Paulo (15 e 17/09/2026, e confirmado em 21/09 que acontece mesmo
  // com o app em foco — o que não invalida este teste, só diz que não é a
  // causa única). Uma janela auxiliar, aberta sob o clique que iniciou a
  // suíte — só assim o Chrome permite sem bloquear como pop-up —, rouba o
  // foco de verdade. Não é `window.blur()`: o Chrome ignora isso na aba
  // principal.
  resultados.push(
    await cenario('Perda de foco', async () => {
      aoProgredir('Perda de foco: desfocando a janela do Adsum...')
      const auxiliar = abrirJanelaAuxiliar()
      if (!auxiliar) {
        return {
          nome: 'Perda de foco',
          aprovado: false,
          detalhe: 'O navegador bloqueou a janela auxiliar (pop-up). Permita pop-ups para este site e rode de novo.',
        }
      }

      auxiliar.focus()
      await esperar(150) // dar tempo do sistema operacional processar a troca de foco
      let captura = capturar(leitor)
      await rig.disparar(QUANTIDADE - 2)
      await esperar(200)
      captura.parar()
      const semFoco = captura.eventos

      window.focus()
      auxiliar.close()
      await esperar(150)
      captura = capturar(leitor)
      await rig.disparar(QUANTIDADE - 1)
      await esperar(200)
      captura.parar()
      const comFocoDeVolta = captura.eventos

      return avaliarPerdaDeFoco(semFoco, comFocoDeVolta)
    }),
  )

  aoProgredir('Suíte concluída.')
  return resultados
}
