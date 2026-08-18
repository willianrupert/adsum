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
const SUFIXOS = new Set(['neto', 'filho', 'junior', 'sobrinho', 'neta', 'filha', 'jr'])

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
 * Primeiro nome + último sobrenome. Sufixo de linhagem carrega o anterior
 * junto, senão "Breno Filho" não identifica ninguém.
 */
export function curto(completo: string, comSufixo: boolean): string {
  const partes = completo.split(/\s+/)
  if (partes.length < 2) return completo

  const ultima = partes[partes.length - 1]
  let fim = [ultima]
  if (SUFIXOS.has(ultima.toLowerCase()) && partes.length > 2) {
    fim = comSufixo ? [partes[partes.length - 2], ultima] : [partes[partes.length - 2]]
  }
  while (fim.length && PARTICULAS.has(fim[0].toLowerCase())) fim.shift()

  return [partes[0], ...fim].join(' ')
}

export interface NomeCru {
  completo: string
  papel: Papel
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
        papel: casou[2].startsWith('(') ? 'aluno' : 'professor',
      })
    }
    return achados
  }

  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 1)
    .map((nome) => ({ completo: titulo(nome), papel: 'aluno' as const }))
}

export interface NomePreparado {
  /** Como veio do SIGAA, em caixa de título. */
  completo: string
  /** Como vai aparecer no aparelho. É este que o aluno confere. */
  nome: string
  papel: Papel
  larguraNaLista: number
  cabeNaLista: boolean
  bytes: number
  cabeNoBuffer: boolean
}

/**
 * A lista pronta para a cerimônia: professor primeiro, nome encurtado, colisão
 * desempatada.
 *
 * Professor primeiro porque o crachá dele é o que abre a sessão — cerimônia
 * interrompida no meio já tem o essencial feito.
 *
 * Colisão desempatada porque dois "Luiz Silva" na tela é exatamente o erro que
 * a cerimônia existe para evitar: o professor não distingue, e o aluno confere
 * um nome que também é de outro.
 */
export function prepararLista(texto: string): NomePreparado[] {
  const achados = [...extrairNomes(texto)].sort((a, b) =>
    a.papel === b.papel ? 0 : a.papel === 'professor' ? -1 : 1,
  )
  const completos = achados.map((a) => a.completo)

  // Encurta; se nem assim couber, larga o sufixo de linhagem.
  let base = completos.map((completo) => {
    const comSufixo = curto(completo, true)
    return largura(comSufixo) > LIMITE_LISTA ? curto(completo, false) : comSufixo
  })

  const quantos = new Map<string, number>()
  for (const nome of base) quantos.set(nome, (quantos.get(nome) ?? 0) + 1)

  base = base.map((nome, i) => {
    if ((quantos.get(nome) ?? 0) < 2) return nome
    const partes = completos[i].split(/\s+/)
    if (partes.length <= 2) return nome
    const resto = nome.split(' ').slice(1).join(' ')
    return `${partes[0]} ${partes[1].charAt(0)}. ${resto}`
  })

  return base.map((nome, i) => ({
    completo: completos[i],
    nome,
    papel: achados[i].papel,
    larguraNaLista: largura(nome),
    cabeNaLista: largura(nome) <= LIMITE_LISTA,
    bytes: bytesLatin1(nome),
    cabeNoBuffer: bytesLatin1(nome) <= MAX_BYTES,
  }))
}
