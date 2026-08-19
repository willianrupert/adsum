// A rota é o estado.
//
// Não há menu. A tela decorre do que existe na base e de quem está lendo
// crachá — o professor nunca escolhe onde está, ele abre e já está no lugar
// certo. Isto é função pura de propósito: qual tela mostrar é regra de
// domínio, testável, e não uma decisão espalhada por JSX.
//
// A ordem das perguntas é a regra. Problema vem antes de tudo, porque tela
// bonita sobre leitor desligado é mentira. Turma vem antes de cerimônia,
// porque não há quem armar. Cerimônia vem antes de repouso, porque crachá
// faltando é trabalho pendente, e repouso é a ausência dele.

export type Rota =
  /** Falta peça essencial do navegador, ou não há leitor lendo. */
  | 'problema'
  /** Falta escolher onde guardar. Enquanto isso, a base pode ser perdida. */
  | 'pasta'
  /** Navegador sem pasta: há um arranjo melhor, e ele precisa ser dito. */
  | 'navegador'
  /** Nenhuma turma cadastrada: a tela é colar a lista do SIGAA. */
  | 'turma'
  /** Há gente sem crachá: a tela é a cerimônia. */
  | 'cerimonia'
  /** Chamada aberta: a tela é a coleta — presença e cadastro na mesma coisa. */
  | 'chamada'
  /** Tudo vinculado: a tela é a espera do próximo crachá. */
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
  /** Nenhum professor tem crachá ainda. É o único caso que exige cerimônia. */
  professorSemCracha: boolean
}

export function decidirRota(estado: EstadoDoApp): Rota {
  if (estado.ambienteQuebrado) return 'problema'

  // Escolher a pasta vem antes de tudo o que grava. Onde o navegador não
  // oferece seletor, seguir é a única opção — e aí a tela da base é que precisa
  // dizer que os dados não estão seguros, em vez de fingir que estão.
  if (estado.pasta === 'sem_pasta' || estado.pasta === 'sem_permissao') return 'pasta'

  // Mesmo lugar da pasta, e pelo mesmo motivo: é a pergunta "onde isto vive",
  // e ela vem antes de existir base. Depois seria tarde — o app instalado tem
  // armazenamento próprio e não enxerga a turma que ficou na aba, e trocar de
  // navegador com a turma cadastrada faz recomeçar do zero.
  if (estado.conselharNavegador) return 'navegador'

  if (estado.turmas === 0) return 'turma'
  if (!estado.lendo) return 'problema'
  if (estado.chamadaAberta) return 'chamada'

  // A cerimônia sobrou para uma coisa só: dar o primeiro crachá ao professor.
  // Sem ele a aula não abre, e é dentro da aula que todo o resto se cadastra —
  // quem encosta para se cadastrar já está presente.
  if (estado.professorSemCracha) return 'cerimonia'
  return 'pronto'
}
