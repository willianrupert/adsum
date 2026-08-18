// A casca do app. Não há menu: a rota decorre do estado (ver `nucleo/rota.ts`).
//
// Diagnóstico e Repositório deixaram de ser abas. Viraram folhas, alcançáveis
// por dois selos discretos no rodapé — quietos quando está tudo bem, e a tela
// inteira quando não está. Ninguém deve saber que existe uma tela de
// diagnóstico até precisar dela.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { decidirRota } from '../nucleo/rota.ts'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { useAdsum } from './adsum.ts'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaVinculo } from './TelaVinculo.tsx'

type Folha = 'diagnostico' | 'repositorio'

export function Fluxo() {
  const { leitor, repositorio } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const [turmas, setTurmas] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [turmaPendente, setTurmaPendente] = useState<string>()
  const [folha, setFolha] = useState<Folha>()

  const ambienteQuebrado = levantarCapacidades().some((c) => c.peso === 'essencial' && !c.presente)

  useEffect(() => leitor.aoMudarEstado((e) => setLendo(e === 'lendo')), [leitor])

  const recontar = useCallback(async () => {
    const [listaDeTurmas, matriculados, vinculos] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
    ])
    const comCracha = new Set(vinculos.map((v) => v.login).filter(Boolean))
    const faltando = matriculados.filter((m) => !comCracha.has(m.login))
    setTurmas(listaDeTurmas.length)
    setPendentes(faltando.length)
    setTurmaPendente(faltando[0]?.turma)
  }, [repositorio])

  useEffect(() => {
    void recontar()
  }, [recontar])

  // Não se reconta ao ouvir o crachá: a gravação acontece depois, e contar
  // antes dela devolveria a pendência que acabou de deixar de existir. Quem
  // grava avisa, e é isso que faz a tela sair sozinha da cerimônia para o
  // repouso sem ninguém clicar em nada.

  const rota = decidirRota({ ambienteQuebrado, lendo, turmas, pendentes })

  return (
    <>
      {rota === 'problema' && <TelaDiagnostico />}
      {rota === 'turma' && <TelaVinculo aoMudarBase={recontar} />}
      {rota === 'cerimonia' && (
        <TelaVinculo turmaInicial={turmaPendente} aoMudarBase={recontar} />
      )}
      {rota === 'pronto' && <Repouso turmas={turmas} aoAbrirCerimonia={() => setFolha(undefined)} />}

      <footer className="selos">
        <button className="selo-status" onClick={() => setFolha('diagnostico')}>
          <span className={lendo ? 'ponto ponto--ok' : 'ponto ponto--alerta'} />
          leitor
        </button>
        <button className="selo-status" onClick={() => setFolha('repositorio')}>
          <span className="ponto ponto--ok" />
          base
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
