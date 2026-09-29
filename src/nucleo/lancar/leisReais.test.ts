// Portão B (`docs/08` §6): as leis da conciliação sobre a planilha real de
// CIN0114, anonimizada, em 200 variações do que a vida faz com ela: o dia em
// que o favorito é clicado, as presenças do Adsum nas aulas não lançadas, o
// professor mexendo em células antes, e ajustes. Mais a lei 8, da planilha
// real: nada "a lançar" em aula que o SIGAA já tem como lançada.

import { describe, expect, it } from 'vitest'
import { conferirContraBruto } from '../../favorito/aplicar.ts'
import { cenarioDaBancada } from '../../testes/cenarioDaBancada.ts'
import { sorteador } from '../../testes/planilhaSigaa.ts'
import { PLANILHA_CIN0114 } from '../../testes/planilhaReal.ts'
import { planilhaDeFaltas } from '../faltas.ts'
import { conciliar } from './conciliar.ts'
import { lerPlanilha, type BrutoPlanilha } from './leitura.ts'
import { planejar, validarPlano } from './plano.ts'
import type { AjusteSigaa, LeituraPlanilha, Relatorio } from './tipos.ts'

const INICIO = new Date('2026-08-10T12:00:00').getTime()
const FIM = new Date('2026-12-20T12:00:00').getTime()

function variacao(semente: number) {
  const s = sorteador(semente)
  const agora = new Date(INICIO + s.entre(0, 1000) * ((FIM - INICIO) / 1000))
  const cenario = cenarioDaBancada(PLANILHA_CIN0114, agora, semente)
  const bruto: BrutoPlanilha = { legenda: PLANILHA_CIN0114.legenda, periodo: PLANILHA_CIN0114.periodo, auxAulas: PLANILHA_CIN0114.auxAulas, auxAlunos: PLANILHA_CIN0114.auxAlunos }
  let leitura = lerPlanilha(bruto, `real-${semente}`, agora).leitura!
  // O professor clicou em algumas células vazias antes do favorito.
  const vazias = leitura.linhas.flatMap((l, i) => l.celulas.flatMap((c, j) => (c.tipo === 'vazia' ? [[i, j]] : [])))
  const ids = [...new Set(PLANILHA_CIN0114.auxAlunos.split(';').map((r) => r.split(',')[0]))]
  const textos: Record<string, string[]> = {}
  for (let k = 0; k < s.entre(0, 5) && vazias.length; k++) {
    const [i, j] = vazias[s.entre(0, vazias.length - 1)]
    textos[ids[i]] ??= Array.from({ length: leitura.colunas.length }, (_, n) => {
      const c = leitura.linhas[i].celulas[n]
      return c.tipo === 'lancada' ? String(c.faltas) : ''
    })
    textos[ids[i]][j] = String(s.entre(0, leitura.colunas[j].maximo ?? 2))
  }
  bruto.textos = textos
  leitura = lerPlanilha(bruto, `real-${semente}`, agora).leitura!
  const ajustes: AjusteSigaa[] = []
  for (let k = 0; k < s.entre(0, 3); k++) {
    const linha = leitura.linhas[s.entre(0, leitura.linhas.length - 1)]
    const coluna = leitura.colunas[s.entre(0, leitura.colunas.length - 1)]
    ajustes.push({ turma: cenario.turma, dia: coluna.dia, matricula: linha.matricula, valor: s.entre(0, coluna.maximo ?? 2), em: `2026-12-2${k}T00:00:00.000Z` })
  }
  // Às vezes o professor fez a chamada no papel: o Adsum não tem aquele dia lançado.
  let eventos = cenario.eventos
  const lancados = leitura.colunas.filter((c) => c.marca === 'lancado').map((c) => c.dia.replaceAll('-', ''))
  if (lancados.length && s.chance(0.5)) {
    const semAdsum = lancados[s.entre(0, lancados.length - 1)]
    eventos = eventos.filter((e) => e.eventoId.split('-')[2] !== semAdsum)
  }
  const entrada = { leitura, turma: cenario.turma, matriculados: cenario.matriculados, eventos, ajustes }
  return { ...entrada, bruto, agora, relatorio: conciliar(entrada) }
}

const SEMENTES = Array.from({ length: 200 }, (_, i) => i + 1)
function paraCada(lei: (v: ReturnType<typeof variacao>, semente: number) => void) {
  for (const semente of SEMENTES) {
    try {
      lei(variacao(semente), semente)
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
        return v === undefined ? cel : { tipo: 'lancada' as const, faltas: v }
      }),
    })),
  }
}

// 200 variações de uma planilha de 45 × 38: a lei 7 leva perto de 5 s sozinha,
// e sob a suíte inteira passava do limite padrão. O limite é do arquivo, não da lei.
describe('portão B: as leis sobre a planilha real de CIN0114, em 200 variações', { timeout: 30_000 }, () => {
  it('as variações exercitam o que importa: há o que lançar, o que confere e o que diverge', () => {
    const vistas = new Set<string>()
    paraCada(({ relatorio }) => relatorio.celulas.forEach((c) => vistas.add(c.categoria)))
    expect([...vistas].sort()).toEqual(['aLancar', 'confere', 'diverge', 'fora', 'soNoSigaa'])
  })

  it('1 · partição, e 2 · só célula vazia fica "a lançar"', () => {
    paraCada(({ leitura, relatorio }) => {
      expect(relatorio.celulas).toHaveLength(leitura.linhas.length * leitura.colunas.length)
      for (const c of relatorio.celulas) if (c.categoria === 'aLancar') expect(leitura.linhas[c.linha].celulas[c.coluna].tipo).toBe('vazia')
    })
  })

  it('3 · nunca inventa dia, e 8 · nada a lançar em aula já lançada', () => {
    paraCada(({ leitura, eventos, ajustes, relatorio }) => {
      const comChamada = new Set(eventos.filter((e) => e.origem === 'professor').map((e) => e.eventoId.split('-')[2]))
      const ajustados = new Set(ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const c of relatorio.celulas) {
        if (c.categoria !== 'aLancar') continue
        expect(comChamada.has(c.dia.replaceAll('-', '')) || ajustados.has(`${c.dia}|${c.matricula}`)).toBe(true)
        expect(leitura.colunas[c.coluna].marca).not.toBe('lancado')
      }
    })
  })

  it('4 · tudo dentro do máximo da aula, e fora de ajuste ausente leva o máximo daquele dia (que não é sempre 2)', () => {
    let foraDoComum = 0
    paraCada(({ leitura, ajustes, relatorio }) => {
      const ajustados = new Set(ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const c of relatorio.celulas) {
        if (c.categoria !== 'aLancar' && c.categoria !== 'diverge') continue
        const maximo = leitura.colunas[c.coluna].maximo!
        expect(c.esperado).toBeGreaterThanOrEqual(0)
        expect(c.esperado).toBeLessThanOrEqual(maximo)
        if (ajustados.has(`${c.dia}|${c.matricula}`)) continue
        expect([0, maximo]).toContain(c.esperado)
        if (c.esperado > 2) foraDoComum += 1
      }
    })
    // Os dias de 4 e de 12 aulas têm de aparecer, senão a lei passa no vazio.
    expect(foraDoComum).toBeGreaterThan(0)
  })

  it('5 · idempotência: lançado o que estava "a lançar", conciliar de novo dá zero', () => {
    paraCada((v) => {
      const depois = conciliar({ ...v, leitura: aplicarALancar(v.leitura, v.relatorio) })
      expect(depois.celulas.filter((c) => c.categoria === 'aLancar')).toEqual([])
    })
  })

  it('6 · concordância com a planilha de faltas da pasta: presente lá é presente aqui', () => {
    paraCada(({ turma, matriculados, eventos, ajustes, relatorio }) => {
      const v1 = new Map(planilhaDeFaltas(eventos, matriculados, [], turma).linhas.map((l) => [l.matriculado.matricula, l.porDia]))
      const ajustados = new Set(ajustes.map((a) => `${a.dia}|${a.matricula}`))
      for (const c of relatorio.celulas) {
        if (c.categoria !== 'aLancar' || ajustados.has(`${c.dia}|${c.matricula}`)) continue
        expect(c.esperado === 0).toBe(v1.get(c.matricula)?.get(c.dia)?.faltas === 0)
      }
    })
  })

  it('7 · um ajuste a mais só muda a célula dele', () => {
    paraCada((v, semente) => {
      const s = sorteador(semente * 31)
      const linha = v.leitura.linhas[s.entre(0, v.leitura.linhas.length - 1)]
      const coluna = v.leitura.colunas[s.entre(0, v.leitura.colunas.length - 1)]
      const novo = { turma: v.turma, dia: coluna.dia, matricula: linha.matricula, valor: 0, em: '2027-01-01T00:00:00.000Z' }
      const depois = conciliar({ ...v, ajustes: [...v.ajustes, novo] })
      v.relatorio.celulas.forEach((c, i) => {
        if (c.linha !== linha.indice || c.coluna !== coluna.indice) expect(depois.celulas[i]).toEqual(c)
      })
    })
  })

  it('o plano passa no validador do Adsum e no do favorito, sobre o mesmo bruto', () => {
    paraCada(({ leitura, bruto, agora, relatorio }) => {
      const plano = planejar(relatorio, [])
      expect(validarPlano(plano, leitura)).toMatchObject({ ok: true })
      expect(conferirContraBruto(plano, bruto, agora)).toMatchObject({ ok: true })
    })
  })
})
