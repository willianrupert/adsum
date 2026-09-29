import { describe, expect, it } from 'vitest'
import { resumoDaFolha } from './folha.ts'
import { comoDia, type Conciliada, type LeituraPlanilha, type Relatorio } from './tipos.ts'
import type { Matriculado } from '../tipos.ts'

const TURMA = 'CIN0144 · T01'
const TER = comoDia('2026-10-13')!
const QUI = comoDia('2026-10-15')!
const aluno = (matricula: string, nome: string): Matriculado => ({ turma: TURMA, chave: matricula, matricula, nome, nomeCompleto: nome.toUpperCase(), papel: 'aluno' })
const MATRICULADOS = [aluno('1', 'Ana Clara'), aluno('2', 'Breno Lima'), aluno('3', 'Caio Dias')]

const leitura = (linhas: number): LeituraPlanilha => ({
  id: 'l', versaoSigaa: '4', cabecalhoTurma: 'CIN0144 - X - Turma: 01 (2026.2)',
  colunas: [{ indice: 0, dia: TER, maximo: 2 }, { indice: 1, dia: QUI, maximo: 2 }],
  linhas: Array.from({ length: linhas }, (_, i) => ({ indice: i, matricula: String(i + 1), celulas: [{ tipo: 'vazia' as const }, { tipo: 'vazia' as const }] })),
})
const pos = (linha: number, dia = TER) => ({ linha, coluna: dia === TER ? 0 : 1, matricula: String(linha + 1), dia })
const relatorio = (celulas: Conciliada[], extra: Partial<Relatorio> = {}): Relatorio => ({
  turma: TURMA, celulas, semParSigaa: [], semParAdsum: [], semOndeLancar: [], semMaximo: [], vaziasEmAulaLancada: [], remanejadas: [], aulasSemChamada: [], ...extra,
})

describe('o resumo da folha', () => {
  it('há o que lançar: o título conta as aulas, e cada aula conta presentes e faltas', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([
        { ...pos(0), categoria: 'aLancar', esperado: 0 },
        { ...pos(1), categoria: 'aLancar', esperado: 2 },
        { ...pos(2), categoria: 'aLancar', esperado: 0 },
        { ...pos(0, QUI), categoria: 'confere', valor: 0, ajustada: false },
      ]),
      leitura: leitura(3),
      matriculados: MATRICULADOS,
      desmarcadas: [],
    })
    expect(r.estado).toBe('lancar')
    expect(r.titulo).toBe('1 aula para lançar')
    expect(r.apoio).toBe('CIN0144 · T01. Planilha lida agora, 3 alunos, todos pela matrícula.')
    expect(r.aulas).toEqual([
      { dia: TER, rotulo: 'Ter, 13/10', presentes: 2, faltas: 1, ausentes: [{ matricula: '2', nome: 'Breno Lima', faltas: 2 }], marcada: true },
    ])
    expect(r.botao).toBe('Preencher 1 aula')
  })

  it('desmarcar tira a aula do botão, e sem nada marcado o botão diz isso', () => {
    const base = { relatorio: relatorio([{ ...pos(0), categoria: 'aLancar', esperado: 0 }, { ...pos(0, QUI), categoria: 'aLancar', esperado: 2 }]), leitura: leitura(1), matriculados: MATRICULADOS }
    expect(resumoDaFolha({ ...base, desmarcadas: [TER] }).botao).toBe('Preencher 1 aula')
    expect(resumoDaFolha({ ...base, desmarcadas: [TER] }).aulas.map((a) => a.marcada)).toEqual([false, true])
    expect(resumoDaFolha({ ...base, desmarcadas: [TER, QUI] }).botao).toBe('Nada marcado')
    expect(resumoDaFolha({ ...base, desmarcadas: [] }).titulo).toBe('2 aulas para lançar')
  })

  it('as diferenças vêm com nome, dia e os dois valores', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([{ ...pos(1), categoria: 'diverge', sigaa: 2, esperado: 0 }]),
      leitura: leitura(3), matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.estado).toBe('lancar')
    expect(r.titulo).toBe('1 diferença para olhar')
    expect(r.diferencas).toEqual([{ matricula: '2', nome: 'Breno Lima', dia: TER, rotulo: 'Ter, 13/10', sigaa: 2, esperado: 0 }])
    expect(r.botao).toBeUndefined()
  })

  it('tudo confere: diz em quantas aulas, e o que o professor aceitou aparece como fato', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([
        { ...pos(0), categoria: 'confere', valor: 0, ajustada: false },
        { ...pos(1), categoria: 'confere', valor: 2, ajustada: true },
        { ...pos(0, QUI), categoria: 'confere', valor: 0, ajustada: false },
        { ...pos(1, QUI), categoria: 'fora' },
      ]),
      leitura: leitura(2), matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.estado).toBe('tudoConfere')
    expect(r.titulo).toBe('Tudo confere')
    expect(r.apoio).toBe('SIGAA e Adsum iguais em 2 aulas. 1 diferença aceita por você.')
  })

  it('suspensa, bloqueado e fora do período entram na linha do que fica de fora', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([{ ...pos(0), categoria: 'aLancar', esperado: 0 }], {
        semOndeLancar: [{ dia: comoDia('2026-10-06')!, motivo: 'suspensa', presentes: 0, faltas: 0 }, { dia: comoDia('2026-12-15')!, motivo: 'foraDoPeriodo', presentes: 0, faltas: 0 }],
      }),
      leitura: { ...leitura(1), linhas: [...leitura(1).linhas, { indice: 1, matricula: '2', celulas: [{ tipo: 'bloqueada', motivo: 'bloqueado' }, { tipo: 'vazia' }] }] },
      matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.informativos).toBe('1 bloqueado, a aula suspensa de 06/10 e a chamada de 15/12, fora do período letivo, ficam de fora.')
  })

  it('vazias em aulas já lançadas ficam como estão, e a linha diz quantas', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([{ ...pos(0), categoria: 'aLancar', esperado: 0 }], {
        vaziasEmAulaLancada: [{ dia: TER, quantas: 15 }, { dia: QUI, quantas: 15 }],
      }),
      leitura: leitura(1), matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.informativos).toBe('30 vazias em aulas já lançadas ficam de fora.')
  })

  it('dia com mais aulas que o comum avisa quanto a falta vale', () => {
    const colunas = [
      { indice: 0, dia: TER, maximo: 2 },
      { indice: 1, dia: QUI, maximo: 12 },
    ]
    const r = resumoDaFolha({
      relatorio: relatorio([
        { ...pos(0), categoria: 'aLancar', esperado: 2 },
        { ...pos(0, QUI), categoria: 'aLancar', esperado: 12 },
      ]),
      leitura: { ...leitura(1), colunas },
      matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.aulas.map((a) => a.aviso)).toEqual([undefined, 'Dia de 12 aulas: quem faltou leva 12 faltas.'])
  })

  it('o que fica de fora cabe numa linha, sem travessão', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([{ ...pos(0), categoria: 'aLancar', esperado: 0 }], {
        semParSigaa: ['99'],
        semParAdsum: ['3'],
        semOndeLancar: [{ dia: comoDia('2026-10-12')!, motivo: 'feriado', presentes: 0, faltas: 0 }, { dia: comoDia('2026-10-20')!, motivo: 'semColuna', presentes: 0, faltas: 0 }],
        semMaximo: [QUI],
      }),
      leitura: { ...leitura(2), linhas: [...leitura(1).linhas, { indice: 1, matricula: '99', celulas: [{ tipo: 'bloqueada', motivo: 'trancado' }, { tipo: 'bloqueada', motivo: 'trancado' }] }] },
      matriculados: MATRICULADOS, desmarcadas: [],
    })
    expect(r.apoio).toBe('CIN0144 · T01. Planilha lida agora, 2 alunos, 1 pela matrícula.')
    expect(r.informativos).toBe(
      '1 trancado, 1 matrícula que não está na turma, 1 aluno do Adsum que não está na planilha, o feriado de 12/10, a chamada de 20/10 que não está na planilha e o dia 15/10 sem máximo na planilha ficam de fora.',
    )
    expect(r.informativos).not.toMatch(/—/)
  })
})

describe('a chamada sem lugar no SIGAA', () => {
  const SAB = comoDia('2026-10-17')!
  const SEG = comoDia('2026-10-05')!
  const semLugar = (motivo: 'semColuna' | 'cancelada' = 'semColuna') =>
    relatorio([], { semOndeLancar: [{ dia: SAB, motivo, presentes: 2, faltas: 1 }], aulasSemChamada: [SEG, TER, QUI] })

  it('vira pergunta, com as aulas possíveis, da mais perto para a mais longe', () => {
    const r = resumoDaFolha({ relatorio: semLugar(), leitura: leitura(3), matriculados: MATRICULADOS, desmarcadas: [] })
    expect(r.estado).toBe('lancar')
    expect(r.titulo).toBe('1 chamada sem lugar no SIGAA')
    expect(r.semLugar).toEqual([
      {
        dia: SAB,
        rotulo: 'Sáb, 17/10',
        presentes: 2,
        faltas: 1,
        explicacao: 'O SIGAA não tem aula neste dia. Em qual aula ela entra?',
        opcoes: [
          { dia: QUI, rotulo: 'Qui, 15/10' },
          { dia: TER, rotulo: 'Ter, 13/10' },
          { dia: SEG, rotulo: 'Seg, 05/10' },
        ],
      },
    ])
    // Quem virou pergunta não se repete na linha do que fica de fora.
    expect(r.informativos).toBeUndefined()
  })

  it('a aula cancelada no SIGAA diz isso', () => {
    const r = resumoDaFolha({ relatorio: semLugar('cancelada'), leitura: leitura(3), matriculados: MATRICULADOS, desmarcadas: [] })
    expect(r.semLugar[0].explicacao).toBe('O SIGAA tem esta aula como cancelada. Em qual aula ela entra?')
  })

  it('sem aula possível, fica na linha do que fica de fora, como antes', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([], { semOndeLancar: [{ dia: SAB, motivo: 'semColuna', presentes: 2, faltas: 1 }] }),
      leitura: leitura(3),
      matriculados: MATRICULADOS,
      desmarcadas: [],
    })
    expect(r.semLugar).toEqual([])
    expect(r.informativos).toBe('a chamada de 17/10 que não está na planilha fica de fora.')
  })

  it('a aula que recebeu a chamada de outro dia diz de onde ela veio', () => {
    const r = resumoDaFolha({
      relatorio: relatorio([{ ...pos(0), categoria: 'aLancar', esperado: 0 }], { remanejadas: [{ de: SAB, para: TER }] }),
      leitura: leitura(1),
      matriculados: MATRICULADOS,
      desmarcadas: [],
    })
    expect(r.aulas[0].de).toEqual({ dia: SAB, rotulo: 'Sáb, 17/10' })
  })
})
