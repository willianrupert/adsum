// A tela inicial: a turma e o dia da próxima chamada, e um botão para começar.
//
// A grade só sugere qual turma aparece primeiro; as setas trocam, e o botão,
// o Enter ou o crachá do professor abrem exatamente o que está na tela. É
// também onde uma aula ainda não salva (sem pasta) é cobrada.

import { saudacao } from '../nucleo/horarios.ts'
import type { Pendencia } from '../nucleo/pendencias.ts'
import { Ondas } from './componentes/Simbolos.tsx'

export function Repouso({
  pendencias,
  nomeDoProfessor,
  listaDeTurmas,
  turmaSelecionada,
  agoraNaGrade,
  diaSelecionado,
  aoMudarTurma,
  aoEditarDia,
  aoIniciar,
  aoSalvar,
  aoVerPresencas,
  aoNovaTurma,
}: {
  /** Aulas que existem só no navegador (sem pasta). */
  pendencias: Pendencia[]
  /** De "Sou eu", na chamada. Vazio: saudação anônima. */
  nomeDoProfessor?: string
  listaDeTurmas: string[]
  /** A turma que "Começar a chamada" abre. */
  turmaSelecionada?: string
  /** A turma que a grade diz que tem aula agora: ganha o ponto azul. */
  agoraNaGrade?: string
  /** O dia da chamada, `AAAA-MM-DD` local. */
  diaSelecionado: string
  /** -1 volta, 1 avança, dando a volta nas pontas. */
  aoMudarTurma: (direcao: -1 | 1) => void
  aoEditarDia: (valor: string) => void
  aoIniciar: () => void
  aoSalvar: (turma: string) => void
  aoVerPresencas: () => void
  aoNovaTurma: () => void
}) {
  const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  const indice = turmaSelecionada ? listaDeTurmas.indexOf(turmaSelecionada) : -1

  return (
    <section className="repouso">
      {/* Aula por salvar vem antes de tudo: é a tarefa da tela enquanto existir. */}
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

      <p className="repouso__turma">
        {nomeDoProfessor ? `${saudacao(new Date())}, ${nomeDoProfessor.split(' ')[0]}` : saudacao(new Date())}
      </p>

      <div className="repouso__turma-nav">
        <button
          aria-label="turma anterior"
          onClick={() => aoMudarTurma(-1)}
          disabled={indice < 0 || listaDeTurmas.length < 2}
        >
          ←
        </button>
        <p className="repouso__acao">
          {turmaSelecionada ?? 'Nenhuma turma'}
          {turmaSelecionada && turmaSelecionada === agoraNaGrade && (
            <span className="repouso__agora" title="A grade diz que esta turma tem aula agora" aria-hidden="true" />
          )}
        </p>
        <button
          aria-label="próxima turma"
          onClick={() => aoMudarTurma(1)}
          disabled={indice < 0 || listaDeTurmas.length < 2}
        >
          →
        </button>
      </div>
      {listaDeTurmas.length > 1 && <p className="chamado__atalho">← e → trocam de turma</p>}

      {/* Só o dia: é uma chamada por turma por dia. Editável para lançar a
          chamada de um dia em que ela não foi feita. */}
      <input
        type="date"
        className="repouso__hora"
        value={diaSelecionado}
        onChange={(e) => aoEditarDia(e.target.value)}
        aria-label="dia da chamada"
      />

      {/* O crachá do professor também abre, e a tela não anuncia: dois
          caminhos escritos fazem a pessoa parar para escolher. */}
      <button className="botao--acento pasta__botao" onClick={aoIniciar} disabled={!turmaSelecionada}>
        Começar a chamada
      </button>
      <button className="repouso__link botao--quieto" onClick={aoVerPresencas}>
        Ver presenças
      </button>
      <button className="repouso__link botao--quieto" onClick={aoNovaTurma}>
        Cadastrar nova turma
      </button>
    </section>
  )
}
