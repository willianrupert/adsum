// A planilha de faltas — o que o Prof. Paulo pediu para a v1: nome completo
// por linha, um dia de aula por coluna, e na célula quantas faltas aquele dia
// vale. Não é o registro (`csv.ts`) — é derivada dele, sob pedido, para
// entregar à instituição. O registro nunca perde uma linha; esta planilha
// nasce e morre a cada exportação, recalculada do zero.
//
// "Quantas faltas": o SIGAA conta por aula de 50 minutos. Um bloco de duas
// aulas seguidas vale duas faltas se o aluno faltou o bloco inteiro — mas só
// quando a grade diz que o bloco é duplo. Sem isso, uma falta por aula é o
// padrão: marcar duas sem a grade confirmar seria inventar meia falta que
// ninguém pediu.

import { emMinutos, type Aula } from './grade.ts'
import { nomeSeguroDeTurma } from './csv.ts'
import type { Evento, Matriculado } from './tipos.ts'

const BOM = '﻿'
const SEP = ';'

/** Quantas aulas de 50 min cabem no bloco — arredondado, nunca zero. */
export function periodosDoBloco(inicio: string, fim: string): number {
  return Math.max(1, Math.round((emMinutos(fim) - emMinutos(inicio)) / 50))
}

/** Chave local (`AAAA-MM-DD`) do dia da aula, no fuso de quem gerou o log. */
function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mesma pessoa do vínculo, num evento: por matrícula, e por nome pra quem não tem. */
function ehDoAluno(e: Evento, aluno: Matriculado): boolean {
  return aluno.matricula ? e.matricula === aluno.matricula : !e.matricula && e.nome === aluno.nome
}

function limpar(campo: string): string {
  return campo.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface LinhaDeFaltas {
  matriculado: Matriculado
  /** Dia (`AAAA-MM-DD`) → faltas naquele dia. `0` é presença. */
  porDia: Map<string, number>
}

export interface PlanilhaDeFaltas {
  dias: string[]
  linhas: LinhaDeFaltas[]
}

/**
 * Um dia de aula é um dia com evento `origem === 'professor'` — a aula
 * abriu —, não todo dia do calendário. Mesma leitura de `GradeDePresencas`.
 *
 * O valor da falta vem da grade, pelo dia da semana daquele dia: se houver
 * bloco cadastrado para `turma` naquele dia da semana, a falta vale a soma
 * dos períodos de todos os blocos dela (duas aulas seguidas contam duas).
 * Sem bloco na grade — reposição, feriado com aula extra — o padrão é um
 * período: a grade é quem tem autoridade para dizer que vale mais que isso.
 */
export function planilhaDeFaltas(
  eventos: Evento[],
  matriculados: Matriculado[],
  aulas: Aula[],
  turma: string,
): PlanilhaDeFaltas {
  const daTurma = eventos.filter((e) => e.turma === turma)
  const alunos = matriculados
    .filter((m) => m.turma === turma && m.papel === 'aluno')
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'))

  const dias = Array.from(
    new Set(daTurma.filter((e) => e.origem === 'professor').map((e) => diaLocal(e.quando))),
  ).sort()

  const periodosPorDia = new Map<string, number>()
  for (const dia of dias) {
    const semana = new Date(`${dia}T12:00:00`).getDay()
    const blocos = aulas.filter((a) => a.turma === turma && a.dia === semana)
    periodosPorDia.set(
      dia,
      blocos.length > 0 ? blocos.reduce((soma, b) => soma + periodosDoBloco(b.inicio, b.fim), 0) : 1,
    )
  }

  const linhas: LinhaDeFaltas[] = alunos.map((aluno) => {
    const porDia = new Map<string, number>()
    for (const dia of dias) {
      const presente = daTurma.some(
        (e) =>
          e.origem === 'cracha' &&
          (e.resultado === 'ok' || e.resultado === 'duplicado') &&
          diaLocal(e.quando) === dia &&
          ehDoAluno(e, aluno),
      )
      porDia.set(dia, presente ? 0 : (periodosPorDia.get(dia) ?? 1))
    }
    return { matriculado: aluno, porDia }
  })

  return { dias, linhas }
}

export function nomeDoArquivoDeFaltas(turma: string): string {
  return `faltas-${nomeSeguroDeTurma(turma)}.csv`
}

export function paraCsvDeFaltas(planilha: PlanilhaDeFaltas): string {
  const cabecalho = ['nome', ...planilha.dias].join(SEP)
  const linhas = planilha.linhas.map((l) =>
    [limpar(l.matriculado.nomeCompleto), ...planilha.dias.map((d) => String(l.porDia.get(d) ?? 0))].join(SEP),
  )
  return BOM + [cabecalho, ...linhas].join('\n') + '\n'
}
