// Dois casos que o ensaio de 23/09/2026 deixou sem comportamento anotado
// (`docs/00_roadmap.md`). Anotados em 30/09; o primeiro consertado no mesmo
// dia, o segundo decidido pelo autor em 01/10.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { instalarTravas } from '../testes/travasDoNavegador.ts'
import { Fluxo } from './Fluxo.tsx'
import { fecharChamadaDeAntes } from './adsum.ts'
import { adiarHorario } from '../ambiente/preferencias.ts'
import { marcarChamadaViva } from '../ambiente/chamadaViva.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { INTERVALO_MINIMO_MS } from '../nucleo/sessao.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'
const OUTRA = 'IF969 · T02'
let bancada: Bancada
let tirarTravas: () => void

const pessoa = (turma: string, matricula: string, nome: string, papel: Matriculado['papel'] = 'aluno'): Matriculado => ({
  turma,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel,
})
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(async () => {
  bancada = await montarBancada()
  tirarTravas = instalarTravas()
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
  window.sessionStorage.clear()
})
afterEach(() => {
  marcarChamadaViva(false)
  tirarTravas()
  window.localStorage.clear()
})

async function vincular(hex: string, nome: string, matricula: string) {
  const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(hex))
  await bancada.repositorio.gravarVinculo({ uidHash, papel: 'aluno', nome, matricula, criadoEm: new Date().toISOString() })
}

async function chamadaAberta() {
  adiarHorario(TURMA)
  await bancada.repositorio.salvarTurma(TURMA, [pessoa(TURMA, '1', 'Ana Paula', 'professor'), pessoa(TURMA, '2', 'Bruno Lima'), pessoa(TURMA, '3', 'Carla Dias')])
  await bancada.repositorio.gravarVinculo({ uidHash: 'aaaa000000000000', papel: 'professor', nome: 'Ana Paula', matricula: '1', criadoEm: new Date().toISOString() })
  await vincular('3770f213', 'Bruno Lima', '2')
  await vincular('8d1b9bc4', 'Carla Dias', '3')
  renderizarCom(bancada, <Fluxo />)
  await userEvent.setup().click(await screen.findByRole('button', { name: /Começar a chamada/ }))
  await screen.findByRole('button', { name: 'Encerrar a chamada' })
}

async function encostar(hex: string) {
  await act(async () => bancada.leitor.simular(hex))
  await esperar(INTERVALO_MINIMO_MS + 100)
}

describe('outra janela do Adsum aberta no meio da aula', () => {
  // Antes: a janela nova, com `sessionStorage` próprio, fechava a chamada na
  // base. Na primeira, o crachá seguinte ainda gravava, mas a tela caía no
  // repouso, e dali em diante nenhum crachá contava presença.
  it('não fecha a chamada da primeira, e a fila continua contando', async () => {
    await chamadaAberta()
    await encostar('3770f213')

    // A segunda janela abre: outra `sessionStorage`, a mesma base.
    const daPrimeira = window.sessionStorage.getItem('adsum.chamada.viva')
    window.sessionStorage.clear()
    await fecharChamadaDeAntes(bancada.repositorio)
    if (daPrimeira) window.sessionStorage.setItem('adsum.chamada.viva', daPrimeira)
    expect((await bancada.repositorio.sessaoAberta())?.turma).toBe(TURMA)

    await encostar('8d1b9bc4')
    await waitFor(async () => {
      const presentes = (await bancada.repositorio.listarEventos()).filter((e) => e.origem === 'cracha' && e.resultado === 'ok')
      expect(presentes.map((e) => e.nome).sort()).toEqual(['Bruno Lima', 'Carla Dias'])
    })
    expect(screen.getByRole('button', { name: 'Encerrar a chamada' })).toBeInTheDocument()
  }, 20_000)

  it('sem janela nenhuma com a chamada, abrir o app fecha a de antes, como sempre', async () => {
    await bancada.repositorio.abrirSessao({ turma: TURMA, abertaEm: new Date().toISOString(), uidHashProfessor: 'aaaa000000000000' })
    await fecharChamadaDeAntes(bancada.repositorio)
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })
})

describe('aluno de outra turma encosta o crachá', () => {
  // Decidido pelo autor em 01/10/2026. Antes contava presença, sem aviso.
  it('avisa de qual turma é, e a presença não conta', async () => {
    await chamadaAberta()
    adiarHorario(OUTRA)
    await bancada.repositorio.salvarTurma(OUTRA, [pessoa(OUTRA, '9', 'Davi Souza')])
    await vincular('0a0b0c0d', 'Davi Souza', '9')

    await encostar('0a0b0c0d')
    expect(await screen.findByText('Davi Souza é da turma IF969 · T02, não desta. A presença não foi contada.')).toBeInTheDocument()
    await waitFor(async () => {
      const dele = (await bancada.repositorio.listarEventos()).filter((e) => e.nome === 'Davi Souza')
      expect(dele.map((e) => [e.turma, e.resultado])).toEqual([[TURMA, 'outra_turma']])
    })
    expect(await screen.findByText('Davi Souza, de outra turma')).toBeInTheDocument()

    // A fila segue: o aluno da turma, depois do aviso, conta.
    await encostar('3770f213')
    await waitFor(async () => {
      const presentes = (await bancada.repositorio.listarEventos()).filter((e) => e.origem === 'cracha' && e.resultado === 'ok')
      expect(presentes.map((e) => e.nome)).toEqual(['Bruno Lima'])
    })
  }, 20_000)

  it('quem está nas duas turmas conta normalmente', async () => {
    adiarHorario(OUTRA)
    await bancada.repositorio.salvarTurma(OUTRA, [pessoa(OUTRA, '2', 'Bruno Lima')])
    await chamadaAberta()
    await encostar('3770f213')
    await waitFor(async () => {
      const dele = (await bancada.repositorio.listarEventos()).filter((e) => e.nome === 'Bruno Lima')
      expect(dele.map((e) => e.resultado)).toEqual(['ok'])
    })
  }, 20_000)
})
