// Achar uma pessoa na lista da turma.
//
// Aparece quando um crachá desconhecido encosta e a turma ainda tem gente sem
// cadastro — que é o caso do aluno que faltou no primeiro dia. Em vez de manter
// um aviso permanente na tela cobrando os que faltam, o app não diz nada até o
// crachá aparecer, e aí resolve na hora.
//
// A busca filtra a cada tecla, sem botão e sem confirmação: digitar é a ação.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Matriculado } from '../../nucleo/tipos.ts'

/** Sem acento e em minúsculas: "joao" acha "João". */
function comparavel(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function Busca({
  pessoas,
  aoEscolher,
  aoDesistir,
}: {
  pessoas: Matriculado[]
  aoEscolher: (pessoa: Matriculado) => void
  aoDesistir: () => void
}) {
  const [termo, setTermo] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  // O foco vai para a busca sozinho: quem está com o aluno na frente digita, e
  // clicar no campo antes seria um passo que o app pode dar por conta.
  useEffect(() => campo.current?.focus(), [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoDesistir()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoDesistir])

  const achados = useMemo(() => {
    const busca = comparavel(termo.trim())
    if (!busca) return pessoas
    return pessoas.filter(
      (p) => comparavel(p.nomeCompleto).includes(busca) || p.matricula.startsWith(busca),
    )
  }, [pessoas, termo])

  return (
    <div className="folha__fundo" onClick={aoDesistir}>
      <div className="busca" onClick={(e) => e.stopPropagation()} role="dialog">
        <p className="busca__titulo">Crachá novo</p>
        <p className="busca__nota">De quem é?</p>

        <input
          ref={campo}
          className="busca__campo"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar na turma"
          aria-label="Buscar na turma"
          // Enter com um só resultado resolve sem tirar a mão do teclado.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && achados.length === 1) aoEscolher(achados[0])
          }}
        />

        <ul className="busca__lista">
          {achados.map((pessoa) => (
            <li key={pessoa.chave}>
              <button className="busca__item" onClick={() => aoEscolher(pessoa)}>
                <span className="busca__nome">{pessoa.nome}</span>
                <span className="busca__completo">{pessoa.nomeCompleto}</span>
              </button>
            </li>
          ))}
          {achados.length === 0 && <li className="busca__vazio">Ninguém com esse nome na turma.</li>}
        </ul>

        <button className="busca__desistir" onClick={aoDesistir}>
          Não está na lista
        </button>
      </div>
    </div>
  )
}
