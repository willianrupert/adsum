import { describe, expect, it } from 'vitest'
import { CABECALHO, deCsv, nomeDoArquivo, paraCsv, porTurma } from './csv.ts'
import type { Evento } from './tipos.ts'

const EVENTO: Evento = {
  eventoId: 'web-a1b2-20260818-0001',
  quando: '2026-08-18T10:06:00.000Z',
  turma: 'IF685 · T01',
  matricula: '20250023010',
  nome: 'Willian Neves',
  origem: 'cracha',
  resultado: 'ok',
  uidHash: '309940e145b847cf',
}

describe('registros em CSV', () => {
  it('escreve o cabeçalho na ordem decidida', () => {
    expect(paraCsv([EVENTO]).split('\n')[0]).toBe('﻿' + CABECALHO)
  })

  // Sem BOM o Excel lê UTF-8 como Latin-1 e "João" vira "JoÃ£o". Com vírgula
  // em vez de `;`, a planilha em português abre tudo numa coluna só.
  it('leva BOM e usa ponto e vírgula', () => {
    const texto = paraCsv([EVENTO])
    expect(texto.startsWith('﻿')).toBe(true)
    expect(texto.split('\n')[1].split(';')).toHaveLength(8)
  })

  it('faz a volta escrita → leitura', () => {
    expect(deCsv(paraCsv([EVENTO])).itens).toEqual([EVENTO])
  })

  it('aceita linha sem login, que é o caso do crachá desconhecido', () => {
    const desconhecido: Evento = {
      ...EVENTO,
      matricula: undefined,
      nome: '',
      resultado: 'desconhecido',
    }
    const { itens, problemas } = deCsv(paraCsv([desconhecido]))
    expect(problemas).toEqual([])
    expect(itens[0].matricula).toBeUndefined()
    // Sem login, o hash é o único jeito de descobrir depois quem era.
    expect(itens[0].uidHash).toBe('309940e145b847cf')
  })

  it('recusa o que não entende, dizendo linha e motivo', () => {
    const { itens, problemas } = deCsv(
      [
        CABECALHO,
        'a;2026-08-18T10:00:00Z;T;l;N;telepatia;ok;h',
        'b;2026-08-18T10:00:00Z;T;l;N;cracha;talvez;h',
        'c;ontem cedo;T;l;N;cracha;ok;h',
        'd;2026-08-18T10:00:00Z;T',
        ';2026-08-18T10:00:00Z;T;l;N;cracha;ok;h',
      ].join('\n'),
    )
    expect(itens).toHaveLength(0)
    expect(problemas.map((p) => p.linha)).toEqual([2, 3, 4, 5, 6])
    expect(problemas.map((p) => p.motivo)).toEqual([
      expect.stringMatching(/origem/),
      expect.stringMatching(/resultado/),
      expect.stringMatching(/ISO 8601/),
      expect.stringMatching(/colunas/),
      expect.stringMatching(/evento_id/),
    ])
  })

  it('não deixa `;` do nome virar coluna nova', () => {
    const texto = paraCsv([{ ...EVENTO, nome: 'Silva; Maria' }])
    expect(deCsv(texto).itens[0].nome).toBe('Silva Maria')
  })
})

describe('um arquivo por turma', () => {
  it('separa os eventos por turma', () => {
    const mapa = porTurma([EVENTO, { ...EVENTO, eventoId: 'b', turma: 'IF669 · T02' }])
    expect([...mapa.keys()]).toEqual(['IF685 · T01', 'IF669 · T02'])
    expect(mapa.get('IF685 · T01')).toHaveLength(1)
  })

  it('gera nome de arquivo que qualquer sistema aceita', () => {
    expect(nomeDoArquivo('IF685 · T01')).toBe('IF685-T01.csv')
    expect(nomeDoArquivo('Cálculo I / T3')).toBe('Calculo-I-T3.csv')
    expect(nomeDoArquivo('···')).toBe('turma.csv')
  })
})
