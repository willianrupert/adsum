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
} as const

export const paraJsonConfig = (config: Config) => embrulhar(config)
export const deJsonConfig = (texto: string) => desembrulhar<Config>(texto, NOMES.config)

export const paraJsonVinculos = (vinculos: Vinculo[]) => embrulhar(vinculos)
export const deJsonVinculos = (texto: string) => desembrulhar<Vinculo[]>(texto, NOMES.vinculos)

export const paraJsonGrade = (aulas: Aula[]) => embrulhar(aulas)
export const deJsonGrade = (texto: string) => desembrulhar<Aula[]>(texto, NOMES.grade)

export const paraJsonTurma = (pessoas: Matriculado[]) => embrulhar(pessoas)
export const deJsonTurma = (texto: string, turma: string) =>
  desembrulhar<Matriculado[]>(texto, NOMES.turma(turma))
