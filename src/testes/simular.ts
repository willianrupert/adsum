// Bater crachás em sequência, sem clique nenhum — a mão que falta nos testes
// de ponta a ponta.
//
// O dongle é HID de teclado (ver `nucleo/digitacao.ts`): para o app, um crachá
// é só uma rajada de dígitos. Não existe "simular NFC" — `LeitorSimulado`
// **é** o mesmo efeito, porque é exatamente onde a diferença entre hardware e
// software deixa de importar.
//
// Existe por dois achados de verdade:
//
// 1. Disparar o próximo toque assim que o evento grava no banco não basta —
//    o `Fluxo` ainda precisa recontar quem falta e repassar isso pra tela, e
//    sem esperar esse sinal um aluno recebia dois crachás (segunda via)
//    enquanto outro nunca era chamado. `aposCadaToque` existe pra isso.
// 2. A espera entre toques era um relógio falso (`vi.setSystemTime`), não
//    tempo de verdade — mais rápido aqui, mas o GitHub Actions travava sem
//    nunca resolver, mesmo com um minuto de prazo. Relógio falso ligado o
//    teste inteiro mexe em algo que essa máquina não gosta, e nenhuma
//    quantidade de prazo consertava, porque não era demora — era travamento.
//    Espera real (`setTimeout` de verdade) custa alguns segundos a mais e
//    funciona igual em qualquer máquina, porque não depende de nada além do
//    relógio já existir.

import { act } from '@testing-library/react'
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

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/**
 * Bate cada crachá do baralho, esperando `aposCadaToque` entre um e outro
 * antes de esperar acima de `INTERVALO_MINIMO_MS` de verdade e seguir pro
 * próximo — é o que evita "rápido demais" entre crachás diferentes.
 */
export async function baterCrachasEmSequencia(
  leitor: LeitorSimulado,
  baralho: readonly string[],
  aposCadaToque?: (indice: number, restam: number) => Promise<void> | void,
): Promise<void> {
  for (let i = 0; i < baralho.length; i++) {
    await act(async () => leitor.simular(baralho[i]))
    await aposCadaToque?.(i, baralho.length - i - 1)
    await esperar(INTERVALO_MINIMO_MS + 50)
  }
}
