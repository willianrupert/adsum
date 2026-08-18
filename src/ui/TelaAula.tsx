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
  aoMudarBase,
  aoRegistrar,
}: {
  sessao: Sessao
  /** Quem está na turma e ainda não tem crachá. Vira a fila de cadastro. */
  pendentes: Matriculado[]
  aoMudarBase: () => void
  /** Grava a linha na pasta. Acontece antes do bipe: som é "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
}) {
  const { leitor, repositorio, config } = useAdsum()

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [recado, setRecado] = useState<string>()
  const [destaque, setDestaque] = useState<{ nome: string; tom: Linha['tom'] }>()
  const [armado, setArmado] = useState(0)
  const sequencia = useRef(0)
  const relogioDoDestaque = useRef<ReturnType<typeof setTimeout>>(undefined)

  const aCadastrar = pendentes[Math.min(armado, Math.max(0, pendentes.length - 1))]

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
    setPresentes(
      new Set(daAula.filter((e) => e.origem === 'cracha' && e.resultado === 'ok').map((e) => e.uidHash)),
    )
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
          jaPresentes: presentes,
          agora: leitura.em,
        })

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
          eventoId: proximoEventoId(config.aparelhoId, leitura.em, ++sequencia.current),
          quando: leitura.em,
          turma: sessao.turma,
          uidHash,
        })

        // Grava primeiro. O bipe significa "está salvo", não "eu ouvi".
        if (evento) {
          await repositorio.acrescentarEvento(evento)
          await aoRegistrar?.(evento)
        }
        if (decisao.tipo === 'encerrar') await repositorio.encerrarSessao()

        anunciar(decisao, evento)
        await recarregar()
        aoMudarBase()
      })()
    })
  }, [leitor, repositorio, config, sessao, presentes, recarregar, aoMudarBase, aoRegistrar, aCadastrar])

  /**
   * O nome ocupa o lugar do contador por um instante e volta.
   *
   * Não é um cartão que entra e sai: com um crachá a cada 1 ou 2 segundos,
   * qualquer coisa que precise **terminar** de sumir chega atrasada — ou trunca,
   * e o aluno não viu, ou enfileira, e a tela fica atrás da fila. Trocar o
   * conteúdo do mesmo lugar aguenta o ritmo porque nada termina: o próximo
   * simplesmente substitui, e o relógio recomeça.
   */
  function destacar(nome: string, tom: Linha['tom']) {
    clearTimeout(relogioDoDestaque.current)
    setDestaque({ nome, tom })
    relogioDoDestaque.current = setTimeout(() => setDestaque(undefined), 1600)
  }

  useEffect(() => () => clearTimeout(relogioDoDestaque.current), [])

  function anunciar(decisao: Decisao, evento?: Evento) {
    switch (decisao.tipo) {
      case 'presenca':
        tocar('ok')
        destacar(decisao.vinculo.nome, 'ok')
        setRecado(undefined)
        break
      case 'cadastro':
        tocar('ok')
        destacar(decisao.pessoa.nome, 'ok')
        setRecado(undefined)
        break
      case 'repetido':
        tocar('repetido')
        destacar(decisao.vinculo.nome, 'repetido')
        setRecado(undefined)
        break
      case 'desconhecido':
        tocar('desconhecido')
        destacar('Crachá não cadastrado', 'desconhecido')
        setRecado(undefined)
        break
      case 'cedo_demais':
        tocar('desconhecido')
        setRecado(
          `Para encerrar, encoste de novo em ${Math.ceil(decisao.faltamMs / 1000)} s — a aula acabou de abrir.`,
        )
        break
      case 'encerrar':
        tocar('sessao')
        break
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
          {destaque ? (
            <>
              <p className={`coleta__destaque coleta__destaque--${destaque.tom}`}>
                {destaque.nome}
              </p>
              <p className="coleta__rotulo">
                {destaque.tom === 'ok'
                  ? 'presente'
                  : destaque.tom === 'repetido'
                    ? 'já estava'
                    : 'não cadastrado'}
              </p>
            </>
          ) : (
            <>
              <p className="coleta__numero">{presentes.size}</p>
              <p className="coleta__rotulo">
                {presentes.size === 1 ? 'presente' : 'presentes'}
              </p>
            </>
          )}
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
      </div>

      {aCadastrar && (
        <section className="fila">
          <p className="fila__rotulo">
            {pendentes.length === 1
              ? 'falta o crachá de'
              : `faltam ${pendentes.length} crachás · agora é o de`}
          </p>
          <p className="fila__nome">{aCadastrar.nome}</p>
          <div className="fila__acoes">
            <button onClick={() => setArmado((i) => Math.max(0, i - 1))} aria-label="anterior">
              ←
            </button>
            <span className="fila__completo">{aCadastrar.nomeCompleto}</span>
            <button
              onClick={() => setArmado((i) => Math.min(pendentes.length - 1, i + 1))}
              aria-label="próximo"
            >
              →
            </button>
          </div>
        </section>
      )}

      <footer className="coleta__rodape">
        {recado ?? 'Encoste seu crachá para encerrar'}
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
            simular
          </button>
        )}
      </footer>
    </section>
  )
}
