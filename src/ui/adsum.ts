// Montagem das peças. É o único lugar do app que sabe **quais** adaptadores
// existem — trocar leitor é mexer nesta lista, e só. As telas conhecem as
// portas, nunca as implementações.

import { createContext, useContext } from 'react'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { LeitorWebNfc } from '../adaptadores/leitor/LeitorWebNfc.ts'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import type { Config } from '../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { modoDev } from '../ambiente/preferencias.ts'

export interface OpcaoDeLeitor {
  id: string
  nome: string
  /** Uma frase sobre quando este leitor é o certo. Aparece na escolha. */
  quando: string
  /** Existe só para ensaiar. Some com o modo de ensaio desligado. */
  ensaio?: boolean
  criar: () => LeitorDeCracha
}

export const LEITORES: OpcaoDeLeitor[] = [
  {
    id: 'dongle',
    nome: 'Dongle USB',
    quando: 'o leitor na mesa',
    criar: () => new LeitorTeclado(),
  },
  {
    id: 'simulado',
    nome: 'Simulado',
    quando: 'ensaio sem hardware',
    ensaio: true,
    criar: () => new LeitorSimulado(),
  },
  {
    id: 'webnfc',
    nome: 'WebNFC',
    quando: 'celular Android',
    criar: () => new LeitorWebNfc(),
  },
]

/**
 * O que aparece na escolha. Sem modo de ensaio, o simulado some — e some para
 * valer: uma opção que existe para provar que o programa funciona não pertence
 * à tela de quem vai dar aula.
 */
export function leitoresVisiveis(): OpcaoDeLeitor[] {
  return modoDev() ? LEITORES : LEITORES.filter((o) => !o.ensaio)
}

/**
 * O padrão era `simulado`, **inclusive no site publicado** — quem abrisse o
 * Adsum de verdade encontrava um leitor de mentira esperando crachá que nunca
 * ia chegar. Em produção o padrão é o dongle: é HID de teclado, não pede
 * permissão nem driver, e funciona igual em todo navegador. No ensaio o padrão
 * volta a ser o simulado, que é o ponto do ensaio.
 */
export function leitorPadrao(): string {
  return modoDev() ? 'simulado' : 'dongle'
}

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
