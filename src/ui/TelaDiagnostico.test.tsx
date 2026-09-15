// "Chamadas recentes" — o histórico local de duração e intervalo entre
// crachás, para calibrar `INTERVALO_MINIMO_MS` com dado de aula real, em
// vez de palpite. Ver `ambiente/preferencias.ts`.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { registrarChamadaEncerrada } from '../ambiente/preferencias.ts'
import * as arquivos from '../ambiente/arquivos.ts'

let bancada: Bancada

beforeEach(async () => {
  bancada = await montarBancada()
  window.localStorage.removeItem('adsum.historico.chamadas')
})

// "Chamadas recentes" não recolhe (Fase 2, item 4 — docs/05_plano_execucao.md):
// fica sempre visível, à frente de "Últimas leituras", que é a ferramenta de
// depuração e por isso continua atrás de um clique.
async function abrir() {
  const usuario = userEvent.setup()
  renderizarCom(bancada, <TelaDiagnostico />)
  await screen.findByText('Chamadas recentes')
  return usuario
}

describe('chamadas recentes', () => {
  it('fica sempre visível, sem gatilho de recolher — "Últimas leituras" continua recolhida por padrão', async () => {
    renderizarCom(bancada, <TelaDiagnostico />)

    // Sem botão: não há o que expandir, o painel já está aberto.
    expect(screen.queryByRole('button', { name: /Chamadas recentes/ })).not.toBeInTheDocument()
    expect(screen.getByText('Nenhuma chamada encerrada ainda neste computador.')).toBeInTheDocument()

    // "Últimas leituras" continua atrás de um clique — ferramenta de
    // depuração, não uso do dia a dia. (O conteúdo fica montado mesmo
    // fechado — `Painel` anima o recolher — então quem decide é o
    // `aria-expanded`, não a presença do texto no DOM.)
    const gatilho = await screen.findByRole('button', { name: /Últimas leituras/ })
    expect(gatilho).toHaveAttribute('aria-expanded', 'false')
  })

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

// "Registros" migrou de Ajustes pra cá (Fase 2, item 2 —
// docs/05_plano_execucao.md). Pedido do Prof. Paulo, para a v1: nome
// completo por linha, um dia por coluna, e na célula quantas faltas aquele
// dia vale.
describe('exportar faltas', () => {
  it('zero pra quem encostou, os períodos do bloco pra quem faltou', async () => {
    const usuario = userEvent.setup()
    const salvarTexto = vi.spyOn(arquivos, 'salvarTexto').mockResolvedValue('baixado')

    const ana = { turma: 'IF685 · T01', chave: '1', matricula: '1', nome: 'Ana', nomeCompleto: 'ANA PAULA MENDES', papel: 'aluno' as const }
    const breno = { turma: 'IF685 · T01', chave: '2', matricula: '2', nome: 'Breno', nomeCompleto: 'BRENO OLIVEIRA', papel: 'aluno' as const }
    await bancada.repositorio.salvarTurma('IF685 · T01', [ana, breno])
    // Segunda-feira, bloco de duas aulas: 08:00 às 09:50.
    await bancada.repositorio.definirHorarioDaTurma('IF685 · T01', [
      { uidHashProfessor: 'prof', dia: 1, inicio: '08:00', fim: '09:50', turma: 'IF685 · T01' },
    ])
    await bancada.repositorio.acrescentarEvento({
      eventoId: 'web-a1-20260817-0001',
      quando: '2026-08-17T08:00:00.000Z',
      turma: 'IF685 · T01',
      nome: '',
      origem: 'professor',
      resultado: 'ok',
      uidHash: 'prof',
    })
    await bancada.repositorio.acrescentarEvento({
      eventoId: 'web-a1-20260817-0002',
      quando: '2026-08-17T08:05:00.000Z',
      turma: 'IF685 · T01',
      matricula: '1',
      nome: 'Ana',
      origem: 'cracha',
      resultado: 'ok',
      uidHash: '1',
    })

    renderizarCom(bancada, <TelaDiagnostico />)
    await usuario.click(await screen.findByRole('button', { name: /Registros/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Exportar faltas' }))

    await waitFor(() => expect(salvarTexto).toHaveBeenCalled())
    const [nomeArquivo, conteudo] = salvarTexto.mock.calls[0]
    expect(nomeArquivo).toBe('faltas-IF685-T01.csv')
    const linhas = conteudo.replace(/^﻿/, '').split('\n')
    expect(linhas[0]).toBe('nome;17/08/2026')
    expect(linhas).toContain('ANA PAULA MENDES;0')
    expect(linhas).toContain('BRENO OLIVEIRA;2')
  })
})
