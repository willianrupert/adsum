// O aviso do canto: quieto quando está tudo bem, e só um de cada vez, o mais
// grave. Não é botão; a engrenagem ao lado é que abre os Ajustes.

import { Cadeado } from './Simbolos.tsx'

export interface EstadoDoCanto {
  falhaNaPasta?: string
  /** Registros que existem só no navegador (sem pasta). */
  porSalvar: number
  lendo: boolean
  temPasta: boolean
  /** Navegador sem seletor de pasta. */
  semSeletorDePasta: boolean
  /** O Safari apaga a base sozinho depois de dias sem visita. */
  riscoDeApagar: boolean
}

/** O que o selo diz, ou nada. Trabalho em risco vence os avisos sobre o navegador. */
export function textoDoSelo(e: EstadoDoCanto): string | undefined {
  if (e.falhaNaPasta) return 'A pasta não recebeu a gravação'
  if (e.porSalvar > 0) {
    return `${e.porSalvar} ${e.porSalvar === 1 ? 'registro ainda não salvo' : 'registros ainda não salvos'}`
  }
  if (!e.lendo) return 'Nenhum leitor ativo'
  if (e.temPasta) return undefined
  if (e.semSeletorDePasta) {
    return e.riscoDeApagar
      ? 'Sem pasta. O Safari pode apagar a base sozinho'
      : 'Sem pasta neste navegador. Exporte uma cópia'
  }
  return 'Os dados só existem neste navegador'
}

export function SeloDoCanto(estado: EstadoDoCanto) {
  const texto = textoDoSelo(estado)
  if (!texto) return null
  const grave = !!estado.falhaNaPasta || estado.porSalvar > 0
  return (
    <span className={grave ? 'selo-status selo-status--grave' : 'selo-status'}>
      {estado.temPasta || grave ? <span className={grave ? 'ponto ponto--grave' : 'ponto ponto--alerta'} /> : <Cadeado />}
      {texto}
    </span>
  )
}
