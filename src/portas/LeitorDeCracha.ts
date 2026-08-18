// Porta: de onde vêm os UIDs.
//
// Existe para que trocar de leitor não toque em mais nada: o UID pode vir do
// dongle USB, de um leitor simulado ou do NFC do celular, e quem consome uma
// `Leitura` não sabe — nem deve saber — a diferença.

import type { Uid } from '../nucleo/tipos.ts'

export type EstadoLeitor = 'parado' | 'iniciando' | 'lendo' | 'erro'

export interface Leitura {
  uid: Uid
  em: Date
  /** Nome do adaptador que produziu a leitura. Aparece no diagnóstico. */
  origem: string
}

export interface DiagnosticoLeitor {
  nome: string
  estado: EstadoLeitor
  disponivel: boolean
  /** Por que não está disponível, quando for o caso. */
  motivo?: string
  detalhes: Record<string, string>
}

export type Cancelar = () => void

export interface LeitorDeCracha {
  readonly nome: string
  /** O ambiente suporta este leitor? Não diz se ele está conectado. */
  estaDisponivel(): Promise<boolean>
  estado(): EstadoLeitor
  iniciar(): Promise<void>
  parar(): Promise<void>
  aoLer(escuta: (leitura: Leitura) => void): Cancelar
  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar
  diagnostico(): Promise<DiagnosticoLeitor>
}

/**
 * Leitor que aceita leitura injetada. Fica fora da porta de propósito: só o
 * diagnóstico e o ensaio usam. Um leitor de verdade não implementa isto.
 */
export interface LeitorSimulavel extends LeitorDeCracha {
  simular(uidHex: string): void
  /** Próximo cartão do baralho virtual. Repetir a volta reencontra um UID já visto. */
  encostarProximo(): Uid
  baralho(): readonly string[]
}

export function ehSimulavel(leitor: LeitorDeCracha): leitor is LeitorSimulavel {
  return 'simular' in leitor && typeof (leitor as LeitorSimulavel).simular === 'function'
}
