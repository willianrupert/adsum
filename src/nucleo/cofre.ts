// Os arquivos JSON do cofre.
//
// JSON para o que é reescrito por inteiro; CSV só para o que cresce (ver
// `csv.ts`). Vínculo e turma são corrigidos — nome errado, papel trocado, aluno
// que trancou — então reescrever o arquivo é o certo, e um formato que aceita
// estrutura evita a ginástica que o CSV pedia para guardar login e nome
// completo lado a lado.
//
// `versao` no topo de cada arquivo. Sem ele, a primeira mudança de formato
// encontra pastas antigas sem saber que são antigas — e aí ou se adivinha, ou
// se perde a base de alguém.

import type { Aula, Config, Matriculado, Vinculo } from './tipos.ts'
import { nomeSeguroDeTurma } from './csv.ts'

export const VERSAO = 1

export interface Envelope<T> {
  versao: number
  gravadoEm: string
  conteudo: T
}

export interface Problema {
  motivo: string
}

export interface Leitura<T> {
  conteudo?: T
  problemas: Problema[]
}

function embrulhar<T>(conteudo: T): string {
  const envelope: Envelope<T> = {
    versao: VERSAO,
    gravadoEm: new Date().toISOString(),
    conteudo,
  }
  // Indentado de propósito: o cofre fica numa pasta que o professor abre, e
  // arquivo legível é o que permite conferir sem o app — inclusive no dia em
  // que o app for quem estiver errado.
  return JSON.stringify(envelope, null, 2) + '\n'
}

function desembrulhar<T>(texto: string, nome: string): Leitura<T> {
  let cru: unknown
  try {
    cru = JSON.parse(texto)
  } catch (erro) {
    return { problemas: [{ motivo: `${nome} não é JSON válido: ${(erro as Error).message}` }] }
  }

  const envelope = cru as Partial<Envelope<T>>
  if (typeof envelope?.versao !== 'number') {
    return { problemas: [{ motivo: `${nome} não tem "versao" — não dá para saber como lê-lo` }] }
  }
  if (envelope.versao > VERSAO) {
    return {
      problemas: [
        {
          motivo: `${nome} foi gravado por uma versão mais nova (${envelope.versao} > ${VERSAO}). Atualize o Adsum antes de abrir, senão a gravação seguinte perde o que não foi entendido.`,
        },
      ],
    }
  }
  if (envelope.conteudo === undefined) {
    return { problemas: [{ motivo: `${nome} está sem conteúdo` }] }
  }

  return { conteudo: envelope.conteudo as T, problemas: [] }
}

export const NOMES = {
  config: 'config.json',
  vinculos: 'vinculos.json',
  grade: 'grade.json',
  turma: (turma: string) => `turmas/${nomeSeguroDeTurma(turma)}.json`,
  leiaMe: 'LEIA-ME.txt',
} as const

/**
 * A pasta se explica sozinha.
 *
 * O cofre só é um cofre porque os arquivos são **arquivos de verdade**: o
 * professor pode abrir a pasta no Finder, copiar num pendrive, botar no iCloud.
 * O que faltava era a pasta dizer o que ela é. Sem isso, quem a encontra daqui
 * a um ano — ou quem a recebe de um colega — vê seis JSONs sem contexto, e a
 * chance de apagar "esse arquivo estranho" é real.
 *
 * `.txt` e não `.md`: abre limpo com dois cliques em qualquer sistema, sem
 * sintaxe no meio do caminho. Largura de 72 colunas pelo mesmo motivo.
 *
 * Reescrito a cada sincronização de propósito — é documentação gerada, e a
 * versão do formato tem de bater com a dos arquivos ao lado.
 */
export function paraLeiaMe(): string {
  return `Adsum — o cofre da sua turma
============================

Esta pasta é a dona dos seus dados. O site guarda uma cópia no
navegador para funcionar rápido, mas é aqui que as coisas existem
de verdade: se o navegador for limpo, trocado ou apagado, é desta
pasta que tudo volta.

Formato versão ${VERSAO}. Gerado pelo Adsum — não precisa editar nada.


O QUE TEM AQUI
--------------

  ${NOMES.config}
      O segredo desta instalação. É ele que liga cada crachá ao seu
      dono. Sem este arquivo os outros voltam pela metade: os nomes
      aparecem, mas nenhum crachá é reconhecido.

  ${NOMES.vinculos}
      Qual crachá é de quem. Guarda o código do crachá, não o
      número gravado nele.

  ${NOMES.grade}
      Seus horários de aula, usados para saber qual turma abrir.

  turmas/
      A lista de cada turma, como veio do SIGAA: nome completo e
      matrícula.

  registros/
      A chamada, uma linha por presença, em CSV para abrir no Excel.
      Estes arquivos só crescem — nada aqui é reescrito ou apagado.


COMO RECUPERAR TUDO
-------------------

  Computador novo, ou navegador limpo:

    1. Abra o Adsum.
    2. Escolha esta pasta quando ele pedir.

    Pronto. Ele lê a pasta e reconstrói a base inteira.

  Se o seu navegador não pedir pasta (Safari, Firefox):

    Na tela de colar a turma, use "Já tenho uma pasta do Adsum" e
    escolha esta pasta. Ele lê todos os arquivos de uma vez.

  Perdeu só a chamada de um dia:

    Os CSVs de registros/ abrem direto no Excel. Não é preciso o
    Adsum para ler uma chamada.


CUIDADO — ISTO É DADO PESSOAL
-----------------------------

  Esta pasta tem nome e matrícula dos seus alunos, e o segredo que
  liga crachás a pessoas. Trate-a como trataria a lista de chamada
  impressa: não publique, não mande por grupo, não deixe em pasta
  compartilhada com quem não precisa.

  Guardá-la no iCloud ou no Drive é uma boa ideia — é a cópia fora
  da máquina. Compartilhar o link dela com outras pessoas, não.


O QUE NÃO FAZER
---------------

  Não apague o ${NOMES.config}. É o único arquivo que não dá para
  refazer, e sem ele os crachás já cadastrados param de ser
  reconhecidos.

  Não renomeie a pasta enquanto o Adsum estiver aberto.

  Não edite os JSONs à mão. Se precisar corrigir algo, corrija
  pelo Adsum — ele reescreve estes arquivos sozinho.
`
}

export const paraJsonConfig = (config: Config) => embrulhar(config)
export const deJsonConfig = (texto: string) => desembrulhar<Config>(texto, NOMES.config)

export const paraJsonVinculos = (vinculos: Vinculo[]) => embrulhar(vinculos)
export const deJsonVinculos = (texto: string) => desembrulhar<Vinculo[]>(texto, NOMES.vinculos)

export const paraJsonGrade = (aulas: Aula[]) => embrulhar(aulas)
export const deJsonGrade = (texto: string) => desembrulhar<Aula[]>(texto, NOMES.grade)

export const paraJsonTurma = (pessoas: Matriculado[]) => embrulhar(pessoas)

/**
 * O arquivo que um professor passa para outro.
 *
 * **Leva o sal junto, e não tem como não levar.** O identificador de cada
 * crachá é `SHA-256(sal ‖ uid)`: sem o mesmo sal, os hashes de um professor são
 * ruído para o outro, e a lista chega inútil. Exportar só os vínculos daria a
 * impressão de funcionar e não funcionaria — que é pior.
 *
 * A consequência precisa estar dita na tela: este arquivo liga crachás a nomes
 * e vale o mesmo cuidado que a lista da turma.
 */
export interface Compartilhamento {
  salHex: string
  vinculos: Vinculo[]
}

export const paraJsonCompartilhado = (dados: Compartilhamento) => embrulhar(dados)
export const deJsonCompartilhado = (texto: string) =>
  desembrulhar<Compartilhamento>(texto, 'o arquivo compartilhado')
export const deJsonTurma = (texto: string, turma: string) =>
  desembrulhar<Matriculado[]>(texto, NOMES.turma(turma))
