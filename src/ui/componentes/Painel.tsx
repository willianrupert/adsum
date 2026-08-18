import type { ReactNode } from 'react'

export function Painel({
  titulo,
  legenda,
  acoes,
  children,
}: {
  titulo: string
  legenda?: string
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="painel">
      <header className="painel__topo">
        <div>
          <h2>{titulo}</h2>
          {legenda && <p className="painel__legenda">{legenda}</p>}
        </div>
        {acoes && <div className="painel__acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  )
}

export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="linha">
      <span className="linha__rotulo">{rotulo}</span>
      <span className="linha__valor">{children}</span>
    </div>
  )
}

export function Selo({
  tom,
  children,
}: {
  tom: 'ok' | 'alerta' | 'grave' | 'neutro'
  children: ReactNode
}) {
  return <span className={`selo selo--${tom}`}>{children}</span>
}
