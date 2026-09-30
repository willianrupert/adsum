// A chamada aberta, e o cadastro junto.
//
// Uma tela só durante a coleta. O padrão é o modo comum: o leitor aceita o que
// vier, e crachá desconhecido abre a busca "de quem é?". Com "Chamar nomes"
// ligado, o professor está olhando a pessoa chamada, e o próximo crachá
// desconhecido cadastra e conta presença no mesmo gesto.
//
// As regras moram em `nucleo/chamada.ts` e `nucleo/sessao.ts`; o que a tela
// grava, em `aula/acoes.ts`. Aqui fica a ordem das coisas: a fila de
// leituras, o que aparece na hora e o que espera a gravação.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { criarAgendador } from '../ambiente/agendador.ts'
import { curto, registrar, semDono } from '../ambiente/diario.ts'
import { definirProfessorAtual, modoDev, professorAtual } from '../ambiente/preferencias.ts'
import { tocar } from '../ambiente/som.ts'
import {
  depoisDeGravar,
  ehDaPessoa,
  estadoDaChamada,
  indiceDeVinculos,
  MemoriaDaFila,
  recadoAntesDeGravar,
  type LinhaDaChamada,
} from '../nucleo/chamada.ts'
import { diaLocal } from '../nucleo/faltas.ts'
import { leitorSuspeito, type EstatisticaDeIntervalos, type Sessao } from '../nucleo/sessao.ts'
import type { Evento, Matriculado, Papel, Vinculo } from '../nucleo/tipos.ts'
import { ehConfirmavel, ehSimulavel, type Leitura } from '../portas/LeitorDeCracha.ts'
import { identificarCracha } from '../portas/Repositorio.ts'
import { useAdsum } from './adsum.ts'
import { gravarDecisao, gravarPresencaManual, vincularCracha } from './aula/acoes.ts'
import { CartaoDoChamado } from './aula/CartaoDoChamado.tsx'
import { ContadorDaChamada } from './aula/ContadorDaChamada.tsx'
import { ListaDeAlunos } from './aula/ListaDeAlunos.tsx'
import { PainelDeProfessores } from './aula/PainelDeProfessores.tsx'
import { Busca } from './componentes/Busca.tsx'
import { useFocoDaJanela } from './hooks/useFocoDaJanela.ts'

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
  retidas,
}: {
  sessao: Sessao
  /** Quem está na turma e ainda não tem crachá: a fila de "Chamar nomes". */
  pendentes: Matriculado[]
  /**
   * A turma inteira, para a lista e para a busca. Quem perdeu o crachá já tem
   * vínculo e não está na fila, e precisa ser achado no dia do cartão novo.
   */
  daTurma: Matriculado[]
  aoMudarBase: () => void
  /** Grava a linha na pasta. Vem antes do bipe: o som quer dizer "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
  /** A chamada acabou, com o que houve nela. */
  aoEncerrar?: (presentes: number, duracaoMs: number, intervalos?: EstatisticaDeIntervalos) => void
  /** Leituras que chegaram enquanto a chamada abria. Ver `antessala.ts`. */
  retidas?: () => Leitura[]
}) {
  const { leitor, repositorio, config } = useAdsum()
  const ensaio = modoDev()

  // Memória que precisa estar certa entre dois crachás sem render no meio:
  // fica fora do estado do React.
  const fila = useRef(new MemoriaDaFila())
  /** Identificar e decidir andam em fila, na ordem de chegada. */
  const ordemDasLeituras = useRef<Promise<unknown>>(Promise.resolve())
  /** Numera as leituras: o recado de uma não apaga o de outra que chegou depois. */
  const geracao = useRef(0)
  const encerrando = useRef(false)
  /** O contador, para quem encerra ler sem depender do render. */
  const presentesRef = useRef<Set<string>>(new Set())
  /** O crachá da busca aberta, já na hora (o estado só chega no render seguinte). */
  const procurandoRef = useRef<string>(undefined)

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<LinhaDaChamada[]>([])
  const [presencasHoje, setPresencasHoje] = useState<Map<string, { presente: boolean; manual: boolean }>>(new Map())
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [recado, setRecado] = useState<string>()
  const [procurando, setProcurando] = useState<string>()
  const [leiturasDuranteABusca, setLeiturasDuranteABusca] = useState(0)
  const [avisoDaBusca, setAvisoDaBusca] = useState<string>()
  /** Quem está chamado, pela chave: a ordem dos pendentes muda a cada crachá. */
  const [chamadoChave, setChamadoChave] = useState<string>()
  /** Nome ou papel editados antes do crachá chegar. Só local. */
  const [edicoes, setEdicoes] = useState<Map<string, { nome: string; papel: Papel }>>(new Map())
  /** "Não agora", não "nunca": local, não persiste. */
  const [pulados, setPulados] = useState<Set<string>>(new Set())
  const [professorAtualHash, setProfessorAtualHash] = useState(professorAtual)
  /** A última vez que o leitor entregou qualquer coisa. Ver `leitorSuspeito`. */
  const [ultimaAtividadeEm, setUltimaAtividadeEm] = useState(() => new Date())
  const [agora, setAgora] = useState(() => new Date())
  const { semFoco } = useFocoDaJanela()

  /** O dia desta chamada: uma por turma por dia. */
  const dia = useMemo(() => diaLocal(sessao.abertaEm), [sessao.abertaEm])

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 15_000)
    return () => clearInterval(relogio)
  }, [])

  const fecharBusca = useCallback(() => {
    procurandoRef.current = undefined
    setProcurando(undefined)
    setAvisoDaBusca(undefined)
    setLeiturasDuranteABusca(0)
  }, [])

  const vinculoDe = useMemo(() => indiceDeVinculos(vinculos), [vinculos])

  /** A pessoa como a tela a mostra: a edição local, senão o apelido do vínculo. */
  const efetivo = useCallback(
    (p: Matriculado): Matriculado => {
      const edicao = edicoes.get(p.chave)
      if (edicao) return { ...p, nome: edicao.nome, papel: edicao.papel }
      const vinculo = vinculoDe(p)
      return vinculo ? { ...p, nome: vinculo.nome } : p
    },
    [edicoes, vinculoDe],
  )

  // Professor não entra na fila de "Chamar nomes": tem painel próprio.
  const pendentesAlunos = useMemo(() => pendentes.filter((p) => p.papel === 'aluno'), [pendentes])
  const alunosDaTurma = useMemo(() => daTurma.filter((p) => p.papel === 'aluno'), [daTurma])
  const professoresDaTurma = useMemo(() => daTurma.filter((p) => p.papel === 'professor'), [daTurma])
  // Uma vez por render, não por linha: por linha, a lista era cúbica.
  const chavesPendentes = useMemo(() => new Set(pendentesAlunos.map((p) => p.chave)), [pendentesAlunos])
  const vezesDoNome = useMemo(() => {
    const vezes = new Map<string, number>()
    for (const p of alunosDaTurma) {
      const nome = efetivo(p).nome
      vezes.set(nome, (vezes.get(nome) ?? 0) + 1)
    }
    return vezes
  }, [alunosDaTurma, efetivo])

  /** Quem está chamado, com a edição local. Aluno pela fila, professor por "Cadastrar". */
  const aCadastrar = useMemo(() => {
    const p = pendentes.find((x) => x.chave === chamadoChave)
    return p ? efetivo(p) : undefined
  }, [pendentes, chamadoChave, efetivo])
  const chamadoAluno = aCadastrar?.papel === 'aluno' ? aCadastrar : undefined

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < pendentesAlunos.length; i++) {
        if (!pulados.has(pendentesAlunos[i].chave)) return pendentesAlunos[i].chave
      }
      return undefined
    },
    [pendentesAlunos, pulados],
  )

  // As setas andam pela fila de pendentes, e a primeira entra no modo de
  // chamar nomes pelo início dela.
  useEffect(() => {
    if (pendentesAlunos.length === 0) return
    const andar = (evento: KeyboardEvent) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
      const proximo = Math.min(pendentesAlunos.length - 1, Math.max(0, indice + (evento.key === 'ArrowRight' ? 1 : -1)))
      setChamadoChave(pendentesAlunos[proximo]?.chave)
      evento.preventDefault()
    }
    window.addEventListener('keydown', andar)
    return () => window.removeEventListener('keydown', andar)
  }, [pendentesAlunos, chamadoChave])

  /** Para a busca: pendentes primeiro (o caso provável), depois a turma inteira. */
  const ordemDaBusca = useMemo(() => {
    const naFila = new Set(pendentes.map((p) => p.chave))
    return [...pendentes.map(efetivo), ...daTurma.filter((p) => !naFila.has(p.chave))]
  }, [pendentes, daTurma, efetivo])

  // A chamada se reconstrói do log, nunca da memória da tela: fechar o
  // notebook não zera nada.
  const recarregar = useCallback(async () => {
    const marca = fila.current.marca()
    const [eventos, vinculosAtuais] = await Promise.all([
      repositorio.listarEventos({ turma: sessao.turma }),
      repositorio.listarVinculos(),
    ])
    setVinculos(vinculosAtuais)
    const estado = estadoDaChamada(eventos, vinculosAtuais, sessao.turma, dia)
    fila.current.recomecar(estado.porCracha, marca)
    presentesRef.current = estado.presentes
    setPresentes(estado.presentes)
    setPresencasHoje(estado.presencasHoje)
    setLinhas(estado.linhas)
  }, [repositorio, sessao, dia])

  // Uma releitura por rajada, não uma por crachá (`ambiente/agendador.ts`).
  const recarregarAtual = useRef(recarregar)
  useEffect(() => {
    recarregarAtual.current = recarregar
  }, [recarregar])
  const recarregarJa = useMemo(() => criarAgendador(() => recarregarAtual.current()), [])
  useEffect(() => {
    semDono('recarregar a aula', recarregarJa)
  }, [recarregar, recarregarJa])

  /** Depois de gravar qualquer coisa: relê a chamada e avisa a casca. */
  const depoisDeMudar = useCallback(async () => {
    await recarregarJa()
    aoMudarBase()
  }, [recarregarJa, aoMudarBase])

  /**
   * Desfaz um vínculo errado sem sair da chamada. Todos os vínculos da
   * pessoa: com o chaveiro de sais, ela pode ter um em cada. A presença já
   * gravada fica: eventos não se apagam.
   */
  const removerCracha = useCallback(
    (p: Matriculado) => {
      const daPessoa = vinculos.filter((v) => ehDaPessoa(v, p))
      if (daPessoa.length === 0) return
      if (!confirm(`Desvincular o crachá de ${p.nomeCompleto}?`)) return
      semDono('remover crachá', async () => {
        for (const vinculo of daPessoa) await repositorio.removerVinculo(vinculo.uidHash)
        registrar('cracha_removido', { vinculos: daPessoa.length })
        await depoisDeMudar()
      })
    },
    [vinculos, repositorio, depoisDeMudar],
  )

  const alterarPresenca = useCallback(
    async (p: Matriculado, presente: boolean) => {
      const evento = await gravarPresencaManual(repositorio, config.instalacaoId, p, efetivo(p).nome, presente)
      registrar('manual', { resultado: evento.resultado, evento: evento.eventoId })
      await aoRegistrar?.(evento)
      await depoisDeMudar()
    },
    [config.instalacaoId, efetivo, repositorio, aoRegistrar, depoisDeMudar],
  )

  // O caminho de cada crachá.
  useEffect(() => {
    const aoLer = (leitura: Leitura) => {
      setUltimaAtividadeEm(leitura.em)
      if (procurandoRef.current) setLeiturasDuranteABusca((n) => n + 1)
      void (async () => {
        const minha = ++geracao.current
        const inicio = performance.now()
        // Identificar e decidir em fila, na ordem de chegada: soltos, um
        // crachá podia ser comparado com outro que chegou depois dele
        // (23/09/2026). Gravar e redesenhar não esperam a fila.
        const passo = ordemDasLeituras.current.then(async () => {
          const identificado = await identificarCracha(repositorio, leitura.uid)
          // Decidir marca a memória da fila antes de qualquer `await`.
          const decisao = fila.current.decidir(identificado.uidHash, {
            sessao,
            vinculo: identificado.vinculo,
            chamado: aCadastrar,
            em: leitura.em,
          })
          return { ...identificado, identificadoEm: performance.now(), decisao }
        })
        ordemDasLeituras.current = passo.catch(() => undefined)
        const { uidHash, vinculo, sal, identificadoEm, decisao } = await passo
        try {
          // Desconhecido sem ninguém chamado: a busca, uma de cada vez. Um
          // segundo desconhecido não toma o lugar do primeiro; é recusado em
          // voz alta. Nada é gravado enquanto ninguém responder.
          if (decisao.tipo === 'desconhecido') {
            tocar('desconhecido')
            if (procurandoRef.current === uidHash) return
            if (procurandoRef.current) {
              registrar('desconhecido_durante_busca', { hash: curto(uidHash) })
              setAvisoDaBusca('Outro crachá novo chegou e não foi contado. Termine esta busca e peça para encostar de novo.')
              return
            }
            registrar('desconhecido', { hash: curto(uidHash) })
            procurandoRef.current = uidHash
            setProcurando(uidHash)
            return
          }

          // Cadastro grava o vínculo antes do evento: se falhar no meio, sobra
          // um crachá sem presença (encosta de novo), nunca uma presença sem dono.
          if (decisao.tipo === 'cadastro') {
            await vincularCracha(repositorio, vinculos, decisao.pessoa, uidHash, leitura.em)
            // Aluno: a fila anda sozinha. Professor: foi um "Cadastrar" só.
            if (decisao.pessoa.papel === 'aluno') {
              setChamadoChave((atual) => proximoPendente(pendentesAlunos.findIndex((p) => p.chave === atual) + 1))
            } else {
              setChamadoChave(undefined)
            }
          }

          // A tela responde já; o bipe espera a gravação, porque quer dizer "está salvo".
          const recado = recadoAntesDeGravar(decisao)
          if (recado) setRecado(recado)

          const evento = await gravarDecisao(
            repositorio,
            config.instalacaoId,
            decisao,
            { quando: leitura.em, turma: sessao.turma, uidHash },
            (ocupado) => registrar('id_ocupado', { evento: ocupado }),
          )
          const gravadoEm = performance.now()
          if (evento) {
            await aoRegistrar?.(evento)
            // O LED do leitor serial, como o bipe, só depois da gravação.
            if (ehConfirmavel(leitor)) void leitor.confirmarGravacao()
          }
          if (decisao.tipo === 'encerrar') {
            await repositorio.encerrarSessao()
            aoEncerrar?.(presentesRef.current.size, leitura.em.getTime() - Date.parse(sessao.abertaEm), fila.current.estatistica())
          }

          const { som, limpaRecado } = depoisDeGravar(decisao, Boolean(evento))
          if (limpaRecado && minha === geracao.current) setRecado(undefined)
          if (som) tocar(som)
          await depoisDeMudar()
          registrar('cracha', {
            hash: curto(uidHash),
            sal: vinculo ? sal : undefined,
            vinculo: vinculo ? vinculo.papel : 'nenhum',
            decisao: decisao.tipo,
            evento: evento?.eventoId,
            identificar_ms: Math.round(identificadoEm - inicio),
            gravar_ms: Math.round(gravadoEm - identificadoEm),
            tela_ms: Math.round(performance.now() - gravadoEm),
          })
        } finally {
          // Daqui em diante, quem diz se ele passou é o log.
          fila.current.concluir(uidHash)
        }
      })().catch((erro: Error) => {
        registrar('erro_na_leitura', { mensagem: erro?.message })
        setRecado('A leitura falhou e não foi gravada. Encoste o crachá de novo.')
        tocar('desconhecido')
      })
    }
    const cancelar = leitor.aoLer(aoLer)
    // As retidas, na ordem em que chegaram, antes de qualquer leitura nova.
    for (const leitura of retidas?.() ?? []) aoLer(leitura)
    return cancelar
  }, [
    retidas,
    leitor,
    repositorio,
    config,
    sessao,
    vinculos,
    depoisDeMudar,
    aoRegistrar,
    aoEncerrar,
    aCadastrar,
    pendentesAlunos,
    proximoPendente,
  ])

  /**
   * Encerrar pelo botão: o mesmo registro do crachá do professor, em nome de
   * quem abriu. Um clique só: com a aba ocupada, cada clique a mais gravava
   * outro encerramento (23/09/2026).
   */
  const aoEncerrarAgora = useCallback(() => {
    if (encerrando.current) return
    encerrando.current = true
    semDono('encerrar pelo botão', async () => {
      const agora = new Date()
      // Encerrar logo depois de abrir chega antes da lista da tela: a base
      // responde, senão a linha do log sai sem o nome de quem encerrou.
      const ehDoProfessor = (v: Vinculo) => v.uidHash === sessao.uidHashProfessor
      const vinculo = vinculos.find(ehDoProfessor) ?? (await repositorio.listarVinculos()).find(ehDoProfessor)
      const evento = await gravarDecisao(repositorio, config.instalacaoId, { tipo: 'encerrar', vinculo }, {
        quando: agora,
        turma: sessao.turma,
        uidHash: sessao.uidHashProfessor,
      })
      if (evento) {
        registrar('encerrar', { como: 'botao', evento: evento.eventoId, presentes: presentesRef.current.size })
        await aoRegistrar?.(evento)
      }
      await repositorio.encerrarSessao()
      tocar('encerramento')
      aoEncerrar?.(presentesRef.current.size, agora.getTime() - Date.parse(sessao.abertaEm), fila.current.estatistica())
      aoMudarBase()
    })
  }, [config.instalacaoId, sessao, repositorio, aoRegistrar, aoEncerrar, aoMudarBase, vinculos])

  /** A busca respondeu: ninguém (fica como crachá não cadastrado) ou alguém. */
  const desistirDaBusca = (uidHash: string) =>
    semDono('busca: desistir', async () => {
      fecharBusca()
      const evento = await gravarDecisao(repositorio, config.instalacaoId, { tipo: 'desconhecido' }, {
        quando: new Date(),
        turma: sessao.turma,
        uidHash,
      })
      if (evento) {
        registrar('busca_desistiu', { hash: curto(uidHash), evento: evento.eventoId })
        await aoRegistrar?.(evento)
      }
      await depoisDeMudar()
    })

  const escolherNaBusca = (uidHash: string, pessoa: Matriculado) =>
    semDono('busca: escolher', async () => {
      const quando = new Date()
      fecharBusca()
      // É por aqui que o crachá real do professor costuma chegar, e
      // `vincularCracha` troca o sintético pelo real.
      await vincularCracha(repositorio, vinculos, pessoa, uidHash, quando)
      const evento = await gravarDecisao(repositorio, config.instalacaoId, { tipo: 'cadastro', pessoa }, {
        quando,
        turma: sessao.turma,
        uidHash,
      })
      if (evento) {
        registrar('busca_escolheu', { hash: curto(uidHash), papel: pessoa.papel, evento: evento.eventoId })
        await aoRegistrar?.(evento)
      }
      tocar('ok')
      await depoisDeMudar()
    })

  const suspeito = leitorSuspeito(agora, ultimaAtividadeEm, pendentesAlunos.length)

  const andarNaFila = (direcao: -1 | 1) => {
    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
    const alvo = Math.min(pendentesAlunos.length - 1, Math.max(0, indice + direcao))
    setChamadoChave(pendentesAlunos[alvo]?.chave)
  }

  const pularChamado = () => {
    if (!chamadoAluno) return
    setPulados((antes) => new Set(antes).add(chamadoAluno.chave))
    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
    setChamadoChave(proximoPendente(indice + 1))
  }

  const simular =
    ensaio && ehSimulavel(leitor)
      ? () => {
          try {
            leitor.encostarProximo()
          } catch (erro) {
            setRecado((erro as Error).message)
          }
        }
      : undefined

  const marcarComoEu = (uidHash: string | undefined) => {
    definirProfessorAtual(uidHash)
    setProfessorAtualHash(uidHash)
  }

  /** Nome ou papel de quem ainda não tem crachá: só local, até o crachá chegar. */
  const editarAntesDoCracha = (p: Matriculado, mudanca: { nome?: string; papel?: Papel }) => {
    const atual = efetivo(p)
    setEdicoes((antes) =>
      new Map(antes).set(p.chave, { nome: mudanca.nome ?? atual.nome, papel: mudanca.papel ?? atual.papel }),
    )
  }

  /**
   * Apelido de uma linha da lista. Com vínculo carregado, muda o vínculo na
   * tela (e grava ao sair do campo). Sem ele (ainda não carregou, ou não tem
   * crachá), a edição fica em `edicoes` até ele chegar.
   */
  const editarNome = (p: Matriculado, nome: string, vinculado: boolean) => {
    const vinculo = vinculado ? vinculoDe(p) : undefined
    if (!vinculo) return editarAntesDoCracha(p, { nome })
    setVinculos((antes) => antes.map((v) => (v.uidHash === vinculo.uidHash ? { ...v, nome } : v)))
    // Uma tecla anterior pode ter caído em `edicoes`; ela sai, senão
    // `efetivo` ficaria presa nela.
    setEdicoes((antes) => {
      if (!antes.has(p.chave)) return antes
      const novo = new Map(antes)
      novo.delete(p.chave)
      return novo
    })
  }

  /** Grava o apelido ao sair do campo: uma escrita por edição, não por tecla. */
  const gravarNome = (p: Matriculado) => {
    const vinculo = vinculoDe(p)
    if (vinculo) semDono('renomear vínculo', () => repositorio.gravarVinculo({ ...vinculo, nome: efetivo(p).nome }))
  }

  return (
    <section className="coleta">
      <header className="coleta__topo">
        <span>{hhmm(new Date())}</span>
        <strong>{sessao.turma}</strong>
        <span>desde {hhmm(new Date(sessao.abertaEm))}</span>
        {/* No topo também: numa turma grande o rodapé fica longe. */}
        <button className="botao--acento coleta__encerrar-topo" onClick={() => aoEncerrarAgora()}>
          Encerrar
        </button>
      </header>

      <ContadorDaChamada presentes={presentes.size} linhas={linhas} />

      {/* Certeza, não palpite: sem foco, nenhum crachá chega aqui. */}
      {semFoco && (
        <p className="ferramentas__nota ferramentas__nota--espacada ferramentas__nota--forte">
          Esta janela perdeu o foco. O crachá não chega aqui enquanto outro
          programa estiver na frente: clique nesta janela para voltar a ler.
        </p>
      )}

      {/* Palpite: faz tempo que ninguém é lido, com gente ainda sem crachá. */}
      {suspeito && (
        <p className="ferramentas__nota ferramentas__nota--espacada">
          Nenhuma leitura há alguns minutos. Se alguém tentou encostar o crachá e nada
          aconteceu, confira se o leitor está conectado.
        </p>
      )}

      {pendentesAlunos.length > 0 && (
        <CartaoDoChamado
          pendentes={pendentesAlunos}
          totalDeAlunos={alunosDaTurma.length}
          chamado={chamadoAluno}
          aoLigar={() => setChamadoChave(proximoPendente(0))}
          aoDesligar={() => setChamadoChave(undefined)}
          aoAndar={andarNaFila}
          aoPular={pularChamado}
          aoSimular={simular}
        />
      )}

      {/* Some enquanto alguém está chamado: a atenção é da fila. */}
      {professoresDaTurma.length > 0 && !chamadoAluno && (
        <PainelDeProfessores
          professores={professoresDaTurma}
          vinculoDe={vinculoDe}
          efetivo={efetivo}
          chamadoChave={chamadoChave}
          professorAtual={professorAtualHash}
          aoChamar={setChamadoChave}
          aoEditarNome={(p, nome) => editarAntesDoCracha(p, { nome })}
          aoRemover={removerCracha}
          aoMarcarComoEu={marcarComoEu}
        />
      )}

      {alunosDaTurma.length > 0 && (
        <ListaDeAlunos
          alunos={alunosDaTurma}
          chavesPendentes={chavesPendentes}
          efetivo={efetivo}
          vezesDoNome={vezesDoNome}
          presencasHoje={presencasHoje}
          chamadoChave={chamadoChave}
          pulados={pulados}
          aoChamar={setChamadoChave}
          aoEditarNome={editarNome}
          aoGravarNome={gravarNome}
          aoEditarPapel={(p, papel) => editarAntesDoCracha(p, { papel })}
          aoAlterarPresenca={(p, presente) =>
            semDono(presente ? 'marcar presença' : 'tirar presença', () => alterarPresenca(p, presente))
          }
          aoRemover={removerCracha}
        />
      )}

      {procurando && (
        <Busca
          pessoas={ordemDaBusca}
          leiturasDuranteABusca={leiturasDuranteABusca}
          aviso={avisoDaBusca}
          aoDesistir={() => desistirDaBusca(procurando)}
          aoEscolher={(pessoa) => escolherNaBusca(procurando, pessoa)}
        />
      )}

      {/* O recado, quando há, fala mais alto que o botão: é resposta a um toque. */}
      <footer className="coleta__rodape">
        {recado ? (
          <span className="coleta__recado">{recado}</span>
        ) : (
          <button className="botao--acento coleta__encerrar" onClick={() => aoEncerrarAgora()}>
            Encerrar a chamada
          </button>
        )}
        {simular && (
          <button className="coleta__simular" onClick={simular}>
            Simular
          </button>
        )}
      </footer>
    </section>
  )
}
