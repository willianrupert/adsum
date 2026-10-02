// O que a folha do Adsum mostra (`docs/08` §5, `docs/09`), a partir do
// relatório: função pura, para a tela só desenhar. O título é o estado em
// uma frase; o que não pede atenção cabe numa linha. Sem travessão: é texto
// de tela (`CLAUDE.md`, voz da interface).

import type { Matriculado } from '../tipos.ts'
import type { Dia, LeituraPlanilha, Relatorio } from './tipos.ts'

export interface AulaDaFolha {
  dia: Dia
  rotulo: string
  presentes: number
  faltas: number
  /** Atrás do toque: o cartão mostra os números, e o nome só quando aberto (decidido em 27/09). */
  ausentes: { matricula: string; nome: string; faltas: number }[]
  marcada: boolean
  /** Dia com mais aulas que o comum da planilha: quanto a falta vale, dito antes de preencher. */
  aviso?: string
  /** A chamada veio de outro dia, por decisão do professor. */
  de?: { dia: Dia; rotulo: string }
}

/** Chamada do Adsum sem aula no SIGAA para entrar: o professor escolhe em qual. */
export interface ChamadaSemLugar {
  dia: Dia
  rotulo: string
  presentes: number
  faltas: number
  explicacao: string
  /** As aulas que podem recebê-la, da mais perto para a mais longe. */
  opcoes: { dia: Dia; rotulo: string }[]
}

/** Aula com outro professor que outra pessoa já lançou: o professor soma a parte dele à mão (`docs/13`). */
export interface AulaAMao {
  dia: Dia
  rotulo: string
  parte: number
  presentes: number
  /** Atrás do toque, como nos cartões de aula. */
  ausentes: { matricula: string; nome: string }[]
}

export interface DiferencaDaFolha {
  matricula: string
  nome: string
  dia: Dia
  rotulo: string
  sigaa: number
  esperado: number
}

export interface ResumoDaFolha {
  estado: 'lancar' | 'tudoConfere'
  titulo: string
  apoio: string
  diferencas: DiferencaDaFolha[]
  aulas: AulaDaFolha[]
  semLugar: ChamadaSemLugar[]
  aMao: AulaAMao[]
  informativos?: string
  /** Só quando há aula para lançar. */
  botao?: string
}

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
export const rotuloDoDia = (dia: string) => `${SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${curto(dia)}`
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function juntar(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

function informativos(relatorio: Relatorio, leitura: LeituraPlanilha, perguntadas: ReadonlySet<Dia>): string | undefined {
  const comMotivo = (motivo: string) =>
    leitura.linhas.filter((l) => l.celulas.some((c) => c.tipo === 'bloqueada' && c.motivo === motivo)).length
  const partes: string[] = []
  const trancados = comMotivo('trancado')
  if (trancados) partes.push(contar(trancados, 'trancado', 'trancados'))
  const depois = comMotivo('matriculadoDepois')
  if (depois) partes.push(contar(depois, 'matriculado depois', 'matriculados depois'))
  const bloqueados = comMotivo('bloqueado')
  if (bloqueados) partes.push(contar(bloqueados, 'bloqueado', 'bloqueados'))
  if (relatorio.semParSigaa.length) {
    partes.push(contar(relatorio.semParSigaa.length, 'matrícula que não está na turma', 'matrículas que não estão na turma'))
  }
  if (relatorio.semParAdsum.length) {
    partes.push(contar(relatorio.semParAdsum.length, 'aluno do Adsum que não está na planilha', 'alunos do Adsum que não estão na planilha'))
  }
  const vaziasEmLancadas = relatorio.vaziasEmAulaLancada.reduce((soma, v) => soma + v.quantas, 0)
  if (vaziasEmLancadas) partes.push(contar(vaziasEmLancadas, 'vazia em aula já lançada', 'vazias em aulas já lançadas'))
  for (const { dia, motivo } of relatorio.semOndeLancar) {
    if (perguntadas.has(dia)) continue
    if (motivo === 'feriado') partes.push(`o feriado de ${curto(dia)}`)
    else if (motivo === 'cancelada') partes.push(`a aula cancelada de ${curto(dia)}`)
    else if (motivo === 'suspensa') partes.push(`a aula suspensa de ${curto(dia)}`)
    else if (motivo === 'foraDoPeriodo') partes.push(`a chamada de ${curto(dia)}, fora do período letivo,`)
    else partes.push(`a chamada de ${curto(dia)} que não está na planilha`)
  }
  for (const dia of relatorio.semMaximo) partes.push(`o dia ${curto(dia)} sem máximo na planilha`)
  if (partes.length === 0) return undefined
  const umSo = partes.length === 1 && /^(1 |o |a )/.test(partes[0])
  // A vírgula que fecha um aposto só fica quando ele é o último, antes do verbo.
  const semVirgula = partes.map((p, i) => (i < partes.length - 1 ? p.replace(/,$/, '') : p))
  return `${juntar(semVirgula)} ${umSo ? 'fica' : 'ficam'} de fora.`
}

/** Quantas aulas possíveis a folha oferece por chamada: as mais perto bastam. */
const OPCOES = 4

const EXPLICACAO: Record<Relatorio['semOndeLancar'][number]['motivo'], string> = {
  semColuna: 'O SIGAA não tem aula neste dia. Em qual aula ela entra?',
  feriado: 'O SIGAA tem este dia como feriado. Em qual aula ela entra?',
  cancelada: 'O SIGAA tem esta aula como cancelada. Em qual aula ela entra?',
  suspensa: 'O SIGAA tem esta aula como suspensa. Em qual aula ela entra?',
  foraDoPeriodo: 'Este dia está fora do período letivo. Em qual aula ela entra?',
}

const distancia = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`))

function chamadasSemLugar(relatorio: Relatorio): ChamadaSemLugar[] {
  return relatorio.semOndeLancar.flatMap(({ dia, motivo, presentes, faltas }) => {
    const opcoes = [...relatorio.aulasSemChamada]
      .sort((a, b) => distancia(a, dia) - distancia(b, dia) || a.localeCompare(b))
      .slice(0, OPCOES)
      .map((d) => ({ dia: d, rotulo: rotuloDoDia(d) }))
    return opcoes.length === 0 ? [] : [{ dia, rotulo: rotuloDoDia(dia), presentes, faltas, explicacao: EXPLICACAO[motivo], opcoes }]
  })
}

export function resumoDaFolha({
  relatorio,
  leitura,
  matriculados,
  desmarcadas,
}: {
  relatorio: Relatorio
  leitura: LeituraPlanilha
  matriculados: Matriculado[]
  desmarcadas: readonly Dia[]
}): ResumoDaFolha {
  const nomes = new Map(matriculados.filter((m) => m.turma === relatorio.turma).map((m) => [m.matricula, m.nome]))
  const nomeDe = (matricula: string) => nomes.get(matricula) ?? `matrícula ${matricula}`
  const fora = new Set<string>(desmarcadas)

  // O máximo mais comum da planilha (no empate, o menor): o dia fora dele avisa quanto a falta vale.
  const frequencia = new Map<number, number>()
  for (const c of leitura.colunas) if (c.maximo !== undefined) frequencia.set(c.maximo, (frequencia.get(c.maximo) ?? 0) + 1)
  const comum = [...frequencia].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
  const maximoDoDia = new Map(leitura.colunas.map((c) => [c.dia as string, c.maximo]))
  const compartilhado = new Map(relatorio.compartilhados.map((c) => [c.dia as string, c]))
  const avisoDo = (dia: Dia) => {
    const parte = compartilhado.get(dia)
    if (parte) return `Aula com outro professor no mesmo dia. Quem faltou ao seu bloco leva ${parte.parte} de ${parte.maximo} faltas.`
    const m = maximoDoDia.get(dia)
    return m !== undefined && comum !== undefined && m > comum ? `Dia de ${m} aulas: quem faltou leva ${m} faltas.` : undefined
  }

  const vindaDe = new Map(relatorio.remanejadas.map((r) => [r.para as string, r.de]))
  const origemDe = (dia: Dia) => {
    const de = vindaDe.get(dia)
    return de ? { de: { dia: de, rotulo: rotuloDoDia(de) } } : {}
  }
  const porDia = new Map<Dia, AulaDaFolha>()
  const diferencas: DiferencaDaFolha[] = []
  let aceitas = 0
  const iguais = new Set<Dia>()
  for (const c of relatorio.celulas) {
    if (c.categoria === 'aLancar') {
      let aula = porDia.get(c.dia)
      if (!aula) porDia.set(c.dia, (aula = { dia: c.dia, rotulo: rotuloDoDia(c.dia), presentes: 0, faltas: 0, ausentes: [], marcada: !fora.has(c.dia), aviso: avisoDo(c.dia), ...origemDe(c.dia) }))
      if (c.esperado === 0) aula.presentes += 1
      else {
        aula.faltas += 1
        aula.ausentes.push({ matricula: c.matricula, nome: nomeDe(c.matricula), faltas: c.esperado })
      }
    } else if (c.categoria === 'diverge') {
      diferencas.push({ matricula: c.matricula, nome: nomeDe(c.matricula), dia: c.dia, rotulo: rotuloDoDia(c.dia), sigaa: c.sigaa, esperado: c.esperado })
    } else if (c.categoria === 'confere') {
      iguais.add(c.dia)
      if (c.ajustada) aceitas += 1
    }
  }
  const aulas = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
  const semPar = relatorio.semParSigaa.length
  const total = leitura.linhas.length
  const pelaMatricula = semPar === 0 ? 'todos pela matrícula' : `${total - semPar} pela matrícula`
  const semLugar = chamadasSemLugar(relatorio)
  const aMao: AulaAMao[] = relatorio.lancadasPorOutro.map((a) => ({
    dia: a.dia,
    rotulo: rotuloDoDia(a.dia),
    parte: a.parte,
    presentes: a.presentes,
    ausentes: a.ausentes.map((m) => ({ matricula: m, nome: nomeDe(m) })),
  }))
  const informa = informativos(relatorio, leitura, new Set(semLugar.map((s) => s.dia)))

  if (aulas.length === 0 && diferencas.length === 0 && semLugar.length === 0 && aMao.length === 0) {
    const aceitasTexto = aceitas > 0 ? ` ${contar(aceitas, 'diferença aceita', 'diferenças aceitas')} por você.` : ''
    return {
      estado: 'tudoConfere',
      titulo: 'Tudo confere',
      apoio: iguais.size > 0 ? `SIGAA e Adsum iguais em ${contar(iguais.size, 'aula', 'aulas')}.${aceitasTexto}` : 'Nada do Adsum para lançar nesta planilha.',
      diferencas,
      aulas,
      semLugar,
      aMao,
      informativos: informa,
    }
  }

  const marcadas = aulas.filter((a) => a.marcada).length
  return {
    estado: 'lancar',
    titulo:
      aulas.length > 0
        ? `${contar(aulas.length, 'aula', 'aulas')} para lançar`
        : diferencas.length > 0
          ? `${contar(diferencas.length, 'diferença', 'diferenças')} para olhar`
          : semLugar.length > 0
            ? `${contar(semLugar.length, 'chamada', 'chamadas')} sem lugar no SIGAA`
            : `${contar(aMao.length, 'aula', 'aulas')} para lançar à mão`,
    apoio: `${relatorio.turma}. Planilha lida agora, ${contar(total, 'aluno', 'alunos')}, ${pelaMatricula}.`,
    diferencas,
    aulas,
    semLugar,
    aMao,
    informativos: informa,
    botao: aulas.length === 0 ? undefined : marcadas === 0 ? 'Nada marcado' : `Preencher ${contar(marcadas, 'aula', 'aulas')}`,
  }
}
