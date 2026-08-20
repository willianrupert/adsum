// A semana, marcável. Vive fora das duas telas que a usam.
//
// O cronograma (na primeira vez) e os Ajustes (depois) mostram a **mesma**
// grade: duas implementações divergiriam, e a dos Ajustes acabaria mentindo
// sobre a do cadastro. Quem decide o que fazer com a mudança é quem usa — o
// cronograma espera o "Salvar", os Ajustes gravam na hora.

import { useCallback, useEffect, useRef } from 'react'
import {
  BLOCOS,
  DIAS_UTEIS,
  SIGLA_DO_DIA,
  chaveDoBloco,
  deChave,
  ehCurto,
} from '../../nucleo/horarios.ts'
import type { Aula } from '../../nucleo/grade.ts'

export function aulasDe(
  marcados: ReadonlySet<string>,
  turma: string,
  uidHashProfessor: string,
): Aula[] {
  return [...marcados].map((chave) => {
    const { dia, inicio } = deChave(chave)
    const bloco = BLOCOS.find(
      (b) => b.inicio === inicio && (b.soSabado ? dia === 6 : dia !== 6),
    )!
    return { uidHashProfessor, dia, inicio, fim: bloco.fim, turma }
  })
}

export function GradeDaSemana({
  marcados,
  aoMudar,
  rotulo,
}: {
  marcados: ReadonlySet<string>
  aoMudar: (marcados: Set<string>) => void
  rotulo: string
}) {
  /**
   * Arrastar pinta.
   *
   * Aula de 4h ocupa dois blocos seguidos, e três encontros na semana custavam
   * seis cliques certeiros. **O primeiro bloco decide o modo**: vazio, o
   * arrasto pinta; marcado, apaga. É o comportamento de qualquer calendário, e
   * evita a alternativa ruim — alternar cada bloco por onde se passa transforma
   * um tremor da mão em xadrez.
   */
  const pintando = useRef<'marcar' | 'desmarcar'>(undefined)
  // Um bloco só muda uma vez por arrasto: sem isto, sair e voltar sobre a mesma
  // célula a alternaria de novo, e passar o mouse de lado viraria pisca-pisca.
  const tocados = useRef(new Set<string>())
  const atual = useRef(marcados)
  atual.current = marcados

  const aplicar = useCallback(
    (chave: string) => {
      if (!pintando.current || tocados.current.has(chave)) return
      tocados.current.add(chave)
      const depois = new Set(atual.current)
      if (pintando.current === 'marcar') depois.add(chave)
      else depois.delete(chave)
      atual.current = depois
      aoMudar(depois)
    },
    [aoMudar],
  )

  const comecar = (chave: string) => {
    pintando.current = marcados.has(chave) ? 'desmarcar' : 'marcar'
    tocados.current = new Set()
    aplicar(chave)
  }

  /**
   * Teclado: Enter e espaço alternam só o bloco focado.
   *
   * Não passa pelo arrasto de propósito — quem navega por Tab não tem gesto
   * contínuo, e deixar o modo de pintura ligado faria o próximo Tab+Enter
   * herdar a decisão do anterior.
   */
  const alternarUm = (chave: string) => {
    const depois = new Set(marcados)
    if (!depois.delete(chave)) depois.add(chave)
    aoMudar(depois)
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

  // No toque o ponteiro fica capturado pelo primeiro alvo, então `pointerenter`
  // nas outras células nunca dispara. Descobrir quem está embaixo do dedo é o
  // que faz o arrasto existir no iPad.
  const arrastar = (e: React.PointerEvent) => {
    if (!pintando.current) return
    const chave = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.getAttribute('data-bloco')
    if (chave) aplicar(chave)
  }

  return (
    <div className="cronograma__grade" role="group" aria-label={rotulo} onPointerMove={arrastar}>
      <div className="cronograma__canto" />
      {DIAS_UTEIS.map((dia) => (
        <div className="cronograma__dia" key={dia}>
          {SIGLA_DO_DIA[dia]}
        </div>
      ))}

      {BLOCOS.map((bloco, i) => {
        // Filete entre turnos, como num mural: separa manhã de tarde sem
        // precisar de rótulo dizendo "tarde".
        const trocaDeTurno = i > 0 && BLOCOS[i - 1].turno !== bloco.turno
        const classe = (base: string) =>
          [base, trocaDeTurno && `${base}--turno`, ehCurto(bloco) && `${base}--curto`]
            .filter(Boolean)
            .join(' ')

        return (
          <div key={bloco.turno + bloco.inicio} style={{ display: 'contents' }}>
            <div className={classe('cronograma__hora')}>
              <strong>{bloco.inicio}</strong>
              <small>{bloco.fim}</small>
            </div>
            {DIAS_UTEIS.map((dia) => {
              // Bloco de sábado não existe de segunda a sexta: a célula vazia
              // diz isso melhor que um quadradinho que não deveria ser clicado.
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
                  className={[classe('cronograma__bloco'), escolhido && 'cronograma__bloco--on']
                    .filter(Boolean)
                    .join(' ')}
                  onPointerDown={() => comecar(chave)}
                  onPointerEnter={() => aplicar(chave)}
                  // `detail === 0` é clique vindo do teclado. O do ponteiro já
                  // foi tratado no `pointerdown`, e tratá-lo de novo aqui
                  // marcaria e desmarcaria no mesmo gesto.
                  onClick={(e) => e.detail === 0 && alternarUm(chave)}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
