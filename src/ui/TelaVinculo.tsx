// Cerimônia de vínculo: um UID vira uma pessoa, sem chance de trocar aluno.
//
// A garantia não vem do meio de transporte. Vem de haver **um só nome chamado
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
import { abrirVarios } from '../ambiente/arquivos.ts'
import { pastaDisponivel } from '../ambiente/pasta.ts'
import { restaurarDeArquivos } from '../ambiente/sincronia.ts'
import type { Matriculado, Papel } from '../nucleo/tipos.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { Painel, Selo } from './componentes/Painel.tsx'
import { ComoCopiar } from './componentes/ComoCopiar.tsx'
import { Ondas } from './componentes/Simbolos.tsx'

type EstadoDaVez = 'pendente' | 'feito' | 'recusado' | 'pulado'

interface Entrada extends NomePreparado {
  estado: EstadoDaVez
  detalhe?: string
}

function comoMatriculado(turma: string, e: Entrada): Matriculado {
  return {
    turma,
    chave: e.matricula || e.completo.toLowerCase(),
    matricula: e.matricula,
    nomeCompleto: e.completo,
    nome: e.nome,
    papel: e.papel,
  }
}

export function TelaVinculo({
  turmaInicial,
  aoMudarBase,
  aoSair,
}: {
  turmaInicial?: string
  /** Volta para onde estava. Só existe quando a tela foi aberta de propósito. */
  aoSair?: () => void
  /** Chamado depois de gravar, não ao ouvir o crachá: quem conta pendências
      precisa contar sobre a base já escrita, e não competir com a escrita. */
  aoMudarBase?: () => void
} = {}) {
  const { leitor, repositorio, config } = useAdsum()

  const [turma, setTurma] = useState('')
  const [turmasSalvas, setTurmasSalvas] = useState<string[]>([])
  const [colado, setColado] = useState('')
  const [fila, setFila] = useState<Entrada[]>([])
  const [chamado, setChamado] = useState<number>()
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
      const comCracha = new Set(vinculos.map((v) => v.matricula).filter(Boolean))
      const preparados = prepararLista(
        pessoas.map((p) => ({
          nomeCompleto: p.nomeCompleto,
          matricula: p.matricula,
          docenteNoSigaa: p.papel === 'professor',
        })),
      )
      // Casado por login, nunca por índice: `prepararLista` reordena para pôr a
      // dica de docente no topo, e casar por posição devolveria o papel de uma
      // pessoa para outra — em silêncio, que é o pior jeito de errar isso.
      const porChave = new Map(pessoas.map((p) => [p.matricula || p.nomeCompleto.toLowerCase(), p]))

      setTurma(nomeDaTurma)
      setFila(
        preparados.map((p) => {
          const guardado = porChave.get(p.matricula || p.completo.toLowerCase())
          return {
            ...p,
            // O que está guardado vence o que o encurtamento supôs: já foi
            // decidido por quem opera, e edição de nome não se perde.
            papel: guardado?.papel ?? p.papel,
            nome: guardado?.nome ?? p.nome,
            estado: p.matricula && comCracha.has(p.matricula) ? ('feito' as const) : ('pendente' as const),
          }
        }),
      )
      // A barra já abre chamando o primeiro pendente. Antes exigia clicar em
      // "Cadastrar crachás" primeiro, e era um clique para chegar onde a tela
      // já deveria estar: acabou de cadastrar a turma, o passo seguinte é dar
      // crachá a ela. Turma inteira cadastrada abre fechada, que é o certo —
      // não há quem chamar.
      const primeiro = preparados.findIndex(
        (p) => !(p.matricula && comCracha.has(p.matricula)),
      )
      setChamado(primeiro >= 0 ? primeiro : undefined)
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

  const abrirPastaExistente = useCallback(async () => {
    const arquivos = await abrirVarios()
    if (arquivos.length === 0) return
    const { arquivos: lidos, problemas: falhas } = await restaurarDeArquivos(repositorio, arquivos)
    setProblemas(falhas)
    if (lidos.length === 0) {
      setRecado({ tom: 'grave', texto: 'Nenhum arquivo do Adsum entre os escolhidos.' })
      return
    }
    setTurmasSalvas(await repositorio.listarTurmas())
    setRecado({ tom: 'ok', texto: `${lidos.length} arquivos lidos.` })
    aoMudarBase?.()
  }, [repositorio, aoMudarBase])

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
    const comCracha = new Set(vinculos.map((v) => v.matricula).filter(Boolean))

    const lista = preparados.map((p) => ({
      ...p,
      estado: (p.matricula && comCracha.has(p.matricula) ? 'feito' : 'pendente') as EstadoDaVez,
    }))
    setFila(lista)
    // Mesmo motivo de `abrirTurma`: acabou de colar a turma, o passo seguinte é
    // dar crachá a ela. Este era o caminho que o autor percorreu — colar e cair
    // numa lista com a ação escondida atrás de um botão.
    const primeiro = lista.findIndex((p) => p.estado === 'pendente')
    setChamado(primeiro >= 0 ? primeiro : undefined)

    // Guardar não é decisão de ninguém: quem colou a turma quer a turma
    // guardada. O botão que existia aqui era trabalho que o app pode fazer.
    await repositorio.salvarTurma(
      turma.trim(),
      lista.map((e) => comoMatriculado(turma.trim(), e)),
    )
    setTurmasSalvas(await repositorio.listarTurmas())
    aoMudarBase?.()

    const docentes = preparados.filter((p) => p.papel === 'professor').length
    const ambiguos = preparados.filter((p) => p.ambiguo).length

    setRecado({
      tom: ambiguos > 0 ? 'alerta' : 'ok',
      texto:
        `${preparados.length} pessoas, ${docentes === 1 ? '1 professor' : `${docentes} professores`}.` +
        (ambiguos > 0 ? ` ${ambiguos} com nomes iguais — edite antes de começar.` : ''),
    })
  }, [colado, turma, repositorio])

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < fila.length; i++) if (fila[i].estado === 'pendente') return i
      return undefined
    },
    [fila],
  )

  // O laço da cerimônia. Só reage se houver exatamente um nome chamado — sem
  // chamado, uma leitura não tem a quem pertencer, e adivinhar seria justamente
  // o erro que tudo isto evita.
  useEffect(() => {
    return leitor.aoLer((leitura) => {
      void (async () => {
        if (chamado === undefined) {
          setRecado({
            tom: 'alerta',
            texto: `Crachá ${uidLegivel(leitura.uid)} lido sem nome chamado — nada foi gravado.`,
          })
          return
        }

        const entrada = fila[chamado]
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const dono = await repositorio.vinculoPorHash(uidHash)

        // Trava: crachá já vinculado é recusado, dizendo de quem é. Pega crachá
        // emprestado e segunda via cadastrada duas vezes.
        if (dono) {
          setFila((antes) =>
            antes.map((e, i) =>
              i === chamado ? { ...e, estado: 'recusado', detalhe: `crachá é de ${dono.nome}` } : e,
            ),
          )
          setRecado({
            tom: 'grave',
            texto: `Recusado: este crachá já é de ${dono.nome}. ${entrada.nome} continua chamado — pode encostar outro.`,
          })
          return
        }

        await repositorio.gravarVinculo({
          uidHash,
          papel: entrada.papel,
          nome: entrada.nome,
          matricula: entrada.matricula || undefined,
          criadoEm: leitura.em.toISOString(),
        })

        setFila((antes) =>
          antes.map((e, i) => (i === chamado ? { ...e, estado: 'feito', detalhe: uidHash } : e)),
        )
        setRecado({ tom: 'ok', texto: `${entrada.nome} vinculado.` })
        setChamado(proximoPendente(chamado + 1))
        aoMudarBase?.()
      })()
    })
  }, [leitor, chamado, fila, repositorio, config.salHex, proximoPendente, aoMudarBase])

  // Setas andam pela lista. Quem opera está com a mão no teclado e um aluno na
  // frente: pedir para mirar e clicar numa linha é atrito onde não cabe.
  useEffect(() => {
    if (chamado === undefined) return
    const andar = (evento: KeyboardEvent) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const passo = evento.key === 'ArrowRight' ? 1 : -1
      setChamado((atual) => {
        if (atual === undefined) return atual
        const proximo = atual + passo
        return proximo >= 0 && proximo < fila.length ? proximo : atual
      })
      evento.preventDefault()
    }
    window.addEventListener('keydown', andar)
    return () => window.removeEventListener('keydown', andar)
  }, [chamado, fila.length])

  const feitos = useMemo(() => fila.filter((e) => e.estado === 'feito').length, [fila])
  const semProfessor = fila.length > 0 && fila.every((e) => e.papel !== 'professor')
  /**
   * O que de fato encerra o cadastro inicial.
   *
   * Não é um botão: é o crachá do professor. Sem ele a chamada não abre; com
   * ele a rota sai desta tela sozinha. Os alunos que faltarem não precisam ser
   * perseguidos — cadastram-se encostando, na primeira aula.
   *
   * "Ninguém é professor" é outra coisa e já tinha nome (`semProfessor`);
   * confundir as duas fazia a tela dar o conselho errado.
   */
  const professorComCracha = fila.some((e) => e.papel === 'professor' && e.estado === 'feito')
  const atual = chamado !== undefined ? fila[chamado] : undefined

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

      {chamado !== undefined && atual && (
        <section className="chamado">
          {/* Voltar fica no canto, como numa folha do sistema: sair não pode
              exigir procurar. */}
          {/* Não é "voltar": a lista já está logo abaixo, e nada some da tela.
              O que este botão faz é parar de chamar nomes, e é isso que ele
              precisa dizer. */}
          <button className="chamado__voltar" onClick={() => setChamado(undefined)}>
            Parar de chamar
          </button>

          {/* Animado como no repouso: os dois são o mesmo estado — a tela
              esperando um crachá. */}
          <Ondas tamanho={54} animado />
          <p className="chamado__rotulo">Encoste o crachá de</p>
          <p className="chamado__nome">{atual.nome}</p>
          <p className="chamado__completo">
            {atual.completo} · {atual.papel}
          </p>
          <div className="chamado__acoes">
            <button
              onClick={() => setChamado(Math.max(0, chamado - 1))}
              aria-label="anterior"
              disabled={chamado === 0}
            >
              ←
            </button>
            <button
              onClick={() => {
                setFila((antes) =>
                  antes.map((e, i) => (i === chamado ? { ...e, estado: 'pulado' } : e)),
                )
                setChamado(proximoPendente(chamado + 1))
              }}
            >
              Pular
            </button>
            <button
              onClick={() => setChamado(Math.min(fila.length - 1, chamado + 1))}
              aria-label="próximo"
              disabled={chamado === fila.length - 1}
            >
              →
            </button>
          </div>
          <p className="chamado__atalho">← e → andam pela turma</p>

          {/* Com leitor simulado a cerimônia inteira roda sem hardware — é como
              se ensaia o roteiro antes de ter cinquenta alunos na fila. */}
          {ehSimulavel(leitor) && (
            <div className="chamado__acoes">
              <button
                onClick={() => {
                  try {
                    leitor.encostarProximo()
                  } catch (erro) {
                    setRecado({ tom: 'grave', texto: (erro as Error).message })
                  }
                }}
              >
                Simular um crachá
              </button>
            </div>
          )}
        </section>
      )}

      {fila.length === 0 ? (
        <section className="colagem">
          <h1 className="colagem__titulo">Cole sua turma</h1>
          <p className="colagem__nota">
            No SIGAA, abra Turma › Participantes e copie a página.
          </p>

          <textarea
            className="colagem__campo"
            value={colado}
            onChange={(e) => setColado(e.target.value)}
            placeholder="Cole aqui"
            aria-label="lista da turma"
          />

          <div className="colagem__acoes">
            <input
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              placeholder="IF685 · T01"
              aria-label="turma"
            />
            <button className="botao--acento pasta__botao" onClick={() => void interpretar()}>
              Continuar
            </button>
          </div>

          {/* Onde não há seletor de diretório — Safari, Firefox — o app não tem
              como saber que já existe uma pasta do Adsum no disco, e tratava
              quem já tem turma como se estivesse começando. Este caminho lê os
              arquivos escolhidos à mão. */}
          {!pastaDisponivel() && (
            <div className="colagem__acoes">
              <button onClick={() => void abrirPastaExistente()}>
                Já tenho uma pasta do Adsum
              </button>
            </div>
          )}

          {turmasSalvas.length > 0 && (
            <div className="colagem__acoes">
              {turmasSalvas.map((t) => (
                <button key={t} onClick={() => void abrirTurma(t)}>
                  Abrir {t}
                </button>
              ))}
            </div>
          )}

          <ComoCopiar />
        </section>
      ) : (
        <Painel
          titulo={turma}
          legenda={`${feitos} de ${fila.length} com crachá`}
          acoes={
            // Some enquanto a barra está aberta: ali ele não tinha o que fazer,
            // e clicar num botão que não responde é pior que não ter botão.
            // A barra **é** a ação; este só a traz de volta depois de parada.
            chamado === undefined && (
              <button
                className="botao--acento"
                onClick={() => {
                  const primeiro = proximoPendente(0)
                  if (primeiro === undefined) {
                    setRecado({
                      tom: 'ok',
                      texto: 'A turma inteira já tem crachá.',
                    })
                    return
                  }
                  setChamado(primeiro)
                }}
              >
                {feitos > 0 ? 'Continuar cadastrando' : 'Cadastrar crachás'}
              </button>
            )
          }
        >

          <>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome exibido</th>
                  <th>Papel</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fila.map((e, i) => (
                  <tr key={`${e.matricula || e.completo}-${i}`} className={i === chamado ? 'linha--chamada' : ''}>
                    <td>
                      <input
                        className="entrada--celula"
                        value={e.nome}
                        onChange={(evento) => renomear(i, evento.target.value)}
                        aria-label={`nome de ${e.completo}`}
                      />
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
                        <option value="aluno">Aluno</option>
                        <option value="professor">Professor</option>
                      </select>
                      {e.docenteNoSigaa && e.papel === 'aluno' && (
                        <Selo tom="alerta">SIGAA: docente</Selo>
                      )}
                    </td>
                    <td className="celula--estado">
                      {e.ambiguo && <Selo tom="grave">Nome repetido</Selo>}
                    </td>
                    {/* Chamar continua disponível depois de vinculado: um aluno
                        com dois crachás é permitido de propósito, porque segunda
                        via existe. A relação é muitos-para-um. */}
                    <td className="celula--estado">
                      {i === chamado ? (
                        <Selo tom="ok">Chamando</Selo>
                      ) : (
                        <>
                          {e.estado === 'feito' && <Selo tom="ok">Vinculado</Selo>}
                          {e.estado === 'recusado' && <Selo tom="grave">{e.detalhe}</Selo>}
                          {e.estado === 'pulado' && <Selo tom="neutro">Pulado</Selo>}
                          <button onClick={() => setChamado(i)}>
                            {e.estado === 'feito' ? 'Mais um crachá' : 'Chamar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Não existia saída daqui, e o botão dizia "Trocar de turma", que
                não é saída nenhuma. O que encerra o cadastro inicial é o crachá
                do professor: sem ele a chamada não abre, e com ele a rota sai
                sozinha desta tela. Os alunos que faltarem não precisam ser
                perseguidos — eles se cadastram encostando, durante a aula.

                Dizer isso na tela é o que transforma "cadê o botão de encerrar"
                em "ah, então já acabou". */}
            <div className="ferramentas">
              <button className={aoSair ? undefined : 'botao--quieto'}
                onClick={() => {
                  if (aoSair) return aoSair()
                  setFila([])
                  setChamado(undefined)
                  setRecado(undefined)
                  setProblemas([])
                }}
              >
                {aoSair ? 'Concluir' : 'Escolher outra turma'}
              </button>
              <span className="ferramentas__ou">
                {professorComCracha
                  ? 'Pode parar quando quiser. Quem faltar se cadastra na primeira aula, encostando o crachá.'
                  : 'Comece pelo seu crachá: é ele que abre a chamada.'}
              </span>
            </div>
          </>
        </Painel>
      )}
    </div>
  )
}
