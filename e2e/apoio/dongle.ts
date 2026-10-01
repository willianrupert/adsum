// O dongle dos testes em navegador: o rig S3 quando `ADSUM_RIG` está ligado
// (teclado USB de verdade), senão o teclado do Playwright. Os dois digitam o
// UID como o dongle imprime, decimal de 10 dígitos, e Enter.
//
// O teclado do rig digita onde estiver o foco do sistema. Antes de cada
// crachá, a janela do teste vem para a frente e o foco é conferido: uma
// rajada fora do lugar é texto e Enter na janela de outra pessoa.

import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { abrirRig, acharRig, type Rig } from './rig.ts'

/** Acima do intervalo mínimo entre crachás diferentes (400 ms). */
export const ENTRE_CRACHAS_MS = 500

/** Sem rig, o teste roda sem janela; com ele, precisa de uma para ter foco. */
export const COM_RIG = Boolean(process.env.ADSUM_RIG)

export const comoODongleImprime = (uidHex: string) => String(Number.parseInt(uidHex, 16)).padStart(10, '0')

let rig: Rig | undefined

export async function ligarDongle() {
  if (!COM_RIG || rig) return
  const caminho = process.env.ADSUM_RIG === 'auto' ? await acharRig() : process.env.ADSUM_RIG
  if (!caminho) throw new Error('ADSUM_RIG pedido, e nenhum rig da Espressif conectado')
  rig = await abrirRig(caminho)
}

export async function desligarDongle() {
  await rig?.fechar()
  rig = undefined
}

/**
 * Logo depois de trocar de janela, o macOS ainda entrega as teclas com
 * atraso: a rajada chega devagar e o app a recusa, com razão (01/10/2026,
 * sempre no primeiro crachá). Em sala o Chrome já está na frente.
 */
const DEPOIS_DE_TROCAR_A_JANELA_MS = 1500

/** Página no meio de uma navegação (a versão nova entrando) ainda não tem foco para dar. */
const temFoco = (page: Page) => page.evaluate(() => document.hasFocus()).catch(() => false)

async function focar(page: Page) {
  if (await temFoco(page)) return
  await page.bringToFront()
  if (!(await temFoco(page))) {
    // O Chrome do teste é outro processo do mesmo app do professor: traz o dele, pelo pid.
    const pid = execFileSync('pgrep', ['-f', '-o', 'playwright_chromiumdev_profile'], { encoding: 'utf-8' }).trim().split('\n')[0]
    execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`])
  }
  await page.waitForTimeout(DEPOIS_DE_TROCAR_A_JANELA_MS)
  if (!(await temFoco(page))) throw new Error('a janela do teste não está em foco: o rig não digita, para não escrever em outra janela')
}

/**
 * Encosta um crachá, e espera o intervalo mínimo antes do próximo. Sem a
 * espera, é o segundo cartão na mesma mão.
 */
export async function encostar(page: Page, uidHex: string, { esperar = true } = {}) {
  const texto = comoODongleImprime(uidHex)
  if (rig) {
    await focar(page)
    await rig.digitar(texto)
  } else {
    await page.keyboard.type(texto, { delay: 8 })
    await page.keyboard.press('Enter')
  }
  if (esperar) await page.waitForTimeout(ENTRE_CRACHAS_MS)
}
