// A suíte que o Stryker usa (`stryker.config.mjs`): só os testes do núcleo do
// lançamento, que é onde as mutações acontecem.
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config.ts'

export default mergeConfig(base, defineConfig({ test: { include: ['src/nucleo/lancar/**/*.test.ts'] } }))
