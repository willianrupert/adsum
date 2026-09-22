// O cenário "chamada com histórico" da suíte física, com o rig trocado por um
// que dispara pelo leitor simulado — o resto é de verdade: turma de teste,
// chamada aberta, `TelaAula` gravando. Prova que o cenário mede o que diz
// medir; no Diagnóstico ele roda com o ESP32 digitando pelo sistema.

import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { montarBancada, renderizarCom } from '../testes/montar.tsx'
import { prepararTurmaDeTeste } from '../ambiente/turmaDeTeste.ts'
import { rodarChamadaComHistorico, rodarFilaDeRadio } from '../ambiente/suiteFisica.ts'
import { decimalParaBytes } from '../nucleo/digitacao.ts'
import { uidDaFilaDeRadio } from '../nucleo/suiteDeTestes.ts'
import { INTERVALO_MINIMO_MS } from '../nucleo/sessao.ts'
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

// A fila pelo rádio, com o emulador trocado por um que "dispara" pelo leitor
// simulado. O que se prova aqui é a costura: a suíte cadastra os crachás pela
// mesma fórmula que o firmware usa, dispara, e confere na base. Na bancada de
// verdade, quem responde é o PN532 e quem lê é o dongle.
describe('suíte física: fila pelo rádio', () => {
  it('cada crachá da fila vira presença, e leitura fora da fila reprova', async () => {
    const bancada = await montarBancada()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    const sessao = (await bancada.repositorio.sessaoAberta())!
    const turma = await bancada.repositorio.listarMatriculados(sessao.turma)
    renderizarCom(bancada, <TelaAula sessao={sessao} pendentes={[]} daTurma={turma} aoMudarBase={() => {}} />)

    const rig = {
      fila: async (quantos: number) => {
        for (let i = 0; i < quantos; i++) {
          const uid = decimalParaBytes(uidDaFilaDeRadio(i))!
          const hex = Array.from(uid, (b) => b.toString(16).padStart(2, '0')).join('')
          await act(async () => bancada.leitor.simular(hex))
          await new Promise((r) => setTimeout(r, INTERVALO_MINIMO_MS + 60))
        }
        return 'OK'
      },
    } as unknown as RigDeCracha

    const resultado = await rodarFilaDeRadio(rig, bancada.repositorio, bancada.config, 6, () => {}, {
      esperar: async () => {},
    })

    expect(resultado.detalhe).toMatch(/6 de 6/)
    expect(resultado.aprovado).toBe(true)
  }, 60_000)
})
