// O que o Adsum mandou para a planilha do SIGAA, nos Ajustes (`docs/11`,
// passo 27). Sai da auditoria de cada turma; o que ficou valendo na
// planilha, o favorito confere na vez seguinte.

import { useEffect, useState } from 'react'
import { historicoDeLancamentos, type Lancamento } from '../../nucleo/lancar/historico.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'

const QUANTOS = 5
const dois = (n: number) => String(n).padStart(2, '0')
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function frase(l: Lancamento): string {
  const d = new Date(l.quando)
  const quando = `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}`
  return `${l.turma}, ${quando}: ${contar(l.dias.length, 'aula', 'aulas')}, ${contar(l.faltas, 'falta', 'faltas')}`
}

export function HistoricoDoSigaa({ turmas, repositorio }: { turmas: string[]; repositorio: Repositorio }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>()
  useEffect(() => {
    let vale = true
    void Promise.all(turmas.map((t) => repositorio.listarAuditoriaSigaa(t))).then((porTurma) => {
      if (vale) setLancamentos(historicoDeLancamentos(porTurma.flat()).slice(0, QUANTOS))
    })
    return () => {
      vale = false
    }
  }, [turmas, repositorio])

  if (!lancamentos) return null
  return (
    <>
      <h3 className="lancar__subtitulo">Últimos preenchimentos</h3>
      {lancamentos.length === 0 ? (
        <p className="ferramentas__nota">Nenhum lançamento ainda.</p>
      ) : (
        <ul className="lancar__historico">
          {lancamentos.map((l) => (
            <li key={`${l.turma}|${l.quando}`}>{frase(l)}</li>
          ))}
        </ul>
      )}
    </>
  )
}
