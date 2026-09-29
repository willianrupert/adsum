// Cenários inventados da planilha de frequência do SIGAA, para a v2.
//
// Enquanto não há HTML real (portão A do `docs/08`), tudo abaixo do favorito
// é testado contra leituras geradas aqui: determinísticas por semente, com
// os casos raros da página (trancado, matriculado depois, feriado, cancelada,
// dia sem máximo, matrícula sem par dos dois lados). Gente inventada: nenhum
// nome nem matrícula de verdade.

import { comoDia, type AjusteSigaa, type Celula, type ColunaDia, type Dia, type LeituraPlanilha } from '../nucleo/lancar/tipos.ts'
import type { BrutoPlanilha } from '../nucleo/lancar/leitura.ts'
import type { Evento, Matriculado } from '../nucleo/tipos.ts'

export interface Cenario {
  turma: string
  leitura: LeituraPlanilha
  matriculados: Matriculado[]
  eventos: Evento[]
  ajustes: AjusteSigaa[]
}

/** mulberry32: pequeno, determinístico, bom o bastante para gerar casos. */
export function sorteador(semente: number) {
  let a = semente >>> 0
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    chance: (p: number) => proximo() < p,
    entre: (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1)),
  }
}

const INSTALACAO = 'web-teste'

/** Terças e quintas a partir de 11/08/2026, o começo de um 2026.2 inventado. */
function diasDoSemestre(quantos: number): Dia[] {
  const dias: Dia[] = []
  const d = new Date(Date.UTC(2026, 7, 11))
  while (dias.length < quantos) {
    if (d.getUTCDay() === 2 || d.getUTCDay() === 4) dias.push(comoDia(d.toISOString().slice(0, 10))!)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dias
}

/** 10h locais: o `diaLocal` do evento é o próprio dia, em qualquer fuso de teste. */
const quandoNoDia = (dia: Dia, minuto: number) =>
  new Date(`${dia}T10:${String(minuto % 60).padStart(2, '0')}:00`).toISOString()

export function gerarCenario(semente: number): Cenario {
  const s = sorteador(semente)
  const turma = 'CIN0144 · T01'
  const nAlunos = s.entre(3, 30)
  const todosOsDias = diasDoSemestre(s.entre(3, 16) + 2)
  const diasDaPagina = todosOsDias.slice(0, todosOsDias.length - 2)

  const matriculados: Matriculado[] = Array.from({ length: nAlunos }, (_, i) => {
    const matricula = String(20260000001 + semente * 100 + i)
    return { turma, chave: matricula, matricula, nome: `Aluno ${i + 1}`, nomeCompleto: `ALUNO ${i + 1} INVENTADO ${semente}`, papel: 'aluno' }
  })

  // Quem está na página: quase todos, às vezes um a menos, às vezes um de fora.
  const naPagina = matriculados.filter(() => !s.chance(0.04)).map((m) => m.matricula)
  if (s.chance(0.3)) naPagina.push(String(20269990000 + semente))

  const colunas: ColunaDia[] = diasDaPagina.map((dia, indice) => {
    const coluna: ColunaDia = { indice, dia }
    if (!s.chance(0.06)) coluna.maximo = s.chance(0.7) ? 2 : s.entre(1, 4)
    if (s.chance(0.06)) coluna.marca = 'feriado'
    else if (s.chance(0.05)) coluna.marca = 'cancelada'
    else if (s.chance(0.3)) coluna.marca = 'lancado'
    return coluna
  })

  // As chamadas do Adsum: a maioria dos dias da página, às vezes um que não está nela.
  const eventos: Evento[] = []
  let numero = 0
  const evento = (dia: Dia, parcial: Omit<Evento, 'eventoId' | 'quando' | 'turma'>) => {
    numero += 1
    eventos.push({
      eventoId: `${INSTALACAO}-${dia.replaceAll('-', '')}-${numero}`,
      quando: quandoNoDia(dia, numero),
      turma,
      ...parcial,
    })
  }
  const chamadas = diasDaPagina.filter(() => s.chance(0.75))
  if (s.chance(0.25)) chamadas.push(todosOsDias[todosOsDias.length - 1])
  const presentes = new Map<Dia, Set<string>>()
  for (const dia of chamadas) {
    evento(dia, { uidHash: 'prof', nome: '', origem: 'professor', resultado: 'ok' })
    const doDia = new Set<string>()
    for (const m of matriculados) {
      const pessoa = { uidHash: `h${m.matricula}`, matricula: m.matricula, nome: m.nome }
      if (s.chance(0.8)) {
        evento(dia, { ...pessoa, origem: 'cracha', resultado: 'ok' })
        doDia.add(m.matricula)
        if (s.chance(0.05)) evento(dia, { ...pessoa, origem: 'cracha', resultado: 'duplicado' })
        if (s.chance(0.04)) {
          evento(dia, { ...pessoa, origem: 'manual', resultado: 'removido' })
          doDia.delete(m.matricula)
        }
      } else if (s.chance(0.1)) {
        evento(dia, { ...pessoa, origem: 'manual', resultado: 'ok' })
        doDia.add(m.matricula)
      }
    }
    presentes.set(dia, doDia)
  }
  // Mais recente primeiro, como `listarEventos` devolve.
  eventos.reverse()

  const linhas = naPagina.map((matricula, indice) => {
    const trancado = s.chance(0.04)
    const entrouDepois = !trancado && s.chance(0.05) ? s.entre(1, Math.max(1, colunas.length - 1)) : 0
    const celulas: Celula[] = colunas.map((coluna, j) => {
      // A precedência da página: as marcas da aula antes das do aluno.
      if (coluna.marca === 'feriado' || coluna.marca === 'cancelada') return { tipo: 'bloqueada', motivo: coluna.marca }
      if (trancado) return { tipo: 'bloqueada', motivo: 'trancado' }
      if (j < entrouDepois) return { tipo: 'bloqueada', motivo: 'matriculadoDepois' }
      const lancada = coluna.marca === 'lancado' ? !s.chance(0.1) : s.chance(0.08)
      if (!lancada) return { tipo: 'vazia' }
      const maximo = coluna.maximo ?? 2
      const veio = presentes.get(coluna.dia)?.has(matricula)
      // Quase sempre o que o Adsum diria; às vezes o professor lançou diferente.
      const faltas = s.chance(0.85) && veio !== undefined ? (veio ? 0 : maximo) : s.entre(0, maximo)
      return { tipo: 'lancada', faltas }
    })
    return { indice, matricula, celulas }
  })

  const ajustes: AjusteSigaa[] = []
  const nAjustes = s.entre(0, 3)
  for (let i = 0; i < nAjustes; i++) {
    const m = matriculados[s.entre(0, matriculados.length - 1)]
    const dia = diasDaPagina[s.entre(0, diasDaPagina.length - 1)]
    ajustes.push({ turma, dia, matricula: m.matricula, valor: s.entre(0, 2), em: new Date(Date.UTC(2026, 9, 1, i)).toISOString() })
  }

  return {
    turma,
    leitura: {
      id: `leitura-${semente}`,
      versaoSigaa: '4.15.0.206',
      cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
      colunas,
      linhas,
    },
    matriculados,
    eventos,
    ajustes,
  }
}

const SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A data como o SIGAA a escreve, no formato do Java: `Tue Aug 11 00:00:00 BRT 2026`. */
function dataDoJava(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  return `${SEMANA[d.getUTCDay()]} ${MESES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')} 00:00:00 BRT ${d.getUTCFullYear()}`
}

/** O bruto que o favorito extrairia da página que esta leitura descreve (`docs/12`). */
export function brutoDaLeitura(l: LeituraPlanilha): BrutoPlanilha {
  const dm = (dia: string) => [String(Number(dia.slice(8))), String(Number(dia.slice(5, 7)))]
  const auxAulas = l.colunas.map((c) =>
    [
      ...dm(c.dia),
      String(c.maximo ?? 0),
      dataDoJava(c.dia),
      String(c.marca === 'lancado'),
      String(c.marca === 'feriado'),
      String(c.marca === 'cancelada'),
      'false',
      c.dia.slice(0, 4),
      String(c.marca === 'suspensa'),
    ].join(','),
  )
  const auxAlunos = l.linhas.flatMap((linha) =>
    linha.celulas.map((celula, j) => {
      const coluna = l.colunas[j]
      const motivo = celula.tipo === 'bloqueada' ? celula.motivo : undefined
      if (motivo === 'futura' || motivo === 'foraDoPeriodo') throw new Error('bloqueio de data vem das datas, não do registro')
      return [
        String(100001 + linha.indice),
        linha.matricula,
        `ALUNO ${linha.indice + 1} INVENTADO`,
        ...dm(coluna.dia),
        celula.tipo === 'lancada' ? String(celula.faltas) : 'null',
        '0',
        'false',
        String(coluna.maximo ?? 0),
        String(200001 + linha.indice),
        dataDoJava(coluna.dia),
        String(motivo === 'trancado'),
        String(motivo === 'matriculadoDepois'),
        'true',
        String(motivo === 'bloqueado'),
        'false',
      ].join(',')
    }),
  )
  const dias = l.colunas.map((c) => c.dia).sort()
  return {
    legenda: l.cabecalhoTurma,
    periodo: { inicio: `${dias[0]} 00:00:00.0`, fim: `${dias.at(-1)} 00:00:00.0` },
    auxAulas: auxAulas.join(';'),
    auxAlunos: auxAlunos.join(';'),
    versao: l.versaoSigaa,
  }
}
