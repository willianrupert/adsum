import { useCallback, useState } from 'react'
import type { ComoSalvou } from '../../ambiente/arquivos.ts'

export type Recado = { tom: 'ok' | 'grave'; texto: string }

/** Lançar isto dentro de uma tentativa encerra sem recado: a pessoa disse "não". */
export const CANCELADO = 'cancelado'

/**
 * Uma ação de Ajustes ou Diagnóstico: roda, diz como foi, e recarrega a tela. Cancelar um
 * `confirm()` não vira recado: a pessoa acabou de responder "não".
 */
export function useTentativa(recarregar: () => Promise<void>) {
  const [recado, setRecado] = useState<Recado>()
  const tentar = useCallback(
    (rotulo: string, acao: () => string | void | Promise<string | void>) => async () => {
      try {
        const detalhe = await acao()
        setRecado({ tom: 'ok', texto: detalhe ? `${rotulo}: ${detalhe}` : `${rotulo}: feito.` })
        await recarregar()
      } catch (erro) {
        if ((erro as Error).message === CANCELADO) return
        setRecado({ tom: 'grave', texto: `${rotulo}: ${(erro as Error).message}` })
      }
    },
    [recarregar],
  )
  return { recado, tentar }
}

export type Tentar = ReturnType<typeof useTentativa>['tentar']

/** Pergunta, e encerra a tentativa em silêncio se a resposta for não. */
export function confirmarOuCancelar(pergunta: string): void {
  if (!confirm(pergunta)) throw new Error(CANCELADO)
}

/** Como um arquivo exportado foi salvo, dito na tela. */
export function comoFoi(salvou: ComoSalvou, nome: string): string {
  if (salvou === 'cancelado') return 'cancelado.'
  if (salvou === 'gravado') return `${nome} gravado.`
  return `${nome} foi para a pasta de downloads. Este navegador não tem File System Access.`
}

export function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
