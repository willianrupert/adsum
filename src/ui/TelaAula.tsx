// A aula acontecendo — e o cadastro junto.
//
// **Uma tela só durante a coleta.** Estados viram valores e cores dentro dela,
// nunca telas diferentes: com fila, uma confirmação de dois segundos seria
// interrompida pelo próximo antes de terminar — ou trunca, e o primeiro não
// viu, ou enfileira, e a tela fica atrasada. Sem transição, o problema não
// existe.
//
// O contador não tem denominador. `41/60` cria moldura de expectativa e exige
// saber quantos deveriam vir, que é justamente o que ninguém deve precisar
// declarar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { calcularUidHash } from '../nucleo/hash.ts'
import { decidir, eventoDe, proximoEventoId, type Decisao, type Sessao } from '../nucleo/sessao.ts'
import type { Evento, Matriculado } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { Busca } from './componentes/Busca.tsx'
import { Ondas } from './componentes/Simbolos.tsx'
import { Contador } from './componentes/Contador.tsx'

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
  alunosDaTurma,
  aoMudarBase,
  aoRegistrar,
  aoEncerrar,
}: {
  sessao: Sessao
  /** Quem está na turma e ainda não tem crachá. Vira a fila de cadastro. */
  pendentes: Matriculado[]
  /** Quantos alunos a turma tem. Diz se hoje é o primeiro dia. */
  alunosDaTurma: number
  aoMudarBase: () => void
  /** Grava a linha na pasta. Acontece antes do bipe: som é "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
  /** Chamado quando o crachá do professor encerra, com o que houve na aula. */
  aoEncerrar?: (presentes: number) => void
}) {
  const { leitor, repositorio, config } = useAdsum()

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
  const jaPresentes = useRef<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [recado, setRecado] = useState<string>()
  const [armado, setArmado] = useState(0)
  const [procurando, setProcurando] = useState<string>()
  const sequencia = useRef(0)

  /**
   * A faixa de cadastro só aparece **no primeiro dia** — quando nenhum aluno da
   * turma tem crachá ainda e a cerimônia é a própria chamada. Depois disso ela
   * some: ficar avisando que faltam três crachás é cobrança sobre gente que
   * pode ter trancado, e o caso se resolve sozinho quando a pessoa aparece.
   *
   * Decidido **uma vez, quando a aula abre**, e não a cada leitura: recalcular
   * fazia a faixa desaparecer no primeiro aluno cadastrado — que é exatamente o
   * momento em que ela mais serve.
   */
  const primeiroDia = useRef(pendentes.length > 0 && pendentes.length === alunosDaTurma).current
  const aCadastrar = primeiroDia
    ? pendentes[Math.min(armado, Math.max(0, pendentes.length - 1))]
    : undefined

  // Setas andam pela fila de cadastro. Quem opera está com a mão no teclado e
  // um aluno na frente.
  useEffect(() => {
    if (pendentes.length === 0) return
    const andar = (evento: KeyboardEvent) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      setArmado((i) => Math.min(pendentes.length - 1, Math.max(0, i + (evento.key === 'ArrowRight' ? 1 : -1))))
      evento.preventDefault()
    }
    window.addEventListener('keydown', andar)
    return () => window.removeEventListener('keydown', andar)
  }, [pendentes.length])

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
          nome: e.nome || 'Crachá não cadastrado',
          hora: hhmm(new Date(e.quando)),
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
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        const decisao = decidir(uidHash, {
          sessao,
          vinculo,
          armado: aCadastrar,
          jaPresentes: jaPresentes.current,
          agora: leitura.em,
        })

        // Entra no conjunto antes de qualquer `await`: é isso que faz a leitura
        // seguinte já saber que esta pessoa passou.
        if (decisao.tipo === 'presenca' || decisao.tipo === 'cadastro') {
          jaPresentes.current.add(uidHash)
        }

        // Crachá que ninguém reconhece, com gente da turma ainda sem cadastro:
        // é o aluno que faltou no primeiro dia. Em vez de recusar e cobrar
        // depois, o app pergunta de quem é — ali, na hora, com a pessoa na
        // frente. Nada é gravado enquanto ele não responder.
        if (decisao.tipo === 'desconhecido' && pendentes.length > 0) {
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

        confirmar(decisao, evento)
        await recarregar()
        aoMudarBase()
      })()
    })
  }, [leitor, repositorio, config, sessao, recarregar, aoMudarBase, aoRegistrar, aoEncerrar, aCadastrar])

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
  }

  /** Depois de gravar: o som. Bipe significa "está salvo". */
  function confirmar(decisao: Decisao, evento?: Evento) {
    switch (decisao.tipo) {
      case 'presenca':
      case 'cadastro':
        setRecado(undefined)
        return tocar('ok')
      case 'repetido':
        setRecado(undefined)
        return tocar('repetido')
      case 'desconhecido':
        return tocar('desconhecido')
      case 'cedo_demais':
        return tocar('desconhecido')
      case 'encerrar':
        return tocar('encerramento')
      default:
        if (evento) tocar('ok')
    }
  }

  return (
    <section className="coleta">
      <header className="coleta__topo">
        <span>{hhmm(new Date())}</span>
        <strong>{sessao.turma}</strong>
        <span>desde {hhmm(new Date(sessao.abertaEm))}</span>
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

      {aCadastrar && (
        <section className="fila">
          <button
            className="fila__seta"
            onClick={() => setArmado((i) => Math.max(0, i - 1))}
            aria-label="Anterior"
            disabled={armado === 0}
          >
            ‹
          </button>

          <div className="fila__centro">
            <p className="fila__rotulo">
              {pendentes.length === 1 ? 'Falta um crachá' : `Faltam ${pendentes.length} crachás`}
            </p>
            <p className="fila__nome">{aCadastrar.nome}</p>
          </div>

          <button
            className="fila__seta"
            onClick={() => setArmado((i) => Math.min(pendentes.length - 1, i + 1))}
            aria-label="Próximo"
            disabled={armado >= pendentes.length - 1}
          >
            ›
          </button>
        </section>
      )}

      {procurando && (
        <Busca
          pessoas={pendentes}
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

      <footer className="coleta__rodape">
        {recado ?? 'Encoste o seu crachá para encerrar'}
        {ehSimulavel(leitor) && (
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
