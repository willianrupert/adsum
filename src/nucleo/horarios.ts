// Os horários do CIn, e a grade como o professor a enxerga.
//
// A grade nasceu como três campos nos Ajustes — dia, início, fim — e ninguém
// preenche três campos cinco vezes. O professor não pensa "quarta, 13h, 14h50";
// ele olha a semana e aponta onde a turma cai, que é como o horário chega até
// ele em qualquer mural da universidade.
//
// Os blocos são os do CIn, e vêm em pares porque aula de 4h ocupa dois seguidos.
// Quem tiver horário fora deles continua com os campos livres nos Ajustes: esta
// tela cobre o caso comum sem impedir o incomum.

export interface Bloco {
  inicio: string
  fim: string
  /** Manhã, tarde ou noite. Só para separar visualmente, como num mural. */
  turno: 'manha' | 'tarde' | 'noite'
}

export const BLOCOS: Bloco[] = [
  { inicio: '08:00', fim: '09:50', turno: 'manha' },
  { inicio: '10:00', fim: '11:50', turno: 'manha' },
  { inicio: '13:00', fim: '14:50', turno: 'tarde' },
  { inicio: '15:00', fim: '16:50', turno: 'tarde' },
  { inicio: '17:00', fim: '18:50', turno: 'tarde' },
  { inicio: '19:00', fim: '20:50', turno: 'noite' },
]

/** Segunda a sexta. Sábado existe na universidade, e não na grade de ninguém. */
export const DIAS_UTEIS = [1, 2, 3, 4, 5]

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
 * O que já está na grade, na forma que a tela usa.
 *
 * Aula fora dos blocos do CIn **não aparece marcada** e é preciso dizer isso
 * junto: ela continua valendo, continua abrindo a chamada, e some da tela só
 * porque não há quadradinho para ela. Quem editar aqui e salvar perde essa aula
 * — por isso a tela avisa quando encontra uma.
 */
export function marcadosDe(
  aulas: { dia: number; inicio: string }[],
): { marcados: Set<string>; foraDosBlocos: number } {
  const conhecidos = new Set(BLOCOS.map((b) => b.inicio))
  const marcados = new Set<string>()
  let foraDosBlocos = 0

  for (const aula of aulas) {
    if (conhecidos.has(aula.inicio) && DIAS_UTEIS.includes(aula.dia)) {
      marcados.add(chaveDoBloco(aula.dia, aula.inicio))
    } else {
      foraDosBlocos++
    }
  }
  return { marcados, foraDosBlocos }
}

/** Quantas horas por semana os blocos escolhidos somam. */
export function horasPorSemana(marcados: ReadonlySet<string>): number {
  return [...marcados].reduce((total, chave) => {
    const { inicio } = deChave(chave)
    const bloco = BLOCOS.find((b) => b.inicio === inicio)
    if (!bloco) return total
    const [hi, mi] = bloco.inicio.split(':').map(Number)
    const [hf, mf] = bloco.fim.split(':').map(Number)
    return total + (hf * 60 + mf - (hi * 60 + mi)) / 60
  }, 0)
}
