// O repositório é público: toda planilha em `sigaa/` tem de ser a saída do
// anonimizador. Se alguém versionar uma captura crua, é aqui que falha.

import { describe, expect, it } from 'vitest'
import { PLANILHAS } from './planilhaReal.ts'

describe('as planilhas reais versionadas', () => {
  for (const [nome, p] of Object.entries(PLANILHAS)) {
    it(`${nome}: só gente inventada, e a forma que o docs/12 descreve`, () => {
      const alunos = p.auxAlunos.split(';').map((r) => r.split(','))
      const aulas = p.auxAulas.split(';').map((r) => r.split(','))
      expect(aulas.every((a) => a.length === 10)).toBe(true)
      expect(alunos.every((a) => a.length === 16)).toBe(true)
      for (const a of alunos) {
        expect(a[2]).toMatch(/^ALUNO \d{3} INVENTADO$/)
        expect(a[1]).toMatch(/^20269\d{6}$/)
        expect(Number(a[0])).toBeGreaterThan(900000)
        expect(Number(a[9])).toBeGreaterThan(800000)
        if (a[6] !== '0') expect(Number(a[6])).toBeGreaterThan(700000)
      }
      expect(p.legenda).toContain('DISCIPLINA ANONIMIZADA')
      expect(alunos).toHaveLength(new Set(alunos.map((a) => a[0])).size * aulas.length)
    })
  }
})
