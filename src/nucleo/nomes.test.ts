import { describe, expect, it } from 'vitest'
import {
  A24,
  LIMITE_LISTA,
  MAX_BYTES,
  bytesLatin1,
  curto,
  extrairNomes,
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
  it('fica com primeiro nome e último sobrenome', () => {
    expect(curto('Willian Neves Rupert Jones', true)).toBe('Willian Jones')
  })

  // "Breno Filho" não identifica ninguém — docs/04.
  it('preserva sufixo de linhagem com o sobrenome anterior', () => {
    expect(curto('Breno Oliveira Filho', true)).toBe('Breno Oliveira Filho')
  })

  it('larga o sufixo quando não cabe, mantendo o sobrenome', () => {
    expect(curto('Breno Oliveira Filho', false)).toBe('Breno Oliveira')
  })

  it('não deixa partícula sozinha no fim', () => {
    expect(curto('Luiz Miguel da Silva', true)).toBe('Luiz Silva')
  })

  it('deixa nome único em paz', () => {
    expect(curto('Madonna', true)).toBe('Madonna')
  })
})

describe('extração do SIGAA', () => {
  // A armadilha que custou um bug: aluno tem "(Perfil)", docente tem
  // "Departamento:". Quem só procura "(Perfil)" perde o professor em silêncio.
  const COLADO = [
    'SIGAA Amanda Nascimento (Perfil)',
    'SIGAA Paulo Freitas De Araujo Filho',
    '   Departamento: CENTRO DE INFORMATICA',
    'SIGAA Willian Neves Rupert Jones (Perfil)',
  ].join('\n')

  it('acha aluno e docente na mesma colagem', () => {
    const achados = extrairNomes(COLADO)
    expect(achados).toHaveLength(3)
    expect(achados.filter((a) => a.papel === 'professor')).toHaveLength(1)
    expect(achados[1]).toEqual({ completo: 'Paulo Freitas de Araujo Filho', papel: 'professor' })
  })

  it('aceita também um nome por linha, tratando como aluno', () => {
    const achados = extrairNomes('Amanda Nascimento\nJoão Pedro\n')
    expect(achados).toEqual([
      { completo: 'Amanda Nascimento', papel: 'aluno' },
      { completo: 'João Pedro', papel: 'aluno' },
    ])
  })

  it('descarta linha de uma letra só', () => {
    expect(extrairNomes('Amanda\nX\n')).toHaveLength(1)
  })
})

describe('lista pronta para a cerimônia', () => {
  it('põe o professor primeiro — cerimônia interrompida já tem o essencial', () => {
    const lista = prepararLista(
      [
        'SIGAA Amanda Nascimento (Perfil)',
        'SIGAA Paulo Freitas De Araujo Filho',
        '   Departamento: CENTRO DE INFORMATICA',
      ].join('\n'),
    )
    expect(lista[0].papel).toBe('professor')
  })

  // Dois "Luiz Silva" na tela é o erro que a cerimônia existe para evitar.
  it('desempata nome curto repetido com a inicial do segundo nome', () => {
    const lista = prepararLista('Luiz Miguel da Silva\nLuiz Pedro da Silva')
    expect(lista.map((n) => n.nome)).toEqual(['Luiz M. Silva', 'Luiz P. Silva'])
  })

  it('não mexe em quem não colide', () => {
    const lista = prepararLista('Luiz Miguel da Silva\nAmanda Nascimento')
    expect(lista.map((n) => n.nome)).toEqual(['Luiz Silva', 'Amanda Nascimento'])
  })

  it('avisa quem estoura a coluna, em vez de cortar calado', () => {
    const [longo] = prepararLista('Wilhelmina Wollstonecraft Wallingford')
    expect(longo.nome).toBe('Wilhelmina Wallingford')
    expect(longo.larguraNaLista).toBeGreaterThan(LIMITE_LISTA)
    expect(longo.cabeNaLista).toBe(false)
  })

  // 14 dos 48 nomes reais passavam do buffer de 31 bytes. É o encurtamento que
  // resolve isso — não um `strncpy` no firmware, que truncaria no meio.
  it('encurtar é o que faz o nome caber no buffer', () => {
    const [maria] = prepararLista('Maria Fernanda Albuquerque Cavalcanti')
    expect(bytesLatin1(maria.completo)).toBeGreaterThan(MAX_BYTES)
    expect(maria.nome).toBe('Maria Cavalcanti')
    expect(maria.cabeNoBuffer).toBe(true)
  })

  it('avisa quando nem encurtado cabe no buffer', () => {
    const [enorme] = prepararLista('Wellington Vasconcelos Albuquerquerensissimos')
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
    const [amanda] = prepararLista('Amanda Nascimento')
    expect(amanda.cabeNaLista).toBe(amanda.larguraNaLista <= LIMITE_LISTA)
    expect(amanda.cabeNoBuffer).toBe(amanda.bytes <= MAX_BYTES)
    expect(amanda.completo).toBe('Amanda Nascimento')
  })
})
