import { describe, expect, it } from 'vitest'
import { JANELA_MINIMA_MS, decidir, eventoDe, proximoEventoId, type Contexto } from './sessao.ts'
import type { Vinculo } from './tipos.ts'

const PROFESSOR: Vinculo = {
  uidHash: 'aaaa000000000000',
  papel: 'professor',
  nome: 'Ana Paula',
  matricula: '',
  criadoEm: '2026-08-18T08:00:00.000Z',
}
const ALUNA: Vinculo = { ...PROFESSOR, uidHash: 'bbbb', papel: 'aluno', nome: 'Bia Souza', matricula: '2025002' }

const AGORA = new Date('2026-08-18T10:00:00.000Z')
const SESSAO = {
  turma: 'IF685 · T01',
  abertaEm: '2026-08-18T09:00:00.000Z',
  uidHashProfessor: PROFESSOR.uidHash,
}

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
  jaPresentes: new Set(),
  agora: AGORA,
  turmaSugerida: 'IF685 · T01',
  ...extra,
})

describe('crachá do professor', () => {
  it('abre a aula quando não há sessão', () => {
    expect(decidir(PROFESSOR.uidHash, ctx({ vinculo: PROFESSOR }))).toEqual({
      tipo: 'abrir',
      turma: 'IF685 · T01',
    })
  })

  it('encerra depois da janela', () => {
    expect(decidir(PROFESSOR.uidHash, ctx({ vinculo: PROFESSOR, sessao: SESSAO })).tipo).toBe(
      'encerrar',
    )
  })

  // Ele encosta duas vezes sem querer com facilidade. Sem a janela, a segunda
  // leitura encerra a aula que a primeira abriu — na frente da turma.
  it('recusa encerrar cedo demais, dizendo quanto falta', () => {
    const decisao = decidir(
      PROFESSOR.uidHash,
      ctx({ vinculo: PROFESSOR, sessao: { ...SESSAO, abertaEm: '2026-08-18T09:59:30.000Z' } }),
    )
    expect(decisao).toEqual({ tipo: 'cedo_demais', faltamMs: 30_000 })
    expect(JANELA_MINIMA_MS).toBe(60_000)
  })

  it('não abre sem saber de que turma é a aula', () => {
    expect(decidir(PROFESSOR.uidHash, ctx({ vinculo: PROFESSOR, turmaSugerida: undefined }))).toEqual({
      tipo: 'sem_turma',
    })
  })

  // Sem isto ele marcaria presença para si mesmo, e a aula nunca abriria.
  it('nunca conta presença', () => {
    const decisao = decidir(PROFESSOR.uidHash, ctx({ vinculo: PROFESSOR, sessao: SESSAO }))
    expect(decisao.tipo).not.toBe('presenca')
  })
})

describe('crachá de aluno', () => {
  it('registra presença', () => {
    expect(decidir(ALUNA.uidHash, ctx({ vinculo: ALUNA, sessao: SESSAO }))).toEqual({
      tipo: 'presenca',
      vinculo: ALUNA,
    })
  })

  it('reconhece repetição sem mexer no contador', () => {
    const decisao = decidir(
      ALUNA.uidHash,
      ctx({ vinculo: ALUNA, sessao: SESSAO, jaPresentes: new Set([ALUNA.uidHash]) }),
    )
    expect(decisao.tipo).toBe('repetido')
  })

  it('crachá sem vínculo não interrompe nada', () => {
    expect(decidir('zzzz', ctx({ sessao: SESSAO })).tipo).toBe('desconhecido')
  })
})

describe('linhas do log', () => {
  const dados = { eventoId: 'web-a1b2-20260818-0001', quando: AGORA, turma: 'IF685 · T01', uidHash: 'bbbb' }

  it('presença leva nome e login', () => {
    const evento = eventoDe({ tipo: 'presenca', vinculo: ALUNA }, dados)
    expect(evento).toMatchObject({ matricula: '2025002', nome: 'Bia Souza', origem: 'cracha', resultado: 'ok' })
  })

  it('repetição entra no log como duplicado, não some', () => {
    expect(eventoDe({ tipo: 'repetido', vinculo: ALUNA }, dados)?.resultado).toBe('duplicado')
  })

  it('desconhecido entra sem nome, com o hash para resolver depois', () => {
    const evento = eventoDe({ tipo: 'desconhecido' }, dados)
    expect(evento).toMatchObject({ nome: '', resultado: 'desconhecido', uidHash: 'bbbb' })
  })

  it('abrir e encerrar entram como professor, e não como presença', () => {
    expect(eventoDe({ tipo: 'abrir', turma: 'x' }, dados)?.origem).toBe('professor')
    expect(eventoDe({ tipo: 'encerrar' }, dados)?.origem).toBe('professor')
  })

  // Recusa não é acontecimento: o log registra o que houve, não o que se quis.
  it('recusa não vira linha', () => {
    expect(eventoDe({ tipo: 'cedo_demais', faltamMs: 1 }, dados)).toBeUndefined()
    expect(eventoDe({ tipo: 'sem_turma' }, dados)).toBeUndefined()
  })

  it('monta o evento_id com aparelho, dia e sequência', () => {
    expect(proximoEventoId('web-a1b2', AGORA, 7)).toBe('web-a1b2-20260818-0007')
  })
})
