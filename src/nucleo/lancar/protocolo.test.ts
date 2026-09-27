import { describe, expect, it } from 'vitest'
import {
  ORIGEM_SIGAA,
  VERSAO_DO_FAVORITO,
  mensagemDeLeitura,
  mensagemDePlano,
  receberLeitura,
  receberPlano,
} from './protocolo.ts'
import { comoDia, type LeituraPlanilha } from './tipos.ts'

const ADSUM = 'https://willianrupert.github.io'
const sigaa = { nome: 'janela do SIGAA' }
const adsum = { nome: 'janela do Adsum' }
const BRUTO = { qualquer: 'coisa que a leitura vai interpretar' }

const leitura: LeituraPlanilha = {
  id: 'l-1',
  versaoSigaa: '4.15.0.206',
  cabecalhoTurma: 'CIN0144 - X - Turma: 01 (2026.2)',
  colunas: [{ indice: 0, dia: comoDia('2026-10-13')!, maximo: 2 }],
  linhas: [{ indice: 0, matricula: '1', celulas: [{ tipo: 'vazia' }] }],
}

describe('favorito → Adsum: a leitura', () => {
  const evento = (data: unknown, origin = ORIGEM_SIGAA, source: unknown = sigaa) => ({ data, origin, source })

  it('aceita a leitura do SIGAA, vinda da janela que abriu o Adsum', () => {
    const r = receberLeitura(evento(mensagemDeLeitura('l-1', BRUTO)), { abridora: sigaa })
    expect(r).toEqual({ ok: true, id: 'l-1', bruto: BRUTO })
  })

  it.each([
    'http://sigaa.ufpe.br',
    'https://sigaa.ufpe.br.exemplo.com',
    'https://exemplo.com',
    'https://sigaa.ufpe.br:8443',
    'null',
  ])('recusa outra origem: %s', (origem) => {
    expect(receberLeitura(evento(mensagemDeLeitura('l-1', BRUTO), origem), { abridora: sigaa })).toEqual({ ok: false, motivo: 'origem' })
  })

  it('recusa a mesma origem vinda de outra janela', () => {
    expect(receberLeitura(evento(mensagemDeLeitura('l-1', BRUTO), ORIGEM_SIGAA, { outra: true }), { abridora: sigaa })).toEqual({
      ok: false,
      motivo: 'janela',
    })
    expect(receberLeitura(evento(mensagemDeLeitura('l-1', BRUTO)), { abridora: null })).toEqual({ ok: false, motivo: 'janela' })
  })

  it('favorito de versão desconhecida: pede o favorito novo', () => {
    const antiga = { ...mensagemDeLeitura('l-1', BRUTO), versaoFavorito: VERSAO_DO_FAVORITO + 1 }
    expect(receberLeitura(evento(antiga), { abridora: sigaa })).toEqual({ ok: false, motivo: 'versaoDoFavorito' })
  })

  it.each([
    ['texto', JSON.stringify(mensagemDeLeitura('l-1', BRUTO))],
    ['nulo', null],
    ['sem id', { ...mensagemDeLeitura('l-1', BRUTO), id: undefined }],
    ['id vazio', { ...mensagemDeLeitura('', BRUTO) }],
    ['outro tipo', { ...mensagemDeLeitura('l-1', BRUTO), tipo: 'plano' }],
    ['outra versão do protocolo', { ...mensagemDeLeitura('l-1', BRUTO), v: 99 }],
  ])('recusa o que não é uma leitura: %s', (_, data) => {
    expect(receberLeitura(evento(data), { abridora: sigaa })).toMatchObject({ ok: false, motivo: 'formato' })
  })
})

describe('Adsum → favorito: o plano', () => {
  const evento = (data: unknown, origin = ADSUM, source: unknown = adsum) => ({ data, origin, source })
  const esperado = { origemAdsum: ADSUM, aberta: adsum, leitura }
  const instrucao = { linha: 0, coluna: 0, antes: 'vazia' as const, valor: 2 }

  it('aceita o plano da janela que o favorito abriu, para a leitura que ele mandou', () => {
    expect(receberPlano(evento(mensagemDePlano('l-1', [instrucao])), esperado)).toEqual({ ok: true, instrucoes: [instrucao] })
  })

  it('"nada a lançar" é um plano vazio, e aceito', () => {
    const msg = mensagemDePlano('l-1', [])
    expect(msg.tipo).toBe('nada')
    expect(receberPlano(evento(msg), esperado)).toEqual({ ok: true, instrucoes: [] })
  })

  it('recusa outra origem e outra janela', () => {
    expect(receberPlano(evento(mensagemDePlano('l-1', [instrucao]), 'https://willianrupert.github.io.exemplo.com'), esperado)).toEqual({
      ok: false,
      motivo: 'origem',
    })
    expect(receberPlano(evento(mensagemDePlano('l-1', [instrucao]), ADSUM, sigaa), esperado)).toEqual({ ok: false, motivo: 'janela' })
  })

  it('recusa plano feito para outra leitura', () => {
    expect(receberPlano(evento(mensagemDePlano('l-0', [instrucao])), esperado)).toEqual({ ok: false, motivo: 'outraLeitura' })
  })

  it('recusa plano que o validador recusa, com os problemas', () => {
    const r = receberPlano(evento(mensagemDePlano('l-1', [{ ...instrucao, valor: 5 }])), esperado)
    expect(r).toMatchObject({ ok: false, motivo: 'planoInvalido' })
    if (!r.ok && r.motivo === 'planoInvalido') expect(r.problemas[0]).toMatch(/faixa/)
  })

  it('recusa o que não é um plano', () => {
    expect(receberPlano(evento({ v: 1, tipo: 'plano', id: 'l-1' }), esperado)).toMatchObject({ ok: false, motivo: 'formato' })
    expect(receberPlano(evento(mensagemDeLeitura('l-1', BRUTO)), esperado)).toMatchObject({ ok: false, motivo: 'formato' })
  })
})

describe('as mensagens', () => {
  it('atravessam a clonagem estruturada sem perder nada', () => {
    const plano = mensagemDePlano('l-1', [{ linha: 0, coluna: 0, antes: 'vazia', valor: 0 }])
    expect(structuredClone(plano)).toEqual(plano)
    const lida = mensagemDeLeitura('l-1', BRUTO)
    expect(structuredClone(lida)).toEqual(lida)
  })
})
