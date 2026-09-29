// A planilha real do SIGAA da UFPE, anonimizada por `scripts/anonimizar_sigaa.py`.
// É a única forma de uma planilha de verdade entrar no repositório, como os
// cofres de `cofres/`. O que cada campo é: `docs/12_planilha_sigaa.md`.

import cin0114 from './sigaa/planilha-cin0114.json'

export interface PlanilhaCapturada {
  fonte: string
  legenda: string
  periodo: { inicio: string; fim: string }
  auxAulas: string
  auxAlunos: string
}

/** CIN0114, 29/09/2026: 45 alunos, 38 aulas, 12 lançadas, 1 feriado. */
export const PLANILHA_CIN0114 = cin0114 as PlanilhaCapturada

export const PLANILHAS: Record<string, PlanilhaCapturada> = { cin0114: PLANILHA_CIN0114 }
