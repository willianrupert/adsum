// Orquestra a suíte de testes físicos: dispara cenários no rig (a porta
// nativa dele, HID, está fora do alcance deste arquivo) e observa o que
// chega no `leitor` de verdade do app (`aoLer`/`aoRecusar`) — nunca finge,
// nunca lê a tela. Só existe no modo de ensaio (`TelaDiagnostico`, gated
// lá); depende de `LeitorTeclado`, porque só ele recebe teclado do sistema
// operacional — quem chama confere `leitorId === 'dongle'` antes de rodar.

import {
  avaliarChamadaComHistorico,
  avaliarFilaDeRadio,
  uidDaFilaDeRadio,
  avaliarCenario,
  avaliarDoisCrachasJuntos,
  avaliarPerdaDeFoco,
  TURMA_DE_TESTE,
  uidCurtoDeTeste,
  uidDeTeste,
  type EventoObservado,
  type ResultadoCenario,
} from '../nucleo/suiteDeTestes.ts'
import { ehQueRecusa, type LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import type { RigDeCracha } from './rigDeCracha.ts'
import { linhasDoDiario } from './diario.ts'
import { calcularUidHash, sortearSal, uidHashSintetico } from '../nucleo/hash.ts'
import { decimalParaBytes } from '../nucleo/digitacao.ts'
import { proximoEventoId } from '../nucleo/sessao.ts'
import type { Config } from '../nucleo/tipos.ts'

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

/**
 * O cenário que só existe dentro de uma chamada aberta de verdade — quem
 * chama já garantiu isso com `turmaDeTeste.ts`. Redefine os índices 0 e 1
 * do rig com o UID curto (`uidCurtoDeTeste`): a margem de tempo importa
 * mais aqui do que nos outros quatro cenários, porque o que se mede é se os
 * dois ficam sob 400 ms — não só se os dois chegaram.
 */
export async function rodarCenarioAvancado(
  rig: RigDeCracha,
  repositorio: Repositorio,
  aoProgredir: (mensagem: string) => void,
): Promise<ResultadoCenario> {
  return cenario('Dois crachás juntos (INTERVALO_MINIMO_MS)', async () => {
    aoProgredir('Preparando os dois crachás do cenário avançado...')
    await rig.definir(0, uidCurtoDeTeste(0), 10)
    await rig.definir(1, uidCurtoDeTeste(1), 10)

    aoProgredir('Disparando os dois crachás quase juntos...')
    await rig.disparar(0)
    await rig.disparar(1)

    // O rig não sabe quando o app terminou de gravar — só quando terminou
    // de digitar. Uma folga curta garante que os dois eventos já estão no
    // repositório antes de ler de volta.
    await new Promise((r) => setTimeout(r, 300))

    const [maisRecente, anterior] = await repositorio.listarEventos({ turma: TURMA_DE_TESTE, limite: 2 })
    if (!maisRecente || !anterior) {
      return {
        nome: 'Dois crachás juntos (INTERVALO_MINIMO_MS)',
        aprovado: false,
        detalhe: 'Não achei dois eventos novos na turma de teste — os crachás chegaram a ser lidos?',
      }
    }
    const gapMs = new Date(maisRecente.quando).getTime() - new Date(anterior.quando).getTime()
    return avaliarDoisCrachasJuntos({ gapMs, resultados: [anterior.resultado, maisRecente.resultado] })
  })
}

/**
 * A chamada com histórico, pelo rig de verdade. Quem chama já garantiu a
 * turma de teste com a chamada aberta (`turmaDeTeste.ts`).
 *
 * Antes de disparar, a base fica como estava a do professor em 22/09/2026:
 * - os ids em que os próximos crachás cairiam já estão tomados, por eventos
 *   de teste com `origem: 'professor'` (não contam presença);
 * - um crachá a mais foi cadastrado num sal que não é o atual, guardado só
 *   no chaveiro.
 *
 * Os eventos semeados ficam no log da turma de teste para sempre: o log não
 * apaga nada, e isto é turma de teste de nome inconfundível. É o preço de
 * testar na base de verdade.
 */
export async function rodarChamadaComHistorico(
  rig: RigDeCracha,
  repositorio: Repositorio,
  config: Config,
  aoProgredir: (mensagem: string) => void,
  dependencias: DependenciasDaSuite = {},
): Promise<ResultadoCenario> {
  const nome = 'Chamada com histórico (22/09)'
  const esperar = dependencias.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  return cenario(nome, async () => {
    const matriculados = await repositorio.listarMatriculados(TURMA_DE_TESTE)
    const disparos = Math.min(QUANTIDADE, matriculados.length)
    if (disparos === 0) throw new Error('a turma de teste está vazia; prepare-a antes')

    aoProgredir('Ocupando os ids em que os próximos crachás cairiam...')
    const agora = new Date()
    const base = await repositorio.contarEventos()
    for (let k = 1; k <= disparos; k++) {
      await repositorio.acrescentarEvento({
        eventoId: proximoEventoId(config.instalacaoId, agora, base + disparos + k),
        quando: agora.toISOString(),
        turma: TURMA_DE_TESTE,
        nome: '🧪 id ocupado de propósito',
        origem: 'professor',
        resultado: 'ok',
        uidHash: uidHashSintetico(),
      })
    }

    aoProgredir('Cadastrando um crachá num sal antigo...')
    const salAntigo = sortearSal()
    await repositorio.lembrarSais([salAntigo])
    const uidAntigo = uidCurtoDeTeste(QUANTIDADE + 1)
    const hashAntigo = await calcularUidHash(salAntigo, decimalParaBytes(uidAntigo)!)
    const dono = matriculados[0]
    await repositorio.gravarVinculo({
      uidHash: hashAntigo,
      papel: 'aluno',
      nome: dono.nome,
      matricula: dono.matricula,
      criadoEm: agora.toISOString(),
    })

    const hashes = new Set([hashAntigo])
    for (let i = 0; i < disparos; i++) {
      hashes.add(await calcularUidHash(config.salHex, decimalParaBytes(uidCurtoDeTeste(i))!))
    }
    const antes = new Set((await repositorio.listarEventos({ turma: TURMA_DE_TESTE })).map((e) => e.eventoId))

    aoProgredir(`Disparando ${disparos + 1} crachás pelo rig...`)
    for (let i = 0; i < disparos; i++) {
      await rig.definir(i, uidCurtoDeTeste(i), 60)
      await rig.disparar(i)
      // Acima de INTERVALO_MINIMO_MS com folga: o que se mede aqui é a
      // gravação, não a regra dos dois crachás juntos.
      await esperar(900)
    }
    await rig.definir(0, uidAntigo, 300)
    await rig.disparar(0)
    await esperar(1500)

    const novos = (await repositorio.listarEventos({ turma: TURMA_DE_TESTE })).filter(
      (e) => !antes.has(e.eventoId) && hashes.has(e.uidHash),
    )
    const ids = novos.map((e) => e.eventoId)
    return avaliarChamadaComHistorico({
      disparados: disparos + 1,
      gravados: novos.length,
      idsRepetidos: ids.length - new Set(ids).size,
      antigoReconhecidoComo: novos.find((e) => e.uidHash === hashAntigo)?.nome || undefined,
      esperadoParaOAntigo: dono.nome,
    })
  })
}

/**
 * Dá a cada aluno da turma de teste o crachá que a fila vai emitir.
 *
 * Sem isto, o app recebe doze crachás que nunca viu e pergunta de quem é cada
 * um, enquanto a turma aparece toda cadastrada — porque `prepararTurmaDeTeste`
 * deu a eles **outros** crachás, os do rig de HID. Dois conjuntos de UIDs, e
 * a confusão é imediata na tela (achado em 22/09/2026, num modo de
 * demonstração que pulava este passo).
 *
 * Devolve o mapa de hash para índice, que é como o cenário confere depois
 * quem chegou.
 */
export async function cadastrarFilaDeRadio(
  repositorio: Repositorio,
  config: Config,
  quantos: number,
): Promise<Map<string, number>> {
  const matriculados = await repositorio.listarMatriculados(TURMA_DE_TESTE)
  const hashes = new Map<string, number>()
  for (let i = 0; i < Math.min(quantos, matriculados.length); i++) {
    const uid = decimalParaBytes(uidDaFilaDeRadio(i))
    if (!uid) continue
    const uidHash = await calcularUidHash(config.salHex, uid)
    hashes.set(uidHash, i)
    await repositorio.gravarVinculo({
      uidHash,
      papel: 'aluno',
      nome: matriculados[i].nome,
      matricula: matriculados[i].matricula,
      criadoEm: new Date().toISOString(),
    })
  }
  return hashes
}

/** Quanto cada crachá fica no ar e quanto o emulador espera até o próximo. */
export type CadenciaDaFila = { msNoAr: number; msEntre: number }

/** A cadência da bancada de 22/09/2026: a mais apertada que o dongle leu inteira. */
export const CADENCIA_PADRAO: CadenciaDaFila = { msNoAr: 400, msEntre: 100 }

/** O reset por fio (~120 ms) e o `SAMConfiguration` que vem depois dele. */
const RESET_POR_ALUNO_MS = 150

/**
 * Uma turma inteira passando o crachá no dongle de verdade, pelo rádio.
 *
 * É o último pedaço do caminho que nenhum teste cobria: o crachá existe como
 * campo eletromagnético, o dongle faz anticolisão e digita, e o app grava. O
 * emulador (`ferramentas/emulador-de-cracha`) fala o mesmo protocolo do rig de
 * HID, então quem chama não precisa saber qual dos dois está do outro lado —
 * só o `FILA` é exclusivo dele, e o rig responde `ERR` a ele, o que é a
 * resposta certa.
 *
 * Dois cuidados que a bancada de 22/09/2026 ensinou, e que valem mais que o
 * código daqui:
 *
 * - **as antenas ficam a uns 3 cm**: encostadas, o acoplamento abafa a
 *   resposta do alvo e quase nada é lido;
 * - **o reset por fio entre um aluno e outro não é opcional**: sem ele, a
 *   troca rápida faz o PN532 responder antes de ter o UID configurado, e o
 *   dongle lê `08 08 08 08` — um aluno que não existe.
 */
export async function rodarFilaDeRadio(
  rig: RigDeCracha,
  repositorio: Repositorio,
  config: Config,
  quantos: number,
  aoProgredir: (mensagem: string) => void,
  dependencias: DependenciasDaSuite = {},
  cadencia: CadenciaDaFila = CADENCIA_PADRAO,
): Promise<ResultadoCenario> {
  const esperar = dependencias.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  return cenario('Fila pelo rádio (dongle de verdade)', async () => {
    const matriculados = await repositorio.listarMatriculados(TURMA_DE_TESTE)
    if (matriculados.length === 0) throw new Error('a turma de teste está vazia; prepare-a antes')
    const alunos = Math.min(quantos, matriculados.length)

    aoProgredir(`Cadastrando ${alunos} crachás da fila...`)
    const hashes = await cadastrarFilaDeRadio(repositorio, config, alunos)

    const antes = new Set((await repositorio.listarEventos({ turma: TURMA_DE_TESTE })).map((e) => e.eventoId))
    // O emulador não sabe quando o dongle leu (`TgInitAsTarget` não
    // retorna), então cada aluno paga o tempo no ar inteiro, mais o
    // intervalo, mais o reset por fio.
    const porAluno = cadencia.msNoAr + cadencia.msEntre + RESET_POR_ALUNO_MS
    const minutos = Math.max(1, Math.round((alunos * porAluno) / 60_000))
    aoProgredir(
      `Disparando ${alunos} crachás pelo rádio, um a cada ${(porAluno / 1000).toFixed(1)} s ` +
        `(cerca de ${minutos} min). Antenas a uns 3 cm, e o foco nesta janela.`,
    )
    const resposta = await rig.fila(alunos, cadencia.msNoAr, cadencia.msEntre)
    // "OK parado 57 de 300": a fila foi interrompida, e só os que saíram
    // contam como disparados — senão o resto vira "não chegou na base".
    const parado = /^OK parado (\d+)/.exec(resposta)
    const disparados = parado ? Number(parado[1]) : alunos
    // O dongle digita depois de ler, e o app grava depois de digitar: uma
    // folga curta evita ler a base antes de a última presença chegar.
    await esperar(1500)

    const novos = (await repositorio.listarEventos({ turma: TURMA_DE_TESTE })).filter(
      (e) => !antes.has(e.eventoId) && e.origem === 'cracha',
    )
    return avaliarFilaDeRadio({
      disparados,
      gravados: new Set(novos.filter((e) => hashes.has(e.uidHash)).map((e) => e.uidHash)).size,
      fantasmas: novos.filter((e) => !hashes.has(e.uidHash)).length,
      // O que o app levou por crachá, do diário desta mesma rodada: é onde
      // aparece uma aula ficando lenta, e de qual etapa é a culpa.
      tempos: temposDoDiario(novos.length),
      porMinuto: porMinutoMedido(novos.filter((e) => hashes.has(e.uidHash))),
    })
  })
}

/**
 * Quantos crachás por minuto chegaram na base, do primeiro ao último gravado.
 *
 * Medido pelo `quando` dos eventos, e não pelo relógio de quem disparou: é o
 * número que importa na sala, o de presenças gravadas, e já inclui o que o
 * dongle e o app levaram.
 */
function porMinutoMedido(eventos: { quando: string }[]): number | undefined {
  if (eventos.length < 2) return undefined
  const instantes = eventos.map((e) => Date.parse(e.quando)).sort((a, b) => a - b)
  const duracao = instantes[instantes.length - 1] - instantes[0]
  if (duracao <= 0) return undefined
  return Math.round(((eventos.length - 1) * 60_000) / duracao)
}

/**
 * Os tempos por crachá das últimas leituras, lidos do diário
 * (`ambiente/diario.ts`), que já mede identificar, gravar e redesenhar.
 *
 * Medir aqui de novo seria medir outra coisa: o diário marca o que o app
 * levou **de verdade** em cada etapa, enquanto qualquer cronômetro daqui
 * mediria o caminho inteiro, rádio incluído.
 */
function temposDoDiario(quantas: number): { identificar: number; gravar: number; tela: number } | undefined {
  const linhas = linhasDoDiario()
    .filter((l) => l.includes('| cracha |'))
    .slice(-Math.max(quantas, 1))
  if (linhas.length === 0) return undefined
  const somar = (campo: string) =>
    linhas.reduce((total, linha) => {
      const achado = new RegExp(`${campo}=(\\d+)`).exec(linha)
      return total + (achado ? Number(achado[1]) : 0)
    }, 0)
  return {
    identificar: Math.round(somar('identificar_ms') / linhas.length),
    gravar: Math.round(somar('gravar_ms') / linhas.length),
    tela: Math.round(somar('tela_ms') / linhas.length),
  }
}
