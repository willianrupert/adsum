// O chão da v2: a lista para lançar à mão (`docs/08`, "A porta e o chão").
//
// Não depende de nada do SIGAA. Se o favorito quebrar num dia de SIGAA
// diferente, o professor lança igual, sem esperar conserto. Sai da planilha
// de faltas da pasta, para os dois nunca discordarem.

import type { PlanilhaDeFaltas } from '../faltas.ts'

export interface AulaAMao {
  dia: string
  presentes: number
  ausentes: { matricula: string; nomeCompleto: string; faltas: number }[]
}

export function listaParaLancarAMao(planilha: PlanilhaDeFaltas): AulaAMao[] {
  return planilha.dias.map((dia) => {
    const ausentes = planilha.linhas.flatMap((l) => {
      const faltas = l.porDia.get(dia)?.faltas ?? 0
      return faltas > 0 ? [{ matricula: l.matriculado.matricula, nomeCompleto: l.matriculado.nomeCompleto, faltas }] : []
    })
    return { dia, presentes: planilha.linhas.length - ausentes.length, ausentes }
  })
}

const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/** Na ordem em que se lança: dia, e quem faltou com as faltas do dia. */
export function textoParaLancarAMao(turma: string, aulas: AulaAMao[]): string {
  if (aulas.length === 0) return `${turma}\n\nNenhuma chamada registrada.\n`
  const blocos = aulas.map((a) =>
    a.ausentes.length === 0
      ? `${diaCurto(a.dia)}: todos presentes.`
      : [`${diaCurto(a.dia)}: todos presentes, exceto:`, ...a.ausentes.map((p) => `  ${p.nomeCompleto} (${p.faltas}), matrícula ${p.matricula}`)].join('\n'),
  )
  return [turma, '', ...blocos.flatMap((b) => [b, ''])].join('\n')
}
