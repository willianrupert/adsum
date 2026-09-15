import { beforeEach, describe, expect, it } from 'vitest'
import {
  definirProfessorAtual,
  historicoDeChamadas,
  marcarVersaoDeNovidadeVista,
  professorAtual,
  registrarChamadaEncerrada,
  versaoDeNovidadeVista,
  type ChamadaEncerrada,
} from './preferencias.ts'

// `window.localStorage` é uma instância só, compartilhada pela suíte inteira
// (ver `testes/preparo.ts`) — sem limpar a chave, um teste vaza pro seguinte.
beforeEach(() => {
  window.localStorage.removeItem('adsum.historico.chamadas')
  window.localStorage.removeItem('adsum.professor.atual')
  window.localStorage.removeItem('adsum.novidade.versao')
})

const CHAMADA: ChamadaEncerrada = {
  turma: 'IF685 · T01',
  encerradaEm: '2026-09-15T10:00:00.000Z',
  duracaoMs: 50 * 60_000,
  intervalos: { minimoMs: 500, maximoMs: 1200, medioMs: 800, amostras: 3 },
}

describe('histórico de chamadas', () => {
  it('começa vazio', () => {
    expect(historicoDeChamadas()).toEqual([])
  })

  it('registra e lê de volta', () => {
    registrarChamadaEncerrada(CHAMADA)
    expect(historicoDeChamadas()).toEqual([CHAMADA])
  })

  it('mais recente primeiro', () => {
    registrarChamadaEncerrada({ ...CHAMADA, turma: 'A' })
    registrarChamadaEncerrada({ ...CHAMADA, turma: 'B' })
    expect(historicoDeChamadas().map((c) => c.turma)).toEqual(['B', 'A'])
  })

  // Menos de duas pessoas registradas em sequência: não há par pra medir, e
  // `estatisticaDeIntervalos` já devolve `undefined` — o histórico só guarda
  // o que recebeu, sem inventar dado.
  it('sem intervalos, quando a aula não deu par pra medir', () => {
    registrarChamadaEncerrada({ ...CHAMADA, intervalos: undefined })
    expect(historicoDeChamadas()[0].intervalos).toBeUndefined()
  })

  it('capa em 20 chamadas, descartando as mais antigas', () => {
    for (let i = 0; i < 25; i++) registrarChamadaEncerrada({ ...CHAMADA, turma: `T${i}` })
    const lista = historicoDeChamadas()
    expect(lista).toHaveLength(20)
    // A última registrada (T24) fica na frente; as cinco mais velhas (T0-T4)
    // caem fora da janela.
    expect(lista[0].turma).toBe('T24')
    expect(lista[19].turma).toBe('T5')
  })
})

describe('"Sou eu"', () => {
  it('começa sem ninguém marcado', () => {
    expect(professorAtual()).toBeUndefined()
  })

  it('marca e desfaz', () => {
    definirProfessorAtual('aaaa000000000000')
    expect(professorAtual()).toBe('aaaa000000000000')

    definirProfessorAtual(undefined)
    expect(professorAtual()).toBeUndefined()
  })
})

describe('versão de novidade vista', () => {
  it('começa sem nenhuma versão vista', () => {
    expect(versaoDeNovidadeVista()).toBeUndefined()
  })

  it('marca e lê de volta', () => {
    marcarVersaoDeNovidadeVista('2026-09-16')
    expect(versaoDeNovidadeVista()).toBe('2026-09-16')
  })
})
