// Montar uma tela com as peças de verdade.
//
// Nada de dublê aqui: o repositório é o `RepositorioDexie` sobre um IndexedDB
// falso, e o leitor é o `LeitorSimulado`. Testar contra dublê que concorda com
// tudo é como se descobre tarde que a tela e o adaptador discordavam.

import { afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { ContextoAdsum, type Adsum } from '../ui/adsum.ts'
import type { Config } from '../nucleo/tipos.ts'

let n = 0
let bancoDoTesteAtual: { nome: string; repositorio: RepositorioDexie } | undefined

/** Fecha a conexão e apaga o banco do IndexedDB falso, na hora — não deixa a
 * limpeza pra ninguém lembrar. Sem isto, 300+ testes deixavam 300+ bancos
 * abertos e cheios no registro global do `fake-indexeddb`, um por teste,
 * nunca liberados: memória só cresce a suíte inteira, e é uma máquina com
 * pouca sobra (um runner de CI compartilhado, não este notebook) que sente
 * isso primeiro — travamentos sem relação nenhuma com o teste em si, mais
 * perto do fim da suíte, onde o acúmulo já pesa mais. */
afterEach(async () => {
  if (!bancoDoTesteAtual) return
  const { nome, repositorio } = bancoDoTesteAtual
  bancoDoTesteAtual = undefined
  // `cleanup()` (rodado antes deste `afterEach`, registrado em
  // `testes/preparo.ts`) desmonta a árvore e cancela as inscrições dos
  // efeitos — mas não cancela uma cadeia assíncrona que já passou do próprio
  // `await` no meio de um "dispare e esqueça" (`void (async () => {...})()`,
  // comum em `Fluxo.tsx`/`TelaAula.tsx`). Fechar na mesma volta do laço de
  // eventos faz essa cadeia encontrar um banco fechado e virar rejeição sem
  // dono. Uma volta de espera é o que falta pra ela terminar contra o banco
  // ainda aberto, como sempre terminou antes de este arquivo fechar algo.
  await new Promise((resolver) => setTimeout(resolver, 20))
  await repositorio.fechar()
  await new Promise<void>((resolver) => {
    const pedido = indexedDB.deleteDatabase(nome)
    pedido.onsuccess = () => resolver()
    pedido.onerror = () => resolver()
    pedido.onblocked = () => resolver()
  })
})

export interface Bancada extends Adsum {
  leitor: LeitorSimulado
  repositorio: RepositorioDexie
  config: Config
}

export async function montarBancada(): Promise<Bancada> {
  const nome = `adsum-tela-${n++}`
  const repositorio = new RepositorioDexie(nome)
  await repositorio.abrir()
  bancoDoTesteAtual = { nome, repositorio }
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
