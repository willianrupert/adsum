// O fim da aula.
//
// Antes, encerrar devolvia direto ao repouso — e a chamada que acabou de ser
// feita desaparecia sem uma palavra. Não é questão de comemorar: é que o
// professor precisa saber **quantos ficaram registrados** e **onde o arquivo
// está**, e essa é a única hora em que ele vai olhar.
//
// Com pasta, isto é confirmação de que não há passo nenhum: o arquivo já foi
// gravado, e `Concluir` é a ação. **Sem pasta, há um passo** — e ele é o único
// que separa a chamada de existir só num navegador com prazo. Aí a hierarquia
// se inverte: salvar vira a ação de acento e concluir vira a saída discreta.
// Um botão secundário para a única coisa que preserva a aula seria mentira de
// desenho.

import { useState } from 'react'
import { Contador } from './componentes/Contador.tsx'
import { nomeDoArquivo } from '../nucleo/csv.ts'
import type { ComoSalvou } from '../ambiente/arquivos.ts'
import { riscoDeApagar } from '../ambiente/instalacao.ts'
import type { Sessao } from '../nucleo/sessao.ts'

export function TelaResumo({
  sessao,
  presentes,
  arquivo,
  aoSalvarCopia,
  aoConcluir,
  aoReabrir,
}: {
  sessao: Sessao
  presentes: number
  /** Caminho na pasta, quando há pasta. */
  arquivo?: string
  aoSalvarCopia: () => Promise<ComoSalvou>
  aoConcluir: () => void
  /** Encerrar por engano acontece, e desfazer não pode custar uma aula. */
  aoReabrir?: () => void
}) {
  const [salvo, setSalvo] = useState<ComoSalvou>()

  const minutos = Math.max(
    1,
    Math.round((Date.now() - Date.parse(sessao.abertaEm)) / 60_000),
  )

  const guardar = () => void aoSalvarCopia().then(setSalvo)

  return (
    <section className="resumo">
      <p className="resumo__rotulo">Chamada encerrada · {sessao.turma}</p>

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
      ) : salvo === 'baixado' ? (
        // O Safari baixa **sem diálogo**, direto na pasta de downloads. Sem esta
        // linha o clique não produz sinal nenhum na tela, e o professor clica de
        // novo achando que falhou.
        <p className="resumo__arquivo">
          Está na sua pasta de downloads: <code>{nomeDoArquivo(sessao.turma)}</code>
        </p>
      ) : salvo === 'gravado' ? (
        <p className="resumo__arquivo">
          Gravado em <code>{nomeDoArquivo(sessao.turma)}</code>
        </p>
      ) : (
        <p className="resumo__arquivo resumo__arquivo--sem">
          {riscoDeApagar()
            ? 'Esta chamada existe só neste navegador, que apaga os dados do site depois de sete dias de uso sem você voltar aqui. Salve o arquivo agora.'
            : 'Esta chamada existe só neste navegador. Salve o arquivo antes de fechar.'}
        </p>
      )}

      <div className="resumo__acoes">
        {arquivo || salvo === 'gravado' || salvo === 'baixado' ? (
          <>
            <button className="botao--acento pasta__botao" onClick={aoConcluir}>
              Concluir
            </button>
            {!arquivo && <button onClick={guardar}>Salvar de novo</button>}
            {arquivo && <button onClick={guardar}>Salvar uma cópia</button>}
          </>
        ) : (
          <>
            <button className="botao--acento pasta__botao" onClick={guardar}>
              Salvar o arquivo
            </button>
            {/* Quieto: é a saída da única coisa que preserva a chamada. Azul
                aqui era o acento convidando a sair sem salvar, ao lado do
                acento que manda salvar — dois azuis, um deles apontando para a
                perda. */}
            <button className="botao--quieto" onClick={aoConcluir}>
              Concluir sem salvar
            </button>
          </>
        )}
      </div>

      {/* Encerrar por engano é fácil: o crachá do professor encerra, e ele
          também é o crachá de alguém que pode encostar sem pensar. Sem
          reabrir, a saída seria começar outra chamada — e aí a aula fica
          partida em dois arquivos, com dois horários de abertura.

          Reabrir grava um `abrir` novo no log, como qualquer abertura: o
          registro conta o que aconteceu, inclusive que foi reaberta. */}
      {aoReabrir && (
        <button className="repouso__link botao--quieto" onClick={aoReabrir}>
          Encerrei sem querer, reabrir a chamada
        </button>
      )}
    </section>
  )
}
