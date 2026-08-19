// Montar uma tela com as peças de verdade.
//
// Nada de dublê aqui: o repositório é o `RepositorioDexie` sobre um IndexedDB
// falso, e o leitor é o `LeitorSimulado`. Testar contra dublê que concorda com
// tudo é como se descobre tarde que a tela e o adaptador discordavam.

import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { ContextoAdsum, type Adsum } from '../ui/adsum.ts'
import type { Config } from '../nucleo/tipos.ts'

let n = 0

export interface Bancada extends Adsum {
  leitor: LeitorSimulado
  repositorio: RepositorioDexie
  config: Config
}

export async function montarBancada(): Promise<Bancada> {
  const repositorio = new RepositorioDexie(`adsum-tela-${n++}`)
  await repositorio.abrir()
  const config = await repositorio.lerConfig()

  const leitor = new LeitorSimulado()
  await leitor.iniciar()

  return {
    leitor,
    leitorId: 'simulado',
    trocarLeitor: async () => {},
    repositorio,
    config,
    recarregarConfig: async () => {},
  }
}

export function renderizarCom(bancada: Bancada, tela: ReactElement) {
  return render(<ContextoAdsum.Provider value={bancada}>{tela}</ContextoAdsum.Provider>)
}
