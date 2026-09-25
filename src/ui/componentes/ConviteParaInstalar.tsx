import { Baixar } from './Simbolos.tsx'

/** O convite para instalar o app. Aparece em qualquer tela, menos na chamada. */
export function ConviteParaInstalar({ aoDispensar, aoInstalar }: { aoDispensar: () => void; aoInstalar: () => void }) {
  return (
    <div className="convite">
      <span className="convite__icone" aria-hidden="true">
        <Baixar />
      </span>
      <span className="convite__texto">
        <strong>O Adsum em janela própria</strong>
        <small>Abre num clique, sem procurar entre as abas</small>
      </span>
      <span className="convite__acoes">
        <button className="botao--quieto" onClick={aoDispensar}>
          Agora não
        </button>
        <button className="botao--acento" onClick={aoInstalar}>
          Instalar
        </button>
      </span>
    </div>
  )
}
