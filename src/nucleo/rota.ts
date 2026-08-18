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
  /** Nenhuma turma cadastrada: a tela é colar a lista do SIGAA. */
  | 'turma'
  /** Há gente sem crachá: a tela é a cerimônia. */
  | 'cerimonia'
  /** Tudo vinculado: a tela é a espera do próximo crachá. */
  | 'pronto'

export interface EstadoDoApp {
  ambienteQuebrado: boolean
  lendo: boolean
  turmas: number
  pendentes: number
}

export function decidirRota(estado: EstadoDoApp): Rota {
  if (estado.ambienteQuebrado) return 'problema'
  if (estado.turmas === 0) return 'turma'
  if (!estado.lendo) return 'problema'
  if (estado.pendentes > 0) return 'cerimonia'
  return 'pronto'
}
