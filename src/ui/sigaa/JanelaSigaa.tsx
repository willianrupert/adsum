// `#/sigaa`: a janela que o favorito abre. Fora do `Fluxo` e do
// `ProvedorAdsum`, de propósito: ver `abrirBaseDaJanelaSigaa`.

import { useEffect, useState } from 'react'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { abrirBaseDaJanelaSigaa, ponteDaJanela } from '../adsum.ts'
import { FolhaSigaa } from './FolhaSigaa.tsx'

export function JanelaSigaa({
  abrirRepositorio = abrirBaseDaJanelaSigaa,
  criarPonte = ponteDaJanela,
  fechar = () => window.close(),
}: {
  abrirRepositorio?: () => Promise<Repositorio>
  criarPonte?: () => PonteSigaa
  fechar?: () => void
}) {
  const [repositorio, setRepositorio] = useState<Repositorio>()
  const [ponte] = useState(criarPonte)

  useEffect(() => {
    void abrirRepositorio().then(setRepositorio)
  }, [abrirRepositorio])

  if (!repositorio) return <main className="folha-sigaa" aria-busy="true" />
  return <FolhaSigaa repositorio={repositorio} ponte={ponte} fechar={fechar} />
}
