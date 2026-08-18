import { describe, expect, it } from 'vitest'
import { decidirRota, type EstadoDoApp } from './rota.ts'

const BASE: EstadoDoApp = { ambienteQuebrado: false, lendo: true, turmas: 1, pendentes: 0 }

describe('a rota decorre do estado', () => {
  it('sem turma, a tela é colar a turma', () => {
    expect(decidirRota({ ...BASE, turmas: 0 })).toBe('turma')
  })

  it('com gente sem crachá, a tela é a cerimônia', () => {
    expect(decidirRota({ ...BASE, pendentes: 7 })).toBe('cerimonia')
  })

  it('com tudo vinculado, a tela é a espera', () => {
    expect(decidirRota(BASE)).toBe('pronto')
  })

  // Tela bonita sobre leitor desligado é mentira: nenhum crachá vai chegar.
  it('sem leitor lendo, a tela é o problema', () => {
    expect(decidirRota({ ...BASE, lendo: false })).toBe('problema')
  })

  it('ambiente quebrado vence tudo, inclusive não ter turma', () => {
    expect(decidirRota({ ...BASE, ambienteQuebrado: true, turmas: 0 })).toBe('problema')
  })

  // Sem turma não há quem armar, então colar a lista vem antes de reclamar do
  // leitor — é o que o professor precisa fazer primeiro de qualquer jeito.
  it('colar a turma vem antes de cobrar leitor', () => {
    expect(decidirRota({ ...BASE, turmas: 0, lendo: false })).toBe('turma')
  })
})
