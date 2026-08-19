import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TelaResumo } from './TelaResumo.tsx'

const SESSAO = {
  turma: 'IF685 · T01',
  abertaEm: new Date(Date.now() - 47 * 60_000).toISOString(),
  uidHashProfessor: 'professor',
}

// `botao--acento` é a ação de acento — a única pintada de azul na tela. Qual
// botão a recebe **é** a decisão de desenho que este teste guarda: com pasta o
// arquivo já está no disco e a ação é sair; sem pasta, sair sem salvar perde a
// chamada, e o azul tem de estar no que a preserva.
const acento = () => document.querySelector('.botao--acento')?.textContent?.trim()

describe('o fim da aula', () => {
  it('com pasta, a ação é concluir — o arquivo já está gravado', () => {
    render(
      <TelaResumo
        sessao={SESSAO}
        presentes={41}
        arquivo="Adsum ▸ registros/IF685-T01.csv"
        aoSalvarCopia={async () => 'gravado'}
        aoConcluir={() => {}}
      />,
    )

    expect(acento()).toBe('Concluir')
    expect(screen.getByText(/Já está gravado em/)).toBeInTheDocument()
  })

  it('sem pasta, a ação é salvar, e sair diz que sai sem salvar', () => {
    render(
      <TelaResumo
        sessao={SESSAO}
        presentes={41}
        aoSalvarCopia={async () => 'baixado'}
        aoConcluir={() => {}}
      />,
    )

    expect(acento()).toBe('Salvar o arquivo')
    expect(screen.getByRole('button', { name: 'Concluir sem salvar' })).toBeInTheDocument()
  })

  // O download do Safari não abre diálogo nenhum: sem uma linha na tela, o
  // clique não produz sinal e o professor clica de novo achando que falhou.
  it('depois de baixar, diz onde o arquivo caiu e devolve o acento a concluir', async () => {
    const salvar = vi.fn(async () => 'baixado' as const)
    render(
      <TelaResumo
        sessao={SESSAO}
        presentes={41}
        aoSalvarCopia={salvar}
        aoConcluir={() => {}}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Salvar o arquivo' }))

    expect(salvar).toHaveBeenCalledOnce()
    expect(await screen.findByText(/pasta de downloads/)).toBeInTheDocument()
    expect(acento()).toBe('Concluir')
  })
})
