import { useEffect, useState } from 'react'

/** Um recado que some sozinho depois de `ms`. É resposta a um gesto, não estado. */
export function useRecadoPassageiro(ms: number) {
  const [recado, setRecado] = useState<string>()
  useEffect(() => {
    if (!recado) return
    const relogio = setTimeout(() => setRecado(undefined), ms)
    return () => clearTimeout(relogio)
  }, [recado, ms])
  return [recado, setRecado] as const
}
