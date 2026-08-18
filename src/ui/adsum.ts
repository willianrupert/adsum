// Montagem das peças. É o único lugar do app que sabe **quais** adaptadores
// existem — trocar leitor é mexer nesta lista, e só. As telas conhecem as
// portas, nunca as implementações.

import { createContext, useContext } from 'react'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { LeitorWebNfc } from '../adaptadores/leitor/LeitorWebNfc.ts'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import type { Config } from '../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'

export interface OpcaoDeLeitor {
  id: string
  nome: string
  /** Uma frase sobre quando este leitor é o certo. Aparece na escolha. */
  quando: string
  criar: () => LeitorDeCracha
}

export const LEITORES: OpcaoDeLeitor[] = [
  {
    id: 'simulado',
    nome: 'Simulado',
    quando: 'baralho virtual de seis crachás, sem hardware nenhum',
    criar: () => new LeitorSimulado(),
  },
  {
    id: 'webnfc',
    nome: 'WebNFC',
    quando: 'crachá encostado no próprio celular — Chrome no Android, experimental',
    criar: () => new LeitorWebNfc(),
  },
]

export const LEITOR_PADRAO = 'simulado'

export interface Adsum {
  leitor: LeitorDeCracha
  leitorId: string
  trocarLeitor: (id: string) => Promise<void>
  repositorio: Repositorio
  config: Config
  /** Relê a configuração do banco — o sal pode ter sido trocado ou importado. */
  recarregarConfig: () => Promise<void>
}

export interface Base {
  repositorio: Repositorio
  config: Config
}

let inicializacao: Promise<Base> | undefined

/**
 * Idempotente de propósito: o StrictMode monta o efeito duas vezes em
 * desenvolvimento, e abrir o mesmo banco duas vezes em paralelo é como se
 * descobre isso do jeito ruim.
 */
export function abrirBase(): Promise<Base> {
  inicializacao ??= (async () => {
    const repositorio = new RepositorioDexie()
    await repositorio.abrir()
    return { repositorio, config: await repositorio.lerConfig() }
  })()
  return inicializacao
}

export const ContextoAdsum = createContext<Adsum | undefined>(undefined)

export function useAdsum(): Adsum {
  const adsum = useContext(ContextoAdsum)
  if (!adsum) throw new Error('useAdsum precisa estar dentro de <ProvedorAdsum>')
  return adsum
}
