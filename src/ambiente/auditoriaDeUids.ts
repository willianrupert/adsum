// O código real de cada crachá lido, num arquivo à parte na pasta do cofre.
//
// **Exceção deliberada, e temporária, à regra do sal.** O projeto inteiro evita
// guardar o UID: é o único dado que permite clonar o crachá. Decidido pelo
// autor em 22/09/2026, depois de uma aula em que 40 crachás ficaram
// irreconhecíveis por um sal perdido: nesta fase de testes, pedir que a turma
// recadastre custa mais do que guardar o código e poder auditar depois. O
// chaveiro de sais (`Config.saisAnteriores`) fecha a causa daquela perda;
// isto é a rede de segurança enquanto a confiança no app se constrói.
//
// O que foi decidido junto, e precisa continuar valendo:
// - arquivo **separado** (`auditoria/uids.csv`), nunca misturado ao log de
//   presença nem ao `vinculos.json` — apagar a auditoria não toca na chamada;
// - **sem nome**: o arquivo liga UID a `uid_hash`, e o nome só aparece
//   cruzando com `vinculos.json`. Por isso o `uid_hash` gravado é **o do
//   vínculo que a leitura achou**, no sal em que ele foi cadastrado, e não o
//   do sal atual: é essa igualdade de texto que permite refazer a base a
//   partir deste arquivo mesmo que o sal daquele vínculo se perca;
// - **ligado por padrão durante os testes**, desligável no Diagnóstico, que
//   avisa enquanto estiver ligado;
// - **uma linha por crachá**, na primeira leitura: nenhum custo nas leituras
//   seguintes, que são quase todas.

import type { Uid } from '../nucleo/tipos.ts'
import { acrescentar, ler } from './pasta.ts'

export const CAMINHO_DA_AUDITORIA = 'auditoria/uids.csv'
const CABECALHO = '﻿uid_hex;uid_hash;primeira_leitura;leitor\n'

let pastaConhecida: FileSystemDirectoryHandle | undefined
let vistos: Promise<Set<string>> | undefined
let fila: Promise<void> = Promise.resolve()

const paraHex = (uid: Uid) => Array.from(uid, (b) => b.toString(16).padStart(2, '0')).join('')

/** Os UIDs já no arquivo, lidos uma vez por pasta — nunca a cada crachá. */
function jaVistos(pasta: FileSystemDirectoryHandle): Promise<Set<string>> {
  if (pasta !== pastaConhecida || !vistos) {
    pastaConhecida = pasta
    vistos = ler(pasta, CAMINHO_DA_AUDITORIA).then(
      (texto) =>
        new Set(
          (texto ?? '')
            .split('\n')
            .slice(1)
            .map((linha) => linha.split(';')[0].trim())
            .filter(Boolean),
        ),
    )
  }
  return vistos
}

/**
 * Anota o crachá se ele ainda não está no arquivo. Devolve se anotou.
 *
 * Em fila: dois crachás quase juntos não podem ler o conjunto antes de o
 * outro gravar, ou o mesmo UID entraria duas vezes.
 */
export function anotarUid(
  pasta: FileSystemDirectoryHandle,
  /** Só é chamado quando o crachá é novo no arquivo: nenhum custo nos outros. */
  hashDoCracha: () => Promise<string>,
  uid: Uid,
  em: Date,
  leitor: string,
): Promise<boolean> {
  const resultado = fila.then(async () => {
    const hex = paraHex(uid)
    try {
      const conjunto = await jaVistos(pasta)
      if (conjunto.has(hex)) return false
      const uidHash = await hashDoCracha()
      await acrescentar(pasta, CAMINHO_DA_AUDITORIA, `${hex};${uidHash};${em.toISOString()};${leitor}\n`, CABECALHO)
      conjunto.add(hex)
      return true
    } catch (erro) {
      // Sem isto, uma leitura que falhou uma vez (permissão caída) ficaria
      // guardada como promessa rejeitada, e nada mais seria anotado.
      vistos = undefined
      throw erro
    }
  })
  fila = resultado.then(
    () => undefined,
    () => undefined,
  )
  return resultado
}

/** Só para testes: o conjunto é estado de módulo. */
export function esquecerAuditoria(): void {
  pastaConhecida = undefined
  vistos = undefined
  fila = Promise.resolve()
}
