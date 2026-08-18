import { beforeEach, describe, expect, it } from 'vitest'
import type { Evento } from '../../nucleo/tipos.ts'
import { RepositorioDexie } from './RepositorioDexie.ts'

let n = 0
let repo: RepositorioDexie

beforeEach(async () => {
  // Banco novo por teste: estado que vaza entre testes esconde exatamente o
  // tipo de bug que este arquivo existe para pegar.
  repo = new RepositorioDexie(`adsum-teste-${n++}`)
  await repo.abrir()
})

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    eventoId: 'web-a1b2-20260818-0001',
    quando: '2026-08-18T10:00:00.000Z',
    turma: 'IF685 · T01',
    uidHash: '309940e145b847cf',
    nome: 'Willian Neves',
    origem: 'cracha',
    resultado: 'ok',
    ...parcial,
  }
}

describe('configuração', () => {
  it('nasce com sal e identificador próprios', async () => {
    const config = await repo.lerConfig()
    expect(config.salHex).toMatch(/^[0-9a-f]{32}$/)
    expect(config.aparelhoId).toMatch(/^web-[0-9a-f]{4}$/)
  })

  it('não sorteia sal de novo a cada leitura', async () => {
    expect((await repo.lerConfig()).salHex).toBe((await repo.lerConfig()).salHex)
  })

  it('aceita sal importado — é assim que a base se junta à do aparelho', async () => {
    await repo.definirSal('FFEEDDCCBBAA99887766554433221100')
    expect((await repo.lerConfig()).salHex).toBe('ffeeddccbbaa99887766554433221100')
  })
})

describe('eventos', () => {
  it('acrescenta e conta', async () => {
    await repo.acrescentarEvento(evento())
    expect(await repo.contarEventos()).toBe(1)
  })

  // A propriedade que a planilha depende: reenviar o mesmo lote não duplica
  // linha. Sai da chave primária, não da educação de quem chama.
  it('é idempotente por evento_id', async () => {
    await repo.acrescentarEvento(evento())
    await repo.acrescentarEvento(evento())
    await repo.acrescentarEvento(evento({ nome: 'Outro Nome Qualquer' }))
    expect(await repo.contarEventos()).toBe(1)
    expect((await repo.listarEventos())[0].nome).toBe('Willian Neves')
  })

  it('lista os mais recentes primeiro', async () => {
    for (const [i, hora] of ['10:00', '10:02', '10:01'].entries()) {
      await repo.acrescentarEvento(
        evento({
          eventoId: `web-a1b2-20260818-000${i}`,
          quando: `2026-08-18T${hora}:00.000Z`,
        }),
      )
    }
    const lista = await repo.listarEventos()
    expect(lista.map((e) => e.quando)).toEqual([
      '2026-08-18T10:02:00.000Z',
      '2026-08-18T10:01:00.000Z',
      '2026-08-18T10:00:00.000Z',
    ])
  })

  it('respeita o limite pedido', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.acrescentarEvento(evento({ eventoId: `web-a1b2-20260818-000${i}` }))
    }
    expect(await repo.listarEventos(2)).toHaveLength(2)
  })
})

describe('vínculos', () => {
  const paulo = {
    uidHash: '9bb18ff5da8824b2',
    papel: 'professor' as const,
    nome: 'Paulo Araújo Filho',
    criadoEm: '2026-08-18T10:00:00.000Z',
  }

  it('grava, busca e conta por papel', async () => {
    await repo.gravarVinculo(paulo)
    await repo.gravarVinculo({ ...paulo, uidHash: 'aaaa', papel: 'aluno', nome: 'Maria Vitória' })
    expect((await repo.vinculoPorHash('9bb18ff5da8824b2'))?.nome).toBe('Paulo Araújo Filho')
    const diag = await repo.diagnostico()
    expect(diag.vinculos).toBe(2)
    expect(diag.professores).toBe(1)
  })

  it('devolve indefinido para crachá não cadastrado, sem inventar', async () => {
    expect(await repo.vinculoPorHash('não existe')).toBeUndefined()
  })

  // Segunda via existe: um aluno pode ter dois crachás. O que não pode é um
  // crachá ter dois donos — e isso a chave primária garante.
  it('permite dois crachás para o mesmo nome', async () => {
    await repo.gravarVinculo({ ...paulo, uidHash: 'aaaa', papel: 'aluno', nome: 'Ana Souza' })
    await repo.gravarVinculo({ ...paulo, uidHash: 'bbbb', papel: 'aluno', nome: 'Ana Souza' })
    expect(await repo.listarVinculos()).toHaveLength(2)
  })

  it('zera sem levar junto os eventos', async () => {
    await repo.gravarVinculo(paulo)
    await repo.acrescentarEvento(evento())
    await repo.zerarVinculos()
    expect(await repo.listarVinculos()).toHaveLength(0)
    expect(await repo.contarEventos()).toBe(1)
  })
})

describe('grade', () => {
  it('grava e lista ordenado por dia', async () => {
    await repo.gravarAula({
      uidHashProfessor: '9bb18ff5da8824b2',
      dia: 3,
      inicio: '08:00',
      fim: '10:00',
      turma: 'IF685 · T01',
    })
    await repo.gravarAula({
      uidHashProfessor: '9bb18ff5da8824b2',
      dia: 1,
      inicio: '10:00',
      fim: '12:00',
      turma: 'IF669 · T02',
    })
    expect((await repo.listarAulas()).map((a) => a.dia)).toEqual([1, 3])
  })
})

describe('listas de turma', () => {
  const pessoa = (login: string, nome: string, turma = 'IF685 · T01') => ({
    turma,
    login,
    nomeCompleto: `${nome} DA SILVA`,
    nome,
    papel: 'aluno' as const,
  })

  it('guarda e lê por turma', async () => {
    await repo.salvarTurma('IF685 · T01', [pessoa('ana.m', 'Ana Maria'), pessoa('bia.s', 'Bia Souza')])
    await repo.salvarTurma('IF669 · T02', [pessoa('caio.l', 'Caio Lima', 'IF669 · T02')])
    expect(await repo.listarMatriculados('IF685 · T01')).toHaveLength(2)
    expect(await repo.listarTurmas()).toEqual(['IF669 · T02', 'IF685 · T01'])
  })

  // Reimportar a página do SIGAA depois de alguém trancar tem que corrigir a
  // lista, não somar uma cópia dela.
  it('reimportar substitui a turma inteira', async () => {
    await repo.salvarTurma('IF685 · T01', [pessoa('ana.m', 'Ana Maria'), pessoa('bia.s', 'Bia Souza')])
    await repo.salvarTurma('IF685 · T01', [pessoa('ana.m', 'Ana Maria')])
    expect(await repo.listarMatriculados('IF685 · T01')).toHaveLength(1)
  })

  it('não deixa uma turma apagar a outra', async () => {
    await repo.salvarTurma('IF685 · T01', [pessoa('ana.m', 'Ana Maria')])
    await repo.salvarTurma('IF669 · T02', [pessoa('caio.l', 'Caio Lima', 'IF669 · T02')])
    await repo.zerarTurma('IF685 · T01')
    expect(await repo.listarMatriculados()).toHaveLength(1)
  })

  // A mesma pessoa em duas turmas é uma pessoa, não duas — e o crachá dela é o
  // mesmo. Por isso a chave é [turma+login], não login.
  it('aceita a mesma pessoa em duas turmas', async () => {
    await repo.salvarTurma('IF685 · T01', [pessoa('ana.m', 'Ana Maria')])
    await repo.salvarTurma('IF669 · T02', [pessoa('ana.m', 'Ana Maria', 'IF669 · T02')])
    expect(await repo.listarMatriculados()).toHaveLength(2)
  })
})

describe('login no vínculo', () => {
  it('guarda o login junto do crachá', async () => {
    await repo.gravarVinculo({
      uidHash: '9bb18ff5da8824b2',
      papel: 'aluno',
      nome: 'Willian Neves',
      login: 'wnrj',
      criadoEm: '2026-08-18T10:00:00.000Z',
    })
    expect((await repo.vinculoPorHash('9bb18ff5da8824b2'))?.login).toBe('wnrj')
  })
})

describe('listar tudo', () => {
  // Passar um número enorme como limite não é o mesmo que não limitar: o cursor
  // do IndexedDB rejeita acima de 2³²−1, e a tela fica vazia sem erro à vista.
  it('sem limite devolve tudo, sem estourar o cursor', async () => {
    for (let i = 0; i < 60; i++) {
      await repo.acrescentarEvento(evento({ eventoId: `web-a1b2-20260818-${String(i).padStart(4, '0')}` }))
    }
    expect(await repo.listarEventos()).toHaveLength(60)
  })
})
