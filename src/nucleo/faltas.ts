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

/**
 * Mesma pessoa do vínculo, num evento: por matrícula, e por nome pra quem não
 * tem. `undefined` quando o evento não identifica ninguém (nem matrícula nem
 * nome) — não deve acontecer na prática, mas não é chave de aluno nenhum.
 *
 * Existe como chave (não como predicado `ehDoAluno(evento, aluno)`) porque
 * `planilhaDeFaltas` monta um índice por identidade antes de percorrer os
 * alunos — ver o comentário lá.
 */
function chaveDeIdentidade(dono: { matricula?: string; nome: string }): string {
  return dono.matricula ? `m:${dono.matricula}` : `n:${dono.nome}`
}

function limpar(campo: string): string {
  return campo.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Uma célula da planilha: quantas faltas, e o que explica o número — a
 * mesma conta serve à exportação (só o número) e à tela ao vivo (que também
 * quer dizer a hora e se foi corrigido à mão, para auditoria).
 */
export interface CelulaDeFalta {
  /** `0` é presença. */
  faltas: number
  /** O crachá foi lido mais de uma vez naquele dia — ainda é presença única. */
  repetido: boolean
  /** Marcado por um professor, não por um crachá — ver `origem: 'manual'`. */
  manual: boolean
  quando?: string
}

export interface LinhaDeFaltas {
  matriculado: Matriculado
  porDia: Map<string, CelulaDeFalta>
}

export interface PlanilhaDeFaltas {
  dias: string[]
  linhas: LinhaDeFaltas[]
}

/**
 * Um dia de aula é um dia com evento `origem === 'professor'` — a aula
 * abriu —, não todo dia do calendário.
 *
 * O valor da falta vem da grade, pelo dia da semana daquele dia: se houver
 * bloco cadastrado para `turma` naquele dia da semana, a falta vale a soma
 * dos períodos de todos os blocos dela (duas aulas seguidas contam duas).
 * Sem bloco na grade — reposição, feriado com aula extra — o padrão é um
 * período: a grade é quem tem autoridade para dizer que vale mais que isso.
 *
 * Presença conta por `origem === 'cracha'` **ou** `'manual'`: um professor
 * confirmando à mão que alguém estava na sala tem o mesmo peso de um crachá
 * — ver o comentário de `origem` em `tipos.ts`. O log continua só-acréscimo:
 * a correção é um evento novo, nunca a reescrita de um antigo.
 *
 * **Quem manda é o professor, não o crachá.** Desde 11/09/2026, um evento
 * manual com `resultado: 'removido'` tira uma presença marcada por engano —
 * crachá lido para a pessoa errada, ou confirmação à mão precipitada. `eventos`
 * chega mais recente primeiro (`Repositorio.listarEventos`), então o evento
 * manual mais novo para aquele dia decide a célula: `'removido'` é falta,
 * qualquer outro resultado é presença. Sem manual nenhum, quem decide
 * continua sendo o crachá, como sempre. O log não perde a leitura do crachá —
 * ela continua lá, para quem quiser auditar —, só deixa de contar por si só.
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

  // `diaLocal` custa um `new Date()` — calculado uma vez por evento aqui, não
  // uma vez por célula (aluno × dia) mais abaixo. Com turma grande e muitas
  // aulas já dadas, célula a célula chegava a refazer isso milhões de vezes
  // por planilha — ver `docs/05_plano_execucao.md`, Fase 4, item D.
  const diaPorEvento = new Map<Evento, string>()
  for (const e of daTurma) diaPorEvento.set(e, diaLocal(e.quando))

  const dias = Array.from(
    new Set(daTurma.filter((e) => e.origem === 'professor').map((e) => diaPorEvento.get(e)!)),
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

  // Uma indexação só, em vez de refazer `daTurma.filter(...)` inteiro pra
  // cada (aluno, dia) — O(eventos + alunos × dias) no lugar de O(alunos ×
  // dias × eventos). Mesma saída: a ordem dentro de cada balde preserva a
  // ordem de `daTurma` (mais recente primeiro, herdada de `eventos`), que é
  // a mesma garantia que o `.filter()` original preservava.
  const indice = new Map<string, Map<string, Evento[]>>()
  for (const e of daTurma) {
    if (
      !(
        (e.origem === 'cracha' || e.origem === 'manual') &&
        (e.resultado === 'ok' || e.resultado === 'duplicado' || e.resultado === 'removido')
      )
    ) {
      continue
    }
    const chave = chaveDeIdentidade(e)
    const dia = diaPorEvento.get(e)!
    let porDia = indice.get(chave)
    if (!porDia) indice.set(chave, (porDia = new Map()))
    let doDia = porDia.get(dia)
    if (!doDia) porDia.set(dia, (doDia = []))
    doDia.push(e)
  }

  const linhas: LinhaDeFaltas[] = alunos.map((aluno) => {
    const doAluno = indice.get(chaveDeIdentidade(aluno))
    const porDia = new Map<string, CelulaDeFalta>()
    for (const dia of dias) {
      // Mais recente primeiro (herdado de `eventos`), então o primeiro manual
      // encontrado é o último que o professor tocou nesta célula.
      const doDia = doAluno?.get(dia) ?? []
      const doCracha = doDia.filter((e) => e.origem === 'cracha')
      const ultimoManual = doDia.find((e) => e.origem === 'manual')
      const repetido = doCracha.length > 1
      const presente = ultimoManual ? ultimoManual.resultado !== 'removido' : doCracha.length > 0
      porDia.set(dia, {
        faltas: presente ? 0 : (periodosPorDia.get(dia) ?? 1),
        repetido,
        manual: !!ultimoManual,
        quando: doDia[0]?.quando,
      })
    }
    return { matriculado: aluno, porDia }
  })

  return { dias, linhas }
}

export function nomeDoArquivoDeFaltas(turma: string): string {
  return `faltas-${nomeSeguroDeTurma(turma)}.csv`
}

/** `2026-08-28` → `28/08/2026`. Só na saída: a chave interna (`dias`, as
    linhas do Map) continua AAAA-MM-DD, que é o que ordena certo em texto. */
function comoDataBr(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split('-')
  return `${diaDoMes}/${mes}/${ano}`
}

export function paraCsvDeFaltas(planilha: PlanilhaDeFaltas): string {
  const cabecalho = ['nome', ...planilha.dias.map(comoDataBr)].join(SEP)
  const linhas = planilha.linhas.map((l) =>
    [limpar(l.matriculado.nomeCompleto), ...planilha.dias.map((d) => String(l.porDia.get(d)?.faltas ?? 0))].join(
      SEP,
    ),
  )
  return BOM + [cabecalho, ...linhas].join('\n') + '\n'
}
