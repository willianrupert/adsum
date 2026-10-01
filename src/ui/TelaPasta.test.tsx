import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TelaPasta } from './TelaPasta.tsx'

const nada = () => {}

describe('a tela de quem chega', () => {
  it('diz que é preciso um leitor de crachá USB', () => {
    render(<TelaPasta precisaDePermissao={false} aoEscolher={nada} aoLiberar={nada} aoDispensar={nada} />)
    expect(screen.getByText('Você vai precisar de um leitor de crachá USB')).toBeInTheDocument()
  })

  it('quem só precisa liberar a pasta já tem o leitor: não repete', () => {
    render(<TelaPasta precisaDePermissao aoEscolher={nada} aoLiberar={nada} aoDispensar={nada} />)
    expect(screen.queryByText(/leitor de crachá/)).not.toBeInTheDocument()
  })
})
