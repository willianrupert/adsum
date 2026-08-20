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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BLOCOS,
  DIAS_UTEIS,
  SIGLA_DO_DIA,
  chaveDoBloco,
  deChave,
  ehCurto,
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

  /**
   * Arrastar pinta.
   *
   * Aula de 4h ocupa dois blocos seguidos, e uma turma com três encontros na
   * semana custava seis cliques certeiros. Arrastando, é um gesto.
   *
   * **O primeiro bloco decide o modo.** Se ele estava vazio, o arrasto pinta;
   * se estava marcado, apaga. É o comportamento de qualquer calendário, e é o
   * que evita a alternativa ruim: alternar cada bloco por onde se passa, que
   * transforma um tremor da mão em xadrez.
   */
  const pintando = useRef<'marcar' | 'desmarcar'>(undefined)
  // Um bloco só muda uma vez por arrasto: sem isto, sair e voltar sobre a mesma
  // célula a alternaria de novo, e passar o mouse de lado viraria pisca-pisca.
  const tocados = useRef(new Set<string>())

  const aplicar = useCallback((chave: string) => {
    if (!pintando.current || tocados.current.has(chave)) return
    tocados.current.add(chave)
    const modo = pintando.current
    setMarcados((antes) => {
      const depois = new Set(antes)
      if (modo === 'marcar') depois.add(chave)
      else depois.delete(chave)
      return depois
    })
  }, [])

  const comecar = (dia: number, inicio: string) => {
    const chave = chaveDoBloco(dia, inicio)
    pintando.current = marcados.has(chave) ? 'desmarcar' : 'marcar'
    tocados.current = new Set()
    aplicar(chave)
  }

  // O `pointerup` é da janela porque soltar fora da grade também termina o
  // gesto — e acontece, quando se arrasta até a borda.
  useEffect(() => {
    const terminar = () => {
      pintando.current = undefined
      tocados.current = new Set()
    }
    window.addEventListener('pointerup', terminar)
    window.addEventListener('pointercancel', terminar)
    return () => {
      window.removeEventListener('pointerup', terminar)
      window.removeEventListener('pointercancel', terminar)
    }
  }, [])

  /**
   * Teclado: Enter e espaço num bloco alternam só ele.
   *
   * Não passa pelo arrasto de propósito — quem navega por Tab não tem gesto
   * contínuo, e deixar o modo de pintura ligado depois de um Enter faria o
   * próximo Tab+Enter herdar a decisão do anterior.
   */
  const alternarUm = (dia: number, inicio: string) => {
    const chave = chaveDoBloco(dia, inicio)
    setMarcados((antes) => {
      const depois = new Set(antes)
      if (!depois.delete(chave)) depois.add(chave)
      return depois
    })
  }

  // No toque o ponteiro fica capturado pelo primeiro alvo, então `pointerenter`
  // nas outras células nunca dispara. Descobrir quem está embaixo do dedo é o
  // que faz o arrasto existir no iPad.
  const arrastar = (e: React.PointerEvent) => {
    if (!pintando.current) return
    const sob = document.elementFromPoint(e.clientX, e.clientY)
    const chave = sob?.getAttribute('data-bloco')
    if (chave) aplicar(chave)
  }

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
          Toque nos horários da semana, ou arraste para marcar vários. Com eles
          preenchidos, você entra na sala e a chamada já está aberta.
        </p>
      </header>

      <div
        className="cronograma__grade"
        role="group"
        aria-label={`Horários de ${turma}`}
        onPointerMove={arrastar}
      >
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
            comecar={comecar}
            aplicar={aplicar}
            alternarUm={alternarUm}
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
  comecar,
  aplicar,
  alternarUm,
  trocaDeTurno,
}: {
  bloco: (typeof BLOCOS)[number]
  marcados: ReadonlySet<string>
  comecar: (dia: number, inicio: string) => void
  aplicar: (chave: string) => void
  alternarUm: (dia: number, inicio: string) => void
  trocaDeTurno: boolean
}) {
  return (
    <>
      <div
        className={[
          'cronograma__hora',
          trocaDeTurno && 'cronograma__hora--turno',
          ehCurto(bloco) && 'cronograma__hora--curto',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <strong>{bloco.inicio}</strong>
        <small>{bloco.fim}</small>
      </div>
      {DIAS_UTEIS.map((dia) => {
        // Bloco de sábado não existe de segunda a sexta: a célula vazia diz
        // isso melhor que um quadradinho clicável que não deveria ser clicado.
        if (bloco.soSabado && dia !== 6) return <div key={dia} aria-hidden="true" />
        const chave = chaveDoBloco(dia, bloco.inicio)
        const escolhido = marcados.has(chave)
        return (
          <button
            key={dia}
            type="button"
            data-bloco={chave}
            aria-pressed={escolhido}
            aria-label={`${SIGLA_DO_DIA[dia]}, ${bloco.inicio} às ${bloco.fim}`}
            className={[
              'cronograma__bloco',
              trocaDeTurno && 'cronograma__bloco--turno',
              ehCurto(bloco) && 'cronograma__bloco--curto',
              escolhido && 'cronograma__bloco--on',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={() => comecar(dia, bloco.inicio)}
            onPointerEnter={() => aplicar(chave)}
            // Teclado: `detail === 0` distingue Enter/espaço de clique de
            // ponteiro, que já foi tratado no `pointerdown`. Sem isso o mouse
            // marcaria e desmarcaria no mesmo gesto.
            onClick={(e) => {
              // `detail === 0` é clique vindo do teclado. O do ponteiro já foi
              // tratado no `pointerdown`, e tratá-lo de novo aqui marcaria e
              // desmarcaria no mesmo gesto.
              if (e.detail === 0) alternarUm(dia, bloco.inicio)
            }}
          />
        )
      })}
    </>
  )
}
