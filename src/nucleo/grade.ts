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

/**
 * **Consequência dos blocos da noite, e ela é real.**
 *
 * No CIn o bloco das 17:00 termina 18:50 e o seguinte começa 18:50 — encostados,
 * sem intervalo. Com a folga de 20 minutos dos dois lados, das 18:30 às 19:10 os
 * dois estão "acontecendo agora".
 *
 * Para quem dá **uma** aula à noite não muda nada. Para quem dá as duas, com
 * turmas diferentes e coladas, `escolherTurma` devolve `perguntar` nessa faixa e
 * `abrirSozinho` recusa abrir — de propósito: entre duas turmas plausíveis, o
 * app não adivinha qual. O botão continua ali, e a pergunta aparece com as duas
 * opções.
 *
 * Diminuir a folga resolveria este caso e criaria outro pior: o professor que
 * chega às 12h50 para a aula de 13h não acharia aula nenhuma.
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

/**
 * A mesma conta de `aulasAgora`, olhando a grade de vários professores ao
 * mesmo tempo.
 *
 * Existe porque mais de um vínculo `papel: 'professor'` pode legitimamente
 * estar na base — mais de um docente cadastrado, ou um sintético convivendo
 * com o real por um instante — e a checagem de horário não pode enxergar só
 * o primeiro que um `.find` alcança. Ver `recontar()`, em `Fluxo.tsx`.
 */
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

/** Início da janela de hoje, já com a folga. É o marco de "esta aula". */
export function inicioDaJanela(aula: Aula, agora: Date): Date {
  const marco = new Date(agora)
  marco.setHours(0, emMinutos(aula.inicio) - FOLGA_MIN, 0, 0)
  return marco
}

/**
 * A aula que deve abrir sem ninguém pedir.
 *
 * A melhor tela é a que não pergunta nada, e a grade já sabe a hora. Com o
 * horário cadastrado, o professor entra na sala e a chamada está aberta — nem
 * clique, nem crachá.
 *
 * Três recusas, e cada uma existe por um motivo:
 *
 * 1. **Só com aula na grade.** `escolherTurma` tem a degradação de "só existe
 *    uma turma, abre essa" — boa para um gesto deliberado, péssima aqui: sem
 *    grade, ela abriria a chamada a qualquer hora que o app estivesse na tela,
 *    e presença passaria a valer no domingo à noite.
 * 2. **Só quando não há dúvida.** Duas aulas ao mesmo tempo viram pergunta no
 *    caminho do clique. Sozinho, o app não adivinha.
 * 3. **Não reabre o que foi encerrado.** Encerrar às 9h30 uma aula que vai até
 *    as 10h não pode ser desfeito pelo relógio no segundo seguinte.
 *
 * `encerradas` é turma → quando do último encerramento. Fica fora do log porque
 * o log não distingue abrir de encerrar (as duas linhas são iguais, ver
 * `eventoDe`), e mudar o formato do CSV por causa disto seria caro demais.
 */
export function abrirSozinho(
  aulas: Aula[],
  uidHashProfessor: string,
  agora: Date,
  encerradas: Record<string, string> = {},
): string | undefined {
  const agora_ = aulasAgora(aulas, uidHashProfessor, agora)
  if (agora_.length !== 1) return undefined

  const aula = agora_[0]
  const encerrada = encerradas[aula.turma]
  if (encerrada && Date.parse(encerrada) >= inicioDaJanela(aula, agora).getTime()) {
    return undefined
  }
  return aula.turma
}

/**
 * A mesma decisão de `abrirSozinho`, olhando a grade de todos os vínculos de
 * professor da base — não só de um.
 *
 * Mais de uma turma "agora" entre professores diferentes é a mesma
 * ambiguidade que `escolherTurma` resolve perguntando — só que aqui, sozinho,
 * o relógio não tem a quem perguntar: a resposta certa é não adivinhar, a
 * mesma resposta que já valia para duas aulas coladas de **um** professor só.
 * Dedup por turma, não por linha de `Aula`: duas linhas da mesma turma
 * acontecendo agora (um bloco duplo, por exemplo) não são ambiguidade
 * nenhuma.
 */
export function abrirSozinhoEntreProfessores(
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
 * A próxima aula daquele professor, a partir de agora.
 *
 * Com a grade abrindo sozinha, o repouso deixou de ser "clique aqui" e virou
 * espera — e espera sem prazo é ansiedade. Dizer qual turma vem e quando é a
 * única informação que a tela tem para dar, e é a que responde "estou no lugar
 * certo?" antes de a pessoa perguntar.
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
      // O corte é o **fim**, não o início: uma aula que já começou e ainda
      // não acabou continua sendo "a de hoje", não "a de semana que vem".
      // Comparar pelo início empurrava uma aula em andamento pra próxima
      // semana — e aí outra turma, mais distante mas ainda não começada,
      // parecia "mais próxima" do que a que está rolando agora mesmo.
      const fim = new Date(dia)
      fim.setHours(0, emMinutos(aula.fim), 0, 0)
      if (fim.getTime() <= agora.getTime()) continue

      if (!melhor || quando.getTime() < melhor.quando.getTime()) melhor = { aula, quando }
      break
    }
  }

  return melhor
}

/**
 * A próxima aula de qualquer um dos vínculos de professor — mesma ideia de
 * `proximaAula`, sem escolher um só antes de olhar a grade. A mais cedo entre
 * todos vence, sem se importar de quem é: é a mesma pergunta que o repouso
 * faz ("estou no lugar certo?"), e a resposta não muda por causa de qual
 * vínculo venceu o `.find` alfabético.
 */
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
