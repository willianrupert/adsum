// O que a chamada deixou de dado para calibrar a regra dos dois crachás
// (sempre aberto), e as últimas leituras cruas (atrás de um clique).

import { historicoDeChamadas } from '../../ambiente/preferencias.ts'
import type { Vinculo } from '../../nucleo/tipos.ts'
import { Painel, Selo } from '../componentes/Painel.tsx'
import { duracao, hora } from './formatos.ts'

export interface LeituraNaTela {
  chave: string
  hex: string
  legivel: string
  uidHash: string
  em: Date
  vinculo?: Vinculo
}

export function PainelChamadasRecentes() {
  const historico = historicoDeChamadas()
  return (
    <Painel
      titulo="Chamadas recentes"
      legenda="Duração e intervalo entre crachás — o dado para calibrar o limite contra dois crachás na mesma mão."
    >
      {historico.length === 0 ? (
        <p className="vazio">Nenhuma chamada encerrada ainda neste computador.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Turma</th>
              <th>Encerrada</th>
              <th>Duração</th>
              <th>Intervalo entre crachás</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((c, i) => (
              <tr key={`${c.encerradaEm}-${i}`}>
                <td>{c.turma}</td>
                <td>{hora(new Date(c.encerradaEm))}</td>
                <td>
                  <code>{duracao(c.duracaoMs)}</code>
                </td>
                <td>
                  {c.intervalos ? (
                    <code>
                      {c.intervalos.minimoMs}–{c.intervalos.maximoMs} ms, média {c.intervalos.medioMs} ms (
                      {c.intervalos.amostras} {c.intervalos.amostras === 1 ? 'crachá' : 'crachás'})
                    </code>
                  ) : (
                    <code>—</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Painel>
  )
}

export function PainelUltimasLeituras({ leituras }: { leituras: LeituraNaTela[] }) {
  return (
    <Painel titulo="Últimas leituras" recolhivel legenda="Nada aqui conta presença.">
      {leituras.length === 0 ? (
        <p className="vazio">Nenhuma leitura ainda. Encoste um crachá acima.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Hora</th>
              {/* O intervalo entre leituras é o dado que calibra `INTERVALO_MINIMO_MS`. */}
              <th>Desde a anterior</th>
              <th>UID</th>
              <th>uid_hash</th>
              <th>Quem</th>
            </tr>
          </thead>
          <tbody>
            {leituras.map((l, i) => (
              <tr key={l.chave}>
                <td>{hora(l.em)}</td>
                <td>
                  {/* Mais nova primeiro: a anterior no tempo é a de baixo. */}
                  {leituras[i + 1] ? <code>{l.em.getTime() - leituras[i + 1].em.getTime()} ms</code> : <code>—</code>}
                </td>
                <td>
                  <code>{l.legivel}</code>
                </td>
                <td>
                  <code>{l.uidHash}</code>
                </td>
                <td>
                  {l.vinculo ? (
                    <>
                      {l.vinculo.nome}{' '}
                      <Selo tom={l.vinculo.papel === 'professor' ? 'alerta' : 'ok'}>{l.vinculo.papel}</Selo>
                    </>
                  ) : (
                    <Selo tom="grave">Crachá não cadastrado</Selo>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Painel>
  )
}
