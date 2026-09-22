// O cenário "chamada com histórico" da suíte física, com o rig trocado por um
// que dispara pelo leitor simulado — o resto é de verdade: turma de teste,
// chamada aberta, `TelaAula` gravando. Prova que o cenário mede o que diz
// medir; no Diagnóstico ele roda com o ESP32 digitando pelo sistema.

import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { montarBancada, renderizarCom } from '../testes/montar.tsx'
import { prepararTurmaDeTeste } from '../ambiente/turmaDeTeste.ts'
import { rodarChamadaComHistorico } from '../ambiente/suiteFisica.ts'
import { decimalParaBytes } from '../nucleo/digitacao.ts'
import type { RigDeCracha } from '../ambiente/rigDeCracha.ts'
import { TelaAula } from './TelaAula.tsx'

describe('suíte física: chamada com histórico', () => {
  it('com ids ocupados e um sal antigo no chaveiro, cada crachá disparado é gravado', async () => {
    const bancada = await montarBancada()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    const sessao = (await bancada.repositorio.sessaoAberta())!
    const turma = await bancada.repositorio.listarMatriculados(sessao.turma)
    renderizarCom(bancada, <TelaAula sessao={sessao} pendentes={[]} daTurma={turma} aoMudarBase={() => {}} />)

    const slots = new Map<number, string>()
    const rig = {
      definir: async (i: number, uid: string) => void slots.set(i, uid),
      disparar: async (i: number) => {
        const hex = Array.from(decimalParaBytes(slots.get(i)!)!, (b) => b.toString(16).padStart(2, '0')).join('')
        await act(async () => bancada.leitor.simular(hex))
      },
    } as unknown as RigDeCracha

    const resultado = await rodarChamadaComHistorico(rig, bancada.repositorio, bancada.config, () => {}, {
      esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 450))),
    })

    expect(resultado.detalhe).toMatch(/13 de 13 gravados/)
    expect(resultado.aprovado).toBe(true)
  }, 60_000)
})
