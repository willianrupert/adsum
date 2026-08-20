import { describe, expect, it } from 'vitest'
import { BLOCOS, chaveDoBloco, horasPorSemana, marcadosDe } from './horarios.ts'

describe('a grade como o professor a enxerga', () => {
  it('marca o que já está cadastrado', () => {
    const { marcados } = marcadosDe([
      { dia: 3, inicio: '13:00' },
      { dia: 1, inicio: '15:00' },
    ])
    expect(marcados).toEqual(new Set([chaveDoBloco(3, '13:00'), chaveDoBloco(1, '15:00')]))
  })

  // A tela não pode fingir que a aula não existe: ela continua abrindo a
  // chamada, e quem salvar por cima sem saber a perde.
  it('conta as aulas que não cabem em bloco nenhum', () => {
    const { marcados, foraDosBlocos } = marcadosDe([
      { dia: 3, inicio: '13:00' },
      { dia: 3, inicio: '07:30' },
      { dia: 6, inicio: '08:00' },
    ])
    expect(marcados.size).toBe(1)
    expect(foraDosBlocos).toBe(2)
  })

  it('soma as horas da semana', () => {
    expect(horasPorSemana(new Set([chaveDoBloco(3, '13:00')]))).toBeCloseTo(1.833, 2)
    expect(
      horasPorSemana(new Set([chaveDoBloco(3, '13:00'), chaveDoBloco(3, '15:00')])),
    ).toBeCloseTo(3.667, 2)
  })

  it('os blocos cobrem manhã, tarde e noite', () => {
    expect(new Set(BLOCOS.map((b) => b.turno))).toEqual(new Set(['manha', 'tarde', 'noite']))
  })
})
