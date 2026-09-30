// A máquina que atualiza: a pasta do professor tem a planilha de faltas no
// formato de antes (sem a coluna `matricula`), e a versão nova só é aberta.
//
// Combinado com o autor em 30/09/2026: a coluna nova não pode pedir nada ao
// professor além de abrir e fechar o Adsum. Sem este teste, a planilha só
// era reescrita quando a base mudava, e um professor que abrisse o app fora
// de aula continuaria entregando o arquivo antigo.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { montarBancada } from '../testes/montar.tsx'
import { AULA_2209, pastaDoCofre } from '../testes/cofreDeTeste.ts'
import { ContextoAdsum } from './adsum.ts'
import { Fluxo } from './Fluxo.tsx'
import { caminhoDasFaltas, caminhoDosRegistros, restaurar } from '../ambiente/sincronia.ts'
import { escrever, ler } from '../ambiente/pasta.ts'
import { esquecerDiario } from '../ambiente/diario.ts'

beforeEach(() => {
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
  Object.defineProperty(window, 'showDirectoryPicker', { value: () => Promise.resolve(undefined), configurable: true })
})

afterEach(() => {
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  window.localStorage.clear()
  esquecerDiario()
})

describe('a planilha de faltas na versão nova', () => {
  it('ganha a coluna matricula só com o app aberto, sem crachá e sem toque', async () => {
    const bancada = await montarBancada()
    const { handle } = await pastaDoCofre(AULA_2209)
    await restaurar(bancada.repositorio, handle)
    bancada.config = await bancada.repositorio.lerConfig()
    bancada.repositorio.lerPasta = async () => handle

    const turmas = Object.keys(AULA_2209.registros)
    for (const turma of turmas) await escrever(handle, caminhoDasFaltas(turma), 'nome;22/09\nALUNO DE ANTES;0\n')
    const logs = await Promise.all(turmas.map((t) => ler(handle, caminhoDosRegistros(t))))

    render(
      <ContextoAdsum.Provider value={bancada}>
        <Fluxo />
      </ContextoAdsum.Provider>,
    )

    await waitFor(
      async () => {
        for (const turma of turmas) expect((await ler(handle, caminhoDasFaltas(turma)))?.replace(/^\uFEFF/, '')).toMatch(/^nome;matricula;/)
      },
      { timeout: 5_000 },
    )
    // Só a planilha, que é relatório. O log continua o mesmo, linha por linha.
    expect(await Promise.all(turmas.map((t) => ler(handle, caminhoDosRegistros(t))))).toEqual(logs)
  }, 20_000)
})
