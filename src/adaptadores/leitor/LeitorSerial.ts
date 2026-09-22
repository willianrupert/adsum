// Adaptador: o leitor ESP32 + PN532 pela porta serial USB (Web Serial).
//
// Alternativa ao dongle que digita (`LeitorTeclado`). O UID é o mesmo; o canal
// não. Aqui a linha chega inteira, então não há foco de janela a perder e nem
// ritmo de digitação a julgar: o defeito silencioso do teclado (rajada
// recusada sem sinal nenhum) não tem como acontecer neste caminho. Firmware e
// protocolo em `ferramentas/leitor-serial/`.
//
// Só Chrome e Edge têm Web Serial. O dongle continua sendo o caminho que
// funciona em qualquer navegador, e este é a alternativa, não a substituição.
//
// **Nunca abre o diálogo de escolha de porta sozinho.** O Chrome só permite
// isso dentro de um clique, e quem usa o dongle de teclado não deve ver
// pergunta nenhuma. `iniciar()` só reencontra portas já autorizadas; a
// primeira vez passa por `conectar()`, chamado de um botão.

import { interpretarTexto } from '../../nucleo/digitacao.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  LeitorConectavel,
  LeitorConfirmavel,
  Leitura,
  SituacaoDoAparelho,
} from '../../portas/LeitorDeCracha.ts'
import { criarEmissor } from './emissor.ts'

const VELOCIDADE = 115200

/** Sem sinal de vida há mais que isto, o aparelho não está mais lá. O
    firmware manda um por segundo. */
const SINAL_DE_VIDA_MAXIMO_MS = 3000

/** Os aparelhos que este adaptador espera: USB nativo do ESP32-S3/C3 e os dois
    chips de ponte mais comuns nas placas ESP32. Só afina a lista do diálogo. */
const FILTROS = [{ usbVendorId: 0x303a }, { usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }]

const RECUSAS_GUARDADAS = 5

export interface OpcoesDoLeitorSerial {
  /** Para teste. Em produção é `navigator.serial`. */
  serial?: ServicoSerial
  agora?: () => number
}

export class LeitorSerial implements LeitorConectavel, LeitorConfirmavel {
  readonly nome = 'Leitor USB (serial)'

  #serial?: ServicoSerial
  #agora: () => number
  #estado: EstadoLeitor = 'parado'
  #motivo?: string
  #porta?: PortaSerial
  #leitorDeBytes?: ReadableStreamDefaultReader<Uint8Array>
  #escritor?: WritableStreamDefaultWriter<Uint8Array>
  #ativo = false
  #geracao = 0

  #lidos = 0
  #recusados = 0
  #recusas: { quando: Date; cru: string }[] = []
  #ultimaLinha?: string
  #ultimoSinalEm?: number
  #modulo: SituacaoDoAparelho['modulo'] = 'desconhecido'

  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()

  constructor(opcoes: OpcoesDoLeitorSerial = {}) {
    this.#serial = opcoes.serial ?? (typeof navigator !== 'undefined' ? navigator.serial : undefined)
    this.#agora = opcoes.agora ?? (() => Date.now())
  }

  async estaDisponivel(): Promise<boolean> {
    return this.#serial !== undefined
  }

  estado(): EstadoLeitor {
    return this.#estado
  }

  async iniciar(): Promise<void> {
    if (!this.#serial) {
      this.#motivo = 'Este navegador não tem Web Serial. Use o Chrome ou o Edge.'
      return this.#mudarPara('erro')
    }
    if (this.#ativo) return
    this.#ativo = true
    this.#serial.addEventListener('connect', this.#aoConectarUsb)
    this.#serial.addEventListener('disconnect', this.#aoDesconectarUsb)
    await this.#abrirUmaJaAutorizada()
  }

  async parar(): Promise<void> {
    this.#ativo = false
    this.#serial?.removeEventListener('connect', this.#aoConectarUsb)
    this.#serial?.removeEventListener('disconnect', this.#aoDesconectarUsb)
    await this.#fecharPorta()
    this.#mudarPara('parado')
  }

  /** Só de dentro de um clique: é o Chrome que exige, não o app. */
  async conectar(): Promise<void> {
    if (!this.#serial) return
    let porta: PortaSerial
    try {
      porta = await this.#serial.requestPort({ filters: FILTROS })
    } catch {
      return // o professor fechou o diálogo: nada mudou
    }
    this.#ativo = true
    this.#serial.addEventListener('connect', this.#aoConectarUsb)
    this.#serial.addEventListener('disconnect', this.#aoDesconectarUsb)
    await this.#fecharPorta()
    await this.#abrir(porta)
  }

  aoLer(escuta: (leitura: Leitura) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar {
    return this.#estados.inscrever(escuta)
  }

  /** O app diz "gravei": o LED do aparelho pisca. Sem porta aberta, não faz nada. */
  async confirmarGravacao(): Promise<void> {
    try {
      await this.#escritor?.write(new TextEncoder().encode('OK\n'))
    } catch {
      // Confirmação perdida não perde a presença: ela já está gravada.
    }
  }

  situacao(): SituacaoDoAparelho {
    const vivo =
      this.#estado === 'lendo' &&
      this.#ultimoSinalEm !== undefined &&
      this.#agora() - this.#ultimoSinalEm <= SINAL_DE_VIDA_MAXIMO_MS
    return { vivo, modulo: vivo ? this.#modulo : 'desconhecido' }
  }

  async diagnostico(): Promise<DiagnosticoLeitor> {
    const s = this.situacao()
    return {
      nome: this.nome,
      estado: this.#estado,
      disponivel: this.#serial !== undefined,
      motivo: this.#serial ? this.#motivo : 'Este navegador não tem Web Serial.',
      detalhes: {
        aparelho: s.vivo ? 'respondendo' : 'sem sinal',
        'módulo de leitura': s.modulo === 'ok' ? 'ok' : s.modulo === 'erro' ? 'com erro' : '—',
        'último sinal de vida': this.#ultimoSinalEm
          ? `há ${Math.round((this.#agora() - this.#ultimoSinalEm) / 1000)} s`
          : '—',
        'leituras aceitas': String(this.#lidos),
        'linhas recusadas': String(this.#recusados),
        'última linha': this.#ultimaLinha ?? '—',
        'últimas recusas': this.#recusas.length
          ? this.#recusas.map((r) => `${r.quando.toLocaleTimeString('pt-BR')} "${r.cru}"`).join(' · ')
          : '—',
      },
    }
  }

  #mudarPara(estado: EstadoLeitor) {
    if (this.#estado === estado) return
    this.#estado = estado
    this.#estados.emitir(estado)
  }

  async #abrirUmaJaAutorizada() {
    const portas = await this.#serial!.getPorts()
    if (portas.length === 0) {
      this.#motivo = 'Nenhuma porta autorizada ainda. Use "Conectar leitor USB".'
      return this.#mudarPara('erro')
    }
    await this.#abrir(portas[0])
  }

  async #abrir(porta: PortaSerial) {
    const geracao = ++this.#geracao
    this.#mudarPara('iniciando')
    try {
      await porta.open({ baudRate: VELOCIDADE })
    } catch (erro) {
      // Porta já aberta em outra aba, ou aparelho que sumiu no meio.
      this.#motivo = `Não abriu a porta: ${(erro as Error).message}`
      return this.#mudarPara('erro')
    }
    if (!porta.readable || !porta.writable || geracao !== this.#geracao) {
      this.#motivo = 'A porta abriu, mas não é legível.'
      return this.#mudarPara('erro')
    }
    this.#porta = porta
    this.#leitorDeBytes = porta.readable.getReader()
    this.#escritor = porta.writable.getWriter()
    this.#motivo = undefined
    this.#ultimoSinalEm = undefined
    this.#modulo = 'desconhecido'
    this.#mudarPara('lendo')
    void this.#ler(this.#leitorDeBytes, geracao)
  }

  async #ler(leitor: ReadableStreamDefaultReader<Uint8Array>, geracao: number) {
    const decodificador = new TextDecoder()
    let pendente = ''
    try {
      while (true) {
        const { value, done } = await leitor.read()
        if (done) break
        pendente += decodificador.decode(value, { stream: true })
        let corte: number
        while ((corte = pendente.indexOf('\n')) >= 0) {
          this.#tratarLinha(pendente.slice(0, corte))
          pendente = pendente.slice(corte + 1)
        }
      }
    } catch {
      // Cabo puxado: cai no mesmo tratamento do fim do fluxo.
    }
    if (geracao === this.#geracao && this.#ativo) {
      this.#motivo = 'O leitor foi desconectado.'
      this.#mudarPara('erro')
    }
  }

  #tratarLinha(bruta: string) {
    const linha = bruta.trim()
    if (linha === '') return
    if (linha.startsWith('#')) {
      // Linha do próprio aparelho, nunca um crachá.
      if (linha.startsWith('#HB')) {
        this.#ultimoSinalEm = this.#agora()
        this.#modulo = linha.includes('pn532=ok') ? 'ok' : linha.includes('pn532=erro') ? 'erro' : 'desconhecido'
      }
      return
    }
    this.#ultimaLinha = linha
    const lido = interpretarTexto(linha)
    if (!lido) {
      this.#recusados++
      this.#recusas.unshift({ quando: new Date(), cru: linha })
      this.#recusas.length = Math.min(this.#recusas.length, RECUSAS_GUARDADAS)
      return
    }
    this.#lidos++
    this.#leituras.emitir({ uid: lido.uid, em: new Date(), origem: this.nome })
  }

  async #fecharPorta() {
    this.#geracao++
    const leitor = this.#leitorDeBytes
    const escritor = this.#escritor
    const porta = this.#porta
    this.#leitorDeBytes = this.#escritor = this.#porta = undefined
    try {
      await leitor?.cancel()
    } catch {
      /* já fechado */
    }
    leitor?.releaseLock()
    try {
      escritor?.releaseLock()
    } catch {
      /* já solto */
    }
    try {
      await porta?.close()
    } catch {
      /* já fechada */
    }
  }

  // Plugou de volta um aparelho que já era conhecido: volta sozinho.
  #aoConectarUsb = () => {
    if (this.#ativo && this.#estado === 'erro') void this.#abrirUmaJaAutorizada()
  }

  #aoDesconectarUsb = () => {
    if (!this.#ativo) return
    void this.#fecharPorta().then(() => {
      this.#motivo = 'O leitor foi desconectado.'
      this.#mudarPara('erro')
    })
  }
}
