// A janela do Adsum aberta pelo favorito, falando com a planilha que a abriu.
// Só ouve `window.opener`, só aceita a origem do SIGAA, e só manda para ela:
// nunca `postMessage(…, '*')`.

import { mensagemDePlano, mensagemDePronto, ORIGEM_SIGAA, receberLeitura, type LeituraRecebida } from '../../nucleo/lancar/protocolo.ts'
import type { Instrucao } from '../../nucleo/lancar/tipos.ts'
import type { Cancelar } from '../../portas/LeitorDeCracha.ts'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import { criarEmissor } from '../leitor/emissor.ts'

export class PonteJanela implements PonteSigaa {
  readonly nome = 'Janela do favorito'
  readonly #janela: Window
  readonly #leituras = criarEmissor<LeituraRecebida>()
  readonly #ouvir = (evento: Event) => {
    const { data, origin, source } = evento as MessageEvent
    const recebida = receberLeitura({ data, origin, source }, { abridora: this.#janela.opener })
    // Mensagem que não é da planilha não é para a folha: extensões e abas também falam.
    if (!recebida.ok && (recebida.motivo === 'origem' || recebida.motivo === 'janela')) return
    this.#leituras.emitir(recebida)
  }

  constructor(janela: Window = window) {
    this.#janela = janela
  }

  ligada(): boolean {
    return !!this.#janela.opener
  }

  iniciar(): void {
    this.#janela.addEventListener('message', this.#ouvir)
    this.#janela.opener?.postMessage(mensagemDePronto(), ORIGEM_SIGAA)
  }

  parar(): void {
    this.#janela.removeEventListener('message', this.#ouvir)
  }

  aoLer(escuta: (recebida: LeituraRecebida) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  entregar(id: string, instrucoes: Instrucao[]): boolean {
    const abridora = this.#janela.opener
    if (!abridora) return false
    abridora.postMessage(mensagemDePlano(id, instrucoes), ORIGEM_SIGAA)
    return true
  }
}
