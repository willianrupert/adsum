import { describe, expect, it } from 'vitest'
import { BLOCOS, chaveDoBloco, ehCurto, horasPorSemana, marcadosDe } from './horarios.ts'

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

// Lidos das grades de horário reais do CIn que o autor mandou, e é por isso que
// estão aqui: dois dos meus palpites estavam errados.
describe('os blocos são os do CIn, não os que eu supus', () => {
  it('tem o bloco de meio-dia, de 50 minutos', () => {
    const meioDia = BLOCOS.find((b) => b.inicio === '12:00')
    expect(meioDia).toMatchObject({ fim: '12:50' })
    expect(ehCurto(meioDia!)).toBe(true)
  })

  // Eu tinha escrito 19:00–20:50 por estimativa. A grade real diz outra coisa.
  it('a noite é 17:00–18:50 e 18:50–20:30, encostadas', () => {
    const noite = BLOCOS.filter((b) => b.turno === 'noite')
    expect(noite.map((b) => `${b.inicio}-${b.fim}`)).toEqual(['17:00-18:50', '18:50-20:30'])
    expect(noite[0].fim).toBe(noite[1].inicio)
  })

  it('os sete blocos cobrem o dia sem se sobrepor, fora a virada da noite', () => {
    expect(BLOCOS).toHaveLength(7)
    expect(BLOCOS.map((b) => b.inicio)).toEqual([
      '08:00', '10:00', '12:00', '13:00', '15:00', '17:00', '18:50',
    ])
  })
})
