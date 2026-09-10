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
    // `vi.useFakeTimers` de um arquivo vazava pro relógio de outro rodando em
    // paralelo — achado batendo cinquenta crachás em sequência, onde o
    // primeiro toque falhava sempre que este arquivo corria junto com outro
    // que também mexe no relógio. Suíte pequena: rodar em série não pesa —
    // mediu mais rápido que em paralelo, e sem falso negativo.
    fileParallelism: false,
  },
})
