import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Contador } from './Contador.tsx'

function colunas() {
  return [...document.querySelectorAll<HTMLElement>('.contador__coluna')].map(
    (c) => c.style.transform,
  )
}

describe('contador em odômetro', () => {
  it('cada casa desliza até o seu algarismo', () => {
    render(<Contador valor={42} />)
    expect(colunas()).toEqual(['translateY(-40%)', 'translateY(-20%)'])
  })

  it('anuncia o número inteiro para quem não vê a rolagem', () => {
    render(<Contador valor={7} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '7')
  })

  // Com chave por posição da esquerda, ao passar de 9 para 10 a casa das
  // unidades seria recriada e o movimento sumiria justamente na virada.
  it('a casa das unidades sobrevive à virada da dezena', () => {
    const { rerender } = render(<Contador valor={9} />)
    const unidadeAntes = document.querySelectorAll('.contador__casa')[0]
    rerender(<Contador valor={10} />)
    const casas = document.querySelectorAll('.contador__casa')
    expect(casas).toHaveLength(2)
    expect(casas[1]).toBe(unidadeAntes)
  })

  it('zero é uma casa só', () => {
    render(<Contador valor={0} />)
    expect(document.querySelectorAll('.contador__casa')).toHaveLength(1)
    expect(colunas()).toEqual(['translateY(0%)'])
  })

  it('cada casa carrega os dez algarismos, para poder rolar em qualquer direção', () => {
    render(<Contador valor={5} />)
    expect(document.querySelectorAll('.contador__algarismo')).toHaveLength(10)
  })
})
