// Porta: onde os dados moram.
//
// Duas regras do sistema aparecem na forma desta interface, não em comentário:
//
// 1. Eventos são append-only. Não existe `atualizarEvento` nem
//    `removerEvento` — se a assinatura não existe, o bug não se escreve.
// 2. Nada aqui fala de rede. A base é local; sincronizar é assunto de outra
//    camada, e nunca do caminho da leitura.

import type { Aula, Config, Evento, Matriculado, UidHash, Vinculo } from '../nucleo/tipos.ts'
import type { Sessao } from '../nucleo/sessao.ts'

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
  definirSal(salHex: string): Promise<void>
  definirAparelhoId(id: string): Promise<void>

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
  zerarAulas(): Promise<void>

  /**
   * A aula acontecendo, se houver. Fica fora do log de propósito: "está aberta
   * agora" é estado mutável, e o log só guarda o que aconteceu.
   */
  sessaoAberta(): Promise<Sessao | undefined>
  abrirSessao(sessao: Sessao): Promise<void>
  encerrarSessao(): Promise<void>

  /** Único caminho de escrita de evento. Rejeita `eventoId` repetido. */
  acrescentarEvento(evento: Evento): Promise<void>
  /** Mais recentes primeiro. Sem limite, devolve tudo. */
  listarEventos(limite?: number): Promise<Evento[]>
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
