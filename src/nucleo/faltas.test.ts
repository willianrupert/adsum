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
    expect(linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')?.faltas).toBe(0)
  })

  it('quem falta um bloco de duas aulas leva duas faltas, não uma', () => {
    const eventos = [abrir('2026-08-17', '08:00'), presenca('2026-08-17', '08:05', ana)]
    const { linhas } = planilhaDeFaltas(eventos, [ana, breno], [AULA_DUPLA], TURMA)
    expect(linhas.find((l) => l.matriculado === breno)?.porDia.get('2026-08-17')?.faltas).toBe(2)
  })

  // O padrão pedido pelo autor: duas faltas só quando a grade confirma o
  // bloco duplo. Sem bloco cadastrado para aquele dia da semana — reposição,
  // aula extra —, uma falta por aula é o piso, não um palpite de dois.
  it('sem bloco na grade para aquele dia, a falta vale um período', () => {
    // 2026-08-18 é terça — a grade só tem bloco cadastrado para segunda.
    const eventos = [abrir('2026-08-18', '10:00')]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    expect(linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-18')?.faltas).toBe(1)
  })

  it('só conta dia com evento de professor — não todo dia do calendário', () => {
    const eventos = [presenca('2026-08-17', '08:05', ana)]
    const { dias } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    expect(dias).toEqual([])
  })

  it('leitura repetida no mesmo dia continua zero faltas, marcada como repetida', () => {
    const eventos = [
      abrir('2026-08-17', '08:00'),
      presenca('2026-08-17', '08:05', ana),
      { ...presenca('2026-08-17', '08:06', ana), eventoId: 'web-a1-20260817-0003', resultado: 'duplicado' as const },
    ]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    const celula = linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')
    expect(celula?.faltas).toBe(0)
    expect(celula?.repetido).toBe(true)
  })

  // A correção humana pesa igual a um crachá — mas fica marcada, porque quem
  // audita a planilha depois precisa saber que não foi um toque de verdade.
  it('presença marcada à mão (origem manual) zera a falta e fica identificável', () => {
    const manual: Evento = {
      eventoId: 'web-a1-20260817-0009',
      quando: '2026-08-17T12:00:00.000Z',
      turma: TURMA,
      matricula: ana.matricula,
      nome: ana.nome,
      origem: 'manual',
      resultado: 'ok',
      uidHash: 'manual-x',
    }
    const eventos = [abrir('2026-08-17', '08:00'), manual]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    const celula = linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')
    expect(celula?.faltas).toBe(0)
    expect(celula?.manual).toBe(true)
  })

  // Quem manda é o professor, não o crachá: uma presença marcada por engano
  // — crachá lido para a pessoa errada, confirmação precipitada — precisa
  // sair da planilha sem reescrever o log. O evento do crachá continua lá,
  // só deixa de contar.
  it('presença removida à mão (resultado removido) volta a contar como falta', () => {
    const remocao: Evento = {
      eventoId: 'web-a1-20260817-0009',
      quando: '2026-08-17T12:00:00.000Z',
      turma: TURMA,
      matricula: ana.matricula,
      nome: ana.nome,
      origem: 'manual',
      resultado: 'removido',
      uidHash: 'manual-x',
    }
    // A remoção vem primeiro no array — `eventos` chega mais recente
    // primeiro de verdade (`Repositorio.listarEventos`), e a leitura do
    // crachá é sempre mais cedo no dia do que a correção feita depois.
    const eventos = [abrir('2026-08-17', '08:00'), remocao, presenca('2026-08-17', '08:05', ana)]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    const celula = linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')
    expect(celula?.faltas).toBe(2)
    expect(celula?.manual).toBe(true)
  })

  // Depois de remover, marcar presença de novo tem que vencer — é o mesmo
  // evento manual mais recente que decide, não "alguma vez existiu remoção".
  it('marcar presença de novo depois de remover volta a zerar a falta', () => {
    const remocao: Evento = {
      eventoId: 'web-a1-20260817-0009',
      quando: '2026-08-17T12:00:00.000Z',
      turma: TURMA,
      matricula: ana.matricula,
      nome: ana.nome,
      origem: 'manual',
      resultado: 'removido',
      uidHash: 'manual-x',
    }
    const reconfirmacao: Evento = { ...remocao, eventoId: 'web-a1-20260817-0010', resultado: 'ok' }
    // A reconfirmação é a ação mais recente, então vem primeiro no array.
    const eventos = [abrir('2026-08-17', '08:00'), reconfirmacao, remocao]
    const { linhas } = planilhaDeFaltas(eventos, [ana], [AULA_DUPLA], TURMA)
    const celula = linhas.find((l) => l.matriculado === ana)?.porDia.get('2026-08-17')
    expect(celula?.faltas).toBe(0)
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
      linhas: [
        {
          matriculado: aluno,
          porDia: new Map([
            ['2026-08-17', { faltas: 0, repetido: false, manual: false }],
            ['2026-08-18', { faltas: 2, repetido: false, manual: false }],
          ]),
        },
      ],
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
