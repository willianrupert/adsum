#!/usr/bin/env node
// "Pode publicar?", respondido pela máquina, com os motivos. É a regra da
// semana estável (`CLAUDE.md`, "Como uma mudança chega à sala") lida das
// verificações que o `npm run verificar` anotou:
//
//   - o código do app passou no `verificar` há pelo menos 7 dias, e de novo
//     nas últimas 24 horas, sem mudar entre as duas (teste e documento podem);
//   - pelo menos uma dessas com o rig S3, como teclado USB de verdade;
//   - nada do app fora de commit, e o commit já no GitHub.
//
// O que a máquina não sabe ver fica perguntado no fim: o zip de sexta e o
// ensaio com o dongle. A exceção (conserto de falha vista em sala) é decisão
// de quem publica, e está no `CLAUDE.md`.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { appSujo, commitAtual, impressaoDoApp, REGISTRO } from './codigoDoApp.mjs'

const DIA = 24 * 60 * 60 * 1000
const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim()
const agora = Date.now()

const verificacoes = existsSync(REGISTRO)
  ? readFileSync(REGISTRO, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []
const app = impressaoDoApp()
const desteApp = verificacoes.filter((v) => v.app === app).sort((a, b) => a.quando.localeCompare(b.quando))
const primeira = desteApp[0]
const ultima = desteApp.at(-1)
const idade = (v) => (agora - Date.parse(v.quando)) / DIA
const data = (v) => new Date(v.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

git('fetch', 'origin', '--quiet')
const ramo = git('rev-parse', '--abbrev-ref', 'HEAD')
const noGitHub = (() => {
  try {
    return git('rev-parse', `origin/${ramo}`) === git('rev-parse', 'HEAD')
  } catch {
    return false
  }
})()
const mudancasDoApp = git('diff', '--stat', 'origin/main', 'HEAD', '--', 'src', 'public', 'index.html').split('\n').at(-1) || 'nenhuma'

const criterios = [
  [!appSujo(), 'o app está todo em commit', 'há mudança no app fora de commit: comite, e o verificar recomeça a contar'],
  [noGitHub, `o commit ${commitAtual()} já está no GitHub (${ramo})`, `o commit ${commitAtual()} não está no GitHub: envie antes (git push)`],
  [Boolean(primeira) && idade(primeira) >= 7, primeira ? `este código passou pela primeira vez em ${data(primeira)} (${idade(primeira).toFixed(1)} dias)` : '', primeira ? `este código passou pela primeira vez em ${data(primeira)}: faltam ${(7 - idade(primeira)).toFixed(1)} dias para a semana` : 'este código nunca passou no npm run verificar'],
  [Boolean(ultima) && idade(ultima) <= 1, ultima ? `e passou de novo em ${data(ultima)}` : '', ultima ? `a última aprovação é de ${data(ultima)}: rode npm run verificar de novo agora` : 'rode npm run verificar'],
  [desteApp.some((v) => v.rig), 'pelo menos uma vez com o rig S3', 'nenhuma aprovação com o rig: rode npm run verificar:rig uma vez'],
]

console.log(`\n  Pode publicar ${commitAtual()}? (o que muda no app em relação ao ar: ${mudancasDoApp})\n`)
for (const [ok, sim, nao] of criterios) console.log(`  ${ok ? '✓' : '✗'} ${ok ? sim : nao}`)
const pode = criterios.every(([ok]) => ok)
console.log('\n  E o que só você vê:')
console.log('  ? o zip de sexta do professor, lido: diário sem recusa, divergência ou erro sem dono')
console.log('  ? o ensaio curto com o dongle de verdade (docs/07): rádio e o "Liberar" da pasta')
console.log(pode ? '\n  Sim, pelo que a máquina consegue ver. Com as duas acima, publique (docs/07, "O deploy").\n' : '\n  Ainda não.\n')
process.exit(pode ? 0 : 1)
