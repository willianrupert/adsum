// A mesma turma da planilha anonimizada, como o Adsum a teria: a lista (as
// mesmas matrículas inventadas) e as chamadas. Nos dias já lançados no SIGAA,
// presente quem tem 0; nos dias passados sem lançamento, presenças inventadas,
// estáveis. Serve à bancada (`scripts/bancada_sigaa.mjs`) e à jornada real.

import type { Evento, Matriculado } from '../nucleo/tipos.ts'

const ID_MAT = 0
const MAT = 1
const NOME = 2
const DIA = 3
const MES = 4
const NUM_FALTAS = 5

const registrosDe = (texto: string) => texto.split(';').filter(Boolean).map((r) => r.split(','))

/** Um número estável por texto, para as presenças inventadas saírem sempre iguais. */
function hash(texto: string): number {
  let h = 2166136261
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function cenarioDaBancada(
  { legenda, auxAulas, auxAlunos }: { legenda: string; auxAulas: string; auxAlunos: string },
  agora: Date = new Date(),
): { turma: string; matriculados: Matriculado[]; eventos: Evento[] } {
  const codigo = /^\s*([A-Z]{2,6}\d{2,5})\b/.exec(legenda)?.[1] ?? 'CIN0000'
  const turma = `2026.2 - ${codigo} - TURMA DA BANCADA`
  const aulas = registrosDe(auxAulas)
  const alunos = registrosDe(auxAlunos)
  const vistos = new Map<string, string[]>()
  for (const r of alunos) if (!vistos.has(r[ID_MAT])) vistos.set(r[ID_MAT], r)
  const matriculados: Matriculado[] = [...vistos.values()].map((r) => {
    const nome = r[NOME].split(' ').slice(0, 2).map((p) => p[0] + p.slice(1).toLowerCase()).join(' ')
    return { turma, chave: r[MAT], matricula: r[MAT], nome, nomeCompleto: r[NOME], papel: 'aluno' as const }
  })
  const eventos: Evento[] = []
  let n = 0
  const evento = (dia: string, parcial: Pick<Evento, 'origem'> & Partial<Evento>) => {
    n += 1
    eventos.push({ eventoId: `web-bancada-${dia.replaceAll('-', '')}-${n}`, quando: new Date(`${dia}T10:${String(n % 60).padStart(2, '0')}:00`).toISOString(), turma, uidHash: 'bancada', nome: '', resultado: 'ok', ...parcial })
  }
  aulas.forEach((a, j) => {
    const dia = `${a[8]}-${a[1].padStart(2, '0')}-${a[0].padStart(2, '0')}`
    const semAula = a[5] === 'true' || a[6] === 'true' || a[9] === 'true'
    if (semAula || new Date(`${dia}T00:00:00`) > agora) return
    evento(dia, { origem: 'professor' })
    for (const r of vistos.values()) {
      const doDia = alunos.find((x) => x[ID_MAT] === r[ID_MAT] && x[DIA] === a[0] && x[MES] === a[1])
      const presente = a[4] === 'true' ? doDia?.[NUM_FALTAS] === '0' : hash(`${r[ID_MAT]}|${j}`) % 10 < 8
      if (presente) evento(dia, { origem: 'cracha', matricula: r[MAT], nome: r[NOME] })
    }
  })
  return { turma, matriculados, eventos: eventos.reverse() }
}

