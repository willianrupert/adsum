// As mensagens entre a planilha do SIGAA e a janela do Adsum (`docs/08`, camada 4).
// Além das duas do `08`, um "pronto" do Adsum: sem ele a leitura podia chegar
// antes de a janela recém-aberta ouvir, e se perder.
//
// Funções puras sobre o que um `MessageEvent` traz: `origin`, `source`, `data`.
// Cada lado só aceita a origem do outro e a janela com que está ligado, e o
// `id` amarra o plano à leitura de que ele saiu. O que chega de outra janela
// não é confiável: formato desconhecido é recusa, nunca palpite.

import type { Validacao } from './plano.ts'
import type { Instrucao } from './tipos.ts'

export const VERSAO_DO_PROTOCOLO = 1
/** Sobe quando o favorito muda; o Adsum recusa os que não conhece e pede o novo. */
export const VERSAO_DO_FAVORITO = 1
export const ORIGEM_SIGAA = 'https://sigaa.ufpe.br'

export interface MensagemDeLeitura {
  v: number
  tipo: 'leitura'
  versaoFavorito: number
  id: string
  bruto: unknown
}

export type MensagemDePlano =
  | { v: number; tipo: 'plano'; id: string; instrucoes: Instrucao[] }
  | { v: number; tipo: 'nada'; id: string }

/** O que importa de um `MessageEvent`. */
export interface Recebido {
  data: unknown
  origin: string
  source: unknown
}

/** A janela do Adsum acabou de carregar e ouve: só então o favorito manda a leitura. */
export const mensagemDePronto = () => ({ v: VERSAO_DO_PROTOCOLO, tipo: 'pronto' as const })

export function mensagemDeLeitura(id: string, bruto: unknown): MensagemDeLeitura {
  return { v: VERSAO_DO_PROTOCOLO, tipo: 'leitura', versaoFavorito: VERSAO_DO_FAVORITO, id, bruto }
}

export function mensagemDePlano(id: string, instrucoes: Instrucao[]): MensagemDePlano {
  return instrucoes.length > 0
    ? { v: VERSAO_DO_PROTOCOLO, tipo: 'plano', id, instrucoes }
    : { v: VERSAO_DO_PROTOCOLO, tipo: 'nada', id }
}

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const idValido = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export type LeituraRecebida =
  | { ok: true; id: string; bruto: unknown }
  | { ok: false; motivo: 'origem' | 'janela' | 'formato' | 'versaoDoFavorito' }

/** No Adsum: a leitura só vale do SIGAA, e da janela que abriu esta. */
export function receberLeitura(evento: Recebido, esperado: { abridora: unknown; origem?: string }): LeituraRecebida {
  if (evento.origin !== (esperado.origem ?? ORIGEM_SIGAA)) return { ok: false, motivo: 'origem' }
  if (!esperado.abridora || evento.source !== esperado.abridora) return { ok: false, motivo: 'janela' }
  const d = evento.data
  if (!objeto(d) || d.v !== VERSAO_DO_PROTOCOLO || d.tipo !== 'leitura' || !idValido(d.id) || !('bruto' in d)) {
    return { ok: false, motivo: 'formato' }
  }
  if (d.versaoFavorito !== VERSAO_DO_FAVORITO) return { ok: false, motivo: 'versaoDoFavorito' }
  return { ok: true, id: d.id, bruto: d.bruto }
}

export type PlanoRecebido =
  | { ok: true; instrucoes: Instrucao[] }
  | { ok: false; motivo: 'origem' | 'janela' | 'formato' | 'outraLeitura' }
  | { ok: false; motivo: 'planoInvalido'; problemas: string[] }

/**
 * No favorito: o plano só vale da janela que ele abriu, para a leitura que ele
 * mandou, e só se `validar` o aceitar. O favorito valida contra o bruto que ele
 * mesmo extraiu (`favorito/aplicar.ts`); o Adsum, antes de entregar, contra a
 * leitura inteira (`validarPlano`).
 */
export function receberPlano(
  evento: Recebido,
  esperado: { origemAdsum: string; aberta: unknown; id: string; validar: (plano: unknown) => Validacao },
): PlanoRecebido {
  if (evento.origin !== esperado.origemAdsum) return { ok: false, motivo: 'origem' }
  if (!esperado.aberta || evento.source !== esperado.aberta) return { ok: false, motivo: 'janela' }
  const d = evento.data
  if (!objeto(d) || d.v !== VERSAO_DO_PROTOCOLO || !idValido(d.id)) return { ok: false, motivo: 'formato' }
  if (d.tipo !== 'nada' && !(d.tipo === 'plano' && 'instrucoes' in d)) return { ok: false, motivo: 'formato' }
  if (d.id !== esperado.id) return { ok: false, motivo: 'outraLeitura' }
  if (d.tipo === 'nada') return { ok: true, instrucoes: [] }
  const validacao = esperado.validar(d.instrucoes)
  return validacao.ok ? { ok: true, instrucoes: validacao.instrucoes } : { ok: false, motivo: 'planoInvalido', problemas: validacao.problemas }
}

/** No favorito: a janela que ele abriu avisou que está pronta. */
export function receberPronto(evento: Recebido, esperado: { origemAdsum: string; aberta: unknown }): boolean {
  const d = evento.data
  return (
    evento.origin === esperado.origemAdsum &&
    !!esperado.aberta &&
    evento.source === esperado.aberta &&
    objeto(d) &&
    d.v === VERSAO_DO_PROTOCOLO &&
    d.tipo === 'pronto'
  )
}
