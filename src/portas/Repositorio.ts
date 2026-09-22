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
  /** Cada id que já existia. Normal é nunca chamar; chamar sempre é defeito. */
  aoColidir?: (eventoId: string) => void,
): Promise<Evento> {
  const inicio = (await repositorio.contarEventos()) + 1
  for (let n = inicio; n < inicio + TENTATIVAS_DE_ID; n++) {
    const evento = montar(proximoEventoId(instalacaoId, cunhadoEm, n))
    if (await repositorio.acrescentarEvento(evento)) return evento
    aoColidir?.(evento.eventoId)
  }
  throw new Error('Nenhum evento_id livre para gravar o evento. Nada foi salvo.')
}

/**
 * De quem é este crachá — procurando em **todos** os sais do chaveiro, não só
 * no atual.
 *
 * O `uidHash` devolvido é o do sal em que o vínculo foi achado, e o do sal
 * atual quando ninguém é achado (é nele que um cadastro novo nasce). Assim o
 * mesmo crachá dá sempre o mesmo hash, e a fila de "já passou" não se
 * confunde.
 *
 * Vínculo antigo, sem `salId`, ganha a marca a partir daqui — é a única hora
 * em que se sabe, com certeza, em que sal ele foi cadastrado.
 */
export async function identificarCracha(
  repositorio: Repositorio,
  uid: Uid,
): Promise<{ uidHash: UidHash; vinculo?: Vinculo; sal?: number }> {
  // Os sais vêm da base, a cada crachá, e nunca de uma cópia que a tela
  // guardou: foi uma cópia desatualizada que perdeu a turma em 17/09/2026.
  // `lerConfig` é cache no adaptador, então isto não custa uma ida ao disco.
  const sais = saisConhecidos(await repositorio.lerConfig())
  const doAtual = await calcularUidHash(sais[0], uid)
  for (const [i, sal] of sais.entries()) {
    const uidHash = i === 0 ? doAtual : await calcularUidHash(sal, uid)
    const vinculo = await repositorio.vinculoPorHash(uidHash)
    if (!vinculo) continue
    if (!vinculo.salId) marcarDepois(repositorio, uidHash, sal)
    // `sal`: 0 é o atual; maior que zero é um do chaveiro, e diz no diário
    // que o crachá só foi achado porque o sal antigo não foi jogado fora.
    return { uidHash, vinculo, sal: i }
  }
  return { uidHash: doAtual }
}

/**
 * A marca do sal nunca é gravada no meio da fila. Gravada a cada crachá, era
 * uma escrita a mais por leitura; adiada crachá a crachá, as escritas caíam
 * no meio das rajadas seguintes — o teste de 100 alunos passou a perder
 * leitura nos dois casos. Ela serve ao Diagnóstico, não à chamada: fica em
 * memória e vai num lote só, com o navegador ocioso ou quando a chamada
 * termina (`gravarMarcasPendentes`).
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
    // Relido na hora de gravar: entre a leitura e agora o vínculo pode ter
    // sido renomeado ou removido, e a marca não pode desfazer isso.
    try {
      const atual = await repositorio.vinculoPorHash(uidHash)
      if (atual && !atual.salId) await repositorio.gravarVinculo({ ...atual, salId: await idDoSal(sal) })
    } catch {
      // Base fechada ou trocada no meio: a marca volta na próxima leitura.
    }
  }
}

/**
 * Crachás que dependem de um sal que este navegador não tem.
 *
 * É o sinal que faltou em 17/09/2026: a turma inteira ficou irreconhecível e
 * nada na tela disse. Só conta quem tem `salId` — vínculo antigo ainda não
 * lido não tem como ser conferido, e contar ele seria alarme falso.
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
