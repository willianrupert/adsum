// As duas versões do Adsum que a atualização junta: a que está no ar e a que
// vai ao ar, montadas a partir dos commits (nunca da pasta de trabalho, que
// pode ter mudança pela metade), e servidas no mesmo endereço, como o GitHub
// Pages serve: trocar a pasta servida é publicar.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '../..')
const CACHE = join(RAIZ, 'node_modules/.cache/adsum-versoes')
const git = (...args: string[]) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf-8' }).trim()

export interface Versao {
  commit: string
  pasta: string
  /** O script de entrada do build (`index-<hash>.js`): é como a página diz qual versão está rodando. */
  entrada: string
}

/**
 * O commit que está no site: o do último deploy que terminou bem. A `main`
 * não serve: com o deploy falho, ela fica à frente do site, e a atualização
 * testada sairia de uma versão que nunca esteve no ar (01/10/2026). Sem o
 * `gh`, cai na `main`, e diz.
 */
export function commitNoAr(): string {
  try {
    const [ultimo] = JSON.parse(
      execFileSync('gh', ['run', 'list', '--workflow', 'publicar.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'headSha'], { cwd: RAIZ, encoding: 'utf-8' }),
    ) as { headSha: string }[]
    if (ultimo) return ultimo.headSha
  } catch {
    // sem o gh, ou sem rede: abaixo
  }
  console.warn('  ⚠ não deu para saber o commit do último deploy (gh): usando origin/main como a versão do ar')
  return 'origin/main'
}

/** Monta um commit como o deploy monta (`base` `/adsum/`), uma vez só por commit. */
export function versao(referencia: string): Versao {
  const commit = git('rev-parse', referencia)
  const pasta = join(CACHE, commit)
  if (!existsSync(join(pasta, 'index.html'))) {
    const fonte = join(CACHE, `fonte-${commit}`)
    rmSync(fonte, { recursive: true, force: true })
    mkdirSync(CACHE, { recursive: true })
    git('worktree', 'add', '--detach', fonte, commit)
    try {
      execFileSync('npm', ['ci', '--silent', '--no-audit', '--no-fund'], { cwd: fonte, stdio: 'ignore' })
      execFileSync('npm', ['run', 'build'], { cwd: fonte, stdio: 'ignore', env: { ...process.env, BASE_ADSUM: '/adsum/' } })
      cpSync(join(fonte, 'dist'), pasta, { recursive: true })
    } finally {
      git('worktree', 'remove', '--force', fonte)
    }
  }
  const entrada = /src="\/adsum\/assets\/(index-[^"]+\.js)"/.exec(readFileSync(join(pasta, 'index.html'), 'utf-8'))?.[1]
  if (!entrada) throw new Error(`build de ${commit} sem script de entrada`)
  return { commit, pasta, entrada }
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

/** Uma página vazia na mesma origem, para semear a pasta antes de o app abrir. */
export const PAGINA_VAZIA = '/vazia.html'

export interface Hospedagem {
  url: string
  publicar(v: Versao): void
  fechar(): Promise<void>
}

export async function hospedar(porta: number): Promise<Hospedagem> {
  let atual: Versao | undefined
  const servidor: Server = createServer((req, res) => {
    const caminho = new URL(req.url ?? '/', 'http://x').pathname
    if (caminho === PAGINA_VAZIA) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end('<!doctype html><meta charset="utf-8"><title>vazia</title>')
    }
    if (!atual || !caminho.startsWith('/adsum/')) {
      res.writeHead(404)
      return res.end()
    }
    const relativo = caminho.slice('/adsum/'.length) || 'index.html'
    const arquivo = resolve(atual.pasta, relativo)
    if (!arquivo.startsWith(atual.pasta) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
      res.writeHead(404)
      return res.end()
    }
    // Sem cache HTTP: quem decide o que fica guardado é o service worker, como no Pages.
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(readFileSync(arquivo))
  })
  await new Promise<void>((pronto) => servidor.listen(porta, pronto))
  return {
    url: `http://localhost:${porta}`,
    publicar: (v) => (atual = v),
    fechar: () => new Promise((fim) => servidor.close(() => fim())),
  }
}
