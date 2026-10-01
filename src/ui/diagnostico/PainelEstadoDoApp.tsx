// Armazenamento, versão e instalação: o que responde "não apareceu" e "não
// achei a mudança" com um fato. No modo de ensaio, semear e apagar.

import { estadoDoConvite } from '../../ambiente/instalacao.ts'
import type { Config, Evento } from '../../nucleo/tipos.ts'
import { podeApagar, type DiagnosticoRepositorio, type Repositorio } from '../../portas/Repositorio.ts'
import { Linha, Painel, Selo } from '../componentes/Painel.tsx'
import { confirmarOuCancelar, type Tentar } from '../hooks/useTentativa.ts'
import { formatarBytes, hora } from './formatos.ts'

const CONVITE = {
  oferecido: 'o navegador ofereceu',
  ja_instalado: 'já está instalado',
  dispensado: 'você dispensou',
  nao_oferecido: 'o navegador não ofereceu',
} as const

export function PainelEstadoDoApp({
  diagnostico,
  eventos,
  config,
  repositorio,
  ensaio,
  tentar,
  aoSemear,
  aoApagar,
}: {
  diagnostico?: DiagnosticoRepositorio
  /** Os últimos eventos, para conferir numeração e origem. */
  eventos: Evento[]
  config: Config
  repositorio: Repositorio
  ensaio: boolean
  tentar: Tentar
  /** Só no modo de ensaio, com leitor simulado. */
  aoSemear: () => Promise<void>
  aoApagar: () => void
}) {
  return (
    <Painel
      titulo="Estado do app"
      recolhivel
      legenda="Armazenamento, versão e instalação — não presença."
      acoes={
        <>
          {/* Semear inventa gente e presença: nunca no app publicado. */}
          {ensaio && <button onClick={tentar('Semear', aoSemear)}>Semear</button>}
          {ensaio && podeApagar(repositorio) && (
            <button
              className="botao--grave"
              onClick={tentar('Apagar tudo', async () => {
                confirmarOuCancelar('Apagar vínculos, grade e registros deste navegador?')
                await repositorio.apagarTudo()
                aoApagar()
              })}
            >
              Apagar tudo
            </button>
          )}
        </>
      }
    >
      <Linha rotulo="aberta">
        <Selo tom={diagnostico?.aberto ? 'ok' : 'grave'}>{diagnostico?.aberto ? 'sim' : 'não'}</Selo>
      </Linha>
      <Linha rotulo="persistente">
        <Selo tom={diagnostico?.persistente ? 'ok' : 'alerta'}>
          {diagnostico?.persistente ? 'concedido' : 'não concedido'}
        </Selo>
        {!diagnostico?.persistente && (
          <>
            {' '}
            <button
              onClick={tentar('Pedir persistência', async () => {
                if (!navigator.storage?.persist) throw new Error('navegador não oferece')
                const concedido = await navigator.storage.persist()
                await repositorio.diagnostico()
                if (!concedido) throw new Error('o navegador recusou por ora; instalar o app costuma destravar')
              })}
            >
              Pedir
            </button>
          </>
        )}
      </Linha>
      <Linha rotulo="espaço usado">
        {formatarBytes(diagnostico?.usoEstimado)} de {formatarBytes(diagnostico?.cotaEstimada)}
      </Linha>
      <Linha rotulo="versão desta cópia">
        <code>{__CARIMBO__}</code> · <code>{__COMMIT__}</code>
      </Linha>
      <Linha rotulo="convite de instalar">
        <Selo tom={estadoDoConvite() === 'oferecido' ? 'ok' : 'neutro'}>{CONVITE[estadoDoConvite()]}</Selo>
      </Linha>
      <Linha rotulo="instalação">
        <code>{config.instalacaoId}</code>
      </Linha>

      {eventos.length > 0 && (
        <table className="tabela">
          <thead>
            <tr>
              <th>evento_id</th>
              <th>Quando</th>
              <th>Quem</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.eventoId}>
                <td>
                  <code>{e.eventoId}</code>
                </td>
                <td>{hora(new Date(e.quando))}</td>
                <td>{e.nome}</td>
                <td>{e.origem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Painel>
  )
}
