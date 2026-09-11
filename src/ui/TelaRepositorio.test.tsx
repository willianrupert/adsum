// Quem falta cadastrar, por turma — a pergunta que antes só se respondia
// abrindo a chamada daquela turma. Com a sessão sendo única no app inteiro
// (ver `Fluxo.test.tsx`, "duas turmas se encavalam no horário"), abrir uma só
// para espiar quem falta podia custar fechar outra por engano; este painel é
// leitura, sem abrir nada.

import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import type { Matriculado } from '../nucleo/tipos.ts'

let bancada: Bancada

const pessoa = (turma: string, matricula: string, nome: string): Matriculado => ({
  turma,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

beforeEach(async () => {
  bancada = await montarBancada()
})

describe('quem falta cadastrar, por turma', () => {
  it('mostra a contagem certa de cada turma, sem misturar uma com a outra', async () => {
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      pessoa('IF685 · T01', '1', 'Ana'),
      pessoa('IF685 · T01', '2', 'Beto'),
    ])
    await bancada.repositorio.salvarTurma('IF969 · T02', [pessoa('IF969 · T02', '3', 'Caio')])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa',
      papel: 'aluno',
      nome: 'Ana',
      matricula: '1',
      criadoEm: new Date().toISOString(),
    })

    renderizarCom(bancada, <TelaRepositorio />)

    // Não busca "IF685 · T01" sozinho: com duas turmas, o seletor da Grade
    // horária (recolhido, mas sempre montado — ver `Painel.tsx`) usa o mesmo
    // nome como texto de botão, e isso ambiguaria a busca. A contagem já
    // prova a associação certa: só a turma de 2 pode dizer "1 de 2".
    expect(await screen.findByText('1 de 2 sem crachá')).toBeInTheDocument()
    expect(await screen.findByText('1 de 1 sem crachá')).toBeInTheDocument()
  })

  it('com todo mundo vinculado, diz que a turma está completa', async () => {
    await bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('IF685 · T01', '1', 'Ana')])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa',
      papel: 'aluno',
      nome: 'Ana',
      matricula: '1',
      criadoEm: new Date().toISOString(),
    })

    renderizarCom(bancada, <TelaRepositorio />)

    expect(await screen.findByText('1 de 1 com crachá')).toBeInTheDocument()
  })

  it('sem turma nenhuma, não mostra o painel', async () => {
    renderizarCom(bancada, <TelaRepositorio />)

    await screen.findByText('Registros')
    expect(screen.queryByText('Quem falta cadastrar, por turma')).not.toBeInTheDocument()
  })
})
