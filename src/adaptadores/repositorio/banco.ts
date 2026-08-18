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
import type { Sessao } from '../../nucleo/sessao.ts'

export interface LinhaConfig extends Config {
  id: number
}

/** Só existe uma linha de configuração. */
export const ID_DA_CONFIG = 1

export type BancoAdsum = Dexie & {
  config: EntityTable<LinhaConfig, 'id'>
  vinculos: EntityTable<Vinculo, 'uidHash'>
  matriculados: EntityTable<Matriculado, 'chave'>
  sessao: EntityTable<Sessao & { id: number }, 'id'>
  pasta: EntityTable<{ id: number; handle: FileSystemDirectoryHandle }, 'id'>
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

  // v4: a aula acontecendo. Uma linha só — não existem duas aulas ao mesmo
  // tempo no computador de um professor.
  banco.version(4).stores({
    sessao: 'id',
  })

  // v5: o handle da pasta. Ele é clonável estruturalmente, então o IndexedDB
  // guarda a referência e a sessão seguinte reabre a mesma pasta sem perguntar.
  banco.version(5).stores({
    pasta: 'id',
  })

  // v6 e v7: some o login do SIGAA e entra a matrícula. O campo `Usuário:` da
  // página é credencial de acesso de outra pessoa e não tem por que morar numa
  // base de frequência.
  //
  // São duas versões porque a chave primária de `matriculados` muda, e o
  // IndexedDB não permite trocá-la: é preciso apagar a tabela numa versão e
  // recriá-la na seguinte. A lista da turma se perde na migração — e é isso
  // mesmo, porque ela estava indexada pelo login que não deve mais existir.
  // Recolar a página do SIGAA refaz, e o cofre em pasta traz de volta o resto.
  banco.version(6).stores({ matriculados: null })

  banco.version(7).stores({
    vinculos: 'uidHash, papel, nome, matricula',
    matriculados: '[turma+chave], turma, chave, nome',
  })

  // v8: `aparelhoId` era o identificador de um aparelho que não existe mais.
  // O que ele distingue é uma instalação do app de outra.
  banco.version(8).upgrade(async (tx) => {
    await tx
      .table('config')
      .toCollection()
      .modify((config: Record<string, unknown>) => {
        config.instalacaoId = config.instalacaoId ?? config.aparelhoId
        delete config.aparelhoId
      })
  })

  return banco
}
