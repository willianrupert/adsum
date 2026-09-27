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

export type MotivoDeBloqueio = 'trancado' | 'matriculadoDepois' | 'feriado' | 'cancelada'

export type Celula =
  | { tipo: 'vazia' }
  | { tipo: 'lancada'; faltas: number }
  | { tipo: 'bloqueada'; motivo: MotivoDeBloqueio }

export interface ColunaDia {
  indice: number
  dia: Dia
  /** Faltas de quem não veio. Sem ele, o dia não é preenchido: nunca se adivinha. */
  maximo?: number
  marca?: 'lancado' | 'feriado' | 'cancelada'
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
  acao: 'conferencia' | 'preenchimento' | 'desfeito' | 'aceite'
  versaoSigaa: string
  dia: Dia
  matricula: string
  /** Como a célula estava: `''` vazia, o número lançado, ou o motivo do bloqueio. */
  lido: string
  /** O que o Adsum diria, `''` se nada. */
  proposto: string
  /** O que ficou na célula depois da ação, `''` se ela não mudou. */
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
  motivo: 'semColuna' | 'feriado' | 'cancelada'
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
}
