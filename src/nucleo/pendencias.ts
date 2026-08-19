// O que ainda não saiu deste navegador.
//
// Sem pasta, o app não tem como gravar sozinho: cada aula fica no IndexedDB até
// alguém clicar em salvar. Isso por si só seria aceitável — o que não é
// aceitável é o app **não saber** disso. Sem marca do que já saiu, "salve antes
// de fechar" é um aviso que aparece uma vez, some quando o professor conclui, e
// nunca mais volta. Nada distingue uma base inteira exportada de uma aula
// inteira por exportar.
//
// A marca é por turma e é o `quando` do último evento incluído numa exportação.
// Data e não contagem: se um dia o log receber eventos antigos (restauração de
// outra máquina, por exemplo), contagem passaria a mentir para menos, e errar
// para menos aqui é dizer "está tudo salvo" quando não está.

import type { Evento } from './tipos.ts'

/** Turma → `quando` do último evento que já foi exportado. */
export type MarcaDeExportacao = Record<string, string>

export interface Pendencia {
  turma: string
  quantos: number
  /** `quando` do evento mais antigo que ainda não saiu. */
  desde: string
}

export function naoSalvos(eventos: Evento[], marca: MarcaDeExportacao = {}): Pendencia[] {
  const porTurma = new Map<string, Evento[]>()

  for (const evento of eventos) {
    const ate = marca[evento.turma]
    if (ate && evento.quando <= ate) continue
    porTurma.set(evento.turma, [...(porTurma.get(evento.turma) ?? []), evento])
  }

  return [...porTurma]
    .map(([turma, lista]) => ({
      turma,
      quantos: lista.length,
      desde: lista.reduce((antigo, e) => (e.quando < antigo ? e.quando : antigo), lista[0].quando),
    }))
    .sort((a, b) => a.desde.localeCompare(b.desde))
}

export function totalNaoSalvo(pendencias: Pendencia[]): number {
  return pendencias.reduce((soma, p) => soma + p.quantos, 0)
}

/**
 * A marca depois de exportar uma turma: o `quando` mais recente do que foi
 * escrito. Sai daqui, e não de `Date.now()`, porque o que vale é o conteúdo do
 * arquivo — se a exportação levou 40 eventos, é o quadragésimo que ficou salvo,
 * e um relógio adiantado marcaria como salvo o que ainda vai chegar.
 */
export function marcarAte(eventos: Evento[]): string | undefined {
  return eventos.reduce<string | undefined>(
    (recente, e) => (!recente || e.quando > recente ? e.quando : recente),
    undefined,
  )
}
