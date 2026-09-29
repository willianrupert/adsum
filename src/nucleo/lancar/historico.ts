// O que o Adsum mandou para a planilha, lançamento por lançamento, para os
// Ajustes (`docs/11`, passo 27). Sai da auditoria (`sigaa/<turma>.csv`): um
// Preencher grava todas as suas linhas com o mesmo instante.

import type { Dia, LinhaDeAuditoria } from './tipos.ts'

export interface Lancamento {
  turma: string
  quando: string
  dias: Dia[]
  faltas: number
  presencas: number
}

export function historicoDeLancamentos(linhas: readonly LinhaDeAuditoria[]): Lancamento[] {
  const porLancamento = new Map<string, Lancamento>()
  for (const l of linhas) {
    if (l.acao !== 'preenchimento') continue
    const chave = `${l.turma}\n${l.quando}`
    let lancamento = porLancamento.get(chave)
    if (!lancamento) porLancamento.set(chave, (lancamento = { turma: l.turma, quando: l.quando, dias: [], faltas: 0, presencas: 0 }))
    if (!lancamento.dias.includes(l.dia)) lancamento.dias.push(l.dia)
    if (Number(l.aplicado) > 0) lancamento.faltas += 1
    else lancamento.presencas += 1
  }
  return [...porLancamento.values()]
    .map((l) => ({ ...l, dias: [...l.dias].sort() }))
    .sort((a, b) => b.quando.localeCompare(a.quando) || a.turma.localeCompare(b.turma))
}
