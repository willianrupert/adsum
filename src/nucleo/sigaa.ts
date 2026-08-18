// Leitura da página "Turma › Participantes" do SIGAA.
//
// O que se cola é a seleção do mouse sobre a página inteira, com dois blocos:
// `Docentes (N)` e `Discentes (N)`. Cada pessoa vem assim:
//
//     Usuário Off-Line no SIGAA NOME COMPLETO  (Perfil)
//     Curso: ...
//     Matrícula: ...
//     Usuário: login.do.cin
//     E-mail: ...
//
// Docente não tem `(Perfil)` nem `Matrícula:` — tem `Departamento:`. Essa
// diferença já custou um bug: um extrator que só procura `(Perfil)` descarta os
// professores em silêncio, a lista vem com 47 nomes de 49 e nada indica que
// faltam dois.
//
// Por isso o número declarado no cabeçalho é conferido contra o número extraído.
// É a única checagem que pega perda silenciosa — e perda silenciosa aqui
// significa aluno que não consegue registrar presença.

/** `Usuário Off-Line no SIGAA ` — e a variante de quem está on-line. */
const MARCA = /Usuári[oa]\s+(?:Off|On)-?\s?Line\s+no\s+SIGAA\s+/gi
/** A mesma, sem `g`, porque `test` numa regex global guarda posição. */
const TEM_MARCA = new RegExp(MARCA.source, 'i')

export interface PessoaSigaa {
  nomeCompleto: string
  /**
   * A matrícula. É o identificador que a instituição já usa e o único que faz
   * sentido levar para a chamada.
   *
   * O campo `Usuário:` da página **não é lido de propósito**: ele é o login do
   * SIGAA, credencial de acesso de outra pessoa, e não tem por que existir numa
   * base de frequência. Docente não tem matrícula na página, então a dele vem
   * vazia — quem identifica ali é o nome.
   */
  matricula: string
  /**
   * O SIGAA listou numa seção que não é a de discentes — docente, docência
   * assistida, monitoria. Dica, não papel.
   */
  docenteNoSigaa: boolean
}

export interface LeituraSigaa {
  pessoas: PessoaSigaa[]
  /** Uma entrada por cabeçalho encontrado, com o declarado e o lido. */
  secoes: Secao[]
  /** Cada motivo pelo qual algo ficou de fora, ou não bate. */
  problemas: string[]
}

/**
 * `Docentes (2)`, `Discentes (47)`, `Docência Assistida (1)`.
 *
 * A página tem mais seções do que as duas óbvias, e **quem decide o papel é a
 * seção, não os campos da pessoa**. Inferir por `Departamento:` fazia a docente
 * assistida virar docente — e aí a conferência contra `Docentes (2)` acusava um
 * erro que não existia. Reconhecer o cabeçalho genericamente também evita ter
 * que voltar aqui quando aparecer `Monitores (3)`.
 */
const CABECALHO = /^[ \t]*([\p{L}][\p{L} ]{2,40}?)[ \t]*\((\d+)\)[ \t]*$/u

export interface Secao {
  nome: string
  declarados: number
  lidos: number
}

function limparNome(bruto: string): string {
  return bruto
    .split('\n')[0]
    .replace(/\(Perfil\)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Discente é aluno; todo o resto da página é quem dá aula, de um jeito ou de outro. */
function ehDiscente(secao: string): boolean {
  return /discente/i.test(secao)
}

interface Pedaco {
  secao: string
  declarados?: number
  texto: string
}

function fatiarPorSecao(texto: string): Pedaco[] {
  const pedacos: Pedaco[] = []
  let atual: Pedaco = { secao: '', texto: '' }

  for (const linha of texto.split(/\r?\n/)) {
    const casou = CABECALHO.exec(linha)
    if (casou) {
      if (atual.texto.trim()) pedacos.push(atual)
      atual = { secao: casou[1].trim(), declarados: Number(casou[2]), texto: '' }
      continue
    }
    atual.texto += linha + '\n'
  }
  if (atual.texto.trim()) pedacos.push(atual)
  return pedacos
}

/**
 * Interpreta a colagem. Nunca lança: devolve o que entendeu e a lista do que
 * não entendeu, para que a tela possa mostrar as duas coisas.
 */
export function interpretarParticipantes(texto: string): LeituraSigaa {
  const problemas: string[] = []
  const pessoas: PessoaSigaa[] = []
  const secoes: Secao[] = []
  const vistos = new Set<string>()

  for (const pedaco of fatiarPorSecao(texto)) {
    const blocos = pedaco.texto.split(MARCA).slice(1)
    let lidos = 0

    for (const bloco of blocos) {
      const nomeCompleto = limparNome(bloco)
      const matricula = /Matr[íi]cula:\s*([^\s\t]+)/i.exec(bloco)?.[1] ?? ''

      if (!nomeCompleto) {
        problemas.push('Um bloco veio sem nome e ficou de fora.')
        continue
      }
      // Docente não tem matrícula na página, então a identidade dele é o nome.
      const chave = matricula || nomeCompleto.toLowerCase()
      if (vistos.has(chave)) {
        problemas.push(`${nomeCompleto} aparece duas vezes na colagem — só a primeira entrou.`)
        continue
      }
      vistos.add(chave)
      lidos++

      pessoas.push({
        nomeCompleto,
        matricula,
        docenteNoSigaa: pedaco.secao !== '' && !ehDiscente(pedaco.secao),
      })
    }

    if (pedaco.declarados !== undefined) {
      secoes.push({ nome: pedaco.secao, declarados: pedaco.declarados, lidos })
      if (pedaco.declarados !== lidos) {
        problemas.push(
          `A página diz ${pedaco.secao} (${pedaco.declarados}) e foram lidos ${lidos}. Faltou copiar parte da página?`,
        )
      }
    }
  }

  // Caminho de reserva: um nome por linha, sem login. Só quando a colagem não
  // tem marca de SIGAA nenhuma — se tem, e ainda assim ninguém foi lido, o
  // problema é outro, e transformar a página crua em nomes esconderia isso.
  if (pessoas.length === 0 && !TEM_MARCA.test(texto)) {
    const soltos = texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 1 && !CABECALHO.test(linha))
    if (soltos.length > 0) {
      problemas.push(
        'Isto não parece a página de participantes do SIGAA. Cada linha virou um nome, sem matrícula.',
      )
      return {
        pessoas: soltos.map((nomeCompleto) => ({
          nomeCompleto,
          matricula: '',
          docenteNoSigaa: false,
        })),
        secoes,
        problemas,
      }
    }
  }

  return { pessoas, secoes, problemas }
}
