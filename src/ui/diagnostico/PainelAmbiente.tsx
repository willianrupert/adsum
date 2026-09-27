// O que este navegador oferece, se o service worker controla a página, e o
// relógio: sem hora confiável a chamada não abre, então a hora é diagnóstico.

import { useEffect, useMemo, useState } from 'react'
import { descreverAmbiente, levantarCapacidades } from '../../ambiente/capacidades.ts'
import { Linha, Painel, Selo } from '../componentes/Painel.tsx'
import { hora } from './formatos.ts'

/** O que importa é "esta página está controlada": sem controlador, a próxima abertura depende da rede. */
function useServiceWorker(): string {
  const [servico, setServico] = useState('verificando…')
  useEffect(() => {
    if (!navigator.serviceWorker) {
      setServico('não suportado neste navegador')
      return
    }
    let vivo = true
    const consultar = () => {
      navigator.serviceWorker.getRegistrations().then(
        (regs) => {
          if (!vivo) return
          const nosso = regs.find((r) => location.href.startsWith(r.scope))
          if (!nosso) return setServico('nenhum registrado, o app não abre offline')
          const controlada = Boolean(navigator.serviceWorker.controller)
          setServico(
            `${controlada ? 'controlando esta página' : 'registrado, ainda sem controlar'} · escopo ${nosso.scope}`,
          )
        },
        () => vivo && setServico('falhou ao consultar'),
      )
    }
    consultar()
    // O registro chega depois do primeiro `load`: vale reconsultar.
    navigator.serviceWorker.addEventListener('controllerchange', consultar)
    const id = setTimeout(consultar, 2000)
    return () => {
      vivo = false
      clearTimeout(id)
      navigator.serviceWorker.removeEventListener('controllerchange', consultar)
    }
  }, [])
  return servico
}

export function PainelAmbiente() {
  const capacidades = useMemo(levantarCapacidades, [])
  const ambiente = useMemo(descreverAmbiente, [])
  const servico = useServiceWorker()
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Painel
      titulo="Ambiente"
      recolhivel
      legenda="O que este navegador oferece."
      acoes={<button onClick={() => location.reload()}>Recarregar</button>}
    >
      <ul className="capacidades">
        {capacidades.map((c) => (
          <li key={c.nome} className={c.presente ? 'cap cap--ok' : `cap cap--${c.peso}`}>
            <span className="cap__ponto" aria-hidden="true" />
            <span className="cap__nome">{c.nome}</span>
            <Selo tom={c.presente ? 'ok' : c.peso === 'essencial' ? 'grave' : 'alerta'}>
              {c.presente ? 'sim' : 'não'}
            </Selo>
            {!c.presente && <span className="cap__nota">{c.semEla}</span>}
          </li>
        ))}
      </ul>
      <Linha rotulo="service worker">{servico}</Linha>
      <details className="avancado">
        <summary>Detalhes do ambiente</summary>
        <div className="avancado__corpo">
          {Object.entries(ambiente).map(([k, v]) => (
            <Linha key={k} rotulo={k}>
              <code>{v}</code>
            </Linha>
          ))}
        </div>
      </details>
      <Linha rotulo="relógio">
        <code>{agora.toISOString()}</code> · {hora(agora)}
      </Linha>
    </Painel>
  )
}
