// A máquina do professor no dia do deploy, sem ele fazer nada além de
// recarregar: a versão que está no ar abre o cofre dele (o zip da pasta), e a
// versão nova é publicada no mesmo endereço. O service worker de verdade faz a
// troca, e o que se confere é o que o professor perderia se algo desse errado:
// a base, a pasta, a planilha, e os crachás da turma sendo reconhecidos.
//
// Configurável pelo ambiente:
//   ADSUM_COFRE        o zip da pasta do professor (padrão: ~/Downloads/Chamadas 3.zip)
//   ADSUM_NO_AR        a versão no ar (padrão: origin/main)
//   ADSUM_NOVA         a que vai ao ar (padrão: HEAD, o commit, não a pasta de trabalho)
//   ADSUM_RIG          os crachás pelo rig S3, como teclado USB de verdade:
//                      o caminho da porta, ou "auto" (a primeira da Espressif)
// Sem o cofre, os testes se pulam: é dado real de turma, fora do repositório.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { hospedar, versao, PAGINA_VAZIA, type Hospedagem, type Versao } from './apoio/versoes.ts'
import { contarBase, eventosDaBase, lerCofre, lerPasta, semear, trocarSeletor, type ArquivosDoCofre } from './apoio/cofre.ts'
import { abrirRig, acharRig, type Rig } from './apoio/rig.ts'
import { execFileSync } from 'node:child_process'

const COFRE = process.env.ADSUM_COFRE ?? join(homedir(), 'Downloads/Chamadas 3.zip')
const PORTA = 4317
/** Acima do intervalo mínimo entre crachás diferentes (400 ms). */
const ENTRE_CRACHAS_MS = 500

test.skip(!existsSync(COFRE), `sem o cofre em ${COFRE} (ADSUM_COFRE)`)
// O Google Chrome instalado, que é o navegador do professor. O Chromium que
// vem com o Playwright cai (SIGTRAP) quando o service worker assume a página
// com a pasta da OPFS em uso; o Chrome, não.
test.use({ channel: 'chrome', headless: !process.env.ADSUM_RIG })
test.describe.configure({ mode: 'serial' })
// Uma chamada inteira com os crachás da turma, e a espera da versão nova.
test.beforeEach(() => test.setTimeout(10 * 60_000))

let noAr: Versao
let nova: Versao
let cofre: ArquivosDoCofre
let site: Hospedagem
let rig: Rig | undefined

test.beforeAll(async () => {
  noAr = versao(process.env.ADSUM_NO_AR ?? 'origin/main')
  nova = versao(process.env.ADSUM_NOVA ?? 'HEAD')
  expect(nova.entrada, 'as duas versões são o mesmo build').not.toBe(noAr.entrada)
  cofre = lerCofre(COFRE)
  site = await hospedar(PORTA)
  if (process.env.ADSUM_RIG) {
    const caminho = process.env.ADSUM_RIG === 'auto' ? await acharRig() : process.env.ADSUM_RIG
    if (!caminho) throw new Error('ADSUM_RIG pedido, e nenhum rig da Espressif conectado')
    rig = await abrirRig(caminho)
  }
})
test.afterAll(async () => {
  await rig?.fechar()
  await site?.fechar()
})

/**
 * A janela do teste na frente, e confirmada: o teclado do rig digita onde
 * estiver o foco do sistema. Sem foco, para aqui, antes de qualquer tecla.
 */
async function focar(page: Page) {
  await page.bringToFront()
  if (await page.evaluate(() => document.hasFocus())) return
  // O Chrome do teste é outro processo do mesmo app do professor: traz o dele, pelo pid.
  const pid = execFileSync('pgrep', ['-f', '-o', 'playwright_chromiumdev_profile'], { encoding: 'utf-8' }).trim().split('\n')[0]
  execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`])
  await page.waitForTimeout(400)
  if (!(await page.evaluate(() => document.hasFocus()))) throw new Error('a janela do teste não está em foco: o rig não digita, para não escrever em outra janela')
}

/** Os crachás que o dongle leu nesta turma, do `auditoria/uids.csv` do cofre. */
function crachasDoCofre(): { uid: string; uidHash: string }[] {
  const csv = Buffer.from(cofre['auditoria/uids.csv'] ?? '', 'base64').toString('utf-8').replace(/^﻿/, '')
  const vistos = new Map<string, string>()
  for (const linha of csv.split(/\r?\n/).slice(1)) {
    const [uid, uidHash] = linha.split(';')
    if (uid && uidHash) vistos.set(uid, uidHash)
  }
  return [...vistos].map(([uid, uidHash]) => ({ uid, uidHash }))
}

/** Como o dongle: o UID em decimal de 10 dígitos, digitado numa rajada, e Enter. */
async function encostar(page: Page, uidHex: string) {
  const comoODongleImprime = String(Number.parseInt(uidHex, 16)).padStart(10, '0')
  if (rig) {
    await focar(page)
    await rig.digitar(comoODongleImprime)
  } else {
    await page.keyboard.type(comoODongleImprime, { delay: 8 })
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(ENTRE_CRACHAS_MS)
}

const versaoRodando = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLScriptElement>('script[type=module][src]')].map((s) => s.src.split('/').pop()).join())

/** Quem cada crachá é, para a base: o mesmo crachá tem de ser a mesma pessoa nas duas versões. */
async function quemECada(page: Page, desde: Set<string>) {
  const doCofre = new Set(crachasDoCofre().map((c) => c.uidHash))
  const novos = (await eventosDaBase(page)).filter((e) => !desde.has(e.id) && doCofre.has(e.uidHash))
  return new Map(novos.map((e) => [e.uidHash, { quem: e.quem, reconhecido: e.resultado !== 'desconhecido' }]))
}

async function abrirNaVersaoDoAr(page: Page, erros: string[]) {
  page.on('pageerror', (e) => erros.push(e.message))
  site.publicar(noAr)
  await trocarSeletor(page)
  await page.goto(site.url + PAGINA_VAZIA)
  await semear(page, cofre)
  await page.goto(site.url + '/adsum/')
  await page.getByRole('button', { name: 'Escolher pasta' }).click()
  await expect(page.getByRole('button', { name: /Começar a chamada/ })).toBeVisible({ timeout: 20_000 })
  expect(await versaoRodando(page)).toContain(noAr.entrada)
  // O service worker da versão do ar no controle, como na máquina do professor.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 })
  await page.waitForTimeout(3000) // a pasta termina de ser conferida
}

async function chamada(page: Page, crachas: { uid: string }[]) {
  await page.getByRole('button', { name: /Começar a chamada/ }).click()
  await expect(page.getByRole('button', { name: 'Encerrar a chamada' })).toBeVisible({ timeout: 15_000 })
  for (const c of crachas) await encostar(page, c.uid)
}

async function conferirDepois(page: Page, antes: { base: Record<string, number>; pasta: Record<string, string> }) {
  // A base inteira continua lá: nada some ao trocar de versão.
  const base = await contarBase(page)
  for (const [tabela, quantos] of Object.entries(antes.base)) {
    // A chamada aberta é estado da tela, não dado: encerrar a fecha.
    if (tabela === 'sessao') continue
    if (tabela === 'eventos') expect(base[tabela], tabela).toBeGreaterThanOrEqual(quantos)
    else expect(base[tabela], tabela).toBe(quantos)
  }
  // A pasta: o log só cresce, e a planilha de faltas ganhou a matrícula sozinha.
  const pasta = await lerPasta(page)
  for (const [caminho, texto] of Object.entries(antes.pasta)) {
    if (caminho.startsWith('registros/')) expect(pasta[caminho]?.startsWith(texto) ?? false, `${caminho} só cresce`).toBe(true)
  }
  // A planilha que o app escreve para cada turma (o mesmo nome do arquivo da
  // turma), e não o que mais o professor guarde ali: uma cópia, um .numbers.
  // Sem mostrar o conteúdo na falha: tem nome de aluno.
  const faltas = Object.keys(pasta)
    .filter((c) => /^turmas\/.+\.json$/.test(c))
    .map((c) => c.replace(/^turmas\/(.+)\.json$/, 'faltas/$1.csv'))
    .filter((c) => c in pasta)
  expect(faltas.length).toBeGreaterThan(0)
  for (const c of faltas) expect(/^nome;matricula;/.test(pasta[c].replace(/^\uFEFF/, '')), `${c} com a coluna matricula`).toBe(true)
  // O diário de hoje sem erro nenhum.
  const hoje = Object.keys(pasta).filter((c) => /^diagnostico\/.*\.log$/.test(c)).sort().at(-1)!
  expect(pasta[hoje].split('\n').filter((l) => /erro_/.test(l)).length, `${hoje} sem erro`).toBe(0)
  return pasta
}

test('com a chamada aberta, a versão nova espera; encerrada, entra sozinha, e os crachás continuam sendo as mesmas pessoas', async ({ page }) => {
  const erros: string[] = []
  await abrirNaVersaoDoAr(page, erros)
  const crachas = crachasDoCofre()
  expect(crachas.length).toBeGreaterThan(0)

  const antesDaAula = new Set((await eventosDaBase(page)).map((e) => e.id))
  await chamada(page, crachas)
  await expect.poll(async () => (await quemECada(page, antesDaAula)).size, { timeout: 15_000 }).toBe(crachas.length)
  const naVersaoDoAr = await quemECada(page, antesDaAula)

  // Deploy no meio da aula, e o professor recarrega.
  site.publicar(nova)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Encerrar a chamada' })).toBeVisible({ timeout: 20_000 })
  expect(await versaoRodando(page), 'no meio da chamada, a versão do ar continua').toContain(noAr.entrada)
  await encostar(page, crachas[0].uid) // a fila não parou

  const antes = { base: await contarBase(page), pasta: await lerPasta(page) }
  await page.getByRole('button', { name: 'Encerrar a chamada' }).click()
  // A versão nova entra sozinha depois que a chamada termina (confere a cada 30 s).
  await expect.poll(() => versaoRodando(page), { timeout: 90_000, intervals: [2000] }).toContain(nova.entrada)
  await expect(page.getByRole('button', { name: /Começar a chamada/ })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(3000)
  await conferirDepois(page, antes)

  // A mesma turma, na versão nova: cada crachá é a mesma pessoa de antes.
  const antesDaSegunda = new Set((await eventosDaBase(page)).map((e) => e.id))
  await chamada(page, crachas)
  await expect.poll(async () => (await quemECada(page, antesDaSegunda)).size, { timeout: 15_000 }).toBe(crachas.length)
  const naNova = await quemECada(page, antesDaSegunda)
  for (const { uidHash } of crachas) expect(naNova.get(uidHash)?.quem, `crachá ${uidHash.slice(0, 8)}`).toBe(naVersaoDoAr.get(uidHash)?.quem)
  expect([...naNova.values()].filter((c) => c.reconhecido).length).toBe([...naVersaoDoAr.values()].filter((c) => c.reconhecido).length)

  // Recarregar no meio da chamada, já na versão nova, não a fecha.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Encerrar a chamada' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Encerrar a chamada' }).click()

  expect(erros).toEqual([])
})

test('no dia seguinte, fora de aula: abrir o app já traz a versão nova, com tudo no lugar', async ({ page }) => {
  const erros: string[] = []
  await abrirNaVersaoDoAr(page, erros)
  const antes = { base: await contarBase(page), pasta: await lerPasta(page) }

  site.publicar(nova)
  await page.reload()
  await expect.poll(() => versaoRodando(page), { timeout: 60_000, intervals: [1000] }).toContain(nova.entrada)
  await expect(page.getByRole('button', { name: /Começar a chamada/ })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(3000)
  await conferirDepois(page, antes)

  // E fechar e abrir de novo, já na nova, continua igual.
  await page.reload()
  await expect(page.getByRole('button', { name: /Começar a chamada/ })).toBeVisible({ timeout: 20_000 })
  expect(await versaoRodando(page)).toContain(nova.entrada)
  expect(erros).toEqual([])
})
