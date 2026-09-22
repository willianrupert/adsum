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

  // Instrumentação de diagnóstico, sem efeito nenhum na decisão de aceitar ou
  // recusar — só existe para reconstruir, depois do fato, o que aconteceu
  // numa aula em que a leitura falhou sem erro na tela. Ver o relato do Prof.
  // Paulo em 17/09/2026 (mesmo sintoma de 15/09 — "apitou e não fez nada" —
  // agora recorrente numa turma diferente da que já tinha sido validada):
  // sem isto, "recusada" e "nunca chegou" eram indistinguíveis, e as duas
  // apontam para consertos diferentes.
  /** Rajada rápida o bastante pra ser máquina, mas em formato não reconhecido
      (comprimento errado, caractere fora do esperado) — causa diferente de
      "parecia digitação humana". */
  #recusasPorFormato = 0
  /** Rajada recusada por `foiDigitadoPorMaquina` — o sintoma original de
      15/09/2026 (`INTERVALO_MAXIMO_MS` julgando digitação atrasada como
      humana). */
  #recusasPorRitmo = 0
  /** Últimas recusas, mais recente primeiro — o "última rajada" sozinho não
      bastava: uma recusa nova apaga a anterior antes de alguém abrir o
      Diagnóstico pra ver. */
  #recusas: { quando: Date; motivo: 'ritmo' | 'formato'; cru: string }[] = []
  /** Toda tecla não-modificadora que chega ao manipulador, aceita ou não —
      inclusive Enter e teclas de navegação. Se isto parar de andar durante
      uma aula com gente pendente, nada está chegando à janela: não é recusa,
      é ausência — sintoma físico (foco, cabo, dongle), não de software. */
  #ultimaTeclaEm?: Date
  /** Quantas vezes a janela perdeu o foco desde que `iniciar()` rodou — o
      dongle é HID de teclado, então as teclas vão para onde o SO mandar; sem
      foco na aba do Adsum, o app não recebe nada, e o buzzer do dongle (que é
      hardware, soa de qualquer jeito) engana quem está na sala. */
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
        // O que o dongle real imprime só se descobre com ele na mão. Estes
        // campos respondem isso no primeiro toque, sem precisar de mais código.
        'última rajada': this.#ultimaCrua ?? '—',
        formato: this.#ultimoFormato ?? '—',
        'UID lido': this.#ultimoUid ?? '—',
        // Alguns leitores imprimem em little-endian. Sem outra fonte não dá
        // para saber qual é o certo, então aparecem os dois: comparar com o
        // celular resolve a olho.
        'se estiver invertido': this.#ultimoInvertido ?? '—',
        // Daqui pra baixo: só diagnóstico do sintoma "apitou, nada na tela"
        // (17/09/2026) — ver o comentário nos campos privados, acima.
        'recusadas por parecer digitação': String(this.#recusasPorRitmo),
        'recusadas por formato desconhecido': String(this.#recusasPorFormato),
        'última tecla recebida': this.#ultimaTeclaEm?.toISOString() ?? '—',
        // Junta com " — " (não quebra de linha): `<code>` não preserva `\n`,
        // e isto precisa continuar legível também numa tela estreita.
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

    // Qualquer tecla não-modificadora conta como "chegou algo" — mesmo as que
    // o resto da função ignora (Escape, setas). É o oposto de `#recusados`:
    // aqui não importa se virou rajada, só que a janela recebeu alguma coisa.
    this.#ultimaTeclaEm = new Date()

    // `evento.timeStamp`, não `performance.now()`: o navegador carimba o
    // primeiro perto da chegada de verdade da tecla, o segundo mede quando
    // ESTE manipulador rodou. Com a aba ocupada — turma grande, tela
    // reatualizando — um `keydown` fica na fila e roda atrasado; medir com
    // `performance.now()` fazia o atraso de processamento parecer atraso de
    // digitação, e `INTERVALO_MAXIMO_MS` (60 ms) recusava a rajada inteira
    // em silêncio. Reproduzido em aula real, 15/09/2026: "parou de associar
    // os crachás com os alunos", sem erro nenhum na tela.
    const agora = evento.timeStamp
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
      // Duas causas bem diferentes viram a mesma coisa (`undefined`) em
      // `interpretarDigitacao`: o ritmo pareceu humano (nem chegou a tentar
      // decodificar), ou o ritmo era de máquina mas o formato não bateu com
      // nenhum dos reconhecidos. Reclassificar aqui, com a mesma função pura
      // que `interpretarDigitacao` já chamava por baixo.
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

      // Avisar só o que **quase foi crachá**. Qualquer digitação passa por
      // aqui, e um professor editando a data não pode ver "leitura recusada"
      // a cada campo. Duas situações são de crachá de verdade: uma rajada
      // rápida em formato desconhecido, e um UID bem formado que chegou
      // devagar demais e foi fechado pelo Enter do dongle, que é exatamente
      // o "apitou e nada aconteceu" de 15/09/2026.
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
