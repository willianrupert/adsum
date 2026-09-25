// A pasta que o professor já tem, aberta pela versão nova.
//
// Mudança nenhuma pode exigir que o professor mexa na pasta. Este teste parte
// do cofre real anonimizado de 22/09/2026, com a planilha de faltas no formato
// anterior à coluna `matricula`, e prova que a versão nova a lê sem problema,
// reescreve só a planilha (com a coluna) e não toca em mais nada.

import { describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { planilhaDeFaltas } from '../nucleo/faltas.ts'
import { AULA_2209, pastaDoCofre } from '../testes/cofreDeTeste.ts'
import { escrever, ler } from './pasta.ts'
import { caminhoDasFaltas, caminhoDosRegistros, conferirLog, gravarFaltas, restaurar } from './sincronia.ts'

const TURMAS = Object.keys(AULA_2209.turmas).sort()

/** A planilha como a versão no ar a grava: nome e um dia por coluna. */
function formatoAnterior(repositorio: RepositorioDexie, turma: string) {
  return Promise.all([repositorio.listarEventos(), repositorio.listarMatriculados(turma), repositorio.listarAulas()]).then(
    ([eventos, matriculados, aulas]) => {
      const planilha = planilhaDeFaltas(eventos, matriculados, aulas, turma)
      const data = (d: string) => d.split('-').reverse().join('/')
      const linhas = planilha.linhas.map((l) =>
        [l.matriculado.nomeCompleto, ...planilha.dias.map((d) => String(l.porDia.get(d)?.faltas ?? 0))].join(';'),
      )
      return {
        texto: '﻿' + [['nome', ...planilha.dias.map(data)].join(';'), ...linhas].join('\n') + '\n',
        matriculas: planilha.linhas.map((l) => l.matriculado.matricula),
      }
    },
  )
}

describe('a pasta que o professor já tem', () => {
  it('a planilha de faltas ganha a matrícula sozinha, e nada mais na pasta muda', async () => {
    const { handle, raiz } = await pastaDoCofre(AULA_2209)
    const repositorio = new RepositorioDexie(`adsum-cofre-existente-${Math.random()}`)
    await repositorio.abrir()

    // A versão nova abre a pasta: restaura e confere. A planilha antiga ainda
    // não existe na base; é só um arquivo que ninguém lê.
    const restauracao = await restaurar(repositorio, handle)
    expect(restauracao.problemas).toEqual([])

    const anteriores = new Map<string, { texto: string; matriculas: string[] }>()
    for (const turma of TURMAS) {
      const anterior = await formatoAnterior(repositorio, turma)
      anteriores.set(turma, anterior)
      await escrever(handle, caminhoDasFaltas(turma), anterior.texto)
    }
    for (const c of await conferirLog(repositorio, handle)) {
      expect(c).toMatchObject({ trazidos: 0, acrescentados: 0 })
    }

    // Tudo o que não é a planilha, como estava.
    const retrato = () => JSON.stringify(raiz, (_, v) => (v instanceof Map ? Object.fromEntries(v) : v))
    const semFaltas = () => {
      const copia = JSON.parse(retrato())
      delete copia.pastas.faltas
      return JSON.stringify(copia)
    }
    const antes = semFaltas()

    // A próxima mudança qualquer (um crachá, uma presença à mão) reescreve a planilha.
    await gravarFaltas(repositorio, handle)

    expect(semFaltas()).toBe(antes)
    for (const turma of TURMAS) {
      const anterior = anteriores.get(turma)!
      const nova = (await ler(handle, caminhoDasFaltas(turma)))!
      const [cabecalhoAntigo, ...linhasAntigas] = anterior.texto.replace(/^﻿/, '').trim().split('\n')
      const [cabecalhoNovo, ...linhasNovas] = nova.replace(/^﻿/, '').trim().split('\n')

      // Mesmo arquivo, mesmo lugar, `;` e BOM: só a coluna a mais.
      expect(nova.startsWith('﻿')).toBe(true)
      const comMatricula = (linha: string, matricula: string) => {
        const [nome, ...dias] = linha.split(';')
        return [nome, matricula, ...dias].join(';')
      }
      expect(cabecalhoNovo).toBe(comMatricula(cabecalhoAntigo, 'matricula'))
      expect(linhasNovas).toEqual(linhasAntigas.map((l, i) => comMatricula(l, anterior.matriculas[i])))
    }

    // O log continua exatamente como a aula o gravou.
    for (const turma of TURMAS) {
      expect(await ler(handle, caminhoDosRegistros(turma))).toContain(AULA_2209.registros[turma][0].eventoId)
    }
    await repositorio.fechar()
  })
})
