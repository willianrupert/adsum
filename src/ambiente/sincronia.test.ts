import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { acrescentarNoLog, restaurar, sincronizar } from './sincronia.ts'

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
  it('grava o cadastro com os nomes do desenho', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])

    const { arquivos } = await sincronizar(repo, handle)
    expect(arquivos).toEqual([
      'config.json',
      'vinculos.json',
      'grade.json',
      'turmas/IF685-T01.json',
    ])
  })

  // O log não entra na sincronização do cadastro: ele cresce por append, um
  // evento por vez. Regravá-lo a cada crachá seria trabalho crescente por
  // leitura — e, com a pasta sincronizada, apagaria a aula da outra máquina.
  it('o log cresce por append, e o cabeçalho vai uma vez só', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'web-a1b2-20260818-0002' })

    const texto = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    // `trim()` come o BOM — ele é espaço em branco para o JavaScript. Por isso
    // a checagem do BOM é no texto cru.
    expect(texto.startsWith('\ufeff')).toBe(true)
    const linhas = texto.trim().split('\n')
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toMatch(/^evento_id;/)
    expect(linhas[1]).toContain('20260818-0001')
    expect(linhas[2]).toContain('20260818-0002')
  })

  it('acrescentar nunca reescreve o que já estava lá', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    const antes = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'outro' })
    const depois = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    expect(depois.startsWith(antes)).toBe(true)
  })

  it('cada turma tem seu próprio arquivo', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'b', turma: 'IF669 · T02' })
    expect([...raiz.pastas.get('registros')!.arquivos.keys()].sort()).toEqual([
      'IF669-T02.csv',
      'IF685-T01.csv',
    ])
  })

  // O teste de que a inversão aconteceu de fato: jogar fora o IndexedDB inteiro
  // e reconstruí-lo lendo a pasta. Se isto falhar, a pasta virou só backup e o
  // professor continua podendo perder tudo.
  it('reconstrói a base inteira depois de o cache ser apagado', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
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
    await acrescentarNoLog(handle, EVENTO)
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
