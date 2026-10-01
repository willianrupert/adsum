// A chamada aberta, sem tela: como ela se reconstrói do log, a memória da
// fila de crachás e o que cada decisão diz e toca. `TelaAula` chama e desenha.
// Ver `docs/10_codigo.md`.

import { diaLocal, presencasDoDia } from './faltas.ts'
import { contaPresenca, decidir, estatisticaDeIntervalos, type Decisao, type Sessao } from './sessao.ts'
import type { Evento, Matriculado, Vinculo } from './tipos.ts'

/**
 * Se o vínculo é desta pessoa: pela matrícula quando ela tem, pelo nome quando
 * não tem (docente, na página do SIGAA). É a mesma regra de `quemFalta` e de
 * `chaveDeIdentidade`, num lugar só — estava escrita à mão em três pontos da
 * tela, e um deles divergir era questão de tempo.
 */
export function ehDaPessoa(
  vinculo: Pick<Vinculo, 'matricula' | 'nome'>,
  pessoa: Pick<Matriculado, 'matricula' | 'nome'>,
): boolean {
  return pessoa.matricula ? vinculo.matricula === pessoa.matricula : vinculo.nome === pessoa.nome
}

/**
 * O vínculo de cada pessoa, achado em tempo constante.
 *
 * A tela procura o vínculo de cada linha da turma a cada render. Com `find`,
 * isso é linear por linha, e a checagem de nome repetido, que olha a turma
 * inteira para cada linha, virava cúbica: numa turma de 300, 27 milhões de
 * comparações por crachá. Mesma regra de `ehDaPessoa`, e o mesmo resultado de
 * um `find`: o primeiro vínculo da lista que casa.
 */
export function indiceDeVinculos(
  vinculos: readonly Vinculo[],
): (pessoa: Pick<Matriculado, 'matricula' | 'nome'>) => Vinculo | undefined {
  const porMatricula = new Map<string, Vinculo>()
  const porNome = new Map<string, Vinculo>()
  for (const v of vinculos) {
    if (v.matricula && !porMatricula.has(v.matricula)) porMatricula.set(v.matricula, v)
    if (!porNome.has(v.nome)) porNome.set(v.nome, v)
  }
  return (pessoa) => (pessoa.matricula ? porMatricula.get(pessoa.matricula) : porNome.get(pessoa.nome))
}

/** Uma linha da lista de leituras recentes, ao lado do contador. */
export interface LinhaDaChamada {
  chave: string
  nome: string
  /** ISO 8601. A tela formata a hora. */
  quando: string
  tom: 'ok' | 'repetido' | 'desconhecido' | 'removido'
}

export interface EstadoDaChamada {
  /** Crachás reais de aluno já aceitos hoje, por `uidHash`. É o que separa
      presença nova de "repetido" em `decidir`. */
  porCracha: Set<string>
  /** Quem está na sala, por `chaveDeIdentidade`: crachá ou presença à mão,
      com "Não presente" descontando. É o contador grande. */
  presentes: Set<string>
  /** Presença do dia por pessoa, para o botão Presente/Não presente. */
  presencasHoje: Map<string, { presente: boolean; repetido: boolean; manual: boolean }>
  /** As últimas leituras, mais recente primeiro. */
  linhas: LinhaDaChamada[]
}

const LINHAS_RECENTES = 6

/**
 * A chamada de uma turma num dia, reconstruída do log.
 *
 * **Uma chamada por turma por dia**, como no SIGAA: vale o dia inteiro, não
 * desde a abertura. Reabrir é continuar, e quem já passou é "repetido".
 *
 * `eventos` chega mais recente primeiro (`Repositorio.listarEventos`), e a
 * ordem importa: é ela que decide a presença manual mais recente e as linhas
 * do topo.
 */
export function estadoDaChamada(
  eventos: Evento[],
  vinculos: Vinculo[],
  turma: string,
  dia: string,
): EstadoDaChamada {
  const daAula = eventos.filter((e) => e.turma === turma && diaLocal(e.quando) === dia)

  // Crachá de professor nunca conta presença, nem o cadastro dele. O evento
  // não carrega `papel` (é dado da pessoa, não da chamada), então quem
  // desempata é o vínculo atual.
  const hashesDeProfessor = new Set(vinculos.filter((v) => v.papel === 'professor').map((v) => v.uidHash))

  // Só crachá real: presença manual usa `uidHashSintetico()`, sorteado a cada
  // clique, e misturar quebraria o "repetido".
  const porCracha = new Set(
    daAula
      .filter((e) => e.origem === 'cracha' && e.resultado === 'ok' && !hashesDeProfessor.has(e.uidHash))
      .map((e) => e.uidHash),
  )

  // O contador conta presença à mão também (22/09/2026: com o dongle fora, ele
  // ficava em zero a aula inteira). `presencasDoDia` e não uma união de "ok":
  // um "Não presente" depois do crachá precisa descontar, e só a regra de
  // "o mais recente vence" faz isso.
  const semCrachaDeProfessor = daAula.filter((e) => !(e.origem === 'cracha' && hashesDeProfessor.has(e.uidHash)))
  const presentes = new Set(
    [...presencasDoDia(semCrachaDeProfessor, turma, dia)].filter(([, v]) => v.presente).map(([chave]) => chave),
  )

  const linhas = daAula
    // Correção manual entra na mesma lista: ela mostra o que está acontecendo
    // agora, e uma remoção é parte disso tanto quanto um crachá aceito.
    .filter((e) => e.origem === 'cracha' || e.origem === 'manual')
    .slice(0, LINHAS_RECENTES)
    .map((e) => ({ chave: e.eventoId, nome: nomeDaLinha(e), quando: e.quando, tom: tomDaLinha(e) }))

  return { porCracha, presentes, presencasHoje: presencasDoDia(daAula, turma, dia), linhas }
}

function nomeDaLinha(e: Evento): string {
  // A recusa por dois crachás não tem nome, e "Crachá não cadastrado" ali seria
  // mentira: mandaria o professor procurar numa lista onde a pessoa pode estar.
  if (e.resultado === 'rapido_demais') return 'Dois crachás de uma vez'
  if (e.resultado === 'outra_turma') return `${e.nome}, de outra turma`
  return e.nome || 'Crachá não cadastrado'
}

function tomDaLinha(e: Evento): LinhaDaChamada['tom'] {
  // Remoção manual é vermelha como qualquer recusa: a lista mostra o estado
  // atual, não só chegadas. `rapido_demais` cai em 'desconhecido' de
  // propósito — os dois são recusa, e a lista não precisa de um terceiro
  // vermelho.
  if (e.origem === 'manual') return e.resultado === 'removido' ? 'removido' : 'ok'
  if (e.resultado === 'ok') return 'ok'
  if (e.resultado === 'duplicado') return 'repetido'
  return 'desconhecido'
}

/**
 * A memória da fila de crachás de uma chamada aberta.
 *
 * O estado do React só chega no render seguinte, e entre dois crachás pode
 * não haver render nenhum. Numa fila rápida, a segunda leitura do mesmo crachá
 * lia o conjunto desatualizado e virava presença nova; dois cartões de uma mão
 * passavam pela regra do intervalo. Por isso esta memória muda **na hora da
 * decisão**, antes de qualquer `await`, e vive fora do estado da tela.
 */
export class MemoriaDaFila {
  /** Crachás reais de aluno já aceitos nesta chamada. */
  jaPresentes = new Set<string>()
  /** A última leitura aceita de crachá de aluno. Ver `INTERVALO_MINIMO_MS`. */
  ultima: { uidHash: string; em: Date } | undefined
  /** Intervalo, em ms, de cada crachá aceito até o anterior. */
  readonly intervalos: number[] = []
  /** Aceitos cuja gravação ainda não terminou. */
  readonly #emGravacao = new Set<string>()
  /** Quando cada crachá foi aceito, num contador que só sobe. */
  readonly #aceitoEm = new Map<string, number>()
  #relogio = 0

  /** Marque antes de ler o log; passe a marca a `recomecar`. */
  marca(): number {
    return this.#relogio
  }

  /**
   * Depois de reler o log: quem o log diz que já passou, **mais** quem foi
   * aceito e o log lido ainda não podia ter — gravação em andamento, ou
   * aceito depois da `marca`. Sem isso, uma releitura que começou antes de um
   * crachá ser gravado o tirava do conjunto, e a segunda leitura dele virava
   * presença nova.
   */
  recomecar(porCracha: Set<string>, marca = this.#relogio): void {
    const juntos = new Set(porCracha)
    for (const uidHash of this.jaPresentes) {
      if (this.#emGravacao.has(uidHash) || (this.#aceitoEm.get(uidHash) ?? 0) > marca) juntos.add(uidHash)
    }
    this.jaPresentes = juntos
  }

  /** A gravação deste crachá terminou, bem ou mal. Daqui em diante, vale o log. */
  concluir(uidHash: string): void {
    this.#emGravacao.delete(uidHash)
  }

  /**
   * Decide o que fazer com um crachá e já marca o que a decisão muda.
   *
   * A recusa por intervalo **não** conta como leitura: a janela segue medida a
   * partir do último crachá aceito, e insistir depressa não a reinicia. Só
   * `presenca`/`cadastro` vira amostra de intervalo: `repetido` é o mesmo
   * crachá relido, e sem leitura anterior não há par para medir. O crachá do
   * professor não mexe na janela, que existe contra dois cartões de aluno.
   */
  decidir(
    uidHash: string,
    ctx: { sessao: Sessao; vinculo?: Vinculo; chamado?: Matriculado; outraTurma?: string; em: Date },
  ): Decisao {
    const decisao = decidir(uidHash, {
      sessao: ctx.sessao,
      vinculo: ctx.vinculo,
      chamado: ctx.chamado,
      outraTurma: ctx.outraTurma,
      jaPresentes: this.jaPresentes,
      ultima: this.ultima,
      agora: ctx.em,
    })
    if (this.ultima && (decisao.tipo === 'presenca' || decisao.tipo === 'cadastro')) {
      this.intervalos.push(ctx.em.getTime() - this.ultima.em.getTime())
    }
    if (decisao.tipo !== 'rapido_demais' && ctx.vinculo?.papel !== 'professor') {
      this.ultima = { uidHash, em: ctx.em }
    }
    if (contaPresenca(decisao)) {
      this.jaPresentes.add(uidHash)
      this.#emGravacao.add(uidHash)
      this.#aceitoEm.set(uidHash, ++this.#relogio)
    }
    return decisao
  }

  estatistica() {
    return estatisticaDeIntervalos(this.intervalos)
  }
}

/**
 * O recado que a decisão põe na tela **antes** de gravar, se houver. Só
 * pixels: a fila nunca espera o disco para ver a resposta.
 */
export function recadoAntesDeGravar(decisao: Decisao): string | undefined {
  if (decisao.tipo === 'cedo_demais') {
    return `Para encerrar, encoste de novo em ${Math.ceil(decisao.faltamMs / 1000)} s.`
  }
  // O único recado que serve ao professor e não a quem encostou: o app não
  // distingue fraude de fila apressada, mas sabe dizer que o padrão é
  // fisicamente implausível. Quem julga está na sala.
  if (decisao.tipo === 'rapido_demais') {
    return 'Dois crachás quase juntos. O segundo não foi contado. Passe um de cada vez.'
  }
  if (decisao.tipo === 'outra_turma') {
    return `${decisao.vinculo.nome} é da turma ${decisao.turma}, não desta. A presença não foi contada.`
  }
  return undefined
}

export type SomDaDecisao = 'ok' | 'repetido' | 'desconhecido' | 'encerramento'

/**
 * O que tocar **depois** de gravar, e se o recado desta leitura sai da tela.
 * O bipe significa "está salvo", não "eu ouvi". Subir é bom, descer é
 * problema (`docs/03_visual.md`).
 */
export function depoisDeGravar(
  decisao: Decisao,
  gravou: boolean,
): { som?: SomDaDecisao; limpaRecado: boolean } {
  switch (decisao.tipo) {
    case 'presenca':
    case 'cadastro':
      return { som: 'ok', limpaRecado: true }
    case 'repetido':
      return { som: 'repetido', limpaRecado: true }
    case 'desconhecido':
    case 'outra_turma':
    case 'rapido_demais':
    case 'cedo_demais':
      return { som: 'desconhecido', limpaRecado: false }
    case 'encerrar':
      return { som: 'encerramento', limpaRecado: false }
    default:
      return { som: gravou ? 'ok' : undefined, limpaRecado: false }
  }
}
