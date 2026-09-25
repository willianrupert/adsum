// A rota é o estado: a tela decorre do que existe na base, e o professor
// nunca escolhe onde está. Função pura, para a regra ser testável.
//
// A ordem das perguntas é a regra: problema, pasta, navegador, turma, grade,
// leitor, chamada, e só então o repouso.

export type Rota =
  /** Falta peça essencial do navegador, ou não há leitor lendo. */
  | 'problema'
  /** Falta escolher onde guardar. Enquanto isso, a base pode ser perdida. */
  | 'pasta'
  /** Navegador sem pasta: há um arranjo melhor, e ele precisa ser dito. */
  | 'navegador'
  /** Nenhuma turma cadastrada: a tela é colar a lista do SIGAA. */
  | 'turma'
  /** Turma sem horário: a tela é a semana, para apontar onde ela cai. */
  | 'cronograma'
  /** Nenhum professor com crachá: abre a chamada sozinho, com o vínculo sintético. */
  | 'cerimonia'
  /** Chamada aberta: presença e cadastro na mesma tela. */
  | 'chamada'
  /** O repouso: a turma e o dia da próxima chamada. */
  | 'pronto'

/** Ver `ambiente/pasta.ts`. `indisponivel` = navegador sem seletor de pasta. */
export type EstadoDaPasta = 'indisponivel' | 'sem_pasta' | 'sem_permissao' | 'ligada'

export interface EstadoDoApp {
  ambienteQuebrado: boolean
  pasta: EstadoDaPasta
  lendo: boolean
  turmas: number
  pendentes: number
  chamadaAberta: boolean
  /**
   * Navegador sem seletor de pasta, e o professor ainda não dispensou o
   * conselho. Ver `ambiente/instalacao.ts` — o que dizer muda por navegador.
   */
  conselharNavegador: boolean
  /** Turma cadastrada e sem horário, que o professor ainda não adiou. */
  turmaSemHorario?: string
  /** O professor disse "sigo sem pasta". Ver o comentário em `decidirRota`. */
  pastaDispensada: boolean
  /** Nenhum professor tem vínculo ainda. */
  professorSemCracha: boolean
  /** "Cadastro fica pra depois." Nenhuma tela grava mais esta marca. */
  cadastroDispensado: boolean
}

export function decidirRota(estado: EstadoDoApp): Rota {
  if (estado.ambienteQuebrado) return 'problema'

  // A pasta antes de tudo o que grava. Com saída (`pastaDispensada`): uma
  // tela sem saída é pior que a garantia que ela protege.
  if (
    !estado.pastaDispensada &&
    (estado.pasta === 'sem_pasta' || estado.pasta === 'sem_permissao')
  ) {
    return 'pasta'
  }

  // "Onde isto vive" vem antes de existir base: o app instalado não enxerga a
  // turma cadastrada na aba.
  if (estado.conselharNavegador) return 'navegador'

  if (estado.turmas === 0) return 'turma'

  // Depois da turma (a grade fala de uma) e antes do leitor (não depende dele).
  if (estado.turmaSemHorario) return 'cronograma'

  if (!estado.lendo) return 'problema'
  if (estado.chamadaAberta) return 'chamada'

  // Sem nenhum professor, a casca abre a chamada sozinha: o cadastro de todos
  // acontece dentro dela, e o botão cria um vínculo sintético de professor.
  if (estado.professorSemCracha && !estado.cadastroDispensado) return 'cerimonia'
  return 'pronto'
}
