// Esquema do IndexedDB, via Dexie.
//
// Duas escolhas de chave primária carregam regra de negócio:
//
// - `eventos.eventoId` é a própria chave. Idempotência deixa de depender de
//   quem chama: reacrescentar o mesmo evento falha no banco, não na intenção.
// - `vinculos.uidHash` é a própria chave. Um crachá tem no máximo um dono; um
//   aluno pode ter dois crachás, porque segunda via existe.

import Dexie, { type EntityTable } from 'dexie'
import type { Aula, Config, Evento, Matriculado, Vinculo } from '../../nucleo/tipos.ts'

export interface LinhaConfig extends Config {
  id: number
}

/** Só existe uma linha de configuração. */
export const ID_DA_CONFIG = 1

export type BancoAdsum = Dexie & {
  config: EntityTable<LinhaConfig, 'id'>
  vinculos: EntityTable<Vinculo, 'uidHash'>
  matriculados: EntityTable<Matriculado, 'login'>
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

  // Versão nova em vez de editar a anterior: quem já abriu o site tem a v1 no
  // navegador, e mexer na definição existente é como o Dexie descobre que o
  // esquema mudou sem ninguém dizer — a base não abre. Só as tabelas alteradas
  // ou novas precisam ser repetidas aqui.
  banco.version(2).stores({
    vinculos: 'uidHash, papel, nome, login',
    matriculados: '[turma+login], turma, login, nome',
  })

  // v3: `timestamp` virou `quando` e `sessaoId` saiu — turma mais data já dizem
  // de que aula é a linha. Ver `docs/02_formato.md`.
  banco.version(3).stores({
    eventos: 'eventoId, quando, turma, uidHash',
  })

  return banco
}
