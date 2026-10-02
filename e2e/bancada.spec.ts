// O favorito no Chrome, sobre a planilha real anonimizada com os scripts do
// SIGAA: o ensaio dos passos 22 e 28 do `docs/11`, que era feito à mão.
//
// Os números não são fixos: dependem do dia (a leitura bloqueia o futuro) e do
// cenário da bancada. O que se confere é que eles fecham entre si: o que a
// janela do Adsum promete, o que a planilha mostra e o que o Gravar envia.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PASTA_DA_BANCADA } from '../playwright.config.ts'

const BANCADA = 'http://localhost:8080'

interface Mudanca {
  aluno: string
  dia: string
  antes: string
  depois: string
}
interface Registro {
  tipo: 'Gravar' | 'salvamento automático'
  mudaram?: Mudanca[]
  erro?: string
}

test.skip(!existsSync(join(PASTA_DA_BANCADA, 'planilha.html')), `sem a página da bancada em ${PASTA_DA_BANCADA} (ADSUM_BANCADA)`)

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${BANCADA}/bancada/reiniciar`)).ok()).toBe(true)
})

const registros = async (page: Page): Promise<Registro[]> => (await page.request.get(`${BANCADA}/bancada/registros`)).json()

/** Clica no favorito e devolve a janela do Adsum já com a folha lida. */
async function abrirFolha(planilha: Page): Promise<Page> {
  const [janela] = await Promise.all([planilha.waitForEvent('popup'), planilha.locator('#bancada-favorito').click()])
  await expect(janela.getByRole('heading', { level: 1 })).not.toHaveText('Lendo a planilha', { timeout: 15_000 })
  return janela
}

/** O que a folha promete: aulas marcadas e, somando os cartões, presenças e faltas. */
async function promessa(janela: Page) {
  const titulo = (await janela.getByRole('heading', { level: 1 }).textContent()) ?? ''
  const aulas = Number(/^(\d+) aulas? para lançar$/.exec(titulo)?.[1])
  let presentes = 0
  let faltas = 0
  for (const texto of await janela.locator('.folha-sigaa__aula small').allTextContents()) {
    const m = /^(\d+) presentes?, (\d+) faltas?$/.exec(texto)
    if (!m) continue
    presentes += Number(m[1])
    faltas += Number(m[2])
  }
  return { aulas, presentes, faltas, celulas: presentes + faltas }
}

async function preencher(planilha: Page) {
  const janela = await abrirFolha(planilha)
  const prometido = await promessa(janela)
  expect(prometido.aulas).toBeGreaterThan(0)
  await Promise.all([janela.waitForEvent('close'), janela.getByRole('button', { name: /^Preencher \d+ aulas?$/ }).click()])
  const barra = planilha.locator('[data-adsum="barra"]')
  await expect(barra).toContainText(`Adsum preencheu ${prometido.aulas} aula`)
  return { prometido, barra }
}

/** As células pintadas de falta (azul forte), contadas na página. */
const faltasPintadas = (planilha: Page) =>
  planilha.evaluate(() => [...document.querySelectorAll<HTMLElement>('#planilha td')].filter((td) => td.style.fontWeight === '700').length)

async function conferirTudoIgual(planilha: Page) {
  const janela = await abrirFolha(planilha)
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Tudo confere')
  await expect(janela.getByText(/^SIGAA e Adsum iguais em \d+ aulas?\./)).toBeVisible()
}

test('Preencher, Desfazer, Preencher e Gravar: o SIGAA recebe exatamente o que a folha prometeu', async ({ page }) => {
  // A página salva já tem erros próprios ao carregar (o aviso de cookies, que
  // não veio na captura). Conta só o que aparece depois, e o da janela do Adsum.
  const daPagina = new Set<string>()
  const erros: string[] = []
  let carregou = false
  page.on('pageerror', (e) => (carregou ? !daPagina.has(e.message) && erros.push(e.message) : daPagina.add(e.message)))
  page.context().on('page', (p) => p.on('pageerror', (e) => erros.push(`Adsum: ${e.message}`)))
  await page.goto(BANCADA)
  await page.waitForLoadState('load')
  carregou = true

  const { prometido, barra } = await preencher(page)
  if (prometido.faltas > 0) await expect(barra).toContainText(`${prometido.faltas === 1 ? 'a falta' : `as ${prometido.faltas} faltas`}`)
  expect(await faltasPintadas(page)).toBe(prometido.faltas)

  const antes = await page.locator('[id="form:frequencias"]').inputValue()
  await barra.getByRole('button', { name: 'Desfazer' }).click()
  await expect(barra).toContainText('Desfeito. A planilha voltou ao que estava.')
  expect(await faltasPintadas(page)).toBe(0)
  expect(await page.locator('[id="form:frequencias"]').inputValue()).toBe(antes)

  const segundo = await preencher(page)
  expect(segundo.prometido).toEqual(prometido)
  await Promise.all([page.waitForURL(/gravado=/), page.getByRole('button', { name: 'Gravar Frequências' }).click()])

  const gravados = (await registros(page)).filter((r) => r.tipo === 'Gravar')
  expect(gravados).toHaveLength(1)
  const [gravado] = gravados
  expect(gravado.erro).toBeUndefined()
  // Só células vazias viram número, e são tantas quantas a folha mostrou.
  expect(gravado.mudaram).toHaveLength(prometido.celulas)
  expect(gravado.mudaram!.every((m) => m.antes === 'null' && /^\d+$/.test(m.depois))).toBe(true)
  expect(gravado.mudaram!.filter((m) => m.depois !== '0')).toHaveLength(prometido.faltas)
  expect(new Set(gravado.mudaram!.map((m) => m.dia)).size).toBe(prometido.aulas)

  await conferirTudoIgual(page)
  expect(erros).toEqual([])
})

test('o salvamento automático do SIGAA leva o preenchimento sozinho, e a barra deixa de oferecer Desfazer', async ({ page }) => {
  await page.clock.install()
  await page.goto(BANCADA)
  const { prometido, barra } = await preencher(page)
  await expect(barra.getByRole('button', { name: 'Desfazer' })).toBeVisible()

  // O `A4J.AJAX.Poll` da página é de 5 minutos (`docs/12`).
  await page.clock.fastForward('05:05')
  await expect(barra).toContainText('O SIGAA já salvou o preenchimento.')
  await expect(barra.getByRole('button', { name: 'Desfazer' })).toHaveCount(0)

  await expect.poll(async () => (await registros(page)).filter((r) => r.tipo === 'salvamento automático').flatMap((r) => r.mudaram ?? []).length).toBe(prometido.celulas)
  await conferirTudoIgual(page)
})

test('a janela do Adsum deixada aberta recarrega com a leitura nova a cada clique', async ({ page }) => {
  await page.goto(BANCADA)
  const primeira = await abrirFolha(page)
  const leitura = new URL(primeira.url()).searchParams.get('leitura')

  // Clicar de novo com a janela aberta: o navegador a reaproveita pelo nome.
  await page.locator('#bancada-favorito').click()
  await expect.poll(() => new URL(primeira.url()).searchParams.get('leitura')).not.toBe(leitura)
  await expect(primeira.getByRole('heading', { level: 1 })).toHaveText(/aulas? para lançar$/, { timeout: 15_000 })

  // E a leitura nova é a que o favorito espera: o plano é aceito.
  await Promise.all([primeira.waitForEvent('close'), primeira.getByRole('button', { name: /^Preencher \d+ aulas?$/ }).click()])
  await expect(page.locator('[data-adsum="barra"]')).toContainText('Adsum preencheu')
})

test('o favorito roda com os nativos do navegador, mesmo com o Prototype da página trocando os dela', async ({ page }) => {
  await page.goto(BANCADA)
  // A premissa: a página troca mesmo os nativos. Se um dia não trocar, este teste perde o motivo.
  expect(await page.evaluate(() => Array.from.toString().includes('[native code]'))).toBe(false)
  await preencher(page)
  expect(await page.locator('iframe[data-adsum="favorito"]').count()).toBeGreaterThan(0)
})

test('a aba fechada antes de gravar, e reaberta: o Adsum oferece de novo o mesmo, e o SIGAA recebe uma vez só', async ({ page, context }) => {
  // Relógio parado: o salvamento automático não dispara antes de a aba fechar.
  await page.clock.install()
  await page.goto(BANCADA)
  const { prometido } = await preencher(page)
  await page.close()
  expect(await registros(page)).toEqual([])

  const reaberta = await context.newPage()
  await reaberta.goto(BANCADA)
  const segundo = await preencher(reaberta)
  expect(segundo.prometido).toEqual(prometido)
  await Promise.all([reaberta.waitForURL(/gravado=/), reaberta.getByRole('button', { name: 'Gravar Frequências' }).click()])

  const gravados = await registros(reaberta)
  expect(gravados).toHaveLength(1)
  expect(gravados[0].mudaram).toHaveLength(prometido.celulas)
  await conferirTudoIgual(reaberta)
})

test('a aba fechada depois do salvamento automático, e reaberta: tudo confere, e nada é preenchido de novo', async ({ page, context }) => {
  await page.clock.install()
  await page.goto(BANCADA)
  const { prometido } = await preencher(page)
  await page.clock.fastForward('05:05')
  await expect.poll(async () => (await registros(page)).flatMap((r) => r.mudaram ?? []).length).toBe(prometido.celulas)
  await page.close()

  const reaberta = await context.newPage()
  await reaberta.goto(BANCADA)
  await conferirTudoIgual(reaberta)
  expect((await registros(reaberta)).flatMap((r) => r.mudaram ?? [])).toHaveLength(prometido.celulas)
})
