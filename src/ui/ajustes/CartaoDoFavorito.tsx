// O favorito do SIGAA chega ao professor por aqui (`docs/08`, `docs/11` passo
// 26): um botão que se arrasta para a barra de favoritos. O código vem do
// build (`virtual:favorito`), nunca é colado à mão.

import { useState } from 'react'
import { FAVORITO } from 'virtual:favorito'

export function CartaoDoFavorito() {
  const [recado, setRecado] = useState<string>()
  return (
    <div className="favorito">
      <p className="favorito__texto">Arraste o botão para a barra de favoritos. Na planilha de frequência do SIGAA, clique nele.</p>
      <div className="favorito__palco" aria-hidden="true">
        <div className="favorito__barra">
          <span />
          <span />
          <span className="favorito__destino" />
        </div>
        <span className="favorito__fantasma">Adsum</span>
      </div>
      <a
        className="favorito__botao"
        draggable="true"
        // O React recusa `javascript:` no `href`; o favorito entra direto no DOM.
        ref={(a) => a?.setAttribute('href', FAVORITO)}
        onClick={(e) => {
          e.preventDefault()
          setRecado('É para arrastar, não clicar. Leve o botão até a barra de favoritos.')
        }}
      >
        Adsum
      </a>
      <p className="favorito__nota" role="status">
        {recado ?? 'Sem a barra de favoritos à vista? No Chrome, ⇧⌘B no Mac, Ctrl+Shift+B no Windows.'}
      </p>
    </div>
  )
}
