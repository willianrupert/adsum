import { describe, expect, it } from 'vitest'
import { curto, prepararLista, titulo } from './nomes.ts'

describe('caixa de título', () => {
  it('arruma o que o SIGAA entrega em caixa alta', () => {
    expect(titulo('WILLIAN NEVES RUPERT JONES')).toBe('Willian Neves Rupert Jones')
  })

  it('deixa partícula em minúscula, menos no começo', () => {
    expect(titulo('LUIZ DA SILVA')).toBe('Luiz da Silva')
    expect(titulo('DA SILVA JUNIOR')).toBe('Da Silva Junior')
  })
})

describe('encurtamento', () => {
  // É o nome pelo qual a pessoa é chamada, e é o que se lê de relance numa fila.
  it('fica com primeiro e segundo nome', () => {
    expect(curto('Willian Neves Rupert Jones')).toBe('Willian Neves')
    expect(curto('Maria Vitória Wanderley Lima')).toBe('Maria Vitória')
  })

  // Pegando pela frente, "Breno Filho" deixa de ser alcançável: a regra de
  // sufixo de linhagem some junto com a classe de erro que ela tapava.
  it('não tem como cair em sufixo de linhagem', () => {
    expect(curto('Breno Oliveira Filho')).toBe('Breno Oliveira')
    expect(curto('Paulo Freitas de Araujo Filho')).toBe('Paulo Freitas')
  })

  it('atravessa a partícula para alcançar o segundo nome', () => {
    expect(curto('Luiz Miguel da Silva')).toBe('Luiz Miguel')
  })

  it('preserva partícula do meio — "Maria de Fátima" é o nome dela', () => {
    expect(curto('Maria de Fátima Souza')).toBe('Maria de Fátima')
  })

  it('deixa nome único em paz', () => {
    expect(curto('Madonna')).toBe('Madonna')
  })
})

describe('lista pronta para a cerimônia', () => {
  const TURMA = [
    { nomeCompleto: 'AMANDA NASCIMENTO FERREIRA', login: 'amanda.nf', docenteNoSigaa: false, loginProvisorio: false },
    { nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO', login: 'paulofreitasaf', docenteNoSigaa: true, loginProvisorio: false },
  ]

  // Todo mundo entra como aluno. Virar professor é um toque de quem opera —
  // decisão registrada, não padrão silencioso.
  it('cadastra todo mundo como aluno, inclusive o docente do SIGAA', () => {
    expect(prepararLista(TURMA).every((n) => n.papel === 'aluno')).toBe(true)
  })

  it('põe a dica de docente primeiro e marca a linha', () => {
    const lista = prepararLista(TURMA)
    expect(lista[0].completo).toBe('Paulo Freitas de Araujo Filho')
    expect(lista[0].login).toBe('paulofreitasaf')
    expect(lista[0].docenteNoSigaa).toBe(true)
    expect(lista[1].docenteNoSigaa).toBe(false)
  })

  it('leva o nome curto e o login juntos', () => {
    expect(prepararLista(TURMA).map((n) => `${n.nome} <${n.login}>`)).toEqual([
      'Paulo Freitas <paulofreitasaf>',
      'Amanda Nascimento <amanda.nf>',
    ])
  })

  // Dois nomes iguais na tela é o erro que a cerimônia existe para evitar.
  it('desempata nome repetido com a inicial do último sobrenome', () => {
    const lista = prepararLista('Maria Vitória Souza\nMaria Vitória Andrade')
    expect(lista.map((n) => n.nome)).toEqual(['Maria Vitória S.', 'Maria Vitória A.'])
    expect(lista.every((n) => !n.ambiguo)).toBe(true)
  })

  it('marca como ambíguo o que nem o desempate resolve', () => {
    expect(prepararLista('Maria Vitória\nMaria Vitória').every((n) => n.ambiguo)).toBe(true)
  })

  it('não mexe em quem não colide', () => {
    const lista = prepararLista('Luiz Miguel da Silva\nAmanda Nascimento')
    expect(lista.map((n) => n.nome)).toEqual(['Luiz Miguel', 'Amanda Nascimento'])
  })
})
