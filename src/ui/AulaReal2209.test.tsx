// A aula de 22/09/2026, sobre a base que o professor tinha de verdade.
//
// `Incidente2209.test.tsx` prova cada defeito com uma base montada à mão para
// ele. Este arquivo roda sobre o cofre real anonimizado (`testes/cofres/`):
// duas turmas, duas instalações, uma reinstalação, e as linhas de `evento_id`
// repetido que a aula deixou. Se um conserto só funcionar na base limpa, é
// aqui que ele falha. Rodado contra a versão que estava no ar naquela manhã,
// a chamada abaixo trava nos primeiros crachás, como travou na sala.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor, screen } from '@testing-library/react'
import { montarBancada, renderizarCom } from '../testes/montar.tsx'
import { baterCrachasEmSequencia, gerarBaralho } from '../testes/simular.ts'
import { AULA_2209, pastaDoCofre } from '../testes/cofreDeTeste.ts'
import { conferirLog, restaurar, sincronizar } from '../ambiente/sincronia.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { planilhaDeFaltas } from '../nucleo/faltas.ts'
import { identificarCracha } from '../portas/Repositorio.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { TelaAula } from './TelaAula.tsx'

const [TURMA_A, TURMA_B] = Object.keys(AULA_2209.turmas).sort()
const LINHAS = Object.values(AULA_2209.registros).reduce((n, l) => n + l.length, 0)

/** Quantas pessoas a planilha de faltas dá como presentes naquele dia. */
async function presentesNoDia(repositorio: Repositorio, turma: string, dia: string) {
  const [eventos, matriculados, aulas] = await Promise.all([
    repositorio.listarEventos(),
    repositorio.listarMatriculados(turma),
    repositorio.listarAulas(),
  ])
  return planilhaDeFaltas(eventos, matriculados, aulas, turma).linhas.filter(
    (l) => l.porDia.get(dia)?.faltas === 0,
  ).length
}

/**
 * A base como estava no computador do professor depois da aula: restaurada
 * pelo caminho antigo, que recusava calado toda linha de id repetido.
 */
async function baseComoEstava() {
  const bancada = await montarBancada()
  const { handle } = await pastaDoCofre(AULA_2209)
  for (const turma of Object.keys(AULA_2209.turmas)) {
    await bancada.repositorio.salvarTurma(turma, AULA_2209.turmas[turma])
  }
  for (const v of AULA_2209.vinculos) await bancada.repositorio.gravarVinculo(v)
  for (const a of AULA_2209.grade) await bancada.repositorio.gravarAula({ ...a, id: undefined })
  await bancada.repositorio.definirSal(AULA_2209.config.salHex)
  await bancada.repositorio.definirInstalacaoId(AULA_2209.config.instalacaoId)
  for (const eventos of Object.values(AULA_2209.registros)) {
    for (const e of eventos) await bancada.repositorio.acrescentarEvento(e)
  }
  bancada.config = await bancada.repositorio.lerConfig()
  return { bancada, handle }
}

afterEach(() => vi.useRealTimers())

describe('o cofre da aula de 22/09', () => {
  it('restaurado numa base vazia, cada linha dos dois logs entra', async () => {
    const { repositorio } = await montarBancada()
    const { handle } = await pastaDoCofre(AULA_2209)
    const { problemas } = await restaurar(repositorio, handle)

    expect(problemas).toEqual([])
    expect(await repositorio.contarEventos()).toBe(LINHAS)
    expect((await repositorio.lerConfig()).salHex).toBe(AULA_2209.config.salHex)
    expect(await repositorio.listarVinculos()).toHaveLength(AULA_2209.vinculos.length)
    for (const c of await conferirLog(repositorio, handle)) {
      expect(c).toMatchObject({ trazidos: 0, acrescentados: 0 })
    }
  })

  it('a base que tinha perdido presenças as recupera ao ligar a pasta', async () => {
    const { bancada, handle } = await baseComoEstava()
    const perdidas = LINHAS - (await bancada.repositorio.contarEventos())
    expect(perdidas).toBeGreaterThan(0) // é o estado real: linhas que a base recusou

    const antesB = await presentesNoDia(bancada.repositorio, TURMA_B, '2026-09-22')
    const antesA = await presentesNoDia(bancada.repositorio, TURMA_A, '2026-09-17')
    const conferencia = await conferirLog(bancada.repositorio, handle)

    expect(conferencia.reduce((n, c) => n + c.trazidos, 0)).toBe(perdidas)
    expect(await bancada.repositorio.contarEventos()).toBe(LINHAS)
    // As presenças que só existiam na planilha voltam a contar.
    expect(await presentesNoDia(bancada.repositorio, TURMA_B, '2026-09-22')).toBeGreaterThan(antesB)
    expect(await presentesNoDia(bancada.repositorio, TURMA_A, '2026-09-17')).toBeGreaterThan(antesA)
  })

  it(
    'a chamada refeita no mesmo dia, com a mesma instalação, grava todos os crachás',
    async () => {
      // O relógio do dia da aula: é ele que põe os ids novos na mesma faixa
      // dos que a base já tem.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-22T12:59:27Z'), shouldAdvanceTime: true })
      const { bancada } = await baseComoEstava()
      const { repositorio, config } = bancada

      const alunos = AULA_2209.turmas[TURMA_B].filter((p) => p.papel === 'aluno').slice(0, 40)
      const baralho = gerarBaralho(alunos.length).map((h) => 'a1' + h.slice(2))
      for (const [i, p] of alunos.entries()) {
        await repositorio.gravarVinculo({
          uidHash: await calcularUidHash(config.salHex, hexParaUid(baralho[i])),
          papel: 'aluno',
          nome: p.nome,
          matricula: p.matricula,
          criadoEm: new Date().toISOString(),
        })
      }
      const sessao = { turma: TURMA_B, abertaEm: new Date().toISOString(), uidHashProfessor: 'professor' }
      await repositorio.abrirSessao(sessao)
      renderizarCom(bancada, <TelaAula sessao={sessao} pendentes={[]} daTurma={alunos} aoMudarBase={() => {}} />)

      await baterCrachasEmSequencia(bancada.leitor, baralho, () => repositorio.contarEventos())

      const hashes = new Set(await Promise.all(baralho.map((h) => calcularUidHash(config.salHex, hexParaUid(h)))))
      const gravados = (await repositorio.listarEventos({ turma: TURMA_B })).filter(
        (e) => e.origem === 'cracha' && hashes.has(e.uidHash),
      )
      expect(gravados).toHaveLength(alunos.length)
      // Quem já estava presente naquele dia continua contando: é a mesma chamada.
      await waitFor(() =>
        expect(Number(screen.getByRole('status').getAttribute('aria-label'))).toBeGreaterThanOrEqual(alunos.length),
      )
    },
    120_000,
  )

  it('reinstalar e religar a pasta: um crachá cadastrado antes continua reconhecido', async () => {
    const { bancada, handle } = await baseComoEstava()
    const cracha = hexParaUid('a1000001')
    const uidHash = await calcularUidHash(bancada.config.salHex, cracha)
    await bancada.repositorio.gravarVinculo({ uidHash, papel: 'aluno', nome: 'Aluno 001', criadoEm: '' })
    await sincronizar(bancada.repositorio, handle)

    const nova = await montarBancada() // dados do site apagados: sal novo sorteado
    await restaurar(nova.repositorio, handle)
    const achado = await identificarCracha(nova.repositorio, cracha)
    expect(achado.vinculo?.uidHash).toBe(uidHash)
  })
})
