// Esquema do IndexedDB, via Dexie.
//
// Duas escolhas de chave primária carregam regra de negócio:
//
// - `eventos.eventoId` é a própria chave. Idempotência deixa de depender de
//   quem chama: reacrescentar o mesmo evento falha no banco, não na intenção.
// - `vinculos.uidHash` é a própria chave. Um crachá tem no máximo um dono; um
//   aluno pode ter dois crachás, porque segunda via existe.

import Dexie, { type EntityTable } from 'dexie'
import type { Aula, Config, Evento, Vinculo } from '../../nucleo/tipos.ts'

export interface LinhaConfig extends Config {
  id: number
}

/** Só existe uma linha de configuração. */
export const ID_DA_CONFIG = 1

export type BancoAdsum = Dexie & {
  config: EntityTable<LinhaConfig, 'id'>
  vinculos: EntityTable<Vinculo, 'uidHash'>
  aulas: EntityTable<Aula, 'id'>
  eventos: EntityTable<Evento, 'eventoId'>
}

export const NOME_DO_BANCO = 'adsum'

export function criarBanco(nome: string = NOME_DO_BANCO): BancoAdsum {
  const banco = new Dexie(nome) as BancoAdsum
  banco.version(1).stores({
    config: 'id',
    vinculos: 'uidHash, papel, nome',
    aulas: '++id, uidHashProfessor, dia',
    eventos: 'eventoId, timestamp, sessaoId, uidHash',
  })
  return banco
}
