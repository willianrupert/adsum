import { afterEach, describe, expect, it, vi } from 'vitest'
import { mensagemDeLeitura, mensagemDePlano, mensagemDePronto } from '../nucleo/lancar/protocolo.ts'
import { brutoDaLeitura, gerarCenario } from '../testes/planilhaSigaa.ts'
import { PaginaSigaaFalsa } from '../testes/paginaSigaaFalsa.ts'
import { lancarPeloFavorito } from './ligacao.ts'

const ADSUM = 'https://willianrupert.github.io'
const DESTINO = { origem: ADSUM, url: `${ADSUM}/adsum/#/sigaa` }

/** Depois de todas as aulas dos cenários: nada é futuro. */
const AGORA = () => new Date('2026-12-20T12:00:00')
const LEITURA = gerarCenario(3).leitura

function montar(abrirFalha = false) {
  const pagina = new PaginaSigaaFalsa(brutoDaLeitura(LEITURA))
  const janela = new EventTarget()
  const popup = { postMessage: vi.fn() }
  const abrir = vi.fn(() => (abrirFalha ? null : popup))
  const chegar = (data: unknown, origin = ADSUM, source: unknown = popup) =>
    janela.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))
  lancarPeloFavorito({ pagina, janela, abrir, destino: DESTINO, gerarId: () => 'l-1', agora: AGORA })
  return { pagina, popup, abrir, chegar }
}

/** As células vazias com máximo, para planos pequenos. */
function celulasLivres() {
  const livres = LEITURA.linhas.flatMap((l) =>
    l.celulas.flatMap((c, j) => (c.tipo === 'vazia' && LEITURA.colunas[j].maximo !== undefined ? [{ linha: l.indice, coluna: j }] : [])),
  )
  if (livres.length < 2) throw new Error('cenário sem células livres')
  return livres
}
const celulaLivre = () => celulasLivres()[0]

describe('o favorito na planilha', () => {
  it('abre a janela do Adsum encostada, e só manda a leitura quando ela avisa que está pronta', () => {
    const { abrir, popup, chegar, pagina } = montar()
    // Cada clique, um endereço: a janela do Adsum deixada aberta recarrega, em vez de mostrar a leitura velha.
    expect(abrir).toHaveBeenCalledWith(`${ADSUM}/adsum/?leitura=l-1#/sigaa`, 'adsum-sigaa', expect.stringContaining('popup'))
    expect(popup.postMessage).not.toHaveBeenCalled()
    chegar(mensagemDePronto())
    expect(popup.postMessage).toHaveBeenCalledWith(mensagemDeLeitura('l-1', pagina.extrair()), ADSUM)
  })

  it('um segundo "pronto" (a janela recarregou) manda a leitura de novo', () => {
    const { popup, chegar } = montar()
    chegar(mensagemDePronto())
    chegar(mensagemDePronto())
    expect(popup.postMessage).toHaveBeenCalledTimes(2)
  })

  it('preenche o plano, pinta, e a barra diz quantas aulas e oferece Desfazer', () => {
    const { chegar, pagina } = montar()
    const { linha, coluna } = celulaLivre()
    chegar(mensagemDePronto())
    chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
    expect(pagina.valor(linha, coluna)).toBe('0')
    expect(pagina.barra?.texto).toMatch(/^Adsum preencheu 1 aula\./)
    pagina.barra!.aoDesfazer!()
    expect(pagina.valor(linha, coluna)).toBe('')
    expect(pagina.barra?.texto).toBe('Desfeito. A planilha voltou ao que estava.')
  })

  describe('o salvamento automático do SIGAA (opção A)', () => {
    afterEach(() => vi.useRealTimers())

    it('com faltas, a barra diz quantas, e que estão em azul forte', () => {
      const { chegar, pagina } = montar()
      const { linha, coluna } = celulaLivre()
      chegar(mensagemDePronto())
      chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 2 }]))
      expect(pagina.barra?.texto).toBe(
        'Adsum preencheu 1 aula. Azul é o que mudou, e a falta está em azul forte. O SIGAA salva sozinho em até 5 minutos, ou agora, em Gravar Frequências.',
      )
    })

    it('a barra diz que o SIGAA salva sozinho, e o Desfazer vale enquanto a página não coletou', () => {
      const { chegar, pagina } = montar()
      const { linha, coluna } = celulaLivre()
      chegar(mensagemDePronto())
      chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
      expect(pagina.barra?.texto).toBe(
        'Adsum preencheu 1 aula. Azul é o que mudou. O SIGAA salva sozinho em até 5 minutos, ou agora, em Gravar Frequências.',
      )
      pagina.barra!.aoDesfazer!()
      expect(pagina.valor(linha, coluna)).toBe('')
    })

    it('depois da coleta da página, a barra tira o Desfazer e diz como corrigir', () => {
      vi.useFakeTimers()
      const { chegar, pagina } = montar()
      const { linha, coluna } = celulaLivre()
      chegar(mensagemDePronto())
      chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
      pagina.coletar()
      vi.advanceTimersByTime(1000)
      expect(pagina.barra?.texto).toBe('O SIGAA já salvou o preenchimento. Para mudar uma célula, clique nela, como sempre.')
      expect(pagina.barra?.aoDesfazer).toBeUndefined()
    })

    it('Desfazer clicado logo depois da coleta não desfaz, e não diz que desfez', () => {
      vi.useFakeTimers()
      const { chegar, pagina } = montar()
      const { linha, coluna } = celulaLivre()
      chegar(mensagemDePronto())
      chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
      const desfazer = pagina.barra!.aoDesfazer!
      pagina.coletar()
      desfazer()
      expect(pagina.valor(linha, coluna)).toBe('0')
      expect(pagina.barra?.texto).toBe('O SIGAA já salvou o preenchimento. Para mudar uma célula, clique nela, como sempre.')
    })
  })

  it('diz quantas células o professor mexeu no meio tempo e ficaram como ele deixou', () => {
    const { chegar, pagina } = montar()
    const { linha, coluna } = celulaLivre()
    chegar(mensagemDePronto())
    pagina.digitar(linha, coluna, '1')
    chegar(mensagemDePlano('l-1', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
    expect(pagina.valor(linha, coluna)).toBe('1')
    expect(pagina.barra?.texto).toMatch(/1 célula mudou depois da leitura e ficou como você deixou/)
  })

  it('"nada a lançar" não escreve nada e diz isso', () => {
    const { chegar, pagina } = montar()
    chegar(mensagemDePronto())
    chegar(mensagemDePlano('l-1', []))
    expect(pagina.escritas).toBe(0)
    expect(pagina.barra?.texto).toBe('Nada a preencher. SIGAA e Adsum já estão iguais.')
  })

  it('plano que não confere com a página: nada é preenchido', () => {
    const { chegar, pagina } = montar()
    chegar(mensagemDePronto())
    chegar(mensagemDePlano('l-1', [{ linha: 0, coluna: 0, antes: 'vazia', valor: 99 }]))
    expect(pagina.escritas).toBe(0)
    expect(pagina.barra?.texto).toBe('O plano do Adsum não confere com esta página. Nada foi preenchido.')
  })

  it('ignora o que não veio da janela que ele abriu, e plano de outra leitura', () => {
    const { chegar, pagina, popup } = montar()
    const { linha, coluna } = celulaLivre()
    chegar(mensagemDePronto(), 'https://exemplo.com')
    chegar(mensagemDePronto(), ADSUM, { outra: true })
    expect(popup.postMessage).not.toHaveBeenCalled()
    chegar(mensagemDePronto())
    chegar(mensagemDePlano('l-0', [{ linha, coluna, antes: 'vazia', valor: 0 }]))
    expect(pagina.escritas).toBe(0)
  })

  it('depois de preencher, para de ouvir: um segundo plano não escreve nada', () => {
    const { chegar, pagina } = montar()
    const [primeira, segunda] = celulasLivres()
    chegar(mensagemDePronto())
    chegar(mensagemDePlano('l-1', [{ ...primeira, antes: 'vazia', valor: 0 }]))
    chegar(mensagemDePlano('l-1', [{ ...segunda, antes: 'vazia', valor: 0 }]))
    expect(pagina.escritas).toBe(1)
    expect(pagina.valor(segunda.linha, segunda.coluna)).toBe('')
  })

  it('fora da planilha, não abre janela e diz onde clicar', () => {
    const pagina = new PaginaSigaaFalsa(undefined)
    const abrir = vi.fn()
    lancarPeloFavorito({ pagina, janela: new EventTarget(), abrir, destino: DESTINO, gerarId: () => 'x' })
    expect(abrir).not.toHaveBeenCalled()
    expect(pagina.barra?.texto).toBe('Esta página não é a planilha de frequência. Abra "Lançar Freq. em Planilha" no SIGAA e clique no favorito de novo.')
  })

  it('janela bloqueada pelo navegador: diz como liberar', () => {
    const { pagina } = montar(true)
    expect(pagina.barra?.texto).toBe('O navegador bloqueou a janela do Adsum. Permita janelas para o SIGAA e clique no favorito de novo.')
  })
})
