#!/usr/bin/env node
// Tudo o que diz se o Adsum está bom, num comando só, nesta máquina:
// lint, tipos, os testes de unidade e os de navegador (a bancada do SIGAA, a
// jornada inteira e a atualização sobre o cofre real). Para na primeira etapa
// que falhar, e no fim abre o relatório do Playwright, com o vídeo de cada
// teste de navegador e o trace do que falhou.
//
//   npm run verificar          os crachás pelo teclado do Playwright
//   npm run verificar:rig      os crachás pelo rig S3, como teclado USB
//
// Teste pulado por falta de dados (a planilha da bancada, o cofre) aparece no
// resumo como pulado, nunca como passou: verde que não rodou é a mentira que
// este comando existe para não contar.

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { appSujo, commitAtual, impressaoDoApp, REGISTRO } from './codigoDoApp.mjs'

const COM_RIG = process.argv.includes('--rig')
const ETAPAS = [
  { nome: 'lint', comando: ['npx', 'oxlint', 'src', 'e2e', 'scripts'] },
  { nome: 'tipos', comando: ['npx', 'tsc', '-b'] },
  { nome: 'unidade', comando: ['npx', 'vitest', 'run'] },
  { nome: 'navegador', comando: ['npx', 'playwright', 'test'], ambiente: COM_RIG ? { ADSUM_RIG: 'auto' } : {} },
]

const rodar = (comando, ambiente = {}) =>
  new Promise((pronto) => {
    const filho = spawn(comando[0], comando.slice(1), { stdio: 'inherit', env: { ...process.env, ...ambiente } })
    filho.on('close', (codigo) => pronto(codigo ?? 1))
  })

const segundos = (ms) => `${(ms / 1000).toFixed(0)} s`
const resumo = []
let falhou

for (const etapa of ETAPAS) {
  console.log(`\n━━ ${etapa.nome} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  const inicio = Date.now()
  const codigo = await rodar(etapa.comando, etapa.ambiente)
  resumo.push({ etapa: etapa.nome, ok: codigo === 0, tempo: segundos(Date.now() - inicio) })
  if (codigo !== 0) {
    falhou = etapa.nome
    break
  }
}

// O que o Playwright pulou, e por quê (a razão vem do `test.skip` de cada arquivo).
let pulados = []
const json = 'test-results/resultado.json'
if (existsSync(json) && resumo.some((r) => r.etapa === 'navegador')) {
  const andar = (suite, arquivo) => [
    ...(suite.specs ?? []).flatMap((s) =>
      s.tests.flatMap((t) => t.results.filter((r) => r.status === 'skipped').map(() => ({ arquivo: arquivo ?? suite.title, titulo: s.title, motivo: t.annotations.find((a) => a.type === 'skip')?.description }))),
    ),
    ...(suite.suites ?? []).flatMap((s) => andar(s, arquivo ?? suite.title)),
  ]
  pulados = JSON.parse(readFileSync(json, 'utf-8')).suites.flatMap((s) => andar(s))
}

console.log('\n━━ resumo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
for (const r of resumo) console.log(`  ${r.ok ? '✓' : '✗'} ${r.etapa.padEnd(10)} ${r.tempo}`)
for (const e of ETAPAS.slice(resumo.length)) console.log(`  · ${e.nome.padEnd(10)} não rodou`)
if (pulados.length > 0) {
  console.log(`\n  ⚠ ${pulados.length} teste(s) de navegador PULADO(S), não passaram:`)
  for (const p of pulados) console.log(`    - ${p.arquivo} › ${p.titulo}${p.motivo ? `: ${p.motivo}` : ''}`)
}
console.log(falhou ? `\n  Falhou em: ${falhou}.` : pulados.length > 0 ? '\n  Passou, com testes pulados (acima).' : '\n  Tudo passou.')

// Aprovado de verdade (nada falhou, nada pulado, o app num commit): fica
// anotado, para o `npm run pode-publicar` contar a semana estável.
if (!falhou && pulados.length === 0) {
  if (appSujo()) {
    console.log('\n  Não anotado para a publicação: há mudança no app fora de commit.')
  } else {
    appendFileSync(REGISTRO, JSON.stringify({ quando: new Date().toISOString(), commit: commitAtual(), app: impressaoDoApp(), rig: COM_RIG }) + '\n')
    console.log(`\n  Anotado para a publicação: ${commitAtual()}${COM_RIG ? ', com o rig' : ''}.`)
  }
}

if (resumo.some((r) => r.etapa === 'navegador') && existsSync('playwright-report/index.html')) {
  console.log('\n  Relatório com os vídeos: abrindo (npm run relatorio abre de novo).\n')
  spawn('npx', ['playwright', 'show-report'], { stdio: 'ignore', detached: true }).unref()
}
process.exit(falhou ? 1 : 0)
