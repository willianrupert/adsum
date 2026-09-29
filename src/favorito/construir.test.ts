// O favorito como ele vai para a barra do professor, conferido no próprio
// código gerado: pequeno, e sem nada que o `docs/08` proíbe.

import { beforeAll, describe, expect, it } from 'vitest'
import { codigoDoFavorito, construirFavorito, TETO_DO_FAVORITO } from './construir.ts'
import { DESTINO } from './destino.ts'

let codigo: string
let favorito: string

beforeAll(async () => {
  favorito = await construirFavorito()
  codigo = decodeURIComponent(favorito.slice('javascript:'.length))
}, 30_000)

describe('o favorito da bancada', () => {
  it('troca o destino na hora de gerar, não por algo que a página pudesse mudar', async () => {
    const local = { origem: 'http://localhost:5173', url: 'http://localhost:5173/?bancada#/sigaa' }
    const deEnsaio = await codigoDoFavorito({ destino: local })
    expect(deEnsaio).toContain('http://localhost:5173/?bancada#/sigaa')
    expect(deEnsaio).not.toContain(DESTINO.url)
    expect(deEnsaio).not.toMatch(/__ADSUM|window\.DESTINO|globalThis\.DESTINO/)
  }, 30_000)
})

describe('o favorito gerado', () => {
  it('é um javascript: pequeno', () => {
    expect(favorito.startsWith('javascript:')).toBe(true)
    expect(favorito.length).toBeLessThan(TETO_DO_FAVORITO)
  })

  it('conhece o Adsum pela origem exata', () => {
    expect(codigo).toContain(DESTINO.origem)
  })

  it('o publicado nunca aponta para uma bancada local', () => {
    expect(codigo).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it.each([
    ['requisição própria ao SIGAA ou a qualquer lugar', /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/],
    ['clicar em botão da página', /\.click\(/],
    ['enviar formulário', /\.submit\(|requestSubmit/],
    ['navegar', /location\s*\.\s*(href\s*=|assign|replace)|location\s*=/],
    ['executar o que recebe', /\beval\(|new Function|setTimeout\(\s*["'`]/],
    ['mandar mensagem para qualquer origem', /postMessage\([^)]*["'`]\*["'`]/],
    ['guardar algo no navegador do SIGAA', /localStorage|sessionStorage|indexedDB|document\.cookie/],
  ])('não contém: %s', (_, proibido) => {
    expect(codigo).not.toMatch(proibido)
  })

  it('não leva o app junto', () => {
    expect(codigo).not.toMatch(/react|dexie/i)
  })
})
