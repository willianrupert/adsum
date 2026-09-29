// A leitura da planilha do SIGAA (`docs/08`, camada 1): bruto → `LeituraPlanilha`.
//
// O bruto é o modelo que a própria página guarda (`auxAulas`, `auxAlunos`, o
// período letivo; ver `docs/12`), mais o texto atual de cada célula, porque o
// professor pode ter clicado antes do favorito. As regras de bloqueio são as
// da página: o que ela não deixa lançar, a leitura marca como bloqueado.
//
// Nunca lança, nunca descarta linha calada. Registro fora do formato, aula
// sem data única ou aluno com aulas faltando recusam a leitura inteira: data
// errada é falta no dia errado.

import { comoDia, type Celula, type ColunaDia, type Dia, type LeituraPlanilha, type LinhaAluno, type MotivoDeBloqueio } from './tipos.ts'

/** O que o favorito tira da página. Ver `docs/12_planilha_sigaa.md`. */
export interface BrutoPlanilha {
  /** O `<legend>` da turma: `CIN0114 - NOME (60h) - Turma: 01 (2026.2)`. */
  legenda: string
  /** `dataInicioPeriodoLetivo` e `dataFimPeriodoLetivo`, como a página escreve. */
  periodo: { inicio: string; fim: string }
  auxAulas: string
  auxAlunos: string
  /** Texto atual das células, por `ID_MAT` e posição da aula. Sem ele, vale o registro. */
  textos?: Record<string, string[]>
  /** A versão do SIGAA, se o favorito achar; a planilha não a mostra. */
  versao?: string
}

export interface ProblemaDeLeitura {
  onde: string
  conteudo?: string
  motivo: string
}

export interface ResultadoDaLeitura {
  leitura?: LeituraPlanilha
  problemas: ProblemaDeLeitura[]
}

// Posições dos campos, com os nomes que o próprio SIGAA dá (`docs/12`).
const AULA = { DIA: 0, MES: 1, NUM_AULAS: 2, LANCADA: 4, FERIADO: 5, CANCELADA: 6, ANO: 8, SUSPENSA: 9, CAMPOS: 10 }
const ALUNO = { ID_MAT: 0, MAT: 1, DIA: 3, MES: 4, NUM_FALTAS: 5, TRANCADO: 11, IMPOSSIBILITADO: 12, BLOQUEADO: 14, CAMPOS: 16 }

class Recusa extends Error {
  readonly problema: ProblemaDeLeitura
  constructor(problema: ProblemaDeLeitura) {
    super(problema.motivo)
    this.problema = problema
  }
}

const recusar = (onde: string, motivo: string, conteudo?: string): never => {
  throw new Recusa(conteudo === undefined ? { onde, motivo } : { onde, conteudo, motivo })
}

const texto = (v: unknown, onde: string): string => (typeof v === 'string' ? v : recusar(onde, 'formato desconhecido'))
const registros = (v: unknown, onde: string, campos: number): string[][] => {
  const itens = texto(v, onde).split(';').filter((r) => r !== '').map((r) => r.split(','))
  if (itens.length === 0) recusar(onde, 'vazio')
  itens.forEach((r, i) => r.length !== campos && recusar(`${onde}, item ${i + 1}`, `formato desconhecido: ${r.length} campos, esperado ${campos}`))
  return itens
}

const inteiro = (t: string): number | undefined => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : undefined)
const doDia = (ano: string, mes: string, dia: string) => comoDia(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`)

/** `2026-08-10 00:00:00.0` → o dia. */
function diaDoPeriodo(v: unknown, onde: string): Dia {
  const t = texto(v, onde)
  return comoDia(t.slice(0, 10)) ?? recusar(onde, 'período letivo ilegível', t)
}

/** O dia de hoje no fuso de quem está na frente da página, como a trava da página compara. */
const hojeLocal = (agora: Date): Dia =>
  comoDia(`${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`)!

function colunasDe(b: Record<string, unknown>, avisos: ProblemaDeLeitura[]) {
  const vistos = new Set<Dia>()
  return registros(b.auxAulas, 'aulas', AULA.CAMPOS).map((a, indice) => {
    const onde = `aula ${indice + 1}`
    const dia = doDia(a[AULA.ANO], a[AULA.MES], a[AULA.DIA]) ?? recusar(onde, 'data ilegível', `${a[AULA.DIA]}/${a[AULA.MES]}/${a[AULA.ANO]}`)
    if (vistos.has(dia)) recusar(onde, `data repetida: ${dia}`)
    vistos.add(dia)
    const coluna: ColunaDia = { indice, dia }
    const maximo = inteiro(a[AULA.NUM_AULAS])
    if (maximo !== undefined && maximo > 0) coluna.maximo = maximo
    else avisos.push({ onde, conteudo: a[AULA.NUM_AULAS], motivo: 'máximo ilegível' })
    // A mesma ordem de precedência da página ao desenhar.
    if (a[AULA.FERIADO] === 'true') coluna.marca = 'feriado'
    else if (a[AULA.CANCELADA] === 'true') coluna.marca = 'cancelada'
    else if (a[AULA.SUSPENSA] === 'true') coluna.marca = 'suspensa'
    else if (a[AULA.LANCADA] === 'true') coluna.marca = 'lancado'
    return coluna
  })
}

export function lerPlanilha(bruto: unknown, id: string, agora: Date = new Date()): ResultadoDaLeitura {
  const avisos: ProblemaDeLeitura[] = []
  try {
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) recusar('página', 'formato desconhecido')
    const b = bruto as Record<string, unknown>
    const legenda = texto(b.legenda, 'cabeçalho')
    const periodo = (typeof b.periodo === 'object' && b.periodo !== null ? b.periodo : recusar('período', 'formato desconhecido')) as Record<string, unknown>
    const inicio = diaDoPeriodo(periodo.inicio, 'período')
    const fim = diaDoPeriodo(periodo.fim, 'período')
    const hoje = hojeLocal(agora)
    const textos = (typeof b.textos === 'object' && b.textos !== null ? b.textos : {}) as Record<string, unknown>

    const colunas = colunasDe(b, avisos)
    const todos = registros(b.auxAlunos, 'alunos', ALUNO.CAMPOS)

    // Os registros de um aluno vêm juntos e na ordem das aulas: é o que a coleta da página supõe.
    const porAluno: string[][][] = []
    for (const r of todos) {
      const ultimo = porAluno.at(-1)
      if (ultimo && ultimo[0][ALUNO.ID_MAT] === r[ALUNO.ID_MAT]) ultimo.push(r)
      else porAluno.push([r])
    }

    const vistas = new Set<string>()
    const linhas: LinhaAluno[] = []
    for (const [indice, regs] of porAluno.entries()) {
      const onde = `aluno ${indice + 1}`
      if (regs.length !== colunas.length) recusar(onde, `${regs.length} aulas, e a planilha tem ${colunas.length}`)
      regs.forEach((r, j) => {
        if (doDia(colunas[j].dia.slice(0, 4), r[ALUNO.MES], r[ALUNO.DIA]) !== colunas[j].dia) recusar(onde, 'registros fora da ordem das aulas')
      })
      const matricula = regs[0][ALUNO.MAT].trim()
      if (!/^\d{6,14}$/.test(matricula)) {
        avisos.push({ onde, conteudo: regs[0][ALUNO.MAT], motivo: 'matrícula ilegível' })
        continue
      }
      if (vistas.has(matricula)) recusar(onde, 'matrícula repetida', matricula)
      vistas.add(matricula)

      const idNaPagina = regs[0][ALUNO.ID_MAT]
      const textosDoAluno = Array.isArray(textos[idNaPagina]) ? (textos[idNaPagina] as unknown[]) : []
      const celulas = regs.map((r, j): Celula => {
        const coluna = colunas[j]
        const bloqueio: MotivoDeBloqueio | undefined =
          coluna.marca === 'feriado' || coluna.marca === 'cancelada' || coluna.marca === 'suspensa'
            ? coluna.marca
            : r[ALUNO.TRANCADO] === 'true'
              ? 'trancado'
              : r[ALUNO.IMPOSSIBILITADO] === 'true'
                ? 'matriculadoDepois'
                : r[ALUNO.BLOQUEADO] === 'true'
                  ? 'bloqueado'
                  : coluna.dia < inicio || coluna.dia > fim
                    ? 'foraDoPeriodo'
                    : coluna.dia > hoje
                      ? 'futura'
                      : undefined
        if (bloqueio) return { tipo: 'bloqueada', motivo: bloqueio }
        const atual = textosDoAluno[j]
        const valor = typeof atual === 'string' ? atual : r[ALUNO.NUM_FALTAS] === 'null' ? '' : r[ALUNO.NUM_FALTAS]
        if (valor.trim() === '') return { tipo: 'vazia' }
        const faltas = inteiro(valor) ?? recusar(`${onde}, aula ${j + 1}`, 'valor ilegível', valor)
        return { tipo: 'lancada', faltas }
      })
      linhas.push({ indice, matricula, celulas })
    }

    return {
      leitura: {
        id,
        versaoSigaa: typeof b.versao === 'string' && b.versao ? b.versao : 'desconhecida',
        cabecalhoTurma: legenda,
        colunas,
        linhas,
      },
      problemas: avisos,
    }
  } catch (erro) {
    if (erro instanceof Recusa) return { problemas: [...avisos, erro.problema] }
    return { problemas: [...avisos, { onde: 'página', motivo: 'formato desconhecido' }] }
  }
}
