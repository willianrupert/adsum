// O popup de presenças — o "leitor de CSV" pedido, à mão.
//
// Não é Ajustes. Ajustes é para quem está mexendo em configuração; isto é
// para "quero ver quem veio", a pergunta mais comum fora do horário de aula
// — por isso mora no repouso, não atrás da engrenagem.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aula } from '../nucleo/grade.ts'
import { uidHashSintetico } from '../nucleo/hash.ts'
import { proximoEventoId } from '../nucleo/sessao.ts'
import type { Evento, Matriculado } from '../nucleo/tipos.ts'
import { useAdsum } from './adsum.ts'
import { Sheet } from './componentes/Sheet.tsx'
import { GradeDePresencas } from './componentes/GradeDePresencas.tsx'

export function TelaPresencas({ aoFechar }: { aoFechar: () => void }) {
  const { repositorio, config } = useAdsum()
  const [turmas, setTurmas] = useState<string[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const sequencia = useRef(0)

  const carregar = useCallback(async () => {
    const [t, e, m, a] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarEventos(),
      repositorio.listarMatriculados(),
      repositorio.listarAulas(),
    ])
    sequencia.current = e.length
    setTurmas(t)
    setEventos(e)
    setMatriculados(m)
    setAulas(a)
  }, [repositorio])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /**
   * Marcar presença à mão. Não apaga nem troca o que já existe — grava um
   * evento novo, `origem: 'manual'`, no meio-dia daquele dia (não houve
   * toque real, então não há hora real para registrar). O log continua
   * só-acréscimo; `planilhaDeFaltas` já sabe dar peso igual a um crachá.
   */
  const corrigir = useCallback(
    async (aluno: Matriculado, dia: string) => {
      const evento: Evento = {
        eventoId: proximoEventoId(config.instalacaoId, new Date(), ++sequencia.current),
        quando: `${dia}T12:00:00.000Z`,
        turma: aluno.turma,
        matricula: aluno.matricula || undefined,
        nome: aluno.nome,
        origem: 'manual',
        resultado: 'ok',
        uidHash: uidHashSintetico(),
      }
      await repositorio.acrescentarEvento(evento)
      await carregar()
    },
    [config.instalacaoId, repositorio, carregar],
  )

  return (
    <Sheet titulo="Presenças" aoFechar={aoFechar}>
      <GradeDePresencas
        turmas={turmas}
        eventos={eventos}
        matriculados={matriculados}
        aulas={aulas}
        aoCorrigir={corrigir}
      />
    </Sheet>
  )
}
