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
import { DIAS, horaValida } from '../nucleo/grade.ts'
import type { Aula, Papel, Vinculo } from '../nucleo/tipos.ts'
import { abrirTexto, salvarTexto, type ComoSalvou } from '../ambiente/arquivos.ts'
import { useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'
import { Cartao } from './componentes/Cartao.tsx'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'

const AULA_VAZIA = { uidHashProfessor: '', dia: 1, inicio: '08:00', fim: '10:00', turma: '' }

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function comoFoi(salvou: ComoSalvou, nome: string): string {
  if (salvou === 'cancelado') return 'cancelado.'
  if (salvou === 'gravado') return `${nome} gravado.`
  return `${nome} foi para a pasta de downloads — este navegador não tem File System Access.`
}

export function TelaRepositorio({
  pasta,
  aoTrocarPasta,
}: {
  pasta?: FileSystemDirectoryHandle
  aoTrocarPasta?: () => void
} = {}) {
  const { repositorio, config, recarregarConfig } = useAdsum()

  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [busca, setBusca] = useState('')
  const [nova, setNova] = useState<Omit<Aula, 'id'>>(AULA_VAZIA)
  const [importacao, setImportacao] = useState<Resultado>()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave'; texto: string }>()

  const carregar = useCallback(async () => {
    const [v, a, e] = await Promise.all([
      repositorio.listarVinculos(),
      repositorio.listarAulas(),
      repositorio.contarEventos(),
    ])
    setVinculos(v)
    setAulas(a)
    setTotalEventos(e)
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
  const nomePorHash = useMemo(
    () => new Map(vinculos.map((v) => [v.uidHash, v.nome])),
    [vinculos],
  )
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
        acoes={aoTrocarPasta && <button onClick={aoTrocarPasta}>Trocar de pasta</button>}
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
              Gravado a cada mudança. O navegador não revela o caminho completo — procure a
              pasta pelo nome, onde você a escolheu.
            </p>
          </>
        ) : (
          <p className="ferramentas__nota">
            Nenhuma pasta escolhida: os dados existem só neste navegador, e somem se você
            limpar os dados do site.
          </p>
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

      <Painel
        titulo="Grade horária"
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
            <button
              className="botao--grave"
              onClick={tentar('Zerar grade', async () => {
                if (!confirm(`Apagar as ${aulas.length} aulas?`)) throw new Error('cancelado')
                await repositorio.zerarAulas()
              })}
            >
              Zerar
            </button>
          </>
        }
      >
        {aulas.length === 0 ? (
          <p className="vazio">Nenhuma aula cadastrada.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Turma</th>
                <th>Professor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {aulas.map((a) => (
                <tr key={a.id}>
                  <td>{DIAS[a.dia]}</td>
                  <td>{a.inicio}</td>
                  <td>{a.fim}</td>
                  <td>{a.turma}</td>
                  <td>
                    {nomePorHash.get(a.uidHashProfessor) ?? (
                      <Selo tom="grave">Crachá sem vínculo</Selo>
                    )}
                  </td>
                  <td>
                    <button
                      className="botao--grave"
                      onClick={tentar('Remover aula', async () => {
                        const restantes = aulas.filter((x) => x.id !== a.id)
                        await repositorio.zerarAulas()
                        for (const aula of restantes) {
                          await repositorio.gravarAula({ ...aula, id: undefined })
                        }
                      })}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="ferramentas">
          <select
            value={nova.uidHashProfessor}
            onChange={(e) => setNova({ ...nova, uidHashProfessor: e.target.value })}
            aria-label="professor"
          >
            <option value="">professor…</option>
            {professores.map((p) => (
              <option key={p.uidHash} value={p.uidHash}>
                {p.nome}
              </option>
            ))}
          </select>
          <select
            value={nova.dia}
            onChange={(e) => setNova({ ...nova, dia: Number(e.target.value) })}
            aria-label="dia da semana"
          >
            {DIAS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input
            value={nova.inicio}
            onChange={(e) => setNova({ ...nova, inicio: e.target.value })}
            aria-label="início"
            size={5}
          />
          <input
            value={nova.fim}
            onChange={(e) => setNova({ ...nova, fim: e.target.value })}
            aria-label="fim"
            size={5}
          />
          <input
            value={nova.turma}
            onChange={(e) => setNova({ ...nova, turma: e.target.value })}
            placeholder="IF685 · T01"
            aria-label="turma"
          />
          <button
            onClick={tentar('Acrescentar aula', async () => {
              if (!nova.uidHashProfessor) throw new Error('escolha o professor — a grade é indexada por ele')
              if (!horaValida(nova.inicio) || !horaValida(nova.fim)) {
                throw new Error('horário fora do formato hh:mm')
              }
              if (!nova.turma.trim()) throw new Error('sem turma')
              await repositorio.gravarAula({ ...nova, turma: nova.turma.trim() })
              setNova({ ...AULA_VAZIA, uidHashProfessor: nova.uidHashProfessor })
            })}
          >
            Acrescentar
          </button>
          {professores.length === 0 && (
            <p className="ferramentas__nota">
              Nenhum vínculo de professor ainda. A grade não tem por onde ser indexada até
              existir um.
            </p>
          )}
        </div>
      </Painel>

      <Painel
        titulo="Registros"
        legenda="O que a planilha consome."
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

      </Painel>

      <Painel
        titulo="Passar os crachás a outro professor"
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
          O arquivo leva os {vinculos.length} crachás e o segredo que os liga aos nomes — sem
          ele, a lista chega inútil do outro lado. Quem receber passa a reconhecer os mesmos
          crachás, e os alunos não encostam duas vezes. Trate o arquivo com o mesmo cuidado
          que a lista da turma.
        </p>
      </Painel>

    </div>
  )
}
