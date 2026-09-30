// A casca do app: decide a rota a partir do estado (`nucleo/rota.ts`) e monta
// a tela que ela devolve. Não há menu. Ajustes, Presenças e Diagnóstico são
// folhas atrás da engrenagem do canto.
//
// O estado vem de hooks, um por assunto: a base (`useBase`), a pasta
// (`usePasta`), a turma e o dia do repouso (`useEscolhaDaChamada`) e a
// abertura da chamada (`useAbertura`). Aqui fica só o que liga um ao outro.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { criarAgendador } from '../ambiente/agendador.ts'
import { salvarTexto } from '../ambiente/arquivos.ts'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { marcarChamadaViva } from '../ambiente/chamadaViva.ts'
import { registrar, semDono } from '../ambiente/diario.ts'
import {
  aoPoderInstalar,
  conselho,
  dispensarConvite,
  instalarApp,
  podeInstalarApp,
  riscoDeApagar,
} from '../ambiente/instalacao.ts'
import {
  adiarHorario,
  dispensarConselho,
  esquecerEncerramento,
  esquecerPreferencias,
  marcarEncerrada,
  marcarVersaoDeNovidadeVista,
  modoDev,
  registrarChamadaEncerrada,
  versaoDeNovidadeVista,
} from '../ambiente/preferencias.ts'
import { caminhoDosRegistros, mesclarDaPasta, restaurar } from '../ambiente/sincronia.ts'
import { tocar } from '../ambiente/som.ts'
import { nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { saisConhecidos } from '../nucleo/hash.ts'
import { NOVIDADES } from '../nucleo/novidades.ts'
import { marcarAte, totalNaoSalvo } from '../nucleo/pendencias.ts'
import { decidirRota } from '../nucleo/rota.ts'
import type { Sessao } from '../nucleo/sessao.ts'
import { ehQueRecusa, ehSimulavel, type Recusa } from '../portas/LeitorDeCracha.ts'
import { gravarMarcasPendentes, podeApagar } from '../portas/Repositorio.ts'
import { useAdsum } from './adsum.ts'
import { ConviteParaInstalar } from './componentes/ConviteParaInstalar.tsx'
import { SeloDoCanto } from './componentes/SeloDoCanto.tsx'
import { Sheet } from './componentes/Sheet.tsx'
import { Engrenagem } from './componentes/Simbolos.tsx'
import { FolhaDeAjustes } from './FolhaDeAjustes.tsx'
import { useAbertura } from './hooks/useAbertura.ts'
import { useBase } from './hooks/useBase.ts'
import { useDiarioDoApp } from './hooks/useDiarioDoApp.ts'
import { useEscolhaDaChamada } from './hooks/useEscolhaDaChamada.ts'
import { usePasta } from './hooks/usePasta.ts'
import { useRecadoPassageiro } from './hooks/useRecadoPassageiro.ts'
import { useTeclasDeEnsaio } from './hooks/useTeclasDeEnsaio.ts'
import { IndicadorDoLeitor } from './IndicadorDoLeitor.tsx'
import { Repouso } from './Repouso.tsx'
import { TelaAula } from './TelaAula.tsx'
import { TelaColarTurma } from './TelaColarTurma.tsx'
import { TelaCronograma } from './TelaCronograma.tsx'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaNavegador } from './TelaNavegador.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { ConteudoDePresencas } from './TelaPresencas.tsx'
import { TelaProblema } from './TelaProblema.tsx'
import { TelaResumo } from './TelaResumo.tsx'

type Folha = 'ajustes' | 'presencas' | 'diagnostico'

/** Duas frases curtas e sem travessão, que é a voz de tela deste app. */
function mensagemDeRecusa(recusa: Recusa): string {
  return recusa.motivo === 'ritmo'
    ? 'Uma leitura chegou devagar demais e foi recusada. Encoste o crachá de novo.'
    : 'Uma leitura chegou, mas não parece um crachá. Encoste o crachá de novo.'
}

export function Fluxo() {
  const { leitor, repositorio, config, recarregarConfig } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const {
    pasta,
    estado: estadoDaPasta,
    falha: falhaNaPasta,
    dispensada: semPasta,
    conferir,
    gravarCofre: gravarNaPasta,
    gravarLinha,
    consertar: consertarPasta,
    ligar: ligarPasta,
    desconectar: desconectarPasta,
    dispensar: dispensarPastaAgora,
  } = usePasta({ repositorio, leitor, salHex: config.salHex })
  const {
    sessao,
    listaDeTurmas,
    turmas,
    pendentes,
    pendentesDaTurma,
    matriculadosTodos,
    professorSemCracha,
    semCadastro,
    pendencias,
    grade,
    semHorario,
    uidDoProfessor,
    nomeDoProfessorAtual,
    recontar,
    esquecerSessao,
  } = useBase({ repositorio, pasta })
  const { comecarEm, turmaSelecionada, mudarTurma, diaSelecionado, editarDia, voltarParaHoje, momentoDaChamada } =
    useEscolhaDaChamada({ grade, listaDeTurmas })

  // Lido uma vez: dispensar troca o estado, não a leitura.
  const [conselhoDoNavegador, setConselho] = useState(conselho)
  const [dicaDeEnsaio, setDicaDeEnsaio] = useRecadoPassageiro(6000)
  /** Sobre um crachá lido ou recusado fora da chamada: nunca mudo. */
  const [avisoLeitura, setAvisoLeitura] = useRecadoPassageiro(6000)
  /** "Fulano foi lido": o teste do leitor que o professor faz no repouso. */
  const [leituraOk, setLeituraOk] = useRecadoPassageiro(6000)
  const [novidade, setNovidade] = useRecadoPassageiro(12000)
  const [convidarApp, setConvidarApp] = useState(podeInstalarApp)
  const [folha, setFolha] = useState<Folha>()
  /** Colando uma turma nova: ela ainda não existe, então não há aula a abrir. */
  const [colandoNova, setColandoNova] = useState(false)
  /** Quantas turmas havia ao abrir a colagem: a colagem fecha quando cresce. */
  const [turmasAntesDaNova, setTurmasAntesDaNova] = useState(0)
  const [resumo, setResumo] = useState<{ sessao: Sessao; presentes: number }>()

  // Arrays estáveis entre renders: arrays novos a cada render invalidavam
  // toda a memoização da tela da chamada, a cada crachá.
  const pendentesDaAula = useMemo(
    () => pendentesDaTurma.filter((p) => p.turma === sessao?.turma),
    [pendentesDaTurma, sessao?.turma],
  )
  const turmaDaAula = useMemo(
    () => matriculadosTodos.filter((p) => p.turma === sessao?.turma),
    [matriculadosTodos, sessao?.turma],
  )

  const ambienteQuebrado = levantarCapacidades().some((c) => c.peso === 'essencial' && !c.presente)
  // Lido uma vez: trocar o modo de ensaio recarrega a página.
  const ensaio = useMemo(modoDev, [])
  const porSalvar = pasta ? 0 : totalNaoSalvo(pendencias)

  // O estado é perguntado antes de ouvir: um leitor novo pode já estar lendo,
  // e `iniciar()` num leitor que já lê não avisa ninguém (22/09/2026).
  useEffect(() => {
    setLendo(leitor.estado() === 'lendo')
    return leitor.aoMudarEstado((e) => setLendo(e === 'lendo'))
  }, [leitor])

  // Fechar a aba com aula por salvar perde a chamada. Só avisa quando há o
  // que perder: um aviso sempre ligado seria ignorado quando importasse.
  useEffect(() => {
    if (pasta || pendencias.length === 0) return
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // o WebKit ainda exige
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pasta, pendencias.length])

  useEffect(() => aoPoderInstalar(() => setConvidarApp(podeInstalarApp())), [])
  useDiarioDoApp({ pasta, leitor: leitor.nome, instalacao: config.instalacaoId })
  useEffect(() => marcarChamadaViva(!!sessao), [sessao])

  // Leitura que chegou e não virou crachá nunca fica muda, em qualquer tela.
  useEffect(() => {
    if (!ehQueRecusa(leitor)) return
    return leitor.aoRecusar((recusa) => {
      registrar('recusa', { motivo: recusa.motivo, caracteres: recusa.cru.length }) // o texto cru é o UID
      tocar('desconhecido')
      setLeituraOk(undefined)
      setAvisoLeitura(mensagemDeRecusa(recusa))
    })
  }, [leitor, setLeituraOk, setAvisoLeitura])

  // Uma vez por versão nova, marcada como vista já ao aparecer.
  useEffect(() => {
    const atual = NOVIDADES[0]
    if (!atual || atual.versao === versaoDeNovidadeVista()) return
    setNovidade(atual.resumo)
    marcarVersaoDeNovidadeVista(atual.versao)
  }, [setNovidade])

  // Recontar e regravar a pasta, uma execução por vez e coalescida: numa
  // fila rápida, uma por crachá rodava em paralelo sobre os mesmos arquivos.
  const aoMudar = useRef({ recontar, gravarNaPasta })
  useEffect(() => {
    aoMudar.current = { recontar, gravarNaPasta }
  }, [recontar, gravarNaPasta])
  const mudou = useMemo(
    () =>
      criarAgendador(async (turma) => {
        await aoMudar.current.recontar()
        await aoMudar.current.gravarNaPasta(turma)
      }),
    [],
  )

  // Ligar a pasta: base vazia se restaura dela; base com dados recebe o que
  // só a pasta tem (`mesclarDaPasta`). A config é relida se o chaveiro de
  // sais mudou: a tela calcula o hash com ela (17/09/2026).
  useEffect(() => {
    if (!pasta) return
    semDono('ligar pasta', async () => {
      const antes = saisConhecidos(await repositorio.lerConfig()).join()
      const vazia = (await repositorio.listarVinculos()).length === 0
      const mescla = vazia ? undefined : await mesclarDaPasta(repositorio, pasta)
      if (vazia) await restaurar(repositorio, pasta)
      registrar('pasta_ligada', {
        restaurou: vazia,
        vinculos_trazidos: mescla?.vinculos,
        turmas_trazidas: mescla?.turmas,
        aulas_trazidas: mescla?.aulas,
        sais: saisConhecidos(await repositorio.lerConfig()).length,
      })
      await conferir()
      // Só se mudou: reler troca a identidade de `recarregarConfig`, que
      // reroda este efeito, e reler sempre seria laço.
      if (saisConhecidos(await repositorio.lerConfig()).join() !== antes) await recarregarConfig()
      // Regrava a pasta inteira uma vez: a versão nova muda a forma de um
      // arquivo (a coluna `matricula` das faltas) sem pedir gesto ao professor.
      await mudou()
    })
  }, [pasta, repositorio, mudou, recarregarConfig, conferir])

  /** Uma cópia do log da turma. Devolve como salvou: o Safari baixa sem diálogo. */
  const salvarCopia = useCallback(
    async (turma: string) => {
      const eventos = await repositorio.listarEventos()
      const daTurma = porTurma([...eventos].reverse()).get(turma) ?? []
      const como = await salvarTexto(nomeDoArquivo(turma), paraCsv(daTurma))
      // Cancelar não marca: a pendência continua existindo.
      const ate = marcarAte(daTurma)
      if (como !== 'cancelado' && ate) {
        await repositorio.marcarExportado(turma, ate)
        await recontar()
      }
      return como
    },
    [repositorio, recontar],
  )

  const avisar = useCallback((texto: string) => setAvisoLeitura(texto), [setAvisoLeitura])
  const mostrarLido = useCallback(
    (texto: string) => {
      setAvisoLeitura(undefined)
      setLeituraOk(texto)
    },
    [setAvisoLeitura, setLeituraOk],
  )
  const { abrirChamada, iniciarChamada, garantirProfessor, avisarSeOutraTurmaEsperava, entregarRetidas } = useAbertura({
    leitor,
    repositorio,
    instalacaoId: config.instalacaoId,
    sessao,
    turmaSelecionada,
    momentoDaChamada,
    voltarParaHoje,
    gravarLinha,
    mudou,
    aoLido: mostrarLido,
    aoAviso: avisar,
  })

  useTeclasDeEnsaio({ ligado: ensaio, leitor, repositorio, salHex: config.salHex, aoDica: setDicaDeEnsaio })

  const rota = decidirRota({
    ambienteQuebrado,
    pasta: estadoDaPasta,
    lendo,
    turmas,
    pendentes,
    chamadaAberta: !!sessao,
    professorSemCracha,
    conselharNavegador: !!conselhoDoNavegador,
    turmaSemHorario: semHorario?.turma,
    pastaDispensada: semPasta,
    cadastroDispensado: semCadastro,
  })

  // 'cerimonia' não é tela: é "abra sozinho", e a rota vira 'chamada'.
  useEffect(() => {
    if (rota === 'cerimonia') semDono('abrir sozinho', iniciarChamada)
  }, [rota, iniciarChamada])

  // No repouso: ← → trocam de turma, Enter abre. As setas não roubam o foco
  // de um campo (o de data usa ← →), e o Enter do dongle, marcado com
  // `defaultPrevented` pelo `LeitorTeclado`, não abre nada.
  useEffect(() => {
    const emRepouso = !resumo && rota === 'pronto' && !colandoNova
    if (!emRepouso) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Enter') {
        if (evento.defaultPrevented) return
        if (turmaSelecionada) semDono('abrir pelo Enter', iniciarChamada)
        return
      }
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const foco = document.activeElement
      if (foco instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(foco.tagName)) return
      mudarTurma(evento.key === 'ArrowRight' ? 1 : -1)
      evento.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [resumo, rota, colandoNova, turmaSelecionada, iniciarChamada, mudarTurma])

  // A colagem fecha quando a turma colada é salva, e não reabre em branco
  // ao voltar do cronograma.
  useEffect(() => {
    if (colandoNova && turmas > turmasAntesDaNova) setColandoNova(false)
  }, [colandoNova, turmas, turmasAntesDaNova])

  const naColagem = rota === 'turma' || (rota === 'pronto' && colandoNova)

  /** O que está na tela, para depuração no modo de ensaio: a rota e as camadas por cima dela. */
  const camadas = [
    rota,
    colandoNova && 'colando turma nova',
    resumo && 'resumo aberto',
    folha && `folha: ${folha}`,
  ]
    .filter(Boolean)
    .join(' · ')


  return (
    <>
      {/* Com uma folha aberta, o fundo sai da árvore de acessibilidade. */}
      <div aria-hidden={folha ? true : undefined}>
      {rota === 'problema' && (
        <TelaProblema
          aoAbrirAjustes={() => setFolha('ajustes')}
          sessao={sessao}
          aoTentar={() => setLendo(leitor.estado() === 'lendo')}
        />
      )}
      {rota === 'pasta' && (
        <TelaPasta
          precisaDePermissao={estadoDaPasta === 'sem_permissao'}
          aoEscolher={() => semDono('escolher pasta', () => ligarPasta(true))}
          aoLiberar={() => semDono('liberar pasta', () => ligarPasta(false))}
          aoDispensar={dispensarPastaAgora}
        />
      )}
      {rota === 'navegador' && conselhoDoNavegador && (
        <TelaNavegador
          conselho={conselhoDoNavegador}
          aoDispensar={() => {
            dispensarConselho()
            setConselho(undefined)
          }}
        />
      )}
      {rota === 'cronograma' && semHorario && (
        <TelaCronograma
          turma={semHorario.turma}
          aulas={semHorario.aulas}
          uidHashProfessor={uidDoProfessor}
          aoSalvar={(novas) => {
            semDono('salvar cronograma', async () => {
              // O cronograma pode vir antes de qualquer crachá de professor:
              // as aulas são gravadas no dele, criado agora se preciso, e não
              // num hash vazio que nunca bateria com a grade.
              const professor = await garantirProfessor()
              const comProfessorCerto = novas.map((a) => ({
                ...a,
                uidHashProfessor: professor.uidHash,
              }))
              await repositorio.definirHorarioDaTurma(semHorario.turma, comProfessorCerto)
              // Salvar sem marcar nada é adiar: senão a tela voltaria na hora.
              if (novas.length === 0) adiarHorario(semHorario.turma)
              await mudou()
            })
          }}
          aoPular={() => {
            adiarHorario(semHorario.turma)
            semDono('recontar', recontar)
          }}
        />
      )}
      {naColagem && (
        <TelaColarTurma
          aoMudarBase={(turma?: string) => semDono('base mudou', () => mudou(turma))}
          // Sem turma nenhuma não há para onde voltar.
          aoSair={
            rota === 'turma'
              ? undefined
              : () => setColandoNova(false)
          }
        />
      )}
      {rota === 'chamada' && sessao && (
        <TelaAula
          sessao={sessao}
          pendentes={pendentesDaAula}
          daTurma={turmaDaAula}
          // Só a turma da aula: um crachá aqui não muda outra turma.
          aoMudarBase={() => semDono('base mudou', () => mudou(sessao.turma))}
          aoRegistrar={gravarLinha}
          retidas={entregarRetidas}
          aoEncerrar={(presentes, duracaoMs, intervalos) => {
            // Sem esta marca o relógio reabriria a aula que acabou de fechar.
            marcarEncerrada(sessao.turma, new Date().toISOString())
            // A fila acabou: grava o que foi adiado para não pesar nela.
            semDono('marcas de sal', gravarMarcasPendentes)
            semDono('conferir', () => conferir(sessao.turma))
            esquecerSessao()
            setResumo({ sessao, presentes })
            // Para o Diagnóstico: é o dado que calibra `INTERVALO_MINIMO_MS`.
            registrarChamadaEncerrada({
              turma: sessao.turma,
              encerradaEm: new Date().toISOString(),
              duracaoMs,
              intervalos,
            })
            semDono('avisar outra turma', () => avisarSeOutraTurmaEsperava(sessao))
          }}
        />
      )}
      {resumo && (
        <TelaResumo
          sessao={resumo.sessao}
          presentes={resumo.presentes}
          arquivo={pasta ? `${pasta.name} ▸ ${caminhoDosRegistros(resumo.sessao.turma)}` : undefined}
          aoSalvarCopia={() => salvarCopia(resumo.sessao.turma)}
          aoConcluir={() => setResumo(undefined)}
          aoReabrir={() => {
            semDono('reabrir', async () => {
              // Sem esquecer a marca, a grade trataria a aula como encerrada.
              esquecerEncerramento(resumo.sessao.turma)
              await abrirChamada(
                resumo.sessao.turma,
                resumo.sessao.uidHashProfessor,
                new Date(),
              )
              setResumo(undefined)
            })
          }}
        />
      )}

      {!resumo && rota === 'pronto' && !colandoNova && (
        <Repouso
          pendencias={pasta ? [] : pendencias}
          nomeDoProfessor={nomeDoProfessorAtual}
          listaDeTurmas={listaDeTurmas}
          turmaSelecionada={turmaSelecionada}
          agoraNaGrade={comecarEm}
          diaSelecionado={diaSelecionado}
          aoMudarTurma={mudarTurma}
          aoEditarDia={editarDia}
          aoIniciar={() => semDono('abrir pelo botão', iniciarChamada)}
          aoSalvar={(turma) => semDono('salvar cópia', () => salvarCopia(turma))}
          aoVerPresencas={() => setFolha('presencas')}
          aoNovaTurma={() => {
            setTurmasAntesDaNova(turmas)
            setColandoNova(true)
          }}
        />
      )}

      {falhaNaPasta && (
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            {falhaNaPasta}. Nada se perdeu: está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button onClick={() => semDono('consertar pasta', consertarPasta)}>Gravar de novo</button>
        </div>
      )}

      {/* Fora de qualquer tela: um convite que depende de passar por uma
          tela específica chega tarde ou nunca. Some durante a chamada. */}
      {convidarApp && rota !== 'chamada' && (
        <ConviteParaInstalar
          aoDispensar={() => {
            dispensarConvite()
            setConvidarApp(false)
          }}
          aoInstalar={() => void instalarApp().finally(() => setConvidarApp(false))}
        />
      )}

      {dicaDeEnsaio && <p className="dica-ensaio">{dicaDeEnsaio}</p>}
      {avisoLeitura && <p className="aviso-leitura">{avisoLeitura}</p>}
      {leituraOk && <p className="aviso-leitura aviso-leitura--ok">{leituraOk}</p>}
      {novidade && (
        <p className="toast-novidade">
          {novidade}
          <button
            className="toast-novidade__fechar"
            onClick={() => setNovidade(undefined)}
            aria-label="Fechar aviso"
            title="Fechar"
          >
            ×
          </button>
        </p>
      )}

      <div className="canto">
        <SeloDoCanto
          falhaNaPasta={falhaNaPasta}
          porSalvar={porSalvar}
          lendo={lendo}
          temPasta={!!pasta}
          semSeletorDePasta={estadoDaPasta === 'indisponivel'}
          riscoDeApagar={riscoDeApagar()}
        />

        {/* Modo de ensaio: as teclas que simulam crachá, e a rota atual. */}
        {ensaio && ehSimulavel(leitor) && (
          <span className="selo-status" title="Modo de ensaio, com leitor simulado">
            <kbd>espaço</kbd> crachá
            {rota === 'chamada' ? (
              <>
                {' · '}
                <kbd>N</kbd> crachá novo
              </>
            ) : null}
            {' · '}
            <kbd>P</kbd> professor
          </span>
        )}

        {ensaio && (
          <span className="selo-status" title="Estado da rota, para depuração">
            {camadas}
          </span>
        )}

        <IndicadorDoLeitor leitor={leitor} />

        <button
          className="engrenagem"
          onClick={() => setFolha('ajustes')}
          aria-label="Ajustes"
          title="Ajustes"
        >
          <Engrenagem />
        </button>
      </div>
      </div>

      {/* Uma folha só: trocar o conteúdo, e não a folha, não refaz a animação do fundo. */}
      {folha && (
        <Sheet
          titulo={folha === 'ajustes' ? 'Ajustes' : folha === 'presencas' ? 'Presenças' : 'Diagnóstico'}
          aoFechar={() => setFolha(undefined)}
          cheia={folha === 'presencas'}
        >
          {folha === 'ajustes' && (
            <FolhaDeAjustes
              pasta={pasta}
              aoTrocarPasta={() => semDono('trocar pasta', () => ligarPasta(true))}
              aoResetar={
                podeApagar(repositorio)
                  ? async () => {
                      await repositorio.apagarTudo()
                      await repositorio.esquecerPasta()
                      esquecerPreferencias()
                      // Recarregar, e não zerar o estado à mão: "meio zerado"
                      // é o defeito que este botão não pode produzir.
                      location.reload()
                    }
                  : undefined
              }
              aoDesconectarPasta={desconectarPasta}
              aoRelerPasta={async () => {
                const resumo = await restaurar(repositorio, pasta!)
                await recarregarConfig()
                await recontar()
                return resumo
              }}
              aoVerPresencas={() => setFolha('presencas')}
              aoNovaTurma={
                rota === 'pronto'
                  ? () => {
                      setFolha(undefined)
                      setTurmasAntesDaNova(turmas)
                      setColandoNova(true)
                    }
                  : undefined
              }
              aoAbrirDiagnostico={() => setFolha('diagnostico')}
            />
          )}
          {folha === 'presencas' && (
            <ConteudoDePresencas
              nomeDaPasta={pasta?.name}
              aoRegistrar={gravarLinha}
              aoMudarBase={(turma: string) => semDono('base mudou', () => mudou(turma))}
            />
          )}
          {folha === 'diagnostico' && <TelaDiagnostico />}
        </Sheet>
      )}
    </>
  )
}
