// A conciliação: o que o SIGAA tem × o que o Adsum diria (`docs/08`, camada 2).
//
// Função pura. A presença de cada dia vem de `presencasDoDia`, a mesma regra
// da planilha de faltas, para que o SIGAA e o arquivo da pasta nunca discordem.
// Na dúvida, a célula fica fora e o motivo aparece: nunca se adivinha.

import { chaveDeIdentidade, diaLocal, presencasDoDia } from '../faltas.ts'
import type { Evento, Matriculado } from '../tipos.ts'
import { comoDia, type AjusteSigaa, type Conciliada, type Dia, type LeituraPlanilha, type Relatorio, type SemOndeLancar } from './tipos.ts'

export interface EntradaDaConciliacao {
  leitura: LeituraPlanilha
  turma: string
  matriculados: Matriculado[]
  /** Mais recente primeiro, como `listarEventos`. */
  eventos: Evento[]
  ajustes: AjusteSigaa[]
}

/** O ajuste mais recente de cada (dia, matrícula) da turma. No mesmo instante, o gravado depois. */
function ajustesVigentes(ajustes: AjusteSigaa[], turma: string): Map<string, AjusteSigaa> {
  const vigentes = new Map<string, AjusteSigaa>()
  for (const a of ajustes) {
    if (a.turma !== turma) continue
    const chave = `${a.dia}|${a.matricula}`
    const atual = vigentes.get(chave)
    if (!atual || a.em >= atual.em) vigentes.set(chave, a)
  }
  return vigentes
}

export function conciliar({ leitura, turma, matriculados, eventos, ajustes }: EntradaDaConciliacao): Relatorio {
  const alunos = matriculados.filter((m) => m.turma === turma && m.papel === 'aluno')
  const daTurma = new Set(alunos.map((a) => a.matricula))
  const naPagina = new Set(leitura.linhas.map((l) => l.matricula))
  const vigentes = ajustesVigentes(ajustes, turma)

  const diasDeChamada = new Set<Dia>()
  for (const e of eventos) {
    if (e.turma !== turma || e.origem !== 'professor') continue
    const dia = comoDia(diaLocal(e.quando))
    if (dia) diasDeChamada.add(dia)
  }
  const presencas = new Map<Dia, Map<string, { presente: boolean }>>()
  for (const dia of diasDeChamada) presencas.set(dia, presencasDoDia(eventos, turma, dia))

  // Dia com o que lançar e sem máximo: inteiro fora, com o motivo.
  const semMaximo = leitura.colunas
    .filter((c) => c.maximo === undefined && c.marca !== 'feriado' && c.marca !== 'cancelada' && diasDeChamada.has(c.dia))
    .map((c) => c.dia)
  const diaSemMaximo = new Set(semMaximo)

  /**
   * O que o Adsum diria para a célula, ou `undefined` se não tem o que dizer.
   * Sem máximo na página, nada: nem o ajuste, que precisa caber na faixa dela.
   */
  const esperado = (matricula: string, coluna: (typeof leitura.colunas)[number]) => {
    if (coluna.maximo === undefined) return undefined
    const ajuste = vigentes.get(`${coluna.dia}|${matricula}`)
    if (ajuste) return ajuste.valor >= 0 && ajuste.valor <= coluna.maximo ? { valor: ajuste.valor, ajustada: true } : undefined
    if (!daTurma.has(matricula) || !diasDeChamada.has(coluna.dia)) return undefined
    const presente = presencas.get(coluna.dia)?.get(chaveDeIdentidade({ matricula, nome: '' }))?.presente ?? false
    return { valor: presente ? 0 : coluna.maximo, ajustada: false }
  }

  const celulas: Conciliada[] = []
  for (const linha of leitura.linhas) {
    for (const coluna of leitura.colunas) {
      const posicao = { linha: linha.indice, coluna: coluna.indice, matricula: linha.matricula, dia: coluna.dia }
      const sigaa = linha.celulas[coluna.indice]
      const e = diaSemMaximo.has(coluna.dia) ? undefined : esperado(linha.matricula, coluna)
      if (sigaa.tipo === 'bloqueada' || (diaSemMaximo.has(coluna.dia) && daTurma.has(linha.matricula))) {
        celulas.push({ ...posicao, categoria: 'fora' })
      } else if (sigaa.tipo === 'vazia') {
        celulas.push(e ? { ...posicao, categoria: 'aLancar', esperado: e.valor } : { ...posicao, categoria: 'fora' })
      } else if (!e) {
        celulas.push({ ...posicao, categoria: 'soNoSigaa', sigaa: sigaa.faltas })
      } else if (sigaa.faltas === e.valor) {
        celulas.push({ ...posicao, categoria: 'confere', valor: e.valor, ajustada: e.ajustada })
      } else {
        celulas.push({ ...posicao, categoria: 'diverge', sigaa: sigaa.faltas, esperado: e.valor })
      }
    }
  }

  const porDia = new Map(leitura.colunas.map((c) => [c.dia as string, c]))
  const semOndeLancar: SemOndeLancar[] = [...diasDeChamada].sort().flatMap((dia): SemOndeLancar[] => {
    const coluna = porDia.get(dia)
    if (!coluna) return [{ dia, motivo: 'semColuna' }]
    if (coluna.marca === 'feriado' || coluna.marca === 'cancelada') return [{ dia, motivo: coluna.marca }]
    return []
  })

  return {
    turma,
    celulas,
    semParSigaa: leitura.linhas.map((l) => l.matricula).filter((m) => !daTurma.has(m)),
    semParAdsum: alunos.map((a) => a.matricula).filter((m) => !naPagina.has(m)),
    semOndeLancar,
    semMaximo,
  }
}

/** Parte das matrículas da página que precisa estar na turma para ela ser a turma. */
export const COBERTURA_MINIMA = 0.8

export type EscolhaDeTurma = { turma: string } | { recusa: 'nenhuma' | 'duas'; candidatas: string[] }

/** O código da disciplina, do cabeçalho da página ou do nome da turma no Adsum. */
function codigoDe(texto: string): string | undefined {
  return /^\s*([A-Z]{2,5}\d{3,5})\b/.exec(texto)?.[1]
}

/**
 * A turma do Adsum cujo código casa com o cabeçalho **e** cujas matrículas
 * cobrem a página. Duas candidatas, ou nenhuma, é recusa: lançar na turma
 * errada seria falta para quem estava presente.
 */
export function escolherTurma(leitura: LeituraPlanilha, matriculados: Matriculado[]): EscolhaDeTurma {
  const codigo = codigoDe(leitura.cabecalhoTurma)
  if (!codigo || leitura.linhas.length === 0) return { recusa: 'nenhuma', candidatas: [] }
  const porTurma = new Map<string, Set<string>>()
  for (const m of matriculados) {
    if (m.papel !== 'aluno' || codigoDe(m.turma) !== codigo) continue
    let s = porTurma.get(m.turma)
    if (!s) porTurma.set(m.turma, (s = new Set()))
    s.add(m.matricula)
  }
  const candidatas = [...porTurma].filter(([, matriculas]) => {
    const cobertas = leitura.linhas.filter((l) => matriculas.has(l.matricula)).length
    return cobertas / leitura.linhas.length >= COBERTURA_MINIMA
  }).map(([turma]) => turma)
  if (candidatas.length === 1) return { turma: candidatas[0] }
  return { recusa: candidatas.length === 0 ? 'nenhuma' : 'duas', candidatas }
}
