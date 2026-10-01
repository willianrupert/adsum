// Tipos do domínio.

/** UID do crachá. Campo de tamanho variável — 4, 7 ou 10 bytes. */
export type Uid = Uint8Array

/** Primeiros 8 bytes de SHA-256(sal ‖ uid), em hexadecimal minúsculo. */
export type UidHash = string

/** Todo mundo entra como aluno; professor é um toque explícito. */
export type Papel = 'aluno' | 'professor'

export interface Vinculo {
  uidHash: UidHash
  papel: Papel
  /** Nome exibido, já encurtado. Não é o nome de registro. */
  nome: string
  /** O identificador da pessoa. Vazio para docente, que não tem na página do SIGAA. */
  matricula?: string
  /** Quando o crachá foi encostado. É o timestamp do vínculo. */
  criadoEm: string
  /**
   * Vínculo de professor sem crachá: `uidHash` sorteado, para o botão abrir a
   * chamada sem o crachá dele (`garantirProfessor`). A marca o distingue de um
   * crachá lido; para todo o resto, é um vínculo como os outros.
   */
  sintetico?: boolean
  /**
   * Impressão do sal em que o crachá foi cadastrado (`idDoSal`), não o sal.
   * Diz ao Diagnóstico quantos vínculos dependem de um sal ausente. Vínculos
   * anteriores a 22/09/2026 ganham na primeira leitura.
   */
  salId?: string
}

/**
 * Uma pessoa na lista de uma turma, como o SIGAA entregou. Separado de
 * `Vinculo`: um diz quem está na turma, o outro qual crachá é de quem. Uma
 * pessoa pode estar em duas turmas com um crachá, ou ter dois crachás.
 */
export interface Matriculado {
  /** Como o professor chama a turma. `IF685 · T01`. */
  turma: string
  /** Matrícula quando existe, nome em minúsculas quando não — docente não tem. */
  chave: string
  matricula: string
  nomeCompleto: string
  /** Já encurtado para leitura de relance. */
  nome: string
  papel: Papel
}

/** Uma linha da grade horária, indexada pelo professor. */
export interface Aula {
  id?: number
  uidHashProfessor: UidHash
  /** 0 = domingo … 6 = sábado. */
  dia: number
  /** `hh:mm`. */
  inicio: string
  /** `hh:mm`. */
  fim: string
  turma: string
}

export type Origem = 'cracha' | 'professor' | 'manual'
/**
 * `rapido_demais` (20/08/2026): dois crachás quase juntos. `removido`
 * (11/09/2026): "Não presente" à mão. `outra_turma` (01/10/2026): aluno
 * cadastrado em outra turma, que fica no log e não conta presença. Arquivos
 * antigos não têm os três.
 */
export type Resultado = 'ok' | 'duplicado' | 'desconhecido' | 'rapido_demais' | 'removido' | 'outra_turma'

/** Uma linha de `registros/<turma>.csv`. Nunca é reescrita — só acrescentada. */
export interface Evento {
  /** `<instalação>-<AAAAMMDD>-<sequência>`. Chave de idempotência. */
  eventoId: string
  /** ISO 8601 com fuso. Data em formato local é como se perde uma turma. */
  quando: string
  turma: string
  uidHash: UidHash
  /** Matrícula, preenchida na saída a partir do vínculo. */
  matricula?: string
  /** Fica só aqui. O nome não trafega — a planilha resolve o hash. */
  nome: string
  origem: Origem
  resultado: Resultado
}

export interface Config {
  /** 16 bytes em hexadecimal. Sem sal, o hash é o UID com outra roupa. */
  salHex: string
  /**
   * O chaveiro: todo sal que esta instalação já usou ou recebeu, fora o
   * atual. Nunca aparece na tela e nunca é apagado; `identificarCracha`
   * procura o crachá em todos. Ver `docs/01_cofre.md`.
   */
  saisAnteriores?: string[]
  /** Distingue esta instalação de outra. Entra no `eventoId`. */
  instalacaoId: string
  /**
   * O próximo número de `evento_id` desta instalação. Só anda para frente,
   * reservado em transação (`reservarSequencia`): nem duas abas pegam o mesmo.
   */
  proximaSequencia?: number
  criadoEm: string
  /** Turma → `quando` do último evento exportado. Só sem pasta. Ver `nucleo/pendencias.ts`. */
  exportado?: Record<string, string>
}
