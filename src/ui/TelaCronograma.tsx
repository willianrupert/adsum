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
// O que se ganha preenchendo está dito na tela, porque é o argumento inteiro:
// com horário, o professor entra na sala e a chamada já está aberta.

import { useMemo, useState } from 'react'
import {
  BLOCOS,
  DIAS_UTEIS,
  SIGLA_DO_DIA,
  chaveDoBloco,
  deChave,
  horasPorSemana,
  marcadosDe,
} from '../nucleo/horarios.ts'
import type { Aula } from '../nucleo/grade.ts'

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

  const alternar = (dia: number, inicio: string) =>
    setMarcados((antes) => {
      const depois = new Set(antes)
      const chave = chaveDoBloco(dia, inicio)
      if (!depois.delete(chave)) depois.add(chave)
      return depois
    })

  const salvar = () =>
    aoSalvar(
      [...marcados].map((chave) => {
        const { dia, inicio } = deChave(chave)
        return {
          uidHashProfessor,
          dia,
          inicio,
          fim: BLOCOS.find((b) => b.inicio === inicio)!.fim,
          turma,
        }
      }),
    )

  const horas = horasPorSemana(marcados)

  return (
    <section className="cronograma">
      <header className="cronograma__topo">
        <p className="cronograma__rotulo">Quando esta turma tem aula</p>
        <h1 className="cronograma__turma">{turma}</h1>
        <p className="cronograma__nota">
          Toque nos horários da semana. Com eles preenchidos, você entra na sala e a
          chamada já está aberta.
        </p>
      </header>

      <div className="cronograma__grade" role="group" aria-label={`Horários de ${turma}`}>
        <div className="cronograma__canto" />
        {DIAS_UTEIS.map((dia) => (
          <div className="cronograma__dia" key={dia}>
            {SIGLA_DO_DIA[dia]}
          </div>
        ))}

        {BLOCOS.map((bloco, i) => (
          <Linha
            key={bloco.inicio}
            bloco={bloco}
            marcados={marcados}
            alternar={alternar}
            // Filete entre turnos, como num mural: separa manhã de tarde sem
            // precisar de rótulo dizendo "tarde".
            trocaDeTurno={i > 0 && BLOCOS[i - 1].turno !== bloco.turno}
          />
        ))}
      </div>

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
        <button className="botao--acento pasta__botao" onClick={salvar}>
          {marcados.size === 0 ? 'Continuar sem horário' : 'Salvar horário'}
        </button>
        <button className="repouso__link botao--quieto" onClick={aoPular}>
          Depois
        </button>
      </div>
    </section>
  )
}

function Linha({
  bloco,
  marcados,
  alternar,
  trocaDeTurno,
}: {
  bloco: (typeof BLOCOS)[number]
  marcados: ReadonlySet<string>
  alternar: (dia: number, inicio: string) => void
  trocaDeTurno: boolean
}) {
  return (
    <>
      <div className={trocaDeTurno ? 'cronograma__hora cronograma__hora--turno' : 'cronograma__hora'}>
        <strong>{bloco.inicio}</strong>
        <small>{bloco.fim}</small>
      </div>
      {DIAS_UTEIS.map((dia) => {
        const escolhido = marcados.has(chaveDoBloco(dia, bloco.inicio))
        return (
          <button
            key={dia}
            type="button"
            aria-pressed={escolhido}
            aria-label={`${SIGLA_DO_DIA[dia]}, ${bloco.inicio} às ${bloco.fim}`}
            className={
              trocaDeTurno
                ? `cronograma__bloco cronograma__bloco--turno${escolhido ? ' cronograma__bloco--on' : ''}`
                : `cronograma__bloco${escolhido ? ' cronograma__bloco--on' : ''}`
            }
            onClick={() => alternar(dia, bloco.inicio)}
          />
        )
      })}
    </>
  )
}
