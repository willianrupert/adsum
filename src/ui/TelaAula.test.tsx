import { beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaAula } from './TelaAula.tsx'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'
const CRACHA_DA_ANA = '04a23b91'
const CRACHA_NOVO = '0471c2d8'

const pessoa = (matricula: string, nome: string): Matriculado => ({
  turma: TURMA,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

const ANA = pessoa('20250000001', 'Ana Paula')
const BRENO = pessoa('20250000002', 'Breno Oliveira')

let bancada: Bancada

const SESSAO = {
  turma: TURMA,
  abertaEm: new Date(Date.now() - 10 * 60_000).toISOString(),
  uidHashProfessor: 'professor',
}

beforeEach(async () => {
  bancada = await montarBancada()
  await bancada.repositorio.abrirSessao(SESSAO)
})

async function comCrachaDaAna() {
  const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_DA_ANA))
  await bancada.repositorio.gravarVinculo({
    uidHash,
    papel: 'aluno',
    nome: ANA.nome,
    matricula: ANA.matricula,
    criadoEm: new Date().toISOString(),
  })
}

function montar(pendentes: Matriculado[], total = 2) {
  return renderizarCom(
    bancada,
    <TelaAula sessao={SESSAO} pendentes={pendentes} totalDaTurma={total} aoMudarBase={() => {}} />,
  )
}

describe('a chamada', () => {
  it('conta presença de quem já tem crachá', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  // Repetido entra no log como duplicado e não mexe no contador.
  it('o mesmo crachá duas vezes não conta duas presenças', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    await waitFor(async () => expect(await bancada.repositorio.contarEventos()).toBe(2))
    expect(screen.getByText('1')).toBeInTheDocument()
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos.map((e) => e.resultado).sort()).toEqual(['duplicado', 'ok'])
  })
})

describe('a fila de cadastro', () => {
  // Só no primeiro dia, quando ninguém tem crachá: nos outros, cobrar quem
  // falta é cobrança sobre gente que pode ter trancado.
  it('aparece quando ninguém da turma tem crachá', () => {
    montar([ANA, BRENO], 2)
    expect(screen.getByText(/Faltam 2 crachás/)).toBeInTheDocument()
  })

  it('some quando alguém já tem crachá', () => {
    montar([BRENO], 2)
    expect(screen.queryByText(/Faltam/)).not.toBeInTheDocument()
  })

  it('cadastra e conta presença no mesmo toque', async () => {
    montar([ANA, BRENO], 2)

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome)).toEqual(['Ana Paula'])
    })
    // A mesma leitura virou presença, não só cadastro.
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos[0]).toMatchObject({ nome: 'Ana Paula', resultado: 'ok', origem: 'cracha' })
  })
})

describe('crachá novo num dia comum', () => {
  it('pergunta de quem é, e nada é gravado antes da resposta', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText('Crachá novo')).toBeInTheDocument()
    expect(await bancada.repositorio.contarEventos()).toBe(0)
  })

  it('a busca encolhe a lista a cada tecla, sem acento atrapalhar', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    // total maior que os pendentes: não é o primeiro dia, então a busca entra
    montar([BRENO, pessoa('3', 'João Pedro')], 3)

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')

    await usuario.type(screen.getByLabelText('Buscar na turma'), 'joao')
    expect(screen.getByText('João Pedro')).toBeInTheDocument()
    expect(screen.queryByText('Breno Oliveira')).not.toBeInTheDocument()
  })

  it('escolher alguém cadastra o crachá e conta presença', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')
    await usuario.click(screen.getByRole('button', { name: /Breno Oliveira/ }))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome).sort()).toEqual(['Ana Paula', 'Breno Oliveira'])
    })
    expect((await bancada.repositorio.listarEventos())[0]).toMatchObject({
      nome: 'Breno Oliveira',
      resultado: 'ok',
    })
  })

  it('desistir grava como desconhecido, para não sumir da chamada', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')
    await usuario.click(screen.getByRole('button', { name: 'Não está na lista' }))

    await waitFor(async () => expect(await bancada.repositorio.contarEventos()).toBe(1))
    expect((await bancada.repositorio.listarEventos())[0].resultado).toBe('desconhecido')
  })
})
