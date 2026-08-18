// A casca do app. Não há menu: a rota decorre do estado (ver `nucleo/rota.ts`).
//
// Diagnóstico e Repositório deixaram de ser abas. Viraram folhas, alcançáveis
// por dois selos discretos no rodapé — quietos quando está tudo bem, e a tela
// inteira quando não está. Ninguém deve saber que existe uma tela de
// diagnóstico até precisar dela.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { decidirRota } from '../nucleo/rota.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { decidir, eventoDe, proximoEventoId, type Sessao } from '../nucleo/sessao.ts'
import { tocar } from '../ambiente/som.ts'
import { escolherPasta, pastaDisponivel, permissao } from '../ambiente/pasta.ts'
import { acrescentarNoLog, repararLog, restaurar, sincronizar } from '../ambiente/sincronia.ts'
import type { EstadoDaPasta } from '../nucleo/rota.ts'
import { TelaColeta } from './TelaColeta.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { useAdsum } from './adsum.ts'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaVinculo } from './TelaVinculo.tsx'

type Folha = 'diagnostico' | 'repositorio'

export function Fluxo() {
  const { leitor, repositorio, config } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const [turmas, setTurmas] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [turmaPendente, setTurmaPendente] = useState<string>()
  const [sessao, setSessao] = useState<Sessao>()
  const [turmas1, setTurmas1] = useState<string>()
  const [pasta, setPasta] = useState<FileSystemDirectoryHandle>()
  const [estadoDaPasta, setEstadoDaPasta] = useState<EstadoDaPasta>(
    pastaDisponivel() ? 'sem_pasta' : 'indisponivel',
  )
  const [falhaNaPasta, setFalhaNaPasta] = useState<string>()
  const [folha, setFolha] = useState<Folha>()

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
    setTurmas1(listaDeTurmas.length === 1 ? listaDeTurmas[0] : undefined)
    const comCracha = new Set(vinculos.map((v) => v.matricula).filter(Boolean))
    const faltando = matriculados.filter((m) => !m.matricula || !comCracha.has(m.matricula))
    setTurmas(listaDeTurmas.length)
    setPendentes(faltando.length)
    setTurmaPendente(faltando[0]?.turma)
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

        const decisao = decidir(uidHash, {
          vinculo,
          jaPresentes: new Set(),
          agora: leitura.em,
          turmaSugerida: turmas1,
        })
        if (decisao.tipo !== 'abrir') return

        const total = await repositorio.contarEventos()
        const evento = eventoDe(decisao, {
          eventoId: proximoEventoId(config.aparelhoId, leitura.em, total + 1),
          quando: leitura.em,
          turma: decisao.turma,
          uidHash,
        })
        if (evento) {
          await repositorio.acrescentarEvento(evento)
          await gravarLinha(evento)
        }
        await repositorio.abrirSessao({
          turma: decisao.turma,
          abertaEm: leitura.em.toISOString(),
          uidHashProfessor: uidHash,
        })
        tocar('sessao')
        await mudou()
      })()
    })
  }, [leitor, repositorio, config, sessao, turmas1, mudou, gravarLinha])

  const rota = decidirRota({
    ambienteQuebrado,
    pasta: estadoDaPasta,
    lendo,
    turmas,
    pendentes,
    aulaAberta: !!sessao,
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
      {rota === 'coleta' && sessao && (
        <TelaColeta
          sessao={sessao}
          aoMudarBase={recontar}
          aoRegistrar={gravarLinha}
        />
      )}
      {rota === 'pronto' && <Repouso turmas={turmas} aoAbrirCerimonia={() => setFolha(undefined)} />}

      {falhaNaPasta && (
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            {falhaNaPasta}. Nada se perdeu — está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button onClick={() => void consertarPasta()}>gravar de novo</button>
        </div>
      )}

      <footer className="selos">
        <button className="selo-status" onClick={() => setFolha('diagnostico')}>
          <span className={lendo ? 'ponto ponto--ok' : 'ponto ponto--alerta'} />
          leitor
        </button>
        <button className="selo-status" onClick={() => setFolha('repositorio')}>
          <span
            className={
              falhaNaPasta
                ? 'ponto ponto--grave'
                : pasta
                  ? 'ponto ponto--ok'
                  : 'ponto ponto--alerta'
            }
          />
          {falhaNaPasta ? 'pasta com erro' : pasta ? 'pasta' : 'só neste navegador'}
        </button>
      </footer>

      {folha && (
        <Sheet titulo={folha === 'diagnostico' ? 'Diagnóstico' : 'Base'} aoFechar={() => setFolha(undefined)}>
          {folha === 'diagnostico' ? <TelaDiagnostico /> : <TelaRepositorio />}
        </Sheet>
      )}
    </>
  )
}

function Repouso({ turmas, aoAbrirCerimonia }: { turmas: number; aoAbrirCerimonia: () => void }) {
  return (
    <section className="repouso">
      <p className="repouso__turma">
        {turmas === 1 ? 'Sua turma está pronta' : `${turmas} turmas prontas`}
      </p>
      <p className="repouso__acao">Encoste seu crachá</p>
      <button className="repouso__link" onClick={aoAbrirCerimonia}>
        cadastrar mais um crachá
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
  useEffect(() => {
    const escutar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', escutar)
    return () => window.removeEventListener('keydown', escutar)
  }, [aoFechar])

  return (
    <div className="folha__fundo" onClick={aoFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header className="folha__topo">
          <h2>{titulo}</h2>
          <button onClick={aoFechar}>fechar</button>
        </header>
        <div className="folha__corpo">{children}</div>
      </div>
    </div>
  )
}
