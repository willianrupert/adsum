// Lançar no SIGAA, à mão: o chão da v2 (`docs/08`). A lista de cada aula, com
// quem faltou, para passar à frequência do SIGAA sem depender do favorito.

import { useEffect, useState } from 'react'
import { planilhaDeFaltas } from '../../nucleo/faltas.ts'
import { listaParaLancarAMao, textoParaLancarAMao } from '../../nucleo/lancar/aMao.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { useAdsum } from '../adsum.ts'
import { Painel } from '../componentes/Painel.tsx'
import { CartaoDoFavorito } from './CartaoDoFavorito.tsx'
import { HistoricoDoSigaa } from './HistoricoDoSigaa.tsx'

/** Também na janela do SIGAA, onde não há o contexto do Adsum: o repositório vem por parâmetro. */
export function ListaParaLancarAMao({ turmas, repositorio }: { turmas: string[]; repositorio: Repositorio }) {  // Derivada, não guardada: as turmas podem chegar depois do primeiro desenho.
  const [escolhida, setTurma] = useState<string>()
  const turma = escolhida ?? turmas[0] ?? ''
  const [texto, setTexto] = useState<string>()
  const [recado, setRecado] = useState<string>()

  useEffect(() => {
    if (!turma) return
    let vale = true
    setTexto(undefined)
    setRecado(undefined)
    void Promise.all([repositorio.listarEventos({ turma }), repositorio.listarMatriculados(turma), repositorio.listarAulas()]).then(
      ([eventos, matriculados, aulas]) => {
        if (vale) setTexto(textoParaLancarAMao(turma, listaParaLancarAMao(planilhaDeFaltas(eventos, matriculados, aulas, turma))))
      },
    )
    return () => {
      vale = false
    }
  }, [repositorio, turma])

  const copiar = async () => {
    if (!texto) return
    try {
      await navigator.clipboard.writeText(texto)
      setRecado('Copiado.')
    } catch {
      setRecado('O navegador não deixou copiar. Selecione o texto e copie à mão.')
    }
  }

  if (turmas.length === 0) return <p className="ferramentas__nota">Nenhuma turma cadastrada.</p>
  return (
    <>
      {turmas.length > 1 && (
        <select aria-label="Turma" value={turma} onChange={(e) => setTurma(e.target.value)}>
          {turmas.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
      {texto && <pre className="lancar__lista">{texto}</pre>}
      <button onClick={copiar} disabled={!texto}>
        Copiar a lista
      </button>
      {recado && <p className="ferramentas__nota">{recado}</p>}
    </>
  )
}

export function PainelLancarNoSigaa({ turmas }: { turmas: string[] }) {
  const { repositorio } = useAdsum()
  return (
    <Painel titulo="Lançar no SIGAA" recolhivel legenda="Um clique na planilha de frequência preenche as aulas.">
      <CartaoDoFavorito />
      <HistoricoDoSigaa turmas={turmas} repositorio={repositorio} />
      <h3 className="lancar__subtitulo">À mão</h3>
      <p className="ferramentas__nota">Quem faltou em cada aula, para passar à frequência sem o favorito.</p>
      <ListaParaLancarAMao turmas={turmas} repositorio={repositorio} />
    </Painel>
  )
}
