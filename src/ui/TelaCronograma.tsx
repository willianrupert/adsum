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
import { BLOCOS, BLOCOS_COMPLETOS, horasPorSemana, marcadosDe } from '../nucleo/horarios.ts'
import type { Aula } from '../nucleo/grade.ts'
import { GradeDaSemana, aulasDe } from './componentes/GradeDaSemana.tsx'
import { definirModoDeGrade, modoDeGrade, type ModoDeGrade } from '../ambiente/preferencias.ts'

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
  // Preferência desta máquina (`ambiente/preferencias.ts`), não desta turma:
  // o mesmo toggle existe em Ajustes → Grade horária, e as duas leem e
  // gravam a mesma chave — trocar aqui reflete lá na próxima vez que aquela
  // tela montar.
  const [modo, setModo] = useState<ModoDeGrade>(modoDeGrade)
  const blocos = modo === 'completa' ? BLOCOS_COMPLETOS : BLOCOS

  function trocarModo(novo: ModoDeGrade) {
    definirModoDeGrade(novo)
    setModo(novo)
  }

  // Só recalcula a partir do que já estava salvo quando `aulas` ou o
  // catálogo mudam — trocar de modo não reseta o que o professor já marcou
  // nesta sessão, porque o estado de `marcados` (abaixo) não depende disto.
  const inicial = useMemo(() => marcadosDe(aulas, blocos), [aulas, blocos])
  const [marcados, setMarcados] = useState<Set<string>>(inicial.marcados)
  const horas = horasPorSemana(marcados, blocos)

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
        aoMudar={setMarcados}
        rotulo={`Horários de ${turma}`}
        blocos={blocos}
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
          onClick={() => aoSalvar(aulasDe(marcados, turma, uidHashProfessor, blocos))}
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
