// Tela do repositório: vínculos, grade, registros e sal.
//
// O formato dos arquivos é o do cartão, não um formato desta tela. É isso que
// permite arrastar `alunos.csv` do volume `ADSUM` para cá e o `registros.csv`
// daqui para a planilha, sem conversor no meio — ver `nucleo/csv.ts`.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { deCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import {
  deJsonGrade,
  deJsonVinculos,
  NOMES,
  paraJsonGrade,
  paraJsonVinculos,
} from '../nucleo/cofre.ts'
import { DIAS, horaValida } from '../nucleo/grade.ts'
import { salValido, sortearSal } from '../nucleo/hash.ts'
import type { Aula, Papel, Vinculo } from '../nucleo/tipos.ts'
import { abrirTexto, salvarTexto, type ComoSalvou } from '../ambiente/arquivos.ts'
import { useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'

const AULA_VAZIA = { uidHashProfessor: '', dia: 1, inicio: '08:00', fim: '10:00', turma: '' }

function comoFoi(salvou: ComoSalvou, nome: string): string {
  if (salvou === 'cancelado') return 'cancelado.'
  if (salvou === 'gravado') return `${nome} gravado.`
  return `${nome} foi para a pasta de downloads — este navegador não tem File System Access.`
}

export function TelaRepositorio() {
  const { repositorio, config, recarregarConfig } = useAdsum()

  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [busca, setBusca] = useState('')
  const [nova, setNova] = useState<Omit<Aula, 'id'>>(AULA_VAZIA)
  const [sal, setSal] = useState(config.salHex)
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

  useEffect(() => setSal(config.salHex), [config.salHex])

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
      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}
      {importacao && <Importacao resultado={importacao} />}

      <Painel
        titulo="Vínculos"
        legenda="A tabela uid_hash → nome. Decide o que aparece na tela, nunca quem pode entrar: matrícula é assunto da planilha."
        acoes={
          <>
            <button onClick={importarVinculos}>importar</button>
            <button
              onClick={tentar(`Exportar ${NOMES.vinculos}`, async () =>
                comoFoi(
                  await salvarTexto(NOMES.vinculos, paraJsonVinculos(vinculos)),
                  NOMES.vinculos,
                ),
              )}
            >
              exportar
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
              zerar
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
          <p className="vazio">
            Nenhum vínculo. Importe o <code>alunos.csv</code> do cartão, ou semeie pelo
            diagnóstico.
          </p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>nome</th>
                <th>papel</th>
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
                      <option value="aluno">aluno</option>
                      <option value="professor">professor</option>
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
                      remover
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
        legenda="Indexada pelo crachá do professor: quem encosta define de quem é a aula."
        acoes={
          <>
            <button onClick={importarGrade}>importar</button>
            <button
              onClick={tentar(`Exportar ${NOMES.grade}`, async () =>
                comoFoi(await salvarTexto(NOMES.grade, paraJsonGrade(aulas)), NOMES.grade),
              )}
            >
              exportar
            </button>
            <button
              className="botao--grave"
              onClick={tentar('Zerar grade', async () => {
                if (!confirm(`Apagar as ${aulas.length} aulas?`)) throw new Error('cancelado')
                await repositorio.zerarAulas()
              })}
            >
              zerar
            </button>
          </>
        }
      >
        {aulas.length === 0 ? (
          <p className="vazio">
            Sem grade, o professor escolhe a turma na tela toda aula. Com ela, o crachá basta
            quando há exatamente uma aula acontecendo.
          </p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>dia</th>
                <th>início</th>
                <th>fim</th>
                <th>turma</th>
                <th>professor</th>
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
                      <Selo tom="grave">crachá sem vínculo</Selo>
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
                      remover
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
            className="botao--acento"
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
            acrescentar
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
        legenda="Nada é reescrito, só acrescentado. Reimportar o mesmo arquivo não duplica linha — o evento_id é a chave."
        acoes={
          <>
            <button onClick={importarRegistros}>importar</button>
            <button
              onClick={tentar('Exportar registros', async () => {
                const eventos = await repositorio.listarEventos()
                // O login não fica no evento: fica no vínculo, que é onde ele
                // pertence. A coluna é preenchida na saída, com o vínculo de
                // hoje — assim corrigir um login corrige as exportações futuras
                // sem reescrever uma linha sequer do log.
                const vinculos = await repositorio.listarVinculos()
                const loginPorHash = new Map(vinculos.map((v) => [v.uidHash, v.login]))
                const ordenados = [...eventos]
                  .reverse()
                  .map((e) => ({ ...e, login: e.login ?? loginPorHash.get(e.uidHash) }))

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
              exportar
            </button>
          </>
        }
      >
        <Linha rotulo="linhas gravadas">{totalEventos}</Linha>
        <Linha rotulo="colunas">
          <code>evento_id;quando;turma;login;nome;origem;resultado;uid_hash</code>
        </Linha>
        <p className="ferramentas__nota">
          O <code>login</code> é preenchido na saída, a partir do vínculo de hoje — assim
          corrigir um login corrige as exportações seguintes sem reescrever uma linha do
          log.
        </p>
      </Painel>

      <Painel
        titulo="Sal"
        legenda="16 bytes que nunca saem daqui. Sem eles, uid_hash é o UID com outra roupa."
      >
        <div className="ferramentas ferramentas--topo">
          <input
            value={sal}
            onChange={(e) => setSal(e.target.value)}
            spellCheck={false}
            aria-label="sal em hexadecimal"
            className="entrada--larga"
          />
          <button onClick={() => setSal(sortearSal())}>sortear</button>
          <button
            onClick={tentar('Gravar sal', async () => {
              if (!salValido(sal)) throw new Error('precisa de 32 dígitos hexadecimais')
              if (
                vinculos.length > 0 &&
                !confirm(
                  `Trocar o sal invalida os ${vinculos.length} vínculos e a grade — os hashes deixam de bater com os crachás. Continuar?`,
                )
              ) {
                throw new Error('cancelado')
              }
              await repositorio.definirSal(sal)
              await recarregarConfig()
            })}
          >
            gravar
          </button>
        </div>
        <div className="aviso aviso--alerta">
          <strong>Não troque o sal depois de vincular alguém.</strong>
          <p>
            Todo vínculo e toda a grade são indexados pelo hash, e o hash depende do sal:
            trocá-lo transforma todos os crachás em desconhecidos de uma vez. Ele existe
            para que o identificador que vai à planilha não seja o UID disfarçado — e para
            isso precisa ser secreto e estável.
          </p>
        </div>
      </Painel>
    </div>
  )
}
