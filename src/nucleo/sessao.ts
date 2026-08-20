// A aula acontecendo.
//
// Tudo aqui é função pura: dado o estado da sessão e um crachá, o que fazer.
// A tela só desenha o que estas funções decidem — assim a regra que importa
// (quem conta presença, quem não conta, quando a aula pode fechar) fica onde
// dá para testar, e não dentro de um manipulador de clique.

import type { Evento, Matriculado, Papel, Vinculo } from './tipos.ts'

/**
 * Janela mínima antes de aceitar o fechamento.
 *
 * O professor encosta duas vezes sem querer com facilidade — e sem esta janela
 * a segunda leitura encerra a aula que a primeira acabou de abrir, na frente da
 * turma.
 *
 * Dez segundos: o suficiente para separar dois toques do mesmo gesto, e pouco
 * o bastante para não atrapalhar quem precisa reabrir a aula por engano de
 * verdade. Sessenta era proteção contra um problema que dura dois.
 */
export const JANELA_MINIMA_MS = 10_000

/**
 * Intervalo mínimo entre **crachás diferentes**.
 *
 * Pedido pelo Prof. Paulo: impedir que alguém encoste dois crachás de uma vez —
 * o seu e o de um colega ausente — passando os dois como se fossem duas
 * pessoas.
 *
 * **Este número ainda não foi medido, e é preciso dizer isso.** Começou em um
 * segundo, por estimativa minha de que "duas pessoas numa fila levam segundos".
 * O autor, que já viu a fila, corrigiu: no fim da aula todo mundo quer sair, as
 * pessoas se encavalam no leitor, e um segundo trava justamente o momento de
 * maior pressa. Estimativa contra observação, a observação ganha.
 *
 * 400 ms é o novo palpite, e a escolha é assimétrica de propósito:
 *
 * - **Errar bloqueando** custa um toque a mais. O cartão ainda está na mão, a
 *   tela diz o motivo, a pessoa encosta de novo. Segundos de vida.
 * - **Errar deixando passar** grava presença de quem não estava.
 *
 * Como o custo de bloquear é pequeno, vale bloquear cedo — mas não tão cedo que
 * a fila sinta. Dois cartões na mesma mão dependem do ciclo de varredura do
 * leitor, tipicamente 200 a 500 ms; uma pessoa trocando de lugar com outra
 * precisa mover o braço.
 *
 * **O jeito certo de acertar isto é medir**, e a tela de diagnóstico passou a
 * mostrar o intervalo entre leituras justamente para isso: com o dongle na mão e
 * uma fila de verdade, dá para ler os números e trocar o palpite por dado.
 *
 * **O que a regra não faz, e precisa estar dito:** ela não distingue fraude de
 * fila apressada, e não pega o caso mais comum — alguém encostar o crachá de um
 * colega ausente sozinho, com calma. Nenhuma regra de tempo pega isso. O que ela
 * faz é recusar o padrão fisicamente implausível e **dizer em voz alta**, para o
 * professor, que está na sala, olhar. Julgar é dele.
 *
 * Recusar em silêncio seria pior que não ter regra: a presença sumiria sem
 * ninguém saber por quê.
 */
export const INTERVALO_MINIMO_MS = 400

export interface Sessao {
  turma: string
  abertaEm: string
  /** Quem abriu. Só o crachá dele encerra. */
  uidHashProfessor: string
}

export type Decisao =
  | { tipo: 'abrir'; turma: string }
  /** Crachá novo com um nome chamado: cadastra **e** conta presença. */
  | { tipo: 'cadastro'; pessoa: Matriculado }
  | { tipo: 'encerrar' }
  | { tipo: 'cedo_demais'; faltamMs: number }
  | { tipo: 'presenca'; vinculo: Vinculo }
  | { tipo: 'repetido'; vinculo: Vinculo }
  | { tipo: 'desconhecido' }
  /** Dois crachás diferentes quase juntos. Ver `INTERVALO_MINIMO_MS`. */
  | { tipo: 'rapido_demais'; faltamMs: number }
  | { tipo: 'sem_turma' }

export interface Contexto {
  sessao?: Sessao
  vinculo?: Vinculo
  /**
   * Quem está chamado na fila de cadastro, se houver.
   *
   * É o que faz a cerimônia e a chamada serem a mesma coisa: quem encosta o
   * crachá para se cadastrar já está presente naquela aula, e separar as duas
   * obrigaria a turma a passar duas vezes.
   */
  chamado?: Matriculado
  /** `uid_hash` de quem já foi registrado nesta sessão. */
  jaPresentes: ReadonlySet<string>
  /** A última leitura aceita, para separar dois crachás de um gesto só. */
  ultima?: { uidHash: string; em: Date }
  turmaSugerida?: string
  agora: Date
}

/**
 * O que fazer com um crachá encostado.
 *
 * Crachá de professor abre e encerra, e **nunca conta presença** — sem isso ele
 * marcaria presença para si mesmo e a aula nunca abriria. Crachá desconhecido
 * não interrompe nada: vira linha vermelha e a fila continua.
 */
export function decidir(uidHash: string, ctx: Contexto): Decisao {
  const { sessao, vinculo, jaPresentes, agora } = ctx

  if (vinculo?.papel === ('professor' satisfies Papel)) {
    if (!sessao) {
      if (!ctx.turmaSugerida) return { tipo: 'sem_turma' }
      return { tipo: 'abrir', turma: ctx.turmaSugerida }
    }
    const decorrido = agora.getTime() - Date.parse(sessao.abertaEm)
    if (decorrido < JANELA_MINIMA_MS) {
      return { tipo: 'cedo_demais', faltamMs: JANELA_MINIMA_MS - decorrido }
    }
    return { tipo: 'encerrar' }
  }

  // Dois crachás diferentes quase juntos não são duas pessoas — é uma mão com
  // dois cartões. Vem depois do professor de propósito: bloquear quem abre e
  // encerra a aula seria atrapalhar sem proteger nada, porque o crachá dele não
  // é o vetor da fraude.
  //
  // Encostar **o mesmo** crachá duas vezes segue sendo `repetido`, que é outro
  // assunto e já tem resposta.
  if (ctx.ultima && ctx.ultima.uidHash !== uidHash) {
    const desde = agora.getTime() - ctx.ultima.em.getTime()
    if (desde < INTERVALO_MINIMO_MS) {
      return { tipo: 'rapido_demais', faltamMs: INTERVALO_MINIMO_MS - desde }
    }
  }

  // Crachá desconhecido com nome chamado é cadastro. A garantia contra trocar
  // aluno continua sendo a de sempre: existe **um só** nome chamado por vez, e
  // ele está grande na tela para a pessoa conferir antes de encostar.
  if (!vinculo) return ctx.chamado ? { tipo: 'cadastro', pessoa: ctx.chamado } : { tipo: 'desconhecido' }
  if (jaPresentes.has(uidHash)) return { tipo: 'repetido', vinculo }
  return { tipo: 'presenca', vinculo }
}

/** `<origem>-<AAAAMMDD>-<sequência>` — ver `docs/02_formato.md`. */
export function proximoEventoId(instalacaoId: string, quando: Date, sequencia: number): string {
  const dia = quando.toISOString().slice(0, 10).replace(/-/g, '')
  return `${instalacaoId}-${dia}-${String(sequencia).padStart(4, '0')}`
}

export function eventoDe(
  decisao: Decisao,
  dados: { eventoId: string; quando: Date; turma: string; uidHash: string },
): Evento | undefined {
  const base = {
    eventoId: dados.eventoId,
    quando: dados.quando.toISOString(),
    turma: dados.turma,
    uidHash: dados.uidHash,
  }

  switch (decisao.tipo) {
    case 'abrir':
    case 'encerrar':
      return { ...base, nome: '', origem: 'professor', resultado: 'ok' }
    // Fica no log: o professor pode ter olhado para a turma na hora em que a
    // tela avisou, e no fim da aula ele merece poder conferir que houve
    // tentativa — com o hash do crachá recusado, que é o que permite descobrir
    // de quem era.
    case 'rapido_demais':
      return { ...base, nome: '', origem: 'cracha', resultado: 'rapido_demais' }
    case 'presenca':
      return {
        ...base,
        nome: decisao.vinculo.nome,
        matricula: decisao.vinculo.matricula,
        origem: 'cracha',
        resultado: 'ok',
      }
    case 'cadastro':
      return {
        ...base,
        nome: decisao.pessoa.nome,
        matricula: decisao.pessoa.matricula,
        origem: 'cracha',
        resultado: 'ok',
      }
    case 'repetido':
      return {
        ...base,
        nome: decisao.vinculo.nome,
        matricula: decisao.vinculo.matricula,
        origem: 'cracha',
        resultado: 'duplicado',
      }
    case 'desconhecido':
      return { ...base, nome: '', origem: 'cracha', resultado: 'desconhecido' }
    // Recusa não vira linha: nada aconteceu, e o log não registra intenção.
    default:
      return undefined
  }
}
