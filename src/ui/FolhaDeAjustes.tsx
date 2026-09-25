// O conteúdo da folha de Ajustes: a base (`TelaRepositorio`) e, no pé, os
// links que não são uso do dia a dia — Diagnóstico, Manual, GitHub.

import { type ComponentProps, useState } from 'react'
import { semDono } from '../ambiente/diario.ts'
import { baixarManual } from '../ambiente/manual.ts'
import { REPOSITORIO_URL } from '../nucleo/cofre.ts'
import { TelaRepositorio } from './TelaRepositorio.tsx'

export function FolhaDeAjustes({
  aoAbrirDiagnostico,
  ...base
}: ComponentProps<typeof TelaRepositorio> & { aoAbrirDiagnostico: () => void }) {
  const [recadoManual, setRecadoManual] = useState<string>()

  return (
    <>
      <TelaRepositorio {...base} />
      <div className="ajustes__rodape">
        <button className="botao--quieto" onClick={aoAbrirDiagnostico}>
          Diagnóstico
        </button>
        <button
          className="botao--quieto"
          onClick={() => {
            setRecadoManual(undefined)
            semDono('baixar manual', async () => setRecadoManual(await baixarManual()))
          }}
        >
          Manual
        </button>
        <a className="botao--quieto" href={REPOSITORIO_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
      {recadoManual && <p className="ferramentas__nota">{recadoManual}</p>}
      <p className="ajustes__creditos">© 2026 Adsum</p>
    </>
  )
}
