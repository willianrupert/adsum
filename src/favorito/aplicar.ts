// O favorito escrevendo na planilha (`docs/08`, camada 5): conferir o plano
// contra o que ele mesmo leu, preencher com comparar e trocar, e desfazer.
//
// Nunca clica, navega, envia formulário nem executa o que recebe: só escreve
// valores em células vazias. Lei: desfazer devolve cada célula ao valor lido.

import { validarPlano, type Validacao } from '../nucleo/lancar/plano.ts'
import { lerPlanilha, type BrutoPlanilha } from '../nucleo/lancar/leitura.ts'
import type { Instrucao } from '../nucleo/lancar/tipos.ts'
import type { PaginaDePlanilha } from './pagina.ts'

/**
 * As leis 2 e 4 contra a página que o favorito mesmo leu: a mesma leitura e o
 * mesmo validador do Adsum, rodando aqui. Célula que não estava vazia, que a
 * página bloqueia ou valor fora do máximo derruba o plano inteiro.
 */
export function conferirContraBruto(plano: unknown, bruto: BrutoPlanilha, agora: Date): Validacao {
  const { leitura, problemas } = lerPlanilha(bruto, 'favorito', agora)
  if (!leitura) return { ok: false, problemas: problemas.map((p) => `${p.onde}: ${p.motivo}`) }
  return validarPlano(plano, leitura)
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
    pagina.pintar(linha, coluna, valor === 0 ? 'mudou' : 'falta', dicaDaCelula(String(valor), agora))
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
