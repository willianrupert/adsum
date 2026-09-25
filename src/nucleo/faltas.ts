// A planilha de faltas: aluno por linha, um dia de aula por coluna, e na
// célula quantas faltas o dia vale. É derivada do log (`csv.ts`), recalculada
// do zero; o log é quem manda.
//
// O SIGAA conta por aula de 50 minutos: um bloco duplo na grade vale duas
// faltas. Sem grade, uma, e nunca mais do que a grade confirma.

import { emMinutos, type Aula } from './grade.ts'
import { nomeSeguroDeTurma } from './csv.ts'
import type { Evento, Matriculado } from './tipos.ts'

const BOM = '﻿'
const SEP = ';'

/** Quantas aulas de 50 min cabem no bloco — arredondado, nunca zero. */
export function periodosDoBloco(inicio: string, fim: string): number {
  return Math.max(1, Math.round((emMinutos(fim) - emMinutos(inicio)) / 50))
}

/** Chave local (`AAAA-MM-DD`) do dia da aula, no fuso de quem gerou o log.
    Exportada porque `TelaAula` precisa da mesma chave pra saber qual "dia"
    a sessão aberta representa, ao consultar `presencasDoDia`. */
export function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A pessoa de um evento ou vínculo: `m:<matrícula>`, ou `n:<nome>` para quem não tem. */
export function chaveDeIdentidade(dono: { matricula?: string; nome: string }): string {
  return dono.matricula ? `m:${dono.matricula}` : `n:${dono.nome}`
}

/** Eventos que entram na conta de presença de uma pessoa num dia. */
function contaComoPresenca(e: Evento): boolean {
  return (
    (e.origem === 'cracha' || e.origem === 'manual') &&
    (e.resultado === 'ok' || e.resultado === 'duplicado' || e.resultado === 'removido')
  )
}

/**
 * A ordem em que os eventos de uma instalação foram gravados, pelo número do
 * `evento_id` (reservado, só anda para frente). O `quando` não serve: a
 * correção em "Ver presenças" grava ao meio-dia do dia corrigido.
 */
function ordemDeGravacao(e: Evento): { instalacao: string; numero: number } | undefined {
  const achado = /^(.+)-\d{8}-(\d+)(?:\.\d+)?$/.exec(e.eventoId)
  return achado ? { instalacao: achado[1], numero: Number(achado[2]) } : undefined
}

/** Só compara eventos da mesma instalação: entre duas, os números não dizem nada. */
function gravadoDepois(a: Evento, b: Evento): boolean {
  const oa = ordemDeGravacao(a)
  const ob = ordemDeGravacao(b)
  return !!oa && !!ob && oa.instalacao === ob.instalacao && oa.numero > ob.numero
}

/**
 * Presente ou não, com os eventos de uma pessoa num dia, mais recente primeiro.
 * A correção à mão mais recente decide ("Não presente" é falta); sem
 * correção, o crachá decide. Crachá gravado **depois** de um "Não presente"
 * devolve a presença (decidido em 23/09/2026).
 */
function resolverPresencaDoDia(doDia: Evento[]): { presente: boolean; repetido: boolean; manual: boolean } {
  const doCracha = doDia.filter((e) => e.origem === 'cracha')
  const ultimoManual = doDia.find((e) => e.origem === 'manual')
  const voltouPeloCracha =
    ultimoManual?.resultado === 'removido' && doCracha.some((e) => gravadoDepois(e, ultimoManual))
  return {
    presente: ultimoManual ? ultimoManual.resultado !== 'removido' || voltouPeloCracha : doCracha.length > 0,
    repetido: doCracha.length > 1,
    manual: !!ultimoManual,
  }
}

/** A regra de `planilhaDeFaltas` para um dia só, por `chaveDeIdentidade`. */
export function presencasDoDia(
  eventos: Evento[],
  turma: string,
  dia: string,
): Map<string, { presente: boolean; repetido: boolean; manual: boolean }> {
  const porChave = new Map<string, Evento[]>()
  for (const e of eventos) {
    if (e.turma !== turma || !contaComoPresenca(e) || diaLocal(e.quando) !== dia) continue
    const chave = chaveDeIdentidade(e)
    const lista = porChave.get(chave)
    if (lista) lista.push(e)
    else porChave.set(chave, [e])
  }
  const resultado = new Map<string, { presente: boolean; repetido: boolean; manual: boolean }>()
  for (const [chave, doDia] of porChave) resultado.set(chave, resolverPresencaDoDia(doDia))
  return resultado
}

function limpar(campo: string): string {
  return campo.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Uma célula: quantas faltas, e o que explica o número (para a tela). */
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
 * A planilha de uma turma.
 *
 * Dia de aula é dia com evento de origem `professor` (a chamada abriu). A
 * falta vale a soma dos períodos da grade daquele dia da semana, ou 1 sem
 * grade. Presença vem do crachá ou da correção à mão, pela regra de
 * `resolverPresencaDoDia`. Linear em eventos: indexa uma vez, em vez de
 * filtrar por célula (era 1,3 s por crachá num fim de semestre).
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

  // `diaLocal` custa um `new Date()`: uma vez por evento, não por célula.
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

  // Pessoa → dia → eventos, numa passada. Cada balde mantém a ordem de
  // `eventos` (mais recente primeiro), da qual a regra depende.
  const indice = new Map<string, Map<string, Evento[]>>()
  for (const e of daTurma) {
    if (!contaComoPresenca(e)) continue
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
      const { presente, repetido, manual } = resolverPresencaDoDia(doDia)
      porDia.set(dia, {
        faltas: presente ? 0 : (periodosPorDia.get(dia) ?? 1),
        repetido,
        manual,
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

/**
 * Nome completo, matrícula, e um dia por coluna. A matrícula é o que
 * identifica a pessoa (nome muda com correção de cadastro) e o que a planilha
 * do SIGAA usa; o nome vem primeiro porque é por ele que se lê a lista.
 */
export function paraCsvDeFaltas(planilha: PlanilhaDeFaltas): string {
  const cabecalho = ['nome', 'matricula', ...planilha.dias.map(comoDataBr)].join(SEP)
  const linhas = planilha.linhas.map((l) =>
    [
      limpar(l.matriculado.nomeCompleto),
      limpar(l.matriculado.matricula),
      ...planilha.dias.map((d) => String(l.porDia.get(d)?.faltas ?? 0)),
    ].join(SEP),
  )
  return BOM + [cabecalho, ...linhas].join('\n') + '\n'
}
