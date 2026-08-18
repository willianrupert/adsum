// Cartão de estado, no espírito dos Mushroom cards.
//
// Um ícone colorido à esquerda, uma linha principal e uma de apoio. Serve para
// ler estado de relance — que é o que alguém quer da tela da base: não os
// números todos, só se está tudo bem.

import type { ReactNode } from 'react'

export function Cartao({
  icone,
  tom = 'neutro',
  titulo,
  apoio,
}: {
  icone: ReactNode
  tom?: 'ok' | 'alerta' | 'grave' | 'neutro'
  titulo: string
  apoio: string
}) {
  return (
    <div className="cartao">
      <span className={`cartao__icone cartao__icone--${tom}`} aria-hidden="true">
        {icone}
      </span>
      <span className="cartao__texto">
        <strong>{titulo}</strong>
        <small>{apoio}</small>
      </span>
    </div>
  )
}
