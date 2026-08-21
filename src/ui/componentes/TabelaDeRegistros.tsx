import { useMemo, useState } from 'react'
import type { Evento, Resultado } from '../../nucleo/tipos.ts'
import { Selo } from './Painel.tsx'

function tomDoResultado(r: Resultado): 'ok' | 'neutro' | 'grave' | 'alerta' {
  if (r === 'ok') return 'ok'
  if (r === 'duplicado') return 'neutro'
  if (r === 'rapido_demais') return 'alerta'
  return 'grave'
}

const NOME_DO_RESULTADO: Record<Resultado, string> = {
  ok: 'presente',
  duplicado: 'repetido',
  desconhecido: 'não cadastrado',
  rapido_demais: 'rápido demais',
}

/**
 * As presenças de uma turma, mais recente primeiro.
 *
 * Um seletor em cima porque pode haver mais de uma turma — mesmo padrão de
 * `GradeDeAjustes`, que já resolveu esse problema. Abertura e encerramento
 * de aula ficam de fora: `TelaAula` também os esconde da própria lista, e
 * aqui é sobre presença de aluno, não sobre operação da sessão.
 *
 * Compartilhada entre "Registros", em Ajustes, e o popup "Presenças" — a
 * mesma leitura reaproveitada, não duas implementações que podem discordar.
 */
export function TabelaDeRegistros({ turmas, eventos }: { turmas: string[]; eventos: Evento[] }) {
  const [escolhida, setEscolhida] = useState<string>()
  const turma = escolhida && turmas.includes(escolhida) ? escolhida : turmas[0]

  const daTurma = useMemo(
    () => eventos.filter((e) => e.turma === turma && e.origem === 'cracha'),
    [eventos, turma],
  )

  if (turmas.length === 0) {
    return <p className="ferramentas__nota">Nenhuma turma cadastrada ainda.</p>
  }

  return (
    <>
      {turmas.length > 1 && (
        <div className="segmentado segmentado--turmas" role="group" aria-label="turma dos registros">
          {turmas.map((t) => (
            <button
              key={t}
              className={t === turma ? 'segmento segmento--ativo' : 'segmento'}
              onClick={() => setEscolhida(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {daTurma.length === 0 ? (
        <p className="ferramentas__nota">Nenhum registro ainda para {turma}.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Nome</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {daTurma.map((e) => (
              <tr key={e.eventoId}>
                <td>
                  {new Date(e.quando).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td>{e.nome || 'Crachá não cadastrado'}</td>
                <td className="celula--estado">
                  <Selo tom={tomDoResultado(e.resultado)}>{NOME_DO_RESULTADO[e.resultado]}</Selo>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
