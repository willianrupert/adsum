// Adaptador: o dongle USB, que o sistema vê como teclado. Sem permissão nem
// driver, igual em todo navegador. Um crachá é uma rajada de teclas rápida
// demais para ser humana (`nucleo/digitacao.ts`).
//
// Escuta a janela inteira, para ninguém precisar clicar num campo antes da
// fila. O preço: as primeiras teclas de uma rajada podem cair no campo com
// foco, até ela se reconhecer como crachá.

import {
  foiDigitadoPorMaquina,
  interpretarDigitacao,
  interpretarTexto,
  type Digitacao,
  type Tecla,
} from '../../nucleo/digitacao.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  LeitorQueRecusa,
  Leitura,
  Recusa,
} from '../../portas/LeitorDeCracha.ts'
import { criarEmissor } from './emissor.ts'

/** Menos que isto não é UID nenhum, é tecla solta. */
const MINIMO_DE_CARACTERES = 6

/** Depois disto, o que estava no buffer era outra coisa. */
const ESQUECER_APOS_MS = 400

/** Quantas recusas recentes o diagnóstico guarda — o bastante pra reconstruir
    o fim de uma aula sem virar um log sem limite. */
const RECUSAS_GUARDADAS = 5

export class LeitorTeclado implements LeitorQueRecusa {
  readonly nome = 'Dongle USB'

  #estado: EstadoLeitor = 'parado'
  #teclas: Tecla[] = []
  #relogio?: ReturnType<typeof setTimeout>
  #lidos = 0
  #recusados = 0
  #ultimaCrua?: string
  #ultimoFormato?: Digitacao['formato']
  #ultimoInvertido?: string
  #ultimoUid?: string
  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()
  #recusasEmitidas = criarEmissor<Recusa>()

  // Só para o Diagnóstico, sem efeito em aceitar ou recusar: separa "recusada"
  // de "nunca chegou", que pedem consertos diferentes.
  /** Rápida o bastante para ser máquina, mas em formato não reconhecido. */
  #recusasPorFormato = 0
  /** Ritmo de gente digitando (`foiDigitadoPorMaquina`). */
  #recusasPorRitmo = 0
  /** Últimas recusas, mais recente primeiro. */
  #recusas: { quando: Date; motivo: 'ritmo' | 'formato'; cru: string }[] = []
  /** Qualquer tecla que chegou. Parada com gente na fila: nada chega à janela (foco, cabo). */
  #ultimaTeclaEm?: Date
  /** O dongle digita onde o foco estiver: sem foco, nada chega, e o bipe dele engana. */
  #perdasDeFoco = 0
  #ultimaPerdaDeFocoEm?: Date
  #ultimoFocoRecuperadoEm?: Date

  async estaDisponivel(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  estado(): EstadoLeitor {
    return this.#estado
  }

  async iniciar(): Promise<void> {
    if (this.#estado === 'lendo') return
    window.addEventListener('keydown', this.#aoTeclar, true)
    window.addEventListener('blur', this.#aoPerderFoco)
    window.addEventListener('focus', this.#aoGanharFoco)
    this.#mudarPara('lendo')
  }

  async parar(): Promise<void> {
    window.removeEventListener('keydown', this.#aoTeclar, true)
    window.removeEventListener('blur', this.#aoPerderFoco)
    window.removeEventListener('focus', this.#aoGanharFoco)
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

  aoRecusar(escuta: (recusa: Recusa) => void): Cancelar {
    return this.#recusasEmitidas.inscrever(escuta)
  }

  async diagnostico(): Promise<DiagnosticoLeitor> {
    return {
      nome: this.nome,
      estado: this.#estado,
      disponivel: true,
      detalhes: {
        'leituras aceitas': String(this.#lidos),
        'rajadas recusadas': String(this.#recusados),
        // O que um dongle novo imprime se descobre no primeiro toque.
        'última rajada': this.#ultimaCrua ?? '—',
        formato: this.#ultimoFormato ?? '—',
        'UID lido': this.#ultimoUid ?? '—',
        // Alguns leitores imprimem em little-endian: os dois, para comparar.
        'se estiver invertido': this.#ultimoInvertido ?? '—',
        'recusadas por parecer digitação': String(this.#recusasPorRitmo),
        'recusadas por formato desconhecido': String(this.#recusasPorFormato),
        'última tecla recebida': this.#ultimaTeclaEm?.toISOString() ?? '—',
        // " — " e não quebra de linha: `<code>` não preserva `\n`.
        'últimas recusas (hora · motivo · cru)':
          this.#recusas.length === 0
            ? '—'
            : this.#recusas.map((r) => `${r.quando.toISOString()} · ${r.motivo} · "${r.cru}"`).join(' — '),
        'janela perdeu o foco': `${this.#perdasDeFoco}×`,
        'última perda de foco': this.#ultimaPerdaDeFocoEm?.toISOString() ?? '—',
        'foco recuperado em': this.#ultimoFocoRecuperadoEm?.toISOString() ?? '—',
      },
    }
  }

  #aoPerderFoco = () => {
    this.#perdasDeFoco++
    this.#ultimaPerdaDeFocoEm = new Date()
  }

  #aoGanharFoco = () => {
    this.#ultimoFocoRecuperadoEm = new Date()
  }

  #aoTeclar = (evento: KeyboardEvent) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return

    // Qualquer tecla conta como "chegou algo", mesmo as ignoradas abaixo.
    this.#ultimaTeclaEm = new Date()

    // `evento.timeStamp`, carimbado na chegada da tecla, e não
    // `performance.now()`, que mede quando o manipulador rodou: com a aba
    // ocupada, o atraso de processamento parecia digitação humana e a rajada
    // era recusada (15/09/2026).
    const agora = evento.timeStamp
    if (this.#teclas.length > 0 && agora - this.#teclas[this.#teclas.length - 1].em > ESQUECER_APOS_MS) {
      this.#teclas = []
    }

    if (evento.key === 'Enter') {
      // O Enter que fecha uma rajada é do dongle, recusada ou não: marcado
      // na captura, antes de qualquer atalho. Quem tem atalho de Enter
      // confere `defaultPrevented` (22/09/2026).
      if (this.#teclas.length > 3) evento.preventDefault()
      this.#fechar(evento)
      return
    }
    if (evento.key.length !== 1) return

    this.#teclas.push({ caractere: evento.key, em: agora })

    // Rajada reconhecível: as próximas teclas não chegam ao campo com foco.
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
      // Separa as duas causas de recusa: ritmo humano ou formato desconhecido.
      const motivo: 'formato' | 'ritmo' = foiDigitadoPorMaquina(teclas) ? 'formato' : 'ritmo'
      if (motivo === 'formato') this.#recusasPorFormato++
      else this.#recusasPorRitmo++
      this.#recusas = [{ quando: new Date(), motivo, cru: this.#ultimaCrua }, ...this.#recusas].slice(
        0,
        RECUSAS_GUARDADAS,
      )
      this.#ultimoFormato = undefined
      this.#ultimoInvertido = undefined
      this.#ultimoUid = undefined

      // Avisa só o que quase foi crachá (rajada rápida em formato
      // desconhecido, ou UID bem formado fechado por Enter): digitar num
      // campo comum não pode disparar "leitura recusada".
      const cru = this.#ultimaCrua
      const quaseCracha =
        cru.length >= MINIMO_DE_CARACTERES &&
        (motivo === 'formato' || (evento?.key === 'Enter' && interpretarTexto(cru) !== undefined))
      if (quaseCracha) this.#recusasEmitidas.emitir({ motivo, cru, em: new Date() })
      return
    }

    evento?.preventDefault()
    this.#lidos++
    this.#ultimoFormato = lido.formato
    this.#ultimoInvertido = lido.invertido
    this.#ultimoUid = Array.from(lido.uid, (b) => b.toString(16).padStart(2, '0')).join('')
    this.#leituras.emitir({ uid: lido.uid, em: new Date(), origem: this.nome })
  }

  #mudarPara(estado: EstadoLeitor) {
    if (this.#estado === estado) return
    this.#estado = estado
    this.#estados.emitir(estado)
  }
}
