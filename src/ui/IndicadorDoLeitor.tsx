// A bolinha de conexão do leitor, no canto, junto da engrenagem.
//
// Só existe para leitor que sabe dizer se está vivo (`LeitorConfirmavel`, o
// serial). O dongle de teclado não tem como: para o sistema ele é um teclado
// e ponto, então nele **não se mostra nada** em vez de um verde que mentiria.
// Verde aqui significa uma coisa só: o aparelho mandou sinal de vida há
// poucos segundos e o módulo de leitura de dentro dele responde.

import { useEffect, useState } from 'react'
import {
  ehConfirmavel,
  type EstadoLeitor,
  type LeitorDeCracha,
  type SituacaoDoAparelho,
} from '../portas/LeitorDeCracha.ts'

type Tom = 'ok' | 'alerta' | 'grave'

function descrever(estado: EstadoLeitor, situacao: SituacaoDoAparelho): { tom: Tom; texto: string } {
  if (estado === 'erro' || estado === 'parado') return { tom: 'grave', texto: 'Leitor desconectado' }
  if (estado === 'iniciando') return { tom: 'alerta', texto: 'Conectando o leitor' }
  if (!situacao.vivo) return { tom: 'alerta', texto: 'Leitor sem sinal' }
  if (situacao.modulo === 'erro') return { tom: 'grave', texto: 'Leitor sem módulo de leitura' }
  return { tom: 'ok', texto: 'Leitor conectado' }
}

export function IndicadorDoLeitor({ leitor }: { leitor: LeitorDeCracha }) {
  const confirmavel = ehConfirmavel(leitor)
  const [, atualizar] = useState(0)

  // O sinal de vida envelhece sem nenhum evento: é o relógio que denuncia o
  // aparelho que parou de falar. Um por segundo, como o próprio sinal.
  useEffect(() => {
    if (!confirmavel) return
    const relogio = setInterval(() => atualizar((n) => n + 1), 1000)
    const parar = leitor.aoMudarEstado(() => atualizar((n) => n + 1))
    return () => {
      clearInterval(relogio)
      parar()
    }
  }, [leitor, confirmavel])

  if (!ehConfirmavel(leitor)) return null
  const { tom, texto } = descrever(leitor.estado(), leitor.situacao())
  return (
    <span className={`selo-status selo-status--leitor selo-status--leitor-${tom}`} role="status">
      <span className={`ponto ponto--leitor-${tom}`} aria-hidden="true" />
      {texto}
    </span>
  )
}
