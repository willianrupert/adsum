// Montar uma tela com as peças de verdade.
//
// Nada de dublê aqui: o repositório é o `RepositorioDexie` sobre um IndexedDB
// falso, e o leitor é o `LeitorSimulado`. Testar contra dublê que concorda com
// tudo é como se descobre tarde que a tela e o adaptador discordavam.

import { afterAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { ContextoAdsum, type Adsum } from '../ui/adsum.ts'
import type { Config } from '../nucleo/tipos.ts'

let n = 0
const filaDeBancos: { nome: string; repositorio: RepositorioDexie }[] = []

/** Fecha a conexão e apaga o banco do IndexedDB falso do teste anterior — não
 * deixa a limpeza pra ninguém lembrar. Sem isto, 300+ testes deixavam 300+
 * bancos abertos e cheios no registro global do `fake-indexeddb`, um por
 * teste, nunca liberados: memória só cresce a suíte inteira, e é uma máquina
 * com pouca sobra (um runner de CI compartilhado, não este notebook) que
 * sente isso primeiro.
 *
 * Por que não fechar no `afterEach` do próprio teste, nem no `beforeEach` do
 * seguinte: `cleanup()` (rodado antes do `afterEach`, registrado em
 * `testes/preparo.ts`) desmonta a árvore e cancela as inscrições dos
 * efeitos — mas não cancela uma cadeia assíncrona que já passou do próprio
 * `await` no meio de um "dispare e esqueça" (`void (async () => {...})()`,
 * comum em `Fluxo.tsx`/`TelaAula.tsx`). Fechar cedo demais faz essa cadeia
 * encontrar um banco fechado e virar rejeição sem dono. Uma primeira versão
 * disto fechava no `beforeEach` seguinte — mas isso acontece **antes** do
 * corpo do teste seguinte rodar, então quase não sobra tempo a mais do que
 * fechar na hora; os erros continuaram sob Node 22. A fila aqui atrasa o
 * fechamento por **uma geração inteira**: o banco do teste N só fecha no
 * início do teste N+2, depois do corpo inteiro do teste N+1 já ter rodado —
 * tempo de verdade, não um número escolhido a dedo (a versão anterior
 * apostava 20ms fixos; era o mesmo palpite que este projeto rejeita em
 * `testes/simular.ts`). */
async function fecharBanco(item: { nome: string; repositorio: RepositorioDexie }) {
  await item.repositorio.fechar()
  await new Promise<void>((resolver) => {
    const pedido = indexedDB.deleteDatabase(item.nome)
    pedido.onsuccess = () => resolver()
    pedido.onerror = () => resolver()
    pedido.onblocked = () => resolver()
  })
}

beforeEach(async () => {
  while (filaDeBancos.length > 1) {
    const item = filaDeBancos.shift()
    if (item) await fecharBanco(item)
  }
})

afterAll(async () => {
  while (filaDeBancos.length > 0) {
    const item = filaDeBancos.shift()
    if (item) await fecharBanco(item)
  }
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
  filaDeBancos.push({ nome, repositorio })
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
