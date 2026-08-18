import { describe, expect, it } from 'vitest'
import {
  A24,
  LIMITE_LISTA,
  MAX_BYTES,
  bytesLatin1,
  curto,
  largura,
  prepararLista,
  titulo,
} from './nomes.ts'

describe('largura em pixel', () => {
  // A razão de existir das tabelas: contar letras não serve.
  it('distingue letras estreitas de largas', () => {
    expect(largura('iii')).toBeLessThan(largura('mmm'))
  })

  it('mede acentuada, que é metade da turma', () => {
    expect(largura('João')).toBeGreaterThan(0)
    expect(largura('Vitória')).toBeGreaterThan(largura('Vitoria') - 3)
  })

  it('usa tabela diferente por tamanho de fonte', () => {
    expect(largura('Willian Neves', A24)).toBeGreaterThan(largura('Willian Neves'))
  })

  it('ignora o que não cabe em Latin-1, como as fontes do firmware', () => {
    expect(largura('日本')).toBe(0)
  })
})

describe('bytes', () => {
  it('conta acentuada como um byte, que é como Latin-1 guarda', () => {
    expect(bytesLatin1('João')).toBe(4)
    expect(bytesLatin1('Maria Vitória')).toBe(13)
  })
})

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
  // É o nome pelo qual a pessoa é chamada — e é o que o mockup de docs/03 já
  // mostrava: Willian Neves, Maria Vitória, João Pedro, Luiz Felipe.
  it('fica com primeiro e segundo nome', () => {
    expect(curto('Willian Neves Rupert Jones')).toBe('Willian Neves')
    expect(curto('Maria Vitória Wanderley Lima')).toBe('Maria Vitória')
  })

  // Pegando pela frente, "Breno Filho" deixa de ser possível: a regra de sufixo
  // de linhagem some junto com a classe de erro que ela existia para tapar.
  it('não tem como cair em sufixo de linhagem', () => {
    expect(curto('Breno Oliveira Filho')).toBe('Breno Oliveira')
    expect(curto('Paulo Freitas de Araujo Filho')).toBe('Paulo Freitas')
  })

  it('pula a partícula para alcançar o segundo nome', () => {
    expect(curto('Luiz Miguel da Silva')).toBe('Luiz Miguel')
  })

  it('preserva partícula no meio, porque lê melhor', () => {
    expect(curto('Maria de Fátima Souza')).toBe('Maria de Fátima')
  })

  it('larga a partícula quando pedem por espaço', () => {
    expect(curto('Maria de Fátima Souza', false)).toBe('Maria Fátima')
  })

  it('deixa nome único em paz', () => {
    expect(curto('Madonna')).toBe('Madonna')
  })
})

describe('lista pronta para a cerimônia', () => {
  // A leitura da página do SIGAA tem casa própria em `sigaa.test.ts`. Aqui a
  // entrada já vem estruturada, que é o que `prepararLista` precisa saber.
  const TURMA = [
    { nomeCompleto: 'AMANDA NASCIMENTO FERREIRA', login: 'amanda.nf', docenteNoSigaa: false, loginProvisorio: false },
    { nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO', login: 'paulofreitasaf', docenteNoSigaa: true, loginProvisorio: false },
  ]

  // Todo mundo entra como aluno. Virar professor é um toque de quem opera —
  // decisão registrada, não padrão silencioso.
  it('cadastra todo mundo como aluno, inclusive o docente do SIGAA', () => {
    const lista = prepararLista(TURMA)
    expect(lista.every((n) => n.papel === 'aluno')).toBe(true)
  })

  it('põe a dica de docente primeiro e marca a linha', () => {
    const lista = prepararLista(TURMA)
    expect(lista[0].completo).toBe('Paulo Freitas de Araujo Filho')
    expect(lista[0].login).toBe('paulofreitasaf')
    expect(lista[0].docenteNoSigaa).toBe(true)
    expect(lista[1].docenteNoSigaa).toBe(false)
  })

  // Dois nomes iguais na tela é o erro que a cerimônia existe para evitar.
  it('desempata nome repetido com a inicial do último sobrenome', () => {
    const lista = prepararLista('Maria Vitória Souza\nMaria Vitória Andrade')
    expect(lista.map((n) => n.nome)).toEqual(['Maria Vitória S.', 'Maria Vitória A.'])
    expect(lista.every((n) => !n.ambiguo)).toBe(true)
  })

  it('marca como ambíguo o que nem o desempate resolve', () => {
    const lista = prepararLista('Maria Vitória\nMaria Vitória')
    expect(lista.every((n) => n.ambiguo)).toBe(true)
  })

  it('não mexe em quem não colide', () => {
    const lista = prepararLista('Luiz Miguel da Silva\nAmanda Nascimento')
    expect(lista.map((n) => n.nome)).toEqual(['Luiz Miguel', 'Amanda Nascimento'])
  })

  it('avisa quem estoura a coluna, em vez de cortar calado', () => {
    const [longo] = prepararLista('Wilhelmina Wollstonecraft Wallingford')
    expect(longo.nome).toBe('Wilhelmina Wollstonecraft')
    expect(longo.larguraNaLista).toBeGreaterThan(LIMITE_LISTA)
    expect(longo.cabeNaLista).toBe(false)
  })

  // 14 dos 48 nomes reais passavam do buffer de 31 bytes. É o encurtamento que
  // resolve isso — não um `strncpy` no firmware, que truncaria no meio.
  it('encurtar é o que faz o nome caber no buffer', () => {
    const [maria] = prepararLista('Maria Fernanda Albuquerque Cavalcanti')
    expect(bytesLatin1(maria.completo)).toBeGreaterThan(MAX_BYTES)
    expect(maria.nome).toBe('Maria Fernanda')
    expect(maria.cabeNoBuffer).toBe(true)
  })

  it('avisa quando nem encurtado cabe no buffer', () => {
    const [enorme] = prepararLista('Wellington Albuquerquerensissimos Souza')
    expect(enorme.bytes).toBeGreaterThan(MAX_BYTES)
    expect(enorme.cabeNoBuffer).toBe(false)
  })

  // 209 de 210 pixels. Não é folga: é a medida que mostra por que 47 dos 48
  // nomes reais não cabiam, e por que contar letras nunca ia resolver.
  it('mostra que nome comum já raspa o limite', () => {
    const [amanda] = prepararLista('Amanda Nascimento')
    expect(amanda.larguraNaLista).toBe(209)
    expect(amanda.cabeNaLista).toBe(true)
  })

  it('mede cada nome contra os dois limites do aparelho', () => {
    const [amanda] = prepararLista('Amanda Nascimento Ferreira')
    expect(amanda.cabeNaLista).toBe(amanda.larguraNaLista <= LIMITE_LISTA)
    expect(amanda.cabeNoBuffer).toBe(amanda.bytes <= MAX_BYTES)
    expect(amanda.completo).toBe('Amanda Nascimento Ferreira')
    expect(amanda.nome).toBe('Amanda Nascimento')
  })
})
