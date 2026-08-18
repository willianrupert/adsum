// Navegação por hash — `#/repositorio`.
//
// Sem biblioteca de rotas de propósito: são duas telas, e o hash é o único
// esquema que funciona no GitHub Pages sem `404.html` de contorno, porque o
// servidor nunca vê o caminho.

import { useEffect, useState } from 'react'

export const ROTAS = [
  { id: 'diagnostico', titulo: 'Diagnóstico' },
  { id: 'repositorio', titulo: 'Repositório' },
] as const

export type Rota = (typeof ROTAS)[number]['id']

function daUrl(): Rota {
  const id = window.location.hash.replace(/^#\/?/, '')
  return ROTAS.some((r) => r.id === id) ? (id as Rota) : 'diagnostico'
}

export function useRota(): [Rota, (rota: Rota) => void] {
  const [rota, setRota] = useState<Rota>(daUrl)

  useEffect(() => {
    const ouvir = () => setRota(daUrl())
    window.addEventListener('hashchange', ouvir)
    return () => window.removeEventListener('hashchange', ouvir)
  }, [])

  return [rota, (nova) => { window.location.hash = `#/${nova}` }]
}
