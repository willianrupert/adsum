// A aula de quinta, ensaiada sobre a base do professor.
//
// Não é um teste de unidade: é a aula inteira, na ordem em que ela acontece,
// sobre o cofre real anonimizado (`testes/cofres/aula-2209.json`) com os
// crachás cadastrados na aula de 22/09 já no lugar. O que se quer provar é o
// que o professor precisa ouvir antes de entrar em sala:
//
//   1. quem cadastrou na aula passada só encosta, e conta presença;
//   2. quem não cadastrou cai na busca, é escolhido uma vez, e conta;
//   3. nada colide com o que já está gravado dos dias anteriores;
//   4. a chamada de quinta é dela, e não continuação da de terça.
//
// O relógio é o de quinta: é ele que separa o dia novo do dia da falha.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { AULA_2209, pastaDoCofre } from '../testes/cofreDeTeste.ts'
import { restaurar } from '../ambiente/sincronia.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { INTERVALO_MINIMO_MS, proximoEventoId } from '../nucleo/sessao.ts'
import { quemFalta } from '../nucleo/sessao.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { TelaAula } from './TelaAula.tsx'

const TURMA = Object.keys(AULA_2209.turmas).sort()[1]
const QUINTA = new Date('2026-09-24T13:00:00Z')
const SEM_CRACHA = 6

/** Crachás inventados para o ensaio, fora da faixa dos UIDs medidos. */
const crachaDe = (i: number) => 'b2' + i.toString(16).padStart(6, '0')

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function encostar(bancada: Bancada, hex: string) {
  await act(async () => bancada.leitor.simular(hex))
  await esperar(INTERVALO_MINIMO_MS + 60)
}

afterEach(() => vi.useRealTimers())

describe('a aula de quinta, sobre a base do professor', () => {
  it(
    'quem cadastrou na terça só encosta; quem não cadastrou entra uma vez pela busca',
    async () => {
      const bancada = await montarBancada()
      const { handle } = await pastaDoCofre(AULA_2209)
      await restaurar(bancada.repositorio, handle)
      await bancada.repositorio.definirInstalacaoId(AULA_2209.config.instalacaoId)
      bancada.config = await bancada.repositorio.lerConfig()

      const alunos = AULA_2209.turmas[TURMA].filter((p) => p.papel === 'aluno')
      // O estado exato da turma do professor hoje: a maioria com crachá que
      // funciona, seis com vínculo gravado num sal que sumiu em 17/09, e seis
      // que nunca cadastraram. Os vínculos do cofre saem antes, porque os
      // crachás deles não têm UID conhecido para o ensaio encostar.
      const daTurma = new Set(alunos.map((p) => p.matricula))
      for (const v of await bancada.repositorio.listarVinculos()) {
        if (v.matricula && daTurma.has(v.matricula)) await bancada.repositorio.removerVinculo(v.uidHash)
      }
      const cadastrados = alunos.slice(0, alunos.length - 2 * SEM_CRACHA)
      const comSalPerdido = alunos.slice(alunos.length - 2 * SEM_CRACHA, alunos.length - SEM_CRACHA)
      const doSalPerdido = comSalPerdido[0]
      for (const [i, p] of cadastrados.entries()) {
        await bancada.repositorio.gravarVinculo({
          uidHash: await calcularUidHash(bancada.config.salHex, hexParaUid(crachaDe(i))),
          papel: 'aluno',
          nome: p.nome,
          matricula: p.matricula,
          criadoEm: '2026-09-22T12:55:00.000Z',
        })
      }
      const salPerdido = '99999999999999999999999999999999'
      for (const [i, p] of comSalPerdido.entries()) {
        await bancada.repositorio.gravarVinculo({
          uidHash: await calcularUidHash(salPerdido, hexParaUid(crachaDe(900 + i))),
          papel: 'aluno',
          nome: p.nome,
          matricula: p.matricula,
          criadoEm: '2026-09-17T14:25:00.000Z',
        })
      }
      // A fila de pendentes é a do app, não uma lista escolhida a dedo: é ela
      // que deixa de fora quem tem vínculo, mesmo que o vínculo não sirva.
      const pendentes: Matriculado[] = quemFalta(alunos, await bancada.repositorio.listarVinculos())
      expect(pendentes).toHaveLength(SEM_CRACHA)

      // Quinta-feira, depois que o app foi fechado e reaberto.
      vi.useFakeTimers({ toFake: ['Date'], now: QUINTA, shouldAdvanceTime: true })
      const eventosAntes = await bancada.repositorio.contarEventos()
      const sessao = { turma: TURMA, abertaEm: QUINTA.toISOString(), uidHashProfessor: 'professor' }
      // A abertura da chamada é numerada pela base inteira, como `Fluxo` faz —
      // é o evento que, no código de 22/09, a tela alcançava no meio da fila.
      await bancada.repositorio.acrescentarEvento({
        eventoId: proximoEventoId(AULA_2209.config.instalacaoId, QUINTA, eventosAntes + 1),
        quando: QUINTA.toISOString(),
        turma: TURMA,
        nome: 'Professor',
        origem: 'professor',
        resultado: 'ok',
        uidHash: 'professor',
      })
      await bancada.repositorio.abrirSessao(sessao)
      renderizarCom(
        bancada,
        <TelaAula sessao={sessao} pendentes={pendentes} daTurma={alunos} aoMudarBase={() => {}} />,
      )
      // A chamada de quinta começa vazia: a de terça foi outro dia.
      await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('aria-label', '0'))

      for (let i = 0; i < cadastrados.length; i++) await encostar(bancada, crachaDe(i))

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', String(cadastrados.length)),
      )

      // Um crachá que ninguém conhece: a busca abre, o professor escolhe, e a
      // pessoa passa a contar — e na aula seguinte já é do grupo de cima.
      const novato = pendentes[0]
      await encostar(bancada, crachaDe(700))
      const busca = await screen.findByRole('textbox', { name: 'Buscar na turma' })
      const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await usuario.type(busca, novato.nome)
      const achado = await screen.findByRole('button', { name: new RegExp(novato.nome) })
      await act(async () => achado.click())

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', String(cadastrados.length + 1)),
      )
      expect(await bancada.repositorio.vinculoPorHash(
        await calcularUidHash(bancada.config.salHex, hexParaUid(crachaDe(700))),
      )).toMatchObject({ nome: novato.nome })

      // O caso dos seis: vínculo existe, mas num sal que sumiu. Eles não
      // aparecem na fila de pendentes, então o único caminho deles é a busca
      // do crachá desconhecido — que varre a turma inteira, e não só a fila.
      expect(pendentes.map((p) => p.matricula)).not.toContain(doSalPerdido.matricula)
      await encostar(bancada, crachaDe(800))
      const buscaDele = await screen.findByRole('textbox', { name: 'Buscar na turma' })
      await usuario.type(buscaDele, doSalPerdido.nome)
      const achadoDele = await screen.findByRole('button', { name: new RegExp(doSalPerdido.nome) })
      await act(async () => achadoDele.click())

      await waitFor(async () =>
        expect(
          await bancada.repositorio.vinculoPorHash(
            await calcularUidHash(bancada.config.salHex, hexParaUid(crachaDe(800))),
          ),
        ).toMatchObject({ nome: doSalPerdido.nome, matricula: doSalPerdido.matricula }),
      )

      // Nada do que já estava gravado foi tocado, e nenhum id se repetiu.
      const todos = await bancada.repositorio.listarEventos()
      const ids = todos.map((e) => e.eventoId)
      expect(new Set(ids).size).toBe(ids.length)
      expect(todos.length).toBeGreaterThanOrEqual(eventosAntes + cadastrados.length + 1)

      // E a linha de quem passou hoje aparece na lista da tela.
      const lista = screen.getByRole('status').closest('section') ?? document.body
      expect(within(lista).queryByText('Crachá não cadastrado')).not.toBeInTheDocument()
    },
    180_000,
  )
})
