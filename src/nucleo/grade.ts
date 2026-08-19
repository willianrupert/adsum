// Grade horária: pequena o bastante para não merecer arquivo próprio, e
// específica o bastante para não caber em `tipos.ts`.

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function horaValida(hhmm: string): boolean {
  const casou = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!casou) return false
  return Number(casou[1]) <= 23 && Number(casou[2]) <= 59
}

export function normalizarHora(hhmm: string): string {
  const [h, m] = hhmm.trim().split(':')
  return `${h.padStart(2, '0')}:${m}`
}

/** Minutos desde a meia-noite, para comparar horários sem fuso no meio. */
export function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Tolerância em volta da aula.
 *
 * O professor chega antes e sai depois; abrir a chamada às 7h52 para uma aula
 * de 8h é o caso normal, não a exceção. Sem folga, o crachá dele não acharia
 * aula nenhuma justamente na hora em que ele mais quer que ache.
 */
export const FOLGA_MIN = 20

export interface Aula {
  uidHashProfessor: string
  dia: number
  inicio: string
  fim: string
  turma: string
}

/** As aulas daquele professor acontecendo agora, com a folga. */
export function aulasAgora(aulas: Aula[], uidHashProfessor: string, agora: Date): Aula[] {
  const minuto = agora.getHours() * 60 + agora.getMinutes()
  return aulas.filter(
    (a) =>
      a.uidHashProfessor === uidHashProfessor &&
      a.dia === agora.getDay() &&
      minuto >= emMinutos(a.inicio) - FOLGA_MIN &&
      minuto <= emMinutos(a.fim) + FOLGA_MIN,
  )
}

export type Escolha =
  | { tipo: 'abrir'; turma: string }
  | { tipo: 'perguntar'; opcoes: string[]; motivo: 'nenhuma' | 'varias' }
  | { tipo: 'sem_turma' }

/**
 * Que turma abrir quando o professor encosta o crachá.
 *
 * A regra é a de sempre: **nunca perguntar o que dá para saber**. Havendo
 * exatamente uma aula agora, abre — e o professor não toca na tela. Havendo
 * duas, perguntar é respeito, não incômodo. Havendo nenhuma na grade (feriado,
 * reposição, grade não cadastrada), a pergunta cai sobre todas as turmas, que é
 * a degradação natural — e se só existe uma turma, nem isso é preciso.
 */
export function escolherTurma(
  aulas: Aula[],
  turmas: string[],
  uidHashProfessor: string,
  agora: Date,
): Escolha {
  const agora_ = aulasAgora(aulas, uidHashProfessor, agora)
  const daGrade = [...new Set(agora_.map((a) => a.turma))]

  if (daGrade.length === 1) return { tipo: 'abrir', turma: daGrade[0] }
  if (daGrade.length > 1) return { tipo: 'perguntar', opcoes: daGrade, motivo: 'varias' }

  if (turmas.length === 1) return { tipo: 'abrir', turma: turmas[0] }
  if (turmas.length === 0) return { tipo: 'sem_turma' }
  return { tipo: 'perguntar', opcoes: turmas, motivo: 'nenhuma' }
}
