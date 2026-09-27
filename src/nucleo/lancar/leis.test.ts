// As leis da conciliação (`docs/08`, camada 2), sobre centenas de cenários
// inventados. Exemplo prova o caso que alguém pensou; lei prova o que ninguém
// pensou. Semente fixa: uma falha aqui se reproduz com o número dela.

import { describe, expect, it } from 'vitest'
import { gerarCenario, sorteador, type Cenario } from '../../testes/planilhaSigaa.ts'
import { planilhaDeFaltas } from '../faltas.ts'
import { conciliar } from './conciliar.ts'
import type { LeituraPlanilha, Relatorio } from './tipos.ts'

const SEMENTES = Array.from({ length: 500 }, (_, i) => i + 1)

const conciliarCenario = (c: Cenario, leitura = c.leitura, ajustes = c.ajustes): Relatorio =>
  conciliar({ leitura, turma: c.turma, matriculados: c.matriculados, eventos: c.eventos, ajustes })

/** Cada semente, com o número dela na mensagem quando falha. */
function paraCada(lei: (c: Cenario, semente: number) => void) {
  for (const semente of SEMENTES) {
    try {
      lei(gerarCenario(semente), semente)
    } catch (erro) {
      throw new Error(`semente ${semente}: ${(erro as Error).message}`, { cause: erro })
    }
  }
}

/** A página depois de o professor aceitar tudo o que estava "a lançar". */
function aplicarALancar(leitura: LeituraPlanilha, r: Relatorio): LeituraPlanilha {
  const valores = new Map(r.celulas.flatMap((c) => (c.categoria === 'aLancar' ? [[`${c.linha}|${c.coluna}`, c.esperado]] : [])))
  return {
    ...leitura,
    linhas: leitura.linhas.map((l) => ({
      ...l,
      celulas: l.celulas.map((cel, j) => {
        const v = valores.get(`${l.indice}|${j}`)
        return v === undefined ? cel : { tipo: 'lancada', faltas: v }
      }),
    })),
  }
}

describe('as leis da conciliação, em 500 cenários', () => {
  it('1 · partição: cada célula da página cai em exatamente uma categoria', () => {
    paraCada((c) => {
      const r = conciliarCenario(c)
      expect(r.celulas).toHaveLength(c.leitura.linhas.length * c.leitura.colunas.length)
      const posicoes = new Set(r.celulas.map((x) => `${x.linha}|${x.coluna}`))
      expect(posicoes.size).toBe(r.celulas.length)
    })
  })

  it('2 · nunca toca lançado: só célula vazia fica "a lançar"', () => {
    paraCada((c) => {
      for (const x of conciliarCenario(c).celulas) {
        if (x.categoria === 'aLancar') expect(c.leitura.linhas[x.linha].celulas[x.coluna].tipo).toBe('vazia')
      }
    })
  })

  it('3 · nunca inventa dia: "a lançar" só onde há chamada ou ajuste', () => {
    paraCada((c) => {
      const comChamada = new Set(c.eventos.filter((e) => e.origem === 'professor').map((e) => e.eventoId.split('-')[2]))
      const ajustados = new Set(c.ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const x of conciliarCenario(c).celulas) {
        if (x.categoria !== 'aLancar') continue
        expect(comChamada.has(x.dia.replaceAll('-', '')) || ajustados.has(`${x.dia}|${x.matricula}`)).toBe(true)
      }
    })
  })

  it('4 · faixa: tudo em 0…máximo, inclusive ajuste; fora de ajuste, presente é 0 e ausente é o máximo', () => {
    paraCada((c) => {
      const ajustados = new Set(c.ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const x of conciliarCenario(c).celulas) {
        if (x.categoria !== 'aLancar' && x.categoria !== 'diverge') continue
        const maximo = c.leitura.colunas[x.coluna].maximo
        expect(maximo).toBeDefined()
        expect(x.esperado).toBeGreaterThanOrEqual(0)
        expect(x.esperado).toBeLessThanOrEqual(maximo!)
        if (ajustados.has(`${x.dia}|${x.matricula}`)) continue
        expect([0, maximo]).toContain(x.esperado)
      }
    })
  })

  it('5 · idempotência: lançar o que estava "a lançar" e conciliar de novo dá zero a lançar', () => {
    paraCada((c) => {
      const antes = conciliarCenario(c)
      const depois = conciliarCenario(c, aplicarALancar(c.leitura, antes))
      expect(depois.celulas.filter((x) => x.categoria === 'aLancar')).toEqual([])
      const eraALancar = new Set(antes.celulas.filter((x) => x.categoria === 'aLancar').map((x) => `${x.linha}|${x.coluna}`))
      for (const x of depois.celulas) if (eraALancar.has(`${x.linha}|${x.coluna}`)) expect(x.categoria).toBe('confere')
      expect(depois.semMaximo).toEqual(antes.semMaximo)
      expect(depois.semOndeLancar).toEqual(antes.semOndeLancar)
    })
  })

  it('6 · concordância com a v1: presente para o SIGAA é presente na planilha de faltas da pasta', () => {
    paraCada((c) => {
      const v1 = planilhaDeFaltas(c.eventos, c.matriculados, [], c.turma)
      const faltasV1 = new Map(v1.linhas.map((l) => [l.matriculado.matricula, l.porDia]))
      const ajustados = new Set(c.ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const x of conciliarCenario(c).celulas) {
        if (x.categoria !== 'aLancar' && x.categoria !== 'diverge' && !(x.categoria === 'confere' && !x.ajustada)) continue
        if (ajustados.has(`${x.dia}|${x.matricula}`)) continue
        const esperado = x.categoria === 'confere' ? x.valor : x.esperado
        const naV1 = faltasV1.get(x.matricula)?.get(x.dia)
        expect(naV1, `${x.matricula} em ${x.dia}`).toBeDefined()
        expect(esperado === 0).toBe(naV1!.faltas === 0)
      }
    })
  })

  it('7 · monotonia do ajuste: acrescentar um ajuste só muda a célula dele', () => {
    paraCada((c, semente) => {
      if (c.leitura.linhas.length === 0 || c.leitura.colunas.length === 0) return
      const s = sorteador(semente * 7919)
      const linha = c.leitura.linhas[s.entre(0, c.leitura.linhas.length - 1)]
      const coluna = c.leitura.colunas[s.entre(0, c.leitura.colunas.length - 1)]
      const novo = { turma: c.turma, dia: coluna.dia, matricula: linha.matricula, valor: s.entre(0, 3), em: '2027-01-01T00:00:00.000Z' }
      const antes = conciliarCenario(c)
      const depois = conciliarCenario(c, c.leitura, [...c.ajustes, novo])
      antes.celulas.forEach((x, i) => {
        if (x.linha === linha.indice && x.coluna === coluna.indice) return
        expect(depois.celulas[i]).toEqual(x)
      })
      expect(depois.semParSigaa).toEqual(antes.semParSigaa)
      expect(depois.semParAdsum).toEqual(antes.semParAdsum)
    })
  })

  it('os cenários exercitam todas as categorias, senão as leis passam no vazio', () => {
    const vistas = new Set<string>()
    for (const semente of SEMENTES) for (const x of conciliarCenario(gerarCenario(semente)).celulas) vistas.add(x.categoria + (x.categoria === 'confere' && x.ajustada ? '·ajustada' : ''))
    expect([...vistas].sort()).toEqual(['aLancar', 'confere', 'confere·ajustada', 'diverge', 'fora', 'soNoSigaa'])
  })
})
