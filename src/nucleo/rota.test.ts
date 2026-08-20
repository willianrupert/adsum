import { describe, expect, it } from 'vitest'
import { decidirRota, type EstadoDoApp } from './rota.ts'

const BASE: EstadoDoApp = {
  ambienteQuebrado: false,
  pasta: 'ligada',
  lendo: true,
  turmas: 1,
  pendentes: 0,
  chamadaAberta: false,
  professorSemCracha: false,
  conselharNavegador: false,
  pastaDispensada: false,
  cadastroDispensado: false,
}

describe('a rota decorre do estado', () => {
  // Regressão: sem saída, a tela da pasta prendia o professor — cancelar o
  // seletor não mudava nada e a rota nunca deixava passar.
  it('sem pasta, pede a pasta; dispensada, segue a vida', () => {
    expect(decidirRota({ ...BASE, pasta: 'sem_pasta' })).toBe('pasta')
    expect(decidirRota({ ...BASE, pasta: 'sem_pasta', pastaDispensada: true })).toBe('pronto')
    expect(decidirRota({ ...BASE, pasta: 'sem_permissao', pastaDispensada: true })).toBe('pronto')
  })

  it('sem turma, a tela é colar a turma', () => {
    expect(decidirRota({ ...BASE, turmas: 0 })).toBe('turma')
  })

  // A cerimônia sobrou para dar o primeiro crachá ao professor. Aluno sem
  // crachá se cadastra dentro da aula, encostando — porque quem se cadastra já
  // está presente.
  it('sem crachá de professor, a tela é a cerimônia', () => {
    expect(decidirRota({ ...BASE, professorSemCracha: true })).toBe('cerimonia')
  })

  // Regressão, mesma família da pasta sem saída: um crachá específico não
  // pode ser a única porta pra sair da tela de cadastro. Dispensado, o
  // repouso é quem cobra depois — sem fingir que está tudo pronto.
  it('sem crachá de professor, mas dispensado, segue para o repouso', () => {
    expect(
      decidirRota({ ...BASE, professorSemCracha: true, cadastroDispensado: true }),
    ).toBe('pronto')
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

  // Vem antes de cadastrar porque mudar de lugar depois faz recomeçar: o app
  // instalado tem armazenamento próprio, e outro navegador tem outra base.
  it('o conselho de navegador vem antes da turma', () => {
    expect(decidirRota({ ...BASE, conselharNavegador: true, turmas: 0 })).toBe('navegador')
  })

  it('mas não passa na frente de ambiente quebrado', () => {
    expect(decidirRota({ ...BASE, conselharNavegador: true, ambienteQuebrado: true })).toBe(
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
    expect(decidirRota({ ...BASE, chamadaAberta: true })).toBe('chamada')
  })

  // Cadastro acontece dentro da aula: a fila na porta não espera ninguém.
  it('a aula vence tudo o que não seja falha', () => {
    expect(decidirRota({ ...BASE, chamadaAberta: true, pendentes: 9, professorSemCracha: true })).toBe(
      'chamada',
    )
  })

  // Sem turma não há quem chamar, então colar a lista vem antes de reclamar do
  // leitor — é o que o professor precisa fazer primeiro de qualquer jeito.
  it('colar a turma vem antes de cobrar leitor', () => {
    expect(decidirRota({ ...BASE, turmas: 0, lendo: false })).toBe('turma')
  })
})
