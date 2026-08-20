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
      ctx({ vinculo: PROFESSOR, sessao: { ...SESSAO, abertaEm: '2026-08-18T09:59:56.000Z' } }),
    )
    expect(decisao).toEqual({ tipo: 'cedo_demais', faltamMs: 6_000 })
    expect(JANELA_MINIMA_MS).toBe(10_000)
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

describe('cadastro e chamada são a mesma coisa', () => {
  const PESSOA = {
    turma: 'IF685 · T01',
    chave: '20250001',
    matricula: '20250001',
    nomeCompleto: 'CARLA REGINA DO NASCIMENTO',
    nome: 'Carla Regina',
    papel: 'aluno' as const,
  }

  // Quem encosta o crachá para se cadastrar já está presente naquela aula.
  // Separar as duas obrigaria a turma a passar duas vezes.
  it('crachá novo com nome armado cadastra e conta presença', () => {
    const decisao = decidir('novo', ctx({ sessao: SESSAO, armado: PESSOA }))
    expect(decisao).toEqual({ tipo: 'cadastro', pessoa: PESSOA })

    const evento = eventoDe(decisao, {
      eventoId: 'web-a1b2-20260818-0009',
      quando: AGORA,
      turma: 'IF685 · T01',
      uidHash: 'novo',
    })
    expect(evento).toMatchObject({ nome: 'Carla Regina', matricula: '20250001', resultado: 'ok' })
  })

  // Sem nome armado não há a quem pertencer, e adivinhar é o erro que a
  // cerimônia existe para evitar.
  it('crachá novo sem nome armado continua desconhecido', () => {
    expect(decidir('novo', ctx({ sessao: SESSAO })).tipo).toBe('desconhecido')
  })

  it('o crachá do professor não é capturado pela fila de cadastro', () => {
    const decisao = decidir(PROFESSOR.uidHash, ctx({ vinculo: PROFESSOR, sessao: SESSAO, armado: PESSOA }))
    expect(decisao.tipo).toBe('encerrar')
  })

  it('quem já tem crachá não vira cadastro de novo', () => {
    expect(decidir(ALUNA.uidHash, ctx({ vinculo: ALUNA, sessao: SESSAO, armado: PESSOA })).tipo).toBe(
      'presenca',
    )
  })
})

// Pedido pelo Prof. Paulo: impedir dois crachás de uma vez. Empilhados na mão,
// os dois são lidos em algumas centenas de milissegundos; duas pessoas numa
// fila levam segundos. Um segundo separa as duas situações com folga.
describe('dois crachás quase juntos', () => {
  const ANA = {
    uidHash: 'aaaa000000000000',
    papel: 'aluno' as const,
    nome: 'Ana Paula',
    matricula: '1',
    criadoEm: '2026-08-20T10:00:00.000Z',
  }
  const BRENO = { ...ANA, uidHash: 'bbbb000000000000', nome: 'Breno Oliveira', matricula: '2' }
  const SESSAO = {
    turma: 'IF685 · T01',
    abertaEm: '2026-08-20T10:00:00.000Z',
    uidHashProfessor: 'prof',
  }
  const em = (ms: number) => new Date(Date.parse('2026-08-20T10:30:00.000Z') + ms)

  const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
    sessao: SESSAO,
    jaPresentes: new Set(),
    agora: em(0),
    ...extra,
  })

  it('recusa o segundo crachá dentro do intervalo', () => {
    const decisao = decidir(BRENO.uidHash, ctx({
      vinculo: BRENO,
      ultima: { uidHash: ANA.uidHash, em: em(-300) },
    }))
    expect(decisao.tipo).toBe('rapido_demais')
  })

  // Fim de aula, todo mundo querendo sair: a fila se encavala no leitor. Meio
  // segundo entre duas pessoas é comum, e travar aí seria o pior atrito
  // possível — no momento de maior pressa.
  it('aceita a fila apressada do fim da aula', () => {
    const decisao = decidir(BRENO.uidHash, ctx({
      vinculo: BRENO,
      ultima: { uidHash: ANA.uidHash, em: em(-600) },
    }))
    expect(decisao.tipo).toBe('presenca')
  })

  // O mesmo crachá duas vezes é outro assunto, e já tinha resposta.
  it('o mesmo crachá de novo continua sendo repetido, não recusa', () => {
    const decisao = decidir(ANA.uidHash, ctx({
      vinculo: ANA,
      jaPresentes: new Set([ANA.uidHash]),
      ultima: { uidHash: ANA.uidHash, em: em(-200) },
    }))
    expect(decisao.tipo).toBe('repetido')
  })

  // Bloquear quem abre e encerra a aula seria atrapalhar sem proteger nada: o
  // crachá do professor não é o vetor da fraude.
  it('não atrapalha o professor', () => {
    const professor = { ...ANA, uidHash: 'prof', papel: 'professor' as const }
    const decisao = decidir('prof', ctx({
      vinculo: professor,
      agora: em(JANELA_MINIMA_MS + 1),
      ultima: { uidHash: ANA.uidHash, em: em(JANELA_MINIMA_MS) },
    }))
    expect(decisao.tipo).toBe('encerrar')
  })

  // Recusa muda é bug: a tentativa fica no log, com o hash do crachá recusado.
  it('a recusa entra no log', () => {
    const evento = eventoDe(
      { tipo: 'rapido_demais', faltamMs: 700 },
      { eventoId: 'web-aaaa-20260820-0009', quando: em(0), turma: SESSAO.turma, uidHash: BRENO.uidHash },
    )
    expect(evento).toMatchObject({ resultado: 'rapido_demais', uidHash: BRENO.uidHash })
  })
})
