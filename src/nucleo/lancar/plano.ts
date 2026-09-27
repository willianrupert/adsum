// O plano: o que o favorito vai escrever na página (`docs/08`, camada 3).
//
// `validarPlano` é o mesmo validador que o favorito roda ao receber, e por
// isso recebe `unknown`: o que atravessa de uma janela para outra não é
// confiável. Uma instrução ruim recusa o plano inteiro. A lei "nunca inventa
// dia" precisa dos dados do Adsum e não se confere aqui: ela é garantida por
// `planejar`, que só transforma células "a lançar".

import type { Dia, Instrucao, LeituraPlanilha, LinhaAluno, Relatorio } from './tipos.ts'

/** Uma instrução por célula "a lançar", menos as das aulas que o professor desmarcou. */
export function planejar(relatorio: Relatorio, desmarcadas: readonly Dia[]): Instrucao[] {
  const fora = new Set<string>(desmarcadas)
  return relatorio.celulas.flatMap((c) =>
    c.categoria === 'aLancar' && !fora.has(c.dia) ? [{ linha: c.linha, coluna: c.coluna, antes: 'vazia' as const, valor: c.esperado }] : [],
  )
}

export type Validacao = { ok: true; instrucoes: Instrucao[] } | { ok: false; problemas: string[] }

const CAMPOS = ['antes', 'coluna', 'linha', 'valor'].join()
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** O que há de errado com uma instrução, ou `undefined`. */
function problemaDa(bruta: unknown, leitura: LeituraPlanilha, linhas: Map<number, LinhaAluno>, vistas: Set<string>): string | undefined {
  if (typeof bruta !== 'object' || bruta === null || Object.keys(bruta).sort().join() !== CAMPOS) return 'formato desconhecido'
  const { linha, coluna, antes, valor } = bruta as Record<string, unknown>
  if (!inteiro(linha) || !inteiro(coluna) || antes !== 'vazia' || typeof valor !== 'number') return 'formato desconhecido'
  const celula = linhas.get(linha)?.celulas[coluna]
  const col = leitura.colunas[coluna]
  const onde = `célula ${linha}×${coluna}`
  if (!celula || !col) return `${onde} não existe na página`
  if (vistas.has(onde)) return `${onde} repetida`
  vistas.add(onde)
  if (celula.tipo === 'lancada') return `${onde} já está lançada`
  if (celula.tipo === 'bloqueada') return `${onde} está bloqueada (${celula.motivo})`
  if (col.maximo === undefined) return `o dia ${col.dia} não tem máximo na página`
  if (!inteiro(valor) || valor < 0 || valor > col.maximo) return `${valor} fora da faixa 0…${col.maximo} de ${col.dia}`
  return undefined
}

export function validarPlano(plano: unknown, leitura: LeituraPlanilha): Validacao {
  if (!Array.isArray(plano)) return { ok: false, problemas: ['o plano não é uma lista'] }
  // Pelo índice da página: linha ilegível fica fora da leitura, e as outras não mudam de lugar.
  const linhas = new Map(leitura.linhas.map((l) => [l.indice, l]))
  const vistas = new Set<string>()
  const problemas = plano.flatMap((bruta: unknown, n) => {
    const problema = problemaDa(bruta, leitura, linhas, vistas)
    return problema ? [`instrução ${n + 1}: ${problema}`] : []
  })
  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, instrucoes: plano as Instrucao[] }
}
