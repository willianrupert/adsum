import { describe, expect, it } from 'vitest'
import { decidirRota, type EstadoDoApp } from './rota.ts'

const BASE: EstadoDoApp = {
  ambienteQuebrado: false,
  pasta: 'ligada',
  lendo: true,
  turmas: 1,
  pendentes: 0,
  aulaAberta: false,
  professorSemCracha: false,
  convidarAInstalar: false,
}

describe('a rota decorre do estado', () => {
  it('sem turma, a tela é colar a turma', () => {
    expect(decidirRota({ ...BASE, turmas: 0 })).toBe('turma')
  })

  // A cerimônia sobrou para dar o primeiro crachá ao professor. Aluno sem
  // crachá se cadastra dentro da aula, encostando — porque quem se cadastra já
  // está presente.
  it('sem crachá de professor, a tela é a cerimônia', () => {
    expect(decidirRota({ ...BASE, professorSemCracha: true })).toBe('cerimonia')
  })

  it('aluno sem crachá não tira o professor do repouso', () => {
    expect(decidirRota({ ...BASE, pendentes: 7 })).toBe('pronto')
  })

  it('com tudo vinculado, a tela é a espera', () => {
    expect(decidirRota(BASE)).toBe('pronto')
  })

  // Tela bonita sobre leitor desligado é mentira: nenhum crachá vai chegar.
  it('sem leitor lendo, a tela é o problema', () => {
    expect(decidirRota({ ...BASE, lendo: false })).toBe('problema')
  })

  // Instalar vem antes de cadastrar porque o app instalado tem armazenamento
  // próprio: quem colar a turma na aba e instalar depois recomeça do zero.
  it('o convite de instalar vem antes da turma', () => {
    expect(decidirRota({ ...BASE, convidarAInstalar: true, turmas: 0 })).toBe('instalar')
  })

  it('mas não passa na frente de ambiente quebrado', () => {
    expect(decidirRota({ ...BASE, convidarAInstalar: true, ambienteQuebrado: true })).toBe(
      'problema',
    )
  })

  it('ambiente quebrado vence tudo, inclusive não ter turma', () => {
    expect(decidirRota({ ...BASE, ambienteQuebrado: true, turmas: 0 })).toBe('problema')
  })

  it('sem pasta escolhida, a tela é escolher onde guardar', () => {
    expect(decidirRota({ ...BASE, pasta: 'sem_pasta', turmas: 3 })).toBe('pasta')
    expect(decidirRota({ ...BASE, pasta: 'sem_permissao' })).toBe('pasta')
  })

  // Onde não há seletor de pasta, seguir é a única opção — quem avisa que os
  // dados não estão seguros é a tela da base, não uma parede.
  it('navegador sem seletor de pasta não fica preso', () => {
    expect(decidirRota({ ...BASE, pasta: 'indisponivel', turmas: 0 })).toBe('turma')
  })

  it('ambiente quebrado vence até a pasta', () => {
    expect(decidirRota({ ...BASE, ambienteQuebrado: true, pasta: 'sem_pasta' })).toBe('problema')
  })

  it('com aula aberta, a tela é a aula', () => {
    expect(decidirRota({ ...BASE, aulaAberta: true })).toBe('aula')
  })

  // Cadastro acontece dentro da aula: a fila na porta não espera ninguém.
  it('a aula vence tudo o que não seja falha', () => {
    expect(decidirRota({ ...BASE, aulaAberta: true, pendentes: 9, professorSemCracha: true })).toBe(
      'aula',
    )
  })

  // Sem turma não há quem armar, então colar a lista vem antes de reclamar do
  // leitor — é o que o professor precisa fazer primeiro de qualquer jeito.
  it('colar a turma vem antes de cobrar leitor', () => {
    expect(decidirRota({ ...BASE, turmas: 0, lendo: false })).toBe('turma')
  })
})
