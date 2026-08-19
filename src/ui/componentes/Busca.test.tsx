import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Busca } from './Busca.tsx'
import type { Matriculado } from '../../nucleo/tipos.ts'

const pessoa = (matricula: string, nome: string, completo: string): Matriculado => ({
  turma: 'IF685 · T01',
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: completo,
  papel: 'aluno',
})

const TURMA = [
  pessoa('1', 'Amanda Trinity', 'AMANDA TRINITY GOMES NASCIMENTO'),
  pessoa('2', 'João Pedro', 'JOAO PEDRO ALVES'),
  pessoa('3', 'Carla Regina', 'CARLA REGINA DO NASCIMENTO'),
]

function montar() {
  const aoEscolher = vi.fn()
  const aoDesistir = vi.fn()
  render(<Busca pessoas={TURMA} aoEscolher={aoEscolher} aoDesistir={aoDesistir} />)
  return { aoEscolher, aoDesistir, usuario: userEvent.setup() }
}

const destacado = () => document.querySelector('.busca__item--destacado')?.textContent

describe('busca pelo teclado', () => {
  it('o foco já está no campo, sem ninguém clicar', () => {
    montar()
    expect(screen.getByLabelText('Buscar na turma')).toHaveFocus()
  })

  it('começa com o primeiro destacado, para Enter resolver direto', () => {
    montar()
    expect(destacado()).toContain('Amanda Trinity')
  })

  it('as setas andam pela lista', async () => {
    const { usuario } = montar()
    await usuario.keyboard('{ArrowDown}')
    expect(destacado()).toContain('João Pedro')
    await usuario.keyboard('{ArrowDown}{ArrowUp}')
    expect(destacado()).toContain('João Pedro')
  })

  it('as setas param nas pontas em vez de dar a volta', async () => {
    const { usuario } = montar()
    await usuario.keyboard('{ArrowUp}{ArrowUp}')
    expect(destacado()).toContain('Amanda Trinity')
    await usuario.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(destacado()).toContain('Carla Regina')
  })

  it('Enter confirma o destacado', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.keyboard('{ArrowDown}{Enter}')
    expect(aoEscolher).toHaveBeenCalledWith(TURMA[1])
  })

  // Depois de digitar, o primeiro resultado é o que se quer.
  it('filtrar devolve o destaque ao topo', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.keyboard('{ArrowDown}{ArrowDown}')
    await usuario.type(screen.getByLabelText('Buscar na turma'), 'joao')
    expect(destacado()).toContain('João Pedro')
    await usuario.keyboard('{Enter}')
    expect(aoEscolher).toHaveBeenCalledWith(TURMA[1])
  })

  // Esc não serve: no Safari em tela cheia ele sai da tela cheia. Sair é
  // clicar fora, que funciona em todo navegador e em todo modo.
  it('clicar fora desiste', async () => {
    const { usuario, aoDesistir } = montar()
    await usuario.click(document.querySelector('.folha__fundo')!)
    expect(aoDesistir).toHaveBeenCalled()
  })

  it('clicar dentro da folha não desiste', async () => {
    const { usuario, aoDesistir } = montar()
    await usuario.click(screen.getByText('Crachá novo'))
    expect(aoDesistir).not.toHaveBeenCalled()
  })

  it('Enter sem resultado nenhum não escolhe ninguém', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.type(screen.getByLabelText('Buscar na turma'), 'zzzz')
    await usuario.keyboard('{Enter}')
    expect(aoEscolher).not.toHaveBeenCalled()
  })
})
