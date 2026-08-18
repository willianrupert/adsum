// Cerimônia de vínculo: um UID vira uma pessoa, sem chance de trocar aluno.
//
// A garantia não vem do meio de transporte. Vem de haver **um só nome armado
// por vez**: arma-se um nome, ele aparece grande na tela, o aluno confere e
// encosta o crachá. O UID capturado só pode ser daquele nome — não havia
// segundo candidato. E o aluno lê o próprio nome antes de encostar, o que faz
// disso conferência de duas partes, não confiança em quem opera.
//
// O padrão anterior era auto-cadastro, com o nome preenchido depois na planilha.
// Casar depois é exatamente onde a troca acontece: sobram uma lista de UIDs e
// uma lista de nomes, pareadas por memória ou por horário.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularUidHash } from '../nucleo/hash.ts'
import { prepararLista, type NomePreparado } from '../nucleo/nomes.ts'
import { interpretarParticipantes } from '../nucleo/sigaa.ts'
import { uidLegivel } from '../nucleo/uid.ts'
import type { Matriculado, Papel } from '../nucleo/tipos.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'
import { ComoCopiar } from './componentes/ComoCopiar.tsx'

type EstadoDaVez = 'pendente' | 'feito' | 'recusado' | 'pulado'

interface Entrada extends NomePreparado {
  estado: EstadoDaVez
  detalhe?: string
}

function comoMatriculado(turma: string, e: Entrada): Matriculado {
  return { turma, login: e.login, nomeCompleto: e.completo, nome: e.nome, papel: e.papel }
}

export function TelaVinculo({
  turmaInicial,
  aoMudarBase,
}: {
  turmaInicial?: string
  /** Chamado depois de gravar, não ao ouvir o crachá: quem conta pendências
      precisa contar sobre a base já escrita, e não competir com a escrita. */
  aoMudarBase?: () => void
} = {}) {
  const { leitor, repositorio, config } = useAdsum()

  const [turma, setTurma] = useState('')
  const [turmasSalvas, setTurmasSalvas] = useState<string[]>([])
  const [colado, setColado] = useState('')
  const [fila, setFila] = useState<Entrada[]>([])
  const [armado, setArmado] = useState<number>()
  const [problemas, setProblemas] = useState<string[]>([])
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave' | 'alerta'; texto: string }>()
  const [estadoLeitor, setEstadoLeitor] = useState(leitor.estado())

  useEffect(() => leitor.aoMudarEstado(setEstadoLeitor), [leitor])
  useEffect(() => setEstadoLeitor(leitor.estado()), [leitor])
  useEffect(() => {
    void repositorio.listarTurmas().then(setTurmasSalvas)
  }, [repositorio])

  /** Repõe na tela uma turma já guardada, com quem já tem crachá marcado. */
  const abrirTurma = useCallback(
    async (nomeDaTurma: string) => {
      const [pessoas, vinculos] = await Promise.all([
        repositorio.listarMatriculados(nomeDaTurma),
        repositorio.listarVinculos(),
      ])
      const comCracha = new Set(vinculos.map((v) => v.login).filter(Boolean))
      const preparados = prepararLista(
        pessoas.map((p) => ({
          nomeCompleto: p.nomeCompleto,
          login: p.login,
          docenteNoSigaa: p.papel === 'professor',
          loginProvisorio: /^\d+$/.test(p.login),
        })),
      )
      // Casado por login, nunca por índice: `prepararLista` reordena para pôr a
      // dica de docente no topo, e casar por posição devolveria o papel de uma
      // pessoa para outra — em silêncio, que é o pior jeito de errar isso.
      const porLogin = new Map(pessoas.map((p) => [p.login, p]))

      setTurma(nomeDaTurma)
      setFila(
        preparados.map((p) => {
          const guardado = porLogin.get(p.login)
          return {
            ...p,
            // O que está guardado vence o que o encurtamento supôs: já foi
            // decidido por quem opera, e edição de nome não se perde.
            papel: guardado?.papel ?? p.papel,
            nome: guardado?.nome ?? p.nome,
            estado: comCracha.has(p.login) ? ('feito' as const) : ('pendente' as const),
          }
        }),
      )
      setArmado(undefined)
      setProblemas([])
    },
    [repositorio],
  )

  // Abre sozinho a turma que tem crachá faltando. Perguntar "qual turma?"
  // quando só existe uma resposta é o app terceirizando uma decisão que ele
  // já tomou.
  useEffect(() => {
    if (turmaInicial && fila.length === 0) void abrirTurma(turmaInicial)
  }, [turmaInicial, fila.length, abrirTurma])

  const interpretar = useCallback(async () => {
    if (!turma.trim()) {
      setRecado({ tom: 'grave', texto: 'Dê um nome à turma antes — a lista é guardada por turma.' })
      return
    }

    const leitura = interpretarParticipantes(colado)
    setProblemas(leitura.problemas)

    if (leitura.pessoas.length === 0) {
      setRecado({ tom: 'grave', texto: 'Nenhuma pessoa reconhecida nessa colagem.' })
      return
    }

    const preparados = prepararLista(leitura.pessoas)
    const vinculos = await repositorio.listarVinculos()
    const comCracha = new Set(vinculos.map((v) => v.login).filter(Boolean))

    setFila(
      preparados.map((p) => ({
        ...p,
        estado: p.login && comCracha.has(p.login) ? 'feito' : 'pendente',
      })),
    )
    setArmado(undefined)

    const docentes = preparados.filter((p) => p.docenteNoSigaa).length
    const semLogin = preparados.filter((p) => !p.login).length
    const provisorios = preparados.filter((p) => p.loginProvisorio).length
    const ambiguos = preparados.filter((p) => p.ambiguo).length

    const avisos = [
      ambiguos > 0 && `${ambiguos} ficaram com nomes iguais — edite antes de armar`,
      semLogin > 0 && `${semLogin} sem login do CIn`,
      provisorios > 0 &&
        `${provisorios} com login que é só número (matrícula ou CPF) — confira antes de gravar`,
    ].filter(Boolean)

    setRecado({
      tom: avisos.length > 0 ? 'alerta' : 'ok',
      texto:
        `${preparados.length} pessoas, todas como aluno` +
        (docentes > 0
          ? `, ${docentes === 1 ? '1 marcada' : `${docentes} marcadas`} como docente pelo SIGAA`
          : '') +
        '.' +
        (avisos.length > 0 ? ` Atenção: ${avisos.join('; ')}.` : ''),
    })
  }, [colado, turma, repositorio])

  const guardarTurma = useCallback(async () => {
    await repositorio.salvarTurma(
      turma.trim(),
      fila.map((e) => comoMatriculado(turma.trim(), e)),
    )
    setTurmasSalvas(await repositorio.listarTurmas())
    setRecado({ tom: 'ok', texto: `Turma ${turma.trim()} guardada com ${fila.length} pessoas.` })
    aoMudarBase?.()
  }, [repositorio, turma, fila, aoMudarBase])

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < fila.length; i++) if (fila[i].estado === 'pendente') return i
      return undefined
    },
    [fila],
  )

  // O laço da cerimônia. Só reage se houver exatamente um nome armado — sem
  // armado, uma leitura não tem a quem pertencer, e adivinhar seria justamente
  // o erro que tudo isto evita.
  useEffect(() => {
    return leitor.aoLer((leitura) => {
      void (async () => {
        if (armado === undefined) {
          setRecado({
            tom: 'alerta',
            texto: `Crachá ${uidLegivel(leitura.uid)} lido sem nome armado — nada foi gravado.`,
          })
          return
        }

        const entrada = fila[armado]
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const dono = await repositorio.vinculoPorHash(uidHash)

        // Trava: crachá já vinculado é recusado, dizendo de quem é. Pega crachá
        // emprestado e segunda via cadastrada duas vezes.
        if (dono) {
          setFila((antes) =>
            antes.map((e, i) =>
              i === armado ? { ...e, estado: 'recusado', detalhe: `crachá é de ${dono.nome}` } : e,
            ),
          )
          setRecado({
            tom: 'grave',
            texto: `Recusado: este crachá já é de ${dono.nome}. ${entrada.nome} continua armado — pode encostar outro.`,
          })
          return
        }

        await repositorio.gravarVinculo({
          uidHash,
          papel: entrada.papel,
          nome: entrada.nome,
          login: entrada.login || undefined,
          criadoEm: leitura.em.toISOString(),
        })

        setFila((antes) =>
          antes.map((e, i) => (i === armado ? { ...e, estado: 'feito', detalhe: uidHash } : e)),
        )
        setRecado({ tom: 'ok', texto: `${entrada.nome} vinculado.` })
        setArmado(proximoPendente(armado + 1))
        aoMudarBase?.()
      })()
    })
  }, [leitor, armado, fila, repositorio, config.salHex, proximoPendente, aoMudarBase])

  const feitos = useMemo(() => fila.filter((e) => e.estado === 'feito').length, [fila])
  const pendentes = useMemo(() => fila.filter((e) => e.estado === 'pendente').length, [fila])
  const semProfessor = fila.length > 0 && fila.every((e) => e.papel !== 'professor')
  const atual = armado !== undefined ? fila[armado] : undefined

  function renomear(indice: number, nome: string) {
    setFila((antes) =>
      antes.map((e, i) => (i === indice ? { ...e, nome, ambiguo: false } : e)),
    )
  }

  return (
    <div className="diagnostico">
      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}

      {problemas.length > 0 && (
        <div className="aviso aviso--alerta">
          <strong>A leitura da página deixou coisas de fora:</strong>
          <ul className="manual__passos">
            {problemas.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {semProfessor && (
        <div className="aviso aviso--alerta">
          <strong>Ninguém está marcado como professor.</strong>
          <p>Sem ele, a aula não abre. Quem o SIGAA listou como docente está no topo.</p>
        </div>
      )}

      {estadoLeitor !== 'lendo' && fila.length > 0 && (
        <div className="aviso aviso--alerta">
          <strong>O leitor está {estadoLeitor}.</strong>
          <p>
            Sem leitor, nenhum crachá chega. Escolha e inicie um no{' '}
            <a href="#/diagnostico">Diagnóstico</a>.
          </p>
        </div>
      )}

      {armado !== undefined && atual && (
        <section className="armado">
          <p className="armado__rotulo">encoste o crachá de</p>
          <p className="armado__nome">{atual.nome}</p>
          {atual.login && <p className="armado__login">&lt;{atual.login}&gt;</p>}
          <p className="armado__completo">
            {atual.completo} · {atual.papel}
          </p>
          <div className="armado__acoes">
            <button
              onClick={() => {
                setFila((antes) =>
                  antes.map((e, i) => (i === armado ? { ...e, estado: 'pulado' } : e)),
                )
                setArmado(proximoPendente(armado + 1))
              }}
            >
              pular
            </button>
            <button onClick={() => setArmado(undefined)}>encerrar</button>
          </div>

          {/* Com leitor simulado a cerimônia inteira roda sem hardware — é como
              se ensaia o roteiro antes de ter cinquenta alunos na fila. */}
          {ehSimulavel(leitor) && (
            <div className="armado__acoes">
              <button
                onClick={() => {
                  try {
                    leitor.encostarProximo()
                  } catch (erro) {
                    setRecado({ tom: 'grave', texto: (erro as Error).message })
                  }
                }}
              >
                simular um crachá
              </button>
            </div>
          )}
        </section>
      )}

      <Painel
        titulo="A turma"
        legenda="Cole a página de participantes do SIGAA."
        acoes={
          fila.length === 0 ? (
            <button className="botao--acento" onClick={() => void interpretar()}>
              interpretar
            </button>
          ) : (
            <>
              <button onClick={() => void guardarTurma()}>guardar turma</button>
              <button
                className="botao--acento"
                onClick={() => {
                  const primeiro = proximoPendente(0)
                  if (primeiro === undefined) {
                    setRecado({ tom: 'ok', texto: 'Nada pendente — a turma inteira já tem crachá.' })
                    return
                  }
                  setArmado(primeiro)
                }}
              >
                iniciar cerimônia
              </button>
            </>
          )
        }
      >
        {fila.length === 0 ? (
          <>
            <div className="ferramentas ferramentas--topo">
              <input
                value={turma}
                onChange={(e) => setTurma(e.target.value)}
                placeholder="IF685 · T01"
                aria-label="turma"
              />
              {turmasSalvas.length > 0 && (
                <>
                  <span className="ferramentas__ou">ou abra uma já guardada</span>
                  {turmasSalvas.map((t) => (
                    <button key={t} onClick={() => void abrirTurma(t)}>
                      {t}
                    </button>
                  ))}
                </>
              )}
            </div>
            <textarea
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              placeholder="Cole aqui a página Turma › Participantes do SIGAA."
              rows={8}
              aria-label="lista da turma"
            />
            <ComoCopiar />
          </>
        ) : (
          <>
            <Linha rotulo="turma">{turma}</Linha>
            <Linha rotulo="progresso">
              {feitos} de {fila.length} com crachá
              {pendentes > 0 && ` · ${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}`}
            </Linha>
            <table className="tabela">
              <thead>
                <tr>
                  <th>nome no aparelho</th>
                  <th>login</th>
                  <th>papel</th>
                  <th>estado</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((e, i) => (
                  <tr key={`${e.login || e.completo}-${i}`} className={i === armado ? 'linha--armada' : ''}>
                    <td>
                      <input
                        className="entrada--celula"
                        value={e.nome}
                        onChange={(evento) => renomear(i, evento.target.value)}
                        aria-label={`nome de ${e.completo}`}
                      />
                    </td>
                    <td className="celula--estado">
                      {e.login ? <code>{e.login}</code> : <Selo tom="alerta">sem login</Selo>}
                      {e.loginProvisorio && <Selo tom="alerta">só número</Selo>}
                    </td>
                    <td className="celula--estado">
                      <select
                        value={e.papel}
                        onChange={(evento) =>
                          setFila((antes) =>
                            antes.map((x, j) =>
                              j === i ? { ...x, papel: evento.target.value as Papel } : x,
                            ),
                          )
                        }
                        aria-label={`papel de ${e.completo}`}
                      >
                        <option value="aluno">aluno</option>
                        <option value="professor">professor</option>
                      </select>
                      {e.docenteNoSigaa && e.papel === 'aluno' && (
                        <Selo tom="alerta">SIGAA: docente</Selo>
                      )}
                    </td>
                    <td className="celula--estado">
                      {e.ambiguo && <Selo tom="grave">nome repetido</Selo>}
                    </td>
                    {/* Armar continua disponível depois de vinculado: um aluno com
                        dois crachás é permitido de propósito, porque segunda via
                        existe. A relação é muitos-para-um. */}
                    <td className="celula--estado">
                      {i === armado ? (
                        <Selo tom="ok">armado</Selo>
                      ) : (
                        <>
                          {e.estado === 'feito' && <Selo tom="ok">vinculado</Selo>}
                          {e.estado === 'recusado' && <Selo tom="grave">{e.detalhe}</Selo>}
                          {e.estado === 'pulado' && <Selo tom="neutro">pulado</Selo>}
                          <button onClick={() => setArmado(i)}>
                            {e.estado === 'feito' ? 'outro crachá' : 'armar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ferramentas">
              <button
                onClick={() => {
                  setFila([])
                  setArmado(undefined)
                  setRecado(undefined)
                  setProblemas([])
                }}
              >
                trocar de turma
              </button>
              <span className="ferramentas__ou">
                Segunda via: arme o nome de novo.
              </span>
            </div>
          </>
        )}
      </Painel>
    </div>
  )
}
