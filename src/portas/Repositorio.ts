// Porta: onde os dados moram.
//
// Duas regras do sistema aparecem na forma desta interface, não em comentário:
//
// 1. Eventos são append-only. Não existe `atualizarEvento` nem
//    `removerEvento` — se a assinatura não existe, o bug não se escreve.
// 2. Nada aqui fala de rede. A base é local; sincronizar é assunto de outra
//    camada, e nunca do caminho da leitura.

import type { Aula, Config, Evento, Matriculado, UidHash, Vinculo } from '../nucleo/tipos.ts'
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
  definirSal(salHex: string): Promise<void>
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
   * Troca o horário de **uma** turma pelo que veio.
   *
   * A grade é configuração, não log: corrigir um horário errado é o caso normal,
   * e não havia como. `zerarAulas` apagava a grade inteira, o que transformava
   * "mudei a quarta de lugar" em "recadastre tudo".
   *
   * Isto **não** contradiz a porta não ter `removerEvento`: lá o passado é
   * imutável porque é registro do que aconteceu; aqui é a intenção de quando as
   * aulas acontecem, e intenção muda.
   */
  definirHorarioDaTurma(turma: string, aulas: Aula[]): Promise<void>
  zerarAulas(): Promise<void>

  /**
   * A aula acontecendo, se houver. Fica fora do log de propósito: "está aberta
   * agora" é estado mutável, e o log só guarda o que aconteceu.
   */
  sessaoAberta(): Promise<Sessao | undefined>
  abrirSessao(sessao: Sessao): Promise<void>
  encerrarSessao(): Promise<void>

  /**
   * Único caminho de escrita de evento. `eventoId` repetido não grava e
   * devolve `false` — é a idempotência de reler um arquivo. Evento **novo**
   * não chama isto direto: passa por `gravarEventoNovo`, que não aceita o
   * `false` como resposta.
   */
  acrescentarEvento(evento: Evento): Promise<boolean>
  /**
   * Mais recentes primeiro. Sem opções, devolve tudo, de qualquer turma.
   *
   * `turma` usa o índice que o esquema já tem (`banco.ts`) em vez de ler a
   * tabela inteira pra filtrar em memória — importa a partir de algumas
   * dezenas de aulas acumuladas. Ver `docs/05_plano_execucao.md`, Fase 4,
   * item B: só passe `turma` quando a chamada é sobre uma turma só (a tela
   * de uma aula, a planilha de uma turma) — telas que legitimamente olham a
   * base inteira (Diagnóstico, pendências de exportação entre turmas)
   * continuam sem filtro.
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

/** Muito acima de qualquer aula: bater nisto é defeito, não fila longa. */
const TENTATIVAS_DE_ID = 1000

/**
 * Grava um evento que acabou de acontecer, com um `evento_id` que ainda não
 * existe na base.
 *
 * Existe por causa de 22/09/2026. Cada tela guardava o próprio contador, e
 * cada uma o começava de um lugar: `TelaAula` pela contagem **da turma**
 * (desde a Fase 4, item B), `Fluxo` pela da base inteira. Numa base com duas
 * turmas os dois cunhavam o mesmo id no mesmo dia; o `add` recusava o
 * repetido, a recusa passava por idempotência, e o evento sumia calado — o
 * bipe tocava, o nome não mudava, o contador não subia. Como o contador era
 * relido da base depois de cada evento, e o evento perdido não estava lá, o
 * id seguinte era o mesmo de novo: travava para sempre. Foi também o "apita e
 * nada acontece" de 17/09 à tarde, que se atribuiu ao foco da janela.
 *
 * A saída não é acertar o contador, é não depender dele: começa da contagem
 * da base e sobe até o `add` aceitar. O `add` do IndexedDB é atômico, então
 * duas leituras quase juntas nunca ficam com o mesmo id — a segunda só tenta
 * o próximo. Não achar id livre lança: gravação que falha tem que aparecer.
 */
export async function gravarEventoNovo(
  repositorio: Repositorio,
  instalacaoId: string,
  cunhadoEm: Date,
  montar: (eventoId: string) => Evento,
): Promise<Evento> {
  const inicio = (await repositorio.contarEventos()) + 1
  for (let n = inicio; n < inicio + TENTATIVAS_DE_ID; n++) {
    const evento = montar(proximoEventoId(instalacaoId, cunhadoEm, n))
    if (await repositorio.acrescentarEvento(evento)) return evento
  }
  throw new Error('Nenhum evento_id livre para gravar o evento. Nada foi salvo.')
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
