// Tela de diagnóstico.
//
// É a primeira tela do app de propósito. Toda regra de negócio precisa de voz
// na tela — no firmware, a janela de 60 s existia, funcionava e recusava em
// silêncio, o que é indistinguível de aparelho quebrado. Aqui a mesma ideia
// aplicada ao ambiente: nada de "não funcionou", sempre qual peça faltou.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularUidHash } from '../nucleo/hash.ts'
import { uidLegivel, uidParaHex } from '../nucleo/uid.ts'
import type { Evento, Vinculo } from '../nucleo/tipos.ts'
import {
  ehSimulavel,
  type DiagnosticoLeitor,
  type EstadoLeitor,
} from '../portas/LeitorDeCracha.ts'
import { podeApagar, type DiagnosticoRepositorio } from '../portas/Repositorio.ts'
import { descreverAmbiente, levantarCapacidades } from '../ambiente/capacidades.ts'
import { LEITORES, useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'

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

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function hora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TelaDiagnostico() {
  const { leitor, leitorId, trocarLeitor, repositorio, config } = useAdsum()

  const capacidades = useMemo(levantarCapacidades, [])
  const ambiente = useMemo(descreverAmbiente, [])

  const [estadoLeitor, setEstadoLeitor] = useState<EstadoLeitor>(leitor.estado())
  const [diagLeitor, setDiagLeitor] = useState<DiagnosticoLeitor>()
  const [diagRepo, setDiagRepo] = useState<DiagnosticoRepositorio>()
  const [leituras, setLeituras] = useState<LeituraNaTela[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [servico, setServico] = useState('verificando…')
  const [uidManual, setUidManual] = useState('04a23b91')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave'; texto: string }>()
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    setEstadoLeitor(leitor.estado())
    setLeituras([])
  }, [leitor])

  const atualizar = useCallback(async () => {
    const [dl, dr, ev] = await Promise.all([
      leitor.diagnostico(),
      repositorio.diagnostico(),
      repositorio.listarEventos(6),
    ])
    setDiagLeitor(dl)
    setDiagRepo(dr)
    setEventos(ev)
  }, [leitor, repositorio])

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
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
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
  }, [leitor, repositorio, config.salHex, atualizar])

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
          if (!nosso) return setServico('nenhum registrado — o app não abre offline')
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

  function tentar(rotulo: string, acao: () => void | Promise<void>) {
    return async () => {
      try {
        await acao()
        setRecado({ tom: 'ok', texto: `${rotulo}: feito.` })
        await atualizar()
      } catch (erro) {
        setRecado({ tom: 'grave', texto: `${rotulo}: ${(erro as Error).message}` })
      }
    }
  }

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
        eventoId: `${config.aparelhoId}-${dia}-${String(i + 1).padStart(4, '0')}`,
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

      <Painel
        titulo="Ambiente"
        legenda="O que este navegador oferece, e o que se perde sem cada peça."
        acoes={<button onClick={() => location.reload()}>recarregar</button>}
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
        {Object.entries(ambiente).map(([k, v]) => (
          <Linha key={k} rotulo={k}>
            <code>{v}</code>
          </Linha>
        ))}
        <Linha rotulo="relógio">
          <code>{agora.toISOString()}</code> · {hora(agora)}
        </Linha>
      </Painel>

      <Painel
        titulo="Leitor de crachá"
        legenda="De onde vêm os UIDs. Trocar de leitor não muda nada acima desta linha."
        acoes={
          <>
            <button onClick={tentar('Iniciar', () => leitor.iniciar())}>iniciar</button>
            <button onClick={tentar('Parar', () => leitor.parar())}>parar</button>
          </>
        }
      >
        <Linha rotulo="adaptador">
          <div className="escolhas">
            {LEITORES.map((opcao) => (
              <button
                key={opcao.id}
                className={opcao.id === leitorId ? 'escolha escolha--ativa' : 'escolha'}
                onClick={tentar(`Trocar para ${opcao.nome}`, () => trocarLeitor(opcao.id))}
              >
                <span className="escolha__nome">{opcao.nome}</span>
                <span className="escolha__quando">{opcao.quando}</span>
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

        {ehSimulavel(leitor) && (
          <div className="ferramentas">
            <button
              className="botao--acento"
              onClick={tentar('Encostar crachá', () => {
                leitor.encostarProximo()
              })}
            >
              encostar próximo crachá
            </button>
            <span className="ferramentas__ou">ou um UID específico</span>
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
              simular
            </button>
            <p className="ferramentas__nota">
              Baralho em rodízio: <code>{leitor.baralho().join('  ')}</code>. Dar a volta
              reencontra um UID já visto — é assim que se exercita duplicata sem ter dois
              crachás na mão.
            </p>
          </div>
        )}
      </Painel>

      <Painel
        titulo="Últimas leituras"
        legenda="UID → uid_hash → vínculo. Nada é gravado como presença: sessão é o passo 4."
      >
        {leituras.length === 0 ? (
          <p className="vazio">Nenhuma leitura ainda. Encoste um crachá acima.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>hora</th>
                <th>UID</th>
                <th>uid_hash</th>
                <th>quem</th>
              </tr>
            </thead>
            <tbody>
              {leituras.map((l) => (
                <tr key={l.chave}>
                  <td>{hora(l.em)}</td>
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
                      <Selo tom="grave">crachá não cadastrado</Selo>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Painel>

      <Painel
        titulo="Repositório"
        legenda="Tudo em IndexedDB, neste navegador. Nada sai daqui."
        acoes={
          <>
            <button className="botao--acento" onClick={semear}>
              semear
            </button>
            {podeApagar(repositorio) && (
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
                apagar tudo
              </button>
            )}
          </>
        }
      >
        <Linha rotulo="base">{diagRepo?.nome ?? '—'}</Linha>
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
                      'o navegador recusou por ora — instalar o app costuma destravar',
                    )
                  }
                })}
              >
                pedir
              </button>
            </>
          )}
        </Linha>
        <Linha rotulo="vínculos">
          {plural(diagRepo?.vinculos ?? 0, 'crachá', 'crachás')}, dos quais{' '}
          {plural(diagRepo?.professores ?? 0, 'de professor', 'de professor')}
        </Linha>
        <Linha rotulo="aulas na grade">{diagRepo?.aulas ?? 0}</Linha>
        <Linha rotulo="eventos">{plural(diagRepo?.eventos ?? 0, 'linha', 'linhas')}</Linha>
        <Linha rotulo="espaço usado">
          {formatarBytes(diagRepo?.usoEstimado)} de {formatarBytes(diagRepo?.cotaEstimada)}
        </Linha>
        <Linha rotulo="aparelho">
          <code>{config.aparelhoId}</code>
        </Linha>

        {eventos.length > 0 && (
          <table className="tabela">
            <thead>
              <tr>
                <th>evento_id</th>
                <th>quando</th>
                <th>quem</th>
                <th>origem</th>
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

    </div>
  )
}
