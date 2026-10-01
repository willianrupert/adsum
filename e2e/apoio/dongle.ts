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

// `document.hasFocus()` não serve de trava: com o Playwright ele diz que tem
// foco mesmo com outra janela na frente, e em 01/10/2026 o rig digitou três
// crachás na janela de outro programa. Quem responde é o macOS: o processo da
// frente tem de ser o Chrome do teste, conferido logo antes de cada crachá.
// Dentro do Chrome, quem põe o foco na página é o `bringToFront`; o teste que
// usa o rig bloqueia a rede, para um crachá fora do lugar não sair da máquina.
const osascript = (script: string) => execFileSync('osascript', ['-e', script], { encoding: 'utf-8' }).trim()
const pidDoChrome = () => execFileSync('pgrep', ['-f', '-o', 'playwright_chromiumdev_profile'], { encoding: 'utf-8' }).trim().split('\n')[0]
const naFrente = () => osascript('tell application "System Events" to unix id of first process whose frontmost is true')

async function focar(page: Page) {
  // Sempre: é o que tira o cursor da barra de endereço e o põe na página. O
  // Chrome recém-aberto começa nela, e lá o crachá vira busca na internet
  // (01/10/2026).
  const chrome = pidDoChrome()
  const jaNaFrente = naFrente() === chrome
  await page.bringToFront()
  if (!jaNaFrente) {
    if (naFrente() !== chrome) osascript(`tell application "System Events" to set frontmost of (first process whose unix id is ${chrome}) to true`)
    await page.waitForTimeout(DEPOIS_DE_TROCAR_A_JANELA_MS)
  }
  if (naFrente() !== chrome) throw new Error('outra janela está na frente: o rig não digita, para não escrever nela')
}

async function digitar(page: Page, uidHex: string) {
  const texto = comoODongleImprime(uidHex)
  if (rig) await rig.digitar(texto)
  else {
    await page.keyboard.type(texto, { delay: 8 })
    await page.keyboard.press('Enter')
  }
}

/**
 * Encosta um crachá, e espera o intervalo mínimo antes do próximo. Sem a
 * espera, é o segundo cartão na mesma mão.
 */
export async function encostar(page: Page, uidHex: string) {
  await encostarJuntos(page, [uidHex])
}

/**
 * Os cartões na mesma mão, um logo depois do outro: o foco é conferido uma
 * vez só, porque a conferência leva mais que o intervalo mínimo entre eles.
 */
export async function encostarJuntos(page: Page, uids: string[]) {
  if (rig) await focar(page)
  for (const uid of uids) await digitar(page, uid)
  await page.waitForTimeout(ENTRE_CRACHAS_MS)
}
