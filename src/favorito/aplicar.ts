// O favorito escrevendo na planilha (`docs/08`, camada 5): conferir o plano
// contra o que ele mesmo leu, preencher com comparar e trocar, e desfazer.
//
// Nunca clica, navega, envia formulário nem executa o que recebe: só escreve
// valores em células vazias. Lei: desfazer devolve cada célula ao valor lido.

import type { Validacao } from '../nucleo/lancar/plano.ts'
import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'
import type { Instrucao } from '../nucleo/lancar/tipos.ts'
import type { PaginaDePlanilha } from './pagina.ts'

const CAMPOS = ['antes', 'coluna', 'linha', 'valor'].join()
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function problemaDa(bruta: unknown, bruto: BrutoPlanilha, vistas: Set<string>): string | undefined {
  if (typeof bruta !== 'object' || bruta === null || Object.keys(bruta).sort().join() !== CAMPOS) return 'formato desconhecido'
  const { linha, coluna, antes, valor } = bruta as Record<string, unknown>
  if (!inteiro(linha) || !inteiro(coluna) || antes !== 'vazia' || !inteiro(valor)) return 'formato desconhecido'
  const celula = bruto.linhas[linha]?.celulas[coluna]
  const dia = bruto.dias[coluna]
  const onde = `célula ${linha}×${coluna}`
  if (!celula || !dia) return `${onde} não existe`
  if (vistas.has(onde)) return `${onde} repetida`
  vistas.add(onde)
  if (celula.desabilitada || celula.valor.trim() !== '') return `${onde} não estava vazia`
  const maximo = /^\d+$/.test(dia.maximoTexto?.trim() ?? '') ? Number(dia.maximoTexto) : 0
  if (maximo <= 0) return `${onde}: dia sem máximo`
  if (valor < 0 || valor > maximo) return `${onde}: ${valor} fora de 0…${maximo}`
  return undefined
}

/** As leis 2 e 4 contra o bruto: célula vazia na leitura, valor dentro do máximo lido. */
export function conferirContraBruto(plano: unknown, bruto: BrutoPlanilha): Validacao {
  if (!Array.isArray(plano)) return { ok: false, problemas: ['o plano não é uma lista'] }
  const vistas = new Set<string>()
  const problemas = plano.flatMap((i: unknown, n) => {
    const p = problemaDa(i, bruto, vistas)
    return p ? [`instrução ${n + 1}: ${p}`] : []
  })
  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, instrucoes: plano as Instrucao[] }
}

export interface Escrita {
  linha: number
  coluna: number
  /** O que foi escrito: desfazer só volta se a célula ainda estiver assim. */
  valor: string
  antes: string
}

export function dicaDaCelula(valor: string, antes: string): string {
  const n = Number(valor)
  const adsum = n === 0 ? 'presente' : `ausente, ${n} ${n === 1 ? 'falta' : 'faltas'}`
  return `Adsum: ${adsum}. Antes: ${antes === '' ? 'vazia' : antes}.`
}

/** Escreve só onde a célula ainda está vazia. O que o professor mexeu no meio tempo fica como ele deixou. */
export function aplicar(pagina: PaginaDePlanilha, instrucoes: Instrucao[]): { escritas: Escrita[]; puladas: { linha: number; coluna: number }[] } {
  const escritas: Escrita[] = []
  const puladas: { linha: number; coluna: number }[] = []
  for (const { linha, coluna, valor } of instrucoes) {
    const agora = pagina.valor(linha, coluna)
    if (agora === undefined || agora.trim() !== '') {
      puladas.push({ linha, coluna })
      continue
    }
    pagina.escrever(linha, coluna, String(valor))
    pagina.pintar(linha, coluna, 'mudou', dicaDaCelula(String(valor), agora))
    escritas.push({ linha, coluna, valor: String(valor), antes: agora })
  }
  return { escritas, puladas }
}

/** Volta cada célula ao valor lido, menos a que o professor mudou depois. */
export function desfazer(pagina: PaginaDePlanilha, escritas: Escrita[]): { desfeitas: number; mantidas: number } {
  let desfeitas = 0
  let mantidas = 0
  for (const e of escritas) {
    if (pagina.valor(e.linha, e.coluna) !== e.valor) {
      mantidas += 1
      continue
    }
    pagina.escrever(e.linha, e.coluna, e.antes)
    pagina.pintar(e.linha, e.coluna)
    desfeitas += 1
  }
  return { desfeitas, mantidas }
}
