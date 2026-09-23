import { semDono } from '../ambiente/diario.ts'
// O popup de presenças — o "leitor de CSV" pedido, à mão.
//
// Não é Ajustes. Ajustes é para quem está mexendo em configuração; isto é
// para "quero ver quem veio", a pergunta mais comum fora do horário de aula
// — por isso mora no repouso, não atrás da engrenagem.

import { startTransition, useCallback, useEffect, useState } from 'react'
import type { Aula } from '../nucleo/grade.ts'
import { uidHashSintetico } from '../nucleo/hash.ts'
import { gravarEventoNovo } from '../portas/Repositorio.ts'
import type { Evento, Matriculado } from '../nucleo/tipos.ts'
import { useAdsum } from './adsum.ts'
import { Sheet } from './componentes/Sheet.tsx'
import { GradeDePresencas } from './componentes/GradeDePresencas.tsx'

/**
 * O corpo da tela, sem a folha em volta — para quando ela já existe e só o
 * conteúdo troca (ver `Fluxo.tsx`: Ajustes → Presenças reaproveita a mesma
 * folha aberta, em vez de fechar uma e abrir outra). `TelaPresencas`, abaixo,
 * é a versão que se basta sozinha — usada direto do repouso e na vitrine.
 */
export function ConteudoDePresencas({
  nomeDaPasta,
  aoRegistrar,
  aoMudarBase,
}: {
  nomeDaPasta?: string
  /**
   * Grava a linha no log da pasta, o mesmo caminho de qualquer evento de
   * crachá (`gravarLinha`, em `Fluxo.tsx`). Sem isto, corrigir presença
   * aqui gravava certo no IndexedDB — a tela mostrava a correção — mas o
   * CSV na pasta nunca recebia a linha. Reproduzido ao vivo, 17/09/2026:
   * professor marcou presença manual de um aluno sem crachá, a tela
   * confirmou, e o arquivo na pasta não mudou.
   */
  aoRegistrar?: (evento: Evento) => Promise<void>
  /** Recalcula e regrava a planilha de faltas da turma corrigida — sem
      isto, `faltas/<turma>.csv` também ficava atrás da correção. */
  aoMudarBase?: (turma: string) => void
} = {}) {
  const { repositorio, config } = useAdsum()
  const [turmas, setTurmas] = useState<string[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])

  const carregar = useCallback(async () => {
    const [t, e, m, a] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarEventos(),
      repositorio.listarMatriculados(),
      repositorio.listarAulas(),
    ])
    // `startTransition`: montar a planilha recalcula `planilhaDeFaltas` para
    // cada aluno contra todo o histórico de eventos — pesado o bastante para
    // competir, no mesmo quadro, com a folha ainda subindo (a animação de
    // `Sheet`). Marcada como transição, a atualização cede a vez a essa
    // animação em vez de travá-la — a leve travada que existia ao abrir "Ver
    // presenças" era exatamente esse recálculo caindo em cima do primeiro
    // quadro.
    startTransition(() => {
      setTurmas(t)
      setEventos(e)
      setMatriculados(m)
      setAulas(a)
    })
  }, [repositorio])

  useEffect(() => {
    semDono('carregar presenças', carregar)
  }, [carregar])

  /**
   * Marcar ou tirar presença à mão. Nunca apaga nem troca o que já existe —
   * grava um evento novo, `origem: 'manual'`, no meio-dia daquele dia (não
   * houve toque real, então não há hora real para registrar). O log continua
   * só-acréscimo; `planilhaDeFaltas` decide a célula pelo evento manual mais
   * recente daquele dia, e cai para o crachá quando não existe nenhum.
   */
  const gravar = useCallback(
    async (aluno: Matriculado, dia: string, resultado: Evento['resultado']) => {
      const evento = await gravarEventoNovo(repositorio, config.instalacaoId, new Date(), (eventoId) => ({
        eventoId,
        quando: `${dia}T12:00:00.000Z`,
        turma: aluno.turma,
        matricula: aluno.matricula || undefined,
        nome: aluno.nome,
        origem: 'manual',
        resultado,
        uidHash: uidHashSintetico(),
      }))
      await aoRegistrar?.(evento)
      await carregar()
      aoMudarBase?.(aluno.turma)
    },
    [config.instalacaoId, repositorio, carregar, aoRegistrar, aoMudarBase],
  )

  return (
    <GradeDePresencas
      turmas={turmas}
      eventos={eventos}
      matriculados={matriculados}
      aulas={aulas}
      aoCorrigir={(aluno, dia) => gravar(aluno, dia, 'ok')}
      aoRemover={(aluno, dia) => gravar(aluno, dia, 'removido')}
      nomeDaPasta={nomeDaPasta}
    />
  )
}

export function TelaPresencas({
  aoFechar,
  nomeDaPasta,
}: {
  aoFechar: () => void
  nomeDaPasta?: string
}) {
  return (
    <Sheet titulo="Presenças" aoFechar={aoFechar}>
      <ConteudoDePresencas nomeDaPasta={nomeDaPasta} />
    </Sheet>
  )
}
