// Tipos do domínio. Espelham o firmware do Adsum A1 — ver `Adsum/docs/02` e
// `Adsum/docs/04`. Onde houver divergência entre este arquivo e o firmware,
// o firmware está certo: ele é quem grava o CSV que a planilha consome.

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
  /** Nome exibido, já encurtado para caber na tela. Não é o nome de registro. */
  nome: string
  /**
   * Login do CIn. É o identificador estável da pessoa — nome muda com casamento
   * e correção de cadastro, login não — e é por ele que a planilha fecha a
   * chamada. Fica vazio quando a lista não veio do SIGAA.
   */
  login?: string
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
  login: string
  nomeCompleto: string
  /** Já encurtado e medido contra a coluna do aparelho. */
  nome: string
  papel: Papel
}

/** Uma linha da grade horária. Indexada pelo professor, porque o aparelho circula. */
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
export type Resultado = 'ok' | 'duplicado' | 'desconhecido'

/** Uma linha de `registros/<turma>.csv`. Nunca é reescrita — só acrescentada. */
export interface Evento {
  /**
   * `<aparelho>-<AAAAMMDD>-<sequência>`. Chave de idempotência: reimportar o
   * mesmo arquivo não duplica linha, e é ela que permite juntar dois arquivos
   * que a sincronização da pasta duplicou.
   */
  eventoId: string
  /** ISO 8601 com fuso. Data em formato local é como se perde uma turma. */
  quando: string
  turma: string
  uidHash: UidHash
  /**
   * Login do SIGAA, quando conhecido. O vínculo guarda só `hash → nome`, então
   * aqui costuma vir vazio — a coluna existe porque `registros.csv` do aparelho
   * a tem, e mudar a contagem de colunas quebraria a leitura pelo firmware.
   */
  login?: string
  /** Fica só aqui. O nome não trafega — a planilha resolve o hash. */
  nome: string
  origem: Origem
  resultado: Resultado
}

export interface Config {
  /** 16 bytes em hexadecimal. Sem sal, o hash é o UID com outra roupa. */
  salHex: string
  /** Entra no `eventoId`. */
  aparelhoId: string
  criadoEm: string
}
