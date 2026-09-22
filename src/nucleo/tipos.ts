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
  /**
   * Não veio de crachá nenhum — `uidHash` é sorteado, não lido. Existe para o
   * botão "Começar a chamada" poder abrir sem exigir o crachá físico do
   * professor primeiro (`garantirProfessor`, em `Fluxo.tsx`): a sessão
   * precisa de um `uidHash` pra saber quem pode encerrá-la, e o botão é
   * gesto explícito o bastante pra dispensar o toque.
   *
   * A marca é o que evita a leitura errada "encostei um crachá e ele tá
   * aqui, vinculado, mesmo sem eu ter feito nada": sem ela, um vínculo
   * sintético é indistinguível de um real em qualquer lugar que mostre
   * `uidHash` — mesmo formato, mesmo tamanho, nascido do mesmo sorteio de
   * bytes que o hash de verdade usa. Continua um vínculo de verdade pra
   * tudo o mais: conta presença, encerra a sessão, aparece em "Quem falta".
   */
  sintetico?: boolean
  /**
   * Impressão do sal em que este crachá foi cadastrado (`idDoSal`, em
   * `nucleo/hash.ts`) — não o sal, que não sai da config. Serve para o
   * Diagnóstico saber, sem crachá nenhum na mão, quantos vínculos dependem de
   * um sal que este navegador não tem. Vínculos de antes de 22/09/2026 não
   * têm, e ganham na primeira vez que o crachá é lido.
   */
  salId?: string
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
 * `rapido_demais` entrou em 20/08/2026 com a regra do intervalo mínimo.
 * `removido` entrou em 11/09/2026: o professor tirando à mão uma presença
 * marcada por engano (ver `nucleo/faltas.ts`). Arquivo antigo nunca contém
 * nenhum dos dois, então ler o passado continua funcionando.
 */
export type Resultado = 'ok' | 'duplicado' | 'desconhecido' | 'rapido_demais' | 'removido'

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
  /**
   * Todo sal que esta instalação já usou ou recebeu, fora o atual. Nunca
   * aparece na tela e nunca é apagado.
   *
   * Existe por causa de 17/09/2026: trocar o sal jogava o anterior fora, e com
   * ele todo crachá cadastrado naquele sal — 40 alunos e o professor, sem uma
   * linha de erro. Com o chaveiro, trocar de sal não desfaz cadastro nenhum:
   * o crachá é procurado em todos (`identificarCracha`, em
   * `portas/Repositorio.ts`). Vai junto no `config.json` do cofre.
   */
  saisAnteriores?: string[]
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
