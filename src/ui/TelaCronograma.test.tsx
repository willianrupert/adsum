// Fase 3 (docs/05_plano_execucao.md): o toggle simplificada/completa acima
// da grade do cadastro. Cobre só o que é novo aqui — a grade em si (marcar,
// arrastar, salvar) já não muda de comportamento e não ganhou teste próprio
// antes desta fase.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaCronograma } from './TelaCronograma.tsx'

let bancada: Bancada

beforeEach(async () => {
  bancada = await montarBancada()
  // `adsum.grade.modo` é preferência desta máquina (ver
  // `ambiente/preferencias.test.ts`) — sem limpar, um teste vaza pro seguinte.
  window.localStorage.removeItem('adsum.grade.modo')
})

describe('grade simplificada, por padrão', () => {
  it('não mostra a coluna de sábado', () => {
    renderizarCom(
      bancada,
      <TelaCronograma turma="IF685 · T01" aulas={[]} uidHashProfessor="" aoSalvar={vi.fn()} aoPular={vi.fn()} />,
    )

    expect(screen.getByText('SEG')).toBeInTheDocument()
    expect(screen.queryByText('SÁB')).not.toBeInTheDocument()
  })

  it('não tem período de 50 min — só os blocos de 100/110', () => {
    renderizarCom(
      bancada,
      <TelaCronograma turma="IF685 · T01" aulas={[]} uidHashProfessor="" aoSalvar={vi.fn()} aoPular={vi.fn()} />,
    )

    expect(screen.queryByLabelText('SEG, 09:00 às 09:50')).not.toBeInTheDocument()
    expect(screen.getByLabelText('SEG, 08:00 às 09:50')).toBeInTheDocument()
  })
})

describe('toggle simplificada/completa', () => {
  it('trocar para completa mostra sábado e os períodos de 50 min', async () => {
    const usuario = userEvent.setup()
    renderizarCom(
      bancada,
      <TelaCronograma turma="IF685 · T01" aulas={[]} uidHashProfessor="" aoSalvar={vi.fn()} aoPular={vi.fn()} />,
    )

    await usuario.click(screen.getByRole('button', { name: 'Completa' }))

    expect(screen.getByText('SÁB')).toBeInTheDocument()
    expect(screen.getByLabelText('SEG, 09:00 às 09:50')).toBeInTheDocument()
    expect(screen.getByLabelText('SÁB, 07:00 às 07:50')).toBeInTheDocument()
    // 12:00 não existe aos sábados — célula vazia, sem botão.
    expect(screen.queryByLabelText('SÁB, 12:00 às 12:50')).not.toBeInTheDocument()
  })
})

// A prova de que as duas telas compartilham a mesma preferência —
// TelaCronograma e Ajustes → Grade horária — está em `TelaRepositorio.test.tsx`
// ("toggle da grade é a mesma preferência das duas telas"), porque monta as
// duas juntas contra a mesma turma cadastrada.
