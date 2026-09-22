// Tela de diagnóstico.
//
// Toda regra precisa de voz na tela: nada de "não funcionou", sempre qual peça
// faltou. Recusa muda é indistinguível de coisa quebrada.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularUidHash, idDoSal, saisConhecidos } from '../nucleo/hash.ts'
import { uidLegivel, uidParaHex } from '../nucleo/uid.ts'
import type { Aula, Evento, Matriculado, Vinculo } from '../nucleo/tipos.ts'
import {
  ehConectavel,
  ehSimulavel,
  type DiagnosticoLeitor,
  type EstadoLeitor,
} from '../portas/LeitorDeCracha.ts'
import { identificarCracha, podeApagar, vinculosSemSal, type DiagnosticoRepositorio } from '../portas/Repositorio.ts'
import { descreverAmbiente, levantarCapacidades } from '../ambiente/capacidades.ts'
import { leitoresVisiveis, useAdsum } from './adsum.ts'
import { PainelDeTestesFisicos } from './PainelDeTestesFisicos.tsx'
import {
  auditoriaDeUidsLigada,
  definirAuditoriaDeUids,
  definirModoDev,
  historicoDeChamadas,
  modoDev,
} from '../ambiente/preferencias.ts'
import { caminhoDoDiario, linhasDoDiario } from '../ambiente/diario.ts'
import { CAMINHO_DA_AUDITORIA } from '../ambiente/auditoriaDeUids.ts'
import { estadoDoConvite } from '../ambiente/instalacao.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'
import { deCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { nomeDoArquivoDeFaltas, paraCsvDeFaltas, planilhaDeFaltas } from '../nucleo/faltas.ts'
import { abrirTexto, salvarTexto } from '../ambiente/arquivos.ts'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'

interface LeituraNaTela {
  chave: string
  hex: string
  legivel: string
  uidHash: string
  em: Date
  vinculo?: Vinculo
}

const NOMES_SEMEADOS = [
  { papel: 'professor' as const, nome: 'Paulo Araújo Filho' },
  { papel: 'aluno' as const, nome: 'Willian Neves' },
  { papel: 'aluno' as const, nome: 'Maria Vitória' },
  { papel: 'aluno' as const, nome: 'João Pedro' },
  { papel: 'aluno' as const, nome: 'Luiz Felipe' },
  { papel: 'aluno' as const, nome: 'Rafael Moura' },
]

function formatarBytes(n?: number): string {
  if (n === undefined) return '—'
  const unidades = ['B', 'kB', 'MB', 'GB']
  let valor = n
  let i = 0
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024
    i++
  }
  return `${i === 0 ? valor : valor.toFixed(1)} ${unidades[i]}`
}

function hora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function duracao(ms: number): string {
  const totalSeg = Math.round(ms / 1000)
  const min = Math.floor(totalSeg / 60)
  const seg = totalSeg % 60
  return `${min}min ${String(seg).padStart(2, '0')}s`
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TelaDiagnostico() {
  const { leitor, leitorId, trocarLeitor, repositorio, config } = useAdsum()

  const ensaio = useMemo(modoDev, [])
  const capacidades = useMemo(levantarCapacidades, [])
  const ambiente = useMemo(descreverAmbiente, [])
  const historico = useMemo(historicoDeChamadas, [])

  const [estadoLeitor, setEstadoLeitor] = useState<EstadoLeitor>(leitor.estado())
  const [diagLeitor, setDiagLeitor] = useState<DiagnosticoLeitor>()
  const [diagRepo, setDiagRepo] = useState<DiagnosticoRepositorio>()
  const [leituras, setLeituras] = useState<LeituraNaTela[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [servico, setServico] = useState('verificando…')
  const [uidManual, setUidManual] = useState('04a23b91')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave'; texto: string }>()
  const [agora, setAgora] = useState(() => new Date())
  // Vieram do card "Registros" que Ajustes perdeu (Fase 2, item 2 —
  // docs/05_plano_execucao.md): a exportação de faltas precisa da turma, da
  // grade e de quem está matriculado, não só dos eventos.
  const [turmas, setTurmas] = useState<string[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [importacao, setImportacao] = useState<Resultado>()
  const [auditoria, setAuditoria] = useState(auditoriaDeUidsLigada)
  /** Crachás cujo sal não está no chaveiro. Ver `vinculosSemSal`. */
  const [semSal, setSemSal] = useState<Vinculo[]>([])

  useEffect(() => {
    setEstadoLeitor(leitor.estado())
    setLeituras([])
  }, [leitor])

  const atualizar = useCallback(async () => {
    const [dl, dr, ev, t, a, m, te] = await Promise.all([
      leitor.diagnostico(),
      repositorio.diagnostico(),
      repositorio.listarEventos({ limite: 6 }),
      repositorio.listarTurmas(),
      repositorio.listarAulas(),
      repositorio.listarMatriculados(),
      repositorio.contarEventos(),
    ])
    setSemSal(await vinculosSemSal(repositorio, config))
    setDiagLeitor(dl)
    setDiagRepo(dr)
    setEventos(ev)
    setTurmas(t)
    setAulas(a)
    setMatriculados(m)
    setTotalEventos(te)
  }, [leitor, repositorio, config])

  useEffect(() => {
    void atualizar()
  }, [atualizar])

  useEffect(() => leitor.aoMudarEstado(setEstadoLeitor), [leitor])

  // Relógio vivo: um horário congelado no carregamento é pior que nenhum. Sem
  // hora confiável a sessão não abre, então a hora é dado de diagnóstico.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    return leitor.aoLer((leitura) => {
      void (async () => {
        const hex = uidParaHex(leitura.uid)
        const { uidHash, vinculo } = await identificarCracha(repositorio, config, leitura.uid)
        setLeituras((antes) =>
          [
            {
              chave: `${hex}-${leitura.em.getTime()}`,
              hex,
              legivel: uidLegivel(leitura.uid),
              uidHash,
              em: leitura.em,
              vinculo,
            },
            ...antes,
          ].slice(0, 8),
        )
        void atualizar()
      })()
    })
  }, [leitor, repositorio, config, atualizar])

  // O que importa não é "existe registro", é **esta página está controlada**:
  // sem controlador, o próximo carregamento ainda depende da rede. E o registro
  // chega depois do primeiro `load`, então vale reconsultar quando ele troca.
  useEffect(() => {
    if (!navigator.serviceWorker) {
      setServico('não suportado neste navegador')
      return
    }
    let vivo = true
    const consultar = () => {
      navigator.serviceWorker.getRegistrations().then(
        (regs) => {
          if (!vivo) return
          const nosso = regs.find((r) => location.href.startsWith(r.scope))
          if (!nosso) return setServico('nenhum registrado, o app não abre offline')
          const controlada = Boolean(navigator.serviceWorker.controller)
          setServico(
            `${controlada ? 'controlando esta página' : 'registrado, ainda sem controlar'} · escopo ${nosso.scope}`,
          )
        },
        () => vivo && setServico('falhou ao consultar'),
      )
    }
    consultar()
    navigator.serviceWorker.addEventListener('controllerchange', consultar)
    const id = setTimeout(consultar, 2000)
    return () => {
      vivo = false
      clearTimeout(id)
      navigator.serviceWorker.removeEventListener('controllerchange', consultar)
    }
  }, [])

  // `string | void`, não só `void`: os botões vindos do card "Registros"
  // (Importar/Exportar/Exportar faltas) querem dizer qual arquivo saiu, não
  // só "feito" — mesma função de `tentar` em `TelaRepositorio.tsx`.
  function tentar(rotulo: string, acao: () => string | void | Promise<string | void>) {
    return async () => {
      try {
        const detalhe = await acao()
        setRecado({ tom: 'ok', texto: detalhe ? `${rotulo}: ${detalhe}` : `${rotulo}: feito.` })
        await atualizar()
      } catch (erro) {
        setRecado({ tom: 'grave', texto: `${rotulo}: ${(erro as Error).message}` })
      }
    }
  }

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

  const semear = tentar('Semear', async () => {
    if (!ehSimulavel(leitor)) throw new Error('o leitor em uso não tem baralho virtual')
    const baralho = leitor.baralho()
    const agora = new Date()

    const hashes = await Promise.all(
      baralho.map(async (hex, i) => {
        const uidHash = await calcularUidHash(
          config.salHex,
          Uint8Array.from(hex.match(/../g)!.map((b) => Number.parseInt(b, 16))),
        )
        const { papel, nome } = NOMES_SEMEADOS[i % NOMES_SEMEADOS.length]
        await repositorio.gravarVinculo({
          uidHash,
          papel,
          nome,
          criadoEm: agora.toISOString(),
          salId: await idDoSal(config.salHex),
        })
        return { uidHash, papel, nome }
      }),
    )

    const professor = hashes.find((h) => h.papel === 'professor')!
    const fim = new Date(agora.getTime() + 90 * 60_000)
    // Semear duas vezes não pode virar duas aulas iguais na grade — a mesma
    // promessa que o `evento_id` faz para os registros, feita à mão aqui porque
    // a aula não tem chave natural.
    const jaTem = (await repositorio.listarAulas()).some(
      (a) =>
        a.uidHashProfessor === professor.uidHash &&
        a.dia === agora.getDay() &&
        a.turma === 'IF685 · T01',
    )
    if (!jaTem) {
      await repositorio.gravarAula({
        uidHashProfessor: professor.uidHash,
        dia: agora.getDay(),
        inicio: hhmm(agora),
        fim: hhmm(fim),
        turma: 'IF685 · T01',
      })
    }

    const dia = agora.toISOString().slice(0, 10).replace(/-/g, '')
    const linhas = [professor, ...hashes.filter((h) => h.papel === 'aluno').slice(0, 3)]
    for (const [i, quem] of linhas.entries()) {
      await repositorio.acrescentarEvento({
        eventoId: `${config.instalacaoId}-${dia}-${String(i + 1).padStart(4, '0')}`,
        quando: new Date(agora.getTime() + i * 60_000).toISOString(),
        turma: 'IF685 · T01',
        uidHash: quem.uidHash,
        nome: quem.nome,
        origem: quem.papel === 'professor' ? 'professor' : 'cracha',
        resultado: 'ok',
      })
    }
  })

  const essenciaisFaltando = capacidades.filter((c) => c.peso === 'essencial' && !c.presente)

  return (
    <div className="diagnostico">
      {essenciaisFaltando.length > 0 && (
        <div className="aviso aviso--grave">
          <strong>Falta peça essencial neste navegador.</strong>
          <p>{essenciaisFaltando.map((c) => c.nome).join(', ')}. Veja o painel Ambiente.</p>
        </div>
      )}

      {recado && (
        <div className={`aviso aviso--${recado.tom === 'ok' ? 'ok' : 'grave'}`}>
          {recado.texto}
        </div>
      )}
      {importacao && <Importacao resultado={importacao} />}

      <Painel
        titulo="Ambiente"
        recolhivel
        legenda="O que este navegador oferece."
        acoes={<button onClick={() => location.reload()}>Recarregar</button>}
      >
        <ul className="capacidades">
          {capacidades.map((c) => (
            <li key={c.nome} className={c.presente ? 'cap cap--ok' : `cap cap--${c.peso}`}>
              <span className="cap__ponto" aria-hidden="true" />
              <span className="cap__nome">{c.nome}</span>
              <Selo tom={c.presente ? 'ok' : c.peso === 'essencial' ? 'grave' : 'alerta'}>
                {c.presente ? 'sim' : 'não'}
              </Selo>
              {!c.presente && <span className="cap__nota">{c.semEla}</span>}
            </li>
          ))}
        </ul>
        <Linha rotulo="service worker">{servico}</Linha>
        {/* O agente do usuário e a origem só interessam quando algo falha, e
            aí quem lê é quem conserta — ficam atrás de um clique. */}
        <details className="avancado">
          <summary>Detalhes do ambiente</summary>
          <div className="avancado__corpo">
            {Object.entries(ambiente).map(([k, v]) => (
              <Linha key={k} rotulo={k}>
                <code>{v}</code>
              </Linha>
            ))}
          </div>
        </details>
        <Linha rotulo="relógio">
          <code>{agora.toISOString()}</code> · {hora(agora)}
        </Linha>
      </Painel>

      <Painel
        titulo="Leitor de crachá"
        recolhivel
        legenda="De onde vêm os UIDs."
        acoes={
          <>
            <button onClick={tentar('Iniciar', () => leitor.iniciar())}>Iniciar</button>
            <button onClick={tentar('Parar', () => leitor.parar())}>Parar</button>
            {ehConectavel(leitor) && (
              <button onClick={tentar('Conectar leitor USB', () => leitor.conectar())}>
                Conectar leitor USB
              </button>
            )}
          </>
        }
      >
        <Linha rotulo="adaptador">
          <div className="segmentado" role="group">
            {leitoresVisiveis().map((opcao) => (
              <button
                key={opcao.id}
                className={opcao.id === leitorId ? 'segmento segmento--ativo' : 'segmento'}
                onClick={tentar(`Trocar para ${opcao.nome}`, () => trocarLeitor(opcao.id))}
              >
                {opcao.nome}
              </button>
            ))}
          </div>
        </Linha>
        <Linha rotulo="estado">
          <Selo tom={estadoLeitor === 'lendo' ? 'ok' : estadoLeitor === 'erro' ? 'grave' : 'neutro'}>
            {estadoLeitor}
          </Selo>
        </Linha>
        {diagLeitor?.motivo && (
          <Linha rotulo="indisponível porque">
            <Selo tom="alerta">{diagLeitor.motivo}</Selo>
          </Linha>
        )}
        {diagLeitor &&
          Object.entries(diagLeitor.detalhes).map(([k, v]) => (
            <Linha key={k} rotulo={k}>
              <code>{v}</code>
            </Linha>
          ))}

        {ensaio && ehSimulavel(leitor) && (
          <div className="ferramentas">
            <button
              onClick={tentar('Encostar crachá', () => {
                leitor.encostarProximo()
              })}
            >
              Encostar próximo crachá
            </button>
            <span className="ferramentas__ou">ou</span>
            <input
              value={uidManual}
              onChange={(e) => setUidManual(e.target.value)}
              spellCheck={false}
              aria-label="UID em hexadecimal"
            />
            <button
              onClick={tentar('Simular', () => {
                leitor.simular(uidManual)
              })}
            >
              Simular
            </button>

          </div>
        )}
      </Painel>

      {ensaio && (
        <PainelDeTestesFisicos leitor={leitor} leitorId={leitorId} repositorio={repositorio} config={config} />
      )}

      {/* Sem `recolhivel`: fica sempre aberto, à frente de "Últimas leituras"
          — é o resumo por sessão que calibra `INTERVALO_MINIMO_MS`, uso do
          dia a dia do Diagnóstico. "Últimas leituras" é log cru, ferramenta
          de depuração, e por isso continua atrás de um clique. */}
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
                        {c.intervalos.minimoMs}–{c.intervalos.maximoMs} ms, média{' '}
                        {c.intervalos.medioMs} ms ({c.intervalos.amostras}{' '}
                        {c.intervalos.amostras === 1 ? 'crachá' : 'crachás'})
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

      <Painel
        titulo="Últimas leituras"
        recolhivel
        legenda="Nada aqui conta presença."
      >
        {leituras.length === 0 ? (
          <p className="vazio">Nenhuma leitura ainda. Encoste um crachá acima.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Hora</th>
                {/* O instrumento que troca palpite por dado. `INTERVALO_MINIMO_MS`
                    foi escolhido por estimativa — primeiro 1 s, depois 400 ms —
                    e o jeito certo de acertá-lo é medir: com o dongle na mão e
                    uma fila de verdade, estes números dizem quanto tempo separa
                    duas pessoas apressadas de dois cartões na mesma mão. */}
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
                    {/* A lista vem da mais nova para a mais velha, então a
                        anterior no tempo é a de baixo. */}
                    {leituras[i + 1] ? (
                      <code>{l.em.getTime() - leituras[i + 1].em.getTime()} ms</code>
                    ) : (
                      <code>—</code>
                    )}
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
                        <Selo tom={l.vinculo.papel === 'professor' ? 'alerta' : 'ok'}>
                          {l.vinculo.papel}
                        </Selo>
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

      {/* Migrou de Ajustes (Fase 2, item 2 — docs/05_plano_execucao.md):
          "Registros" era um card a mais numa tela que devia ter uma ação
          óbvia por vez. Importar/exportar é ferramenta, não uso do dia a
          dia — o mesmo motivo que já mantém Diagnóstico como a casa de
          "Últimas leituras" e "Chamadas recentes". */}
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
                const turmasComEventos = porTurma(ordenados)
                if (turmasComEventos.size === 0) throw new Error('nenhum registro para exportar')
                const nomes: string[] = []
                for (const [turma, linhas] of turmasComEventos) {
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
            {/* Pedido do Prof. Paulo, para a v1: nome completo por linha, um
                dia por coluna, e na célula quantas faltas aquele dia vale —
                0 presente, senão os períodos do bloco na grade. Arquivo
                separado do registro de verdade: este nasce recalculado a
                cada exportação, o registro nunca perde uma linha. */}
            <button
              onClick={tentar('Exportar faltas', async () => {
                // `eventos` do estado local é só a amostra de 6 das "Últimas
                // leituras" acima — a planilha de faltas precisa do log
                // inteiro do semestre, não de uma prévia.
                const todosOsEventos = await repositorio.listarEventos()
                const planilhas = turmas
                  .map((turma) => ({
                    turma,
                    planilha: planilhaDeFaltas(todosOsEventos, matriculados, aulas, turma),
                  }))
                  .filter(({ planilha }) => planilha.dias.length > 0 && planilha.linhas.length > 0)
                if (planilhas.length === 0) throw new Error('nenhuma turma com aula registrada ainda')

                const nomes: string[] = []
                for (const { turma, planilha } of planilhas) {
                  const alvo = nomeDoArquivoDeFaltas(turma)
                  const salvou = await salvarTexto(alvo, paraCsvDeFaltas(planilha))
                  if (salvou === 'cancelado') break
                  nomes.push(alvo)
                }
                return nomes.length > 0 ? `${nomes.join(', ')}.` : 'cancelado.'
              })}
            >
              Exportar faltas
            </button>
          </>
        }
      >
        <Linha rotulo="linhas gravadas">{totalEventos}</Linha>
      </Painel>

      {/* Aberto e fora de "Estado do app" de propósito: é o único painel
          daqui que fala de aluno que pode deixar de ser reconhecido, que é a
          pior perda que o app tem. Em 17/09/2026 isso aconteceu com 40
          crachás sem que nada na tela dissesse. */}
      <Painel titulo="Segredo dos crachás" legenda="O que liga cada crachá ao seu dono.">
        <Linha rotulo="segredos guardados">
          <code>{saisConhecidos(config).length}</code>
        </Linha>
        <Linha rotulo="crachás sem segredo">
          <Selo tom={semSal.length === 0 ? 'ok' : 'grave'}>{semSal.length}</Selo>
        </Linha>
        {semSal.length > 0 && (
          <p className="ferramentas__nota">
            Estes crachás foram cadastrados com um segredo que este navegador não tem, e por isso
            não são reconhecidos: {semSal.map((v) => v.nome).join(', ')}. Ligue a pasta do cofre de
            onde eles vieram, ou importe o arquivo de crachás, e eles voltam sozinhos. Se nenhum dos
            dois existir, cada um encosta o crachá de novo uma vez.
          </p>
        )}
      </Painel>

      <Painel
        titulo="Estado do app"
        recolhivel
        legenda="Armazenamento, versão e instalação — não presença."
        acoes={
          <>
            {/* Semear inventa gente e presença. No app publicado seria um botão
                que suja a chamada de verdade com dados de mentira. */}
            {ensaio && <button onClick={semear}>Semear</button>}
            {ensaio && podeApagar(repositorio) && (
              <button
                className="botao--grave"
                onClick={tentar('Apagar tudo', async () => {
                  if (!confirm('Apagar vínculos, grade e registros deste navegador?')) {
                    throw new Error('cancelado')
                  }
                  await repositorio.apagarTudo()
                  setLeituras([])
                })}
              >
                Apagar tudo
              </button>
            )}
          </>
        }
      >
        <Linha rotulo="aberta">
          <Selo tom={diagRepo?.aberto ? 'ok' : 'grave'}>{diagRepo?.aberto ? 'sim' : 'não'}</Selo>
        </Linha>
        <Linha rotulo="persistente">
          <Selo tom={diagRepo?.persistente ? 'ok' : 'alerta'}>
            {diagRepo?.persistente ? 'concedido' : 'não concedido'}
          </Selo>
          {!diagRepo?.persistente && (
            <>
              {' '}
              <button
                onClick={tentar('Pedir persistência', async () => {
                  if (!navigator.storage?.persist) throw new Error('navegador não oferece')
                  const concedido = await navigator.storage.persist()
                  await repositorio.diagnostico()
                  if (!concedido) {
                    throw new Error(
                      'o navegador recusou por ora; instalar o app costuma destravar',
                    )
                  }
                })}
              >
                Pedir
              </button>
            </>
          )}
        </Linha>
        <Linha rotulo="espaço usado">
          {formatarBytes(diagRepo?.usoEstimado)} de {formatarBytes(diagRepo?.cotaEstimada)}
        </Linha>
        {/* "Não apareceu" é uma reclamação que não dá para investigar: cada
            motivo tem conserto diferente. Aqui ela vira um fato. */}
        {/* "Não achei a mudança" some no meio de cache, PWA instalado e aba
            antiga. Com o carimbo na tela, vira uma comparação. */}
        <Linha rotulo="versão desta cópia">
          <code>{__CARIMBO__}</code>
        </Linha>
        <Linha rotulo="convite de instalar">
          <Selo tom={estadoDoConvite() === 'oferecido' ? 'ok' : 'neutro'}>
            {
              {
                oferecido: 'o navegador ofereceu',
                ja_instalado: 'já está instalado',
                dispensado: 'você dispensou',
                nao_oferecido: 'o navegador não ofereceu',
              }[estadoDoConvite()]
            }
          </Selo>
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

      {/* O diário que o zip da pasta leva junto. Aqui aparecem as linhas
          desta abertura do app; o arquivo inteiro fica na pasta, um por dia. */}
      <Painel
        titulo="Diário"
        recolhivel
        legenda={`Cada leitura, decisão e erro. Na pasta, em ${caminhoDoDiario('AAAA-MM-DD')}.`}
      >
        {linhasDoDiario().length === 0 ? (
          <p className="ferramentas__nota">Nada registrado desde que o app abriu.</p>
        ) : (
          <pre className="diario">{[...linhasDoDiario()].slice(-60).reverse().join('\n')}</pre>
        )}
      </Painel>

      {/* Aberto, com aviso: guardar o código real do crachá é exceção à regra
          do projeto, decidida para a fase de testes (22/09/2026). Tem que
          estar à vista enquanto estiver ligada. */}
      <Painel titulo="Códigos dos crachás" legenda={`Na pasta, em ${CAMINHO_DA_AUDITORIA}.`}>
        <Linha rotulo="guardar o código de cada crachá">
          <Selo tom={auditoria ? 'alerta' : 'ok'}>{auditoria ? 'ligado' : 'desligado'}</Selo>{' '}
          <button
            onClick={() => {
              definirAuditoriaDeUids(!auditoria)
              setAuditoria(!auditoria)
            }}
          >
            {auditoria ? 'Desligar' : 'Ligar'}
          </button>
        </Linha>
        <p className="ferramentas__nota">
          {auditoria
            ? 'Ligado para a fase de testes. Com o código guardado, nenhum aluno precisa recadastrar o crachá, mas quem tiver este arquivo consegue copiar crachás. Não compartilhe a pasta com quem não precisa.'
            : 'Desligado. Os crachás continuam funcionando normalmente; só o código deixa de ser guardado.'}
        </p>
      </Painel>

      {/* Por último, e discreto: quem chega aqui está consertando algo, e este
          é o interruptor que muda o que o resto da tela oferece. Recarrega
          porque a lista de leitores e o padrão são lidos na montagem — tentar
          propagar isso por estado seria mais código para um gesto que acontece
          duas vezes na vida. */}
      <Painel
        titulo="Modo de ensaio"
        recolhivel
        legenda="Leitor simulado, teclas de ensaio, semear e apagar."
        acoes={
          <button
            className={ensaio ? 'botao--grave' : undefined}
            onClick={() => {
              definirModoDev(!ensaio)
              location.reload()
            }}
          >
            {ensaio ? 'Desligar' : 'Ligar'}
          </button>
        }
      >
        <Linha rotulo="estado">
          <Selo tom={ensaio ? 'alerta' : 'ok'}>{ensaio ? 'ligado' : 'desligado'}</Selo>
        </Linha>
        <p className="ferramentas__nota">
          Desligado, o Adsum é só a chamada: leitores de verdade, nenhuma tecla
          que marque presença sem crachá, e nada que invente dado. Ligado, aparecem o
          leitor simulado, <kbd>espaço</kbd> e <kbd>P</kbd> para ensaiar, e os botões de
          semear e apagar.
        </p>
      </Painel>
    </div>
  )
}
