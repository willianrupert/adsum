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
    { nomeCompleto: 'AMANDA NASCIMENTO FERREIRA', matricula: '20250001', docenteNoSigaa: false },
    { nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO', matricula: '', docenteNoSigaa: true },
  ]

  // A página diz a seção com todas as letras: quem está em Docentes é
  // professor. Pedir confirmação do que a página já afirmou é trabalho à toa.
  it('quem veio da seção de docentes entra como professor', () => {
    const lista = prepararLista(TURMA)
    expect(lista[0].completo).toBe('Paulo Freitas de Araujo Filho')
    expect(lista[0].papel).toBe('professor')
    expect(lista[1].papel).toBe('aluno')
  })

  it('põe o docente primeiro, para a cerimônia interrompida ter o essencial', () => {
    expect(prepararLista(TURMA)[0].docenteNoSigaa).toBe(true)
  })

  // A matrícula identifica no registro e não aparece na tela.
  it('carrega a matrícula sem exibi-la no nome', () => {
    const lista = prepararLista(TURMA)
    expect(lista.map((n) => n.nome)).toEqual(['Paulo Freitas', 'Amanda Nascimento'])
    expect(lista[1].matricula).toBe('20250001')
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
