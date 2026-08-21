// Tela do repositório: vínculos, grade, registros e sal.
//
// Os arquivos daqui são os mesmos do cofre em pasta — ver `docs/01_cofre.md`.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { deCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import {
  deJsonCompartilhado,
  deJsonGrade,
  deJsonVinculos,
  NOMES,
  paraJsonCompartilhado,
  paraJsonGrade,
  paraJsonVinculos,
} from '../nucleo/cofre.ts'
import type { Aula, Evento, Papel, Resultado as ResultadoDeEvento, Vinculo } from '../nucleo/tipos.ts'
import { abrirTexto, salvarTexto, type ComoSalvou } from '../ambiente/arquivos.ts'
import { pastaDisponivel } from '../ambiente/pasta.ts'
import { comoInstalar, ehWebKit, instalado } from '../ambiente/instalacao.ts'
import { useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'
import { Cartao } from './componentes/Cartao.tsx'
import { GradeDaSemana, aulasDe } from './componentes/GradeDaSemana.tsx'
import { marcadosDe } from '../nucleo/horarios.ts'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'

/**
 * O que dizer onde não há seletor de pasta — e são dois casos diferentes.
 *
 * O texto antigo dizia só "os dados ficam no navegador", como se fosse
 * inconveniência. No WebKit é prazo: sete dias de uso do navegador sem visitar
 * o site e ele apaga IndexedDB, localStorage e o registro do service worker.
 * Tranquilizar onde se deveria avisar é o pior defeito que uma tela dessas
 * pode ter. O Firefox não tem pasta e também não apaga — merece o texto calmo.
 */
function SemPasta() {
  const caminho = comoInstalar()
  const prazo = ehWebKit() && !instalado()

  return (
    <>
      <p className="ferramentas__nota">
        Este navegador não tem seletor de pasta. Só Chrome e Edge têm, e aqui a cópia é
        por sua conta: exporte os arquivos abaixo e guarde-os onde quiser.
      </p>

      {prazo && (
        <p className="ferramentas__nota ferramentas__nota--forte">
          E há prazo: o Safari apaga os dados deste site depois de <strong>sete dias de
          uso dele</strong> sem você voltar aqui, levando a turma junto.
          {caminho && (
            <>
              {' '}
              Instalar o Adsum ({caminho.passos.join(' › ')}) tira o app do Safari e para
              essa contagem. Mas o app instalado começa em branco, então exporte antes e
              importe lá.
            </>
          )}
        </p>
      )}

      {ehWebKit() && instalado() && (
        <p className="ferramentas__nota">
          Instalado, fora do Safari: a base não tem mais prazo de sete dias.
        </p>
      )}

      <p className="ferramentas__nota">
        Para trazer uma base já existente, use <strong>Já tenho uma pasta do Adsum</strong>{' '}
        na tela de colar a turma. Aqui o seletor abre a pasta inteira de uma vez, e ler já
        é um clique só; o que falta é escrever de volta sozinho.
      </p>
    </>
  )
}

/**
 * A grade nos Ajustes: seletor de turma em cima, a mesma semana embaixo.
 *
 * Era uma lista de campos — dia, início, fim, professor, turma — mais um botão
 * de acrescentar. Cadastrar assim já era ruim; **corrigir** era pior, porque
 * mudar a quarta de lugar exigia apagar e recriar.
 *
 * Grava a cada toque: em ajustes não existe "salvar", existe mudar. E o seletor
 * só aparece com mais de uma turma, porque escolher entre uma é escolher nada.
 */
function GradeDeAjustes({
  turmas,
  aulas,
  professorPadrao,
  aoMudar,
}: {
  turmas: string[]
  aulas: Aula[]
  professorPadrao: string
  aoMudar: (turma: string, aulas: Aula[]) => Promise<void>
}) {
  const [escolhida, setEscolhida] = useState<string>()
  const turma = escolhida && turmas.includes(escolhida) ? escolhida : turmas[0]

  const daTurma = useMemo(() => aulas.filter((a) => a.turma === turma), [aulas, turma])
  const { marcados, foraDosBlocos } = useMemo(() => marcadosDe(daTurma), [daTurma])

  if (turmas.length === 0) {
    return <p className="ferramentas__nota">Nenhuma turma cadastrada ainda.</p>
  }

  return (
    <>
      {turmas.length > 1 && (
        <div className="segmentado segmentado--turmas" role="group" aria-label="turma">
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

      <GradeDaSemana
        marcados={marcados}
        rotulo={`Horários de ${turma}`}
        aoMudar={(novos) => {
          // O professor da grade é quem já tem crachá. Sem nenhum, a grade não
          // tem por onde ser indexada — e a tela diz isso abaixo.
          void aoMudar(turma, aulasDe(novos, turma, daTurma[0]?.uidHashProfessor ?? professorPadrao))
        }}
      />

      {foraDosBlocos > 0 && (
        <p className="cronograma__aviso">
          {foraDosBlocos === 1
            ? 'Uma aula desta turma está em horário fora destes blocos e não aparece na grade.'
            : `${foraDosBlocos} aulas desta turma estão em horários fora destes blocos e não aparecem na grade.`}{' '}
          Tocar aqui substitui o horário dela pelo que ficar marcado.
        </p>
      )}

      {!professorPadrao && (
        <p className="ferramentas__nota">
          Nenhum vínculo de professor ainda. A grade não tem por onde ser indexada até
          existir um.
        </p>
      )}
    </>
  )
}

function tomDoResultado(r: ResultadoDeEvento): 'ok' | 'neutro' | 'grave' | 'alerta' {
  if (r === 'ok') return 'ok'
  if (r === 'duplicado') return 'neutro'
  if (r === 'rapido_demais') return 'alerta'
  return 'grave'
}

const NOME_DO_RESULTADO: Record<ResultadoDeEvento, string> = {
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
 */
function TabelaDeRegistros({ turmas, eventos }: { turmas: string[]; eventos: Evento[] }) {
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

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function comoFoi(salvou: ComoSalvou, nome: string): string {
  if (salvou === 'cancelado') return 'cancelado.'
  if (salvou === 'gravado') return `${nome} gravado.`
  return `${nome} foi para a pasta de downloads. Este navegador não tem File System Access.`
}

export function TelaRepositorio({
  pasta,
  aoTrocarPasta,
  aoRelerPasta,
  aoDesconectarPasta,
  aoResetar,
}: {
  pasta?: FileSystemDirectoryHandle
  aoTrocarPasta?: () => void
  /** Puxa da pasta para o cache. Ver o botão abaixo. */
  aoRelerPasta?: () => Promise<{ arquivos: string[]; problemas: string[] }>
  /** Solta o vínculo com a pasta. Não apaga arquivo nem base. */
  aoDesconectarPasta?: () => Promise<void>
  /** Apaga a base deste navegador. Os arquivos da pasta ficam. */
  aoResetar?: () => Promise<void>
} = {}) {
  const { repositorio, config, recarregarConfig } = useAdsum()

  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [turmas, setTurmas] = useState<string[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [busca, setBusca] = useState('')
  const [importacao, setImportacao] = useState<Resultado>()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave'; texto: string }>()

  const carregar = useCallback(async () => {
    const [v, a, e, t, ev] = await Promise.all([
      repositorio.listarVinculos(),
      repositorio.listarAulas(),
      repositorio.contarEventos(),
      repositorio.listarTurmas(),
      repositorio.listarEventos(),
    ])
    setVinculos(v)
    setAulas(a)
    setTotalEventos(e)
    setTurmas(t)
    setEventos(ev)
  }, [repositorio])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function tentar(rotulo: string, acao: () => Promise<string | void>) {
    return async () => {
      try {
        const detalhe = await acao()
        setRecado({ tom: 'ok', texto: detalhe ? `${rotulo}: ${detalhe}` : `${rotulo}: feito.` })
        await carregar()
      } catch (erro) {
        setRecado({ tom: 'grave', texto: `${rotulo}: ${(erro as Error).message}` })
      }
    }
  }

  const professores = useMemo(() => vinculos.filter((v) => v.papel === 'professor'), [vinculos])
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return vinculos
    return vinculos.filter(
      (v) => v.nome.toLowerCase().includes(termo) || v.uidHash.includes(termo),
    )
  }, [vinculos, busca])

  const importarVinculos = tentar(`Importar ${NOMES.vinculos}`, async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { conteudo, problemas } = deJsonVinculos(arquivo.texto)
    for (const vinculo of conteudo ?? []) await repositorio.gravarVinculo(vinculo)
    setImportacao({
      arquivo: arquivo.nome,
      aceitos: conteudo?.length ?? 0,
      problemas: problemas.map((p, i) => ({ linha: i + 1, texto: arquivo.nome, motivo: p.motivo })),
    })
    return `${conteudo?.length ?? 0} vínculos.`
  })

  const importarGrade = tentar(`Importar ${NOMES.grade}`, async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { conteudo, problemas } = deJsonGrade(arquivo.texto)
    for (const aula of conteudo ?? []) await repositorio.gravarAula({ ...aula, id: undefined })
    setImportacao({
      arquivo: arquivo.nome,
      aceitos: conteudo?.length ?? 0,
      problemas: problemas.map((p, i) => ({ linha: i + 1, texto: arquivo.nome, motivo: p.motivo })),
    })
    return `${conteudo?.length ?? 0} aulas.`
  })

  const importarRegistros = tentar('Importar registros', async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { itens, problemas } = deCsv(arquivo.texto)
    // `evento_id` é a chave: reimportar o mesmo arquivo não duplica linha, e é
    // ela que permite juntar dois arquivos que a sincronização duplicou.
    for (const evento of itens) await repositorio.acrescentarEvento(evento)
    setImportacao({ arquivo: arquivo.nome, aceitos: itens.length, problemas })
    return `${itens.length} linhas lidas.`
  })

  return (
    <div className="diagnostico">
      {/* Sem pasta escolhida, os dados existem **num navegador**, não num
          computador: o mesmo Mac com Chrome e Safari tem duas bases separadas,
          e cada uma some se aquele navegador limpar os dados do site. Dizer
          "neste computador" seria promessa maior do que a verdade. */}
      {/* Onde os dados estão. O navegador entrega só o **nome** da pasta — o
          caminho completo fica fora do alcance da página de propósito, e é uma
          proteção, não uma limitação a contornar. */}
      <Painel
        titulo="Onde os dados ficam"
        recolhivel
        acoes={
          // Sem seletor de diretório, não existe botão: oferecer uma ação que o
          // navegador não pode executar é pior que não oferecer nada.
          aoTrocarPasta &&
          pastaDisponivel() && (
            <>
              {/* O único caminho manual de **puxar** da pasta. O outro conserto
                  empurra cache → pasta, e o automático só dispara com a base
                  vazia — então uma pasta no iCloud atualizada por outra máquina
                  nunca entrava, apesar de "a pasta é a dona". Não apaga nada:
                  vínculos entram por chave e eventos por `evento_id`, então
                  reler duas vezes dá no mesmo. */}
              {pasta && aoDesconectarPasta && (
                <button
                  className="botao--grave"
                  onClick={tentar('Desconectar', async () => {
                    if (
                      !confirm(
                        'Desconectar a pasta? Os arquivos continuam onde estão, e a base continua neste navegador. O Adsum só para de gravar nela.',
                      )
                    ) {
                      throw new Error('cancelado')
                    }
                    await aoDesconectarPasta()
                    return 'a pasta não recebe mais gravação.'
                  })}
                >
                  Desconectar
                </button>
              )}
              {pasta && aoRelerPasta && (
                <button
                  onClick={tentar('Reler a pasta', async () => {
                    const { arquivos, problemas } = await aoRelerPasta()
                    if (problemas.length > 0) throw new Error(problemas[0])
                    return `${arquivos.length} arquivos.`
                  })}
                >
                  Reler a pasta
                </button>
              )}
              <button className={pasta ? undefined : 'botao--acento'} onClick={aoTrocarPasta}>
                {pasta ? 'Trocar de pasta' : 'Escolher pasta'}
              </button>
            </>
          )
        }
      >
        {pasta ? (
          <>
            <Linha rotulo="pasta">
              <strong>{pasta.name}</strong>
            </Linha>
            <Linha rotulo="dentro dela">
              <code>config.json · vinculos.json · turmas/ · registros/</code>
            </Linha>
            <p className="ferramentas__nota">
              Gravado a cada mudança. O navegador não revela o caminho completo, então
              procure a pasta pelo nome, onde você a escolheu. O <code>LEIA-ME.txt</code> lá dentro
              explica cada arquivo e como recuperar tudo.
            </p>
            {/* O que surpreendeu o autor: esvaziar a pasta pela mão não muda
                nada na tela, e a gravação seguinte a reenche. É de propósito —
                pasta no iCloud que ainda não sincronizou, ou volume
                desmontado, aparecem vazios, e apagar a base local por causa
                disso seria perder a turma por um problema de rede. A pasta é a
                dona do que ela **tem**, não do que falta nela. */}
            <p className="ferramentas__nota">
              Esvaziar a pasta pela mão não apaga a base daqui, e a próxima
              gravação a reenche. Para parar de gravar nela, use{' '}
              <strong>Desconectar</strong>. Para apagar a base, os botões de zerar
              abaixo.
            </p>
            <p className="ferramentas__nota">
              <strong>Reler a pasta</strong> traz de volta o que estiver lá e não estiver
              aqui. Útil se a pasta fica no iCloud e outra máquina gravou nela, e não apaga
              nada.
            </p>
          </>
        ) : pastaDisponivel() ? (
          <p className="ferramentas__nota">
            Nenhuma pasta escolhida: os dados existem só neste navegador, e somem se você
            limpar os dados do site.
          </p>
        ) : (
          <SemPasta />
        )}
      </Painel>

      <div className="cartoes">
        <Cartao
          icone="◎"
          tom={vinculos.length > 0 ? 'ok' : 'neutro'}
          titulo={plural(vinculos.length, 'crachá', 'crachás')}
          apoio={`${professores.length} de professor`}
        />
        <Cartao
          icone="☰"
          tom={aulas.length > 0 ? 'ok' : 'neutro'}
          titulo={plural(aulas.length, 'aula', 'aulas')}
          apoio="na grade"
        />
        <Cartao
          icone="↓"
          tom="neutro"
          titulo={plural(totalEventos, 'registro', 'registros')}
          apoio="nunca reescritos"
        />
      </div>

      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}
      {importacao && <Importacao resultado={importacao} />}

      <Painel
        titulo="Vínculos"
        recolhivel
        legenda="Quais crachás são de quem."
        acoes={
          <>
            <button onClick={importarVinculos}>Importar</button>
            <button
              onClick={tentar(`Exportar ${NOMES.vinculos}`, async () =>
                comoFoi(
                  await salvarTexto(NOMES.vinculos, paraJsonVinculos(vinculos)),
                  NOMES.vinculos,
                ),
              )}
            >
              Exportar
            </button>
            <button
              className="botao--grave"
              onClick={tentar('Zerar vínculos', async () => {
                if (!confirm(`Apagar os ${vinculos.length} vínculos deste navegador?`)) {
                  throw new Error('cancelado')
                }
                await repositorio.zerarVinculos()
              })}
            >
              Zerar
            </button>
          </>
        }
      >
        <div className="ferramentas ferramentas--topo">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="filtrar por nome ou hash"
            aria-label="filtrar vínculos"
            className="entrada--larga"
          />
          <span className="ferramentas__ou">
            {vinculos.length} crachás · {professores.length} de professor
          </span>
        </div>

        {vinculos.length === 0 ? (
          <p className="vazio">Nenhum crachá vinculado ainda.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Papel</th>
                <th>uid_hash</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((v) => (
                <tr key={v.uidHash}>
                  <td>
                    <input
                      className="entrada--celula"
                      value={v.nome}
                      onChange={(e) =>
                        setVinculos((antes) =>
                          antes.map((x) =>
                            x.uidHash === v.uidHash ? { ...x, nome: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={tentar('Renomear', () => repositorio.gravarVinculo(v))}
                      aria-label={`nome de ${v.uidHash}`}
                    />
                  </td>
                  <td>
                    <select
                      value={v.papel}
                      onChange={(e) => {
                        const papel = e.target.value as Papel
                        void tentar('Trocar papel', () =>
                          repositorio.gravarVinculo({ ...v, papel }),
                        )()
                      }}
                      aria-label={`papel de ${v.uidHash}`}
                    >
                      <option value="aluno">Aluno</option>
                      <option value="professor">Professor</option>
                    </select>
                  </td>
                  <td>
                    <code>{v.uidHash}</code>
                  </td>
                  <td>
                    <button
                      className="botao--grave"
                      onClick={tentar('Remover', () => repositorio.removerVinculo(v.uidHash))}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Painel>

      {/* A mesma grade do cronograma, e não uma lista de campos. O professor
          que quer mudar a quarta de lugar olha a semana e aponta — foi assim
          que ele cadastrou, e é assim que ele corrige. Um seletor de turma em
          cima porque aqui há mais de uma; no cadastro, só havia aquela.

          Grava a cada toque: em ajustes não existe "salvar", existe mudar. */}
      <Painel
        titulo="Grade horária"
        recolhivel
        legenda="Quando cada turma tem aula."
        acoes={
          <>
            <button onClick={importarGrade}>Importar</button>
            <button
              onClick={tentar(`Exportar ${NOMES.grade}`, async () =>
                comoFoi(await salvarTexto(NOMES.grade, paraJsonGrade(aulas)), NOMES.grade),
              )}
            >
              Exportar
            </button>
          </>
        }
      >
        <GradeDeAjustes
          turmas={turmas}
          aulas={aulas}
          professorPadrao={professores[0]?.uidHash ?? ''}
          aoMudar={async (turma, novas) => {
            await repositorio.definirHorarioDaTurma(turma, novas)
            await carregar()
          }}
        />
      </Painel>

      <Painel
        titulo="Registros"
        recolhivel
        legenda="Quem esteve presente, e o que a planilha consome."
        acoes={
          <>
            <button onClick={importarRegistros}>Importar</button>
            <button
              onClick={tentar('Exportar registros', async () => {
                const eventos = await repositorio.listarEventos()
                // O login não fica no evento: fica no vínculo, que é onde ele
                // pertence. A coluna é preenchida na saída, com o vínculo de
                // hoje — assim corrigir um login corrige as exportações futuras
                // sem reescrever uma linha sequer do log.
                const vinculos = await repositorio.listarVinculos()
                const matriculaPorHash = new Map(vinculos.map((v) => [v.uidHash, v.matricula]))
                const ordenados = [...eventos]
                  .reverse()
                  .map((e) => ({ ...e, matricula: e.matricula ?? matriculaPorHash.get(e.uidHash) }))

                // Um arquivo por turma: cada turma vira uma planilha, e turma
                // nova não mexe em arquivo de turma antiga.
                const turmas = porTurma(ordenados)
                if (turmas.size === 0) throw new Error('nenhum registro para exportar')
                const nomes: string[] = []
                for (const [turma, linhas] of turmas) {
                  const alvo = nomeDoArquivo(turma)
                  const salvou = await salvarTexto(alvo, paraCsv(linhas))
                  if (salvou === 'cancelado') break
                  nomes.push(alvo)
                }
                return nomes.length > 0 ? `${nomes.join(', ')}.` : 'cancelado.'
              })}
            >
              Exportar
            </button>
          </>
        }
      >
        <Linha rotulo="linhas gravadas">{totalEventos}</Linha>
        <Linha rotulo="colunas">
          <code>evento_id;quando;turma;matricula;nome;origem;resultado;uid_hash</code>
        </Linha>

        <TabelaDeRegistros turmas={turmas} eventos={eventos} />
      </Painel>

      {/* Recomeçar do zero.
          Existia só no modo de ensaio, e o professor real também precisa: fim
          de semestre, máquina que muda de dono, ou simplesmente querer refazer
          o cadastro sem resíduo.

          O texto importa mais que o botão. "Apagar tudo" não diz **o quê**, e
          aqui há duas coisas com destinos diferentes: a base deste navegador
          some, os arquivos da pasta ficam onde estão. Quem não souber disso
          apaga achando que apagou os dois, ou não apaga achando que apagaria. */}
      {aoResetar && (
        <Painel
          titulo="Recomeçar do zero"
          recolhivel
          legenda="Devolve este navegador ao estado de quem nunca abriu o Adsum."
        >
          <p className="ferramentas__nota">
            Apaga <strong>deste navegador</strong>: turmas, crachás vinculados, grade
            horária, registros de presença e as preferências (leitor escolhido, avisos
            dispensados). O segredo desta instalação some junto, e com ele os crachás
            deixam de ser reconhecíveis.
          </p>
          <p className="ferramentas__nota ferramentas__nota--forte">
            Não apaga os arquivos da pasta. Eles continuam onde estão, e reescolher a
            pasta depois traz tudo de volta — inclusive o segredo. Para apagar de
            verdade, apague a pasta você mesmo, no Finder.
          </p>
          <div className="ferramentas">
            <button
              className="botao--grave"
              onClick={tentar('Recomeçar', async () => {
                if (
                  !confirm(
                    'Apagar a base deste navegador? Os arquivos da pasta continuam onde estão.',
                  )
                ) {
                  throw new Error('cancelado')
                }
                await aoResetar()
                return 'pronto. O Adsum vai recomeçar.'
              })}
            >
              Apagar a base deste navegador
            </button>
          </div>
        </Painel>
      )}

      <Painel
        titulo="Passar os crachás a outro professor"
        recolhivel
        legenda="Quem dá aula para os mesmos alunos não precisa cadastrar tudo de novo."
        acoes={
          <>
            <button
              onClick={tentar('Importar crachás', async () => {
                const arquivo = await abrirTexto()
                if (!arquivo) return 'cancelado.'
                const { conteudo, problemas } = deJsonCompartilhado(arquivo.texto)
                if (!conteudo) throw new Error(problemas[0]?.motivo ?? 'arquivo não reconhecido')

                // Trocar o sal é o que faz os crachás recebidos funcionarem — e
                // o que quebra os que já estavam aqui, se forem de outro sal.
                const meus = vinculos.length
                if (
                  conteudo.salHex !== config.salHex &&
                  meus > 0 &&
                  !confirm(
                    `Este arquivo vem de outra instalação e traz o segredo dela. Os ${meus} crachás já cadastrados aqui deixarão de ser reconhecidos. Continuar?`,
                  )
                ) {
                  throw new Error('cancelado')
                }

                await repositorio.definirSal(conteudo.salHex)
                for (const vinculo of conteudo.vinculos) await repositorio.gravarVinculo(vinculo)
                await recarregarConfig()
                return `${conteudo.vinculos.length} crachás.`
              })}
            >
              Importar
            </button>
            <button
              onClick={tentar('Exportar crachás', async () =>
                comoFoi(
                  await salvarTexto(
                    'adsum-crachas.json',
                    paraJsonCompartilhado({ salHex: config.salHex, vinculos }),
                  ),
                  'adsum-crachas.json',
                ),
              )}
            >
              Exportar
            </button>
          </>
        }
      >
        <p className="ferramentas__nota">
          O arquivo leva os {vinculos.length} crachás e o segredo que os liga aos nomes. Sem
          ele, a lista chega inútil do outro lado. Quem receber passa a reconhecer os mesmos
          crachás, e os alunos não encostam duas vezes. Trate o arquivo com o mesmo cuidado
          que a lista da turma.
        </p>
      </Painel>

    </div>
  )
}
