// A conferência do site publicado, logo depois de um deploy: `npm run
// conferir-no-ar`. Separada dos outros testes porque é a única que usa a
// internet: lê o site público, num Chrome de perfil limpo, e não grava nada.

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/no-ar',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], channel: 'chrome', trace: 'retain-on-failure' },
})
