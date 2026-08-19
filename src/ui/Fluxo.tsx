// A casca do app. Não há menu: a rota decorre do estado (ver `nucleo/rota.ts`).
//
// Diagnóstico e Repositório deixaram de ser abas. Viraram folhas, alcançáveis
// por dois selos discretos no rodapé — quietos quando está tudo bem, e a tela
// inteira quando não está. Ninguém deve saber que existe uma tela de
// diagnóstico até precisar dela.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { decidirRota } from '../nucleo/rota.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { eventoDe, proximoEventoId, type Sessao } from '../nucleo/sessao.ts'
import { escolherTurma } from '../nucleo/grade.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { escolherPasta, pastaDisponivel, permissao } from '../ambiente/pasta.ts'
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
import { TelaResumo } from './TelaResumo.tsx'
import { EscolherTurma } from './componentes/EscolherTurma.tsx'
import { Cadeado, Engrenagem, Ondas } from './componentes/Simbolos.tsx'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
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
  const [falhaNaPasta, setFalhaNaPasta] = useState<string>()
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

  useEffect(() => leitor.aoMudarEstado((e) => setLendo(e === 'lendo')), [leitor])

  const recontar = useCallback(async () => {
    const [listaDeTurmas, matriculados, vinculos, aberta] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
      repositorio.sessaoAberta(),
    ])
    setSessao(aberta)
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
  const salvarCopia = useCallback(
    async (turma: string) => {
      const eventos = await repositorio.listarEventos()
      const daTurma = porTurma([...eventos].reverse()).get(turma) ?? []
      await salvarTexto(nomeDoArquivo(turma), paraCsv(daTurma))
    },
    [repositorio],
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

  const abrirAula = useCallback(
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

        // O relógio e a grade escolhem a turma. Só o caso ambíguo vira
        // pergunta — e antes disto, com duas turmas cadastradas, o crachá do
        // professor não fazia nada e a tela não dizia por quê.
        const [aulas, listaDeTurmas] = await Promise.all([
          repositorio.listarAulas(),
          repositorio.listarTurmas(),
        ])
        const escolha = escolherTurma(aulas, listaDeTurmas, uidHash, leitura.em)

        if (escolha.tipo === 'sem_turma') return
        if (escolha.tipo === 'perguntar') {
          return setEscolhendo({
            opcoes: escolha.opcoes,
            motivo: escolha.motivo,
            uidHash,
            em: leitura.em,
          })
        }

        await abrirAula(escolha.turma, uidHash, leitura.em)
      })()
    })
  }, [leitor, repositorio, config, sessao, mudou, abrirAula])

  // Ensaio sem hardware: espaço encosta o próximo crachá do baralho, e P
  // encosta o do professor — que é o que abre e fecha a aula. Sem isso, testar
  // o fluxo inteiro exigia caçar a carta certa no baralho.
  //
  // Só existe com leitor simulado. Com o dongle ligado, quem digita é ele.
  useEffect(() => {
    if (!ehSimulavel(leitor)) return
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
  }, [leitor, repositorio, config.salHex])

  const rota = decidirRota({
    ambienteQuebrado,
    pasta: estadoDaPasta,
    lendo,
    turmas,
    pendentes,
    aulaAberta: !!sessao,
    professorSemCracha,
  })

  const ligarPasta = async (escolhendo: boolean) => {
    const handle = escolhendo ? await escolherPasta() : await repositorio.lerPasta()
    if (!handle) return
    if ((await permissao(handle, true)) !== 'granted') return setEstadoDaPasta('sem_permissao')
    await repositorio.guardarPasta(handle)
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
        />
      )}
      {rota === 'turma' && <TelaVinculo aoMudarBase={mudou} />}
      {rota === 'cerimonia' && <TelaVinculo turmaInicial={turmaPendente} aoMudarBase={mudou} />}
      {rota === 'aula' && sessao && (
        <TelaAula
          sessao={sessao}
          pendentes={pendentesDaTurma.filter((p) => p.turma === sessao.turma)}
          alunosDaTurma={
            matriculadosTodos.filter((p) => p.turma === sessao.turma && p.papel === 'aluno').length
          }
          aoMudarBase={mudou}
          aoRegistrar={gravarLinha}
          aoEncerrar={(presentes) => setResumo({ sessao, presentes })}
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
            void abrirAula(turma, pedido.uidHash, pedido.em)
          }}
        />
      )}

      {resumo && (
        <TelaResumo
          sessao={resumo.sessao}
          presentes={resumo.presentes}
          arquivo={pasta ? `${pasta.name} ▸ ${caminhoDosRegistros(resumo.sessao.turma)}` : undefined}
          aoSalvarCopia={() => void salvarCopia(resumo.sessao.turma)}
          aoConcluir={() => setResumo(undefined)}
        />
      )}

      {!resumo && rota === 'pronto' && !cadastrando && (
        <Repouso turmas={turmas} aoAbrirCerimonia={() => setCadastrando(true)} />
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
        {(falhaNaPasta || !lendo || !pasta) && (
          <span className={falhaNaPasta ? 'selo-status selo-status--grave' : 'selo-status'}>
            {pasta || falhaNaPasta ? (
              <span className={falhaNaPasta ? 'ponto ponto--grave' : 'ponto ponto--alerta'} />
            ) : (
              <Cadeado />
            )}
            {falhaNaPasta
              ? 'A pasta não recebeu a gravação'
              : !lendo
                ? 'Nenhum leitor ativo'
                : estadoDaPasta === 'indisponivel'
                  ? 'Sem pasta neste navegador — exporte uma cópia'
                  : 'Os dados só existem neste navegador'}
          </span>
        )}

        {ehSimulavel(leitor) && (
          <span className="selo-status" title="Só com leitor simulado">
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
          <TelaRepositorio pasta={pasta} aoTrocarPasta={() => void ligarPasta(true)} />
          <TelaDiagnostico />
        </Sheet>
      )}
    </>
  )
}

function Repouso({ turmas, aoAbrirCerimonia }: { turmas: number; aoAbrirCerimonia: () => void }) {
  return (
    <section className="repouso">
      <Ondas tamanho={72} animado />
      <p className="repouso__turma">
        {turmas === 1 ? 'Sua turma está pronta' : `${turmas} turmas prontas`}
      </p>
      <p className="repouso__acao">Encoste o seu crachá</p>
      <button className="repouso__link" onClick={aoAbrirCerimonia}>
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
