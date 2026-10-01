// A auditoria do SIGAA na pasta: a pasta é a dona, a base é o cache.

import { describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { comoDia, type LinhaDeAuditoria } from '../nucleo/lancar/tipos.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { escrever, ler } from './pasta.ts'
import { caminhoDaAuditoriaSigaa, sincronizar } from './sincronia.ts'
import { conferirAuditoriaSigaa } from './auditoriaSigaaNaPasta.ts'
import { restaurar, restaurarDeArquivos } from './restauracao.ts'

const TURMA = 'CIN0144 · T01'
const TER = comoDia('2026-10-13')!
const linha = (acao: LinhaDeAuditoria['acao'], quando: string, parcial: Partial<LinhaDeAuditoria> = {}): LinhaDeAuditoria => ({
  turma: TURMA,
  quando,
  acao,
  versaoSigaa: '4.15.0.206',
  dia: TER,
  matricula: '20260000001',
  lido: '',
  proposto: '2',
  aplicado: '2',
  ...parcial,
})
const PREENCHEU = linha('preenchimento', '2026-10-20T13:00:00.000Z')
const ACEITOU = linha('aceite', '2026-10-20T13:05:00.000Z', { lido: '1', proposto: '0', aplicado: '1' })

let n = 0
async function base() {
  const repo = new RepositorioDexie(`adsum-auditoria-${n++}`)
  await repo.abrir()
  await repo.salvarTurma(TURMA, [
    { turma: TURMA, chave: '20260000001', matricula: '20260000001', nome: 'Ana Clara', nomeCompleto: 'ANA CLARA INVENTADA', papel: 'aluno' },
  ])
  return repo
}

describe('a auditoria do SIGAA vai para a pasta', () => {
  it('só acrescenta o que falta, e conferir de novo não duplica', async () => {
    const repo = await base()
    const { handle } = criarPastaFalsa()
    await repo.acrescentarAuditoriaSigaa([PREENCHEU])
    await conferirAuditoriaSigaa(repo, handle)
    await repo.acrescentarAuditoriaSigaa([ACEITOU])
    await conferirAuditoriaSigaa(repo, handle)
    await conferirAuditoriaSigaa(repo, handle)
    const texto = (await ler(handle, caminhoDaAuditoriaSigaa(TURMA)))!
    expect(texto.startsWith('﻿quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado\n')).toBe(true)
    expect(texto.trim().split('\n')).toHaveLength(3)
    expect(texto).not.toMatch(/Ana|ANA/)
  })

  it('turma sem auditoria não ganha arquivo', async () => {
    const repo = await base()
    const pasta = criarPastaFalsa()
    await conferirAuditoriaSigaa(repo, pasta.handle)
    expect(pasta.raiz.pastas.has('sigaa')).toBe(false)
  })

  it('linha que só a pasta tem entra na base, e o aceite volta a ser ajuste, uma vez só', async () => {
    const origem = await base()
    const { handle } = criarPastaFalsa()
    await origem.acrescentarAuditoriaSigaa([PREENCHEU, ACEITOU])
    await conferirAuditoriaSigaa(origem, handle)

    const outra = await base()
    const r1 = await conferirAuditoriaSigaa(outra, handle)
    await conferirAuditoriaSigaa(outra, handle)
    expect(r1).toEqual({ conferidas: [{ turma: TURMA, trazidas: 2, levadas: 0 }], problemas: [] })
    expect(await outra.listarAuditoriaSigaa(TURMA)).toEqual([PREENCHEU, ACEITOU])
    expect(await outra.lerAjustesSigaa(TURMA)).toEqual([{ turma: TURMA, dia: TER, matricula: '20260000001', valor: 1, em: ACEITOU.quando }])
  })

  it('arquivo de turma que a base não conhece é problema dito, não linha perdida calada', async () => {
    const repo = await base()
    const { handle } = criarPastaFalsa()
    await escrever(handle, 'sigaa/CIN9999-T09.csv', '﻿quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado\n')
    const r = await conferirAuditoriaSigaa(repo, handle)
    expect(r.problemas).toEqual([expect.stringMatching(/CIN9999-T09\.csv.*turma/)])
  })

  it('o que não é do Adsum na pasta sigaa fica onde está, sem virar problema', async () => {
    const repo = await base()
    const { handle } = criarPastaFalsa()
    await escrever(handle, 'sigaa/o que lancei.txt', 'lancei até 15/10\n')
    await escrever(handle, 'sigaa/._CIN0144-T01.csv', '\u0000\u0005\u0016\u0007')
    const r = await conferirAuditoriaSigaa(repo, handle)
    expect(r.problemas).toEqual([])
    expect(await ler(handle, 'sigaa/o que lancei.txt')).toBe('lancei até 15/10\n')
  })
})

describe('a pasta é a dona: esvaziar a base e restaurar traz tudo de volta', () => {
  it('pelo seletor de diretório', async () => {
    const repo = await base()
    const { handle } = criarPastaFalsa()
    await repo.acrescentarAuditoriaSigaa([PREENCHEU, ACEITOU])
    await repo.gravarAjusteSigaa({ turma: TURMA, dia: TER, matricula: '20260000001', valor: 1, em: ACEITOU.quando })
    await sincronizar(repo, handle)
    await conferirAuditoriaSigaa(repo, handle)

    await repo.esvaziarCache()
    expect(await repo.lerAjustesSigaa()).toEqual([])
    expect(await repo.listarAuditoriaSigaa(TURMA)).toEqual([])

    await restaurar(repo, handle)
    expect(await repo.listarAuditoriaSigaa(TURMA)).toEqual([PREENCHEU, ACEITOU])
    expect(await repo.lerAjustesSigaa(TURMA)).toEqual([{ turma: TURMA, dia: TER, matricula: '20260000001', valor: 1, em: ACEITOU.quando }])
  })

  it('pelos arquivos soltos do Safari e do Firefox', async () => {
    const repo = await base()
    const pasta = criarPastaFalsa()
    await repo.acrescentarAuditoriaSigaa([PREENCHEU, ACEITOU])
    await sincronizar(repo, pasta.handle)
    await conferirAuditoriaSigaa(repo, pasta.handle)

    const arquivos: File[] = []
    const juntar = (no: typeof pasta.raiz, caminho: string) => {
      for (const [name, texto] of no.arquivos) arquivos.push({ name, webkitRelativePath: `${caminho}/${name}`, text: async () => texto } as File)
      for (const [nome, filho] of no.pastas) juntar(filho, `${caminho}/${nome}`)
    }
    juntar(pasta.raiz, 'Adsum')

    const safari = new RepositorioDexie(`adsum-auditoria-${n++}`)
    await safari.abrir()
    const resumo = await restaurarDeArquivos(safari, arquivos)
    expect(resumo.problemas).toEqual([])
    expect(await safari.listarAuditoriaSigaa(TURMA)).toEqual([PREENCHEU, ACEITOU])
    expect(await safari.lerAjustesSigaa(TURMA)).toHaveLength(1)
  })
})
