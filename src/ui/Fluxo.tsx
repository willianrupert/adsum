// A casca do app. Não há menu: a rota decorre do estado (ver `nucleo/rota.ts`).
//
// Diagnóstico e Repositório deixaram de ser abas. Viraram folhas, alcançáveis
// por dois selos discretos no rodapé — quietos quando está tudo bem, e a tela
// inteira quando não está. Ninguém deve saber que existe uma tela de
// diagnóstico até precisar dela.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { decidirRota } from '../nucleo/rota.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { eventoDe, proximoEventoId, type Sessao } from '../nucleo/sessao.ts'
import { abrirSozinho, escolherTurma, proximaAula, DIAS } from '../nucleo/grade.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { escolherPasta, pastaDisponivel, permissao } from '../ambiente/pasta.ts'
import { conselho, riscoDeApagar } from '../ambiente/instalacao.ts'
import {
  dispensarConselho,
  dispensarPasta,
  esquecerDispensaDaPasta,
  pastaDispensada,
  encerradas,
  marcarEncerrada,
  modoDev,
} from '../ambiente/preferencias.ts'
import {
  acrescentarNoLog,
  caminhoDosRegistros,
  repararLog,
  restaurar,
  sincronizar,
} from '../ambiente/sincronia.ts'
import { nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { salvarTexto } from '../ambiente/arquivos.ts'
import type { EstadoDaPasta } from '../nucleo/rota.ts'
import { TelaAula } from './TelaAula.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { TelaNavegador } from './TelaNavegador.tsx'
import { TelaResumo } from './TelaResumo.tsx'
import { EscolherTurma } from './componentes/EscolherTurma.tsx'
import { Cadeado, Engrenagem, Ondas } from './componentes/Simbolos.tsx'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { marcarAte, naoSalvos, totalNaoSalvo, type Pendencia } from '../nucleo/pendencias.ts'
import { useAdsum } from './adsum.ts'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaVinculo } from './TelaVinculo.tsx'

type Folha = 'ajustes'

export function Fluxo() {
  const { leitor, repositorio, config } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const [turmas, setTurmas] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [turmaPendente, setTurmaPendente] = useState<string>()
  const [pendentesDaTurma, setPendentesDaTurma] = useState<Matriculado[]>([])
  const [matriculadosTodos, setMatriculadosTodos] = useState<Matriculado[]>([])
  const [turmasAbertas, setTurmasAbertas] = useState<string[]>([])
  const [professorSemCracha, setProfessorSemCracha] = useState(false)
  const [sessao, setSessao] = useState<Sessao>()
  const [pasta, setPasta] = useState<FileSystemDirectoryHandle>()
  const [estadoDaPasta, setEstadoDaPasta] = useState<EstadoDaPasta>(
    pastaDisponivel() ? 'sem_pasta' : 'indisponivel',
  )
  // Decidido uma vez: reavaliar a cada render faria a tela sumir no meio de um
  // clique. Dispensar troca o estado, não a leitura.
  const [conselhoDoNavegador, setConselho] = useState(conselho)
  const [semPasta, setSemPasta] = useState(pastaDispensada)
  const [falhaNaPasta, setFalhaNaPasta] = useState<string>()
  // Sem pasta, isto é a única memória de que existe trabalho fora do disco.
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [proxima, setProxima] = useState<{ turma: string; quando: Date }>()
  const [folha, setFolha] = useState<Folha>()
  // A rota decide sozinha, mas "quero cadastrar mais um crachá" é uma intenção
  // que nenhum dado expressa — sem isto, o botão do repouso não tinha o que
  // fazer e não fazia nada.
  const [cadastrando, setCadastrando] = useState(false)
  const [resumo, setResumo] = useState<{ sessao: Sessao; presentes: number }>()
  const [escolhendo, setEscolhendo] = useState<{
    opcoes: string[]
    motivo: 'nenhuma' | 'varias'
    uidHash: string
    em: Date
  }>()

  const ambienteQuebrado = levantarCapacidades().some((c) => c.peso === 'essencial' && !c.presente)
  // Lido uma vez: o modo de ensaio muda pelos Ajustes, e a folha recarrega a
  // página ao trocar — ver `TelaDiagnostico`.
  const ensaio = useMemo(modoDev, [])
  // Com pasta nada fica pendente: cada evento é gravado no ato.
  const porSalvar = pasta ? 0 : totalNaoSalvo(pendencias)

  useEffect(() => leitor.aoMudarEstado((e) => setLendo(e === 'lendo')), [leitor])

  // Fechar a aba com aula por salvar é a forma mais fácil de perder trabalho:
  // um gesto de um segundo, sem confirmação, e a chamada some no prazo do
  // navegador. O `beforeunload` só é registrado quando há algo a perder — um
  // que estivesse sempre ligado viraria ruído e seria ignorado quando importa.
  useEffect(() => {
    if (pasta || pendencias.length === 0) return
    // `preventDefault` é o contrato atual; `returnValue` é o que o WebKit ainda
    // exige, e este aviso existe justamente por causa do Safari.
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pasta, pendencias.length])

  const recontar = useCallback(async () => {
    const [listaDeTurmas, matriculados, vinculos, aberta, eventos, atual] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
      repositorio.sessaoAberta(),
      repositorio.listarEventos(),
      repositorio.lerConfig(),
    ])
    setSessao(aberta)
    setPendencias(naoSalvos(eventos, atual.exportado))

    // Com a grade abrindo sozinha, o repouso virou espera — e espera sem prazo
    // é ansiedade. Qual turma vem e quando é a única informação que a tela tem
    // para dar, e é a que responde "estou no lugar certo?" sem ninguém pedir.
    const professor = vinculos.find((v) => v.papel === 'professor')
    const aulas = professor ? await repositorio.listarAulas() : []
    const vem = professor ? proximaAula(aulas, professor.uidHash, new Date()) : undefined
    setProxima(vem && { turma: vem.aula.turma, quando: vem.quando })
    // Quem já tem crachá é reconhecido pela matrícula — e, para quem não tem
    // matrícula na página (docente), pelo nome. Sem esta segunda via o
    // professor contava como pendente para sempre: `!m.matricula` era verdade
    // toda vez, e isso quebrava a conta do primeiro dia.
    const porMatricula = new Set(vinculos.map((v) => v.matricula).filter(Boolean))
    const porNome = new Set(vinculos.map((v) => v.nome))
    const faltando = matriculados.filter(
      (m) =>
        // A fila de cadastro é de aluno: o crachá do professor vem da cerimônia.
        m.papel === 'aluno' &&
        (m.matricula ? !porMatricula.has(m.matricula) : !porNome.has(m.nome)),
    )
    setTurmas(listaDeTurmas.length)
    setPendentes(faltando.length)
    setPendentesDaTurma(faltando)
    setMatriculadosTodos(matriculados)
    setTurmaPendente(faltando[0]?.turma)
    setProfessorSemCracha(!vinculos.some((v) => v.papel === 'professor'))
    setTurmasAbertas(listaDeTurmas)
  }, [repositorio])

  useEffect(() => {
    void recontar()
  }, [recontar])

  // Na volta de uma sessão, a pasta é reencontrada sozinha; só a permissão
  // espera um clique, porque o navegador exige gesto para concedê-la.
  useEffect(() => {
    if (!pastaDisponivel()) return
    void (async () => {
      const guardada = await repositorio.lerPasta()
      if (!guardada) return setEstadoDaPasta('sem_pasta')
      const estado = await permissao(guardada)
      if (estado !== 'granted') return setEstadoDaPasta('sem_permissao')
      setPasta(guardada)
      setEstadoDaPasta('ligada')
    })()
  }, [repositorio])

  // A pasta é a dona: se o cache está vazio e ela tem conteúdo, quem manda é
  // ela. É este caminho que transforma "perdi tudo" em "cliquei de novo".
  useEffect(() => {
    if (!pasta) return
    void (async () => {
      if ((await repositorio.listarVinculos()).length === 0) {
        await restaurar(repositorio, pasta)
      }
      await recontar()
    })()
  }, [pasta, repositorio, recontar])

  // Gravação que falha em silêncio é o pior defeito possível aqui: a aula segue
  // parecendo salva e só se descobre depois. O erro vira estado visível, e o
  // dado continua no cache até o conserto — nada se perde, mas ninguém fica
  // sabendo por acaso.
  const gravarNaPasta = useCallback(async () => {
    if (!pasta) return
    try {
      await sincronizar(repositorio, pasta)
      setFalhaNaPasta(undefined)
    } catch (erro) {
      setFalhaNaPasta((erro as Error).message)
    }
  }, [pasta, repositorio])

  const gravarLinha = useCallback(
    async (evento: Parameters<typeof acrescentarNoLog>[1]) => {
      if (!pasta) return
      try {
        await acrescentarNoLog(pasta, evento)
        setFalhaNaPasta(undefined)
      } catch (erro) {
        setFalhaNaPasta((erro as Error).message)
      }
    },
    [pasta],
  )

  /** Uma cópia do log da turma, para onde o professor quiser. */
  // Devolve como salvou porque a tela do fim precisa disso: o download do
  // Safari acontece sem diálogo nenhum, e sem uma linha na tela o clique não
  // produz sinal algum.
  const salvarCopia = useCallback(
    async (turma: string) => {
      const eventos = await repositorio.listarEventos()
      const daTurma = porTurma([...eventos].reverse()).get(turma) ?? []
      const como = await salvarTexto(nomeDoArquivo(turma), paraCsv(daTurma))

      // Só marca o que de fato saiu. Cancelar o diálogo não pode limpar a
      // pendência — seria o app esquecendo trabalho que continua só aqui.
      const ate = marcarAte(daTurma)
      if (como !== 'cancelado' && ate) {
        await repositorio.marcarExportado(turma, ate)
        await recontar()
      }
      return como
    },
    [repositorio, recontar],
  )


  const consertarPasta = useCallback(async () => {
    if (!pasta) return
    try {
      if ((await permissao(pasta, true)) !== 'granted') {
        return setEstadoDaPasta('sem_permissao')
      }
      await sincronizar(repositorio, pasta)
      await repararLog(repositorio, pasta)
      setFalhaNaPasta(undefined)
    } catch (erro) {
      setFalhaNaPasta((erro as Error).message)
    }
  }, [pasta, repositorio])

  const mudou = useCallback(async () => {
    await recontar()
    await gravarNaPasta()
  }, [recontar, gravarNaPasta])

  const abrirChamada = useCallback(
    async (turma: string, uidHash: string, em: Date) => {
      const total = await repositorio.contarEventos()
      const evento = eventoDe(
        { tipo: 'abrir', turma },
        {
          eventoId: proximoEventoId(config.instalacaoId, em, total + 1),
          quando: em,
          turma,
          uidHash,
        },
      )
      if (evento) {
        await repositorio.acrescentarEvento(evento)
        await gravarLinha(evento)
      }
      await repositorio.abrirSessao({ turma, abertaEm: em.toISOString(), uidHashProfessor: uidHash })
      tocar('abertura')
      await mudou()
    },
    [repositorio, config.instalacaoId, gravarLinha, mudou],
  )

  /**
   * O relógio e a grade escolhem a turma; só o caso ambíguo vira pergunta.
   *
   * Compartilhado entre os dois jeitos de abrir — o botão e o crachá — porque a
   * regra é a mesma e duplicá-la seria a forma de os dois divergirem sem
   * ninguém notar.
   */
  const abrirComProfessor = useCallback(
    async (uidHash: string, em: Date) => {
      const [aulas, listaDeTurmas] = await Promise.all([
        repositorio.listarAulas(),
        repositorio.listarTurmas(),
      ])
      const escolha = escolherTurma(aulas, listaDeTurmas, uidHash, em)

      if (escolha.tipo === 'sem_turma') return
      if (escolha.tipo === 'perguntar') {
        return setEscolhendo({ opcoes: escolha.opcoes, motivo: escolha.motivo, uidHash, em })
      }
      await abrirChamada(escolha.turma, uidHash, em)
    },
    [repositorio, abrirChamada],
  )

  /**
   * Abrir sem crachá.
   *
   * O gesto do crachá é herança do aparelho, que não tinha teclado nem mouse —
   * ali era o único jeito de dizer qualquer coisa. Num computador, o clique é
   * mais simples e continua sendo o professor quem clica: a máquina é dele.
   *
   * O crachá continua valendo, para quem está longe do teclado.
   */
  const iniciarChamada = useCallback(async () => {
    const professor = (await repositorio.listarVinculos()).find((v) => v.papel === 'professor')
    if (!professor) return
    await abrirComProfessor(professor.uidHash, new Date())
  }, [repositorio, abrirComProfessor])

  // Não se reconta ao ouvir o crachá: a gravação acontece depois, e contar
  // antes dela devolveria a pendência que acabou de deixar de existir. Quem
  // grava avisa, e é isso que faz a tela sair sozinha da cerimônia para o
  // repouso sem ninguém clicar em nada.

  // Fora da coleta, o crachá do professor é o que abre a aula. É o único
  // gesto que a tela de repouso precisa entender — e é o que faz a aula
  // começar sem ninguém tocar em nada.
  useEffect(() => {
    if (sessao) return
    return leitor.aoLer((leitura) => {
      void (async () => {
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        if (vinculo?.papel !== 'professor') return
        await abrirComProfessor(uidHash, leitura.em)
      })()
    })
  }, [leitor, repositorio, config, sessao, abrirComProfessor])

  // Ensaio sem hardware: espaço encosta o próximo crachá do baralho, e P
  // encosta o do professor — que é o que abre e fecha a aula. Sem isso, testar
  // o fluxo inteiro exigia caçar a carta certa no baralho.
  //
  // Só existe com leitor simulado e modo de ensaio ligado. Uma tecla que dispara
  // presença não pode estar viva no app publicado: espaço é a tecla que mais se
  // aperta sem querer, e ali ela marcaria alguém presente.
  useEffect(() => {
    if (!ensaio || !ehSimulavel(leitor)) return
    const simulado = leitor

    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null
      const digitando =
        alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.isContentEditable
      if (digitando || evento.metaKey || evento.ctrlKey || evento.altKey) return

      if (evento.code === 'Space') {
        evento.preventDefault()
        try {
          simulado.encostarProximo()
        } catch {
          /* leitor parado: o diagnóstico já diz */
        }
        return
      }

      if (evento.key.toLowerCase() === 'p') {
        evento.preventDefault()
        void (async () => {
          const professor = (await repositorio.listarVinculos()).find(
            (v) => v.papel === 'professor',
          )
          if (!professor) return
          // O vínculo guarda o hash, não o UID. O baralho é curto: acha-se qual
          // carta gera aquele hash e encosta ela.
          for (const hex of simulado.baralho()) {
            const hash = await calcularUidHash(config.salHex, hexParaUid(hex))
            if (hash === professor.uidHash) return simulado.simular(hex)
          }
        })()
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ensaio, leitor, repositorio, config.salHex])

  const rota = decidirRota({
    ambienteQuebrado,
    pasta: estadoDaPasta,
    lendo,
    turmas,
    pendentes,
    chamadaAberta: !!sessao,
    professorSemCracha,
    conselharNavegador: !!conselhoDoNavegador,
    pastaDispensada: semPasta,
  })

  /**
   * A grade abre a aula sozinha.
   *
   * É o fim da linha do "menos decisões": com o horário cadastrado, o professor
   * entra na sala e a chamada já está aberta — nem clique, nem crachá. As
   * recusas que tornam isso seguro estão em `abrirSozinho`.
   *
   * Um relógio de 30 s, e não só na montagem: a aula que começa com o app
   * aberto na mesa precisa abrir sem ninguém tocar em nada, que é o ponto.
   *
   * **Encerrar continua sendo do professor.** Abrir cedo demais não custa nada
   * — ninguém está encostando crachá —, mas fechar cedo demais custa um aluno.
   * Automatizar só o lado barato do erro.
   */
  useEffect(() => {
    if (sessao || rota !== 'pronto') return

    const olhar = async () => {
      const [aulas, vinculos] = await Promise.all([
        repositorio.listarAulas(),
        repositorio.listarVinculos(),
      ])
      const professor = vinculos.find((v) => v.papel === 'professor')
      if (!professor) return

      const agora = new Date()
      const turma = abrirSozinho(aulas, professor.uidHash, agora, encerradas())
      if (turma) await abrirChamada(turma, professor.uidHash, agora)
    }

    void olhar()
    const relogio = setInterval(() => void olhar(), 30_000)
    return () => clearInterval(relogio)
  }, [sessao, rota, repositorio, abrirChamada])

  const ligarPasta = async (escolhendo: boolean) => {
    const handle = escolhendo ? await escolherPasta() : await repositorio.lerPasta()
    if (!handle) return
    if ((await permissao(handle, true)) !== 'granted') return setEstadoDaPasta('sem_permissao')
    await repositorio.guardarPasta(handle)
    // Ele mudou de ideia: a dispensa some junto, senão o app seguiria achando
    // que ele não quer pasta enquanto grava numa.
    esquecerDispensaDaPasta()
    setSemPasta(false)
    setPasta(handle)
    setEstadoDaPasta('ligada')
  }

  return (
    <>
      {rota === 'problema' && <TelaDiagnostico />}
      {rota === 'pasta' && (
        <TelaPasta
          precisaDePermissao={estadoDaPasta === 'sem_permissao'}
          aoEscolher={() => void ligarPasta(true)}
          aoLiberar={() => void ligarPasta(false)}
          aoDispensar={() => {
            dispensarPasta()
            setSemPasta(true)
          }}
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
      {rota === 'turma' && <TelaVinculo aoMudarBase={mudou} />}
      {rota === 'cerimonia' && <TelaVinculo turmaInicial={turmaPendente} aoMudarBase={mudou} />}
      {rota === 'chamada' && sessao && (
        <TelaAula
          sessao={sessao}
          pendentes={pendentesDaTurma.filter((p) => p.turma === sessao.turma)}
          alunosDaTurma={
            matriculadosTodos.filter((p) => p.turma === sessao.turma && p.papel === 'aluno').length
          }
          aoMudarBase={mudou}
          aoRegistrar={gravarLinha}
          aoEncerrar={(presentes) => {
            // Sem esta marca o relógio reabriria a aula que acabou de fechar.
            marcarEncerrada(sessao.turma, new Date().toISOString())
            setResumo({ sessao, presentes })
          }}
        />
      )}
      {escolhendo && (
        <EscolherTurma
          opcoes={escolhendo.opcoes}
          motivo={escolhendo.motivo}
          aoDesistir={() => setEscolhendo(undefined)}
          aoEscolher={(turma) => {
            const pedido = escolhendo
            setEscolhendo(undefined)
            void abrirChamada(turma, pedido.uidHash, pedido.em)
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
        />
      )}

      {!resumo && rota === 'pronto' && !cadastrando && (
        <Repouso
          turmas={turmas}
          pendencias={pasta ? [] : pendencias}
          proxima={proxima}
          aoIniciar={() => void iniciarChamada()}
          aoSalvar={(turma) => void salvarCopia(turma)}
          aoAbrirCerimonia={() => setCadastrando(true)}
        />
      )}
      {!resumo && rota === 'pronto' && cadastrando && (
        <TelaVinculo
          turmaInicial={turmasAbertas[0]}
          aoMudarBase={mudou}
          aoSair={() => setCadastrando(false)}
        />
      )}

      {falhaNaPasta && (
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            {falhaNaPasta}. Nada se perdeu — está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button onClick={() => void consertarPasta()}>Gravar de novo</button>
        </div>
      )}

      {/* Engrenagem no canto superior direito, fixa, sempre no mesmo lugar.
          Diagnóstico e base são ferramentas de quem conserta, não de quem dá
          aula — como botões visíveis convidavam ao clique sem querer, e uma
          delas trocava o sal.

          O aviso ao lado **não é botão**: com a engrenagem a oito pixels dele,
          dois caminhos para o mesmo lugar só fazem duvidar de qual é o certo.
          Ele informa; ela abre. */}
      <div className="canto">
        {(falhaNaPasta || porSalvar > 0 || !lendo || !pasta) && (
          <span
            className={
              falhaNaPasta || porSalvar > 0 ? 'selo-status selo-status--grave' : 'selo-status'
            }
          >
            {pasta || falhaNaPasta || porSalvar > 0 ? (
              <span
                className={
                  falhaNaPasta || porSalvar > 0 ? 'ponto ponto--grave' : 'ponto ponto--alerta'
                }
              />
            ) : (
              <Cadeado />
            )}
            {falhaNaPasta
              ? 'A pasta não recebeu a gravação'
              : // Trabalho que só existe aqui vence os avisos de condição: os
                // outros descrevem o navegador, este descreve uma aula em risco.
                porSalvar > 0
                ? `${porSalvar} ${porSalvar === 1 ? 'registro ainda não salvo' : 'registros ainda não salvos'}`
                : !lendo
                  ? 'Nenhum leitor ativo'
                  : estadoDaPasta === 'indisponivel'
                    ? riscoDeApagar()
                      ? 'Sem pasta — o Safari pode apagar a base sozinho'
                      : 'Sem pasta neste navegador — exporte uma cópia'
                    : 'Os dados só existem neste navegador'}
          </span>
        )}

        {ensaio && ehSimulavel(leitor) && (
          <span className="selo-status" title="Modo de ensaio, com leitor simulado">
            <kbd>espaço</kbd> crachá · <kbd>P</kbd> professor
          </span>
        )}

        <button
          className="engrenagem"
          onClick={() => setFolha('ajustes')}
          aria-label="Ajustes"
          title="Ajustes"
        >
          <Engrenagem />
        </button>
      </div>

      {folha && (
        <Sheet titulo="Ajustes" aoFechar={() => setFolha(undefined)}>
          <TelaRepositorio
            pasta={pasta}
            aoTrocarPasta={() => void ligarPasta(true)}
            aoRelerPasta={async () => {
              const resumo = await restaurar(repositorio, pasta!)
              await recontar()
              return resumo
            }}
          />
          <TelaDiagnostico />
        </Sheet>
      )}
    </>
  )
}

/**
 * O repouso é onde o professor cai depois de encerrar — e por isso é o único
 * lugar onde uma aula esquecida pode ser lembrada. Antes daqui, "concluir sem
 * salvar" fazia a pendência sumir da tela e da memória do app ao mesmo tempo.
 *
 * A pendência empurra o "encoste o crachá" para baixo de propósito: enquanto
 * houver aula só neste navegador, ela é a tarefa da tela, e não um rodapé.
 */
export function Repouso({
  turmas,
  pendencias,
  proxima,
  aoIniciar,
  aoSalvar,
  aoAbrirCerimonia,
}: {
  turmas: number
  pendencias: Pendencia[]
  proxima?: { turma: string; quando: Date }
  aoIniciar: () => void
  aoSalvar: (turma: string) => void
  aoAbrirCerimonia: () => void
}) {
  const dia = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  /** "hoje às 08:00", "amanhã às 10:00", "segunda às 10:00". */
  function quandoPorExtenso(quando: Date): string {
    const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const meiaNoite = (d: Date) => new Date(d).setHours(0, 0, 0, 0)
    const dias = Math.round((meiaNoite(quando) - meiaNoite(new Date())) / 86_400_000)
    if (dias === 0) return `hoje às ${hora}`
    if (dias === 1) return `amanhã às ${hora}`
    return `${DIAS[quando.getDay()]} às ${hora}`
  }

  return (
    <section className="repouso">
      {pendencias.length > 0 && (
        <div className="porsalvar">
          <p className="porsalvar__titulo">
            {pendencias.length === 1
              ? 'Uma aula existe só neste navegador'
              : `${pendencias.length} aulas existem só neste navegador`}
          </p>
          {pendencias.map((p) => (
            <div className="porsalvar__linha" key={p.turma}>
              <span className="porsalvar__turma">
                <strong>{p.turma}</strong>
                <span className="porsalvar__apoio">
                  {p.quantos} {p.quantos === 1 ? 'registro' : 'registros'} desde {dia(p.desde)}
                </span>
              </span>
              <button className="botao--acento" onClick={() => aoSalvar(p.turma)}>
                Salvar
              </button>
            </div>
          ))}
        </div>
      )}

      <Ondas tamanho={72} animado />

      {proxima ? (
        <>
          {/* Com grade, a turma é o assunto e a hora é o apoio: é a ordem em
              que a pergunta se forma na cabeça de quem olha — "qual aula?" vem
              antes de "que horas?". */}
          <p className="repouso__turma">Sua próxima aula</p>
          <p className="repouso__acao">{proxima.turma}</p>
          <p className="repouso__quando">{quandoPorExtenso(proxima.quando)}</p>
        </>
      ) : (
        <>
          {/* Título é estado, botão é ação. Antes o título dizia "Começar a
              chamada" e o botão dizia "Iniciar a aula": duas tentativas de
              nomear o mesmo gesto, uma em cima da outra. */}
          <p className="repouso__turma">Tudo pronto</p>
          <p className="repouso__acao">
            {turmas === 1 ? 'Sua turma está cadastrada' : `${turmas} turmas cadastradas`}
          </p>
        </>
      )}

      {/* Com grade, o botão é a exceção — aula fora do horário, reposição — e
          por isso perde o acento. Sem grade, é a única ação da tela. */}
      <button
        className={proxima ? 'repouso__link botao--quieto' : 'botao--acento pasta__botao'}
        onClick={aoIniciar}
      >
        {proxima ? 'Começar a chamada agora' : 'Começar a chamada'}
      </button>
      {/* O crachá continua abrindo, e a tela **não** diz isso. Anunciar dois
          caminhos para a mesma coisa é a decisão que se queria evitar: quem lê
          "ou encoste o crachá" para para escolher, e escolher é o custo. Quem
          precisa do atalho descobre encostando. */}

      {/* Terciário, e por isso quieto. A regra do repouso: o único acento é
          "Iniciar a aula", e só quando não há grade. Com grade a tela é espera —
          e tela de espera com dois azuis embaixo pede para ser clicada. */}
      <button className="repouso__link botao--quieto" onClick={aoAbrirCerimonia}>
        Cadastrar mais um crachá
      </button>
    </section>
  )
}

function Sheet({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string
  aoFechar: () => void
  children: ReactNode
}) {
  // Sem Esc: no Safari em tela cheia ele sai da tela cheia. Sair daqui é
  // clicar fora ou no botão — dois gestos que funcionam em todo lugar.

  return (
    <div className="folha__fundo" onClick={aoFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header className="folha__topo">
          <h2>{titulo}</h2>
          <button onClick={aoFechar}>Fechar</button>
        </header>
        <div className="folha__corpo">{children}</div>
      </div>
    </div>
  )
}
