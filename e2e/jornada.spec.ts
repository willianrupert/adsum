// A jornada de um professor, do zero ao SIGAA, no Google Chrome, como uma
// pessoa usaria: só pela tela e pelo crachá. Cada tipo de presença que existe
// acontece aqui, em três aulas de tamanhos diferentes (2, 4 e 12 aulas no
// dia), e no fim o favorito lança tudo na planilha do SIGAA e cada célula
// enviada no Gravar é conferida: presente vale 0, falta vale o máximo do dia.
//
// Tudo local: o Chrome pede `willianrupert.github.io` e `sigaa.ufpe.br`, e
// quem responde é o teste (`apoio/enderecos.ts`), com o build do commit e a
// planilha anonimizada da bancada. Com `ADSUM_RIG`, os crachás passam pelo
// rig S3, como teclado USB de verdade (`apoio/dongle.ts`).
//
// A planilha da bancada fica fora do repositório; sem ela, a jornada se pula.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PASTA_DA_BANCADA } from '../playwright.config.ts'
import { versao, type Versao } from './apoio/versoes.ts'
import { lerPasta, trocarSeletor } from './apoio/cofre.ts'
import { atenderEnderecos, SIGAA, SITE } from './apoio/enderecos.ts'
import { COM_RIG, desligarDongle, encostar, ligarDongle } from './apoio/dongle.ts'
import { alunosDaBancada, codigoDaBancada, paginaDeParticipantes, type AlunoDaBancada } from './apoio/turmaDaBancada.ts'

test.skip(!existsSync(join(PASTA_DA_BANCADA, 'planilha.html')), `sem a página da bancada em ${PASTA_DA_BANCADA} (ADSUM_BANCADA)`)
test.use({ channel: 'chrome', headless: !COM_RIG, serviceWorkers: 'block', actionTimeout: 15_000, screenshot: 'only-on-failure' })

const BANCADA = 'http://localhost:8080'
const PROFESSORA = 'HELENA DUARTE LIMA'

let nova: Versao
let alunos: AlunoDaBancada[]
let codigo: string

test.beforeAll(async () => {
  nova = versao(process.env.ADSUM_NOVA ?? 'HEAD')
  alunos = alunosDaBancada(PASTA_DA_BANCADA)
  codigo = codigoDaBancada(PASTA_DA_BANCADA)
  await ligarDongle()
})
test.afterAll(desligarDongle)

/** Crachás inventados, um por pessoa da jornada. */
const UID = { a: 'a1000001', b: 'a1000002', d: 'a1000004', e: 'a1000005', f: 'a1000006', x: 'a1000009', professora: 'b2000001' }

/** A linha do aluno na lista da chamada. A tela guarda o nome com só a inicial maiúscula. */
async function linha(page: Page, a: AlunoDaBancada) {
  const campo = page.getByLabel(new RegExp(`^nome de ${a.nomeCompleto}$`, 'i'))
  await expect(campo).toBeVisible()
  return page.locator('tr', { has: campo })
}

/** Crachá novo sem ninguém chamado: a busca abre, e o professor escolhe quem é. */
async function crachaNovoPelaBusca(page: Page, uid: string, a: AlunoDaBancada) {
  await encostar(page, uid)
  const busca = page.getByRole('dialog').filter({ has: page.getByLabel('Buscar na turma') })
  await busca.getByLabel('Buscar na turma').fill(a.nomeCompleto)
  await busca.getByRole('button', { name: new RegExp(a.nomeCompleto, 'i') }).click()
  await expect(busca).toHaveCount(0)
}

/** Encerra, confere o resumo (quantas presenças e que já está na pasta) e conclui. */
async function encerrar(page: Page, presencas: number) {
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click()
  await expect(page.getByText(/^Chamada encerrada/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(`${presencas}`, { exact: true })).toBeVisible()
  await expect(page.getByText(/Já está gravado na/)).toBeVisible()
  await page.getByRole('button', { name: 'Concluir' }).click()
}

/** No repouso: a turma pela seta, e Começar a chamada. */
async function abrirChamada(page: Page, turma: string) {
  const titulo = page.locator('.repouso__acao', { hasText: turma })
  for (let i = 0; i < 4 && !(await titulo.isVisible()); i++) await page.getByRole('button', { name: 'próxima turma' }).click()
  await expect(titulo).toBeVisible()
  await page.getByRole('button', { name: /Começar a chamada/ }).click()
  await expect(page.getByRole('button', { name: 'Encerrar', exact: true })).toBeVisible({ timeout: 15_000 })
}

/** Abre o app num dia: o relógio do navegador vai para lá, e a página recarrega. */
async function noDia(page: Page, quando: string) {
  await page.context().clock.setSystemTime(new Date(quando))
  await page.reload()
}

/** O favorito, como está no build: o `javascript:` que o professor arrasta dos Ajustes. */
function favoritoDoBuild(v: Versao): string {
  const assets = join(v.pasta, 'assets')
  for (const nome of readdirSync(assets).filter((n) => n.endsWith('.js'))) {
    // O nosso começa por `javascript:(function`; o React também tem textos com `javascript:`.
    const achado = /["'`](javascript:\(function[^"'`]+)["'`]/.exec(readFileSync(join(assets, nome), 'utf-8'))
    if (achado) return decodeURIComponent(achado[1].slice('javascript:'.length))
  }
  throw new Error('o build não tem o favorito')
}

interface Mudanca {
  matricula: string
  dia: string
  antes: string
  depois: string
}

test('do zero ao SIGAA: cadastro, três aulas com cada tipo de presença, e o lançamento conferido célula a célula', async ({ page, context }) => {
  test.setTimeout(10 * 60_000)
  // Só os do Adsum: a página do SIGAA tem erros próprios (o aviso de cookies,
  // que não veio na captura), e não são deste teste.
  const erros: string[] = []
  const doAdsum = (p: Page) => p.on('pageerror', (e) => p.url().startsWith(SITE) && erros.push(e.message))
  doAdsum(page)
  context.on('page', doAdsum)
  expect((await page.request.post(`${BANCADA}/bancada/reiniciar`)).ok()).toBe(true)
  await atenderEnderecos(context, nova)
  await trocarSeletor(page)

  const [A, B, C, D, E, F] = alunos
  const turma = `2026.2 - ${codigo} - TURMA A`

  await test.step('chega: o leitor, os créditos, a pasta e a turma colada do SIGAA', async () => {
    await context.clock.setSystemTime(new Date('2026-10-13T10:00:00-03:00'))
    await page.goto(SITE)
    await expect(page.getByText('Você vai precisar de um leitor de crachá USB')).toBeVisible()
    await expect(page.getByRole('button', { name: /Criado por/ })).toBeVisible()
    await page.getByRole('button', { name: 'Escolher pasta' }).click()
    await expect(page.getByRole('heading', { name: 'Cole sua primeira turma' })).toBeVisible()
    await page.getByLabel('turma', { exact: true }).fill(turma)
    await page.getByLabel('lista da turma').fill(paginaDeParticipantes(PROFESSORA, alunos))
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Depois' }).click()
  })

  await test.step('terça, 13/10 (2 aulas): busca, chamar, repetido, presente à mão, não presente', async () => {
    const comecar = page.getByRole('button', { name: /Começar a chamada/ })
    if (await comecar.isVisible().catch(() => false)) await comecar.click()
    await expect(page.getByRole('button', { name: 'Encerrar', exact: true })).toBeVisible({ timeout: 15_000 })

    await crachaNovoPelaBusca(page, UID.a, A)
    await (await linha(page, B)).getByRole('button', { name: 'Chamar' }).click()
    await encostar(page, UID.b)
    // Cadastrado pelo "Chamar", a fila anda sozinha para o próximo; desligar volta à busca.
    await page.getByRole('switch', { name: 'Chamar nomes' }).click()
    await expect(page.getByRole('switch', { name: 'Chamar nomes' })).not.toBeChecked()
    await encostar(page, UID.a) // repetido: não conta duas vezes
    await (await linha(page, C)).getByRole('button', { name: 'Presente' }).click()
    await crachaNovoPelaBusca(page, UID.d, D)
    await (await linha(page, D)).getByRole('button', { name: 'Não presente' }).click()
    await crachaNovoPelaBusca(page, UID.e, E)
    await crachaNovoPelaBusca(page, UID.f, F)
    await encerrar(page, 5)
  })

  await test.step('outra turma, com um aluno que não é desta', async () => {
    await page.getByRole('button', { name: 'Cadastrar nova turma' }).click()
    await page.getByLabel('turma', { exact: true }).fill('2026.2 - CIN9999 - TURMA B')
    await page.getByLabel('lista da turma').fill(paginaDeParticipantes(PROFESSORA, [{ matricula: '20269990001', nomeCompleto: 'DAVI SOUZA COSTA' }]))
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Depois' }).click()
    await abrirChamada(page, '2026.2 - CIN9999 - TURMA B')
    // O crachá da professora, cadastrado nesta turma, pelo painel de professores.
    await page.getByRole('heading', { name: /Professores/ }).click()
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click()
    await encostar(page, UID.professora)
    await expect(page.getByText('1 de 1 com crachá')).toBeVisible()
    await crachaNovoPelaBusca(page, UID.x, { matricula: '20269990001', nomeCompleto: 'DAVI SOUZA COSTA' })
    await encerrar(page, 1)
  })

  await test.step('quarta, 14/10 (4 aulas): dois crachás juntos, e o aluno de outra turma', async () => {
    await noDia(page, '2026-10-14T10:00:00-03:00')
    await abrirChamada(page, turma)
    await encostar(page, UID.a)
    // Dois cartões na mesma mão: o segundo chega antes do intervalo mínimo e não conta.
    await encostar(page, UID.e, { esperar: false })
    await encostar(page, UID.f, { esperar: false })
    await expect(page.getByText('Dois crachás quase juntos. O segundo não foi contado. Passe um de cada vez.')).toBeVisible()
    await page.waitForTimeout(600)
    await encostar(page, UID.x)
    await expect(page.getByText('Davi Souza é da turma 2026.2 - CIN9999 - TURMA B, não desta. A presença não foi contada.')).toBeVisible()
    await expect(page.getByText('Davi Souza, de outra turma')).toBeVisible()
    await expect(page.getByText('Dois crachás de uma vez')).toBeVisible()
    await encerrar(page, 2)
  })

  await test.step('quarta, 18/11 (12 aulas): o crachá da professora, e uma aula curta', async () => {
    await noDia(page, '2026-11-18T10:00:00-03:00')
    await abrirChamada(page, turma)
    // Cadastrada como professora na outra turma, ela é professora aqui também:
    // o crachá dela encerra a chamada (cedo demais, pede de novo), nunca vira "outra turma".
    await encostar(page, UID.professora)
    await expect(page.getByText(/^Para encerrar, encoste de novo em \d+ s\.$/)).toBeVisible()
    await expect(page.getByText(/não desta\. A presença não foi contada/)).toHaveCount(0)
    await encostar(page, UID.b)
    await encerrar(page, 1)
  })

  await test.step('a pasta: a planilha de faltas com a matrícula, e o log da turma', async () => {
    const pasta = await lerPasta(page)
    const faltas = Object.entries(pasta).find(([c]) => c.startsWith('faltas/') && c.includes(codigo))
    expect(faltas, 'planilha de faltas da turma').toBeDefined()
    expect(faltas![1].replace(/^﻿/, '').startsWith('nome;matricula;')).toBe(true)
    expect(Object.keys(pasta).some((c) => c.startsWith('registros/') && c.includes(codigo))).toBe(true)
    // O diário diz qual código rodou: o commit testado, para o zip de sexta ser ligado a ele.
    const diario = Object.entries(pasta).filter(([c]) => c.startsWith('diagnostico/')).map(([, t]) => t).join('\n')
    expect(diario).toContain(`| app_aberto | versao=`)
    expect(diario).toContain(`| commit=${nova.commit.slice(0, 7)} |`)
  })

  let gravado: Mudanca[] = []
  await test.step('o SIGAA: o favorito lê a planilha, a folha mostra as três aulas, Preencher e Gravar', async () => {
    await context.clock.setSystemTime(new Date('2026-11-19T08:00:00-03:00'))
    await page.goto(SIGAA)
    // O professor clica com a planilha na tela: os scripts do SIGAA a desenham depois do carregamento.
    await expect(page.locator('#planilha')).toBeVisible()
    const [janela] = await Promise.all([page.waitForEvent('popup'), page.evaluate(favoritoDoBuild(nova))])
    await expect(janela.getByRole('heading', { name: '3 aulas para lançar' })).toBeVisible({ timeout: 20_000 })
    await expect(janela.getByText('Ter, 13/10')).toBeVisible()
    await expect(janela.getByText('5 presentes, 40 faltas')).toBeVisible()
    await expect(janela.getByText('Qua, 14/10')).toBeVisible()
    await expect(janela.getByText('2 presentes, 43 faltas')).toBeVisible()
    await expect(janela.getByText('Qua, 18/11')).toBeVisible()
    await expect(janela.getByText('1 presente, 44 faltas')).toBeVisible()
    await expect(janela.getByText('Dia de 12 aulas: quem faltou leva 12 faltas.')).toBeVisible()
    await Promise.all([janela.waitForEvent('close'), janela.getByRole('button', { name: 'Preencher 3 aulas' }).click()])
    await expect(page.locator('[data-adsum="barra"]')).toContainText('Adsum preencheu 3 aulas')
    await page.getByRole('button', { name: 'Gravar Frequências' }).click()
    type Registro = { tipo: string; mudaram?: Mudanca[] }
    const doGravar = async () =>
      ((await (await page.request.get(`${BANCADA}/bancada/registros`)).json()) as Registro[]).filter((r) => r.tipo === 'Gravar').flatMap((r) => r.mudaram ?? [])
    await expect.poll(async () => (await doGravar()).length, { timeout: 20_000 }).toBeGreaterThan(0)
    gravado = await doGravar()
  })

  await test.step('cada célula enviada: presente vale 0, falta vale o máximo do dia', async () => {
    const presentesNoDia: Record<string, string[]> = {
      '13/10': [A, B, C, E, F].map((a) => a.matricula),
      '14/10': [A, E].map((a) => a.matricula),
      '18/11': [B].map((a) => a.matricula),
    }
    const maximo: Record<string, string> = { '13/10': '2', '14/10': '4', '18/11': '12' }
    expect(gravado).toHaveLength(alunos.length * 3)
    for (const m of gravado) {
      expect(m.antes, `${m.matricula} ${m.dia}`).toBe('null')
      const esperado = presentesNoDia[m.dia]?.includes(m.matricula) ? '0' : maximo[m.dia]
      expect(m.depois, `${m.matricula} ${m.dia}`).toBe(esperado)
    }
  })

  await test.step('o favorito de novo, na planilha reaberta: tudo confere', async () => {
    await page.goto(SIGAA)
    await expect(page.locator('#planilha')).toBeVisible()
    const [janela] = await Promise.all([page.waitForEvent('popup'), page.evaluate(favoritoDoBuild(nova))])
    await expect(janela.getByRole('heading', { name: 'Tudo confere' })).toBeVisible({ timeout: 20_000 })
  })

  expect(erros).toEqual([])
})
