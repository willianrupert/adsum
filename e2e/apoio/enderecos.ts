// Os endereços de verdade, atendidos daqui: o Chrome do teste pede
// `willianrupert.github.io/adsum` e recebe o build local; pede `sigaa.ufpe.br`
// e recebe a bancada (a planilha real anonimizada, com os scripts do SIGAA).
// Nenhuma requisição sai da máquina, e o código roda com as origens exatas
// que tem no ar: o favorito publicado, a origem do SIGAA conferida pelo Adsum.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type { BrowserContext } from '@playwright/test'
import type { Versao } from './versoes.ts'

export const SITE = 'https://willianrupert.github.io/adsum/'
export const SIGAA = 'https://sigaa.ufpe.br/sigaa/ava/index.jsf'

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

/** Bloqueia toda saída para a rede, e atende os dois endereços. */
export async function atenderEnderecos(contexto: BrowserContext, versao: Versao, bancada = 'http://localhost:8080') {
  await contexto.route('**/*', async (rota) => {
    const url = new URL(rota.request().url())
    if (url.origin === 'https://willianrupert.github.io' && url.pathname.startsWith('/adsum/')) {
      const relativo = url.pathname.slice('/adsum/'.length) || 'index.html'
      const arquivo = resolve(versao.pasta, relativo)
      if (!arquivo.startsWith(versao.pasta) || !existsSync(arquivo) || !statSync(arquivo).isFile()) return rota.fulfill({ status: 404 })
      return rota.fulfill({ body: readFileSync(arquivo), contentType: TIPOS[extname(arquivo)] ?? 'application/octet-stream' })
    }
    if (url.origin === 'https://sigaa.ufpe.br') {
      // O redirecionamento depois do Gravar é seguido aqui: devolver um 303
      // atendido pelo teste o Chrome recusa como resposta de navegação.
      return rota.fulfill({ response: await rota.fetch({ url: `${bancada}${url.pathname}${url.search}` }) })
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') return rota.continue()
    return rota.abort()
  })
}
