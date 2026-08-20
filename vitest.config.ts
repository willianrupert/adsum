import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // O carimbo da build vem de `vite.config.ts`, que o vitest não usa. Sem isto,
  // qualquer tela que o mostre estoura no teste por um motivo que não é do app.
  define: { __CARIMBO__: JSON.stringify('em teste') },
  test: {
    // jsdom para todos: o núcleo não se importa, e as telas precisam.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/testes/preparo.ts'],
    restoreMocks: true,
  },
})
