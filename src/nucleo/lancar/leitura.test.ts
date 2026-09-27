import { describe, expect, it } from 'vitest'
import { gerarCenario, sorteador } from '../../testes/planilhaSigaa.ts'
import { lerPlanilha, type BrutoPlanilha } from './leitura.ts'
import type { LeituraPlanilha } from './tipos.ts'

/** O bruto que o favorito extrai de uma planilha inventada, com duas turmas de dias. */
function bruto(mudar: (b: BrutoPlanilha) => void = () => {}): BrutoPlanilha {
  const b: BrutoPlanilha = {
    rodape: 'SIGAA | Superintendência de Tecnologia da Informação - v4.15.0.206',
    cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
    meses: [
      { texto: 'Setembro', colunas: 1 },
      { texto: 'Outubro', colunas: 2 },
    ],
    dias: [
      { texto: '29', maximoTexto: '2' },
      { texto: '13', maximoTexto: '2', marcaTexto: 'Lançado' },
      { texto: '15', maximoTexto: '2', marcaTexto: 'Feriado' },
    ],
    linhas: [
      {
        matriculaTexto: ' 20260000001 ',
        celulas: [
          { valor: '', desabilitada: false },
          { valor: '0', desabilitada: false },
          { valor: '', desabilitada: true },
        ],
      },
      {
        matriculaTexto: '20260000002',
        celulas: [
          { valor: '', desabilitada: true, motivoTexto: 'Trancado' },
          { valor: '', desabilitada: true, motivoTexto: 'Trancado' },
          { valor: '', desabilitada: true, motivoTexto: 'Trancado' },
        ],
      },
    ],
  }
  mudar(b)
  return b
}

const ler = (b: unknown) => lerPlanilha(b, 'l-1')

describe('lerPlanilha: o bruto bem formado', () => {
  it('vira a leitura inteira, sem problema', () => {
    expect(ler(bruto())).toEqual({
      problemas: [],
      leitura: {
        id: 'l-1',
        versaoSigaa: '4.15.0.206',
        cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
        colunas: [
          { indice: 0, dia: '2026-09-29', maximo: 2 },
          { indice: 1, dia: '2026-10-13', maximo: 2, marca: 'lancado' },
          { indice: 2, dia: '2026-10-15', maximo: 2, marca: 'feriado' },
        ],
        linhas: [
          {
            indice: 0,
            matricula: '20260000001',
            celulas: [{ tipo: 'vazia' }, { tipo: 'lancada', faltas: 0 }, { tipo: 'bloqueada', motivo: 'feriado' }],
          },
          {
            indice: 1,
            matricula: '20260000002',
            celulas: [
              { tipo: 'bloqueada', motivo: 'trancado' },
              { tipo: 'bloqueada', motivo: 'trancado' },
              { tipo: 'bloqueada', motivo: 'trancado' },
            ],
          },
        ],
      },
    })
  })

  it.each([
    ['MARÇO', '03'],
    ['mar.', '03'],
    ['Marco', '03'],
    ['fev', '02'],
    [' Julho ', '07'],
  ])('o mês "%s" é o %s', (texto, mes) => {
    const r = ler(bruto((b) => {
      b.cabecalhoTurma = 'CIN0144 - X - Turma: 01 (2027.1)'
      b.meses = [{ texto, colunas: 3 }]
      b.dias = [{ texto: '2' }, { texto: '9' }, { texto: '16' }]
      b.linhas = b.linhas.slice(1)
    }))
    expect(r.problemas).toEqual([])
    expect(r.leitura?.colunas.map((c) => c.dia)).toEqual([`2027-${mes}-02`, `2027-${mes}-09`, `2027-${mes}-16`])
  })

  it('valor com espaço é lido; máximo ausente fica ausente, e a conciliação diz o porquê', () => {
    const r = ler(bruto((b) => {
      b.linhas[0].celulas[0].valor = ' 2 '
      delete b.dias[0].maximoTexto
    }))
    expect(r.problemas).toEqual([])
    expect(r.leitura?.linhas[0].celulas[0]).toEqual({ tipo: 'lancada', faltas: 2 })
    expect(r.leitura?.colunas[0].maximo).toBeUndefined()
  })

  it('máximo ilegível fica ausente, com aviso', () => {
    const r = ler(bruto((b) => (b.dias[0].maximoTexto = 'dois')))
    expect(r.leitura?.colunas[0].maximo).toBeUndefined()
    expect(r.problemas).toEqual([{ onde: 'coluna 1', conteudo: 'dois', motivo: 'máximo ilegível' }])
  })

  it('matrícula posterior vira "matriculado depois"', () => {
    const r = ler(bruto((b) => (b.linhas[0].celulas[0] = { valor: '', desabilitada: true, motivoTexto: 'Matriculado posteriormente' })))
    expect(r.leitura?.linhas[0].celulas[0]).toEqual({ tipo: 'bloqueada', motivo: 'matriculadoDepois' })
  })
})

describe('lerPlanilha: linha ilegível vira problema, não some', () => {
  it('a linha sai da leitura com número e conteúdo, e as outras mantêm o lugar da página', () => {
    const r = ler(bruto((b) => b.linhas.unshift({ matriculaTexto: 'ALUNO SEM NÚMERO', celulas: b.linhas[0].celulas })))
    expect(r.problemas).toEqual([{ onde: 'linha 1', conteudo: 'ALUNO SEM NÚMERO', motivo: 'matrícula ilegível' }])
    expect(r.leitura?.linhas.map((l) => [l.indice, l.matricula])).toEqual([
      [1, '20260000001'],
      [2, '20260000002'],
    ])
  })
})

describe('lerPlanilha: o que recusa a leitura inteira', () => {
  it.each<[string, (b: BrutoPlanilha) => void, RegExp]>([
    ['cabeçalho sem semestre', (b) => (b.cabecalhoTurma = 'CIN0144 - X - Turma: 01'), /semestre/],
    ['mês desconhecido', (b) => (b.meses[0].texto = 'Brumário'), /mês/],
    ['meses que não cobrem as colunas', (b) => (b.meses[1].colunas = 1), /meses/],
    ['dia que não existe', (b) => (b.dias[0].texto = '31'), /coluna 1/],
    ['dia que não é número', (b) => (b.dias[1].texto = 'ter'), /coluna 2/],
    ['duas colunas no mesmo dia', (b) => (b.dias[2].texto = '13'), /repetid/],
    ['matrícula repetida', (b) => (b.linhas[1].matriculaTexto = '20260000001'), /repetid/],
    ['linha com células a menos', (b) => b.linhas[0].celulas.pop(), /linha 1/],
    ['valor que não é número', (b) => (b.linhas[0].celulas[0].valor = 'F'), /linha 1/],
    ['valor negativo', (b) => (b.linhas[0].celulas[0].valor = '-1'), /linha 1/],
    ['valor fracionário', (b) => (b.linhas[0].celulas[0].valor = '1,5'), /linha 1/],
    ['bloqueio sem motivo conhecido', (b) => (b.linhas[0].celulas[0] = { valor: '', desabilitada: true, motivoTexto: 'Outro' }), /motivo/],
  ])('%s', (_, estragar, motivo) => {
    const r = ler(bruto(estragar))
    expect(r.leitura).toBeUndefined()
    expect(r.problemas.map((p) => `${p.onde}: ${p.motivo}`).join(' | ')).toMatch(motivo)
  })
})

describe('lerPlanilha nunca lança', () => {
  it('diante de qualquer coisa que chegue de outra janela', () => {
    const lixos: unknown[] = [undefined, null, 0, 'texto', [], {}, { dias: 'x' }, { linhas: [null] }, { meses: [{}] }]
    const s = sorteador(42)
    const valor = (): unknown => [null, 1, 'a', [], {}, true, undefined][s.entre(0, 6)]
    for (let i = 0; i < 300; i++) {
      const b = bruto() as unknown as Record<string, unknown>
      const chave = ['rodape', 'cabecalhoTurma', 'meses', 'dias', 'linhas'][s.entre(0, 4)]
      b[chave] = valor()
      lixos.push(b)
    }
    for (const lixo of lixos) {
      const r = ler(lixo)
      if (r.leitura) continue
      expect(r.problemas.length).toBeGreaterThan(0)
    }
  })
})

describe('ida e volta', () => {
  const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const MOTIVOS = { trancado: 'Trancado', matriculadoDepois: 'Matriculado posteriormente', feriado: 'Feriado', cancelada: 'Aula cancelada' }
  const MARCAS = { lancado: 'Lançado', feriado: 'Feriado', cancelada: 'Cancelada' }

  /** O bruto que o favorito extrairia da página que esta leitura descreve. */
  function brutoDe(l: LeituraPlanilha): BrutoPlanilha {
    const meses: BrutoPlanilha['meses'] = []
    for (const c of l.colunas) {
      const nome = NOMES[Number(c.dia.slice(5, 7)) - 1]
      if (meses.at(-1)?.texto === nome) meses.at(-1)!.colunas += 1
      else meses.push({ texto: nome, colunas: 1 })
    }
    return {
      rodape: `SIGAA | STI - v${l.versaoSigaa}`,
      cabecalhoTurma: l.cabecalhoTurma,
      meses,
      dias: l.colunas.map((c) => ({
        texto: String(Number(c.dia.slice(8))),
        ...(c.maximo !== undefined && { maximoTexto: String(c.maximo) }),
        ...(c.marca && { marcaTexto: MARCAS[c.marca] }),
      })),
      linhas: l.linhas.map((linha) => ({
        matriculaTexto: linha.matricula,
        celulas: linha.celulas.map((c) =>
          c.tipo === 'bloqueada'
            ? { valor: '', desabilitada: true, motivoTexto: MOTIVOS[c.motivo] }
            : { valor: c.tipo === 'lancada' ? String(c.faltas) : '', desabilitada: false },
        ),
      })),
    }
  }

  it('ler o bruto de uma leitura devolve a mesma leitura, em 300 cenários', () => {
    for (let semente = 1; semente <= 300; semente++) {
      const { leitura } = gerarCenario(semente)
      expect(lerPlanilha(brutoDe(leitura), leitura.id), `semente ${semente}`).toEqual({ leitura, problemas: [] })
    }
  })
})
