// Dexie v9: o que a v2 guarda (ajustes e auditoria do SIGAA), sobre uma base
// v8 que já tem histórico. Quem abriu o site tem a v8 no navegador.

import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { comoDia, type AjusteSigaa, type LinhaDeAuditoria } from '../../nucleo/lancar/tipos.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { RepositorioDexie } from './RepositorioDexie.ts'

let n = 0
const TURMA = 'CIN0144 · T01'
const TER = comoDia('2026-10-13')!

/** Uma base como a v8 publicada a deixa, com config, vínculo e eventos. */
async function baseV8(nome: string) {
  const v8 = new Dexie(nome)
  v8.version(8).stores({
    config: 'id',
    vinculos: 'uidHash, papel, nome, matricula',
    participantes: '[turma+chave], turma, chave, nome',
    aulas: '++id, uidHashProfessor, dia',
    eventos: 'eventoId, quando, turma, uidHash',
    sessao: 'id',
    pasta: 'id',
  })
  await v8.open()
  await v8.table('config').put({ id: 1, salHex: 'ab'.repeat(16), instalacaoId: 'web-v8', criadoEm: '2026-08-01T00:00:00Z', proximaSequencia: 42 })
  await v8.table('vinculos').put({ uidHash: '1234567890abcdef', papel: 'aluno', nome: 'Ana Clara', matricula: '20260000001', criadoEm: '2026-08-01T00:00:00Z' })
  await v8.table('eventos').bulkPut([
    { eventoId: 'web-v8-20260929-40', quando: '2026-09-29T13:00:00Z', turma: TURMA, uidHash: 'prof', nome: '', origem: 'professor', resultado: 'ok' },
    { eventoId: 'web-v8-20260929-41', quando: '2026-09-29T13:01:00Z', turma: TURMA, uidHash: '1234567890abcdef', matricula: '20260000001', nome: 'Ana Clara', origem: 'cracha', resultado: 'ok' },
  ])
  v8.close()
}

const ajuste = (valor: number, em: string, turma = TURMA): AjusteSigaa => ({ turma, dia: TER, matricula: '20260000001', valor, em })
const linha = (acao: LinhaDeAuditoria['acao'], turma = TURMA): LinhaDeAuditoria => ({
  turma,
  quando: '2026-10-20T10:00:00.000Z',
  acao,
  versaoSigaa: '4.15.0.206',
  dia: TER,
  matricula: '20260000001',
  lido: '',
  proposto: '0',
  aplicado: '0',
})

describe('Dexie v9, sobre a v8 publicada', () => {
  it('abre a base v8 sem perder nada, e as tabelas novas nascem vazias', async () => {
    const nome = `adsum-v8-${n++}`
    await baseV8(nome)
    const repo = new RepositorioDexie(nome)
    await repo.abrir()
    expect((await repo.diagnostico()).versao).toBe(9)
    expect((await repo.lerConfig()).instalacaoId).toBe('web-v8')
    expect(await repo.reservarSequencia()).toBe(42)
    expect(await repo.listarEventos({ turma: TURMA })).toHaveLength(2)
    expect(await repo.vinculoPorHash('1234567890abcdef')).toMatchObject({ nome: 'Ana Clara' })
    expect(await repo.lerAjustesSigaa(TURMA)).toEqual([])
    expect(await repo.listarAuditoriaSigaa(TURMA)).toEqual([])
    await repo.fechar()
  })
})

describe('ajustes e auditoria: só acréscimo', () => {
  async function novo() {
    const repo = new RepositorioDexie(`adsum-sigaa-${n++}`)
    await repo.abrir()
    return repo
  }

  it('dois ajustes da mesma célula ficam os dois, na ordem em que vieram', async () => {
    const repo = await novo()
    await repo.gravarAjusteSigaa(ajuste(2, '2026-10-20T10:00:00.000Z'))
    await repo.gravarAjusteSigaa(ajuste(0, '2026-10-21T10:00:00.000Z'))
    await repo.gravarAjusteSigaa(ajuste(1, '2026-10-21T10:00:00.000Z', 'CIN0144 · T02'))
    expect(await repo.lerAjustesSigaa(TURMA)).toEqual([ajuste(2, '2026-10-20T10:00:00.000Z'), ajuste(0, '2026-10-21T10:00:00.000Z')])
    expect(await repo.lerAjustesSigaa()).toHaveLength(3)
  })

  it('a auditoria guarda cada linha, por turma, na ordem', async () => {
    const repo = await novo()
    await repo.acrescentarAuditoriaSigaa([linha('conferencia'), linha('preenchimento')])
    await repo.acrescentarAuditoriaSigaa([linha('conferencia', 'CIN0114 · T01')])
    expect((await repo.listarAuditoriaSigaa(TURMA)).map((l) => l.acao)).toEqual(['conferencia', 'preenchimento'])
    expect(await repo.listarAuditoriaSigaa('CIN0114 · T01')).toEqual([linha('conferencia', 'CIN0114 · T01')])
  })

  it('não há como reescrever nem apagar um ajuste ou uma linha de auditoria', () => {
    const repo = {} as Repositorio
    // @ts-expect-error a porta não tem atualizar
    void repo.atualizarAjusteSigaa
    // @ts-expect-error a porta não tem remover
    void repo.removerAjusteSigaa
    // @ts-expect-error a porta não tem remover
    void repo.removerAuditoriaSigaa
    expect(true).toBe(true)
  })
})
