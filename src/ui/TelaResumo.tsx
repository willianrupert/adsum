// O fim da aula.
//
// Antes, encerrar devolvia direto ao repouso — e a chamada que acabou de ser
// feita desaparecia sem uma palavra. Não é questão de comemorar: é que o
// professor precisa saber **quantos ficaram registrados** e **onde o arquivo
// está**, e essa é a única hora em que ele vai olhar.
//
// Uma tela, três informações e uma saída. O arquivo já foi gravado — isto não
// é um passo de salvar, é a confirmação de que não há passo nenhum.

import { Contador } from './componentes/Contador.tsx'
import type { Sessao } from '../nucleo/sessao.ts'

export function TelaResumo({
  sessao,
  presentes,
  arquivo,
  aoSalvarCopia,
  aoConcluir,
}: {
  sessao: Sessao
  presentes: number
  /** Caminho na pasta, quando há pasta. */
  arquivo?: string
  aoSalvarCopia: () => void
  aoConcluir: () => void
}) {
  const minutos = Math.max(
    1,
    Math.round((Date.now() - Date.parse(sessao.abertaEm)) / 60_000),
  )

  return (
    <section className="resumo">
      <p className="resumo__rotulo">Aula encerrada · {sessao.turma}</p>

      <p className="resumo__numero">
        <Contador valor={presentes} />
      </p>
      <p className="resumo__unidade">
        {presentes === 1 ? 'presença registrada' : 'presenças registradas'} em {minutos}{' '}
        {minutos === 1 ? 'minuto' : 'minutos'}
      </p>

      {arquivo ? (
        <p className="resumo__arquivo">
          Já está gravado em <code>{arquivo}</code>
        </p>
      ) : (
        <p className="resumo__arquivo resumo__arquivo--sem">
          Os dados estão só neste navegador. Guarde uma cópia antes de fechar.
        </p>
      )}

      <div className="resumo__acoes">
        <button className="botao--acento pasta__botao" onClick={aoConcluir}>
          Concluir
        </button>
        <button onClick={aoSalvarCopia}>Salvar uma cópia</button>
      </div>
    </section>
  )
}
