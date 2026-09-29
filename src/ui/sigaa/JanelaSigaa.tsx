// `#/sigaa`: a janela que o favorito abre. Fora do `Fluxo` e do
// `ProvedorAdsum`, de propósito: ver `abrirBaseDaJanelaSigaa`.

import { useEffect, useState } from 'react'
import { lancarNoSigaaLigado } from '../../ambiente/preferencias.ts'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { abrirBaseDaJanelaSigaa, naBancada, ponteDaJanela } from '../adsum.ts'
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
  const ligado = lancarNoSigaaLigado() || naBancada()
  const [repositorio, setRepositorio] = useState<Repositorio>()
  const [ponte] = useState(criarPonte)

  useEffect(() => {
    if (ligado) void abrirRepositorio().then(setRepositorio)
  }, [ligado, abrirRepositorio])

  if (!ligado) {
    return (
      <main className="folha-sigaa">
        <h1>Ainda não disponível</h1>
        <p>Lançar no SIGAA ainda está em construção.</p>
      </main>
    )
  }
  if (!repositorio) return <main className="folha-sigaa" aria-busy="true" />
  return <FolhaSigaa repositorio={repositorio} ponte={ponte} fechar={fechar} />
}
