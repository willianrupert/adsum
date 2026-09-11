import { describe, expect, it } from 'vitest'
import { nomeDoArquivoDeFaltas, paraCsvDeFaltas, periodosDoBloco, planilhaDeFaltas } from './faltas.ts'
import type { Aula } from './grade.ts'
import type { Evento, Matriculado } from './tipos.ts'

describe('periodosDoBloco', () => {
  it('conta um período por aula de 50 min', () => {
    expect(periodosDoBloco('12:00', '12:50')).toBe(1)
  })

  it('conta dois períodos num bloco de duas aulas seguidas', () => {
    expect(periodosDoBloco('08:00', '09:50')).toBe(2)
  })

  it('nunca devolve zero, mesmo com bloco quase vazio', () => {
    expect(periodosDoBloco('08:00', '08:05')).toBe(1)
  })
})

describe('planilhaDeFaltas', () => {
  const TURMA = 'IF685 · T01'
  const ana: Matriculado = {
    turma: TURMA,
    chave: '1',
    matricula: '1',
    nome: 'Ana',
    nomeCompleto: 'ANA PAULA MENDES',
    papel: 'aluno',
  }
  const breno: Matriculado = {
    turma: TURMA,
    chave: '2',
    matricula: '2',
    nome: 'Breno',
    nomeCompleto: 'BRENO OLIVEIRA',
    papel: 'aluno',
  }

  const abrir = (dia: string, hora: string): Evento => ({
    eventoId: `web-a1-${dia.replace(/-/g, '')}-0001`,
    quando: `${dia}T${hora}:00.000Z`,
    turma: TURMA,
    nome: '',
    origem: 'professor',
    resultado: 'ok',
    uidHash: 'prof',
  })

  const presenca = (dia: string, hora: string, aluno: Matriculado): Evento => ({
    eventoId: `web-a1-${dia.replace(/-/g, '')}-0002`,
    quando: `${dia}T${hora}:00.000Z`,
    turma: TURMA,
    matricula: aluno.matricula,
    nome: aluno.nome,
    origem: 'cracha',
    resultado: 'ok',
    uidHash: aluno.chave,
  })

  // Segunda-feira, bloco de 08:00 às 09:50 — duas aulas de 50 min.
  const AULA_DUPLA: Aula = { uidHashProfessor: 'prof', dia: 1, inicio: '08:00', fim: '09:50', turma: TURMA }

  it('quem encosta o crachá fica com zero faltas no dia', () => {
    // 2026-08-17 é uma segunda-feira.
    const eventos = [abrir('2026-08-17', '08:00'), presenca('2026-08-17', '08:05', ana)]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    expect(linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')).toBe(0)
  })

  it('quem falta um bloco de duas aulas leva duas faltas, não uma', () => {
    const eventos = [abrir('2026-08-17', '08:00'), presenca('2026-08-17', '08:05', ana)]
    const { linhas } = planilhaDeFaltas(eventos, [ana, breno], [AULA_DUPLA], TURMA)
    expect(linhas.find((l) => l.matriculado === breno)?.porDia.get('2026-08-17')).toBe(2)
  })

  // O padrão pedido pelo autor: duas faltas só quando a grade confirma o
  // bloco duplo. Sem bloco cadastrado para aquele dia da semana — reposição,
  // aula extra —, uma falta por aula é o piso, não um palpite de dois.
  it('sem bloco na grade para aquele dia, a falta vale um período', () => {
    // 2026-08-18 é terça — a grade só tem bloco cadastrado para segunda.
    const eventos = [abrir('2026-08-18', '10:00')]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    expect(linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-18')).toBe(1)
  })

  it('só conta dia com evento de professor — não todo dia do calendário', () => {
    const eventos = [presenca('2026-08-17', '08:05', ana)]
    const { dias } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    expect(dias).toEqual([])
  })
})

describe('paraCsvDeFaltas', () => {
  it('nome completo, um dia por coluna, número de faltas na célula', () => {
    const aluno: Matriculado = {
      turma: 'IF685 · T01',
      chave: '1',
      matricula: '1',
      nome: 'Ana',
      nomeCompleto: 'ANA PAULA MENDES',
      papel: 'aluno',
    }
    const csv = paraCsvDeFaltas({
      dias: ['2026-08-17', '2026-08-18'],
      linhas: [{ matriculado: aluno, porDia: new Map([['2026-08-17', 0], ['2026-08-18', 2]]) }],
    })
    const linhas = csv.replace(/^﻿/, '').split('\n')
    expect(linhas[0]).toBe('nome;2026-08-17;2026-08-18')
    expect(linhas[1]).toBe('ANA PAULA MENDES;0;2')
  })
})

describe('nomeDoArquivoDeFaltas', () => {
  it('prefixa faltas- e reaproveita o nome seguro de turma', () => {
    expect(nomeDoArquivoDeFaltas('IF685 · T01')).toBe('faltas-IF685-T01.csv')
  })
})
