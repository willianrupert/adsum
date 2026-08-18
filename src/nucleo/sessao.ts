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
 */
export const JANELA_MINIMA_MS = 60_000

export interface Sessao {
  turma: string
  abertaEm: string
  /** Quem abriu. Só o crachá dele encerra. */
  uidHashProfessor: string
}

export type Decisao =
  | { tipo: 'abrir'; turma: string }
  /** Crachá novo com um nome armado: cadastra **e** conta presença. */
  | { tipo: 'cadastro'; pessoa: Matriculado }
  | { tipo: 'encerrar' }
  | { tipo: 'cedo_demais'; faltamMs: number }
  | { tipo: 'presenca'; vinculo: Vinculo }
  | { tipo: 'repetido'; vinculo: Vinculo }
  | { tipo: 'desconhecido' }
  | { tipo: 'sem_turma' }

export interface Contexto {
  sessao?: Sessao
  vinculo?: Vinculo
  /**
   * Quem está armado na fila de cadastro, se houver.
   *
   * É o que faz a cerimônia e a chamada serem a mesma coisa: quem encosta o
   * crachá para se cadastrar já está presente naquela aula, e separar as duas
   * obrigaria a turma a passar duas vezes.
   */
  armado?: Matriculado
  /** `uid_hash` de quem já foi registrado nesta sessão. */
  jaPresentes: ReadonlySet<string>
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

  // Crachá desconhecido com nome armado é cadastro. A garantia contra trocar
  // aluno continua sendo a de sempre: existe **um só** nome armado por vez, e
  // ele está grande na tela para a pessoa conferir antes de encostar.
  if (!vinculo) return ctx.armado ? { tipo: 'cadastro', pessoa: ctx.armado } : { tipo: 'desconhecido' }
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
