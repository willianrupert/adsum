// A chamada aberta, em funções puras: dado o estado e um crachá, o que fazer.
// A tela só desenha o que estas funções decidem. Ver `docs/10_codigo.md`.

import type { Evento, Matriculado, Papel, Vinculo } from './tipos.ts'

/**
 * Quem ainda não tem crachá. Pela matrícula, ou pelo nome para quem não tem
 * (docente). Sem filtrar papel: um segundo docente sem crachá é pendente.
 */
export function quemFalta(matriculados: Matriculado[], vinculos: Vinculo[]): Matriculado[] {
  const porMatricula = new Set(vinculos.map((v) => v.matricula).filter(Boolean))
  const porNome = new Set(vinculos.map((v) => v.nome))
  return matriculados.filter((m) => (m.matricula ? !porMatricula.has(m.matricula) : !porNome.has(m.nome)))
}

/**
 * Depois de abrir, o crachá do professor só encerra passado este tempo: dois
 * toques do mesmo gesto não fecham a aula que acabou de abrir.
 */
export const JANELA_MINIMA_MS = 10_000

/**
 * Intervalo mínimo entre crachás **diferentes**, contra dois cartões na mesma
 * mão. Abaixo dele, a leitura vira `rapido_demais` e a tela avisa.
 *
 * É um alarme, não uma trava: dois cartões mantidos juntos fazem o leitor
 * alternar, e parte das alternâncias passa do limite (medido em 23/09/2026).
 * Não distingue fraude de fila apressada, nem pega quem encosta com calma o
 * crachá de um colega. Quem julga é o professor. Ver `docs/10_codigo.md`.
 */
export const INTERVALO_MINIMO_MS = 400

export interface EstatisticaDeIntervalos {
  minimoMs: number
  maximoMs: number
  medioMs: number
  amostras: number
}

/**
 * Mínimo, máximo e média dos intervalos entre crachás aceitos de pessoas
 * diferentes numa chamada: o dado que calibra `INTERVALO_MINIMO_MS`.
 */
export function estatisticaDeIntervalos(intervalos: number[]): EstatisticaDeIntervalos | undefined {
  if (intervalos.length === 0) return undefined
  return {
    minimoMs: Math.min(...intervalos),
    maximoMs: Math.max(...intervalos),
    medioMs: Math.round(intervalos.reduce((soma, ms) => soma + ms, 0) / intervalos.length),
    amostras: intervalos.length,
  }
}

export interface Sessao {
  turma: string
  abertaEm: string
  /** Quem abriu. Só o crachá dele encerra. */
  uidHashProfessor: string
}

export type Decisao =
  /** `vinculo` é de quem abriu: dá nome à linha de abertura no log. */
  | { tipo: 'abrir'; turma: string; vinculo?: Vinculo }
  /** Crachá novo com um nome chamado: cadastra **e** conta presença. */
  | { tipo: 'cadastro'; pessoa: Matriculado }
  | { tipo: 'encerrar'; vinculo?: Vinculo }
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
   * Quem está chamado. Só existe por gesto explícito do professor ("Chamar",
   * as setas), nunca preenchido pela tela sozinha: é isso que torna seguro
   * cadastrar sem perguntar.
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
 * O do professor abre e encerra, e nunca conta presença. Desconhecido não
 * interrompe a fila.
 */
export function decidir(uidHash: string, ctx: Contexto): Decisao {
  const { sessao, vinculo, jaPresentes, agora } = ctx

  if (vinculo?.papel === ('professor' satisfies Papel)) {
    if (!sessao) {
      if (!ctx.turmaSugerida) return { tipo: 'sem_turma' }
      return { tipo: 'abrir', turma: ctx.turmaSugerida, vinculo }
    }
    const decorrido = agora.getTime() - Date.parse(sessao.abertaEm)
    if (decorrido < JANELA_MINIMA_MS) {
      return { tipo: 'cedo_demais', faltamMs: JANELA_MINIMA_MS - decorrido }
    }
    return { tipo: 'encerrar', vinculo }
  }

  // Dois crachás diferentes quase juntos: uma mão com dois cartões. Depois do
  // professor, cujo crachá não é o vetor da fraude. O mesmo crachá duas vezes
  // é `repetido`, logo abaixo.
  if (ctx.ultima && ctx.ultima.uidHash !== uidHash) {
    const desde = agora.getTime() - ctx.ultima.em.getTime()
    // Negativo é ordem de processamento, não dois cartões: nunca é recusa.
    if (desde >= 0 && desde < INTERVALO_MINIMO_MS) {
      return { tipo: 'rapido_demais', faltamMs: INTERVALO_MINIMO_MS - desde }
    }
  }

  // Desconhecido com alguém chamado é cadastro: o professor está olhando a
  // pessoa encostar. Sem ninguém chamado, é a busca.
  if (!vinculo) return ctx.chamado ? { tipo: 'cadastro', pessoa: ctx.chamado } : { tipo: 'desconhecido' }
  if (jaPresentes.has(uidHash)) return { tipo: 'repetido', vinculo }
  return { tipo: 'presenca', vinculo }
}

/**
 * Se a decisão soma à contagem. O cadastro do próprio crachá do professor
 * passa por `cadastro`, como o de um aluno, e não conta.
 */
export function contaPresenca(decisao: Decisao): boolean {
  if (decisao.tipo === 'presenca') return true
  if (decisao.tipo === 'cadastro') return decisao.pessoa.papel !== 'professor'
  return false
}

/**
 * Silêncio do leitor que já soa suspeito. O dongle é teclado: puxar o cabo
 * não dispara evento, então o app só pode notar o silêncio e perguntar.
 */
export const SILENCIO_SUSPEITO_MS = 3 * 60_000

/** Só com gente ainda sem crachá: com todos vinculados, silêncio é o normal. */
export function leitorSuspeito(agora: Date, ultimaAtividadeEm: Date, pendentes: number): boolean {
  return pendentes > 0 && agora.getTime() - ultimaAtividadeEm.getTime() > SILENCIO_SUSPEITO_MS
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
    // Com o nome de quem abriu ou fechou, quando se sabe.
    case 'abrir':
    case 'encerrar':
      return {
        ...base,
        nome: decisao.vinculo?.nome ?? '',
        matricula: decisao.vinculo?.matricula,
        origem: 'professor',
        resultado: 'ok',
      }
    // A recusa fica no log, com o hash: dá para conferir depois de quem era.
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
