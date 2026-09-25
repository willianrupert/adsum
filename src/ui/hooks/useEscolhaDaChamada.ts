// A turma e o dia que o repouso mostra, e que "Começar a chamada" abre.
//
// A grade só sugere a turma inicial: a que tem aula agora, senão a próxima,
// senão a encerrada mais recentemente, senão a primeira. Depois disso quem
// escolhe é o professor, pelas setas.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { encerradas } from '../../ambiente/preferencias.ts'
import { diaLocal } from '../../nucleo/faltas.ts'
import { turmaDeAgoraEntreProfessores, proximaAulaDeQualquer } from '../../nucleo/grade.ts'
import type { GradeLida } from './useBase.ts'

export function useEscolhaDaChamada({ grade, listaDeTurmas }: { grade: GradeLida; listaDeTurmas: string[] }) {
  // A grade é conta sobre "agora": sem o relógio, o ponto azul não acendia
  // com o app aberto desde antes da aula (22/09/2026).
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(relogio)
  }, [])

  const proxima = useMemo(() => {
    if (grade.hashes.length === 0) return undefined
    const vem = proximaAulaDeQualquer(grade.aulas, grade.hashes, agora)
    return vem && { turma: vem.aula.turma, quando: vem.quando }
  }, [grade, agora])

  /**
   * A turma que a grade diz que tem aula agora. Sem o atalho "só existe uma
   * turma" (isso é para o clique), e sem a turma que acabou de ser encerrada.
   */
  const comecarEm = useMemo(
    () => (grade.hashes.length > 0 ? turmaDeAgoraEntreProfessores(grade.aulas, grade.hashes, agora, encerradas()) : undefined),
    [grade, agora],
  )

  const turmaSugerida = useMemo(() => {
    if (comecarEm) return comecarEm
    if (proxima) return proxima.turma
    const fechamentos = Object.entries(encerradas()).sort((a, b) => b[1].localeCompare(a[1]))
    const maisRecente = fechamentos.find(([turma]) => listaDeTurmas.includes(turma))?.[0]
    if (maisRecente) return maisRecente
    return [...listaDeTurmas].sort((a, b) => a.localeCompare(b, 'pt-BR'))[0]
  }, [comecarEm, proxima, listaDeTurmas])

  // Segue a sugestão até o professor mexer, e volta a ela se a escolhida sumir.
  const [turmaSelecionada, setTurmaSelecionada] = useState<string>()
  useEffect(() => {
    if (turmaSelecionada && listaDeTurmas.includes(turmaSelecionada)) return
    setTurmaSelecionada(turmaSugerida)
  }, [turmaSugerida, listaDeTurmas, turmaSelecionada])

  /** -1 volta, 1 avança, dando a volta nas pontas. */
  const mudarTurma = useCallback(
    (direcao: -1 | 1) => {
      setTurmaSelecionada((atual) => {
        if (!atual) return atual
        const indice = listaDeTurmas.indexOf(atual)
        if (indice < 0) return atual
        const total = listaDeTurmas.length
        return listaDeTurmas[(indice + direcao + total) % total]
      })
    },
    [listaDeTurmas],
  )

  /** Só o dia: é uma chamada por turma por dia. `undefined` é hoje. */
  const [diaEscolhido, setDiaEscolhido] = useState<string>()
  const diaSelecionado = diaEscolhido ?? diaLocal(agora.toISOString())

  const editarDia = useCallback((valor: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) setDiaEscolhido(valor)
  }, [])

  /** Depois de abrir, a próxima chamada volta a ser de hoje. */
  const voltarParaHoje = useCallback(() => setDiaEscolhido(undefined), [])

  /** Quando a chamada abre: agora, ou esta mesma hora no dia escolhido. */
  const momentoDaChamada = useCallback(() => {
    const instante = new Date()
    if (!diaEscolhido || diaEscolhido === diaLocal(instante.toISOString())) return instante
    const [ano, mes, dia] = diaEscolhido.split('-').map(Number)
    instante.setFullYear(ano, mes - 1, dia)
    return instante
  }, [diaEscolhido])

  return { comecarEm, turmaSelecionada, mudarTurma, diaSelecionado, editarDia, voltarParaHoje, momentoDaChamada }
}
