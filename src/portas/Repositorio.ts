// Porta: onde os dados moram.
//
// Duas regras do sistema aparecem na forma desta interface, não em comentário:
//
// 1. Eventos são append-only. Não existe `atualizarEvento` nem
//    `removerEvento` — se a assinatura não existe, o bug não se escreve.
// 2. Nada aqui fala de rede. A base é local; sincronizar é assunto de outra
//    camada, e nunca do caminho da leitura.

import type { Aula, Config, Evento, Matriculado, Uid, UidHash, Vinculo } from '../nucleo/tipos.ts'
import { calcularUidHash, idDoSal, saisConhecidos } from '../nucleo/hash.ts'
import { proximoEventoId, type Sessao } from '../nucleo/sessao.ts'

export interface DiagnosticoRepositorio {
  nome: string
  aberto: boolean
  versao: number
  vinculos: number
  professores: number
  aulas: number
  eventos: number
  matriculados: number
  turmas: number
  /** Bytes estimados pelo navegador, quando ele conta. */
  usoEstimado?: number
  cotaEstimada?: number
  /** Armazenamento persistente concedido — sem isso o navegador pode apagar tudo. */
  persistente: boolean
}

export interface Repositorio {
  readonly nome: string

  abrir(): Promise<void>
  fechar(): Promise<void>

  lerConfig(): Promise<Config>
  /**
   * Troca o sal atual. **O anterior não se perde**: vai para
   * `saisAnteriores`, e os crachás cadastrados nele continuam reconhecidos.
   */
  definirSal(salHex: string): Promise<void>
  /** Acrescenta sais ao chaveiro sem trocar o atual. Repetido não duplica. */
  lembrarSais(sais: string[]): Promise<void>
  definirInstalacaoId(id: string): Promise<void>
  /**
   * Marca até onde a turma já foi exportada. Sem isto o app não distingue uma
   * base inteira salva de uma aula inteira por salvar, e não tem como cobrar.
   */
  marcarExportado(turma: string, ate: string): Promise<void>

  vinculoPorHash(uidHash: UidHash): Promise<Vinculo | undefined>
  listarVinculos(): Promise<Vinculo[]>
  gravarVinculo(vinculo: Vinculo): Promise<void>
  removerVinculo(uidHash: UidHash): Promise<void>
  zerarVinculos(): Promise<void>

  /** Substitui a lista da turma inteira — reimportar corrige, não duplica. */
  salvarTurma(turma: string, pessoas: Matriculado[]): Promise<void>
  listarMatriculados(turma?: string): Promise<Matriculado[]>
  listarTurmas(): Promise<string[]>
  zerarTurma(turma: string): Promise<void>

  listarAulas(): Promise<Aula[]>
  gravarAula(aula: Aula): Promise<void>
  /**
   * Troca o horário de uma turma. A grade é intenção, não registro: pode ser
   * reescrita, ao contrário dos eventos.
   */
  definirHorarioDaTurma(turma: string, aulas: Aula[]): Promise<void>
  zerarAulas(): Promise<void>

  /** A chamada aberta, se houver. Estado mutável, por isso fora do log. */
  sessaoAberta(): Promise<Sessao | undefined>
  abrirSessao(sessao: Sessao): Promise<void>
  encerrarSessao(): Promise<void>

  /**
   * Reserva o próximo número de `evento_id`, para sempre. Dois pedidos nunca
   * devolvem o mesmo número, nem em duas abas: ver `Config.proximaSequencia`.
   */
  reservarSequencia(): Promise<number>
  /** Empurra o contador para cima de um número já usado (log trazido de fora). */
  garantirSequenciaAcimaDe(numero: number): Promise<void>

  /**
   * Único caminho de escrita de evento. `eventoId` repetido não grava e
   * devolve `false` — é a idempotência de reler um arquivo. Evento **novo**
   * não chama isto direto: passa por `gravarEventoNovo`, que não aceita o
   * `false` como resposta.
   */
  acrescentarEvento(evento: Evento): Promise<boolean>
  /**
   * Mais recentes primeiro. Com `turma`, usa o índice: no caminho de cada
   * crachá, nunca ler a base inteira.
   */
  listarEventos(opcoes?: { turma?: string; limite?: number }): Promise<Evento[]>
  contarEventos(): Promise<number>

  /**
   * A pasta escolhida, se houver. Guardar o handle é o que dispensa reescolher
   * a cada sessão — e perdê-lo (ao limpar dados do site) **não** apaga a pasta.
   */
  lerPasta(): Promise<FileSystemDirectoryHandle | undefined>
  guardarPasta(handle: FileSystemDirectoryHandle): Promise<void>
  esquecerPasta(): Promise<void>

  /** Apaga o cache local. A pasta, se houver, continua onde está. */
  esvaziarCache(): Promise<void>

  diagnostico(): Promise<DiagnosticoRepositorio>
}

/** Com número reservado, bater nisto é defeito grave, não fila longa. */
const TENTATIVAS_DE_ID = 100

/**
 * O único caminho para gravar um evento novo.
 *
 * O número vem de `reservarSequencia`, que nunca devolve o mesmo duas vezes.
 * Se o `add` ainda assim recusar (um log de fora com id desta instalação),
 * tenta o próximo; sem id livre, lança: gravação que falha tem que aparecer.
 * Contar eventos para numerar fez a base recusar calada metade de uma chamada
 * em 22/09/2026 (`docs/06_falhas_em_sala.md`).
 */
export async function gravarEventoNovo(
  repositorio: Repositorio,
  instalacaoId: string,
  cunhadoEm: Date,
  montar: (eventoId: string) => Evento,
  /** Cada id que já existia. Normal é nunca chamar; chamar sempre é defeito. */
  aoColidir?: (eventoId: string) => void,
): Promise<Evento> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_ID; tentativa++) {
    const evento = montar(proximoEventoId(instalacaoId, cunhadoEm, await repositorio.reservarSequencia()))
    if (await repositorio.acrescentarEvento(evento)) return evento
    aoColidir?.(evento.eventoId)
  }
  throw new Error('Nenhum evento_id livre para gravar o evento. Nada foi salvo.')
}

/**
 * De quem é este crachá, procurando em **todos** os sais do chaveiro.
 *
 * Devolve o hash do sal em que o vínculo foi achado, ou o do sal atual (onde
 * nasce um cadastro novo). `sal` é 0 para o atual e maior para um do chaveiro.
 */
export async function identificarCracha(
  repositorio: Repositorio,
  uid: Uid,
): Promise<{ uidHash: UidHash; vinculo?: Vinculo; sal?: number }> {
  // Da base a cada crachá, nunca de cópia da tela (17/09/2026). É cache no adaptador.
  const sais = saisConhecidos(await repositorio.lerConfig())
  const doAtual = await calcularUidHash(sais[0], uid)
  for (const [i, sal] of sais.entries()) {
    const uidHash = i === 0 ? doAtual : await calcularUidHash(sal, uid)
    const vinculo = await repositorio.vinculoPorHash(uidHash)
    if (!vinculo) continue
    if (!vinculo.salId) marcarDepois(repositorio, uidHash, sal)
    return { uidHash, vinculo, sal: i }
  }
  return { uidHash: doAtual }
}

/**
 * A marca de sal (`salId`) de vínculos antigos nunca é gravada no meio da
 * fila: serve ao Diagnóstico, não à chamada. Fica em memória e vai num lote,
 * com o navegador ocioso ou ao fim da chamada.
 */
const marcasPendentes = new Map<UidHash, { repositorio: Repositorio; sal: string }>()
let ociosoAgendado = false

function marcarDepois(repositorio: Repositorio, uidHash: UidHash, sal: string): void {
  marcasPendentes.set(uidHash, { repositorio, sal })
  if (ociosoAgendado || typeof requestIdleCallback !== 'function') return
  ociosoAgendado = true
  requestIdleCallback(() => {
    ociosoAgendado = false
    void gravarMarcasPendentes()
  })
}

export async function gravarMarcasPendentes(): Promise<void> {
  const lote = [...marcasPendentes]
  marcasPendentes.clear()
  for (const [uidHash, { repositorio, sal }] of lote) {
    // Relido agora: a marca não pode desfazer uma renomeação ou remoção.
    try {
      const atual = await repositorio.vinculoPorHash(uidHash)
      if (atual && !atual.salId) await repositorio.gravarVinculo({ ...atual, salId: await idDoSal(sal) })
    } catch {
      // Base fechada ou trocada no meio: a marca volta na próxima leitura.
    }
  }
}

/**
 * Crachás que dependem de um sal que este navegador não tem. Só conta quem tem
 * `salId`: vínculo antigo ainda não lido não tem como ser conferido.
 */
export async function vinculosSemSal(
  repositorio: Repositorio,
  config: Pick<Config, 'salHex' | 'saisAnteriores'>,
): Promise<Vinculo[]> {
  const conhecidos = new Set(await Promise.all(saisConhecidos(config).map(idDoSal)))
  return (await repositorio.listarVinculos()).filter(
    (v) => !v.sintetico && v.salId !== undefined && !conhecidos.has(v.salId),
  )
}

/**
 * Repositório que sabe se apagar por inteiro. Fica fora da porta pelo mesmo
 * motivo que `LeitorSimulavel`: é ferramenta de diagnóstico, não de operação.
 */
export interface RepositorioApagavel extends Repositorio {
  apagarTudo(): Promise<void>
}

export function podeApagar(repositorio: Repositorio): repositorio is RepositorioApagavel {
  return (
    'apagarTudo' in repositorio &&
    typeof (repositorio as RepositorioApagavel).apagarTudo === 'function'
  )
}
