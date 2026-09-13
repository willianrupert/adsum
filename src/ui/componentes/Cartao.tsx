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
  aoClicar,
}: {
  icone: ReactNode
  tom?: 'ok' | 'alerta' | 'grave' | 'neutro'
  titulo: string
  apoio: string
  /** Com isto, o cartão vira botão — mesmo visual, mais o convite ao toque. */
  aoClicar?: () => void
}) {
  const conteudo = (
    <>
      <span className={`cartao__icone cartao__icone--${tom}`} aria-hidden="true">
        {icone}
      </span>
      <span className="cartao__texto">
        <strong>{titulo}</strong>
        <small>{apoio}</small>
      </span>
    </>
  )

  if (aoClicar) {
    // Sem isto, o nome acessível do botão vira título e apoio colados — o
    // apoio é detalhe de leitura, não parte do nome da ação.
    return (
      <button className="cartao cartao--botao" onClick={aoClicar} aria-label={titulo}>
        {conteudo}
      </button>
    )
  }

  return <div className="cartao">{conteudo}</div>
}
