// O favorito montado, como vai para a barra, numa página que troca os nativos
// como a planilha do SIGAA (`testes/prototypeDoSigaa.ts`). Achado no ensaio de
// 29/09: sem o iframe próprio, `entries()` trocado desmontava cada aluno, e o
// favorito dizia que o plano não conferia.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { conciliar } from '../nucleo/lancar/conciliar.ts'
import { lerPlanilha } from '../nucleo/lancar/leitura.ts'
import { planejar } from '../nucleo/lancar/plano.ts'
import { mensagemDePlano, mensagemDePronto, type MensagemDeLeitura } from '../nucleo/lancar/protocolo.ts'
import { cenarioDaBancada } from '../testes/cenarioDaBancada.ts'
import { montarPaginaDaPlanilha } from '../testes/paginaDaPlanilha.ts'
import { PLANILHA_CIN0114 } from '../testes/planilhaReal.ts'
import { trocarNativosComoOSigaa } from '../testes/prototypeDoSigaa.ts'
import { codigoDoFavorito, ENVIAR } from './construir.ts'
import { LOCALIZADOR_SIGAA } from './localizadorSigaa.ts'
import { TEXTOS } from './ligacao.ts'

// A mesma origem do jsdom: o `postMessage` de verdade só entrega à origem certa.
const ADSUM = { origem: window.location.origin, url: `${window.location.origin}/#/sigaa` }

let devolver = () => {}
afterEach(() => {
  devolver()
  devolver = () => {}
  document.body.innerHTML = ''
})

describe('o favorito numa página que troca os nativos, como o SIGAA', () => {
  it('lê, confere e preenche como numa página limpa', async () => {
    const codigo = await codigoDoFavorito({ destino: ADSUM })
    // A página do SIGAA num iframe: ambiente próprio, como uma aba, e as
    // trocas não chegam ao jsdom, que roda no ambiente do teste.
    const sigaa = document.createElement('iframe')
    document.body.appendChild(sigaa)
    const pagina = sigaa.contentWindow! as Window & typeof globalThis
    montarPaginaDaPlanilha(pagina.document, PLANILHA_CIN0114)

    // O plano, feito como o Adsum faria, antes de a página trocar qualquer coisa.
    const agora = new Date()
    const bruto = LOCALIZADOR_SIGAA.extrair(pagina.document)!
    const { leitura } = lerPlanilha(bruto, 'x', agora)
    const cenario = cenarioDaBancada(PLANILHA_CIN0114, agora)
    const plano = planejar(conciliar({ leitura: leitura!, turma: cenario.turma, matriculados: cenario.matriculados, eventos: cenario.eventos, ajustes: [] }), [])

    // A janela do Adsum: outro iframe, que só recebe.
    const adsum = document.createElement('iframe')
    document.body.appendChild(adsum)
    const janelaDoAdsum = adsum.contentWindow!
    const recebidas: { leitura: MensagemDeLeitura }[] = []
    janelaDoAdsum.addEventListener('message', (e) => recebidas.push({ leitura: e.data }))
    vi.spyOn(pagina, 'open').mockReturnValue(janelaDoAdsum)
    const doAdsum = (data: unknown) => pagina.dispatchEvent(new pagina.MessageEvent('message', { data, origin: ADSUM.origem, source: janelaDoAdsum }))

    devolver = trocarNativosComoOSigaa(pagina)
    const script = pagina.document.createElement('script')
    script.textContent = codigo
    pagina.document.body.appendChild(script)
    doAdsum(mensagemDePronto())
    await vi.waitFor(() => expect(recebidas).toHaveLength(1))
    const [{ leitura: leituraMandada }] = recebidas
    doAdsum(mensagemDePlano(leituraMandada.id, plano))
    const barra = pagina.document.querySelector('[data-adsum="barra"]')?.textContent
    devolver()

    // O Adsum só aceita a leitura da janela que o abriu, e o navegador dá como
    // remetente a de quem chama `postMessage`: o envio sai por uma função da
    // página. (O jsdom não preenche o remetente; o Chrome da bancada confere.)
    const iframe = pagina.document.querySelector<HTMLIFrameElement>('iframe[data-adsum="favorito"]')!
    const enviar = (iframe.contentWindow as unknown as Record<string, unknown>)[ENVIAR]
    expect(enviar).toBeInstanceOf(pagina.Function)
    expect(leituraMandada.bruto).toEqual(bruto)
    expect(barra).not.toContain(TEXTOS.naoConfere)
    expect(barra).toMatch(plano.length > 0 ? /^Adsum preencheu/ : /^Nada a preencher/)
    expect(pagina.document.querySelector('iframe[data-adsum="favorito"]')).not.toBeNull()
  }, 30_000)
})
