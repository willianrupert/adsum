import { describe, expect, it } from 'vitest'
import { gerarCenario, sorteador } from '../../testes/planilhaSigaa.ts'
import { conciliar } from './conciliar.ts'
import { planejar, validarPlano } from './plano.ts'
import { comoDia, type Celula, type Instrucao, type LeituraPlanilha } from './tipos.ts'

const TER = comoDia('2026-10-13')!
const QUI = comoDia('2026-10-15')!
const V: Celula = { tipo: 'vazia' }

const leitura: LeituraPlanilha = {
  id: 'l1',
  versaoSigaa: '4.15.0.206',
  cabecalhoTurma: 'CIN0144 - X - Turma: 01 (2026.2)',
  colunas: [
    { indice: 0, dia: TER, maximo: 2 },
    { indice: 1, dia: QUI, maximo: 2 },
    { indice: 2, dia: comoDia('2026-10-20')!, maximo: 2, marca: 'feriado' },
    { indice: 3, dia: comoDia('2026-10-22')! },
  ],
  linhas: [
    { indice: 0, matricula: '1', celulas: [V, { tipo: 'lancada', faltas: 0 }, { tipo: 'bloqueada', motivo: 'feriado' }, V] },
    { indice: 1, matricula: '2', celulas: [V, V, { tipo: 'bloqueada', motivo: 'feriado' }, V] },
  ],
}
const ok = (linha: number, coluna: number, valor: number): Instrucao => ({ linha, coluna, antes: 'vazia', valor })

describe('planejar', () => {
  const relatorio = {
    turma: 'T',
    celulas: [
      { categoria: 'aLancar' as const, linha: 0, coluna: 0, matricula: '1', dia: TER, esperado: 0 },
      { categoria: 'confere' as const, linha: 0, coluna: 1, matricula: '1', dia: QUI, valor: 0, ajustada: false },
      { categoria: 'aLancar' as const, linha: 1, coluna: 0, matricula: '2', dia: TER, esperado: 2 },
      { categoria: 'aLancar' as const, linha: 1, coluna: 1, matricula: '2', dia: QUI, esperado: 0 },
      { categoria: 'diverge' as const, linha: 1, coluna: 2, matricula: '2', dia: QUI, sigaa: 1, esperado: 0 },
    ],
    semParSigaa: [],
    semParAdsum: [],
    semOndeLancar: [],
    semMaximo: [],
    vaziasEmAulaLancada: [],
    remanejadas: [],
    aulasSemChamada: [],
  }

  it('uma instrução por célula "a lançar", e nenhuma de outra categoria', () => {
    expect(planejar(relatorio, [])).toEqual([ok(0, 0, 0), ok(1, 0, 2), ok(1, 1, 0)])
  })

  it('a aula desmarcada fica de fora inteira', () => {
    expect(planejar(relatorio, [TER])).toEqual([ok(1, 1, 0)])
    expect(planejar(relatorio, [TER, QUI])).toEqual([])
  })
})

describe('validarPlano', () => {
  it('aceita um plano que só escreve em célula vazia, dentro da faixa', () => {
    expect(validarPlano([ok(0, 0, 0), ok(1, 0, 2), ok(1, 1, 1)], leitura)).toEqual({ ok: true, instrucoes: [ok(0, 0, 0), ok(1, 0, 2), ok(1, 1, 1)] })
    expect(validarPlano([], leitura)).toEqual({ ok: true, instrucoes: [] })
  })

  it.each([
    ['célula já lançada', ok(0, 1, 0), /lançada/],
    ['célula bloqueada', ok(1, 2, 0), /bloqueada|feriado/],
    ['acima do máximo', ok(0, 0, 3), /faixa/],
    ['negativo', ok(0, 0, -1), /faixa/],
    ['fracionário', ok(0, 0, 0.5), /faixa/],
    ['coluna sem máximo', ok(0, 3, 0), /máximo/],
    ['linha que não existe', ok(9, 0, 0), /não existe/],
    ['coluna que não existe', ok(0, 9, 0), /não existe/],
  ])('recusa o plano inteiro por uma instrução ruim: %s', (_, ruim, motivo) => {
    const r = validarPlano([ok(1, 0, 2), ruim], leitura)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problemas.join(' ')).toMatch(motivo)
  })

  it('acha a linha pelo índice da página, não pela posição na lista', () => {
    // A linha 1 da página teve a matrícula ilegível e ficou fora da leitura.
    const semALinha1: LeituraPlanilha = {
      ...leitura,
      linhas: [leitura.linhas[0], { indice: 2, matricula: '3', celulas: [V, V, { tipo: 'bloqueada', motivo: 'feriado' }, V] }],
    }
    expect(validarPlano([ok(2, 0, 2)], semALinha1)).toMatchObject({ ok: true })
    expect(validarPlano([ok(1, 0, 2)], semALinha1)).toMatchObject({ ok: false })
  })

  it('recusa a mesma célula duas vezes', () => {
    const r = validarPlano([ok(1, 0, 2), ok(1, 0, 0)], leitura)
    expect(r).toMatchObject({ ok: false })
  })

  it.each([
    ['não é lista', { linha: 0 }],
    ['texto no lugar de número', [{ linha: '0', coluna: 0, antes: 'vazia', valor: 0 }]],
    ['antes que não é "vazia"', [{ linha: 0, coluna: 0, antes: 'lancada', valor: 0 }]],
    ['campo a mais', [{ linha: 0, coluna: 0, antes: 'vazia', valor: 0, clicar: '#gravar' }]],
    ['nulo', [null]],
  ])('o que chega de outra janela não é confiável: %s', (_, lixo) => {
    expect(validarPlano(lixo, leitura)).toMatchObject({ ok: false })
  })
})

describe('as leis, agora sobre o plano, em 500 cenários', () => {
  const SEMENTES = Array.from({ length: 500 }, (_, i) => i + 1)

  it('o plano de uma conciliação sempre passa no validador, e cada instrução é uma célula "a lançar"', () => {
    for (const semente of SEMENTES) {
      const c = gerarCenario(semente)
      const r = conciliar({ leitura: c.leitura, turma: c.turma, matriculados: c.matriculados, eventos: c.eventos, ajustes: c.ajustes })
      const plano = planejar(r, [])
      expect(validarPlano(plano, c.leitura), `semente ${semente}`).toMatchObject({ ok: true })
      const aLancar = new Map(r.celulas.flatMap((x) => (x.categoria === 'aLancar' ? [[`${x.linha}|${x.coluna}`, x.esperado]] : [])))
      expect(plano).toHaveLength(aLancar.size)
      for (const i of plano) expect(aLancar.get(`${i.linha}|${i.coluna}`)).toBe(i.valor)
    }
  })

  it('uma instrução a mais, apontando para célula que não está vazia, derruba o plano', () => {
    for (const semente of SEMENTES) {
      const c = gerarCenario(semente)
      const ocupadas = c.leitura.linhas.flatMap((l) => l.celulas.flatMap((cel, j) => (cel.tipo === 'vazia' ? [] : [[l.indice, j]])))
      if (ocupadas.length === 0) continue
      const [linha, coluna] = ocupadas[sorteador(semente).entre(0, ocupadas.length - 1)]
      const r = conciliar({ leitura: c.leitura, turma: c.turma, matriculados: c.matriculados, eventos: c.eventos, ajustes: c.ajustes })
      expect(validarPlano([...planejar(r, []), ok(linha, coluna, 0)], c.leitura), `semente ${semente}`).toMatchObject({ ok: false })
    }
  })
})
