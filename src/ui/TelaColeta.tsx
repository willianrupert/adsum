// A aula acontecendo.
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
import type { Evento } from '../nucleo/tipos.ts'
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

export function TelaColeta({
  sessao,
  aoMudarBase,
  aoRegistrar,
}: {
  sessao: Sessao
  aoMudarBase: () => void
  /** Grava a linha na pasta. Acontece antes do bipe: som é "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
}) {
  const { leitor, repositorio, config } = useAdsum()

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [recado, setRecado] = useState<string>()
  const sequencia = useRef(0)

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
          jaPresentes: presentes,
          agora: leitura.em,
        })

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
  }, [leitor, repositorio, config, sessao, presentes, recarregar, aoMudarBase, aoRegistrar])

  function anunciar(decisao: Decisao, evento?: Evento) {
    switch (decisao.tipo) {
      case 'presenca':
        tocar('ok')
        setRecado(undefined)
        break
      case 'repetido':
        tocar('repetido')
        setRecado(`${decisao.vinculo.nome} já estava registrado.`)
        break
      case 'desconhecido':
        tocar('desconhecido')
        setRecado('Crachá não cadastrado.')
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
          <p className="coleta__numero">{presentes.size}</p>
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
      </div>

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
