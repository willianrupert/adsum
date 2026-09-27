import { describe, expect, it } from 'vitest'
import { gerarCenario } from './planilhaSigaa.ts'

const SEMENTES = Array.from({ length: 300 }, (_, i) => i + 1)

describe('cenários inventados da planilha do SIGAA', () => {
  it('a mesma semente dá o mesmo cenário, e outra semente dá outro', () => {
    expect(JSON.stringify(gerarCenario(7))).toBe(JSON.stringify(gerarCenario(7)))
    expect(JSON.stringify(gerarCenario(7))).not.toBe(JSON.stringify(gerarCenario(8)))
  })

  it('toda leitura tem a forma do contrato', () => {
    for (const s of SEMENTES) {
      const { leitura } = gerarCenario(s)
      const matriculas = leitura.linhas.map((l) => l.matricula)
      expect(new Set(matriculas).size).toBe(matriculas.length)
      expect(new Set(leitura.colunas.map((c) => c.dia)).size).toBe(leitura.colunas.length)
      leitura.colunas.forEach((c, i) => expect(c.indice).toBe(i))
      for (const [i, linha] of leitura.linhas.entries()) {
        expect(linha.indice).toBe(i)
        expect(linha.celulas).toHaveLength(leitura.colunas.length)
        linha.celulas.forEach((c, j) => {
          const maximo = leitura.colunas[j].maximo
          if (c.tipo === 'lancada' && maximo !== undefined) expect(c.faltas).toBeLessThanOrEqual(maximo)
          if (c.tipo === 'lancada') expect(c.faltas).toBeGreaterThanOrEqual(0)
        })
      }
    }
  })

  it('a leitura não traz nome de ninguém', () => {
    for (const s of SEMENTES.slice(0, 50)) {
      const { leitura, matriculados } = gerarCenario(s)
      const texto = JSON.stringify(leitura)
      expect(texto).not.toMatch(/"nome/)
      for (const m of matriculados) expect(texto).not.toContain(m.nomeCompleto)
    }
  })

  it('os casos raros aparecem: trancado, matriculado depois, feriado, cancelada, sem máximo, sem par', () => {
    const vistos = new Set<string>()
    for (const s of SEMENTES) {
      const { leitura, matriculados, eventos } = gerarCenario(s)
      for (const l of leitura.linhas) for (const c of l.celulas) if (c.tipo === 'bloqueada') vistos.add(c.motivo)
      for (const l of leitura.linhas) for (const c of l.celulas) vistos.add(c.tipo)
      if (leitura.colunas.some((c) => c.maximo === undefined)) vistos.add('semMaximo')
      const naPagina = new Set(leitura.linhas.map((l) => l.matricula))
      if (matriculados.some((m) => !naPagina.has(m.matricula))) vistos.add('soNoAdsum')
      const noAdsum = new Set(matriculados.map((m) => m.matricula))
      if (leitura.linhas.some((l) => !noAdsum.has(l.matricula))) vistos.add('soNaPagina')
      const dias = new Set(leitura.colunas.map((c) => c.dia))
      if (eventos.some((e) => e.origem === 'professor' && !dias.has(e.quando.slice(0, 10) as never))) vistos.add('chamadaForaDasColunas')
      if (eventos.some((e) => e.origem === 'manual')) vistos.add('manual')
    }
    expect([...vistos].sort()).toEqual(
      [
        'bloqueada', 'cancelada', 'chamadaForaDasColunas', 'feriado', 'lancada', 'manual', 'matriculadoDepois',
        'semMaximo', 'soNaPagina', 'soNoAdsum', 'trancado', 'vazia',
      ].sort(),
    )
  })

  it('os eventos são da turma do cenário e caem no dia certo', () => {
    for (const s of SEMENTES.slice(0, 50)) {
      const { turma, eventos, matriculados } = gerarCenario(s)
      expect(matriculados.every((m) => m.turma === turma && m.papel === 'aluno')).toBe(true)
      for (const e of eventos) {
        expect(e.turma).toBe(turma)
        expect(e.eventoId).toMatch(/^[a-z0-9-]+-\d{8}-\d+$/)
      }
    }
  })
})
