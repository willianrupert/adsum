import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { pluginDoFavorito } from './src/favorito/construir.ts'

export default defineConfig({
  plugins: [react(), pluginDoFavorito()],
  // O carimbo da build vem de `vite.config.ts`, que o vitest não usa. Sem isto,
  // qualquer tela que o mostre estoura no teste por um motivo que não é do app.
  define: { __CARIMBO__: JSON.stringify('em teste'), __COMMIT__: JSON.stringify('em teste') },
  test: {
    // jsdom para todos: o núcleo não se importa, e as telas precisam.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    setupFiles: ['./src/testes/preparo.ts'],
    restoreMocks: true,
    // Um processo por arquivo (`forks`, o padrão), e os arquivos em paralelo:
    // o relógio falso de um não alcança o de outro. Em 30/09/2026 a suíte
    // caiu de ~270 s para ~65 s e rodou 20 vezes seguidas sem falso negativo.
    // Antes rodava em série, por um vazamento de `vi.useFakeTimers` visto
    // quando os arquivos dividiam processo (`docs/04_historico.md`).
    pool: 'forks',
  },
})
