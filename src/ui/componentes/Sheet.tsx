import type { ReactNode } from 'react'

/**
 * A folha que sobe de baixo, com bordas foscas — o mesmo popup dos Ajustes.
 *
 * Compartilhada porque é o único padrão de popup do app: uma vez resolvido
 * (fundo desfocado, sobe animando, fecha clicando fora ou no botão), reusar
 * é o que evita um segundo popup com outra personalidade.
 */
export function Sheet({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string
  aoFechar: () => void
  children: ReactNode
}) {
  // Sem Esc: no Safari em tela cheia ele sai da tela cheia. Sair daqui é
  // clicar fora ou no botão — dois gestos que funcionam em todo lugar.

  return (
    <div className="folha__fundo" onClick={aoFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header className="folha__topo">
          <h2>{titulo}</h2>
          <button onClick={aoFechar}>Fechar</button>
        </header>
        <div className="folha__corpo">{children}</div>
      </div>
    </div>
  )
}
