// Lançar no SIGAA: o contrato entre a página e o Adsum (`docs/08`, camada 0).
//
// Tudo o que vem depois (conciliação, plano, folha) conversa por estes tipos,
// nunca pela página. Estado impossível não é representável: não há célula
// bloqueada com valor, nem coluna sem data. E não há nome em lugar nenhum:
// a matrícula basta, e os nomes o Adsum já tem.

declare const marcaDeDia: unique symbol

/** `AAAA-MM-DD` de um dia que existe. Só nasce por `comoDia`. */
export type Dia = string & { readonly [marcaDeDia]: true }

export function comoDia(texto: string): Dia | undefined {
  const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!achado) return undefined
  const [ano, mes, dia] = achado.slice(1).map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
    ? (texto as Dia)
    : undefined
}

/**
 * Por que a página não aceita valor na célula. Os quatro últimos vieram da
 * planilha real (`docs/12`): aula suspensa, aluno bloqueado, e as travas da
 * própria página contra data futura e fora do período letivo.
 */
export type MotivoDeBloqueio =
  | 'trancado'
  | 'matriculadoDepois'
  | 'feriado'
  | 'cancelada'
  | 'suspensa'
  | 'bloqueado'
  | 'futura'
  | 'foraDoPeriodo'

export type Celula =
  | { tipo: 'vazia' }
  | { tipo: 'lancada'; faltas: number }
  | { tipo: 'bloqueada'; motivo: MotivoDeBloqueio }

export interface ColunaDia {
  indice: number
  dia: Dia
  /** Faltas de quem não veio. Sem ele, o dia não é preenchido: nunca se adivinha. */
  maximo?: number
  marca?: 'lancado' | 'feriado' | 'cancelada' | 'suspensa'
}

export interface LinhaAluno {
  indice: number
  matricula: string
  /** Uma por coluna, na mesma ordem. */
  celulas: Celula[]
}

export interface LeituraPlanilha {
  /** Um por clique no favorito: amarra o plano à leitura de que ele saiu. */
  id: string
  versaoSigaa: string
  /** Como a página escreve: `CIN0144 - … - Turma: 01 (2026.2)`. */
  cabecalhoTurma: string
  colunas: ColunaDia[]
  linhas: LinhaAluno[]
}

/**
 * A chamada de um dia vai para a aula de outro dia no SIGAA: o professor deu
 * a aula em outra data, e decide em qual aula da planilha ela entra. `para`
 * igual a `de` desfaz. Mora na auditoria (`remanejo`), que volta da pasta.
 */
export interface RemanejoSigaa {
  turma: string
  /** O dia da chamada no Adsum. */
  de: Dia
  /** O dia da aula no SIGAA. */
  para: Dia
  em: string
}

/** "O professor decidiu diferente": nasce de "Aceitar o SIGAA". Só acréscimo. */
export interface AjusteSigaa {
  turma: string
  dia: Dia
  matricula: string
  valor: number
  em: string
}

/**
 * Uma linha de `sigaa/<turma>.csv`: cada célula tocada ou divergente, em cada
 * conferência, preenchimento e aceite. Sem nome. Só acréscimo.
 */
export interface LinhaDeAuditoria {
  turma: string
  quando: string
  acao: 'conferencia' | 'preenchimento' | 'desfeito' | 'aceite' | 'remanejo'
  versaoSigaa: string
  dia: Dia
  matricula: string
  /** Como a célula estava: `''` vazia, o número lançado, ou o motivo do bloqueio. */
  lido: string
  /** O que o Adsum diria, `''` se nada. */
  proposto: string
  /**
   * O que ficou valendo: na célula (preencher, desfazer) ou, no aceite, o
   * valor que o professor aceitou, e de onde o ajuste volta. `''` se nada mudou.
   */
  aplicado: string
}

/** Escrever `valor` na célula, só se ela ainda estiver vazia. */
export interface Instrucao {
  linha: number
  coluna: number
  antes: 'vazia'
  valor: number
}

interface Posicao {
  linha: number
  coluna: number
  matricula: string
  dia: Dia
}

/** Cada célula da página cai em exatamente uma destas (`docs/08`, camada 2). */
export type Conciliada =
  | (Posicao & { categoria: 'fora' })
  | (Posicao & { categoria: 'aLancar'; esperado: number })
  | (Posicao & { categoria: 'soNoSigaa'; sigaa: number })
  | (Posicao & { categoria: 'confere'; valor: number; ajustada: boolean })
  | (Posicao & { categoria: 'diverge'; sigaa: number; esperado: number })

export type Categoria = Conciliada['categoria']

/** Chamada do Adsum que não tem onde entrar na página. */
export interface SemOndeLancar {
  dia: Dia
  motivo: 'semColuna' | 'feriado' | 'cancelada' | 'suspensa' | 'foraDoPeriodo'
  /** Os alunos da página nessa chamada: é o que o professor vê para decidir onde ela entra. */
  presentes: number
  faltas: number
}

export interface Relatorio {
  turma: string
  celulas: Conciliada[]
  /** Matrícula da página que não está na turma do Adsum. */
  semParSigaa: string[]
  /** Matriculado do Adsum sem linha na página. */
  semParAdsum: string[]
  semOndeLancar: SemOndeLancar[]
  /** Dias com o que lançar, mas sem máximo legível: nenhuma instrução sai deles. */
  semMaximo: Dia[]
  /**
   * Células vazias em aula que o SIGAA já tem como lançada: a aula é do
   * professor, e o Adsum não acrescenta nela. Na planilha real, são os alunos
   * que entraram na turma depois daquelas aulas (`docs/12`).
   */
  vaziasEmAulaLancada: { dia: Dia; quantas: number }[]
  /** Chamadas que o professor mandou para a aula de outro dia, e valem nesta página. */
  remanejadas: { de: Dia; para: Dia }[]
  /**
   * Aulas da página que podem receber a chamada de outro dia: sem chamada
   * própria nem remanejada, não lançadas, fora de feriado, cancelada e
   * suspensa, com máximo e com alguma célula que aceita valor.
   */
  aulasSemChamada: Dia[]
  /** Quanto vale a falta em cada aula com chamada: 1 até o máximo da coluna (`docs/13`). */
  valorDaFalta: { dia: Dia; valor: number; maximo: number }[]
}
