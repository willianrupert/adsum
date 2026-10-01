#!/usr/bin/env node
// "Pode publicar?", respondido pela máquina, com os motivos. É a regra do
// `CLAUDE.md` ("Como uma mudança chega à sala", desde 01/10/2026) lida das
// verificações que o `npm run verificar` anotou:
//
//   - o código do app passou no `verificar` nas últimas 24 horas, sem teste
//     pulado (teste e documento podem mudar depois; o app, não);
//   - pelo menos uma vez com o rig S3, como teclado USB de verdade;
//   - nada do app fora de commit, e o commit já no GitHub.
//
// O ensaio com o dongle de verdade só é exigido quando o caminho do crachá
// depois do dongle mudou em relação ao ar (`CAMINHO_DA_LEITURA`): sem isso, o
// que o rig não cobre é o que já roda em sala.
//
// O que a máquina não sabe ver fica perguntado no fim: o ensaio, quando
// exigido, o zip mais recente, e o momento (logo depois de uma aula, nunca na
// véspera). A primeira semana de uso real, depois de publicar, é a semana
// estável: os zips dela são lidos, e problema neles é voltar atrás.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { appSujo, commitAtual, commitNoAr, impressaoDoApp, leituraMudou, REGISTRO } from './codigoDoApp.mjs'

const DIA = 24 * 60 * 60 * 1000
const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim()
const agora = Date.now()

const verificacoes = existsSync(REGISTRO)
  ? readFileSync(REGISTRO, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []
const app = impressaoDoApp()
const desteApp = verificacoes.filter((v) => v.app === app).sort((a, b) => a.quando.localeCompare(b.quando))
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
const noAr = commitNoAr()
const mudancasDoApp = git('diff', '--stat', noAr, 'HEAD', '--', 'src', 'public', 'index.html').split('\n').at(-1) || 'nenhuma'

const criterios = [
  [!appSujo(), 'o app está todo em commit', 'há mudança no app fora de commit: comite, e o verificar recomeça a contar'],
  [noGitHub, `o commit ${commitAtual()} já está no GitHub (${ramo})`, `o commit ${commitAtual()} não está no GitHub: envie antes (git push)`],
  [Boolean(ultima) && idade(ultima) <= 1, ultima ? `este código passou no npm run verificar em ${data(ultima)}` : '', ultima ? `a última aprovação deste código é de ${data(ultima)}: rode npm run verificar de novo agora` : 'este código nunca passou no npm run verificar'],
  [desteApp.some((v) => v.rig), 'pelo menos uma vez com o rig S3', 'nenhuma aprovação com o rig: rode npm run verificar:rig uma vez'],
]

console.log(`\n  Pode publicar ${commitAtual()}? (o que muda no app em relação ao ar: ${mudancasDoApp})\n`)
for (const [ok, sim, nao] of criterios) console.log(`  ${ok ? '✓' : '✗'} ${ok ? sim : nao}`)
const pode = criterios.every(([ok]) => ok)
const leitura = await leituraMudou(noAr)
console.log(
  leitura.length === 0
    ? '  ✓ o caminho do crachá depois do dongle não mudou em relação ao ar: o ensaio com o dongle não é exigido'
    : `  ! o caminho do crachá mudou em relação ao ar (${leitura.map((c) => c.split('/').pop()).join(', ')}): o ensaio com o dongle é exigido`,
)
console.log('\n  E o que só você vê:')
if (leitura.length > 0) console.log('  ? o ensaio curto com o dongle de verdade (docs/07): o rádio e o que o dongle digita')
console.log('  ? o zip mais recente do professor, lido: diário sem recusa, divergência ou erro sem dono')
console.log('  ? logo depois de uma aula, com dias até a próxima, e você disponível nela')
console.log(pode ? `\n  Sim, pelo que a máquina consegue ver. Com ${leitura.length > 0 ? 'as três' : 'as duas'} acima, publique (docs/07, "O deploy").\n  Depois: npm run conferir-no-ar, e os zips da primeira semana.\n` : '\n  Ainda não.\n')
process.exit(pode ? 0 : 1)
