// Bater crachás em sequência, sem clique nenhum — a mão que falta nos testes
// de ponta a ponta.
//
// O dongle é HID de teclado (ver `nucleo/digitacao.ts`): para o app, um crachá
// é só uma rajada de dígitos. Não existe "simular NFC" — `LeitorSimulado`
// **é** o mesmo efeito, porque é exatamente onde a diferença entre hardware e
// software deixa de importar.
//
// Existe por dois achados de verdade, os dois em testes que bateram mais de
// uma leva de crachás:
//
// 1. Disparar o próximo toque assim que o evento grava no banco não basta —
//    o `Fluxo` ainda precisa recontar quem falta e repassar isso pra tela, e
//    sem esperar esse sinal um aluno recebia dois crachás (segunda via)
//    enquanto outro nunca era chamado. `aposCadaToque` existe pra isso.
// 2. Ligar e desligar o relógio falso **a cada leva** volta pro relógio real
//    entre uma leva e outra — e como o relógio falso tinha avançado à frente
//    do real, voltar é andar **pra trás**. Um evento do dia 1, com carimbo no
//    "futuro" fake, passava a valer como se fosse do dia 2, porque
//    `e.quando >= sessao.abertaEm` (`TelaAula`) é comparação de texto ISO, e
//    o "presente" do dia 2 chegava antes desse "futuro" no relógio de
//    verdade. Por isso o relógio falso é responsabilidade de quem chama —
//    uma jornada inteira, com vários dias de aula, usa **um relógio só**, que
//    nunca recua.

import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { INTERVALO_MINIMO_MS } from '../nucleo/sessao.ts'
import type { LeitorSimulado } from '../adaptadores/leitor/LeitorSimulado.ts'

/**
 * `04` + seis dígitos hex distintos — mesmo prefixo NXP dos crachás de
 * verdade, e o mesmo comprimento (4 bytes) que `decimalParaBytes` espera do
 * dongle real.
 */
export function gerarBaralho(quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => `04${i.toString(16).padStart(6, '0')}`)
}

/**
 * Um relógio falso só de `Date`, pro trecho inteiro de `fn` — nunca recua no
 * meio, mesmo que `fn` bata várias levas de crachás ou abra mais de uma
 * sessão. Fingir `setInterval`/`clearInterval` também derrubaria o commit da
 * transação do IndexedDB — "Transaction committed too early" — por isso só
 * `Date`.
 */
export async function comRelogioSimulado<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    return await fn()
  } finally {
    vi.useRealTimers()
  }
}

/**
 * Bate cada crachá do baralho, esperando `aposCadaToque` entre um e outro
 * antes de avançar a data e seguir pro próximo. Pressupõe um relógio falso já
 * ligado — ver `comRelogioSimulado`.
 */
export async function baterCrachasEmSequencia(
  leitor: LeitorSimulado,
  baralho: readonly string[],
  aposCadaToque?: (indice: number, restam: number) => Promise<void> | void,
): Promise<void> {
  for (let i = 0; i < baralho.length; i++) {
    await act(async () => leitor.simular(baralho[i]))
    await aposCadaToque?.(i, baralho.length - i - 1)
    // Acima de `INTERVALO_MINIMO_MS`: é o que evita "rápido demais" entre
    // crachás diferentes, sem o teste levar segundos de verdade por toque.
    vi.setSystemTime(new Date(Date.now() + INTERVALO_MINIMO_MS + 50))
  }
}
