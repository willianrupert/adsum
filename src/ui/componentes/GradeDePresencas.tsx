import { useMemo, useState } from 'react'
import { planilhaDeFaltas, type CelulaDeFalta } from '../../nucleo/faltas.ts'
import type { Aula } from '../../nucleo/grade.ts'
import type { Evento, Matriculado } from '../../nucleo/tipos.ts'

function rotuloDia(dia: string): { semana: string; numero: string } {
  const d = new Date(`${dia}T12:00:00`)
  return {
    semana: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    numero: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }
}

// Presente é presente — se o crachá foi lido duas vezes no mesmo dia não
// muda o que a instituição precisa saber, e uma terceira cor só para isso
// era categoria que ninguém ia usar para decidir nada. O detalhe continua
// no tooltip, para quem quiser auditar fundo, só não vira cor própria.
function classeDaCelula(c: CelulaDeFalta): string {
  if (c.faltas === 0) return 'quadrado--presente'
  return c.faltas === 1 ? 'quadrado--ausente' : 'quadrado--ausente-grave'
}

function rotuloDaCelula(nome: string, dia: string, c: CelulaDeFalta): string {
  const { numero } = rotuloDia(dia)
  if (c.faltas > 0) return `${nome} · ${numero} · ${c.faltas === 1 ? '1 falta' : `${c.faltas} faltas`}`
  const hora = c.quando
    ? ` às ${new Date(c.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : ''
  const como = c.manual ? ', marcado à mão' : c.repetido ? ', crachá lido mais de uma vez' : ''
  return `${nome} · ${numero} · presente${hora}${como}`
}

/**
 * A planilha do curso inteiro: aluno por linha, dia de aula por coluna,
 * quadrado colorido com o número de faltas dentro — a leitura de relance de
 * um mural de contribuições, mas o número é o que vai para a instituição, e
 * por isso fica ali, não escondido atrás de uma cor só.
 *
 * `aoCorrigir`, quando existe, liga o modo Editar: só faltas (>0) viram
 * botão — marcar alguém ausente por engano não é o que se corrige aqui, é
 * o crachá dele que decide isso. Corrigir grava um evento novo
 * (`origem: 'manual'`), nunca reescreve o antigo — o log continua
 * só-acréscimo, e a célula corrigida fica identificável depois.
 */
export function GradeDePresencas({
  turmas,
  eventos,
  matriculados,
  aulas = [],
  aoCorrigir,
}: {
  turmas: string[]
  eventos: Evento[]
  matriculados: Matriculado[]
  aulas?: Aula[]
  aoCorrigir?: (aluno: Matriculado, dia: string) => void | Promise<void>
}) {
  const [escolhida, setEscolhida] = useState<string>()
  const [editando, setEditando] = useState(false)
  const [corrigindo, setCorrigindo] = useState<string>()
  const turma = escolhida && turmas.includes(escolhida) ? escolhida : turmas[0]

  const planilha = useMemo(
    () => planilhaDeFaltas(eventos, matriculados, aulas, turma ?? ''),
    [eventos, matriculados, aulas, turma],
  )

  if (turmas.length === 0) {
    return <p className="ferramentas__nota">Nenhuma turma cadastrada ainda.</p>
  }

  const corrigir = async (aluno: Matriculado, dia: string) => {
    if (!aoCorrigir) return
    const chave = `${aluno.chave}-${dia}`
    setCorrigindo(chave)
    try {
      await aoCorrigir(aluno, dia)
    } finally {
      setCorrigindo(undefined)
    }
  }

  return (
    <>
      <div className="planilha__barra">
        {turmas.length > 1 && (
          <div className="segmentado segmentado--turmas" role="group" aria-label="turma da planilha">
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
        {aoCorrigir && planilha.linhas.length > 0 && (
          <button
            className={editando ? 'botao--acento planilha__editar' : 'botao--quieto planilha__editar'}
            onClick={() => setEditando((a) => !a)}
          >
            {editando ? 'Concluído' : 'Editar'}
          </button>
        )}
      </div>

      {matriculados.filter((m) => m.turma === turma && m.papel === 'aluno').length === 0 ? (
        <p className="ferramentas__nota">Nenhum aluno cadastrado ainda em {turma}.</p>
      ) : planilha.dias.length === 0 ? (
        <p className="ferramentas__nota">Nenhuma aula registrada ainda em {turma}.</p>
      ) : (
        <>
          {editando && (
            <p className="ferramentas__nota">
              Toque numa falta para marcar presença confirmada à mão. Ausência não se corrige aqui — quem
              decide isso é o crachá.
            </p>
          )}
          <div className="planilha__rolagem">
            <table className="planilha">
              <thead>
                <tr>
                  <th className="planilha__nome planilha__nome--cabecalho" scope="col">
                    Aluno
                  </th>
                  <th className="planilha__contagem planilha__contagem--cabecalho" scope="col">
                    Presenças
                  </th>
                  {planilha.dias.map((dia) => {
                    const { semana, numero } = rotuloDia(dia)
                    return (
                      <th key={dia} className="planilha__dia" scope="col">
                        <span className="planilha__dia-semana">{semana}</span>
                        <span className="planilha__dia-numero">{numero}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {planilha.linhas.map(({ matriculado, porDia }) => {
                  const presencas = planilha.dias.filter((d) => porDia.get(d)?.faltas === 0).length
                  return (
                    <tr key={matriculado.chave}>
                      <th className="planilha__nome" scope="row" title={matriculado.nomeCompleto}>
                        {matriculado.nomeCompleto}
                      </th>
                      <td className="planilha__contagem">
                        {presencas}/{planilha.dias.length}
                      </td>
                      {planilha.dias.map((dia) => {
                        const c = porDia.get(dia)!
                        const rotulo = rotuloDaCelula(matriculado.nomeCompleto, dia, c)
                        const chave = `${matriculado.chave}-${dia}`
                        const podeCorrigir = editando && aoCorrigir && c.faltas > 0
                        return (
                          <td key={dia} className="planilha__celula" title={rotulo}>
                            {podeCorrigir ? (
                              <button
                                className={`quadrado quadrado--botao ${classeDaCelula(c)}`}
                                disabled={corrigindo === chave}
                                onClick={() => void corrigir(matriculado, dia)}
                                aria-label={`${rotulo} — marcar presença`}
                              >
                                {c.faltas}
                              </button>
                            ) : (
                              <span className={`quadrado ${classeDaCelula(c)}`}>
                                {c.faltas}
                                {c.manual && <i className="quadrado__manual" aria-hidden="true" />}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="planilha__legenda">
            <span>
              <span className="quadrado quadrado--presente">0</span> presente
            </span>
            <span>
              <span className="quadrado quadrado--ausente">1</span> falta
            </span>
            <span>
              <span className="quadrado quadrado--ausente-grave">2</span> faltas
            </span>
          </div>
        </>
      )}
    </>
  )
}
