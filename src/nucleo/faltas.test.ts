import { describe, expect, it } from 'vitest'
import {
  chaveDeIdentidade,
  nomeDoArquivoDeFaltas,
  paraCsvDeFaltas,
  periodosDoBloco,
  planilhaDeFaltas,
  presencasDoDia,
} from './faltas.ts'
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

  // `presencasDoDia` é a mesma regra de `planilhaDeFaltas`, extraída pra
  // consulta pontual — usada por `TelaAula` pra decidir Presente/Não
  // presente sem montar a planilha do semestre inteiro.
  describe('presencasDoDia', () => {
    it('crachá lido conta como presente', () => {
      const eventos = [abrir('2026-08-17', '08:00'), presenca('2026-08-17', '08:05', ana)]
      const mapa = presencasDoDia(eventos, TURMA, '2026-08-17')
      expect(mapa.get(chaveDeIdentidade(ana))?.presente).toBe(true)
    })

    it('quem não tem evento nenhum não aparece no mapa — não é "presente: false", é ausência de dado', () => {
      const eventos = [abrir('2026-08-17', '08:00')]
      const mapa = presencasDoDia(eventos, TURMA, '2026-08-17')
      expect(mapa.has(chaveDeIdentidade(breno))).toBe(false)
    })

    it('marcação manual funciona mesmo sem crachá nenhum — por matrícula, sem uidHash de verdade', () => {
      const manual: Evento = {
        eventoId: 'web-a1-20260817-0009',
        quando: '2026-08-17T12:00:00.000Z',
        turma: TURMA,
        matricula: breno.matricula,
        nome: breno.nome,
        origem: 'manual',
        resultado: 'ok',
        uidHash: 'manual-x',
      }
      const mapa = presencasDoDia([abrir('2026-08-17', '08:00'), manual], TURMA, '2026-08-17')
      const entrada = mapa.get(chaveDeIdentidade(breno))
      expect(entrada?.presente).toBe(true)
      expect(entrada?.manual).toBe(true)
    })

    it('remoção manual derruba um crachá lido — mesma regra de "quem manda é o professor"', () => {
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
      const eventos = [abrir('2026-08-17', '08:00'), remocao, presenca('2026-08-17', '08:05', ana)]
      const mapa = presencasDoDia(eventos, TURMA, '2026-08-17')
      expect(mapa.get(chaveDeIdentidade(ana))?.presente).toBe(false)
    })

    it('só olha o dia e a turma pedidos — outro dia ou outra turma não contam', () => {
      const eventos = [
        abrir('2026-08-17', '08:00'),
        presenca('2026-08-17', '08:05', ana),
        abrir('2026-08-18', '08:00'),
        { ...presenca('2026-08-19', '08:05', breno), turma: 'Outra turma' },
      ]
      const mapa = presencasDoDia(eventos, TURMA, '2026-08-18')
      expect(mapa.size).toBe(0)
    })
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
    // Formato brasileiro na saída — a chave interna (dias, o Map) continua
    // AAAA-MM-DD, que é o que ordena certo em texto; só a coluna muda.
    expect(linhas[0]).toBe('nome;17/08/2026;18/08/2026')
    expect(linhas[1]).toBe('ANA PAULA MENDES;0;2')
  })
})

describe('nomeDoArquivoDeFaltas', () => {
  it('prefixa faltas- e reaproveita o nome seguro de turma', () => {
    expect(nomeDoArquivoDeFaltas('IF685 · T01')).toBe('faltas-IF685-T01.csv')
  })
})

// Regressão de desempenho — ver `docs/05_plano_execucao.md`, Fase 4, item D.
// A versão anterior (duplo `.filter()` refeito por célula) chegava a 1,3s
// nesta mesma carga; a indexação prévia mede ~2ms. O limiar aqui é 200x
// folgado de propósito: o teste existe pra pegar uma regressão que reintroduz
// o loop O(alunos × dias × eventos), não pra travar por uma máquina lenta de
// CI cronometrando alguns milissegundos a mais.
describe('planilhaDeFaltas — desempenho não regride em silêncio', () => {
  it('turma de 80 alunos, 30 aulas, sob 200ms', () => {
    const TURMA = 'Turma de escala'
    const alunos: Matriculado[] = Array.from({ length: 80 }, (_, i) => ({
      turma: TURMA,
      chave: String(i),
      matricula: String(20260000001 + i),
      nome: `Aluno ${i + 1}`,
      nomeCompleto: `ALUNO ${i + 1} DA SILVA`,
      papel: 'aluno' as const,
    }))
    const eventos: Evento[] = []
    let seq = 0
    const inicio = new Date('2026-03-02T14:00:00')
    for (let d = 0; d < 30; d++) {
      const abrir = new Date(inicio.getTime() + d * 3 * 24 * 3600_000)
      eventos.push({
        eventoId: `ev-${seq++}`,
        quando: abrir.toISOString(),
        turma: TURMA,
        uidHash: 'professor',
        origem: 'professor',
        resultado: 'ok',
        nome: 'Professor',
      })
      for (const aluno of alunos) {
        eventos.push({
          eventoId: `ev-${seq++}`,
          quando: new Date(abrir.getTime() + 2 * 60_000).toISOString(),
          turma: TURMA,
          uidHash: `uid-${aluno.matricula}`,
          origem: 'cracha',
          resultado: 'ok',
          nome: aluno.nome,
          matricula: aluno.matricula,
        })
      }
    }

    const inicioMedicao = performance.now()
    const planilha = planilhaDeFaltas(eventos, alunos, [], TURMA)
    const duracao = performance.now() - inicioMedicao

    expect(planilha.linhas).toHaveLength(80)
    expect(planilha.dias).toHaveLength(30)
    expect(duracao).toBeLessThan(200)
  })
})
