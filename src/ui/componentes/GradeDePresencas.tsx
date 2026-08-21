import { useMemo, useState } from 'react'
import type { Evento, Matriculado } from '../../nucleo/tipos.ts'

/** Chave local (`AAAA-MM-DD`) do dia da aula, no fuso de quem olha a tela. */
function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rotuloDia(dia: string): { semana: string; numero: string } {
  const d = new Date(`${dia}T12:00:00`)
  return {
    semana: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    numero: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }
}

/** Mesma pessoa do vínculo, num evento: por matrícula, e por nome pra quem não tem. */
function ehDoAluno(e: Evento, aluno: Matriculado): boolean {
  return aluno.matricula ? e.matricula === aluno.matricula : !e.matricula && e.nome === aluno.nome
}

type EstadoCelula = 'presente' | 'repetido' | 'ausente'

interface Linha {
  aluno: Matriculado
  presencas: number
  estados: Map<string, { estado: EstadoCelula; quando?: string }>
}

/**
 * A planilha do curso inteiro: aluno por linha, dia de aula por coluna,
 * quadradinho colorido em vez de texto — a mesma leitura de relance de um
 * mural de contribuições, só que sobre presença.
 *
 * Dia de aula é um dia com evento `origem === 'professor'` (a aula abriu),
 * não todo dia do calendário — turmas não têm aula todo dia, e uma planilha
 * cheia de colunas vazias não ajuda ninguém a ler.
 */
export function GradeDePresencas({ turmas, eventos, matriculados }: {
  turmas: string[]
  eventos: Evento[]
  matriculados: Matriculado[]
}) {
  const [escolhida, setEscolhida] = useState<string>()
  const turma = escolhida && turmas.includes(escolhida) ? escolhida : turmas[0]

  const daTurma = useMemo(() => eventos.filter((e) => e.turma === turma), [eventos, turma])
  const alunos = useMemo(
    () =>
      matriculados
        .filter((m) => m.turma === turma && m.papel === 'aluno')
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [matriculados, turma],
  )

  const dias = useMemo(
    () =>
      Array.from(new Set(daTurma.filter((e) => e.origem === 'professor').map((e) => diaLocal(e.quando)))).sort(),
    [daTurma],
  )

  const linhas: Linha[] = useMemo(
    () =>
      alunos.map((aluno) => {
        const estados = new Map<string, { estado: EstadoCelula; quando?: string }>()
        let presencas = 0
        for (const dia of dias) {
          const doDia = daTurma.filter(
            (e) => e.origem === 'cracha' && diaLocal(e.quando) === dia && ehDoAluno(e, aluno),
          )
          const repetido = doDia.some((e) => e.resultado === 'duplicado')
          const presente = repetido || doDia.some((e) => e.resultado === 'ok')
          if (presente) presencas++
          estados.set(dia, {
            estado: presente ? (repetido ? 'repetido' : 'presente') : 'ausente',
            quando: doDia[0]?.quando,
          })
        }
        return { aluno, presencas, estados }
      }),
    [alunos, dias, daTurma],
  )

  if (turmas.length === 0) {
    return <p className="ferramentas__nota">Nenhuma turma cadastrada ainda.</p>
  }

  return (
    <>
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

      {alunos.length === 0 ? (
        <p className="ferramentas__nota">Nenhum aluno cadastrado ainda em {turma}.</p>
      ) : dias.length === 0 ? (
        <p className="ferramentas__nota">Nenhuma aula registrada ainda em {turma}.</p>
      ) : (
        <>
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
                  {dias.map((dia) => {
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
                {linhas.map(({ aluno, presencas, estados }) => (
                  <tr key={aluno.chave}>
                    <th className="planilha__nome" scope="row">
                      {aluno.nome}
                    </th>
                    <td className="planilha__contagem">
                      {presencas}/{dias.length}
                    </td>
                    {dias.map((dia) => {
                      const cel = estados.get(dia)!
                      const { numero } = rotuloDia(dia)
                      const rotulo =
                        cel.estado === 'ausente'
                          ? `${aluno.nome} · ${numero} · ausente`
                          : `${aluno.nome} · ${numero} · presente` +
                            (cel.quando
                              ? ` às ${new Date(cel.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                              : '') +
                            (cel.estado === 'repetido' ? ', crachá lido mais de uma vez' : '')
                      return (
                        <td key={dia} className="planilha__celula" title={rotulo}>
                          <span className={`quadrado quadrado--${cel.estado}`} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="planilha__legenda">
            <span>
              <span className="quadrado quadrado--presente" /> presente
            </span>
            <span>
              <span className="quadrado quadrado--repetido" /> leitura repetida
            </span>
            <span>
              <span className="quadrado quadrado--ausente" /> ausente
            </span>
          </div>
        </>
      )}
    </>
  )
}
