// A conciliação: o que o SIGAA tem × o que o Adsum diria (`docs/08`, camada 2).
//
// Função pura. A presença de cada dia vem de `presencasDoDia`, a mesma regra
// da planilha de faltas, para que o SIGAA e o arquivo da pasta nunca discordem.
// Na dúvida, a célula fica fora e o motivo aparece: nunca se adivinha.

import { chaveDeIdentidade, diaLocal, presencasDoDia } from '../faltas.ts'
import type { Evento, Matriculado } from '../tipos.ts'
import { comoDia, type AjusteSigaa, type Conciliada, type Dia, type LinhaDeAuditoria, type LeituraPlanilha, type Relatorio, type RemanejoSigaa, type SemOndeLancar } from './tipos.ts'

export interface EntradaDaConciliacao {
  leitura: LeituraPlanilha
  turma: string
  matriculados: Matriculado[]
  /** Mais recente primeiro, como `listarEventos`. */
  eventos: Evento[]
  ajustes: AjusteSigaa[]
  /** A aula dada em outra data: a decisão do professor de onde a chamada entra. */
  remanejos?: RemanejoSigaa[]
  /** A auditoria da turma: quanto valeu a falta nas aulas que o Adsum já lançou. */
  auditoria?: LinhaDeAuditoria[]
  /** Quanto vale a falta em cada aula, escolhido pelo professor nesta folha. */
  escolhas?: Partial<Record<Dia, number>>
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

/** Dia em que não houve aula, pelo SIGAA: nada a lançar nele. */
const semAula = (c: { marca?: string }) => c.marca === 'feriado' || c.marca === 'cancelada' || c.marca === 'suspensa'

/**
 * De que chamada vem cada aula da página. A própria, e a de outro dia quando
 * o professor decidiu (`RemanejoSigaa`). A decisão vale só para aula que a
 * página tem, que não é feriado, cancelada nem suspensa, e que **não tem
 * chamada própria**: nenhuma chamada apaga outra. Duas para a mesma aula, a
 * mais nova vale.
 */
function fontesDasAulas(leitura: LeituraPlanilha, turma: string, diasDeChamada: Set<Dia>, remanejos: RemanejoSigaa[]) {
  const ultimo = new Map<Dia, RemanejoSigaa>()
  for (const r of remanejos) {
    if (r.turma !== turma) continue
    const atual = ultimo.get(r.de)
    if (!atual || r.em >= atual.em) ultimo.set(r.de, r)
  }
  const porDia = new Map(leitura.colunas.map((c) => [c.dia as string, c]))
  const porPara = new Map<Dia, RemanejoSigaa>()
  for (const r of ultimo.values()) {
    const coluna = porDia.get(r.para)
    // Desfazer (`para` igual a `de`) cai aqui também: a aula de destino é a da própria chamada.
    if (!diasDeChamada.has(r.de) || diasDeChamada.has(r.para) || !coluna || semAula(coluna)) continue
    const atual = porPara.get(r.para)
    if (!atual || r.em >= atual.em) porPara.set(r.para, r)
  }
  const fonte = new Map<Dia, Dia>([...diasDeChamada].map((d) => [d, d]))
  const saiu = new Set<Dia>()
  for (const r of porPara.values()) saiu.add(r.de)
  for (const d of saiu) fonte.delete(d)
  for (const r of porPara.values()) fonte.set(r.para, r.de)
  const remanejadas = [...porPara.values()].map((r) => ({ de: r.de, para: r.para })).sort((a, b) => a.para.localeCompare(b.para))
  return { fonte, saiu, remanejadas }
}

export function conciliar({ leitura, turma, matriculados, eventos, ajustes, remanejos = [], auditoria = [], escolhas = {} }: EntradaDaConciliacao): Relatorio {
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
  const presenteNo = (dia: Dia, matricula: string) => presencas.get(dia)?.get(chaveDeIdentidade({ matricula, nome: '' }))?.presente ?? false
  const { fonte, saiu, remanejadas } = fontesDasAulas(leitura, turma, diasDeChamada, remanejos)

  // Dia com o que lançar e sem máximo: inteiro fora, com o motivo.
  const semMaximo = leitura.colunas
    .filter((c) => c.maximo === undefined && !semAula(c) && fonte.has(c.dia))
    .map((c) => c.dia)
  const diaSemMaximo = new Set(semMaximo)

  /**
   * Quanto vale a falta em cada aula (`docs/13`). Só o professor sabe se a
   * chamada foi da aula inteira ou só do bloco dele, quando o dia tem outro
   * professor: vale a escolha dele nesta folha; sem ela, o que o Adsum lançou
   * naquela aula ou, antes, na última do mesmo dia da semana; sem nenhuma, o
   * máximo da coluna. Sempre entre 1 e o máximo.
   */
  const lancadas = auditoria
    .filter((a) => a.turma === turma && a.acao === 'preenchimento' && Number(a.aplicado) > 0)
    .sort((a, b) => b.quando.localeCompare(a.quando))
  const semana = (dia: string) => new Date(`${dia}T12:00:00`).getDay()
  const valorDaFalta = leitura.colunas.flatMap((c) => {
    if (c.maximo === undefined || !fonte.has(c.dia)) return []
    const anterior = lancadas.find((a) => a.dia === c.dia) ?? lancadas.find((a) => semana(a.dia) === semana(c.dia))
    const valor = escolhas[c.dia] ?? (anterior ? Number(anterior.aplicado) : c.maximo)
    return [{ dia: c.dia, valor: Math.min(c.maximo, Math.max(1, Math.round(valor))), maximo: c.maximo }]
  })
  const valorNo = new Map(valorDaFalta.map((v) => [v.dia as string, v.valor]))

  /**
   * O que o Adsum diria para a célula, ou `undefined` se não tem o que dizer.
   * Sem máximo na página, nada: nem o ajuste, que precisa caber na faixa dela.
   */
  const esperado = (matricula: string, coluna: (typeof leitura.colunas)[number]) => {
    if (coluna.maximo === undefined) return undefined
    const ajuste = vigentes.get(`${coluna.dia}|${matricula}`)
    if (ajuste) return ajuste.valor >= 0 && ajuste.valor <= coluna.maximo ? { valor: ajuste.valor, ajustada: true } : undefined
    const origem = fonte.get(coluna.dia)
    if (!daTurma.has(matricula) || !origem) return undefined
    return { valor: presenteNo(origem, matricula) ? 0 : valorNo.get(coluna.dia)!, ajustada: false }
  }

  const celulas: Conciliada[] = []
  const vaziasEmLancada = new Map<Dia, number>()
  for (const linha of leitura.linhas) {
    for (const coluna of leitura.colunas) {
      const posicao = { linha: linha.indice, coluna: coluna.indice, matricula: linha.matricula, dia: coluna.dia }
      const sigaa = linha.celulas[coluna.indice]
      const e = diaSemMaximo.has(coluna.dia) ? undefined : esperado(linha.matricula, coluna)
      if (sigaa.tipo === 'bloqueada' || (diaSemMaximo.has(coluna.dia) && daTurma.has(linha.matricula))) {
        celulas.push({ ...posicao, categoria: 'fora' })
      } else if (sigaa.tipo === 'vazia' && coluna.marca === 'lancado') {
        celulas.push({ ...posicao, categoria: 'fora' })
        vaziasEmLancada.set(coluna.dia, (vaziasEmLancada.get(coluna.dia) ?? 0) + 1)
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
  const naTurma = leitura.linhas.filter((l) => daTurma.has(l.matricula))
  const semOndeLancar: SemOndeLancar[] = [...diasDeChamada].sort().flatMap((dia): SemOndeLancar[] => {
    if (saiu.has(dia)) return []
    const presentes = naTurma.filter((l) => presenteNo(dia, l.matricula)).length
    const contas = { presentes, faltas: naTurma.length - presentes }
    const coluna = porDia.get(dia)
    if (!coluna) return [{ dia, motivo: 'semColuna', ...contas }]
    if (coluna.marca === 'feriado' || coluna.marca === 'cancelada' || coluna.marca === 'suspensa') return [{ dia, motivo: coluna.marca, ...contas }]
    // A página recusa o dia inteiro fora do período letivo (`docs/12`): nenhuma célula aceita valor.
    const daColuna = leitura.linhas.map((l) => l.celulas[coluna.indice])
    if (daColuna.length > 0 && daColuna.every((c) => c.tipo === 'bloqueada' && c.motivo === 'foraDoPeriodo')) return [{ dia, motivo: 'foraDoPeriodo', ...contas }]
    return []
  })

  return {
    turma,
    celulas,
    semParSigaa: leitura.linhas.map((l) => l.matricula).filter((m) => !daTurma.has(m)),
    semParAdsum: alunos.map((a) => a.matricula).filter((m) => !naPagina.has(m)),
    semOndeLancar,
    semMaximo,
    vaziasEmAulaLancada: [...vaziasEmLancada].map(([dia, quantas]) => ({ dia, quantas })),
    remanejadas,
    aulasSemChamada: leitura.colunas
      .filter(
        (c) =>
          c.maximo !== undefined &&
          c.marca === undefined &&
          !fonte.has(c.dia) &&
          leitura.linhas.some((l) => l.celulas[c.indice].tipo === 'vazia'),
      )
      .map((c) => c.dia),
    valorDaFalta,
  }
}

/** Parte das matrículas da página que precisa estar na turma para ela ser a turma. */
export const COBERTURA_MINIMA = 0.8

export type EscolhaDeTurma =
  | { turma: string }
  /** Sem o código no nome, mas com as matrículas: o professor confirma. */
  | { confirmar: string; codigo: string }
  | { recusa: 'nenhuma' | 'duas'; candidatas: string[] }

/** Código de disciplina: `CIN0144`, `IF685`. `T01` e `2026.2` não são. */
const CODIGO = /\b[A-Z]{2,6}\d{2,5}\b/g

/** O cabeçalho do SIGAA começa pelo código: `CIN0144 - … - Turma: 01 (2026.2)`. */
const codigoDaPagina = (cabecalho: string) => /^\s*([A-Z]{2,6}\d{2,5})\b/.exec(cabecalho)?.[1]

/** O nome da turma é texto livre do professor: o código vale em qualquer lugar dele. */
const codigosDaTurma = (turma: string) => new Set(turma.match(CODIGO) ?? [])

/**
 * A turma do Adsum cujo nome traz o código do cabeçalho **e** cujas
 * matrículas cobrem a página. Lançar na turma errada seria falta para quem
 * estava presente, e por isso nada aqui adivinha:
 *
 * - com o código no nome, uma turma só: é ela;
 * - sem turma com o código, uma turma **sem código nenhum** no nome que
 *   cubra a página é proposta, e o professor confirma. A mesma gente cursa
 *   outras disciplinas: a matrícula sozinha não decide, o professor decide;
 * - turma com **outro** código é de outra disciplina, e nunca serve;
 * - duas que servem: o professor escolhe. Nenhuma: recusa.
 */
export function escolherTurma(
  leitura: LeituraPlanilha,
  matriculados: Matriculado[],
  /** Código → turma que o professor já confirmou: não se pergunta de novo. */
  confirmadas: Readonly<Record<string, string>> = {},
): EscolhaDeTurma {
  const codigo = codigoDaPagina(leitura.cabecalhoTurma)
  if (!codigo || leitura.linhas.length === 0) return { recusa: 'nenhuma', candidatas: [] }
  const porTurma = new Map<string, Set<string>>()
  for (const m of matriculados) {
    if (m.papel !== 'aluno') continue
    let s = porTurma.get(m.turma)
    if (!s) porTurma.set(m.turma, (s = new Set()))
    s.add(m.matricula)
  }
  const cobrem = [...porTurma]
    .filter(([, matriculas]) => leitura.linhas.filter((l) => matriculas.has(l.matricula)).length / leitura.linhas.length >= COBERTURA_MINIMA)
    .map(([turma]) => turma)

  const comCodigo = cobrem.filter((t) => codigosDaTurma(t).has(codigo))
  if (comCodigo.length === 1) return { turma: comCodigo[0] }
  if (comCodigo.length > 1) return { recusa: 'duas', candidatas: comCodigo }
  const semCodigo = cobrem.filter((t) => codigosDaTurma(t).size === 0)
  if (semCodigo.length === 1) return confirmadas[codigo] === semCodigo[0] ? { turma: semCodigo[0] } : { confirmar: semCodigo[0], codigo }
  return { recusa: semCodigo.length > 1 ? 'duas' : 'nenhuma', candidatas: semCodigo }
}
