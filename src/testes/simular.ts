// Bater crachás em sequência, sem clique nenhum — a mão que falta nos testes
// de ponta a ponta.
//
// O dongle é HID de teclado (ver `nucleo/digitacao.ts`): para o app, um crachá
// é só uma rajada de dígitos. Não existe "simular NFC" — `LeitorSimulado`
// **é** o mesmo efeito, porque é exatamente onde a diferença entre hardware e
// software deixa de importar.
//
// Existe por três achados de verdade, os três só reproduzíveis sob Node 22
// (o do CI) — sob uma versão mais nova, sumiam sozinhos, o que escondeu os
// dois primeiros por várias rodadas de ajuste às cegas via GitHub Actions:
//
// 1. Disparar o próximo toque assim que o evento grava no banco não basta —
//    o `Fluxo` ainda precisa recontar quem falta e repassar isso pra tela, e
//    sem esperar esse sinal um aluno recebia dois crachás (segunda via)
//    enquanto outro nunca era chamado. `aposCadaToque` existe pra isso.
// 2. A espera entre toques era um relógio falso (`vi.setSystemTime`), não
//    tempo de verdade — mais rápido, mas o GitHub Actions travava sem nunca
//    resolver, mesmo com um minuto de prazo. Relógio falso ligado o teste
//    inteiro mexe em algo que essa máquina não gosta, e nenhum prazo
//    consertava, porque não era demora — era travamento. Espera real
//    (`setTimeout` de verdade) resolveu esse.
// 3. O `useEffect` que assina `leitor.aoLer`, em `TelaAula`, depende de
//    `pendentes` — desliga e assina de novo a cada toque que muda quem
//    falta, não só na montagem. Um toque simulado bem na fresta entre o
//    efeito antigo já desligado e o novo ainda não religado não tem quem
//    escute: o emissor não guarda leitura nenhuma pra entregar depois, e
//    nenhuma quantidade de `act()` ou de prazo trouxe isso de volta com
//    certeza — tentativas de forçar o efeito a assentar ora ajudaram, ora
//    pioraram, sinal de que a fresta depende de escalonamento do sistema
//    operacional, não só do React. A saída que sobrou: perguntar ao banco.
//    Se o evento não aparecer logo depois do toque, ninguém estava ouvindo, e
//    bater o mesmo crachá de novo é seguro — nada foi gravado na tentativa
//    perdida, então a próxima não duplica nada. Uma tentativa extra bastava
//    quase sempre; num teste de jornada mais longa (`JornadaDuasTurmas`,
//    turma colada pela UI de verdade em vez de gravada direto), duas
//    tentativas seguidas caíram na mesma fresta — daí o loop de
//    `TENTATIVAS_POR_TOQUE`, em vez de uma tentativa só.
//
// 4. Desde 11/09/2026, `TelaAula` tem dois modos: comum (padrão, ninguém
//    chamado, crachá desconhecido abre a busca) e o de chamar nomes
//    (explícito, "Chamar nomes" ou as setas, crachá desconhecido cadastra
//    direto no chamado). Bater um baralho inteiro é exatamente o caso do
//    modo de chamar nomes — o professor está de fato observando cada crachá
//    encostar —, então esta função entra nele sozinha, uma vez, se o convite
//    estiver na tela. Dali em diante cada toque cadastra e avança sem
//    precisar responder busca nenhuma, igual ao gesto de verdade.

import { act, fireEvent, screen } from '@testing-library/react'
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

/** Repete `condicao` até ela ser verdadeira ou o prazo acabar. Devolve se deu certo. */
async function esperarAte(condicao: () => Promise<boolean>, prazoMs: number): Promise<boolean> {
  const fim = Date.now() + prazoMs
  while (Date.now() < fim) {
    if (await condicao()) return true
    await esperar(20)
  }
  return await condicao()
}

/**
 * Bate cada crachá do baralho, esperando `aposCadaToque` entre um e outro
 * antes de esperar acima de `INTERVALO_MINIMO_MS` de verdade e seguir pro
 * próximo — é o que evita "rápido demais" entre crachás diferentes.
 *
 * `contarEventos` é como o teste sabe que o toque foi mesmo ouvido: se o
 * total não mudar depressa, bate o mesmo crachá de novo.
 */
/**
 * Quantas vezes insistir num toque que não foi ouvido, antes de aceitar que
 * algo está mesmo errado em vez de só ter caído na fresta da resubscrição.
 * Uma tentativa só (a versão anterior) bastava quase sempre, mas "quase" um
 * teste que trava numa asserção que nunca mais bate — insistir mais é seguro
 * pelo mesmo motivo de sempre: nada foi gravado na tentativa perdida, então
 * bater de novo não duplica nada.
 */
const TENTATIVAS_POR_TOQUE = 5

export async function baterCrachasEmSequencia(
  leitor: LeitorSimulado,
  baralho: readonly string[],
  contarEventos: () => Promise<number>,
  aposCadaToque?: (indice: number, restam: number) => Promise<void> | void,
): Promise<void> {
  // Entra no modo de chamar nomes se o convite estiver na tela — sem isso, o
  // modo comum (padrão) abriria a busca a cada crachá desconhecido, e nada
  // aqui responderia por ela.
  const convite = screen.queryByRole('button', { name: 'Chamar nomes' })
  if (convite) fireEvent.click(convite)

  for (let i = 0; i < baralho.length; i++) {
    const antes = await contarEventos()
    for (let tentativa = 0; tentativa < TENTATIVAS_POR_TOQUE; tentativa++) {
      await act(async () => leitor.simular(baralho[i]))
      const ouvido = await esperarAte(async () => (await contarEventos()) > antes, 1000)
      if (ouvido) break
    }
    await aposCadaToque?.(i, baralho.length - i - 1)
    await esperar(INTERVALO_MINIMO_MS + 50)
  }
}
