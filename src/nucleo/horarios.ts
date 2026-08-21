// Os horários do CIn, e a grade como o professor a enxerga.
//
// A grade nasceu como três campos nos Ajustes — dia, início, fim — e ninguém
// preenche três campos cinco vezes. O professor não pensa "quarta, 13h, 14h50";
// ele olha a semana e aponta onde a turma cai, que é como o horário chega até
// ele em qualquer mural da universidade.
//
// Os blocos são os do CIn, **lidos das grades de horário reais** que o autor
// mandou, e corrigidos por ele onde eu li errado.
//
// O que mudou, e por quê:
//
//   - a noite não é 19:00–20:50: são 17:00–18:50 e 18:50–20:30, encostados;
//   - **12:00–12:50 existe**, e é o único bloco de 50 minutos. Passou por uma
//     ida e volta: eu o li nas capturas, o autor achou que era almoço, foi
//     conferir e confirmou que algumas turmas têm aula aí;
//   - **sábado existe**, com dois blocos longos que não aparecem em dia útil
//     nenhum: 07:00–11:50 e 13:00–17:50.
//
// Aula de 4h ocupa dois blocos, e é por isso que a tela é de marcar vários.
// Quem tiver horário fora deles continua com os campos livres nos Ajustes: esta
// tela cobre o caso comum sem impedir o incomum.

export interface Bloco {
  inicio: string
  fim: string
  /** Só para separar visualmente, como num mural. */
  turno: 'manha' | 'tarde' | 'noite' | 'sabado'
  /** Bloco que só existe no sábado. Ver `BLOCOS`. */
  soSabado?: boolean
}

export const BLOCOS: Bloco[] = [
  { inicio: '08:00', fim: '09:50', turno: 'manha' },
  { inicio: '10:00', fim: '11:50', turno: 'manha' },
  // Meio-dia existe, e é o único bloco de 50 minutos — um crédito só. Eu o li
  // nas capturas, o autor achou que era almoço, conferiu e confirmou que
  // algumas turmas têm aula aí. Fica, e desenhado mais baixo que os outros.
  { inicio: '12:00', fim: '12:50', turno: 'manha' },
  { inicio: '13:00', fim: '14:50', turno: 'tarde' },
  { inicio: '15:00', fim: '16:50', turno: 'tarde' },
  { inicio: '17:00', fim: '18:50', turno: 'noite' },
  // Encosta no anterior: um termina 18:50 e o outro começa 18:50, sem intervalo.
  // Não é engano de digitação, é como a grade do CIn é — e tem consequência,
  // documentada em `grade.ts`.
  { inicio: '18:50', fim: '20:30', turno: 'noite' },
  // Sábado tem blocos próprios e longos, e só existem lá. Aparecem como linha
  // com uma célula só, na coluna do sábado — desenhar cinco quadradinhos mortos
  // de segunda a sexta seria oferecer o que não existe.
  { inicio: '07:00', fim: '11:50', turno: 'sabado', soSabado: true },
  { inicio: '13:00', fim: '17:50', turno: 'sabado', soSabado: true },
]

/**
 * Segunda a sábado.
 *
 * O sábado entrou em 20/08/2026: eu tinha escrito que ele "existe na
 * universidade e não na grade de ninguém", e o autor mandou a grade com
 * `sáb. 07:00-11:50` e `sáb. 13:00-17:50`. Existe, e com blocos próprios.
 */
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
  const marcados = new Set<string>()
  let foraDosBlocos = 0

  // O par **dia e hora** precisa existir, não só a hora: sábado tem blocos que
  // dia útil não tem, e vice-versa. Checar só o horário marcaria uma aula de
  // sábado às 08:00 numa célula que a tela não desenha, e ela sumiria calada.
  const existe = (dia: number, inicio: string) =>
    BLOCOS.some((b) => b.inicio === inicio && (b.soSabado ? dia === 6 : dia !== 6))

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

/** Minutos de um bloco. O de meio-dia tem 50; os outros, 100 ou 110. */
export function duracaoEmMinutos(bloco: Bloco): number {
  const [hi, mi] = bloco.inicio.split(':').map(Number)
  const [hf, mf] = bloco.fim.split(':').map(Number)
  return hf * 60 + mf - (hi * 60 + mi)
}

/**
 * Bloco curto é o de meio-dia. A tela o desenha mais baixo, porque um
 * quadradinho do mesmo tamanho para 50 e para 110 minutos mente sobre a
 * duração — e é justamente esse bloco que o professor esquece que existe.
 */
export function ehCurto(bloco: Bloco): boolean {
  return duracaoEmMinutos(bloco) < 60
}

/**
 * "Tudo pronto" fora do horário de aula soa a convite pro crachá, quando não
 * há aula nenhuma por perto. Fora de uma próxima aula conhecida, o repouso
 * cumprimenta em vez de anunciar — mesmo sem grade nenhuma cadastrada, porque
 * a hora do dia continua sendo a hora do dia.
 */
export function saudacao(agora: Date): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = agora.getHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}
