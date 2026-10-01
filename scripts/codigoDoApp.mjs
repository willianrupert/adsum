// A impressão digital do código que vai ao ar: o que entra no build, e nada
// mais. Teste e documento mudam sem mudar o app, e sem recomeçar a semana
// estável (`CLAUDE.md`, "Como uma mudança chega à sala").

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { createHash } from 'node:crypto'

/** O que entra no build. Do `package.json`, só as dependências: um comando novo em `scripts` não muda o app. */
export const DO_APP = ['src', 'public', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package-lock.json']

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim()

/** O hash, no commit, de cada caminho que entra no build, juntos. */
export function impressaoDoApp(commit = 'HEAD') {
  const pacote = JSON.parse(git('show', `${commit}:package.json`))
  const dependencias = createHash('sha1').update(JSON.stringify([pacote.dependencies, pacote.devDependencies])).digest('hex')
  return [...DO_APP.map((c) => `${c}:${git('rev-parse', `${commit}:${c}`)}`), `dependencias:${dependencias}`].join(' ')
}

/** Mudança no app ainda fora de commit: o que se testou não é um commit. */
export function appSujo() {
  if (git('status', '--porcelain', '--', ...DO_APP) !== '') return true
  const agora = JSON.parse(readFileSync('package.json', 'utf-8'))
  const noCommit = JSON.parse(git('show', 'HEAD:package.json'))
  return JSON.stringify([agora.dependencies, agora.devDependencies]) !== JSON.stringify([noCommit.dependencies, noCommit.devDependencies])
}

export const commitAtual = () => git('rev-parse', '--short=7', 'HEAD')

/** Onde ficam as verificações aprovadas, uma por linha (fora do repositório: `.gitignore`). */
export const REGISTRO = '.verificacoes.jsonl'
