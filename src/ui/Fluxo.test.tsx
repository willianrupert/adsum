import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { Fluxo } from './Fluxo.tsx'
import type { Matriculado } from '../nucleo/tipos.ts'

let bancada: Bancada

const pessoa = (matricula: string, nome: string): Matriculado => ({
  turma: 'IF685 · T01',
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

beforeEach(async () => {
  bancada = await montarBancada()
})

async function turmaInteiraComCracha() {
  await bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('1', 'Ana Paula')])
  await bancada.repositorio.gravarVinculo({
    uidHash: 'aaaa000000000000',
    papel: 'professor',
    nome: 'Ana Paula',
    matricula: '1',
    criadoEm: new Date().toISOString(),
  })
}

describe('a rota decide a tela', () => {
  it('sem turma, pede a turma', async () => {
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Cole sua turma')).toBeInTheDocument()
  })

  it('com tudo pronto, espera o crachá', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Encoste o seu crachá')).toBeInTheDocument()
  })

  // Regressão: este botão existia e não fazia nada — a rota decide pelo estado,
  // e "quero cadastrar mais um" é intenção que nenhum dado expressa.
  it('"Cadastrar mais um crachá" leva à tela de cadastro e volta', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Encoste o seu crachá')

    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mais um crachá' }))
    expect(await screen.findByRole('button', { name: 'Concluir' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Encoste o seu crachá')).toBeInTheDocument()
  })

  it('a engrenagem abre os ajustes e clicar fora fecha', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Encoste o seu crachá')

    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()

    await usuario.click(document.querySelector('.folha__fundo')!)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Ajustes' })).not.toBeInTheDocument(),
    )
  })

  // Sem pasta, os dados existem num navegador — e o app precisa dizer isso em
  // vez de deixar entender que estão guardados. No jsdom não há seletor de
  // diretório, então o aviso é o específico desse caso.
  it('avisa quando não há pasta', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText(/Sem pasta neste navegador/)).toBeInTheDocument()
  })
})
