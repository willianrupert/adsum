import { describe, expect, it } from 'vitest'
import {
  depoisDeGravar,
  ehDaPessoa,
  estadoDaChamada,
  indiceDeVinculos,
  MemoriaDaFila,
  recadoAntesDeGravar,
} from './chamada.ts'
import { INTERVALO_MINIMO_MS, type Sessao } from './sessao.ts'
import type { Evento, Matriculado, Vinculo } from './tipos.ts'

const TURMA = 'IF685 · T01'
const DIA = '2026-09-24'
const SESSAO: Sessao = { turma: TURMA, abertaEm: '2026-09-24T13:00:00.000Z', uidHashProfessor: 'prof' }

const vinculo = (uidHash: string, extra: Partial<Vinculo> = {}): Vinculo => ({
  uidHash,
  papel: 'aluno',
  nome: `Pessoa ${uidHash}`,
  matricula: `2025${uidHash}`,
  criadoEm: '2026-09-01T12:00:00.000Z',
  ...extra,
})
const PROFESSOR = vinculo('prof', { papel: 'professor', nome: 'Ana Paula', matricula: undefined })

let seq = 0
const evento = (extra: Partial<Evento>): Evento => ({
  eventoId: `x-20260924-${String(++seq).padStart(4, '0')}`,
  quando: '2026-09-24T14:00:00.000Z',
  turma: TURMA,
  uidHash: 'a',
  nome: 'Pessoa a',
  matricula: '2025a',
  origem: 'cracha',
  resultado: 'ok',
  ...extra,
})

describe('ehDaPessoa', () => {
  it('pela matrícula quando a pessoa tem, pelo nome quando não tem', () => {
    const aluno = { matricula: '2025a', nome: 'Pessoa a' }
    expect(ehDaPessoa({ matricula: '2025a', nome: 'Outro nome' }, aluno)).toBe(true)
    expect(ehDaPessoa({ matricula: '2025b', nome: 'Pessoa a' }, aluno)).toBe(false)
    const docente = { matricula: '', nome: 'Ana Paula' }
    expect(ehDaPessoa({ nome: 'Ana Paula' }, docente)).toBe(true)
    expect(ehDaPessoa({ nome: 'Ana Maria' }, docente)).toBe(false)
  })
})

describe('estadoDaChamada', () => {
  // `listarEventos` entrega mais recente primeiro; os testes montam igual.
  it('o dia inteiro conta, e outra turma ou outro dia não', () => {
    const eventos = [
      evento({ uidHash: 'b', nome: 'Pessoa b', matricula: '2025b', quando: '2026-09-24T20:00:00.000Z' }),
      evento({ uidHash: 'a', quando: '2026-09-24T12:00:00.000Z' }),
      evento({ uidHash: 'c', turma: 'Outra', matricula: '2025c' }),
      evento({ uidHash: 'd', matricula: '2025d', quando: '2026-09-22T14:00:00.000Z' }),
    ]
    const estado = estadoDaChamada(eventos, [vinculo('a'), vinculo('b')], TURMA, DIA)
    expect([...estado.porCracha].sort()).toEqual(['a', 'b'])
    expect(estado.presentes.size).toBe(2)
  })

  it('crachá do professor não conta, nem no contador nem no "repetido"', () => {
    const eventos = [evento({ uidHash: 'prof', nome: 'Ana Paula', matricula: undefined })]
    const estado = estadoDaChamada(eventos, [PROFESSOR], TURMA, DIA)
    expect(estado.porCracha.size).toBe(0)
    expect(estado.presentes.size).toBe(0)
  })

  it('presença à mão soma no contador, mas não entra no "repetido" do crachá', () => {
    const eventos = [evento({ uidHash: 'sorteado', origem: 'manual', matricula: '2025z', nome: 'Pessoa z' })]
    const estado = estadoDaChamada(eventos, [], TURMA, DIA)
    expect(estado.presentes.size).toBe(1)
    expect(estado.porCracha.size).toBe(0)
  })

  it('"Não presente" gravado depois do crachá desconta', () => {
    // A ordem vem do número do evento, não do `quando` (23/09/2026): o
    // crachá é gravado primeiro, a remoção depois.
    const cracha = evento({ uidHash: 'a' })
    const remocao = evento({ uidHash: 'sorteado', origem: 'manual', resultado: 'removido' })
    const eventos = [remocao, cracha]
    const estado = estadoDaChamada(eventos, [vinculo('a')], TURMA, DIA)
    expect(estado.presentes.size).toBe(0)
    expect(estado.presencasHoje.get('m:2025a')?.presente).toBe(false)
  })

  it('as linhas: seis no máximo, com nome e tom de cada caso', () => {
    const eventos = [
      evento({ resultado: 'rapido_demais', nome: '' }),
      evento({ resultado: 'desconhecido', nome: '' }),
      evento({ resultado: 'duplicado' }),
      evento({ origem: 'manual', resultado: 'removido' }),
      evento({ origem: 'manual', resultado: 'ok' }),
      evento({ origem: 'professor', resultado: 'ok' }),
      evento({}),
      evento({}),
    ]
    const { linhas } = estadoDaChamada(eventos, [], TURMA, DIA)
    expect(linhas).toHaveLength(6)
    expect(linhas.map((l) => [l.nome, l.tom])).toEqual([
      ['Dois crachás de uma vez', 'desconhecido'],
      ['Crachá não cadastrado', 'desconhecido'],
      ['Pessoa a', 'repetido'],
      ['Pessoa a', 'removido'],
      ['Pessoa a', 'ok'],
      ['Pessoa a', 'ok'],
    ])
  })
})

describe('MemoriaDaFila', () => {
  const em = (ms: number) => new Date(Date.parse('2026-09-24T14:00:00.000Z') + ms)

  it('o mesmo crachá duas vezes, sem render no meio, é "repetido"', () => {
    const fila = new MemoriaDaFila()
    expect(fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) }).tipo).toBe('presenca')
    expect(fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(50) }).tipo).toBe('repetido')
  })

  it('dois crachás quase juntos: o segundo é recusado e não reinicia a janela', () => {
    const fila = new MemoriaDaFila()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    expect(fila.decidir('b', { sessao: SESSAO, vinculo: vinculo('b'), em: em(200) }).tipo).toBe('rapido_demais')
    // Medido do último aceito (0), não da recusa (200).
    expect(fila.decidir('b', { sessao: SESSAO, vinculo: vinculo('b'), em: em(INTERVALO_MINIMO_MS) }).tipo).toBe(
      'presenca',
    )
    expect(fila.intervalos).toEqual([INTERVALO_MINIMO_MS])
  })

  it('crachá do professor não mexe na janela nem vira amostra', () => {
    const fila = new MemoriaDaFila()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    fila.decidir('prof', { sessao: SESSAO, vinculo: PROFESSOR, em: em(100) })
    expect(fila.ultima?.uidHash).toBe('a')
    expect(fila.estatistica()).toBeUndefined()
  })

  it('cadastro de professor não conta presença', () => {
    const fila = new MemoriaDaFila()
    const chamado: Matriculado = {
      turma: TURMA,
      chave: 'ana paula',
      matricula: '',
      nomeCompleto: 'Ana Paula Lima',
      nome: 'Ana Paula',
      papel: 'professor',
    }
    expect(fila.decidir('novo', { sessao: SESSAO, chamado, em: em(0) }).tipo).toBe('cadastro')
    expect(fila.jaPresentes.has('novo')).toBe(false)
  })

  it('recomeçar troca quem já passou, e mantém a janela e os intervalos', () => {
    const fila = new MemoriaDaFila()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    fila.concluir('a')
    fila.recomecar(new Set(['z']))
    expect(fila.jaPresentes.has('a')).toBe(false)
    expect(fila.decidir('z', { sessao: SESSAO, vinculo: vinculo('z'), em: em(1000) }).tipo).toBe('repetido')
    expect(fila.ultima?.uidHash).toBe('z')
  })
})

describe('o que cada decisão diz e toca', () => {
  it('recado antes de gravar só para cedo demais e dois crachás juntos', () => {
    expect(recadoAntesDeGravar({ tipo: 'cedo_demais', faltamMs: 3200 })).toBe(
      'Para encerrar, encoste de novo em 4 s.',
    )
    expect(recadoAntesDeGravar({ tipo: 'rapido_demais', faltamMs: 100 })).toMatch(/^Dois crachás quase juntos/)
    expect(recadoAntesDeGravar({ tipo: 'desconhecido' })).toBeUndefined()
  })

  it('bipe depois de gravar; recusa não limpa o recado', () => {
    expect(depoisDeGravar({ tipo: 'presenca', vinculo: vinculo('a') }, true)).toEqual({ som: 'ok', limpaRecado: true })
    expect(depoisDeGravar({ tipo: 'repetido', vinculo: vinculo('a') }, false)).toEqual({
      som: 'repetido',
      limpaRecado: true,
    })
    expect(depoisDeGravar({ tipo: 'rapido_demais', faltamMs: 1 }, true)).toEqual({
      som: 'desconhecido',
      limpaRecado: false,
    })
    expect(depoisDeGravar({ tipo: 'encerrar' }, true).som).toBe('encerramento')
    expect(depoisDeGravar({ tipo: 'sem_turma' }, false).som).toBeUndefined()
  })
})

describe('MemoriaDaFila e a releitura do log', () => {
  const em = (ms: number) => new Date(Date.parse('2026-09-24T14:00:00.000Z') + ms)

  it('releitura que começou antes da gravação não esquece o crachá', () => {
    const fila = new MemoriaDaFila()
    const marca = fila.marca()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    // O log lido não tem 'a': a leitura começou antes de ele ser gravado.
    fila.recomecar(new Set(), marca)
    expect(fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(900) }).tipo).toBe('repetido')
  })

  it('gravação em andamento sobrevive mesmo a releitura posterior', () => {
    const fila = new MemoriaDaFila()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    fila.recomecar(new Set(), fila.marca())
    expect(fila.jaPresentes.has('a')).toBe(true)
  })

  it('gravação que falhou: a releitura seguinte devolve a verdade do log', () => {
    const fila = new MemoriaDaFila()
    fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(0) })
    fila.concluir('a')
    fila.recomecar(new Set(), fila.marca())
    expect(fila.decidir('a', { sessao: SESSAO, vinculo: vinculo('a'), em: em(900) }).tipo).toBe('presenca')
  })
})

describe('indiceDeVinculos', () => {
  it('acha o mesmo que um find com ehDaPessoa, inclusive o primeiro de dois', () => {
    const vinculos = [
      vinculo('a'),
      vinculo('a2', { matricula: '2025a', nome: 'Pessoa a (segundo sal)' }),
      vinculo('b'),
      PROFESSOR,
      vinculo('sem', { matricula: undefined, nome: 'Pessoa b' }),
    ]
    const achar = indiceDeVinculos(vinculos)
    const pessoas = [
      { matricula: '2025a', nome: 'Pessoa a' },
      { matricula: '2025b', nome: 'x' },
      { matricula: '', nome: 'Ana Paula' },
      { matricula: '', nome: 'Pessoa b' },
      { matricula: '2025z', nome: 'Pessoa z' },
      { matricula: '', nome: 'Ninguém' },
    ]
    for (const p of pessoas) expect(achar(p)).toBe(vinculos.find((v) => ehDaPessoa(v, p)))
  })
})


describe('aluno de outra turma', () => {
  const decisao = { tipo: 'outra_turma' as const, vinculo: vinculo('e', { nome: 'Davi Souza' }), turma: 'IF969 · T02' }

  it('o recado diz quem é, de qual turma, e que não contou', () => {
    expect(recadoAntesDeGravar(decisao)).toBe('Davi Souza é da turma IF969 · T02, não desta. A presença não foi contada.')
    expect(depoisDeGravar(decisao, true)).toEqual({ som: 'desconhecido', limpaRecado: false })
  })

  it('a linha aparece na lista, em vermelho, e não soma presença', () => {
    const estado = estadoDaChamada([evento({ uidHash: 'e', nome: 'Davi Souza', matricula: '2025e', resultado: 'outra_turma' })], [vinculo('e')], TURMA, DIA)
    expect(estado.presentes.size).toBe(0)
    expect(estado.porCracha.size).toBe(0)
    expect(estado.linhas).toMatchObject([{ nome: 'Davi Souza, de outra turma', tom: 'desconhecido' }])
  })
})
