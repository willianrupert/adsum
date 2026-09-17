// Reproduz, ao vivo, o que aconteceu na aula de 17/09/2026: o professor
// corrigiu a presença de um aluno sem crachá pela tela de Presenças, a tela
// confirmou — mas o CSV na pasta cofre nunca recebeu a linha. Causa:
// `ConteudoDePresencas` gravava só no IndexedDB (`repositorio.acrescentarEvento`),
// sem passar pelo mesmo caminho que qualquer evento de crachá usa
// (`gravarLinha`/`acrescentarNoLog`, mais `gravarFaltas`/`sincronizar` pra
// planilha derivada). Este teste prova o caminho de ponta a ponta, contra a
// pasta de verdade — não só o IndexedDB.

import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom } from '../testes/montar.tsx'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { ConteudoDePresencas } from './TelaPresencas.tsx'
import { acrescentarNoLog, gravarFaltas, sincronizar } from '../ambiente/sincronia.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'

const SEM_CRACHA: Matriculado = {
  turma: TURMA,
  chave: '1',
  matricula: '20250099099',
  nomeCompleto: 'JOAO PEDRO SEM CRACHA',
  nome: 'João Pedro',
  papel: 'aluno',
}

describe('correção manual de presença chega na pasta, não só no IndexedDB', () => {
  it('marcar presença de quem não tem crachá grava no log e recalcula a planilha de faltas', async () => {
    const bancada = await montarBancada()
    await bancada.repositorio.salvarTurma(TURMA, [SEM_CRACHA])
    // Só a abertura da aula — ninguém leu crachá, então João Pedro aparece
    // como falta, pronto pra correção manual (o cenário de 17/09/2026).
    await bancada.repositorio.acrescentarEvento({
      eventoId: 'abrir-0001',
      quando: '2026-03-02T13:00:00.000Z',
      turma: TURMA,
      uidHash: 'professor',
      origem: 'professor',
      resultado: 'ok',
      nome: '',
    })

    const { handle, raiz } = criarPastaFalsa()
    const usuario = userEvent.setup()

    // A mesma fiação que `Fluxo.tsx` monta de verdade: `aoRegistrar` grava a
    // linha no log, `aoMudarBase` recalcula o que é derivado — nada de
    // dublê que só finge gravar.
    renderizarCom(
      bancada,
      <ConteudoDePresencas
        aoRegistrar={(evento) => acrescentarNoLog(handle, evento)}
        aoMudarBase={(turma) => {
          void (async () => {
            await sincronizar(bancada.repositorio, handle, turma)
            await gravarFaltas(bancada.repositorio, handle, turma)
          })()
        }}
      />,
    )

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    await usuario.click(await screen.findByRole('button', { name: /marcar presença/ }))

    // O log da pasta recebeu a linha — antes da correção, este arquivo nem
    // existia (a correção manual não gravava nada nele).
    const log = await vi.waitFor(() => {
      const texto = raiz.pastas.get('registros')?.arquivos.get('IF685-T01.csv')
      if (!texto) throw new Error('ainda não gravou')
      return texto
    })
    expect(log).toContain('manual')
    expect(log).toContain('20250099099')

    // A planilha derivada também foi recalculada com a correção — zero
    // faltas pra João Pedro naquele dia, não a falta original.
    const faltas = await vi.waitFor(() => {
      const texto = raiz.pastas.get('faltas')?.arquivos.get('IF685-T01.csv')
      if (!texto) throw new Error('ainda não gravou')
      return texto
    })
    const linhaDoAluno = faltas.split('\n').find((l) => l.startsWith('JOAO PEDRO'))
    expect(linhaDoAluno).toBe('JOAO PEDRO SEM CRACHA;0')
  })
})
