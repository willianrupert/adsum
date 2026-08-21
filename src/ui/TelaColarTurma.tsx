// Colar a lista do SIGAA e dar nome à turma. Só isso.
//
// Chamar nomes e vincular crachás não é mais tarefa desta tela — é
// `TelaAula.tsx`, porque "a cerimônia é a primeira chamada" deixou de ser só
// uma frase. Depois de salvar, a rota decide sozinha o que vem a seguir
// (cronograma, ou a sessão abrindo com a turma inteira pendente).

import { useCallback, useState } from 'react'
import { prepararLista } from '../nucleo/nomes.ts'
import { interpretarParticipantes } from '../nucleo/sigaa.ts'
import { abrirVarios } from '../ambiente/arquivos.ts'
import { pastaDisponivel } from '../ambiente/pasta.ts'
import { restaurarDeArquivos } from '../ambiente/sincronia.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { useAdsum } from './adsum.ts'
import { ComoCopiar } from './componentes/ComoCopiar.tsx'

function comoMatriculado(turma: string, p: { completo: string; matricula: string; nome: string; papel: Matriculado['papel'] }): Matriculado {
  return {
    turma,
    chave: p.matricula || p.completo.toLowerCase(),
    matricula: p.matricula,
    nomeCompleto: p.completo,
    nome: p.nome,
    papel: p.papel,
  }
}

export function TelaColarTurma({
  aoMudarBase,
  aoSair,
}: {
  /** Chamado depois de salvar a turma — quem conta pendências e horário
      precisa saber que ela existe. */
  aoMudarBase?: () => void
  /**
   * Volta para o repouso sem colar nada. Só existe quando há repouso pra
   * onde voltar: na primeira turma de todas (`turmas === 0`) esta tela é a
   * única que existe, e cancelar não levaria a lugar nenhum.
   */
  aoSair?: () => void
} = {}) {
  const { repositorio } = useAdsum()

  const [turma, setTurma] = useState('')
  const [colado, setColado] = useState('')
  const [problemas, setProblemas] = useState<string[]>([])
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave' | 'alerta'; texto: string }>()

  const abrirPastaExistente = useCallback(async () => {
    const arquivos = await abrirVarios()
    if (arquivos.length === 0) return
    const { arquivos: lidos, problemas: falhas } = await restaurarDeArquivos(repositorio, arquivos)
    setProblemas(falhas)
    if (lidos.length === 0) {
      setRecado({ tom: 'grave', texto: 'Nenhum arquivo do Adsum entre os escolhidos.' })
      return
    }
    setRecado({ tom: 'ok', texto: `${lidos.length} arquivos lidos.` })
    aoMudarBase?.()
  }, [repositorio, aoMudarBase])

  const interpretar = useCallback(async () => {
    if (!turma.trim()) {
      setRecado({ tom: 'grave', texto: 'Dê um nome à turma antes — a lista é guardada por turma.' })
      return
    }

    const leitura = interpretarParticipantes(colado)
    setProblemas(leitura.problemas)

    if (leitura.pessoas.length === 0) {
      setRecado({ tom: 'grave', texto: 'Nenhuma pessoa reconhecida nessa colagem.' })
      return
    }

    const preparados = prepararLista(leitura.pessoas)
    const nomeDaTurma = turma.trim()
    await repositorio.salvarTurma(
      nomeDaTurma,
      preparados.map((p) => comoMatriculado(nomeDaTurma, p)),
    )
    aoMudarBase?.()

    const docentes = preparados.filter((p) => p.papel === 'professor').length
    const ambiguos = preparados.filter((p) => p.ambiguo).length

    setRecado({
      tom: docentes === 0 || ambiguos > 0 ? 'alerta' : 'ok',
      texto:
        `${preparados.length} pessoas, ${docentes === 1 ? '1 professor' : `${docentes} professores`}.` +
        (docentes === 0 ? ' Ninguém marcado como professor — corrija na chamada, antes de encostar o primeiro crachá.' : '') +
        (ambiguos > 0 ? ` ${ambiguos} com nomes iguais — edite antes de chamar.` : ''),
    })
  }, [colado, turma, repositorio, aoMudarBase])

  return (
    <div className="diagnostico">
      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}

      {problemas.length > 0 && (
        <div className="aviso aviso--alerta">
          <strong>A leitura da página deixou coisas de fora:</strong>
          <ul className="manual__passos">
            {problemas.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="colagem">
        <h1 className="colagem__titulo">Cole sua turma</h1>
        <p className="colagem__nota">
          No SIGAA, abra Turma › Participantes e copie a página.
        </p>

        <textarea
          className="colagem__campo"
          value={colado}
          onChange={(e) => setColado(e.target.value)}
          placeholder="Cole aqui"
          aria-label="lista da turma"
        />

        <div className="colagem__acoes">
          <input
            value={turma}
            onChange={(e) => setTurma(e.target.value)}
            placeholder="IF685 · T01"
            aria-label="turma"
          />
          <button className="botao--acento pasta__botao" onClick={() => void interpretar()}>
            Continuar
          </button>
          {aoSair && (
            <button className="botao--quieto" onClick={aoSair}>
              Cancelar
            </button>
          )}
        </div>

        {/* Onde não há seletor de diretório — Safari, Firefox — o app não tem
            como saber que já existe uma pasta do Adsum no disco, e tratava
            quem já tem turma como se estivesse começando. Este caminho lê os
            arquivos escolhidos à mão. */}
        {!pastaDisponivel() && (
          <div className="colagem__acoes">
            <button onClick={() => void abrirPastaExistente()}>
              Já tenho uma pasta do Adsum
            </button>
          </div>
        )}

        <ComoCopiar />
      </section>
    </div>
  )
}
