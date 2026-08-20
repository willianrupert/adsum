// Tipos do domínio.

/** UID do crachá. Campo de tamanho variável — 4, 7 ou 10 bytes. */
export type Uid = Uint8Array

/** Primeiros 8 bytes de SHA-256(sal ‖ uid), em hexadecimal minúsculo. */
export type UidHash = string

/**
 * Papel exige escolha explícita: sem ele, uma hora o professor é vinculado
 * como aluno e ninguém percebe até a sessão não abrir na frente da turma.
 */
export type Papel = 'aluno' | 'professor'

export interface Vinculo {
  uidHash: UidHash
  papel: Papel
  /** Nome exibido, já encurtado. Não é o nome de registro. */
  nome: string
  /**
   * Matrícula. É o identificador da pessoa na instituição, e é por ele que a
   * planilha fecha a chamada. Fica vazio para quem não tem matrícula na página
   * (docente) ou quando a lista não veio do SIGAA.
   */
  matricula?: string
  /** Quando o crachá foi encostado. É o timestamp do vínculo. */
  criadoEm: string
}

/**
 * Uma pessoa na lista de uma turma, como o SIGAA entregou.
 *
 * Existe separado de `Vinculo` porque são coisas diferentes: matrícula diz
 * **quem está na turma**, vínculo diz **qual crachá é de quem**. Uma pessoa
 * pode estar em duas turmas com um crachá só, e pode ter dois crachás numa
 * turma só. Misturar os dois obrigaria a escolher qual dessas verdades perder.
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
 * `rapido_demais` entrou em 20/08/2026 com a regra do intervalo mínimo. Arquivo
 * antigo nunca contém o valor, então ler o passado continua funcionando.
 */
export type Resultado = 'ok' | 'duplicado' | 'desconhecido' | 'rapido_demais'

/** Uma linha de `registros/<turma>.csv`. Nunca é reescrita — só acrescentada. */
export interface Evento {
  /**
   * `<instalação>-<AAAAMMDD>-<sequência>`. Chave de idempotência: reimportar o
   * mesmo arquivo não duplica linha, e é ela que permite juntar dois arquivos
   * que a sincronização da pasta duplicou.
   */
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
  /** Distingue esta instalação de outra. Entra no `eventoId`. */
  instalacaoId: string
  criadoEm: string
  /**
   * Turma → `quando` do último evento já exportado. Só faz sentido onde não há
   * pasta: com pasta, cada evento é gravado no ato e nada fica pendente.
   * Ver `nucleo/pendencias.ts`.
   */
  exportado?: Record<string, string>
}
