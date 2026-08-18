// Adaptador: leitor sem hardware.
//
// Não é andaime descartável: é o que permite ensaiar a aula inteira sem
// hardware, e exercitar crachá repetido sem ter dois crachás na mão — repetir a
// volta do baralho reencontra um UID já visto.

import { hexParaUid, uidParaHex } from '../../nucleo/uid.ts'
import type { Uid } from '../../nucleo/tipos.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  Leitura,
  LeitorSimulavel,
} from '../../portas/LeitorDeCracha.ts'
import { criarEmissor } from './emissor.ts'

/**
 * Seis cartões, todos com prefixo `04`, que é o que a NXP usa no crachá do
 * CIn. O último tem 7 bytes de propósito: UID é campo de tamanho variável, e
 * código que assume 4 quebra na frente da turma, não aqui.
 */
const BARALHO_PADRAO = [
  '04a23b91',
  '0471c2d8',
  '04e05f1a',
  '043d8874',
  '04b91e60',
  '04aa1b2c3d4e5f',
] as const

export class LeitorSimulado implements LeitorSimulavel {
  readonly nome = 'Leitor simulado'

  #estado: EstadoLeitor = 'parado'
  #proximo = 0
  #lidos = 0
  #baralho: string[]
  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()

  constructor(baralho: readonly string[] = BARALHO_PADRAO) {
    // Valida na construção: baralho torto vira erro agora, não no meio de um teste.
    this.#baralho = baralho.map((hex) => uidParaHex(hexParaUid(hex)))
  }

  async estaDisponivel(): Promise<boolean> {
    return true
  }

  estado(): EstadoLeitor {
    return this.#estado
  }

  async iniciar(): Promise<void> {
    if (this.#estado === 'lendo') return
    this.#mudarPara('iniciando')
    this.#mudarPara('lendo')
  }

  async parar(): Promise<void> {
    this.#mudarPara('parado')
  }

  aoLer(escuta: (leitura: Leitura) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar {
    return this.#estados.inscrever(escuta)
  }

  simular(uidHex: string): void {
    this.#emitir(hexParaUid(uidHex))
  }

  encostarProximo(): Uid {
    const hex = this.#baralho[this.#proximo % this.#baralho.length]
    this.#proximo++
    const uid = hexParaUid(hex)
    this.#emitir(uid)
    return uid
  }

  baralho(): readonly string[] {
    return this.#baralho
  }

  async diagnostico(): Promise<DiagnosticoLeitor> {
    return {
      nome: this.nome,
      estado: this.#estado,
      disponivel: true,
      detalhes: {
        'cartões no baralho': String(this.#baralho.length),
        'próximo cartão': this.#baralho[this.#proximo % this.#baralho.length],
        'leituras emitidas': String(this.#lidos),
        ouvintes: String(this.#leituras.quantidade),
      },
    }
  }

  #emitir(uid: Uid): void {
    if (this.#estado !== 'lendo') {
      throw new Error('Leitor parado — inicie antes de encostar um crachá')
    }
    this.#lidos++
    this.#leituras.emitir({ uid, em: new Date(), origem: this.nome })
  }

  #mudarPara(estado: EstadoLeitor): void {
    if (this.#estado === estado) return
    this.#estado = estado
    this.#estados.emitir(estado)
  }
}
