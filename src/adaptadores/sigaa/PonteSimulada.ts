// A planilha do SIGAA de mentira: para os testes de tela e a vitrine. Entrega
// a leitura que o teste mandar, e guarda os planos que a folha devolver.

import { receberLeitura, mensagemDeLeitura, ORIGEM_SIGAA, type LeituraRecebida } from '../../nucleo/lancar/protocolo.ts'
import type { Instrucao } from '../../nucleo/lancar/tipos.ts'
import type { Cancelar } from '../../portas/LeitorDeCracha.ts'
import type { PonteSimulavel } from '../../portas/PonteSigaa.ts'
import { criarEmissor } from '../leitor/emissor.ts'

export class PonteSimulada implements PonteSimulavel {
  readonly nome = 'Planilha simulada'
  readonly entregues: { id: string; instrucoes: Instrucao[] }[] = []
  readonly #leituras = criarEmissor<LeituraRecebida>()
  readonly #abridora = {}
  readonly #ligada: boolean
  #ouvindo = false

  /** `ligada: false` é a janela aberta à mão, sem favorito. */
  constructor({ ligada = true }: { ligada?: boolean } = {}) {
    this.#ligada = ligada
  }

  ligada(): boolean {
    return this.#ligada
  }

  iniciar(): void {
    this.#ouvindo = true
  }

  parar(): void {
    this.#ouvindo = false
  }

  aoLer(escuta: (recebida: LeituraRecebida) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  entregar(id: string, instrucoes: Instrucao[]): boolean {
    this.entregues.push({ id, instrucoes })
    return true
  }

  /** O favorito clicado na planilha: passa pelo mesmo protocolo da janela de verdade. */
  ler(bruto: unknown, id = `simulada-${Date.now()}`): void {
    this.receber(
      receberLeitura({ data: mensagemDeLeitura(id, bruto), origin: ORIGEM_SIGAA, source: this.#abridora }, { abridora: this.#abridora }),
    )
  }

  /** Qualquer coisa que a janela de verdade entregaria, inclusive recusa. */
  receber(recebida: LeituraRecebida): void {
    if (this.#ouvindo) this.#leituras.emitir(recebida)
  }
}
