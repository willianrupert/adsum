// O teste em navegador de verdade: a bancada do SIGAA (`scripts/bancada_sigaa.mjs`)
// com os scripts da própria página, e o Adsum em desenvolvimento. É o que o
// jsdom não prova: o Prototype e o Ext trocando os nativos, o remetente do
// `postMessage`, as duas janelas e o salvamento automático (`docs/11`, passo 22).
//
// A página anonimizada fica fora do repositório. Sem ela, os testes se pulam.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export const PASTA_DA_BANCADA = resolve(process.env.ADSUM_BANCADA ?? '../Adsum_bancada_sigaa')
const temPagina = existsSync(join(PASTA_DA_BANCADA, 'planilha.html'))

export default defineConfig({
  testDir: 'e2e',
  // Uma bancada só, com estado: os casos correm um de cada vez.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  // A lista no terminal; o relatório HTML para rever depois, com o vídeo de
  // cada teste e o trace do que falhou; e o JSON que o `npm run verificar` lê
  // para dizer o que foi pulado por falta de dados.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/resultado.json' }],
  ],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', video: 'on' },
  webServer: temPagina
    ? [
        { command: `node scripts/bancada_sigaa.mjs "${PASTA_DA_BANCADA}"`, url: 'http://localhost:8080/bancada/registros', reuseExistingServer: true },
        { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
      ]
    : undefined,
})
