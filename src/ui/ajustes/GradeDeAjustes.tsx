// A grade nos Ajustes: a mesma semana do cronograma, com seletor de turma em
// cima (só com mais de uma). Grava a cada toque: em ajustes não existe
// "salvar", existe mudar.

import { useMemo, useState } from 'react'
import { definirModoDeGrade, modoDeGrade, type ModoDeGrade } from '../../ambiente/preferencias.ts'
import { BLOCOS, BLOCOS_COMPLETOS, marcadosDe } from '../../nucleo/horarios.ts'
import type { Aula } from '../../nucleo/tipos.ts'
import { GradeDaSemana, aulasDe } from '../componentes/GradeDaSemana.tsx'

export function GradeDeAjustes({
  turmas,
  aulas,
  professorPadrao,
  aoMudar,
}: {
  turmas: string[]
  aulas: Aula[]
  professorPadrao: string
  aoMudar: (turma: string, aulas: Aula[]) => Promise<void>
}) {
  const [escolhida, setEscolhida] = useState<string>()
  const turma = escolhida && turmas.includes(escolhida) ? escolhida : turmas[0]

  // A mesma preferência do cronograma de cadastro.
  const [modo, setModo] = useState<ModoDeGrade>(modoDeGrade)
  const blocos = modo === 'completa' ? BLOCOS_COMPLETOS : BLOCOS

  function trocarModo(novo: ModoDeGrade) {
    definirModoDeGrade(novo)
    setModo(novo)
  }

  const daTurma = useMemo(() => aulas.filter((a) => a.turma === turma), [aulas, turma])
  const { marcados, foraDosBlocos } = useMemo(() => marcadosDe(daTurma, blocos), [daTurma, blocos])

  if (turmas.length === 0) {
    return <p className="ferramentas__nota">Nenhuma turma cadastrada ainda.</p>
  }

  return (
    <>
      {turmas.length > 1 && (
        <div className="segmentado segmentado--turmas" role="group" aria-label="turma">
          {turmas.map((t) => (
            <button
              key={t}
              className={t === turma ? 'segmento segmento--ativo' : 'segmento'}
              onClick={() => setEscolhida(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="cronograma__modo">
        <div className="segmentado" role="group" aria-label="Granularidade da grade">
          <button
            type="button"
            className={modo === 'simplificada' ? 'segmento segmento--ativo' : 'segmento'}
            onClick={() => trocarModo('simplificada')}
          >
            Simplificada
          </button>
          <button
            type="button"
            className={modo === 'completa' ? 'segmento segmento--ativo' : 'segmento'}
            onClick={() => trocarModo('completa')}
          >
            Completa
          </button>
        </div>
      </div>

      <GradeDaSemana
        marcados={marcados}
        rotulo={`Horários de ${turma}`}
        blocos={blocos}
        aoMudar={(novos) => {
          // Indexada pelo professor; sem nenhum, a tela diz abaixo.
          void aoMudar(
            turma,
            aulasDe(novos, turma, daTurma[0]?.uidHashProfessor ?? professorPadrao, blocos),
          )
        }}
      />

      {foraDosBlocos > 0 && (
        <p className="cronograma__aviso">
          {foraDosBlocos === 1
            ? 'Uma aula desta turma está em horário fora destes blocos e não aparece na grade.'
            : `${foraDosBlocos} aulas desta turma estão em horários fora destes blocos e não aparecem na grade.`}{' '}
          Tocar aqui substitui o horário dela pelo que ficar marcado.
        </p>
      )}

      {!professorPadrao && (
        <p className="ferramentas__nota">
          Nenhum vínculo de professor ainda. A grade não tem por onde ser indexada até
          existir um.
        </p>
      )}
    </>
  )
}
