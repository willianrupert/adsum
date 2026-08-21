// A aula acontecendo — e o cadastro junto.
//
// **Uma tela só durante a coleta**, e agora também a única que chama nomes.
// Cerimônia e chamada eram duas telas para uma coisa só: chamar um nome e
// esperar um crachá. A cerimônia não passava por `decidir()` — nenhuma
// proteção contra dois crachás rápidos demais, nenhuma busca em spotlight
// para crachá desconhecido — e cada regra vivia em dois lugares que podiam
// divergir sem ninguém notar. Aqui só existe um caminho: crachá desconhecido
// com alguém chamado é `decidir()` → `'cadastro'`, que grava vínculo **e**
// presença no mesmo gesto. "Quem se cadastra já está presente" deixou de ser
// só uma frase.
//
// O contador não tem denominador. `41/60` cria moldura de expectativa e exige
// saber quantos deveriam vir, que é justamente o que ninguém deve precisar
// declarar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { calcularUidHash } from '../nucleo/hash.ts'
import { decidir, eventoDe, proximoEventoId, type Decisao, type Sessao } from '../nucleo/sessao.ts'
import type { Evento, Matriculado, Papel } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { modoDev } from '../ambiente/preferencias.ts'
import { Busca } from './componentes/Busca.tsx'
import { Ondas } from './componentes/Simbolos.tsx'
import { Contador } from './componentes/Contador.tsx'
import { Painel, Selo } from './componentes/Painel.tsx'

interface Linha {
  chave: string
  nome: string
  hora: string
  tom: 'ok' | 'repetido' | 'desconhecido'
}

function hhmm(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TelaAula({
  sessao,
  pendentes,
  daTurma,
  aoMudarBase,
  aoRegistrar,
  aoEncerrar,
}: {
  sessao: Sessao
  /** Quem está na turma e ainda não tem crachá. Vira a fila de chamada. */
  pendentes: Matriculado[]
  /**
   * A turma inteira, para a tabela e para a busca do crachá desconhecido.
   *
   * Não são só os pendentes, e a diferença importa: quem perdeu o crachá e
   * trouxe outro **já tem** vínculo, logo não está na fila — e antes disto não
   * havia como encontrá-lo, nem no dia em que ele aparecia com o cartão novo.
   * É também quem já tem crachá e pode receber uma segunda via.
   */
  daTurma: Matriculado[]
  aoMudarBase: () => void
  /** Grava a linha na pasta. Acontece antes do bipe: som é "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
  /** Chamado quando o crachá do professor encerra, com o que houve na aula. */
  aoEncerrar?: (presentes: number) => void
}) {
  const { leitor, repositorio, config } = useAdsum()

  const ensaio = modoDev()

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  /**
   * A mesma informação, atualizada na hora.
   *
   * O estado do React só chega no render seguinte, e entre um crachá e o
   * próximo pode não haver render nenhum: numa fila rápida, duas leituras do
   * mesmo crachá liam `presentes` desatualizado e a segunda virava presença
   * nova em vez de duplicata. O contador não mudava — é um conjunto —, mas o
   * log ganhava duas linhas `ok` para a mesma pessoa.
   */
  /** A última leitura aceita de crachá de aluno. Ver `INTERVALO_MINIMO_MS`. */
  const ultima = useRef<{ uidHash: string; em: Date }>(undefined)

  /**
   * Conta as leituras para o recado de uma não apagar o de outra.
   *
   * `mostrar` roda antes dos `await` e `confirmar` depois deles, então com dois
   * crachás quase juntos a gravação do primeiro terminava **depois** de o
   * segundo já ter escrito o aviso na tela — e o limpava. Justamente o caso que
   * a regra do intervalo existe para tornar visível.
   *
   * Achado pelo teste de tela, não a olho: em jsdom as duas leituras se
   * sobrepõem do mesmo jeito que numa mão com dois cartões.
   */
  const geracao = useRef(0)
  const jaPresentes = useRef<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [recado, setRecado] = useState<string>()
  const [procurando, setProcurando] = useState<string>()
  const sequencia = useRef(0)

  /**
   * Quem está chamado agora, por `chave` — não por índice: a ordem de
   * `pendentes` muda a cada crachá vinculado, e um índice apontaria para a
   * pessoa errada no render seguinte.
   */
  const [chamadoChave, setChamadoChave] = useState<string>()
  /** Edição de nome/papel antes do crachá chegar. Só local — vira o que é
      gravado no vínculo quando o crachá encosta, e não sobrevive a um
      recarregamento se ninguém chamou essa pessoa. Mesmo comportamento de
      sempre: edição não é decisão de guardar sozinha. */
  const [edicoes, setEdicoes] = useState<Map<string, { nome: string; papel: Papel }>>(new Map())
  /** Pulado é "não agora", não "nunca" — por isso é local e não persiste. */
  const [pulados, setPulados] = useState<Set<string>>(new Set())

  // Chama o primeiro pendente assim que a fila deixa de estar vazia. Não
  // briga com quem já escolheu alguém: só define quando ainda não há ninguém.
  useEffect(() => {
    if (chamadoChave === undefined && pendentes.length > 0) setChamadoChave(pendentes[0].chave)
  }, [pendentes, chamadoChave])

  const efetivo = useCallback(
    (p: Matriculado): Matriculado => {
      const edicao = edicoes.get(p.chave)
      return edicao ? { ...p, nome: edicao.nome, papel: edicao.papel } : p
    },
    [edicoes],
  )

  /** A pessoa chamada, com a edição local aplicada — é isto que `decidir()`
      recebe como `ctx.chamado`, e é isto que vira o vínculo gravado. */
  // `daTurma`, não `pendentes`: "Mais um crachá" chama alguém que já tem
  // vínculo, e essa pessoa não está na lista de pendentes — só na turma
  // inteira. Segunda via depende de achá-la aqui.
  const aCadastrar = useMemo(() => {
    const p = daTurma.find((x) => x.chave === chamadoChave)
    return p ? efetivo(p) : undefined
  }, [daTurma, chamadoChave, efetivo])

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < pendentes.length; i++) {
        if (!pulados.has(pendentes[i].chave)) return pendentes[i].chave
      }
      return undefined
    },
    [pendentes, pulados],
  )

  // Setas andam pela fila de pendentes. Quem opera está com a mão no teclado e
  // um aluno na frente.
  useEffect(() => {
    if (pendentes.length === 0) return
    const andar = (evento: KeyboardEvent) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const indice = pendentes.findIndex((p) => p.chave === chamadoChave)
      const proximo = Math.min(
        pendentes.length - 1,
        Math.max(0, (indice < 0 ? 0 : indice) + (evento.key === 'ArrowRight' ? 1 : -1)),
      )
      setChamadoChave(pendentes[proximo]?.chave)
      evento.preventDefault()
    }
    window.addEventListener('keydown', andar)
    return () => window.removeEventListener('keydown', andar)
  }, [pendentes, chamadoChave])

  /**
   * Pendentes primeiro, o resto depois.
   *
   * A pessoa mais provável num crachá desconhecido é quem ainda não cadastrou,
   * e ela deve estar a zero tecla de distância. Quem já tem crachá continua
   * alcançável logo abaixo — é a segunda via, e o app aceita mais de um crachá
   * por aluno de propósito.
   */
  const ordemDaBusca = useMemo(() => {
    const naFila = new Set(pendentes.map((p) => p.chave))
    return [...pendentes, ...daTurma.filter((p) => p.papel === 'aluno' && !naFila.has(p.chave))]
  }, [pendentes, daTurma])

  // Reabrir o app no meio da aula tem que reencontrar quem já passou. A fonte
  // é o log, não a memória da tela — fechar o notebook não pode zerar a chamada.
  const recarregar = useCallback(async () => {
    const eventos = await repositorio.listarEventos()
    const daAula = eventos.filter(
      (e) => e.turma === sessao.turma && e.quando >= sessao.abertaEm,
    )
    sequencia.current = eventos.length
    const conjunto = new Set(
      daAula.filter((e) => e.origem === 'cracha' && e.resultado === 'ok').map((e) => e.uidHash),
    )
    jaPresentes.current = conjunto
    setPresentes(conjunto)
    setLinhas(
      daAula
        .filter((e) => e.origem === 'cracha')
        .slice(0, 6)
        .map((e) => ({
          chave: e.eventoId,
          // A recusa por dois crachás não tem nome — e "Crachá não cadastrado"
          // ali seria mentira, além de mandar o professor procurar a pessoa numa
          // lista onde ela pode muito bem estar.
          nome:
            e.resultado === 'rapido_demais'
              ? 'Dois crachás de uma vez'
              : e.nome || 'Crachá não cadastrado',
          hora: hhmm(new Date(e.quando)),
          // `rapido_demais` cai no tom de 'desconhecido' de propósito: os dois
          // são recusa, e a lista não precisa de um terceiro vermelho.
          tom: e.resultado === 'ok' ? 'ok' : e.resultado === 'duplicado' ? 'repetido' : 'desconhecido',
        })),
    )
  }, [repositorio, sessao])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    return leitor.aoLer((leitura) => {
      void (async () => {
        const minha = ++geracao.current
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        const decisao = decidir(uidHash, {
          sessao,
          vinculo,
          chamado: aCadastrar,
          jaPresentes: jaPresentes.current,
          ultima: ultima.current,
          agora: leitura.em,
        })

        // Antes de qualquer `await`, como `jaPresentes`: dois crachás de uma mão
        // chegam em centenas de milissegundos, e o segundo não pode encontrar
        // este valor desatualizado — seria a fraude passando pela porta que a
        // regra existe para fechar.
        //
        // A recusa **não** conta como leitura: assim a janela segue medida a
        // partir do último crachá aceito, e insistir depressa não a reinicia.
        if (decisao.tipo !== 'rapido_demais' && vinculo?.papel !== 'professor') {
          ultima.current = { uidHash, em: leitura.em }
        }

        // Entra no conjunto antes de qualquer `await`: é isso que faz a leitura
        // seguinte já saber que esta pessoa passou.
        if (decisao.tipo === 'presenca' || decisao.tipo === 'cadastro') {
          jaPresentes.current.add(uidHash)
        }

        // Crachá que ninguém reconhece, com gente da turma ainda sem cadastro:
        // é o aluno que faltou no primeiro dia. Em vez de recusar e cobrar
        // depois, o app pergunta de quem é — ali, na hora, com a pessoa na
        // frente. Nada é gravado enquanto ele não responder.
        // Antes: só abria se ainda houvesse gente sem cadastro. Isso deixava de
        // fora justamente o caso corriqueiro do dia a dia — segunda via, crachá
        // trocado — e o professor via só uma linha vermelha, sem nada a fazer
        // ali. A correção sobrava para depois, à mão, a partir de um hash.
        //
        // Desistir continua sendo um clique fora: quem não quiser vincular
        // agora fecha, e o registro fica como crachá não cadastrado.
        if (decisao.tipo === 'desconhecido') {
          setProcurando(uidHash)
          tocar('desconhecido')
          return
        }

        // Cadastro grava o vínculo antes do evento: se algo falhar no meio,
        // sobra um crachá vinculado sem presença — que se resolve encostando de
        // novo — e não uma presença de alguém que o sistema não reconhece.
        if (decisao.tipo === 'cadastro') {
          await repositorio.gravarVinculo({
            uidHash,
            papel: decisao.pessoa.papel,
            nome: decisao.pessoa.nome,
            matricula: decisao.pessoa.matricula || undefined,
            criadoEm: leitura.em.toISOString(),
          })
          // Avança sozinho para o próximo pendente, pulando quem já foi
          // marcado como pulado — mesmo gesto de sempre: chamar um nome não
          // deveria custar um clique a mais para "próximo".
          setChamadoChave((atual) => {
            const indice = pendentes.findIndex((p) => p.chave === atual)
            return proximoPendente(indice + 1)
          })
        }

        const evento = eventoDe(decisao, {
          eventoId: proximoEventoId(config.instalacaoId, leitura.em, ++sequencia.current),
          quando: leitura.em,
          turma: sessao.turma,
          uidHash,
        })

        // A tela responde na hora; o som espera a gravação.
        //
        // São duas promessas diferentes e vale separá-las: o olho precisa de
        // resposta imediata para a fila não parecer travada, e o bipe significa
        // **está salvo** — não "eu ouvi". Gravar antes de mostrar somava a
        // latência do disco a cada crachá, e numa fila isso se sente.
        mostrar(decisao)

        if (evento) {
          await repositorio.acrescentarEvento(evento)
          await aoRegistrar?.(evento)
        }
        if (decisao.tipo === 'encerrar') {
          await repositorio.encerrarSessao()
          aoEncerrar?.(jaPresentes.current.size)
        }

        confirmar(decisao, evento, minha)
        await recarregar()
        aoMudarBase()
      })()
    })
  }, [
    leitor,
    repositorio,
    config,
    sessao,
    recarregar,
    aoMudarBase,
    aoRegistrar,
    aoEncerrar,
    aCadastrar,
    pendentes,
    proximoPendente,
  ])

  /**
   * Encerrar sem crachá.
   *
   * Mesma gravação do caminho do crachá — evento `encerrar` no log, sessão
   * fechada, resumo na tela —, e por isso o `uidHash` é o do professor que
   * abriu: a linha do log continua dizendo quem encerrou, mesmo sem toque.
   *
   * Sem janela de 10 s: ela existe porque abrir e fechar são o mesmo gesto de
   * crachá, e um clique não tem esse problema.
   */
  const aoEncerrarAgora = useCallback(() => {
    void (async () => {
      const agora = new Date()
      const evento = eventoDe(
        { tipo: 'encerrar' },
        {
          eventoId: proximoEventoId(config.instalacaoId, agora, ++sequencia.current),
          quando: agora,
          turma: sessao.turma,
          uidHash: sessao.uidHashProfessor,
        },
      )
      if (evento) {
        await repositorio.acrescentarEvento(evento)
        await aoRegistrar?.(evento)
      }
      await repositorio.encerrarSessao()
      tocar('encerramento')
      aoEncerrar?.(jaPresentes.current.size)
      aoMudarBase()
    })()
  }, [config.instalacaoId, sessao, repositorio, aoRegistrar, aoEncerrar, aoMudarBase])

  /**
   * Antes de gravar: só pixels, para a fila nunca esperar o disco.
   *
   * O nome **não** pisca no lugar do contador. Celebrar cada leitura cansa
   * depois da quinta, e com um crachá a cada 1,5 s vira ruído — o feedback é a
   * linha que chega no topo da lista e o número que sobe. Calmo aguenta a aula
   * inteira; festivo não.
   */
  function mostrar(decisao: Decisao) {
    if (decisao.tipo === 'cedo_demais') {
      setRecado(`Para encerrar, encoste de novo em ${Math.ceil(decisao.faltamMs / 1000)} s.`)
    }
    // Este é o único recado da tela que serve ao **professor** e não a quem
    // encostou: o app não sabe distinguir fraude de fila apressada, mas sabe
    // dizer que o padrão é fisicamente implausível. Quem julga está na sala.
    if (decisao.tipo === 'rapido_demais') {
      setRecado('Dois crachás quase juntos. O segundo não foi contado. Passe um de cada vez.')
    }
  }

  /** Depois de gravar: o som. Bipe significa "está salvo". */
  function confirmar(decisao: Decisao, evento?: Evento, minha = geracao.current) {
    // Só limpa o que era **desta** leitura: se outra chegou no meio, o recado na
    // tela é dela, e apagá-lo escondia a recusa de dois crachás juntos.
    const limpar = () => minha === geracao.current && setRecado(undefined)

    switch (decisao.tipo) {
      case 'presenca':
      case 'cadastro':
        limpar()
        return tocar('ok')
      case 'repetido':
        limpar()
        return tocar('repetido')
      case 'desconhecido':
        return tocar('desconhecido')
      case 'rapido_demais':
        return tocar('desconhecido')
      case 'cedo_demais':
        return tocar('desconhecido')
      case 'encerrar':
        return tocar('encerramento')
      default:
        if (evento) tocar('ok')
    }
  }

  const chamadoAtual = aCadastrar

  return (
    <section className="coleta">
      <header className="coleta__topo">
        <span>{hhmm(new Date())}</span>
        <strong>{sessao.turma}</strong>
        <span>desde {hhmm(new Date(sessao.abertaEm))}</span>
        {/* Mesmo motivo do "Concluir" da cerimônia: com "Quem falta" mostrando
            a turma inteira, o rodapé fica longe — numa turma de 49, é rolar a
            tela toda pra encontrar o único jeito de encerrar. Este não troca
            de lugar quando o recado aparece embaixo; o de baixo continua ali,
            porque terminar no fim do gesto também faz sentido. */}
        <button className="botao--quieto coleta__encerrar-topo" onClick={() => aoEncerrarAgora()}>
          Encerrar
        </button>
      </header>

      <div className="coleta__corpo">
        <div className="coleta__contador">
          <p className="coleta__numero">
            <Contador valor={presentes.size} />
          </p>
          <p className="coleta__rotulo">{presentes.size === 1 ? 'presente' : 'presentes'}</p>
        </div>

        <ol className="coleta__lista">
          {linhas.length === 0 && <li className="coleta__vazio">Aproxime o crachá</li>}
          {linhas.map((l) => (
            <li key={l.chave} className={`coleta__linha coleta__linha--${l.tom}`}>
              <span>{l.nome}</span>
              <time>{l.hora}</time>
            </li>
          ))}
        </ol>

        {/* O símbolo fica a aula inteira, pulsando devagar: é a única instrução
            que a tela precisa dar, e dizê-la em palavra o tempo todo seria
            texto repetido. Movimento lento não compete com a linha que chega. */}
        <Ondas tamanho={52} animado />
      </div>

      {/* A fila de chamada só aparece com gente pendente — e é a mesma tela
          da cerimônia, não uma versão menor dela. Um só nome chamado por vez
          continua sendo a garantia; o que muda é que chamar alguém agora
          passa pelo mesmo `decidir()` de qualquer outro crachá, com a mesma
          proteção contra dois crachás rápidos demais. */}
      {pendentes.length > 0 && chamadoAtual && (
        <section className="chamado">
          <Ondas tamanho={54} animado />
          <p className="chamado__rotulo">Encoste o crachá de</p>
          <p className="chamado__nome">{chamadoAtual.nome}</p>
          <p className="chamado__completo">
            {chamadoAtual.nomeCompleto} · {chamadoAtual.papel}
          </p>
          <div className="chamado__acoes">
            <button
              onClick={() => {
                const indice = pendentes.findIndex((p) => p.chave === chamadoChave)
                setChamadoChave(pendentes[Math.max(0, indice - 1)]?.chave)
              }}
              aria-label="anterior"
              disabled={pendentes.findIndex((p) => p.chave === chamadoChave) <= 0}
            >
              ←
            </button>
            <button
              onClick={() => {
                setPulados((antes) => new Set(antes).add(chamadoAtual.chave))
                const indice = pendentes.findIndex((p) => p.chave === chamadoChave)
                setChamadoChave(proximoPendente(indice + 1))
              }}
            >
              Pular
            </button>
            <button
              onClick={() => {
                const indice = pendentes.findIndex((p) => p.chave === chamadoChave)
                setChamadoChave(pendentes[Math.min(pendentes.length - 1, indice + 1)]?.chave)
              }}
              aria-label="próximo"
              disabled={pendentes.findIndex((p) => p.chave === chamadoChave) >= pendentes.length - 1}
            >
              →
            </button>
          </div>
          <p className="chamado__atalho">← e → andam pela fila</p>

          {ensaio && ehSimulavel(leitor) && (
            <div className="chamado__acoes">
              <button
                onClick={() => {
                  try {
                    leitor.encostarProximo()
                  } catch (erro) {
                    setRecado((erro as Error).message)
                  }
                }}
              >
                Simular um crachá
              </button>
            </div>
          )}
        </section>
      )}

      {pendentes.length > 0 && (
        <Painel titulo="Quem falta" legenda={`${pendentes.length} de ${daTurma.length} sem crachá`}>
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome exibido</th>
                <th>Papel</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {daTurma.map((p) => {
                const vinculado = !pendentes.some((x) => x.chave === p.chave)
                const e = efetivo(p)
                const repetido = daTurma.filter((x) => efetivo(x).nome === e.nome).length > 1
                return (
                  <tr key={p.chave} className={p.chave === chamadoChave ? 'linha--chamada' : ''}>
                    <td>
                      {vinculado ? (
                        e.nome
                      ) : (
                        <input
                          className="entrada--celula"
                          value={e.nome}
                          onChange={(evento) =>
                            setEdicoes((antes) => {
                              const novo = new Map(antes)
                              novo.set(p.chave, { nome: evento.target.value, papel: e.papel })
                              return novo
                            })
                          }
                          aria-label={`nome de ${p.nomeCompleto}`}
                        />
                      )}
                    </td>
                    <td className="celula--estado">
                      {vinculado ? (
                        e.papel
                      ) : (
                        <select
                          value={e.papel}
                          onChange={(evento) =>
                            setEdicoes((antes) => {
                              const novo = new Map(antes)
                              novo.set(p.chave, { nome: e.nome, papel: evento.target.value as Papel })
                              return novo
                            })
                          }
                          aria-label={`papel de ${p.nomeCompleto}`}
                        >
                          <option value="aluno">Aluno</option>
                          <option value="professor">Professor</option>
                        </select>
                      )}
                      {repetido && <Selo tom="grave">Nome repetido</Selo>}
                    </td>
                    {/* Chamar continua disponível depois de vinculado: um aluno
                        com dois crachás é permitido de propósito, porque segunda
                        via existe. A relação é muitos-para-um. */}
                    <td className="celula--estado">
                      {p.chave === chamadoChave ? (
                        <Selo tom="ok">Chamando</Selo>
                      ) : (
                        <>
                          {vinculado && <Selo tom="ok">Vinculado</Selo>}
                          {!vinculado && pulados.has(p.chave) && <Selo tom="neutro">Pulado</Selo>}
                          <button onClick={() => setChamadoChave(p.chave)}>
                            {vinculado ? 'Mais um crachá' : 'Chamar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Painel>
      )}

      {procurando && (
        <Busca
          pessoas={ordemDaBusca}
          aoDesistir={() => {
            void (async () => {
              const uidHash = procurando
              setProcurando(undefined)
              const evento = eventoDe(
                { tipo: 'desconhecido' },
                {
                  eventoId: proximoEventoId(config.instalacaoId, new Date(), ++sequencia.current),
                  quando: new Date(),
                  turma: sessao.turma,
                  uidHash,
                },
              )
              if (evento) {
                await repositorio.acrescentarEvento(evento)
                await aoRegistrar?.(evento)
              }
              await recarregar()
              aoMudarBase()
            })()
          }}
          aoEscolher={(pessoa) => {
            void (async () => {
              const uidHash = procurando
              const quando = new Date()
              setProcurando(undefined)
              await repositorio.gravarVinculo({
                uidHash,
                papel: pessoa.papel,
                nome: pessoa.nome,
                matricula: pessoa.matricula || undefined,
                criadoEm: quando.toISOString(),
              })
              const evento = eventoDe(
                { tipo: 'cadastro', pessoa },
                {
                  eventoId: proximoEventoId(config.instalacaoId, quando, ++sequencia.current),
                  quando,
                  turma: sessao.turma,
                  uidHash,
                },
              )
              if (evento) {
                await repositorio.acrescentarEvento(evento)
                await aoRegistrar?.(evento)
              }
              tocar('ok')
              await recarregar()
              aoMudarBase()
            })()
          }}
        />
      )}

      {/* Uma ação, e o rodapé é dela. O crachá do professor continua encerrando
          — e a tela não diz isso, pelo mesmo motivo do repouso: anunciar dois
          caminhos para a mesma coisa faz parar para escolher. O recado, quando
          existe, fala mais alto que o botão porque é resposta a um toque. */}
      <footer className="coleta__rodape">
        {recado ? (
          <span className="coleta__recado">{recado}</span>
        ) : (
          <button className="coleta__encerrar" onClick={() => aoEncerrarAgora()}>
            Encerrar a chamada
          </button>
        )}
        {ensaio && ehSimulavel(leitor) && (
          <button
            className="coleta__simular"
            onClick={() => {
              try {
                leitor.encostarProximo()
              } catch (erro) {
                setRecado((erro as Error).message)
              }
            }}
          >
            Simular
          </button>
        )}
      </footer>
    </section>
  )
}
