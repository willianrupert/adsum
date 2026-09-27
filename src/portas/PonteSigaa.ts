// Porta: a ligação com a planilha de frequência do SIGAA (`docs/08`).
//
// Como `LeitorDeCracha`, existe para que a folha não saiba de onde a leitura
// vem: da janela aberta pelo favorito, ou de uma simulação no teste e na
// vitrine. A lista para lançar à mão não é adaptador desta porta: ela não
// troca mensagem com a página, e fingir que troca seria uma interface que um
// dos lados não cumpre.

import type { LeituraRecebida } from '../nucleo/lancar/protocolo.ts'
import type { Instrucao } from '../nucleo/lancar/tipos.ts'
import type { Cancelar } from './LeitorDeCracha.ts'

export interface PonteSigaa {
  readonly nome: string
  /** Aberta pelo favorito, com a planilha do outro lado. */
  ligada(): boolean
  /** Começa a ouvir e avisa a planilha que está pronta. */
  iniciar(): void
  parar(): void
  /** Leituras e recusas que chegam da planilha. O que não veio dela nem aparece. */
  aoLer(escuta: (recebida: LeituraRecebida) => void): Cancelar
  /** Devolve o plano da leitura `id`. `false` se não há a quem entregar. */
  entregar(id: string, instrucoes: Instrucao[]): boolean
}

/**
 * Ponte que aceita leitura injetada, para a vitrine e os testes. Fica fora da
 * porta de propósito, como `LeitorSimulavel`: a janela de verdade não faz isto.
 */
export interface PonteSimulavel extends PonteSigaa {
  ler(bruto: unknown, id?: string): void
}
