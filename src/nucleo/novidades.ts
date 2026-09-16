// O que mudou, para quem já usa o Adsum.
//
// Lista estática, versionada junto com o build — nenhum servidor, nenhuma
// busca remota: "nada sai do computador" (CLAUDE.md) vale também para o que
// entra. `ui/Fluxo.tsx` compara `NOVIDADES[0].versao` com a última versão
// vista (`ambiente/preferencias.ts`) e mostra um toast de uma linha quando
// elas divergem.

export interface Novidade {
  versao: string
  resumo: string
}

/** A mais recente primeiro — é ela que decide se há novidade a mostrar. */
export const NOVIDADES: Novidade[] = [
  {
    // Sufixo porque já existe uma entrada de "2026-09-16" — precisa ser um
    // texto diferente do que quem já viu a novidade anterior tem gravado,
    // senão o toast novo nunca dispara para essas pessoas.
    versao: '2026-09-16-2',
    resumo:
      'Crachá não cai mais com a aba ocupada · Grade com opção simplificada e completa · Ajustes reorganizado · Vínculos mostra o nome completo',
  },
  {
    versao: '2026-09-16',
    resumo:
      'Professores ganharam seção própria na chamada, e a grade passou a reconhecer mais de um professor por turma.',
  },
]
