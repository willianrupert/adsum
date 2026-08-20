// Quando esta turma tem aula.
//
// A grade existia só como três campos nos Ajustes — dia, início, fim — e
// ninguém preenche três campos cinco vezes. O professor não pensa "quarta, 13h,
// 14h50"; ele olha a semana e aponta onde a turma cai, que é como o horário
// chega até ele em qualquer mural da universidade.
//
// Vem **depois** de colar a lista, e não antes, porque a grade precisa saber de
// qual turma está falando. E é pulável: a chamada funciona sem ela, só deixa de
// abrir sozinha.
//
// A grade em si mora em `componentes/GradeDaSemana`, porque os Ajustes mostram
// a mesma — duas implementações divergiriam.

import { useMemo, useState } from 'react'
import { horasPorSemana, marcadosDe } from '../nucleo/horarios.ts'
import type { Aula } from '../nucleo/grade.ts'
import { GradeDaSemana, aulasDe } from './componentes/GradeDaSemana.tsx'

export function TelaCronograma({
  turma,
  aulas,
  uidHashProfessor,
  aoSalvar,
  aoPular,
}: {
  turma: string
  aulas: Aula[]
  /** A grade é indexada pelo professor. Sem crachá dele ainda, vai vazio. */
  uidHashProfessor: string
  aoSalvar: (aulas: Aula[]) => void
  aoPular: () => void
}) {
  const inicial = useMemo(() => marcadosDe(aulas), [aulas])
  const [marcados, setMarcados] = useState<Set<string>>(inicial.marcados)
  const horas = horasPorSemana(marcados)

  return (
    <section className="cronograma">
      <header className="cronograma__topo">
        <p className="cronograma__rotulo">Quando esta turma tem aula</p>
        <h1 className="cronograma__turma">{turma}</h1>
        <p className="cronograma__nota">
          Toque nos horários da semana, ou arraste para marcar vários. Com eles
          preenchidos, você entra na sala e a chamada já está aberta.
        </p>
      </header>

      <GradeDaSemana
        marcados={marcados}
        aoMudar={setMarcados}
        rotulo={`Horários de ${turma}`}
      />

      <p className="cronograma__resumo">
        {marcados.size === 0
          ? 'Nenhum horário escolhido'
          : `${marcados.size} ${marcados.size === 1 ? 'horário' : 'horários'} · ${horas.toFixed(0)}h por semana`}
      </p>

      {/* Aula que não cabe em bloco nenhum continua valendo e continua abrindo a
          chamada. Ela some da grade só porque não há quadradinho para ela, e
          salvar por cima a perderia — dizer isso é o mínimo. */}
      {inicial.foraDosBlocos > 0 && (
        <p className="cronograma__aviso">
          {inicial.foraDosBlocos === 1
            ? 'Há uma aula em horário fora destes blocos, e ela não aparece aqui.'
            : `Há ${inicial.foraDosBlocos} aulas em horários fora destes blocos, e elas não aparecem aqui.`}{' '}
          Salvar por aqui substitui o horário desta turma pelo que está marcado.
        </p>
      )}

      <div className="cronograma__acoes">
        <button
          className="botao--acento pasta__botao"
          onClick={() => aoSalvar(aulasDe(marcados, turma, uidHashProfessor))}
        >
          {marcados.size === 0 ? 'Continuar sem horário' : 'Salvar horário'}
        </button>
        <button className="repouso__link botao--quieto" onClick={aoPular}>
          Depois
        </button>
      </div>
    </section>
  )
}
