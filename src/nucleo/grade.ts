// A grade horária: que aula está acontecendo agora, e qual vem depois. O
// repouso usa isso para sugerir a turma; a chamada nunca abre sozinha.

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

/** Tolerância em volta da aula: chegar às 7h52 para a aula das 8h é o normal. */
export const FOLGA_MIN = 20

/**
 * Os blocos da noite são encostados (17:00–18:50 e 18:50–20:30): com a folga,
 * das 18:30 às 19:10 os dois estão "agora". Quem dá as duas, com turmas
 * diferentes, não recebe sugestão nessa faixa: entre duas plausíveis, o app
 * não adivinha. Diminuir a folga criaria o caso pior de não achar aula nenhuma.
 */

export interface Aula {
  uidHashProfessor: string
  dia: number
  inicio: string
  fim: string
  turma: string
}

/** As aulas daquele professor acontecendo agora, com a folga. */
export function aulasAgora(aulas: Aula[], uidHashProfessor: string, agora: Date): Aula[] {
  return aulasAgoraDeQualquer(aulas, [uidHashProfessor], agora)
}

/** `aulasAgora` sobre vários professores: a base pode ter mais de um vínculo de professor. */
export function aulasAgoraDeQualquer(
  aulas: Aula[],
  uidHashesProfessores: string[],
  agora: Date,
): Aula[] {
  const hashes = new Set(uidHashesProfessores)
  const minuto = agora.getHours() * 60 + agora.getMinutes()
  return aulas.filter(
    (a) =>
      hashes.has(a.uidHashProfessor) &&
      a.dia === agora.getDay() &&
      minuto >= emMinutos(a.inicio) - FOLGA_MIN &&
      minuto <= emMinutos(a.fim) + FOLGA_MIN,
  )
}

/** Início da janela de hoje, já com a folga. É o marco de "esta aula". */
export function inicioDaJanela(aula: Aula, agora: Date): Date {
  const marco = new Date(agora)
  marco.setHours(0, emMinutos(aula.inicio) - FOLGA_MIN, 0, 0)
  return marco
}

/**
 * A turma que a grade diz que tem aula agora, se não houver dúvida.
 *
 * Desde 17/09/2026 a grade não abre a chamada: sugere a turma no repouso e
 * acende o ponto azul. As três recusas continuam:
 *
 * 1. **Só com aula na grade.** Sem o atalho "só existe uma turma", que vale
 *    para um clique, não para o relógio.
 * 2. **Só sem dúvida.** Duas aulas ao mesmo tempo: nenhuma.
 * 3. **Não a que acabou de ser encerrada.** `encerradas` é turma → quando do
 *    último encerramento; fica fora do log, que não distingue abrir de
 *    encerrar.
 */
export function turmaDeAgora(
  aulas: Aula[],
  uidHashProfessor: string,
  agora: Date,
  encerradas: Record<string, string> = {},
): string | undefined {
  return turmaDeAgoraEntreProfessores(aulas, [uidHashProfessor], agora, encerradas)
}

/**
 * `turmaDeAgora` sobre a grade de todos os professores da base. Duas turmas
 * agora, de professores diferentes, é dúvida: nenhuma. Duas linhas da mesma
 * turma (um bloco duplo) não são dúvida.
 */
export function turmaDeAgoraEntreProfessores(
  aulas: Aula[],
  uidHashesProfessores: string[],
  agora: Date,
  encerradas: Record<string, string> = {},
): string | undefined {
  const agora_ = aulasAgoraDeQualquer(aulas, uidHashesProfessores, agora)
  const turmas = [...new Set(agora_.map((a) => a.turma))]
  if (turmas.length !== 1) return undefined

  const aula = agora_.find((a) => a.turma === turmas[0])!
  const encerrada = encerradas[aula.turma]
  if (encerrada && Date.parse(encerrada) >= inicioDaJanela(aula, agora).getTime()) {
    return undefined
  }
  return aula.turma
}

/**
 * A próxima aula daquele professor, a partir de agora. É o que o repouso
 * sugere quando nenhuma turma tem aula neste momento.
 *
 * Procura nos sete dias seguintes e devolve a primeira: a semana fecha o ciclo,
 * então não existe grade cadastrada cuja próxima aula esteja além disso.
 */
export function proximaAula(
  aulas: Aula[],
  uidHashProfessor: string,
  agora: Date,
): { aula: Aula; quando: Date } | undefined {
  const minhas = aulas.filter((a) => a.uidHashProfessor === uidHashProfessor)
  if (minhas.length === 0) return undefined

  let melhor: { aula: Aula; quando: Date } | undefined

  for (const aula of minhas) {
    for (let adiante = 0; adiante < 8; adiante++) {
      const dia = new Date(agora)
      dia.setDate(dia.getDate() + adiante)
      if (dia.getDay() !== aula.dia) continue

      const quando = new Date(dia)
      quando.setHours(0, emMinutos(aula.inicio), 0, 0)
      // Pelo fim, não pelo início: uma aula em andamento ainda é a de hoje.
      const fim = new Date(dia)
      fim.setHours(0, emMinutos(aula.fim), 0, 0)
      if (fim.getTime() <= agora.getTime()) continue

      if (!melhor || quando.getTime() < melhor.quando.getTime()) melhor = { aula, quando }
      break
    }
  }

  return melhor
}

/** `proximaAula` sobre vários professores: a mais cedo entre todos. */
export function proximaAulaDeQualquer(
  aulas: Aula[],
  uidHashesProfessores: string[],
  agora: Date,
): { aula: Aula; quando: Date } | undefined {
  let melhor: { aula: Aula; quando: Date } | undefined
  for (const hash of uidHashesProfessores) {
    const candidata = proximaAula(aulas, hash, agora)
    if (candidata && (!melhor || candidata.quando.getTime() < melhor.quando.getTime())) {
      melhor = candidata
    }
  }
  return melhor
}
