// O clique no favorito, do começo ao fim (`docs/08`, camadas 4 e 5): ler a
// página, abrir a janela do Adsum, esperar o "pronto", mandar a leitura,
// receber o plano, conferir, preencher e oferecer Desfazer.
//
// Tudo o que toca o mundo chega por parâmetro, para o teste trocar: a página,
// a janela que ouve, e o jeito de abrir a outra.

import { mensagemDeLeitura, receberPlano, receberPronto } from '../nucleo/lancar/protocolo.ts'
import { aplicar, conferirContraBruto, desfazer } from './aplicar.ts'
import type { PaginaDePlanilha } from './pagina.ts'

export interface Destino {
  /** A origem do Adsum, conferida em cada mensagem. */
  origem: string
  /** A folha: `#/sigaa`. */
  url: string
}

interface JanelaQueRecebe {
  postMessage(mensagem: unknown, origem: string): void
}

export interface Dependencias {
  pagina: PaginaDePlanilha
  janela: EventTarget
  abrir: (url: string, nome: string, recursos: string) => JanelaQueRecebe | null | undefined
  destino: Destino
  gerarId: () => string
}

/** Encostada à direita, do tamanho de uma folha: o esboço do `docs/09`. */
const RECURSOS = 'popup,width=420,height=640,left=10000,top=80'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export const TEXTOS = {
  naoEhAPlanilha: 'Esta página não é a planilha de frequência. Abra "Lançar Freq. em Planilha" no SIGAA e clique no favorito de novo.',
  bloqueada: 'O navegador bloqueou a janela do Adsum. Permita janelas para o SIGAA e clique no favorito de novo.',
  nada: 'Nada a preencher. SIGAA e Adsum já estão iguais.',
  naoConfere: 'O plano do Adsum não confere com esta página. Nada foi preenchido.',
  desfeito: 'Desfeito. A planilha voltou ao que estava.',
}

export function lancarPeloFavorito({ pagina, janela, abrir, destino, gerarId }: Dependencias): void {
  const bruto = pagina.extrair()
  if (!bruto) return pagina.mostrarBarra({ texto: TEXTOS.naoEhAPlanilha })

  const id = gerarId()
  const aberta = abrir(destino.url, 'adsum-sigaa', RECURSOS)
  if (!aberta) return pagina.mostrarBarra({ texto: TEXTOS.bloqueada })

  const ouvir = (evento: Event) => {
    const { data, origin, source } = evento as MessageEvent
    const recebido = { data, origin, source }
    // A janela recarregada avisa de novo; a leitura vai de novo, com o mesmo id.
    if (receberPronto(recebido, { origemAdsum: destino.origem, aberta })) {
      aberta.postMessage(mensagemDeLeitura(id, bruto), destino.origem)
      return
    }
    const plano = receberPlano(recebido, { origemAdsum: destino.origem, aberta, id, validar: (p) => conferirContraBruto(p, bruto) })
    if (!plano.ok && (plano.motivo === 'origem' || plano.motivo === 'janela' || plano.motivo === 'outraLeitura')) return

    janela.removeEventListener('message', ouvir)
    if (!plano.ok) return pagina.mostrarBarra({ texto: TEXTOS.naoConfere })
    if (plano.instrucoes.length === 0) return pagina.mostrarBarra({ texto: TEXTOS.nada })

    const { escritas, puladas } = aplicar(pagina, plano.instrucoes)
    const aulas = new Set(escritas.map((e) => e.coluna)).size
    const texto = [
      `Adsum preencheu ${plural(aulas, 'aula', 'aulas')}. Azul é o que mudou. Confira e clique em Gravar Frequências.`,
      puladas.length > 0 &&
        `${plural(puladas.length, 'célula mudou', 'células mudaram')} depois da leitura e ${puladas.length === 1 ? 'ficou' : 'ficaram'} como você deixou.`,
    ]
      .filter(Boolean)
      .join(' ')
    pagina.mostrarBarra({
      texto,
      aoDesfazer: () => {
        desfazer(pagina, escritas)
        pagina.mostrarBarra({ texto: TEXTOS.desfeito })
      },
    })
  }
  janela.addEventListener('message', ouvir)
}
