import { describe, expect, it, vi } from 'vitest'
import { mensagemDeLeitura, mensagemDePlano, mensagemDePronto, ORIGEM_SIGAA, VERSAO_DO_FAVORITO } from '../../nucleo/lancar/protocolo.ts'
import type { LeituraRecebida } from '../../nucleo/lancar/protocolo.ts'
import { PonteJanela } from './PonteJanela.ts'

function montar(comAbridora = true) {
  const abridora = { postMessage: vi.fn() }
  const janela = Object.assign(new EventTarget(), { opener: comAbridora ? abridora : null }) as unknown as Window
  const ponte = new PonteJanela(janela)
  const recebidas: LeituraRecebida[] = []
  ponte.aoLer((r) => recebidas.push(r))
  const chegar = (data: unknown, origin = ORIGEM_SIGAA, source: unknown = abridora) =>
    janela.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))
  return { abridora, janela, ponte, recebidas, chegar }
}

describe('PonteJanela: a janela do Adsum aberta pelo favorito', () => {
  it('ao iniciar, avisa quem a abriu que está pronta, só para a origem do SIGAA', () => {
    const { ponte, abridora } = montar()
    ponte.iniciar()
    expect(abridora.postMessage).toHaveBeenCalledWith(mensagemDePronto(), ORIGEM_SIGAA)
  })

  it('entrega a leitura que chega da planilha', () => {
    const { ponte, chegar, recebidas } = montar()
    ponte.iniciar()
    chegar(mensagemDeLeitura('l-1', { bruto: true }))
    expect(recebidas).toEqual([{ ok: true, id: 'l-1', bruto: { bruto: true } }])
  })

  it('ignora o que não veio de quem a abriu: outra origem, outra janela', () => {
    const { ponte, chegar, recebidas } = montar()
    ponte.iniciar()
    chegar(mensagemDeLeitura('l-1', {}), 'https://exemplo.com')
    chegar(mensagemDeLeitura('l-1', {}), ORIGEM_SIGAA, { outra: true })
    expect(recebidas).toEqual([])
  })

  it('de quem a abriu, formato estranho ou favorito antigo vira recusa, para a folha dizer o que fazer', () => {
    const { ponte, chegar, recebidas } = montar()
    ponte.iniciar()
    chegar({ ...mensagemDeLeitura('l-1', {}), versaoFavorito: VERSAO_DO_FAVORITO + 1 })
    chegar('texto qualquer')
    expect(recebidas).toEqual([
      { ok: false, motivo: 'versaoDoFavorito' },
      { ok: false, motivo: 'formato' },
    ])
  })

  it('devolve o plano só para a origem do SIGAA, nunca para qualquer uma', () => {
    const { ponte, abridora } = montar()
    ponte.iniciar()
    const instrucoes = [{ linha: 0, coluna: 0, antes: 'vazia' as const, valor: 2 }]
    expect(ponte.entregar('l-1', instrucoes)).toBe(true)
    expect(abridora.postMessage).toHaveBeenLastCalledWith(mensagemDePlano('l-1', instrucoes), ORIGEM_SIGAA)
    expect(abridora.postMessage.mock.calls.every(([, origem]) => origem === ORIGEM_SIGAA)).toBe(true)
  })

  it('aberta sem favorito, não está ligada e não tem a quem entregar', () => {
    const { ponte } = montar(false)
    expect(ponte.ligada()).toBe(false)
    ponte.iniciar()
    expect(ponte.entregar('l-1', [])).toBe(false)
  })

  it('com outra origem configurada (a bancada local), só ela vale, e só para ela vai o plano', () => {
    const abridora = { postMessage: vi.fn() }
    const janela = Object.assign(new EventTarget(), { opener: abridora }) as unknown as Window
    const ponte = new PonteJanela(janela, 'http://localhost:8080')
    const recebidas: LeituraRecebida[] = []
    ponte.aoLer((r) => recebidas.push(r))
    ponte.iniciar()
    expect(abridora.postMessage).toHaveBeenCalledWith(mensagemDePronto(), 'http://localhost:8080')
    const chegar = (origin: string) => janela.dispatchEvent(Object.assign(new Event('message'), { data: mensagemDeLeitura('l-1', {}), origin, source: abridora }))
    chegar(ORIGEM_SIGAA)
    chegar('http://localhost:8080')
    expect(recebidas).toEqual([{ ok: true, id: 'l-1', bruto: {} }])
    ponte.entregar('l-1', [])
    expect(abridora.postMessage).toHaveBeenLastCalledWith(mensagemDePlano('l-1', []), 'http://localhost:8080')
  })

  it('parada, não ouve mais', () => {
    const { ponte, chegar, recebidas } = montar()
    ponte.iniciar()
    ponte.parar()
    chegar(mensagemDeLeitura('l-1', {}))
    expect(recebidas).toEqual([])
  })
})
