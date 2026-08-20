import { useState, type ReactNode } from 'react'

/**
 * Um painel dos Ajustes, opcionalmente recolhível.
 *
 * Tudo o que está nos Ajustes é necessário, e **aparecer tudo de uma vez é o
 * problema**: o professor abre para trocar de pasta e encontra vínculos, grade,
 * registros, sal e diagnóstico empilhados. Recolhido, cada seção continua a um
 * clique — e o que ele procura fica achável.
 *
 * O critério de qual abre por padrão: **o que responde uma pergunta** fica
 * aberto (onde estão meus dados, quantos crachás tenho). **O que faz alguma
 * coisa** fica recolhido, porque só se abre quando se vai usar.
 *
 * O cabeçalho inteiro é o gesto, e não uma setinha de 12 px: alvo grande é o que
 * faz recolher parecer natural em vez de escondido.
 */
export function Painel({
  titulo,
  legenda,
  acoes,
  recolhivel = false,
  abertoDeInicio = true,
  children,
}: {
  titulo: string
  legenda?: string
  acoes?: ReactNode
  recolhivel?: boolean
  abertoDeInicio?: boolean
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(abertoDeInicio)
  const mostrando = !recolhivel || aberto

  const cabecalho = (
    <div>
      <h2>
        {titulo}
        {recolhivel && (
          <span className={aberto ? 'painel__seta painel__seta--aberta' : 'painel__seta'} aria-hidden="true">
            ›
          </span>
        )}
      </h2>
      {legenda && <p className="painel__legenda">{legenda}</p>}
    </div>
  )

  return (
    <section className={mostrando ? 'painel' : 'painel painel--fechado'}>
      <header className="painel__topo">
        {recolhivel ? (
          <button
            type="button"
            className="painel__gatilho"
            aria-expanded={aberto}
            onClick={() => setAberto((a) => !a)}
          >
            {cabecalho}
          </button>
        ) : (
          cabecalho
        )}
        {/* As ações somem com o painel fechado: botão de zerar grade ao lado de
            um título recolhido é convite a clicar sem ver no quê. */}
        {acoes && mostrando && <div className="painel__acoes">{acoes}</div>}
      </header>
      {mostrando && children}
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
