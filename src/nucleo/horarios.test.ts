import { describe, expect, it } from 'vitest'
import {
  BLOCOS,
  BLOCOS_COMPLETOS,
  DIAS_UTEIS,
  chaveDoBloco,
  ehCurto,
  horasPorSemana,
  marcadosDe,
  saudacao,
} from './horarios.ts'

describe('a grade como o professor a enxerga', () => {
  it('marca o que já está cadastrado', () => {
    const { marcados } = marcadosDe(
      [
        { dia: 3, inicio: '13:00' },
        { dia: 1, inicio: '15:00' },
      ],
      BLOCOS,
    )
    expect(marcados).toEqual(new Set([chaveDoBloco(3, '13:00'), chaveDoBloco(1, '15:00')]))
  })

  // A tela não pode fingir que a aula não existe: ela continua abrindo a
  // chamada, e quem salvar por cima sem saber a perde.
  it('conta as aulas que não cabem em bloco nenhum', () => {
    const { marcados, foraDosBlocos } = marcadosDe(
      [
        { dia: 3, inicio: '13:00' },
        { dia: 3, inicio: '07:30' },
        { dia: 0, inicio: '08:00' },
      ],
      BLOCOS,
    )
    expect(marcados.size).toBe(1)
    expect(foraDosBlocos).toBe(2)
  })

  // O par dia+hora precisa existir, e não só a hora: 07:00 é período de
  // sábado na grade completa, e não existe na simplificada em dia nenhum.
  it('não marca período de sábado fora da grade completa', () => {
    expect(marcadosDe([{ dia: 6, inicio: '07:00' }], BLOCOS).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 6, inicio: '07:00' }], BLOCOS_COMPLETOS).marcados.size).toBe(1)
  })

  it('não marca período de sábado em dia útil que não tem esse período, nem o contrário', () => {
    expect(marcadosDe([{ dia: 3, inicio: '07:00' }], BLOCOS_COMPLETOS).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 6, inicio: '12:00' }], BLOCOS_COMPLETOS).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 6, inicio: '08:00' }], BLOCOS_COMPLETOS).marcados.size).toBe(1)
  })

  it('uma aula que só existe na grade completa aparece como fora dos blocos na simplificada', () => {
    // 09:00-09:50 é metade do bloco simplificado 08:00-09:50: só a grade
    // completa tem um quadradinho pra ela.
    expect(marcadosDe([{ dia: 2, inicio: '09:00' }], BLOCOS).foraDosBlocos).toBe(1)
    expect(marcadosDe([{ dia: 2, inicio: '09:00' }], BLOCOS_COMPLETOS).marcados.size).toBe(1)
  })

  it('soma as horas da semana', () => {
    expect(horasPorSemana(new Set([chaveDoBloco(3, '13:00')]), BLOCOS)).toBeCloseTo(1.833, 2)
    expect(
      horasPorSemana(new Set([chaveDoBloco(3, '13:00'), chaveDoBloco(3, '15:00')]), BLOCOS),
    ).toBeCloseTo(3.667, 2)
  })

  it('os blocos da simplificada cobrem manhã, tarde e noite, sem sábado', () => {
    expect(new Set(BLOCOS.map((b) => b.turno))).toEqual(new Set(['manha', 'tarde', 'noite']))
    expect(BLOCOS.every((b) => !b.dias.includes(6))).toBe(true)
  })
})

// Lidos das grades de horário reais do CIn que o autor mandou, e é por isso que
// estão aqui: dois dos meus palpites estavam errados.
describe('os blocos da simplificada são os do CIn, não os que eu supus', () => {
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

  it('os blocos, na ordem, todos de segunda a sexta', () => {
    expect(BLOCOS.map((b) => b.inicio)).toEqual([
      '08:00', '10:00', '12:00', '13:00', '15:00', '17:00', '18:50',
    ])
    expect(BLOCOS.every((b) => b.dias.length === 5)).toBe(true)
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

// Fase 3 (docs/05_plano_execucao.md): a tabela de períodos de 50 min, fatiada
// dos blocos antigos — inclusive os de sábado, que na simplificada tinham
// horário próprio e aqui viram os mesmos períodos de segunda a sexta mais um.
describe('a grade completa (granularidade de 50 min)', () => {
  it('tem os 14 períodos da tabela, na ordem', () => {
    expect(BLOCOS_COMPLETOS.map((b) => `${b.inicio}-${b.fim}`)).toEqual([
      '07:00-07:50',
      '08:00-08:50',
      '09:00-09:50',
      '10:00-10:50',
      '11:00-11:50',
      '12:00-12:50',
      '13:00-13:50',
      '14:00-14:50',
      '15:00-15:50',
      '16:00-16:50',
      '17:00-17:50',
      '18:00-18:50',
      '18:50-19:40',
      '19:40-20:30',
    ])
  })

  it('todo período dura 50 minutos', () => {
    for (const bloco of BLOCOS_COMPLETOS) {
      const [hi, mi] = bloco.inicio.split(':').map(Number)
      const [hf, mf] = bloco.fim.split(':').map(Number)
      expect(hf * 60 + mf - (hi * 60 + mi)).toBe(50)
    }
  })

  it('07:00 só existe aos sábados', () => {
    const seteHoras = BLOCOS_COMPLETOS.find((b) => b.inicio === '07:00')!
    expect(seteHoras.dias).toEqual([6])
  })

  it('08:00 a 11:50 e 13:00 a 17:50 valem de segunda a sábado', () => {
    for (const inicio of ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']) {
      const bloco = BLOCOS_COMPLETOS.find((b) => b.inicio === inicio)!
      expect(bloco.dias).toEqual(DIAS_UTEIS)
    }
  })

  it('meio-dia e a noite depois das 18:00 não existem aos sábados', () => {
    for (const inicio of ['12:00', '18:00', '18:50', '19:40']) {
      const bloco = BLOCOS_COMPLETOS.find((b) => b.inicio === inicio)!
      expect(bloco.dias).not.toContain(6)
      expect(bloco.dias).toEqual([1, 2, 3, 4, 5])
    }
  })
})

describe('sábado tem período próprio, e não aparece em dia útil nenhum', () => {
  it('os blocos de sábado, na grade completa, fecham nos mesmos horários da simplificada', () => {
    const doSabado = BLOCOS_COMPLETOS.filter((b) => b.dias.includes(6)).map((b) => b.inicio)
    expect(doSabado[0]).toBe('07:00')
    expect(doSabado.at(-1)).toBe('17:00')
  })

  it('DIAS_UTEIS não tem domingo', () => {
    expect(DIAS_UTEIS).not.toContain(0)
    expect(DIAS_UTEIS).toContain(6)
  })
})
