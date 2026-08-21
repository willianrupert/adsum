// O popup de presenças — o "leitor de CSV" pedido, à mão.
//
// Não é Ajustes. Ajustes é para quem está mexendo em configuração; isto é
// para "quero ver quem veio", a pergunta mais comum fora do horário de aula
// — por isso mora no repouso, não atrás da engrenagem.

import { useEffect, useState } from 'react'
import type { Evento, Matriculado } from '../nucleo/tipos.ts'
import { useAdsum } from './adsum.ts'
import { Sheet } from './componentes/Sheet.tsx'
import { GradeDePresencas } from './componentes/GradeDePresencas.tsx'

export function TelaPresencas({ aoFechar }: { aoFechar: () => void }) {
  const { repositorio } = useAdsum()
  const [turmas, setTurmas] = useState<string[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])

  useEffect(() => {
    void Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarEventos(),
      repositorio.listarMatriculados(),
    ]).then(([t, e, m]) => {
      setTurmas(t)
      setEventos(e)
      setMatriculados(m)
    })
  }, [repositorio])

  return (
    <Sheet titulo="Presenças" aoFechar={aoFechar}>
      <GradeDePresencas turmas={turmas} eventos={eventos} matriculados={matriculados} />
    </Sheet>
  )
}
