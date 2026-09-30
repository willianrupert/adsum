// A pergunta da turma, quando a planilha não basta para achá-la sozinha.

import { confirmarTurma } from '../../ambiente/preferencias.ts'

export type Pergunta = { candidatas: string[] } | { confirmar: string; codigo: string }

/** A planilha não basta para achar a turma: o professor diz qual é, num toque. */
export function TelaDaPergunta({ pergunta, escolher, recusar }: { pergunta: Pergunta; escolher: (turma: string) => void; recusar: () => void }) {
  if ('confirmar' in pergunta) {
    const { confirmar, codigo } = pergunta
    return (
      <main className="folha-sigaa">
        <h1>{`Esta planilha é de ${codigo}`}</h1>
        <p className="folha-sigaa__apoio">{`A turma ${confirmar} do Adsum tem as mesmas matrículas, mas o nome não traz ${codigo}.`}</p>
        <button
          className="botao--acento folha-sigaa__acao"
          onClick={() => {
            confirmarTurma(codigo, confirmar)
            escolher(confirmar)
          }}
        >
          {`Usar ${confirmar}`}
        </button>
        <button className="botao--quieto" onClick={recusar}>
          Não é esta
        </button>
      </main>
    )
  }
  return (
    <main className="folha-sigaa">
      <h1>Qual é a turma desta planilha?</h1>
      <p className="folha-sigaa__apoio">Mais de uma turma do Adsum tem as matrículas desta planilha.</p>
      {pergunta.candidatas.map((turma) => (
        <button key={turma} className="cartao folha-sigaa__turma" onClick={() => escolher(turma)}>
          {turma}
        </button>
      ))}
    </main>
  )
}
