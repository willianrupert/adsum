#!/usr/bin/env node
// A bancada do SIGAA: a planilha de frequência de verdade, anonimizada, rodando
// no computador, com os scripts do próprio SIGAA. Nenhuma requisição chega à
// UFPE: os endereços da página são reescritos para cá, e esta bancada responde
// ao Gravar e ao salvamento automático guardando o que a página enviaria no
// `form:frequencias`. Ver `docs/12_planilha_sigaa.md` e o passo 18 do `docs/11`.
//
// A página vem de `scripts/anonimizar_sigaa.py --pagina` e fica fora do
// repositório: tem os scripts do SIGAA (software da UFRN).
//
// Uso:
//   node scripts/bancada_sigaa.mjs PASTA_DA_PAGINA [--porta 8080]
// A pasta tem `planilha.html` e a pasta de arquivos que a página referencia.
// Com o Adsum em `npm run dev` (5173), abra http://localhost:8080.

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cenarioDaBancada } from '../src/testes/cenarioDaBancada.ts'

export { cenarioDaBancada }

export const ORIGEM_DO_ADSUM = 'http://localhost:5173'
const ID_MAT = 0
const MAT = 1
const DIA = 3
const MES = 4
const NUM_FALTAS = 5

const registrosDe = (texto) => texto.split(';').filter(Boolean).map((r) => r.split(','))

/** As células que mudaram entre dois estados de `form:frequencias`. */
export function diferencas(antes, depois) {
  const a = registrosDe(antes)
  const d = registrosDe(depois)
  if (a.length !== d.length) return { erro: `${d.length} registros, esperado ${a.length}` }
  const mudaram = []
  d.forEach((r, i) => {
    if (r[NUM_FALTAS] !== a[i][NUM_FALTAS]) {
      mudaram.push({ aluno: r[ID_MAT], matricula: r[MAT], dia: `${r[DIA].padStart(2, '0')}/${r[MES].padStart(2, '0')}`, antes: a[i][NUM_FALTAS], depois: r[NUM_FALTAS] })
    }
  })
  return { mudaram }
}

/** A página como a bancada a serve: o estado atual, tudo apontando para cá, e o botão do favorito de ensaio. */
export function reescreverPagina(html, { auxAlunos, aviso }) {
  let pagina = html
    .replace(/var auxAlunos = "[^"]*"/, `var auxAlunos = "${auxAlunos}"`)
    .replace(/(id="form:frequencias" type="hidden" name="form:frequencias" value=")[^"]*"/, `$1${auxAlunos}"`)
    .replaceAll('https://sigaa.ufpe.br', '')
    // A tabela salva já desenhada sairia duplicada: a página a redesenha a partir dos dados.
    .replace(/(<div id="basePlanilha">)<table id="planilha">[\s\S]*?<\/table>(<\/div>)/, '$1$2')
  const botao = `
<div id="bancada" style="position:fixed;top:8px;right:8px;z-index:2147483647;display:flex;gap:8px;align-items:center;font:14px -apple-system,system-ui,sans-serif">
  ${aviso ? `<span style="background:#e8f2fd;color:#0071e3;padding:6px 10px;border-radius:8px">${aviso}</span>` : ''}
  <button type="button" id="bancada-favorito" style="font:inherit;border:0;border-radius:999px;padding:8px 14px;background:#0071e3;color:#fff;cursor:pointer">Favorito (ensaio)</button>
</div>
<script>
  document.getElementById('bancada-favorito').addEventListener('click', function () {
    var s = document.createElement('script');
    s.src = '/bancada/favorito.js?' + Date.now();
    document.body.appendChild(s);
  });
</script>`
  pagina = pagina.replace(/<\/body>/i, `${botao}</body>`)
  return pagina
}

/** A resposta vazia que o Ajax4jsf aceita no salvamento automático. */
export const RESPOSTA_AJAX =
  '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="Ajax-Response" content="true" /></head><body></body></html>'

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jsf': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }

async function iniciar(pasta, porta) {
  const { codigoDoFavorito } = await import('../src/favorito/construir.ts')
  const favorito = await codigoDoFavorito({ destino: { origem: ORIGEM_DO_ADSUM, url: `${ORIGEM_DO_ADSUM}/?bancada#/sigaa` } })
  const original = readFileSync(join(pasta, 'planilha.html'), 'utf-8')
  const dados = (nome) => new RegExp(`var ${nome} = "([^"]*)"`).exec(original)?.[1] ?? ''
  const legenda = /<legend>([^<]*)<\/legend>/.exec(original)?.[1] ?? ''
  const estado = { auxAlunos: dados('auxAlunos'), registros: [] }
  const raiz = resolve(pasta)

  const servidor = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${porta}`)
    const cors = { 'Access-Control-Allow-Origin': ORIGEM_DO_ADSUM }

    if (req.method === 'POST' && url.pathname.endsWith('/FrequenciaAluno/formPlanilha.jsf')) {
      let corpo = ''
      req.on('data', (parte) => (corpo += parte))
      req.on('end', () => {
        const campos = new URLSearchParams(corpo)
        const frequencias = campos.get('form:frequencias') ?? ''
        const salvamento = campos.has('AJAXREQUEST')
        const resultado = diferencas(estado.auxAlunos, frequencias)
        const registro = { quando: new Date().toISOString(), tipo: salvamento ? 'salvamento automático' : 'Gravar', ...resultado }
        estado.registros.push(registro)
        if (!resultado.erro) estado.auxAlunos = frequencias
        const quantas = resultado.erro ? `recusado: ${resultado.erro}` : `${resultado.mudaram.length} célula(s) mudaram`
        console.log(`[bancada] ${registro.tipo}: ${quantas}`)
        for (const m of resultado.mudaram ?? []) console.log(`           aluno ${m.aluno}, ${m.dia}: ${m.antes} → ${m.depois}`)
        if (salvamento) {
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=UTF-8', 'Ajax-Response': 'true' })
          return res.end(RESPOSTA_AJAX)
        }
        res.writeHead(303, { Location: `/sigaa/ava/index.jsf?gravado=${resultado.mudaram?.length ?? 0}` })
        res.end()
      })
      return
    }

    if (url.pathname === '/bancada/favorito.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      return res.end(favorito)
    }
    if (url.pathname === '/bancada/registros') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
      return res.end(JSON.stringify(estado.registros, null, 1))
    }
    if (url.pathname === '/bancada/cenario.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
      return res.end(JSON.stringify(cenarioDaBancada({ legenda, auxAulas: dados('auxAulas'), auxAlunos: dados('auxAlunos') })))
    }
    if (url.pathname === '/' ) {
      res.writeHead(302, { Location: '/sigaa/ava/index.jsf' })
      return res.end()
    }
    if (url.pathname === '/sigaa/ava/index.jsf') {
      const gravado = url.searchParams.get('gravado')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(reescreverPagina(original, { auxAlunos: estado.auxAlunos, aviso: gravado !== null ? `Bancada: Gravar recebido, ${gravado} célula(s) mudaram.` : '' }))
    }

    // Os arquivos da página (scripts e estilos do SIGAA), só de dentro da pasta.
    const relativo = decodeURIComponent(url.pathname).replace(/^\/sigaa\/ava\//, '').replace(/^\//, '')
    const arquivo = resolve(raiz, relativo)
    if (arquivo.startsWith(raiz) && existsSync(arquivo) && statSync(arquivo).isFile()) {
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' })
      return res.end(readFileSync(arquivo))
    }
    res.writeHead(404)
    res.end()
  })
  servidor.listen(porta, () => console.log(`[bancada] http://localhost:${porta} (Adsum em ${ORIGEM_DO_ADSUM})`))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argumentos = process.argv.slice(2)
  const i = argumentos.indexOf('--porta')
  const porta = i >= 0 ? Number(argumentos[i + 1]) : 8080
  const pasta = argumentos.find((a, k) => !a.startsWith('--') && argumentos[k - 1] !== '--porta')
  if (!pasta || !existsSync(join(pasta, 'planilha.html'))) {
    console.error('Uso: node scripts/bancada_sigaa.mjs PASTA_DA_PAGINA [--porta 8080]')
    process.exit(2)
  }
  await iniciar(pasta, porta)
}
