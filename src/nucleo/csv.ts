// `registros/<turma>.csv` — a saída que a planilha consome.
//
// É o único CSV que sobrou. Vínculos e turmas viram JSON no cofre (ver
// `cofre.ts`), porque são reescritos por inteiro quando alguém corrige um nome.
// Registro nunca é corrigido: linha nova sempre.
//
// `;` e BOM não vieram de firmware nenhum, ao contrário do que este arquivo já
// afirmou. São do Excel em português: com vírgula a planilha abre como uma
// coluna só, e sem BOM "João" vira "JoÃ£o". Quem decide o formato é o
// consumidor real, e o consumidor real é a planilha.
//
// Leitura nunca descarta linha em silêncio. 46 alunos onde deveria haver 48,
// sem explicação, é bug — não economia de mensagem.

import type { Evento, Origem, Resultado } from './tipos.ts'

const BOM = '﻿'
const SEP = ';'

export const COLUNAS = [
  'evento_id',
  'quando',
  'turma',
  'matricula',
  'nome',
  'origem',
  'resultado',
  'uid_hash',
] as const

export const CABECALHO = COLUNAS.join(SEP)

const ORIGENS: Origem[] = ['cracha', 'professor', 'manual']
const RESULTADOS: Resultado[] = ['ok', 'duplicado', 'desconhecido']

export interface Problema {
  linha: number
  texto: string
  motivo: string
}

export interface Leitura {
  itens: Evento[]
  problemas: Problema[]
}

/** `;` e quebra de linha não cabem num campo sem aspas. */
function limpar(campo: string): string {
  return campo.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Uma linha, sem quebra. É a unidade de escrita: o log cresce por append. */
export function linhaCsv(e: Evento): string {
  return [
    e.eventoId,
    e.quando,
    limpar(e.turma),
    limpar(e.matricula ?? ''),
    limpar(e.nome),
    e.origem,
    e.resultado,
    e.uidHash,
  ].join(SEP)
}

/** BOM e cabeçalho. Vai uma vez, quando o arquivo nasce. */
export function cabecalhoCsv(): string {
  return BOM + CABECALHO + '\n'
}

export function paraCsv(eventos: Evento[]): string {
  return cabecalhoCsv() + eventos.map((e) => linhaCsv(e) + '\n').join('')
}

export function deCsv(texto: string): Leitura {
  const itens: Evento[] = []
  const problemas: Problema[] = []

  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((crua, i) => ({ numero: i + 1, crua }))
    .filter(({ crua }) => crua.trim() !== '')

  for (const { numero, crua } of linhas) {
    const campos = crua.split(SEP).map((c) => c.trim())
    if (campos[0] === 'evento_id') continue

    const recusar = (motivo: string) => problemas.push({ linha: numero, texto: crua, motivo })

    if (campos.length !== COLUNAS.length) {
      recusar(`${campos.length} colunas, esperado ${COLUNAS.length}`)
      continue
    }

    const [eventoId, quando, turma, matricula, nome, origem, resultado, uidHash] = campos

    if (!eventoId) {
      recusar('sem evento_id — sem ele não há idempotência')
      continue
    }
    if (Number.isNaN(Date.parse(quando))) {
      recusar(`"${quando}" não é uma data ISO 8601`)
      continue
    }
    if (!ORIGENS.includes(origem as Origem)) {
      recusar(`origem "${origem}" desconhecida`)
      continue
    }
    if (!RESULTADOS.includes(resultado as Resultado)) {
      recusar(`resultado "${resultado}" desconhecido`)
      continue
    }

    itens.push({
      eventoId,
      quando,
      turma,
      matricula: matricula || undefined,
      nome,
      origem: origem as Origem,
      resultado: resultado as Resultado,
      uidHash,
    })
  }

  return { itens, problemas }
}

/** Um arquivo por turma: cada turma vira uma planilha. */
export function porTurma(eventos: Evento[]): Map<string, Evento[]> {
  const mapa = new Map<string, Evento[]>()
  for (const evento of eventos) {
    const lista = mapa.get(evento.turma) ?? []
    lista.push(evento)
    mapa.set(evento.turma, lista)
  }
  return mapa
}

/**
 * `IF685 · T01` → `IF685-T01`, que é nome de arquivo em qualquer sistema.
 *
 * Mora aqui e é usado também pelo cofre, para que `turmas/IF685-T01.json` e
 * `registros/IF685-T01.csv` sejam reconhecíveis como a mesma turma por quem
 * abrir a pasta no Finder.
 */
export function nomeSeguroDeTurma(turma: string): string {
  return (
    turma
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'turma'
  )
}

export function nomeDoArquivo(turma: string): string {
  return `${nomeSeguroDeTurma(turma)}.csv`
}
