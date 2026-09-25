// Os horários do CIn, e a grade como o professor a enxerga: a semana
// desenhada, marcada com toques, em vez de campos de dia e hora.
//
// Dois catálogos, lidos das grades reais do CIn. A grade simplificada tem os
// blocos de aula dupla de segunda a sexta. A completa tem os períodos de
// 50 min, inclusive o meio-dia e o sábado. Os dois produzem a mesma `Aula`.
// A noite é 17:00–18:50 e 18:50–20:30, encostados (a consequência está em
// `grade.ts`).

export interface Bloco {
  inicio: string
  fim: string
  /** Só para separar visualmente, como num mural. */
  turno: 'manha' | 'tarde' | 'noite'
  /** Dias da semana em que o período existe: 1 (segunda) a 6 (sábado). */
  dias: number[]
}

/** Segunda a sexta. */
const SEG_A_SEX = [1, 2, 3, 4, 5]

/** Segunda a sábado. */
const SEG_A_SAB = [1, 2, 3, 4, 5, 6]

export const BLOCOS: Bloco[] = [
  { inicio: '08:00', fim: '09:50', turno: 'manha', dias: SEG_A_SEX },
  { inicio: '10:00', fim: '11:50', turno: 'manha', dias: SEG_A_SEX },
  // O meio-dia (12:00–12:50) está só na completa, por decisão do autor.
  { inicio: '13:00', fim: '14:50', turno: 'tarde', dias: SEG_A_SEX },
  { inicio: '15:00', fim: '16:50', turno: 'tarde', dias: SEG_A_SEX },
  { inicio: '17:00', fim: '18:50', turno: 'noite', dias: SEG_A_SEX },
  // Encostado no anterior, sem intervalo: é como a grade do CIn é.
  { inicio: '18:50', fim: '20:30', turno: 'noite', dias: SEG_A_SEX },
  // Sem sábado: ele está na completa, e a coluna some da simplificada.
]

/**
 * A grade completa: períodos de 50 min com 10 de intervalo, a única forma de
 * marcar metade de uma aula dupla.
 *
 * **O par da noite, 18:50–19:40 e 19:40–20:30, é inferido**, não conferido
 * contra a grade oficial: é o corte mais consistente com o resto, sem
 * intervalo, como o bloco 18:50–20:30 que ele divide.
 */
export const BLOCOS_COMPLETOS: Bloco[] = [
  // Só sábado.
  { inicio: '07:00', fim: '07:50', turno: 'manha', dias: [6] },
  { inicio: '08:00', fim: '08:50', turno: 'manha', dias: SEG_A_SAB },
  { inicio: '09:00', fim: '09:50', turno: 'manha', dias: SEG_A_SAB },
  { inicio: '10:00', fim: '10:50', turno: 'manha', dias: SEG_A_SAB },
  { inicio: '11:00', fim: '11:50', turno: 'manha', dias: SEG_A_SAB },
  { inicio: '12:00', fim: '12:50', turno: 'manha', dias: SEG_A_SEX },
  { inicio: '13:00', fim: '13:50', turno: 'tarde', dias: SEG_A_SAB },
  { inicio: '14:00', fim: '14:50', turno: 'tarde', dias: SEG_A_SAB },
  { inicio: '15:00', fim: '15:50', turno: 'tarde', dias: SEG_A_SAB },
  { inicio: '16:00', fim: '16:50', turno: 'tarde', dias: SEG_A_SAB },
  { inicio: '17:00', fim: '17:50', turno: 'noite', dias: SEG_A_SAB },
  // Daqui em diante, só de segunda a sexta.
  { inicio: '18:00', fim: '18:50', turno: 'noite', dias: SEG_A_SEX },
  // Inferidos: ver acima.
  { inicio: '18:50', fim: '19:40', turno: 'noite', dias: SEG_A_SEX },
  { inicio: '19:40', fim: '20:30', turno: 'noite', dias: SEG_A_SEX },
]

/** Os dias que a grade desenha: segunda a sábado. */
export const DIAS_UTEIS = [1, 2, 3, 4, 5, 6]

export const SIGLA_DO_DIA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

/** `dia-inicio`, para o conjunto de escolhidos não guardar objeto. */
export function chaveDoBloco(dia: number, inicio: string): string {
  return `${dia}-${inicio}`
}

export interface Escolha {
  dia: number
  inicio: string
}

export function deChave(chave: string): Escolha {
  const [dia, inicio] = chave.split('-')
  return { dia: Number(dia), inicio }
}

/**
 * O que já está na grade, na forma que a tela usa. Aula que não cai em
 * nenhum bloco não aparece marcada: continua valendo, e a tela avisa, porque
 * salvar por cima a perderia.
 */
export function marcadosDe(
  aulas: { dia: number; inicio: string }[],
  blocos: Bloco[],
): { marcados: Set<string>; foraDosBlocos: number } {
  const marcados = new Set<string>()
  let foraDosBlocos = 0

  // O par dia e hora, não só a hora: senão uma aula num período que aquele
  // dia não tem seria marcada numa célula que a tela não desenha.
  const existe = (dia: number, inicio: string) =>
    blocos.some((b) => b.inicio === inicio && b.dias.includes(dia))

  for (const aula of aulas) {
    if (DIAS_UTEIS.includes(aula.dia) && existe(aula.dia, aula.inicio)) {
      marcados.add(chaveDoBloco(aula.dia, aula.inicio))
    } else {
      foraDosBlocos++
    }
  }
  return { marcados, foraDosBlocos }
}

/** Quantas horas por semana os blocos escolhidos somam. */
export function horasPorSemana(marcados: ReadonlySet<string>, blocos: Bloco[]): number {
  return [...marcados].reduce((total, chave) => {
    const { inicio } = deChave(chave)
    const bloco = blocos.find((b) => b.inicio === inicio)
    if (!bloco) return total
    const [hi, mi] = bloco.inicio.split(':').map(Number)
    const [hf, mf] = bloco.fim.split(':').map(Number)
    return total + (hf * 60 + mf - (hi * 60 + mi)) / 60
  }, 0)
}

/** Minutos de um bloco. */
export function duracaoEmMinutos(bloco: Bloco): number {
  const [hi, mi] = bloco.inicio.split(':').map(Number)
  const [hf, mf] = bloco.fim.split(':').map(Number)
  return hf * 60 + mf - (hi * 60 + mi)
}

/** Bloco de menos de uma hora: a tela o desenha mais baixo, para não mentir a duração. */
export function ehCurto(bloco: Bloco): boolean {
  return duracaoEmMinutos(bloco) < 60
}

/** A saudação do repouso, pela hora do dia. */
export function saudacao(agora: Date): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = agora.getHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}
