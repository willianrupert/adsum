// `sigaa/<turma>.csv`: o registro do que o Adsum fez na planilha do SIGAA.
//
// Uma linha por célula tocada ou divergente, em cada conferência,
// preenchimento, desfazer e aceite. Sem nome, sem turma (é o nome do
// arquivo), `;` e BOM como os outros CSV. Só acréscimo. É também de onde os
// ajustes voltam quando a base é refeita: a pasta é a dona.

import { comoDia, type AjusteSigaa, type LinhaDeAuditoria } from './tipos.ts'

const BOM = '﻿'
const SEP = ';'
const ACOES: readonly LinhaDeAuditoria['acao'][] = ['conferencia', 'preenchimento', 'desfeito', 'aceite']

export const CABECALHO_DA_AUDITORIA = 'quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado'

export const cabecalhoDaAuditoria = () => BOM + CABECALHO_DA_AUDITORIA + '\n'

const limpar = (campo: string) => campo.replace(/[;\r\n]+/g, ' ').trim()

export function linhaDaAuditoria(l: LinhaDeAuditoria): string {
  return [l.quando, l.acao, l.versaoSigaa, l.dia, l.matricula, l.lido, l.proposto, l.aplicado].map(limpar).join(SEP)
}

export interface ProblemaDaAuditoria {
  linha: number
  texto: string
  motivo: string
}

/** Nunca descarta linha calada: a que não serve vira problema, com número e conteúdo. */
export function deCsvDaAuditoria(texto: string, turma: string): { itens: LinhaDeAuditoria[]; problemas: ProblemaDaAuditoria[] } {
  const itens: LinhaDeAuditoria[] = []
  const problemas: ProblemaDaAuditoria[] = []
  texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((crua, i) => {
      if (crua.trim() === '' || crua.trim() === CABECALHO_DA_AUDITORIA) return
      const recusar = (motivo: string) => problemas.push({ linha: i + 1, texto: crua, motivo })
      const campos = crua.split(SEP).map((c) => c.trim())
      if (campos.length !== 8) return recusar(`${campos.length} colunas, esperado 8`)
      const [quando, acao, versaoSigaa, diaTexto, matricula, lido, proposto, aplicado] = campos
      if (Number.isNaN(Date.parse(quando))) return recusar(`"${quando}" não é uma data`)
      if (!ACOES.includes(acao as LinhaDeAuditoria['acao'])) return recusar(`ação desconhecida: "${acao}"`)
      const dia = comoDia(diaTexto)
      if (!dia) return recusar(`"${diaTexto}" não é um dia de aula`)
      if (acao === 'aceite' && !/^\d+$/.test(aplicado)) return recusar('aceite sem o valor aceito')
      itens.push({ turma, quando, acao: acao as LinhaDeAuditoria['acao'], versaoSigaa, dia, matricula, lido, proposto, aplicado })
    })
  return { itens, problemas }
}

/** Cada aceite é um ajuste: o valor que o professor aceitou (`aplicado`), na hora dele. */
export function ajustesDaAuditoria(linhas: LinhaDeAuditoria[]): AjusteSigaa[] {
  return linhas
    .filter((l) => l.acao === 'aceite' && /^\d+$/.test(l.aplicado))
    .map((l) => ({ turma: l.turma, dia: l.dia, matricula: l.matricula, valor: Number(l.aplicado), em: l.quando }))
}
