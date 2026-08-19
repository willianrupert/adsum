// Qual turma, quando o app não pode saber sozinho.
//
// Aparece em dois casos, e a frase muda para dizer qual é: duas aulas se
// sobrepõem no horário, ou não há aula nenhuma na grade agora — feriado,
// reposição, ou grade não cadastrada.
//
// Não é configuração: é a única pergunta que sobra depois de o relógio e a
// grade terem respondido tudo o que podiam.

import { useEffect, useState } from 'react'

export function EscolherTurma({
  opcoes,
  motivo,
  aoEscolher,
  aoDesistir,
}: {
  opcoes: string[]
  motivo: 'nenhuma' | 'varias'
  aoEscolher: (turma: string) => void
  aoDesistir: () => void
}) {
  const [destacado, setDestacado] = useState(0)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setDestacado((i) =>
          Math.min(opcoes.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))),
        )
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        aoEscolher(opcoes[destacado])
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [opcoes, destacado, aoEscolher])

  return (
    <div className="folha__fundo" onClick={aoDesistir}>
      <div className="busca" onClick={(e) => e.stopPropagation()} role="dialog">
        <p className="busca__titulo">Qual turma?</p>
        <p className="busca__nota">
          {motivo === 'varias'
            ? 'Duas aulas suas estão neste horário.'
            : 'Não há aula sua na grade agora.'}
        </p>

        <ul className="busca__lista">
          {opcoes.map((turma, i) => (
            <li key={turma}>
              <button
                className={i === destacado ? 'busca__item busca__item--destacado' : 'busca__item'}
                onMouseEnter={() => setDestacado(i)}
                onClick={() => aoEscolher(turma)}
              >
                <span className="busca__nome">{turma}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="busca__atalhos">
          <kbd>↑</kbd> <kbd>↓</kbd> andam · <kbd>enter</kbd> confirma
        </p>
      </div>
    </div>
  )
}
