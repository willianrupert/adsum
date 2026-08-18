// Como a pessoa aparece na tela.
//
// Numa fila, o professor lê o nome de relance: "Willian Neves" se lê num
// piscar, "Willian Neves Rupert Jones" obriga a parar.

import type { Papel } from './tipos.ts'
import { interpretarParticipantes, type PessoaSigaa } from './sigaa.ts'

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
 * É como a pessoa é chamada. Pegando pela frente, some junto a regra de sufixo
 * de linhagem: "Breno Filho" deixa de ser alcançável, e a classe de erro vai
 * embora com o código que existia para tapá-la.
 *
 * Partícula no meio é preservada — "Maria de Fátima" é o nome dela.
 */
export function curto(completo: string): string {
  const partes = completo.split(/\s+/)
  if (partes.length < 2) return completo

  const seguintes: string[] = []
  for (let i = 1; i < partes.length; i++) {
    seguintes.push(partes[i])
    if (!PARTICULAS.has(partes[i].toLowerCase())) break
  }

  return [partes[0], ...seguintes].join(' ')
}

export interface NomePreparado {
  /** Como veio do SIGAA, em caixa de título. */
  completo: string
  /** Como aparece na tela. É este que o aluno confere antes de encostar. */
  nome: string
  /** Matrícula. Não aparece na tela: identifica no registro. */
  matricula: string
  /** Vem da seção da página: Docentes → professor, Discentes → aluno. */
  papel: Papel
  /** O SIGAA listou como docente. Só marca a linha; não muda o papel. */
  docenteNoSigaa: boolean
  /** Colidiu com outro nome e o desempate não resolveu. Precisa de edição. */
  ambiguo: boolean
}

/**
 * A lista pronta para a cerimônia: dica de docente primeiro, nome encurtado,
 * colisão desempatada.
 *
 * **Todo mundo entra como aluno.** O papel de professor é um toque explícito de
 * quem opera; o `docenteNoSigaa` só ordena e marca a linha, para que o toque
 * seja óbvio em vez de lembrado.
 *
 * Docente primeiro porque o crachá dele é o que abre a aula: cerimônia
 * interrompida no meio já tem o essencial feito.
 *
 * Colisão desempatada porque dois nomes iguais na tela é exatamente o erro que
 * a cerimônia existe para evitar — o aluno conferiria um nome que também é de
 * outro.
 */
export function prepararLista(entrada: string | PessoaSigaa[]): NomePreparado[] {
  const pessoas =
    typeof entrada === 'string' ? interpretarParticipantes(entrada).pessoas : entrada
  const achados = [...pessoas].sort((a, b) =>
    a.docenteNoSigaa === b.docenteNoSigaa ? 0 : a.docenteNoSigaa ? -1 : 1,
  )
  const completos = achados.map((a) => titulo(a.nomeCompleto))

  const quantos = (nomes: string[]) => {
    const conta = new Map<string, number>()
    for (const nome of nomes) conta.set(nome, (conta.get(nome) ?? 0) + 1)
    return conta
  }

  // Desempate: inicial do último sobrenome. Duas "Maria Vitória" viram
  // "Maria Vitória S." e "Maria Vitória A.".
  let base = completos.map(curto)
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

  return base.map((nome, i) => ({
    completo: completos[i],
    nome,
    matricula: achados[i].matricula,
    // O SIGAA diz a seção com todas as letras: quem está em Docentes é
    // professor, e fingir que é dica seria pedir ao professor que confirmasse
    // algo que a página já afirmou. O toggle continua ali para corrigir.
    papel: achados[i].docenteNoSigaa ? ('professor' as const) : ('aluno' as const),
    docenteNoSigaa: achados[i].docenteNoSigaa,
    ambiguo: (depois.get(nome) ?? 0) > 1,
  }))
}
