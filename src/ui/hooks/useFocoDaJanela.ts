import { useEffect, useState } from 'react'

/**
 * Se a janela está sem foco há mais de `toleranciaMs`. O dongle digita onde o
 * foco do sistema estiver: sem foco, o crachá não chega aqui, sem erro
 * nenhum. Trocar de janela por um instante é normal; o aviso é para a falta
 * de foco que persiste.
 */
export function useFocoDaJanela(toleranciaMs = 2500): { semFoco: boolean } {
  const [semFoco, setSemFoco] = useState(false)
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    const aoPerder = () => {
      espera = setTimeout(() => setSemFoco(true), toleranciaMs)
    }
    const aoGanhar = () => {
      clearTimeout(espera)
      setSemFoco(false)
    }
    window.addEventListener('blur', aoPerder)
    window.addEventListener('focus', aoGanhar)
    return () => {
      clearTimeout(espera)
      window.removeEventListener('blur', aoPerder)
      window.removeEventListener('focus', aoGanhar)
    }
  }, [toleranciaMs])
  return { semFoco }
}
