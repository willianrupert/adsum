import { describe, expect, it } from 'vitest'
import { FOLGA_MIN, aulasAgora, emMinutos, escolherTurma, horaValida } from './grade.ts'

const PROF = 'aaaa000000000000'
const OUTRO = 'bbbb000000000000'

// 19/08/2026 é uma quarta-feira (dia 3).
const quarta = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`)

const aula = (turma: string, dia: number, inicio: string, fim: string, prof = PROF) => ({
  uidHashProfessor: prof,
  dia,
  inicio,
  fim,
  turma,
})

const GRADE = [
  aula('IF685 · T01', 3, '08:00', '10:00'),
  aula('IF669 · T02', 3, '10:00', '12:00'),
  aula('IF700 · T03', 5, '08:00', '10:00'),
  aula('IF999 · T09', 3, '08:00', '10:00', OUTRO),
]

describe('horários', () => {
  it('valida e mede', () => {
    expect(horaValida('08:00')).toBe(true)
    expect(horaValida('24:00')).toBe(false)
    expect(emMinutos('08:30')).toBe(510)
  })
})

describe('aulas acontecendo agora', () => {
  it('acha a do horário', () => {
    expect(aulasAgora(GRADE, PROF, quarta('09:00')).map((a) => a.turma)).toEqual(['IF685 · T01'])
  })

  // O professor chega antes e sai depois; abrir às 7h52 é o caso normal.
  it('aceita a folga antes e depois', () => {
    expect(aulasAgora(GRADE, PROF, quarta('07:45')).map((a) => a.turma)).toEqual(['IF685 · T01'])
    expect(FOLGA_MIN).toBe(20)
  })

  it('não pega aula de outro dia nem de outro professor', () => {
    expect(aulasAgora(GRADE, PROF, quarta('15:00'))).toEqual([])
    expect(aulasAgora(GRADE, OUTRO, quarta('09:00')).map((a) => a.turma)).toEqual(['IF999 · T09'])
  })

  it('na virada, as duas aulas contam — é o caso ambíguo de verdade', () => {
    expect(aulasAgora(GRADE, PROF, quarta('10:05'))).toHaveLength(2)
  })
})

describe('que turma abrir', () => {
  const TURMAS = ['IF685 · T01', 'IF669 · T02']

  // Nunca perguntar o que dá para saber.
  it('abre direto quando a grade diz uma só', () => {
    expect(escolherTurma(GRADE, TURMAS, PROF, quarta('09:00'))).toEqual({
      tipo: 'abrir',
      turma: 'IF685 · T01',
    })
  })

  it('pergunta quando duas se sobrepõem', () => {
    const escolha = escolherTurma(GRADE, TURMAS, PROF, quarta('10:05'))
    expect(escolha).toMatchObject({ tipo: 'perguntar', motivo: 'varias' })
  })

  // Feriado, reposição, grade não cadastrada: a pergunta cai sobre todas.
  it('sem aula na grade, pergunta entre as turmas', () => {
    const escolha = escolherTurma(GRADE, TURMAS, PROF, quarta('15:00'))
    expect(escolha).toEqual({ tipo: 'perguntar', opcoes: TURMAS, motivo: 'nenhuma' })
  })

  it('com uma turma só, não pergunta nada nem fora de horário', () => {
    expect(escolherTurma([], ['IF685 · T01'], PROF, quarta('15:00'))).toEqual({
      tipo: 'abrir',
      turma: 'IF685 · T01',
    })
  })

  it('sem turma nenhuma, não há o que abrir', () => {
    expect(escolherTurma([], [], PROF, quarta('09:00'))).toEqual({ tipo: 'sem_turma' })
  })

  // Era a falha silenciosa: com duas turmas e sem grade, o crachá não fazia
  // nada e a tela não dizia por quê.
  it('duas turmas sem grade não deixa o crachá sem resposta', () => {
    expect(escolherTurma([], TURMAS, PROF, quarta('09:00')).tipo).toBe('perguntar')
  })
})
