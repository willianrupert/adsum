import { describe, expect, it } from 'vitest'
import {
  BLOCOS,
  DIAS_UTEIS,
  chaveDoBloco,
  ehCurto,
  horasPorSemana,
  marcadosDe,
  saudacao,
} from './horarios.ts'

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
      { dia: 0, inicio: '08:00' },
    ])
    expect(marcados.size).toBe(1)
    expect(foraDosBlocos).toBe(2)
  })

  // O par dia+hora precisa existir, e não só a hora: 07:00 é bloco de sábado, e
  // 08:00 não é. Trocar os dois marcaria célula que a tela não desenha.
  it('não marca bloco de sábado em dia útil, nem o contrário', () => {
    expect(marcadosDe([{ dia: 3, inicio: '07:00' }]).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 6, inicio: '08:00' }]).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 6, inicio: '07:00' }]).marcados.size).toBe(1)
  })

  it('soma as horas da semana', () => {
    expect(horasPorSemana(new Set([chaveDoBloco(3, '13:00')]))).toBeCloseTo(1.833, 2)
    expect(
      horasPorSemana(new Set([chaveDoBloco(3, '13:00'), chaveDoBloco(3, '15:00')])),
    ).toBeCloseTo(3.667, 2)
  })

  it('os blocos cobrem manhã, tarde, noite e sábado', () => {
    expect(new Set(BLOCOS.map((b) => b.turno))).toEqual(
      new Set(['manha', 'tarde', 'noite', 'sabado']),
    )
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

  it('os blocos de dia útil, na ordem', () => {
    expect(BLOCOS.filter((b) => !b.soSabado).map((b) => b.inicio)).toEqual([
      '08:00', '10:00', '12:00', '13:00', '15:00', '17:00', '18:50',
    ])
  })

  // Eu tinha escrito que sábado "existe na universidade e não na grade de
  // ninguém". A grade real tem sáb. 07:00-11:50 e sáb. 13:00-17:50.
  it('sábado tem blocos próprios, e eles não aparecem em dia útil', () => {
    const sabado = BLOCOS.filter((b) => b.soSabado)
    expect(sabado.map((b) => `${b.inicio}-${b.fim}`)).toEqual(['07:00-11:50', '13:00-17:50'])
    expect(DIAS_UTEIS).toContain(6)
  })

  it('cumprimenta pela hora', () => {
    const emHora = (h: number) => new Date(2026, 0, 1, h, 0)
    expect(saudacao(emHora(6))).toBe('Bom dia')
    expect(saudacao(emHora(11))).toBe('Bom dia')
    expect(saudacao(emHora(12))).toBe('Boa tarde')
    expect(saudacao(emHora(17))).toBe('Boa tarde')
    expect(saudacao(emHora(18))).toBe('Boa noite')
    expect(saudacao(emHora(2))).toBe('Boa noite')
  })
})
