import { useState, type ReactNode } from 'react'

/**
 * Um painel dos Ajustes, opcionalmente recolhível.
 *
 * Tudo o que está nos Ajustes é necessário, e **aparecer tudo de uma vez é o
 * problema**: o professor abre para trocar de pasta e encontra vínculos, grade,
 * registros, sal e diagnóstico empilhados. Recolhido, cada seção continua a um
 * clique — e o que ele procura fica achável.
 *
 * **Todos começam fechados, sem exceção.** Eu tinha tentado um critério — o que
 * responde uma pergunta abre, o que faz alguma coisa recolhe — e o resultado foi
 * uma tela em que metade abria e metade não, sem que se soubesse qual pelo quê.
 * Regra com exceção é regra que o usuário precisa decorar. Abrir tudo custa um
 * clique; adivinhar custa a tela inteira.
 *
 * O cabeçalho inteiro é o gesto, e não uma setinha de 12 px: alvo grande é o que
 * faz recolher parecer natural em vez de escondido.
 */
export function Painel({
  titulo,
  legenda,
  acoes,
  recolhivel = false,
  abertoDeInicio = false,
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
      {/* O conteúdo fica montado sempre — é o que dá para `grid-template-rows`
          animar de 0fr a 1fr em vez de aparecer e sumir num corte seco. Montar
          e desmontar a cada clique é mais barato, mas "nada brusco" foi o
          pedido, e o conteúdo de um painel de Ajustes é leve o bastante para
          o custo não aparecer.

          `inert` fechado: sem ele, um campo ou botão dentro do painel
          recolhido continuaria alcançável pelo Tab, escondido mas focável —
          o mesmo tipo de defeito que "as ações somem com o painel fechado"
          já existia para proteger, só que no corpo em vez do cabeçalho. */}
      <div className={mostrando ? 'painel__corpo painel__corpo--aberto' : 'painel__corpo'}>
        <div className="painel__corpo-interno" inert={mostrando ? undefined : true}>
          {children}
        </div>
      </div>
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

/**
 * Divisória entre grupos de painéis em Ajustes — "Sua turma", "Este
 * computador", "Diagnóstico". Não colapsa e não é um `Painel`: é só o
 * agrupamento visual que faltava numa folha de onze painéis empilhados sem
 * hierarquia nenhuma.
 */
export function Secao({ titulo, legenda }: { titulo: string; legenda?: string }) {
  return (
    <div className="ajustes__secao">
      {titulo}
      {legenda && <p className="ajustes__legenda">{legenda}</p>}
    </div>
  )
}
