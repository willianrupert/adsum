// Adaptador: o dongle USB que se apresenta como teclado.
//
// É o caminho mais simples que existe — sem permissão, sem driver, sem API
// experimental — e o único que funciona igual em Chrome, Safari e Firefox. Para
// o sistema operacional o leitor é um teclado; para o app, uma rajada de teclas
// rápidas demais para serem humanas (ver `nucleo/digitacao.ts`).
//
// Ele escuta a janela inteira de propósito: o professor não deve precisar
// clicar num campo antes de a fila começar. O preço é que as teclas passam por
// onde o foco estiver, e por isso a rajada é interrompida assim que se reconhece
// como crachá.

import { interpretarDigitacao, type Digitacao, type Tecla } from '../../nucleo/digitacao.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  LeitorDeCracha,
  Leitura,
} from '../../portas/LeitorDeCracha.ts'
import { criarEmissor } from './emissor.ts'

/** Depois disto, o que estava no buffer era outra coisa. */
const ESQUECER_APOS_MS = 400

export class LeitorTeclado implements LeitorDeCracha {
  readonly nome = 'Dongle USB'

  #estado: EstadoLeitor = 'parado'
  #teclas: Tecla[] = []
  #relogio?: ReturnType<typeof setTimeout>
  #lidos = 0
  #recusados = 0
  #ultimaCrua?: string
  #ultimoFormato?: Digitacao['formato']
  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()

  async estaDisponivel(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  estado(): EstadoLeitor {
    return this.#estado
  }

  async iniciar(): Promise<void> {
    if (this.#estado === 'lendo') return
    window.addEventListener('keydown', this.#aoTeclar, true)
    this.#mudarPara('lendo')
  }

  async parar(): Promise<void> {
    window.removeEventListener('keydown', this.#aoTeclar, true)
    clearTimeout(this.#relogio)
    this.#teclas = []
    this.#mudarPara('parado')
  }

  aoLer(escuta: (leitura: Leitura) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar {
    return this.#estados.inscrever(escuta)
  }

  async diagnostico(): Promise<DiagnosticoLeitor> {
    return {
      nome: this.nome,
      estado: this.#estado,
      disponivel: true,
      detalhes: {
        'leituras aceitas': String(this.#lidos),
        'rajadas recusadas': String(this.#recusados),
        // O que o dongle real imprime só se descobre com ele na mão. Este campo
        // responde isso no primeiro toque, sem precisar de mais código.
        'última rajada': this.#ultimaCrua ?? '—',
        formato: this.#ultimoFormato ?? '—',
      },
    }
  }

  #aoTeclar = (evento: KeyboardEvent) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return

    const agora = performance.now()
    if (this.#teclas.length > 0 && agora - this.#teclas[this.#teclas.length - 1].em > ESQUECER_APOS_MS) {
      this.#teclas = []
    }

    if (evento.key === 'Enter') {
      this.#fechar(evento)
      return
    }
    if (evento.key.length !== 1) return

    this.#teclas.push({ caractere: evento.key, em: agora })

    // A rajada já é reconhecível: daqui em diante as teclas não chegam ao campo
    // que estiver com o foco. As primeiras podem ter chegado — é o preço de não
    // exigir que ninguém clique em lugar nenhum antes da fila começar.
    if (this.#teclas.length > 3) evento.preventDefault()

    clearTimeout(this.#relogio)
    // Nem todo dongle manda Enter no fim; o silêncio também fecha a rajada.
    this.#relogio = setTimeout(() => this.#fechar(), ESQUECER_APOS_MS)
  }

  #fechar(evento?: KeyboardEvent) {
    clearTimeout(this.#relogio)
    const teclas = this.#teclas
    this.#teclas = []
    if (teclas.length === 0) return

    const lido = interpretarDigitacao(teclas)
    this.#ultimaCrua = teclas.map((t) => t.caractere).join('')

    if (!lido) {
      this.#recusados++
      this.#ultimoFormato = undefined
      return
    }

    evento?.preventDefault()
    this.#lidos++
    this.#ultimoFormato = lido.formato
    this.#leituras.emitir({ uid: lido.uid, em: new Date(), origem: this.nome })
  }

  #mudarPara(estado: EstadoLeitor) {
    if (this.#estado === estado) return
    this.#estado = estado
    this.#estados.emitir(estado)
  }
}
