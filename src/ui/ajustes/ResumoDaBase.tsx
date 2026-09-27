// O estado da base num relance: crachás, aulas na grade, registros, e quem
// falta cadastrar em cada turma, sem abrir a chamada de nenhuma.

import { Cartao } from '../componentes/Cartao.tsx'
import { plural } from '../hooks/useTentativa.ts'

export interface TurmaNoResumo {
  turma: string
  total: number
  faltam: number
  naGrade: number
}

export function ResumoDaBase({
  comCracha,
  professores,
  sinteticos,
  aulas,
  registros,
  turmas,
  aoExcluirTurma,
  aoNovaTurma,
}: {
  comCracha: number
  professores: number
  sinteticos: number
  aulas: number
  registros: number
  turmas: TurmaNoResumo[]
  aoExcluirTurma: (turma: TurmaNoResumo) => () => void
  aoNovaTurma?: () => void
}) {
  return (
    <>
      <div className="cartoes">
        <Cartao
          icone="◎"
          tom={comCracha > 0 ? 'ok' : 'neutro'}
          titulo={plural(comCracha, 'crachá', 'crachás')}
          apoio={sinteticos > 0 ? `${professores} de professor · ${sinteticos} sem crachá` : `${professores} de professor`}
        />
        <Cartao icone="☰" tom={aulas > 0 ? 'ok' : 'neutro'} titulo={plural(aulas, 'aula', 'aulas')} apoio="na grade" />
        <Cartao icone="↓" tom="neutro" titulo={plural(registros, 'registro', 'registros')} apoio="nunca reescritos" />
      </div>

      {turmas.length > 0 && (
        <>
          <p className="ferramentas__nota">Quem falta cadastrar, por turma</p>
          <div className="cartoes">
            {turmas.map((t) => (
              <Cartao
                key={t.turma}
                icone="◉"
                tom={t.faltam > 0 ? 'alerta' : 'ok'}
                titulo={t.turma}
                apoio={t.faltam > 0 ? `${t.faltam} de ${t.total} sem crachá` : `${t.total} de ${t.total} com crachá`}
                aoClicar={aoExcluirTurma(t)}
              />
            ))}
            {aoNovaTurma && (
              <Cartao icone="+" tom="neutro" titulo="Nova turma" apoio="Colar outra lista" aoClicar={aoNovaTurma} />
            )}
          </div>
        </>
      )}
    </>
  )
}
