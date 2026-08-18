import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { restaurar, sincronizar } from './sincronia.ts'

let n = 0
let repo: RepositorioDexie

const VINCULO = {
  uidHash: '309940e145b847cf',
  papel: 'aluno' as const,
  nome: 'Willian Neves',
  login: 'wnrj',
  criadoEm: '2026-08-18T10:00:00.000Z',
}
const PESSOA = {
  turma: 'IF685 · T01',
  login: 'wnrj',
  nomeCompleto: 'WILLIAN NEVES RUPERT JONES',
  nome: 'Willian Neves',
  papel: 'aluno' as const,
}
const EVENTO = {
  eventoId: 'web-a1b2-20260818-0001',
  quando: '2026-08-18T10:06:00.000Z',
  turma: 'IF685 · T01',
  login: 'wnrj',
  nome: 'Willian Neves',
  origem: 'cracha' as const,
  resultado: 'ok' as const,
  uidHash: '309940e145b847cf',
}

beforeEach(async () => {
  repo = new RepositorioDexie(`adsum-cofre-${n++}`)
  await repo.abrir()
})

describe('cofre em pasta', () => {
  it('grava os arquivos com os nomes do desenho', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])
    await repo.acrescentarEvento(EVENTO)

    const { arquivos } = await sincronizar(repo, handle)
    expect(arquivos).toContain('config.json')
    expect(arquivos).toContain('vinculos.json')
    expect(arquivos).toContain('turmas/IF685-T01.json')
    expect(arquivos).toContain('registros/IF685-T01.csv')
  })

  // O teste de que a inversão aconteceu de fato: jogar fora o IndexedDB inteiro
  // e reconstruí-lo lendo a pasta. Se isto falhar, a pasta virou só backup e o
  // professor continua podendo perder tudo.
  it('reconstrói a base inteira depois de o cache ser apagado', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])
    await repo.acrescentarEvento(EVENTO)
    await repo.gravarAula({
      uidHashProfessor: VINCULO.uidHash,
      dia: 3,
      inicio: '08:00',
      fim: '10:00',
      turma: 'IF685 · T01',
    })
    await sincronizar(repo, handle)

    await repo.esvaziarCache()
    expect(await repo.listarVinculos()).toHaveLength(0)

    const { problemas } = await restaurar(repo, handle)
    expect(problemas).toEqual([])
    expect(await repo.listarVinculos()).toEqual([VINCULO])
    expect(await repo.listarMatriculados('IF685 · T01')).toEqual([PESSOA])
    expect(await repo.listarAulas()).toHaveLength(1)
    expect(await repo.contarEventos()).toBe(1)
  })

  it('restaurar duas vezes não duplica evento', async () => {
    const { handle } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await sincronizar(repo, handle)
    await repo.esvaziarCache()
    await restaurar(repo, handle)
    await restaurar(repo, handle)
    expect(await repo.contarEventos()).toBe(1)
  })

  it('pasta vazia não é erro — é primeira vez', async () => {
    const { handle } = criarPastaFalsa()
    const { arquivos, problemas } = await restaurar(repo, handle)
    expect(arquivos).toEqual([])
    expect(problemas).toEqual([])
  })
})
