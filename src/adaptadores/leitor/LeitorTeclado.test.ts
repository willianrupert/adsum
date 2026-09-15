// `LeitorTeclado` nunca tinha teste próprio — só a função pura que ele chama
// por baixo (`digitacao.test.ts`). A pergunta que motivou este arquivo: "você
// sabe mesmo quantos dígitos chegam do dongle de verdade?" E a resposta
// importa, porque `LeitorSimulado` (usado em todos os outros testes de tela)
// não passa pelo teclado nem pela decodificação — recebe o UID já pronto.
// Só aqui se prova que um evento de `keydown` de verdade, no formato que o
// dongle de fábrica manda, chega a um UID correto.
//
// Os dois UIDs abaixo não são de mentira: são os exemplos medidos com o
// dongle real, registrados na sessão de 10/09/2026 — a conta bate (0930148883
// → 3770f213, decimal big-endian de 4 bytes), e é essa mesma conta que este
// teste confere, agora sem depender de ninguém lembrar de conferir a olho.

import { afterEach, describe, expect, it } from 'vitest'
import { LeitorTeclado } from './LeitorTeclado.ts'
import { uidParaHex } from '../../nucleo/uid.ts'
import type { Leitura } from '../../portas/LeitorDeCracha.ts'

let leitor: LeitorTeclado | undefined

afterEach(async () => {
  await leitor?.parar()
  leitor = undefined
})

/** Uma tecla por vez, na janela — o mesmo alvo que o dongle real atinge. */
function tecla(caractere: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: caractere, bubbles: true, cancelable: true }))
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

async function digitarComRitmo(texto: string, deltasMs: number[]) {
  for (let i = 0; i < texto.length; i++) {
    if (i > 0) await esperar(deltasMs[(i - 1) % deltasMs.length])
    tecla(texto[i])
  }
  tecla('Enter')
}

async function ler(): Promise<Leitura> {
  leitor = new LeitorTeclado()
  await leitor.iniciar()
  return new Promise((resolver) => leitor!.aoLer(resolver))
}

/**
 * A mesma rajada do dongle, mas com a aba ocupada entre duas teclas —
 * `atrasoDeProcessamento` simula um recarregamento de tela custando isso
 * antes do manipulador conseguir rodar. `timeStamp` de cada tecla é
 * carimbado ANTES do atraso, como o navegador faz de verdade: perto da
 * chegada física, não de quando o `keydown` finalmente é processado.
 */
async function digitarComAbaOcupada(texto: string, gapReal: number, atrasoDeProcessamento: number) {
  const base = performance.now()
  for (let i = 0; i < texto.length; i++) {
    const chegadaDeVerdade = base + i * gapReal
    if (i > 0) await esperar(atrasoDeProcessamento)
    const evento = new KeyboardEvent('keydown', { key: texto[i], bubbles: true, cancelable: true })
    Object.defineProperty(evento, 'timeStamp', { value: chegadaDeVerdade, configurable: true })
    window.dispatchEvent(evento)
  }
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  Object.defineProperty(enter, 'timeStamp', { value: base + texto.length * gapReal, configurable: true })
  window.dispatchEvent(enter)
}

describe('decimal de 10 dígitos — o formato que o dongle de verdade manda', () => {
  it('0930148883 vira o UID medido (3770f213)', async () => {
    const promessa = ler()
    await digitarComRitmo('0930148883', [17])
    expect(uidParaHex((await promessa).uid)).toBe('3770f213')
  })

  it('2367396804 vira o outro UID medido (8d1b9bc4)', async () => {
    const promessa = ler()
    await digitarComRitmo('2367396804', [17])
    expect(uidParaHex((await promessa).uid)).toBe('8d1b9bc4')
  })

  // 16, 32, 17, 17, 17 ms — as cinco rajadas medidas de verdade, documentadas
  // em `nucleo/digitacao.ts`. Não é só a função pura que precisa aguentar
  // isso: é o adaptador que junta as teclas.
  it('aguenta o ritmo real medido, pico de 32 ms incluído', async () => {
    const promessa = ler()
    await digitarComRitmo('0930148883', [16, 32, 17, 17, 17])
    expect(uidParaHex((await promessa).uid)).toBe('3770f213')
  })
})

describe('o formato de fábrica também passa pelo teclado de verdade', () => {
  it('hexadecimal com dois-pontos entre os bytes', async () => {
    const promessa = ler()
    await digitarComRitmo('1D:F3:1F:D3:1B:10:80', [12])
    const leitura = await promessa
    expect(leitura.uid).toHaveLength(7)
    expect(uidParaHex(leitura.uid)).toBe('1df31fd31b1080')
  })
})

// Aula real, 15/09/2026: o professor relatou que o app "parou de associar
// os crachás com os alunos" no meio da chamada, sem erro nenhum na tela.
// Causa: o ritmo era medido com `performance.now()` dentro do manipulador —
// isso mede quando o manipulador RODOU, não quando a tecla chegou de
// verdade. Com a aba ocupada (turma grande, tela reatualizando a cada
// crachá), um `keydown` fica na fila do navegador e o manipulador roda
// atrasado; o atraso de processamento parecia atraso de digitação, e
// `INTERVALO_MAXIMO_MS` (60 ms) recusava a rajada inteira, em silêncio —
// sem toast, sem bipe, sem "crachá desconhecido". `evento.timeStamp` resolve
// porque é carimbado pelo navegador perto da chegada física da tecla,
// imune a quanto tempo a aba levou para processá-la.
describe('a aba ocupada entre duas teclas não derruba a leitura', () => {
  it('rajada no ritmo real do dongle, com 200 ms de tela ocupada no meio, ainda vira leitura', async () => {
    const promessa = ler()
    // Mesmo ritmo medido do dongle (16-32 ms) — só que a terceira tecla leva
    // 200 ms de verdade para ser processada, como um re-render custoso
    // faria. Sem o fix, isso pareceria um gap de 200 ms na rajada.
    await digitarComAbaOcupada('0930148883', 17, 200)
    expect(uidParaHex((await promessa).uid)).toBe('3770f213')
  })
})

describe('o que não é dongle', () => {
  it('digitação humana — devagar — nunca vira leitura', async () => {
    leitor = new LeitorTeclado()
    await leitor.iniciar()
    const leituras: Leitura[] = []
    leitor.aoLer((leitura) => leituras.push(leitura))

    // 120 ms entre teclas: bem acima do pico medido (32 ms) do dongle real.
    await digitarComRitmo('04a23b91', [120])

    expect(leituras).toHaveLength(0)
  })
})
