// A orquestração contra um rig e um leitor de mentira — nenhum hardware, nenhum
// `window.open` de verdade. O que se prova aqui é a coreografia: a suíte manda
// os comandos certos, na ordem certa, e lê exatamente os eventos que o leitor
// emitiu durante a janela de cada cenário — nunca antes, nunca depois.

import { describe, expect, it, vi } from 'vitest'
import { rodarSuiteFisica } from './suiteFisica.ts'
import { criarEmissor } from '../adaptadores/leitor/emissor.ts'
import type { Cancelar, EstadoLeitor, LeitorQueRecusa, Leitura, Recusa } from '../portas/LeitorDeCracha.ts'
import type { RigDeCracha } from './rigDeCracha.ts'
import { hexParaUid } from '../nucleo/uid.ts'

/** Implementa só o que `suiteFisica` usa de `RigDeCracha`. */
type RigParcial = Pick<RigDeCracha, 'definir' | 'disparar' | 'digitacaoHumana'>

/**
 * Um leitor de mentira que só existe para este teste: emite uma leitura (ou
 * recusa) quando o rig falso "dispara", a menos que a janela esteja
 * desfocada — é a ponte que, no mundo real, é o sistema operacional
 * decidindo pra onde vai a tecla.
 */
function criarLeitorDeMentira() {
  const leituras = criarEmissor<Leitura>()
  const recusas = criarEmissor<Recusa>()
  let focado = true
  const leitor: LeitorQueRecusa = {
    nome: 'Leitor de mentira',
    async estaDisponivel() {
      return true
    },
    estado(): EstadoLeitor {
      return 'lendo'
    },
    async iniciar() {},
    async parar() {},
    aoLer(escuta): Cancelar {
      return leituras.inscrever(escuta)
    },
    aoMudarEstado(): Cancelar {
      return () => {}
    },
    aoRecusar(escuta): Cancelar {
      return recusas.inscrever(escuta)
    },
    async diagnostico() {
      return { nome: this.nome, estado: 'lendo', disponivel: true, detalhes: {} }
    },
  }
  return {
    leitor,
    setFocado: (v: boolean) => (focado = v),
    emitirAceita: () => focado && leituras.emitir({ uid: hexParaUid('37701234'), em: new Date(), origem: 'teste' }),
    emitirRecusa: (motivo: Recusa['motivo']) => focado && recusas.emitir({ motivo, cru: 'x', em: new Date() }),
  }
}

function criarRigDeMentira(opcoes: {
  onDisparar?: (indice: number) => void
  onHumano?: (texto: string) => void
}): RigParcial {
  return {
    async definir() {},
    async disparar(indice: number) {
      opcoes.onDisparar?.(indice)
    },
    async digitacaoHumana(texto: string) {
      opcoes.onHumano?.(texto)
    },
  }
}

const semEspera = async () => {}

describe('rodarSuiteFisica', () => {
  it('quando tudo funciona, os quatro cenários são aprovados', async () => {
    const { leitor, emitirAceita, emitirRecusa, setFocado } = criarLeitorDeMentira()
    let dentroDaJanelaDeFoco = false
    const rig = criarRigDeMentira({
      onDisparar: () => {
        if (dentroDaJanelaDeFoco) return // simula o teclado indo pra janela auxiliar
        emitirAceita()
      },
      onHumano: () => emitirRecusa('ritmo'),
    })
    let auxiliarFechada = false
    const auxiliar = { focus: () => setFocado(false), close: () => (auxiliarFechada = true) }

    const resultados = await rodarSuiteFisica(rig as RigDeCracha, leitor, vi.fn(), {
      esperar: semEspera,
      abrirJanelaAuxiliar: () => {
        dentroDaJanelaDeFoco = true
        return {
          focus: () => {
            auxiliar.focus()
          },
          close: () => {
            dentroDaJanelaDeFoco = false
            setFocado(true)
            auxiliar.close()
          },
        }
      },
    })

    expect(resultados.map((r) => r.nome)).toEqual([
      'Ritmo normal',
      'Fila apressada (500 ms)',
      'Digitação humana (recusada)',
      'Perda de foco',
    ])
    expect(resultados.every((r) => r.aprovado)).toBe(true)
    expect(auxiliarFechada).toBe(true)
  })

  it('digitação humana virando leitura de verdade reprova só aquele cenário', async () => {
    const { leitor, emitirAceita } = criarLeitorDeMentira()
    const rig = criarRigDeMentira({
      onDisparar: () => emitirAceita(),
      onHumano: () => emitirAceita(), // bug hipotético: humano vira crachá
    })

    const resultados = await rodarSuiteFisica(rig as RigDeCracha, leitor, vi.fn(), {
      esperar: semEspera,
      abrirJanelaAuxiliar: () => ({ focus: () => {}, close: () => {} }),
    })

    const humano = resultados.find((r) => r.nome === 'Digitação humana (recusada)')!
    expect(humano.aprovado).toBe(false)
    // Os outros cenários não são contaminados pela falha de um só.
    expect(resultados.find((r) => r.nome === 'Ritmo normal')!.aprovado).toBe(true)
  })

  it('algo chegando mesmo sem foco reprova o cenário de foco — o teclado vazou pra janela errada', async () => {
    const { leitor, emitirAceita } = criarLeitorDeMentira()
    // Rig "quebrado": ignora a janela auxiliar e sempre entrega no leitor.
    const rig = criarRigDeMentira({ onDisparar: () => emitirAceita() })

    const resultados = await rodarSuiteFisica(rig as RigDeCracha, leitor, vi.fn(), {
      esperar: semEspera,
      abrirJanelaAuxiliar: () => ({ focus: () => {}, close: () => {} }),
    })

    expect(resultados.find((r) => r.nome === 'Perda de foco')!.aprovado).toBe(false)
  })

  it('pop-up bloqueado vira um resultado claro, não uma suíte travada', async () => {
    const { leitor, emitirAceita } = criarLeitorDeMentira()
    const rig = criarRigDeMentira({ onDisparar: () => emitirAceita(), onHumano: () => {} })

    const resultados = await rodarSuiteFisica(rig as RigDeCracha, leitor, vi.fn(), {
      esperar: semEspera,
      abrirJanelaAuxiliar: () => null,
    })

    const foco = resultados.find((r) => r.nome === 'Perda de foco')!
    expect(foco.aprovado).toBe(false)
    expect(foco.detalhe).toContain('pop-up')
  })

  it('erro do rig (ex.: ERR do firmware) vira "reprovado com o motivo", não uma exceção não tratada', async () => {
    const { leitor } = criarLeitorDeMentira()
    const rig: RigParcial = {
      async definir() {
        throw new Error('ERR indice fora do intervalo')
      },
      async disparar() {},
      async digitacaoHumana() {},
    }

    const resultados = await rodarSuiteFisica(rig as RigDeCracha, leitor, vi.fn(), { esperar: semEspera })
    expect(resultados[0].aprovado).toBe(false)
    expect(resultados[0].detalhe).toContain('ERR indice fora do intervalo')
  })

  it('avisa o progresso à medida que os cenários rodam', async () => {
    const { leitor, emitirAceita, emitirRecusa } = criarLeitorDeMentira()
    const rig = criarRigDeMentira({ onDisparar: () => emitirAceita(), onHumano: () => emitirRecusa('ritmo') })
    const progresso: string[] = []

    await rodarSuiteFisica(rig as RigDeCracha, leitor, (m) => progresso.push(m), {
      esperar: semEspera,
      abrirJanelaAuxiliar: () => ({ focus: () => {}, close: () => {} }),
    })

    expect(progresso[0]).toContain('Preparando')
    expect(progresso.at(-1)).toContain('concluída')
  })
})
