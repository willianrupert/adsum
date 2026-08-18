import { describe, expect, it } from 'vitest'
import {
  CABECALHO_REGISTROS,
  deCsvEventos,
  deCsvGrade,
  deCsvVinculos,
  paraCsvEventos,
  paraCsvGrade,
  paraCsvVinculos,
} from './csv.ts'
import type { Aula, Evento, Vinculo } from './tipos.ts'

const CRIADO = '2026-08-18T10:00:00.000Z'

describe('alunos.csv', () => {
  // Linhas colhidas de `Adsum/docs/04_vinculo.md`. Se a leitura destas quebrar,
  // o app deixou de conversar com o aparelho.
  const DO_APARELHO = ['9bb18ff5da8824b2;P;Paulo Araujo Filho', '062089570d359736;A;Amanda Nascimento'].join('\n')

  it('lê o que o aparelho grava', () => {
    const { itens, problemas } = deCsvVinculos(DO_APARELHO, CRIADO)
    expect(problemas).toEqual([])
    expect(itens).toEqual([
      { uidHash: '9bb18ff5da8824b2', papel: 'professor', nome: 'Paulo Araujo Filho', criadoEm: CRIADO },
      { uidHash: '062089570d359736', papel: 'aluno', nome: 'Amanda Nascimento', criadoEm: CRIADO },
    ])
  })

  it('faz a volta escrita → leitura', () => {
    const vinculos: Vinculo[] = [
      { uidHash: '9bb18ff5da8824b2', papel: 'professor', nome: 'Paulo Araújo Filho', criadoEm: CRIADO },
      { uidHash: '062089570d359736', papel: 'aluno', nome: 'Amanda Nascimento', criadoEm: CRIADO },
    ]
    expect(deCsvVinculos(paraCsvVinculos(vinculos), CRIADO).itens).toEqual(vinculos)
  })

  it('escreve com BOM, senão o Excel estraga a acentuação', () => {
    expect(paraCsvVinculos([])).toMatch(/^﻿/)
  })

  // "Uma tabela gravada antes de o papel existir não se perde" — docs/04.
  it('aceita o formato antigo hash;nome como aluno', () => {
    const { itens, problemas } = deCsvVinculos('062089570d359736;Amanda Nascimento', CRIADO)
    expect(problemas).toEqual([])
    expect(itens[0]).toMatchObject({ papel: 'aluno', nome: 'Amanda Nascimento' })
  })

  it('descarta linha ruim dizendo por quê, e segue com as boas', () => {
    const { itens, problemas } = deCsvVinculos(
      ['9bb18ff5da8824b2;P;Paulo', 'lixo;A;Fulano', 'aaaaaaaaaaaaaaaa;X;Beltrano', 'bbbbbbbbbbbbbbbb;A;'].join('\n'),
      CRIADO,
    )
    expect(itens).toHaveLength(1)
    expect(problemas.map((p) => p.linha)).toEqual([2, 3, 4])
    expect(problemas[0].motivo).toMatch(/hexadecimais/)
    expect(problemas[1].motivo).toMatch(/A nem P/)
    expect(problemas[2].motivo).toMatch(/sem nome/)
  })

  it('ignora linhas vazias e comentários', () => {
    const { itens } = deCsvVinculos('# tabela de vínculos\n\n9bb18ff5da8824b2;P;Paulo\n\n', CRIADO)
    expect(itens).toHaveLength(1)
  })

  it('não deixa `;` do nome virar coluna nova', () => {
    const texto = paraCsvVinculos([
      { uidHash: '9bb18ff5da8824b2', papel: 'aluno', nome: 'Silva; Maria', criadoEm: CRIADO },
    ])
    expect(deCsvVinculos(texto, CRIADO).itens[0].nome).toBe('Silva Maria')
  })
})

describe('grade.csv', () => {
  it('lê a linha do documento', () => {
    const { itens, problemas } = deCsvGrade('9bb18ff5da8824b2;1;08:00;10:00;IF685 · T01')
    expect(problemas).toEqual([])
    expect(itens[0]).toEqual({
      uidHashProfessor: '9bb18ff5da8824b2',
      dia: 1,
      inicio: '08:00',
      fim: '10:00',
      turma: 'IF685 · T01',
    })
  })

  it('faz a volta escrita → leitura', () => {
    const aulas: Aula[] = [
      { uidHashProfessor: '9bb18ff5da8824b2', dia: 3, inicio: '10:00', fim: '12:00', turma: 'IF669 · T02' },
    ]
    expect(deCsvGrade(paraCsvGrade(aulas)).itens).toEqual(aulas)
  })

  it('recusa dia fora de 0–6 e horário torto', () => {
    const { itens, problemas } = deCsvGrade(
      ['9bb18ff5da8824b2;7;08:00;10:00;X', '9bb18ff5da8824b2;1;8h;10:00;X', '9bb18ff5da8824b2;1;08:00;25:00;X'].join('\n'),
    )
    expect(itens).toHaveLength(0)
    expect(problemas.map((p) => p.motivo)).toEqual([
      expect.stringMatching(/fora de 0–6/),
      expect.stringMatching(/hh:mm/),
      expect.stringMatching(/hh:mm/),
    ])
  })

  it('normaliza 8:00 para 08:00', () => {
    expect(deCsvGrade('9bb18ff5da8824b2;1;8:00;10:00;IF685').itens[0].inicio).toBe('08:00')
  })
})

describe('registros.csv', () => {
  const evento: Evento = {
    eventoId: 'a1-0007-0142',
    sessaoId: '0007',
    timestamp: '2026-08-18T10:06:00.000Z',
    turma: 'IF685 · T01',
    uidHash: '9bb18ff5da8824b2',
    nome: 'Willian Neves',
    origem: 'cracha',
    resultado: 'ok',
  }

  it('escreve o cabeçalho documentado, na ordem documentada', () => {
    expect(paraCsvEventos([evento]).split('\n')[0]).toBe('﻿' + CABECALHO_REGISTROS)
  })

  it('escreve oito colunas mesmo sem login', () => {
    const linha = paraCsvEventos([evento]).split('\n')[1]
    expect(linha.split(';')).toHaveLength(8)
    expect(linha.split(';')[4]).toBe('')
  })

  it('faz a volta, menos o uid_hash — que o CSV do cartão não carrega', () => {
    const { itens } = deCsvEventos(paraCsvEventos([evento]))
    expect(itens[0]).toEqual({ ...evento, uidHash: '', login: undefined })
  })

  it('recusa origem, resultado e timestamp que não existem', () => {
    const { problemas } = deCsvEventos(
      [
        'a1-1;1;2026-08-18T10:00:00Z;T;;N;telepatia;ok',
        'a1-2;1;2026-08-18T10:00:00Z;T;;N;cracha;talvez',
        'a1-3;1;ontem cedo;T;;N;cracha;ok',
        'a1-4;1;2026-08-18T10:00:00Z;T',
      ].join('\n'),
    )
    expect(problemas.map((p) => p.motivo)).toEqual([
      expect.stringMatching(/origem/),
      expect.stringMatching(/resultado/),
      expect.stringMatching(/timestamp/),
      expect.stringMatching(/colunas/),
    ])
  })

  it('pula o cabeçalho na leitura', () => {
    expect(deCsvEventos(paraCsvEventos([evento])).itens).toHaveLength(1)
  })
})
