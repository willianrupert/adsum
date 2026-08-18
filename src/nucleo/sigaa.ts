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

export interface PessoaSigaa {
  nomeCompleto: string
  /** O login do CIn. É o identificador estável — nome muda, login não. */
  login: string
  /** O SIGAA listou na seção de docentes. Dica, não papel. */
  docenteNoSigaa: boolean
  /**
   * O login é só dígitos, ou seja, o SIGAA caiu na matrícula (ou no CPF) por
   * falta de login escolhido. Vale conferir antes de gravar: CPF não deveria
   * virar identificador de presença.
   */
  loginProvisorio: boolean
}

export interface LeituraSigaa {
  pessoas: PessoaSigaa[]
  /** O que o cabeçalho `Docentes (N)` declarou, quando havia cabeçalho. */
  docentesDeclarados?: number
  discentesDeclarados?: number
  /** Cada motivo pelo qual algo ficou de fora, ou não bate. */
  problemas: string[]
}

function contarDeclarados(texto: string, rotulo: string): number | undefined {
  const casou = new RegExp(`${rotulo}\\s*\\((\\d+)\\)`, 'i').exec(texto)
  return casou ? Number(casou[1]) : undefined
}

function limparNome(bruto: string): string {
  return bruto
    .split('\n')[0]
    .replace(/\(Perfil\)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Interpreta a colagem. Nunca lança: devolve o que entendeu e a lista do que
 * não entendeu, para que a tela possa mostrar as duas coisas.
 */
export function interpretarParticipantes(texto: string): LeituraSigaa {
  const problemas: string[] = []
  const docentesDeclarados = contarDeclarados(texto, 'Docentes')
  const discentesDeclarados = contarDeclarados(texto, 'Discentes')

  const pedacos = texto.split(MARCA).slice(1)

  // Caminho de reserva: um nome por linha, sem login. Serve para turma que não
  // veio do SIGAA e para conferir um nome solto — mas sem login o vínculo não
  // tem como virar linha de planilha, e a tela avisa.
  if (pedacos.length === 0) {
    const soltos = texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 1)
    if (soltos.length > 0) {
      problemas.push(
        'Isto não parece a página de participantes do SIGAA. Cada linha virou um nome, sem login do CIn.',
      )
    }
    return {
      pessoas: soltos.map((nomeCompleto) => ({
        nomeCompleto,
        login: '',
        docenteNoSigaa: false,
        loginProvisorio: false,
      })),
      docentesDeclarados,
      discentesDeclarados,
      problemas,
    }
  }

  const pessoas: PessoaSigaa[] = []
  const vistos = new Set<string>()

  for (const pedaco of pedacos) {
    const nomeCompleto = limparNome(pedaco)
    // `Usuário:` com dois-pontos. A marca de presença é "Usuário Off-Line",
    // sem dois-pontos, então não há como confundir uma com a outra.
    const login = /Usuári[oa]:\s*([^\s\t]+)/i.exec(pedaco)?.[1]

    if (!nomeCompleto) {
      problemas.push('Um bloco veio sem nome e ficou de fora.')
      continue
    }
    if (!login) {
      problemas.push(`${nomeCompleto}: sem linha "Usuário:" — ficou de fora.`)
      continue
    }
    if (vistos.has(login)) {
      problemas.push(`${nomeCompleto}: login "${login}" repetido na colagem — só o primeiro entrou.`)
      continue
    }
    vistos.add(login)

    // Docente traz `Departamento:`; discente traz `Matrícula:`. Quando os dois
    // aparecem, `Matrícula:` decide — é o campo que só aluno tem.
    const temMatricula = /Matr[íi]cula:/i.test(pedaco)
    const temDepartamento = /Departamento:/i.test(pedaco)

    pessoas.push({
      nomeCompleto,
      login,
      docenteNoSigaa: temDepartamento && !temMatricula,
      loginProvisorio: /^\d+$/.test(login),
    })
  }

  const docentes = pessoas.filter((p) => p.docenteNoSigaa).length
  const discentes = pessoas.length - docentes

  if (docentesDeclarados !== undefined && docentesDeclarados !== docentes) {
    problemas.push(
      `A página diz Docentes (${docentesDeclarados}) e foram lidos ${docentes}. Faltou copiar parte da página?`,
    )
  }
  if (discentesDeclarados !== undefined && discentesDeclarados !== discentes) {
    problemas.push(
      `A página diz Discentes (${discentesDeclarados}) e foram lidos ${discentes}. Faltou copiar parte da página?`,
    )
  }

  return { pessoas, docentesDeclarados, discentesDeclarados, problemas }
}
