// Quem falta cadastrar, por turma — a pergunta que antes só se respondia
// abrindo a chamada daquela turma. Com a sessão sendo única no app inteiro
// (ver `Fluxo.test.tsx`, "duas turmas se encavalam no horário"), abrir uma só
// para espiar quem falta podia custar fechar outra por engano; este painel é
// leitura, sem abrir nada.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import type { Matriculado } from '../nucleo/tipos.ts'
import * as arquivos from '../ambiente/arquivos.ts'
import { MANUAL_URL } from '../nucleo/cofre.ts'

let bancada: Bancada

const pessoa = (turma: string, matricula: string, nome: string): Matriculado => ({
  turma,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

beforeEach(async () => {
  bancada = await montarBancada()
})

describe('quem falta cadastrar, por turma', () => {
  it('mostra a contagem certa de cada turma, sem misturar uma com a outra', async () => {
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      pessoa('IF685 · T01', '1', 'Ana'),
      pessoa('IF685 · T01', '2', 'Beto'),
    ])
    await bancada.repositorio.salvarTurma('IF969 · T02', [pessoa('IF969 · T02', '3', 'Caio')])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa',
      papel: 'aluno',
      nome: 'Ana',
      matricula: '1',
      criadoEm: new Date().toISOString(),
    })

    renderizarCom(bancada, <TelaRepositorio />)

    // Não busca "IF685 · T01" sozinho: com duas turmas, o seletor da Grade
    // horária (recolhido, mas sempre montado — ver `Painel.tsx`) usa o mesmo
    // nome como texto de botão, e isso ambiguaria a busca. A contagem já
    // prova a associação certa: só a turma de 2 pode dizer "1 de 2".
    expect(await screen.findByText('1 de 2 sem crachá')).toBeInTheDocument()
    expect(await screen.findByText('1 de 1 sem crachá')).toBeInTheDocument()
  })

  it('com todo mundo vinculado, diz que a turma está completa', async () => {
    await bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('IF685 · T01', '1', 'Ana')])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa',
      papel: 'aluno',
      nome: 'Ana',
      matricula: '1',
      criadoEm: new Date().toISOString(),
    })

    renderizarCom(bancada, <TelaRepositorio />)

    expect(await screen.findByText('1 de 1 com crachá')).toBeInTheDocument()
  })

  it('sem turma nenhuma, não mostra o painel', async () => {
    renderizarCom(bancada, <TelaRepositorio />)

    await screen.findByText('Registros')
    expect(screen.queryByText('Quem falta cadastrar, por turma')).not.toBeInTheDocument()
  })
})

// Pedido do Prof. Paulo, para a v1: nome completo por linha, um dia por
// coluna, e na célula quantas faltas aquele dia vale.
describe('exportar faltas', () => {
  it('zero pra quem encostou, os períodos do bloco pra quem faltou', async () => {
    const usuario = userEvent.setup()
    const salvarTexto = vi.spyOn(arquivos, 'salvarTexto').mockResolvedValue('baixado')

    const ana = { turma: 'IF685 · T01', chave: '1', matricula: '1', nome: 'Ana', nomeCompleto: 'ANA PAULA MENDES', papel: 'aluno' as const }
    const breno = { turma: 'IF685 · T01', chave: '2', matricula: '2', nome: 'Breno', nomeCompleto: 'BRENO OLIVEIRA', papel: 'aluno' as const }
    await bancada.repositorio.salvarTurma('IF685 · T01', [ana, breno])
    // Segunda-feira, bloco de duas aulas: 08:00 às 09:50.
    await bancada.repositorio.definirHorarioDaTurma('IF685 · T01', [
      { uidHashProfessor: 'prof', dia: 1, inicio: '08:00', fim: '09:50', turma: 'IF685 · T01' },
    ])
    await bancada.repositorio.acrescentarEvento({
      eventoId: 'web-a1-20260817-0001',
      quando: '2026-08-17T08:00:00.000Z',
      turma: 'IF685 · T01',
      nome: '',
      origem: 'professor',
      resultado: 'ok',
      uidHash: 'prof',
    })
    await bancada.repositorio.acrescentarEvento({
      eventoId: 'web-a1-20260817-0002',
      quando: '2026-08-17T08:05:00.000Z',
      turma: 'IF685 · T01',
      matricula: '1',
      nome: 'Ana',
      origem: 'cracha',
      resultado: 'ok',
      uidHash: '1',
    })

    renderizarCom(bancada, <TelaRepositorio />)
    await usuario.click(await screen.findByRole('button', { name: /Registros/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Exportar faltas' }))

    await waitFor(() => expect(salvarTexto).toHaveBeenCalled())
    const [nomeArquivo, conteudo] = salvarTexto.mock.calls[0]
    expect(nomeArquivo).toBe('faltas-IF685-T01.csv')
    const linhas = conteudo.replace(/^﻿/, '').split('\n')
    expect(linhas[0]).toBe('nome;17/08/2026')
    expect(linhas).toContain('ANA PAULA MENDES;0')
    expect(linhas).toContain('BRENO OLIVEIRA;2')
  })
})

describe('ver presenças', () => {
  it('sem aoVerPresencas, não existe o link', async () => {
    renderizarCom(bancada, <TelaRepositorio />)
    expect(screen.queryByRole('button', { name: 'Ver presenças' })).not.toBeInTheDocument()
  })

  it('com aoVerPresencas, o link chama de volta', async () => {
    const usuario = userEvent.setup()
    const aoVerPresencas = vi.fn()
    renderizarCom(bancada, <TelaRepositorio aoVerPresencas={aoVerPresencas} />)

    await usuario.click(await screen.findByRole('button', { name: /Ver presenças/ }))
    expect(aoVerPresencas).toHaveBeenCalled()
  })
})

// Regressão: um vínculo sintético (criado por "Começar a chamada", sem
// crachá nenhum) tinha o mesmo formato de `uid_hash` que um de verdade — a
// leitura era "encostei um crachá e ele tá aqui", quando ninguém encostou
// nada. Ver o comentário em `Vinculo.sintetico`, em `nucleo/tipos.ts`.
describe('vínculo sintético', () => {
  it('mostra "sem crachá — pelo botão" no lugar do uid_hash', async () => {
    const usuario = userEvent.setup()
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa1111bbbb2222',
      papel: 'professor',
      nome: 'Paulo Araújo',
      criadoEm: new Date().toISOString(),
      sintetico: true,
    })

    renderizarCom(bancada, <TelaRepositorio />)
    await usuario.click(await screen.findByRole('button', { name: /Vínculos/ }))

    expect(await screen.findByText('sem crachá — pelo botão')).toBeInTheDocument()
    expect(screen.queryByText('aaaa1111bbbb2222')).not.toBeInTheDocument()
  })

  it('não conta como crachá no resumo — só quem foi lido de verdade', async () => {
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa1111bbbb2222',
      papel: 'professor',
      nome: 'Paulo Araújo',
      criadoEm: new Date().toISOString(),
      sintetico: true,
    })
    await bancada.repositorio.gravarVinculo({
      uidHash: 'ccccddddeeeeffff',
      papel: 'aluno',
      nome: 'Bruno Cardoso',
      matricula: '1',
      criadoEm: new Date().toISOString(),
    })

    renderizarCom(bancada, <TelaRepositorio />)

    expect(await screen.findByText('1 crachá')).toBeInTheDocument()
  })
})

// O único botão do Adsum que fala com a internet: o manual vive no GitHub,
// não dentro do app. `fetch` é mockado aqui de propósito — não é porta do
// Adsum, é infraestrutura de terceiro, e não tem "adaptador de verdade"
// nenhum pra testar contra (a suíte não bate no GitHub de verdade).
describe('manual e LGPD', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('busca do GitHub e oferece pra salvar', async () => {
    const usuario = userEvent.setup()
    const blobDeMentira = new Blob(['conteúdo de mentira'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blobDeMentira }))
    const salvarBinario = vi.spyOn(arquivos, 'salvarBinario').mockResolvedValue('gravado')

    renderizarCom(bancada, <TelaRepositorio />)
    await usuario.click(await screen.findByRole('button', { name: 'Manual e LGPD' }))

    await waitFor(() => expect(salvarBinario).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith(MANUAL_URL)
    const [nomeArquivo, dados] = salvarBinario.mock.calls[0]
    expect(nomeArquivo).toBe('Adsum-manual-e-LGPD.docx')
    expect(dados).toBe(blobDeMentira)
    expect(await screen.findByText(/Manual gravado/)).toBeInTheDocument()
  })

  // Arquivo movido, repositório renomeado, ou simplesmente sem internet — a
  // tela não pode deixar o professor com um botão que "não faz nada". O
  // link cru é a saída manual enquanto ninguém conserta a constante.
  it('sem internet, ou arquivo mudou de lugar, mostra o link pra baixar na mão', async () => {
    const usuario = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    renderizarCom(bancada, <TelaRepositorio />)
    await usuario.click(await screen.findByRole('button', { name: 'Manual e LGPD' }))

    expect(await screen.findByText((texto) => texto.includes(MANUAL_URL))).toBeInTheDocument()
  })
})
