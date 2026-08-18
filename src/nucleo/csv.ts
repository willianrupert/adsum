// Os três arquivos do cartão, em texto.
//
// O formato não é escolha deste app: é o que o Adsum A1 grava e lê. Compatível
// de verdade significa que dá para arrastar `alunos.csv` do volume `ADSUM` para
// cá, e o `registros.csv` daqui para a planilha, sem conversor no meio.
//
// Separador `;` porque é o que o Excel brasileiro abre sem perguntar nada, e
// BOM porque sem ele o Excel lê UTF-8 como Latin-1 e "João" vira "JoÃ£o".
//
// Toda leitura devolve os problemas junto com o resultado. Linha descartada em
// silêncio é o mesmo defeito da recusa muda: o professor vê 46 alunos onde
// deveria haver 48 e nada na tela diz por quê.

import type { Aula, Evento, Origem, Papel, Resultado, Vinculo } from './tipos.ts'

const BOM = '﻿'
const SEP = ';'

export interface Problema {
  linha: number
  texto: string
  motivo: string
}

export interface Leitura<T> {
  itens: T[]
  problemas: Problema[]
}

/**
 * `;` e quebra de linha não cabem num campo sem aspas — e aspas o firmware não
 * lê. Espaços em excesso somem junto: "Silva; Maria" vira "Silva Maria", não
 * "Silva  Maria", porque o nome vai para uma coluna de largura contada em pixel.
 */
function limpar(campo: string): string {
  return campo.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function linhasUteis(texto: string): { numero: number; campos: string[]; crua: string }[] {
  return texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((crua, i) => ({ numero: i + 1, crua, campos: crua.split(SEP).map((c) => c.trim()) }))
    .filter(({ crua }) => crua.trim() !== '' && !crua.trimStart().startsWith('#'))
}

// ── alunos.csv ────────────────────────────────────────────────────────────────
// `uid_hash;papel;nome`, com `A` para aluno e `P` para professor.

const PARA_LETRA: Record<Papel, string> = { aluno: 'A', professor: 'P' }

export function paraCsvVinculos(vinculos: Vinculo[]): string {
  return (
    BOM +
    vinculos
      .map((v) => [v.uidHash, PARA_LETRA[v.papel], limpar(v.nome)].join(SEP))
      .join('\n') +
    '\n'
  )
}

export function deCsvVinculos(texto: string, criadoEm = new Date().toISOString()): Leitura<Vinculo> {
  const itens: Vinculo[] = []
  const problemas: Problema[] = []

  for (const { numero, campos, crua } of linhasUteis(texto)) {
    const [hash, segundo, terceiro] = campos
    if (!/^[0-9a-f]{16}$/i.test(hash ?? '')) {
      problemas.push({ linha: numero, texto: crua, motivo: 'uid_hash não tem 16 dígitos hexadecimais' })
      continue
    }

    // O formato antigo era `hash;nome`, sem papel. Uma tabela gravada antes de o
    // papel existir não se perde: vira aluno, que é o que ela sempre significou.
    const temPapel = campos.length >= 3
    const letra = temPapel ? (segundo ?? '').toUpperCase() : 'A'
    const nome = temPapel ? terceiro : segundo

    if (letra !== 'A' && letra !== 'P') {
      problemas.push({ linha: numero, texto: crua, motivo: `papel "${segundo}" não é A nem P` })
      continue
    }
    if (!nome?.trim()) {
      problemas.push({ linha: numero, texto: crua, motivo: 'sem nome' })
      continue
    }

    itens.push({
      uidHash: hash.toLowerCase(),
      papel: letra === 'P' ? 'professor' : 'aluno',
      nome: nome.trim(),
      criadoEm,
    })
  }

  return { itens, problemas }
}

// ── grade.csv ─────────────────────────────────────────────────────────────────
// `hash_prof;dia;hh:mm;hh:mm;turma`, dia 0 = domingo … 6 = sábado.

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function horaValida(hhmm: string): boolean {
  const casou = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!casou) return false
  const h = Number(casou[1])
  const m = Number(casou[2])
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

function normalizarHora(hhmm: string): string {
  const [h, m] = hhmm.trim().split(':')
  return `${h.padStart(2, '0')}:${m}`
}

export function paraCsvGrade(aulas: Aula[]): string {
  return (
    BOM +
    aulas
      .map((a) =>
        [a.uidHashProfessor, a.dia, a.inicio, a.fim, limpar(a.turma)].join(SEP),
      )
      .join('\n') +
    '\n'
  )
}

export function deCsvGrade(texto: string): Leitura<Aula> {
  const itens: Aula[] = []
  const problemas: Problema[] = []

  for (const { numero, campos, crua } of linhasUteis(texto)) {
    const [hash, dia, inicio, fim, ...resto] = campos
    const turma = resto.join(SEP).trim()

    if (!/^[0-9a-f]{16}$/i.test(hash ?? '')) {
      problemas.push({ linha: numero, texto: crua, motivo: 'uid_hash do professor inválido' })
      continue
    }
    const numeroDoDia = Number(dia)
    if (!Number.isInteger(numeroDoDia) || numeroDoDia < 0 || numeroDoDia > 6) {
      problemas.push({ linha: numero, texto: crua, motivo: `dia "${dia}" fora de 0–6` })
      continue
    }
    if (!horaValida(inicio ?? '') || !horaValida(fim ?? '')) {
      problemas.push({ linha: numero, texto: crua, motivo: 'horário fora do formato hh:mm' })
      continue
    }
    if (!turma) {
      problemas.push({ linha: numero, texto: crua, motivo: 'sem turma' })
      continue
    }

    itens.push({
      uidHashProfessor: hash.toLowerCase(),
      dia: numeroDoDia,
      inicio: normalizarHora(inicio),
      fim: normalizarHora(fim),
      turma,
    })
  }

  return { itens, problemas }
}

// ── registros.csv ─────────────────────────────────────────────────────────────
// `evento_id;sessao_id;timestamp;turma;login;nome;origem;resultado`

export const CABECALHO_REGISTROS =
  'evento_id;sessao_id;timestamp;turma;login;nome;origem;resultado'

const ORIGENS: Origem[] = ['cracha', 'professor', 'manual']
const RESULTADOS: Resultado[] = ['ok', 'duplicado', 'desconhecido']

export function paraCsvEventos(eventos: Evento[]): string {
  const linhas = eventos.map((e) =>
    [
      e.eventoId,
      e.sessaoId,
      e.timestamp,
      limpar(e.turma),
      limpar(e.login ?? ''),
      limpar(e.nome),
      e.origem,
      e.resultado,
    ].join(SEP),
  )
  return BOM + [CABECALHO_REGISTROS, ...linhas].join('\n') + '\n'
}

export function deCsvEventos(texto: string): Leitura<Evento> {
  const itens: Evento[] = []
  const problemas: Problema[] = []

  for (const { numero, campos, crua } of linhasUteis(texto)) {
    if (campos[0] === 'evento_id') continue
    const [eventoId, sessaoId, timestamp, turma, login, nome, origem, resultado] = campos

    if (campos.length < 8) {
      problemas.push({ linha: numero, texto: crua, motivo: `${campos.length} colunas, esperado 8` })
      continue
    }
    if (!eventoId) {
      problemas.push({ linha: numero, texto: crua, motivo: 'sem evento_id — sem ele não há idempotência' })
      continue
    }
    if (Number.isNaN(Date.parse(timestamp))) {
      problemas.push({ linha: numero, texto: crua, motivo: `timestamp "${timestamp}" ilegível` })
      continue
    }
    if (!ORIGENS.includes(origem as Origem)) {
      problemas.push({ linha: numero, texto: crua, motivo: `origem "${origem}" desconhecida` })
      continue
    }
    if (!RESULTADOS.includes(resultado as Resultado)) {
      problemas.push({ linha: numero, texto: crua, motivo: `resultado "${resultado}" desconhecido` })
      continue
    }

    itens.push({
      eventoId,
      sessaoId,
      timestamp,
      turma,
      login: login || undefined,
      nome,
      // O CSV do cartão não carrega o uid_hash: ele guarda nome e login, e o
      // hash mora na tabela de vínculos. Importar registros não reconstrói isso.
      uidHash: '',
      origem: origem as Origem,
      resultado: resultado as Resultado,
    })
  }

  return { itens, problemas }
}
