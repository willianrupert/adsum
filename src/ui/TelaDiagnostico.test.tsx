// "Chamadas recentes" — o histórico local de duração e intervalo entre
// crachás, para calibrar `INTERVALO_MINIMO_MS` com dado de aula real, em
// vez de palpite. Ver `ambiente/preferencias.ts`.

import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { registrarChamadaEncerrada } from '../ambiente/preferencias.ts'

let bancada: Bancada

beforeEach(async () => {
  bancada = await montarBancada()
  window.localStorage.removeItem('adsum.historico.chamadas')
})

async function abrir() {
  const usuario = userEvent.setup()
  renderizarCom(bancada, <TelaDiagnostico />)
  await usuario.click(await screen.findByRole('button', { name: /Chamadas recentes/ }))
  return usuario
}

describe('chamadas recentes', () => {
  it('sem chamada nenhuma ainda, diz isso em vez de tabela vazia', async () => {
    await abrir()
    expect(screen.getByText('Nenhuma chamada encerrada ainda neste computador.')).toBeInTheDocument()
  })

  it('mostra turma, duração e intervalo de cada chamada', async () => {
    registrarChamadaEncerrada({
      turma: 'IF685 · T01',
      encerradaEm: '2026-09-15T10:00:00.000Z',
      duracaoMs: 50 * 60_000 + 30_000,
      intervalos: { minimoMs: 480, maximoMs: 1240, medioMs: 810, amostras: 41 },
    })
    await abrir()

    const linha = screen.getByText('IF685 · T01').closest('tr')!
    expect(within(linha).getByText('50min 30s')).toBeInTheDocument()
    expect(within(linha).getByText(/480–1240 ms, média 810 ms \(41 crachás\)/)).toBeInTheDocument()
  })

  // Menos de duas pessoas registradas em sequência: não há par pra medir, e
  // a tela não inventa um número — mostra que não há intervalo, sem confundir
  // "não medido" com "zero".
  it('sem par pra medir, mostra traço em vez de número inventado', async () => {
    registrarChamadaEncerrada({
      turma: 'IF685 · T01',
      encerradaEm: '2026-09-15T10:00:00.000Z',
      duracaoMs: 60_000,
      intervalos: undefined,
    })
    await abrir()

    const linha = screen.getByText('IF685 · T01').closest('tr')!
    expect(within(linha).getByText('—')).toBeInTheDocument()
  })
})
