// O que foi ao ar é o que foi testado, e abre. Só leitura: um Chrome de perfil
// limpo, sem pasta, sem turma, sem crachá. Roda depois de cada deploy; se
// falhar, o roteiro de volta está no `docs/07`, seção "Voltar atrás".

import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

// `ADSUM_SITE` aponta para outro endereço (um build servido localmente, para conferir este próprio teste).
const SITE = process.env.ADSUM_SITE ?? 'https://willianrupert.github.io/adsum/'
const NO_AR = !process.env.ADSUM_SITE
const MANUAL = 'https://raw.githubusercontent.com/willianrupert/adsum/main/docs/Adsum-manual-e-LGPD.docx'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf-8' }).trim()

function semErros(page: Page) {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  return erros
}

test('o deploy que está no ar é o da main, e terminou bem', () => {
  test.skip(!NO_AR, 'só faz sentido contra o site publicado')
  git('fetch', 'origin', 'main', '--quiet')
  const main = git('rev-parse', 'origin/main')
  const [ultimo] = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'publicar.yml', '--branch', 'main', '--limit', '1', '--json', 'headSha,status,conclusion'], { encoding: 'utf-8' })) as { headSha: string; status: string; conclusion: string }[]
  expect(ultimo, 'nenhum deploy encontrado').toBeDefined()
  expect(ultimo.status, 'o deploy ainda está rodando: espere terminar').toBe('completed')
  expect(ultimo.conclusion).toBe('success')
  expect(ultimo.headSha, 'o último deploy não é o commit da main').toBe(main)
})

test('o app abre, e o service worker toma conta (a próxima abertura funciona sem rede)', async ({ page }) => {
  const erros = semErros(page)
  await page.goto(SITE)
  await expect(page.getByRole('button', { name: 'Escolher pasta' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Você vai precisar de um leitor de crachá USB')).toBeVisible()
  await expect(page.getByRole('button', { name: /Criado por/ })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), undefined, { timeout: 20_000 })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 })
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Escolher pasta' })).toBeVisible({ timeout: 20_000 })
  await page.context().setOffline(false)
  expect(erros).toEqual([])
})

test('a vitrine mostra todas as telas, sem erro', async ({ page }) => {
  const erros = semErros(page)
  await page.goto(`${SITE}#/vitrine`)
  await expect(page.locator('.cena').first()).toBeVisible({ timeout: 20_000 })
  expect(await page.locator('.cena').count()).toBeGreaterThan(10)
  expect(erros).toEqual([])
})

test('a janela do SIGAA abre (e pede para ser aberta pela planilha)', async ({ page }) => {
  const erros = semErros(page)
  await page.goto(`${SITE}#/sigaa`)
  await expect(page.getByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeVisible({ timeout: 20_000 })
  expect(erros).toEqual([])
})

test('o manual que o botão "Manual e LGPD" abre está lá', async ({ request }) => {
  test.skip(!NO_AR, 'só faz sentido contra o site publicado')
  const resposta = await request.get(MANUAL)
  expect(resposta.status()).toBe(200)
  expect((await resposta.body()).subarray(0, 2).toString()).toBe('PK')
})
