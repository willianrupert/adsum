// A leitura da planilha do SIGAA (`docs/08`, camada 1): bruto → `LeituraPlanilha`.
//
// O favorito só extrai textos da página; quem interpreta é o Adsum, para que
// uma mudança do SIGAA se conserte com deploy, e não com favorito novo.
// **O formato do bruto é provisório** até o portão A (o HTML real): o que
// muda com ele é a extração, e a interpretação continua aqui.
//
// Nunca lança, nunca descarta linha calada. Coluna que não resolve para uma
// data única recusa a leitura inteira: data errada é falta no dia errado.

import { comoDia, type Celula, type ColunaDia, type Dia, type LeituraPlanilha, type LinhaAluno, type MotivoDeBloqueio } from './tipos.ts'

/** Os textos da página, como o favorito os encontra. Provisório: ver o topo. */
export interface BrutoPlanilha {
  rodape: string
  cabecalhoTurma: string
  /** O cabeçalho agrupado: cada mês cobre `colunas` dias, da esquerda para a direita. */
  meses: { texto: string; colunas: number }[]
  dias: { texto: string; maximoTexto?: string; marcaTexto?: string }[]
  linhas: { matriculaTexto: string; celulas: { valor: string; desabilitada: boolean; motivoTexto?: string }[] }[]
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

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').trim().toLowerCase()

/** `Março`, `MAR`, `mar.` → 3. */
function numeroDoMes(texto: string): number | undefined {
  const t = normalizar(texto)
  const i = MESES.findIndex((m) => m === t || m.slice(0, 3) === t)
  return i >= 0 ? i + 1 : undefined
}

const inteiroNaoNegativo = (texto: string): number | undefined => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : undefined)

function motivoDoBloqueio(texto: string | undefined): MotivoDeBloqueio | undefined {
  const t = normalizar(texto ?? '')
  if (t.includes('tranc')) return 'trancado'
  if (t.includes('posterior') || t.includes('depois')) return 'matriculadoDepois'
  if (t.includes('feriado')) return 'feriado'
  if (t.includes('cancel')) return 'cancelada'
  return undefined
}

function marcaDaColuna(texto: string | undefined): ColunaDia['marca'] {
  const t = normalizar(texto ?? '')
  if (t.includes('feriado')) return 'feriado'
  if (t.includes('cancel')) return 'cancelada'
  if (t.includes('lancad')) return 'lancado'
  return undefined
}

/** Recusa: a leitura inteira não serve. */
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
const lista = (v: unknown, onde: string): unknown[] => (Array.isArray(v) ? v : recusar(onde, 'formato desconhecido'))
const registro = (v: unknown, onde: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : recusar(onde, 'formato desconhecido')

function colunasDe(b: Record<string, unknown>, avisos: ProblemaDeLeitura[]): ColunaDia[] {
  const cabecalho = texto(b.cabecalhoTurma, 'cabeçalho')
  const ano = /\((\d{4})\.[12]\)/.exec(cabecalho)?.[1] ?? recusar('cabeçalho', 'semestre ilegível', cabecalho)

  const dias = lista(b.dias, 'dias').map((d, i) => registro(d, `coluna ${i + 1}`))
  const mesDaColuna: number[] = []
  for (const [i, bruto] of lista(b.meses, 'meses').entries()) {
    const m = registro(bruto, `mês ${i + 1}`)
    const nome = texto(m.texto, `mês ${i + 1}`)
    const mes = numeroDoMes(nome) ?? recusar(`mês ${i + 1}`, 'mês desconhecido', nome)
    const quantas = typeof m.colunas === 'number' && Number.isInteger(m.colunas) && m.colunas > 0 ? m.colunas : recusar(`mês ${i + 1}`, 'formato desconhecido')
    for (let k = 0; k < quantas; k++) mesDaColuna.push(mes)
  }
  if (mesDaColuna.length !== dias.length) {
    recusar('cabeçalho', `os meses cobrem ${mesDaColuna.length} colunas, e há ${dias.length} dias`)
  }

  const vistos = new Set<Dia>()
  return dias.map((d, indice) => {
    const onde = `coluna ${indice + 1}`
    const diaTexto = texto(d.texto, onde)
    const diaDoMes = inteiroNaoNegativo(diaTexto)
    const dia =
      (diaDoMes !== undefined && comoDia(`${ano}-${String(mesDaColuna[indice]).padStart(2, '0')}-${String(diaDoMes).padStart(2, '0')}`)) ||
      recusar(onde, 'data ilegível', diaTexto)
    if (vistos.has(dia)) recusar(onde, `data repetida: ${dia}`)
    vistos.add(dia)

    const coluna: ColunaDia = { indice, dia }
    if (typeof d.maximoTexto === 'string' && d.maximoTexto.trim() !== '') {
      const maximo = inteiroNaoNegativo(d.maximoTexto)
      if (maximo !== undefined && maximo > 0) coluna.maximo = maximo
      else avisos.push({ onde, conteudo: d.maximoTexto, motivo: 'máximo ilegível' })
    }
    const marca = marcaDaColuna(typeof d.marcaTexto === 'string' ? d.marcaTexto : undefined)
    if (marca) coluna.marca = marca
    return coluna
  })
}

function celulaDe(bruta: unknown, coluna: ColunaDia, onde: string): Celula {
  const c = registro(bruta, onde)
  if (c.desabilitada === true) {
    const doTexto = motivoDoBloqueio(typeof c.motivoTexto === 'string' ? c.motivoTexto : undefined)
    const daColuna = coluna.marca === 'feriado' || coluna.marca === 'cancelada' ? coluna.marca : undefined
    const motivo = doTexto ?? daColuna ?? recusar(onde, 'bloqueada por motivo desconhecido', String(c.motivoTexto ?? ''))
    return { tipo: 'bloqueada', motivo }
  }
  const valor = texto(c.valor, onde)
  if (valor.trim() === '') return { tipo: 'vazia' }
  const faltas = inteiroNaoNegativo(valor) ?? recusar(onde, 'valor ilegível', valor)
  return { tipo: 'lancada', faltas }
}

export function lerPlanilha(bruto: unknown, id: string): ResultadoDaLeitura {
  const avisos: ProblemaDeLeitura[] = []
  try {
    const b = registro(bruto, 'página')
    const colunas = colunasDe(b, avisos)
    const vistas = new Set<string>()
    const linhas: LinhaAluno[] = []
    for (const [indice, brutaLinha] of lista(b.linhas, 'linhas').entries()) {
      const onde = `linha ${indice + 1}`
      const l = registro(brutaLinha, onde)
      const matriculaTexto = texto(l.matriculaTexto, onde)
      const matricula = matriculaTexto.trim()
      if (!/^\d{6,14}$/.test(matricula)) {
        avisos.push({ onde, conteudo: matriculaTexto, motivo: 'matrícula ilegível' })
        continue
      }
      if (vistas.has(matricula)) recusar(onde, 'matrícula repetida', matricula)
      vistas.add(matricula)
      const celulas = lista(l.celulas, onde)
      if (celulas.length !== colunas.length) recusar(onde, `${celulas.length} células para ${colunas.length} dias`)
      linhas.push({ indice, matricula, celulas: celulas.map((c, j) => celulaDe(c, colunas[j], `${onde}, coluna ${j + 1}`)) })
    }
    const rodape = typeof b.rodape === 'string' ? b.rodape : ''
    return {
      leitura: {
        id,
        versaoSigaa: /v?(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(rodape)?.[1] ?? 'desconhecida',
        cabecalhoTurma: texto(b.cabecalhoTurma, 'cabeçalho'),
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
