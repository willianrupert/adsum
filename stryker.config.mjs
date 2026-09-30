// Mutação sobre o núcleo do lançamento no SIGAA (`docs/11`, item 4 de "O que
// falta melhorar"): a prova de que os testes pegam defeito, que nos passos 20,
// 23 e 30 foi feita à mão, uma regra desligada por vez. Roda por comando, de
// vez em quando (`npm run test:mutacao`), não a cada commit: leva minutos.
//
// Mutante que sobrevive é teste faltando, ou código que não faz diferença.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutacao.config.ts' },
  mutate: ['src/nucleo/lancar/**/*.ts', '!src/nucleo/lancar/**/*.test.ts', '!src/nucleo/lancar/tipos.ts'],
  coverageAnalysis: 'perTest',
  // Mutantes em valores fixos (constantes de módulo) derrubariam a suíte
  // inteira a cada um; o ganho não paga o tempo.
  ignoreStatic: true,
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutacao/index.html' },
  // Guarda o resultado e, na vez seguinte, só refaz o que o código ou os
  // testes mudaram: a rodada inteira leva ~30 min.
  incremental: true,
  incrementalFile: 'reports/mutacao/incremental.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
}
