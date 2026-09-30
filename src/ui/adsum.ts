// Montagem das peças. É o único lugar do app que sabe **quais** adaptadores
// existem — trocar leitor é mexer nesta lista, e só. As telas conhecem as
// portas, nunca as implementações.

import { createContext, useContext } from 'react'
import { LeitorSerial } from '../adaptadores/leitor/LeitorSerial.ts'
import { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { LeitorWebNfc } from '../adaptadores/leitor/LeitorWebNfc.ts'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { PonteJanela } from '../adaptadores/sigaa/PonteJanela.ts'
import { PonteSimulada } from '../adaptadores/sigaa/PonteSimulada.ts'
import type { PonteSigaa, PonteSimulavel } from '../portas/PonteSigaa.ts'
import type { Config, Evento, Matriculado } from '../nucleo/tipos.ts'
import { ORIGEM_SIGAA } from '../nucleo/lancar/protocolo.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { modoDev } from '../ambiente/preferencias.ts'
import { registrar } from '../ambiente/diario.ts'
import { chamadaViva, chamadaVivaEmOutraJanela } from '../ambiente/chamadaViva.ts'

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
    id: 'serial',
    nome: 'Leitor USB (serial)',
    quando: 'o leitor ESP32, no Chrome ou Edge',
    criar: () => new LeitorSerial(),
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
    await fecharChamadaDeAntes(repositorio)
    return { repositorio, config: await repositorio.lerConfig() }
  })()
  return inicializacao
}

/**
 * Fechar o app fecha a chamada. Pedido do professor (22/09/2026), e só é
 * seguro porque reabrir não perde nada: é uma chamada por turma por dia, e
 * `TelaAula` reencontra no log quem já passou. Antes, a chamada sobrevivia
 * ao app fechado, e o app abria direto numa aula que ninguém tinha
 * começado agora.
 *
 * Sem evento `encerrar` no log: a hora seria a de reabrir, não a de fechar,
 * e o log só guarda o que aconteceu quando aconteceu.
 */
export async function fecharChamadaDeAntes(repositorio: Repositorio): Promise<void> {
  const aberta = await repositorio.sessaoAberta()
  if (!aberta) return
  // Recarregar a mesma janela não é fechar o app. Ver `chamadaViva`.
  if (chamadaViva()) {
    registrar('chamada_mantida_ao_recarregar', { aberta_em: aberta.abertaEm })
    return
  }
  // Outra janela do Adsum no meio da aula: a chamada é dela, não de antes.
  if (await chamadaVivaEmOutraJanela()) {
    registrar('chamada_mantida_em_outra_janela', { aberta_em: aberta.abertaEm })
    return
  }
  await repositorio.encerrarSessao()
  registrar('chamada_fechada_ao_abrir', { aberta_em: aberta.abertaEm })
}

/**
 * A janela aberta pelo favorito do SIGAA é uma segunda janela do Adsum, com
 * `sessionStorage` próprio. Por isso não passa por `abrirBase`: lá,
 * `fecharChamadaDeAntes` fecharia a chamada da janela principal, no meio da
 * aula. Aqui só o repositório, sem leitor e sem mexer na sessão.
 */
export async function abrirBaseDaJanelaSigaa(): Promise<Repositorio> {
  if (import.meta.env.DEV && naBancada()) return baseDaBancada()
  const repositorio = new RepositorioDexie()
  await repositorio.abrir()
  return repositorio
}

export const ponteDaJanela = (): PonteSigaa =>
  new PonteJanela(window, import.meta.env.DEV && naBancada() ? ORIGEM_DA_BANCADA : ORIGEM_SIGAA)

/**
 * Só em desenvolvimento: a janela aberta pelo favorito de ensaio da bancada
 * local (`scripts/bancada_sigaa.mjs`), com `?bancada` no endereço. O `if` com
 * `import.meta.env.DEV` na própria condição tira tudo isto do app publicado.
 */
const ORIGEM_DA_BANCADA = 'http://localhost:8080'
export const naBancada = (): boolean => import.meta.env.DEV && new URLSearchParams(window.location.search).has('bancada')

/** A turma da bancada (as mesmas matrículas inventadas da página) numa base só dela, refeita a cada abertura. */
async function baseDaBancada(): Promise<Repositorio> {
  const cenario = (await (await fetch(`${ORIGEM_DA_BANCADA}/bancada/cenario.json`)).json()) as {
    turma: string
    matriculados: Matriculado[]
    eventos: Evento[]
  }
  const repositorio = await baseDaVitrine('adsum-bancada')
  await repositorio.salvarTurma(cenario.turma, cenario.matriculados)
  for (const evento of cenario.eventos) await repositorio.acrescentarEvento(evento)
  return repositorio
}

/**
 * A vitrine mostra a janela do SIGAA com gente inventada, numa base só dela
 * (`nome`), apagada a cada vez: nunca a base de quem abre.
 */
export async function baseDaVitrine(nome: string): Promise<Repositorio> {
  const repositorio = new RepositorioDexie(nome)
  await repositorio.abrir()
  await repositorio.apagarTudo()
  return repositorio
}

export const ponteDeEnsaio = (opcoes?: { ligada?: boolean }): PonteSimulavel => new PonteSimulada(opcoes)

export const ContextoAdsum = createContext<Adsum | undefined>(undefined)

export function useAdsum(): Adsum {
  const adsum = useContext(ContextoAdsum)
  if (!adsum) throw new Error('useAdsum precisa estar dentro de <ProvedorAdsum>')
  return adsum
}
