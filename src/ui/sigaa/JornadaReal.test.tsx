// A v2 de ponta a ponta sobre a planilha real de CIN0114 (anonimizada): a
// página com a estrutura do `docs/12`, o localizador de verdade, o favorito e
// a folha conversando por mensagens, e o "gravar" pela coleta da página.
// Conferir → preencher → gravar → conferir dá tudo confere; as vazias das aulas
// já lançadas (quem entrou depois) ficam como estão, e são ditas.

import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import { LOCALIZADOR_SIGAA } from '../../favorito/localizadorSigaa.ts'
import { criarPaginaSigaa } from '../../favorito/paginaSigaa.ts'
import { cenarioDaBancada } from '../../testes/cenarioDaBancada.ts'
import { clicarNoFavorito } from '../../testes/duasJanelas.tsx'
import { coletarComoOSigaa, montarPaginaDaPlanilha } from '../../testes/paginaDaPlanilha.ts'
import { PLANILHA_CIN0114, type PlanilhaCapturada } from '../../testes/planilhaReal.ts'

/** O dia da captura, de noite: as aulas até 29/09 já aconteceram. */
const AGORA = new Date('2026-09-29T20:00:00')
const ESPERA = { timeout: 5000 }

afterEach(() => window.localStorage.removeItem('adsum.modoDev'))

/** O servidor depois do Gravar: guarda a coleta e marca como lançada a aula que ganhou valor. */
function depoisDoGravar(p: PlanilhaCapturada, coleta: string): PlanilhaCapturada {
  const registros = coleta.split(';').map((r) => r.split(','))
  const aulas = p.auxAulas.split(';').map((a) => {
    const campos = a.split(',')
    if (registros.some((r) => r[3] === campos[0] && r[4] === campos[1] && r[5] !== 'null')) campos[4] = 'true'
    return campos.join(',')
  })
  return { ...p, auxAulas: aulas.join(';'), auxAlunos: coleta }
}

describe('lançar no SIGAA sobre a planilha real de CIN0114', () => {
  it('preenche só as três aulas não lançadas, deixa as vazias das lançadas, e no fim tudo confere', async () => {
    window.localStorage.setItem('adsum.modoDev', 'sim')
    const usuario = userEvent.setup()
    const repositorio = new RepositorioDexie(`adsum-jornada-real-${Date.now()}`)
    await repositorio.abrir()
    const cenario = cenarioDaBancada(PLANILHA_CIN0114, AGORA)
    await repositorio.salvarTurma(cenario.turma, cenario.matriculados)
    for (const e of cenario.eventos) await repositorio.acrescentarEvento(e)

    // 1. A planilha como o professor a abre, e o favorito.
    montarPaginaDaPlanilha(document, PLANILHA_CIN0114)
    const antes = (document.getElementById('form:frequencias') as HTMLInputElement).value
    const pagina = criarPaginaSigaa(document, LOCALIZADOR_SIGAA)
    const primeira = clicarNoFavorito(repositorio, pagina, AGORA)
    expect(await screen.findByRole('heading', { name: '3 aulas para lançar' }, ESPERA)).toBeInTheDocument()
    expect(screen.getByText(/60 vazias em aulas já lançadas/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Preencher 3 aulas' }))
    await waitFor(() => expect(document.querySelector('[data-adsum="barra"]')?.textContent).toMatch(/^Adsum preencheu 3 aulas\./), ESPERA)
    await act(async () => primeira.fechar())

    // 2. O que a coleta da página levaria: 45 alunos × 3 aulas, e nada fora delas.
    const coleta = coletarComoOSigaa(document)
    const mudaram = coleta.split(';').map((r, i) => [r, antes.split(';')[i]] as const).filter(([a, b]) => a !== b).map(([a]) => a.split(','))
    expect(mudaram).toHaveLength(135)
    expect(new Set(mudaram.map((r) => `${r[3]}/${r[4]}`))).toEqual(new Set(['1/9', '3/9', '29/9']))
    expect(mudaram.every((r) => r[5] === '0' || r[5] === '2')).toBe(true)

    // 3. Gravado, o favorito de novo: tudo confere nas 15 aulas, e as vazias continuam ditas.
    montarPaginaDaPlanilha(document, depoisDoGravar(PLANILHA_CIN0114, coleta))
    const segunda = clicarNoFavorito(repositorio, criarPaginaSigaa(document, LOCALIZADOR_SIGAA), AGORA)
    expect(await screen.findByRole('heading', { name: 'Tudo confere' }, ESPERA)).toBeInTheDocument()
    expect(screen.getByText('SIGAA e Adsum iguais em 15 aulas.')).toBeInTheDocument()
    expect(screen.getByText(/60 vazias em aulas já lançadas/)).toBeInTheDocument()

    await act(async () => segunda.fechar())
    await act(async () => repositorio.fechar())
  }, 30_000)
})
