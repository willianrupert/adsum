// Nomes que cabem na tela do aparelho.
//
// Porte direto de `Adsum/computador/vincular.html`, que é a fonte da verdade:
// as tabelas abaixo são os **avanços reais** das fontes do firmware, extraídos
// de `fonte_texto20.h` e `fonte_texto24.h`. Cada caractere guarda um avanço
// (código − 32), da faixa 0x20 a 0xFF.
//
// Medir em pixel não é preciosismo. Contar letras não serve porque "iii" e
// "mmm" não ocupam o mesmo espaço, e a turma real quebrou um desenho de tela
// que tinha sido validado com nomes inventados curtos: dos 48 nomes do IF685,
// **47 não cabiam** na coluna a 20 px e **14 passavam do buffer de 31 bytes**.
//
// Trocar a versão das fontes do firmware invalida estas tabelas.

import type { Papel } from './tipos.ts'

/** Avanços da fonte de 20 px — a coluna de nomes da lista. */
export const A20 =
  "&(*1-3/&((*1&'&'----------''111+4.../-,0/&&-+1/0,0.-,/.4.,.('(1**,-+-,'--&&,&4-,--(*(-+1+++-'-1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,&(----'**4),1'4**1((*--&*(),333+......4.----&&&&//0000010////,,-,,,,,,3+,,,,&&&&,-,,,,,1,----+- "

/** Avanços da fonte de 24 px — a linha em destaque durante a cerimônia. */
export const A24 =
  "(*+4/73')),4()((//////////((444-80012/.32''0-523.31//2081/0)()4,,./-/.(//''.&8/.//*,)//4//-/(/4.................................(*////(,,8+/4)8,,4**,//(,*+/777-00000071////''''3233333432222///......7-....''''./.....4.////// "

/** Largura da coluna de nomes, em pixels. */
export const LIMITE_LISTA = 210

/** Largura da linha em destaque, em pixels. */
export const LIMITE_DESTAQUE = 246

/** Buffer de nome no firmware. Passar disso é truncar. */
export const MAX_BYTES = 31

export function largura(texto: string, tabela: string = A20): number {
  let total = 0
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0)!
    if (codigo >= 32 && codigo < 256) total += tabela.charCodeAt(codigo - 32) - 32
  }
  return total
}

/** O buffer do firmware conta bytes Latin-1, não caracteres. */
export function bytesLatin1(texto: string): number {
  let total = 0
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0)!
    total += codigo < 256 ? 1 : 2
  }
  return total
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/** O SIGAA entrega em caixa alta. Partícula fica em minúscula. */
export function titulo(nome: string): string {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((parte, i) =>
      i > 0 && PARTICULAS.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join(' ')
}

/**
 * Primeiro e segundo nome — "Willian Neves", não "Willian Jones".
 *
 * É como a pessoa é chamada, e é exatamente o que o mockup de `docs/03` já
 * mostrava: Willian Neves, Maria Vitória, João Pedro, Luiz Felipe. O
 * `vincular.html` usava primeiro nome + último sobrenome, e por isso precisava
 * de uma regra para sufixo de linhagem — sem ela "Breno Oliveira Filho" virava
 * "Breno Filho", que não identifica ninguém. Pegando pela frente, esse problema
 * deixa de existir: some a regra e some a classe de erro junto.
 *
 * Partícula no meio é preservada ("Maria de Fátima"), porque lê melhor. Quando
 * não couber na coluna, `comParticula: false` a descarta.
 */
export function curto(completo: string, comParticula = true): string {
  const partes = completo.split(/\s+/)
  if (partes.length < 2) return completo

  const seguintes: string[] = []
  for (let i = 1; i < partes.length; i++) {
    if (PARTICULAS.has(partes[i].toLowerCase())) {
      if (comParticula) seguintes.push(partes[i])
      continue
    }
    seguintes.push(partes[i])
    break
  }

  return [partes[0], ...seguintes].join(' ')
}

export interface NomeCru {
  completo: string
  /**
   * O SIGAA disse que é docente. **Não** define o papel — é dica, e a dica não
   * grava nada sozinha. Ver `prepararLista`.
   */
  docenteNoSigaa: boolean
}

/**
 * Aceita a página crua do SIGAA ou um nome por linha.
 *
 * A armadilha que custou um bug: **aluno vem seguido de `(Perfil)`, docente vem
 * seguido de `Departamento:`**. Um extrator que só procura `(Perfil)` descarta
 * os professores em silêncio — a lista vem com 48 nomes, nada indica que faltam
 * dois, e o crachá que abre a sessão nunca é vinculado.
 */
export function extrairNomes(texto: string): NomeCru[] {
  if (texto.includes('SIGAA')) {
    const achados: NomeCru[] = []
    const padrao = /SIGAA\s+([^\n(]+?)\s*(\(Perfil\)|\n\s*Departamento:)/g
    let casou: RegExpExecArray | null
    while ((casou = padrao.exec(texto)) !== null) {
      achados.push({
        completo: titulo(casou[1].trim()),
        docenteNoSigaa: !casou[2].startsWith('('),
      })
    }
    return achados
  }

  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 1)
    .map((nome) => ({ completo: titulo(nome), docenteNoSigaa: false }))
}

export interface NomePreparado {
  /** Como veio do SIGAA, em caixa de título. */
  completo: string
  /** Como vai aparecer no aparelho. É este que o aluno confere. */
  nome: string
  /**
   * Sempre `aluno` aqui. Quem decide o contrário é quem opera, num toque — e o
   * toque é registro de decisão, não padrão silencioso.
   */
  papel: Papel
  /** O SIGAA listou como docente. Só marca a linha; não muda o papel. */
  docenteNoSigaa: boolean
  /** Colidiu com outro nome e o desempate não resolveu. Precisa de edição. */
  ambiguo: boolean
  larguraNaLista: number
  cabeNaLista: boolean
  bytes: number
  cabeNoBuffer: boolean
}

function medir(
  base: Omit<NomePreparado, 'larguraNaLista' | 'cabeNaLista' | 'bytes' | 'cabeNoBuffer'>,
): NomePreparado {
  const larguraNaLista = largura(base.nome)
  const bytes = bytesLatin1(base.nome)
  return {
    ...base,
    larguraNaLista,
    cabeNaLista: larguraNaLista <= LIMITE_LISTA,
    bytes,
    cabeNoBuffer: bytes <= MAX_BYTES,
  }
}

/**
 * A lista pronta para a cerimônia: dica de docente primeiro, nome encurtado,
 * colisão desempatada.
 *
 * **Todo mundo entra como aluno.** O papel de professor é um toque explícito de
 * quem opera. O `docenteNoSigaa` só ordena e marca a linha, para que o toque
 * seja óbvio em vez de lembrado — o erro a evitar continua sendo vincular o
 * professor como aluno e descobrir quando a sessão não abre na frente da turma.
 * Por isso a lista também avisa quando nenhum professor foi marcado.
 *
 * Docente primeiro porque o crachá dele é o que abre a sessão: cerimônia
 * interrompida no meio já tem o essencial feito.
 *
 * Colisão desempatada porque dois nomes iguais na tela é exatamente o erro que
 * a cerimônia existe para evitar — o aluno conferiria um nome que também é de
 * outro.
 */
export function prepararLista(texto: string): NomePreparado[] {
  const achados = [...extrairNomes(texto)].sort((a, b) =>
    a.docenteNoSigaa === b.docenteNoSigaa ? 0 : a.docenteNoSigaa ? -1 : 1,
  )
  const completos = achados.map((a) => a.completo)

  // Encurta; se não couber na coluna, larga a partícula do meio.
  let base = completos.map((completo) => {
    const comParticula = curto(completo, true)
    return largura(comParticula) > LIMITE_LISTA ? curto(completo, false) : comParticula
  })

  const quantos = (nomes: string[]) => {
    const conta = new Map<string, number>()
    for (const nome of nomes) conta.set(nome, (conta.get(nome) ?? 0) + 1)
    return conta
  }

  // Desempate: inicial do último sobrenome. "Maria Vitória" vira
  // "Maria Vitória S." e "Maria Vitória A.".
  const antes = quantos(base)
  base = base.map((nome, i) => {
    if ((antes.get(nome) ?? 0) < 2) return nome
    const partes = completos[i].split(/\s+/)
    const ultimo = partes[partes.length - 1]
    return partes.length > 2 ? `${nome} ${ultimo.charAt(0)}.` : nome
  })

  // Sobrou empate? Não dá para resolver sozinho — a linha é marcada e a tela
  // pede edição, em vez de deixar dois nomes iguais passarem.
  const depois = quantos(base)

  return base.map((nome, i) =>
    medir({
      completo: completos[i],
      nome,
      papel: 'aluno',
      docenteNoSigaa: achados[i].docenteNoSigaa,
      ambiguo: (depois.get(nome) ?? 0) > 1,
    }),
  )
}

/** Remede um nome editado na tela, mantendo o resto da linha. */
export function remedir(entrada: NomePreparado, nome: string): NomePreparado {
  return medir({ ...entrada, nome })
}
