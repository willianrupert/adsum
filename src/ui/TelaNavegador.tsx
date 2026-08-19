// Onde isto vai viver — a mesma pergunta que o Chrome responde pedindo a pasta.
//
// O que muda é a resposta que cada navegador sabe dar, e é por isso que a tela
// tem duas caras em vez de um texto que serve para as duas. No WebKit existe
// conserto no lugar: instalar tira o prazo de sete dias, e a ação é um caminho
// de menu ali mesmo. No Firefox não existe — não tem pasta, não apaga sozinho,
// e instalar não muda nada; o único ganho real é trocar de navegador, e
// oferecer outra coisa como se resolvesse seria mentira.
//
// **A recomendação vem depois do que dá para fazer aqui.** Mandar trocar de
// navegador como primeira frase presume que a pessoa tem outro. Onde não há
// mais nada a fazer, ela é a primeira frase — porque aí é a única verdadeira.
//
// Não há botão de instalar: `beforeinstallprompt` é do Chromium. A tela ensina
// o caminho do menu, e o peso vem do tamanho e do espaço.

import type { Conselho } from '../ambiente/instalacao.ts'

// O motivo é o mesmo nas duas telas, mas a frase não pode ser: numa ele vem
// depois de nomear o Chrome ("lá"), na outra ele **é** a abertura. Compartilhar
// o texto deixava um "lá" sem antecedente — abstrair prosa por ela se repetir é
// como se escreve frase que não fecha.

export function TelaNavegador({
  conselho,
  aoDispensar,
}: {
  conselho: Conselho
  aoDispensar: () => void
}) {
  if (conselho.tipo === 'trocar') {
    return (
      <section className="repouso">
        <p className="repouso__turma">Antes de começar</p>
        <p className="repouso__acao">Use o Chrome ou o Edge</p>
        <p className="pasta__nota">
          No Chrome ou no Edge, cada presença é gravada no seu computador{' '}
          <strong>na hora</strong>. Aqui o Adsum guarda tudo internamente, e cada aula
          depende de você lembrar de salvar.
        </p>
        <button className="repouso__link" onClick={aoDispensar}>
          Continuar assim
        </button>
      </section>
    )
  }

  return (
    <section className="repouso">
      <p className="repouso__turma">Antes de começar</p>
      <p className="repouso__acao">Instale o Adsum</p>

      <p className="instalar__caminho">
        <span className="instalar__onde">{conselho.onde}</span>
        {conselho.passos.map((passo, i) => (
          <span className="instalar__passo" key={passo}>
            {i > 0 && (
              <span className="instalar__seta" aria-hidden="true">
                ›
              </span>
            )}
            {passo}
          </span>
        ))}
      </p>

      <p className="pasta__nota">
        Este navegador apaga os dados de sites depois de sete dias sem visita, e a turma
        vai junto. Instalado, o Adsum sai do Safari e essa contagem não corre — faça isso{' '}
        <strong>antes</strong> de cadastrar a turma, porque o app instalado começa em
        branco.
      </p>

      <p className="pasta__nota instalar__alternativa">
        Mais seguro ainda: <strong>Chrome ou Edge.</strong> Lá cada presença é gravada no
        seu computador <strong>na hora</strong> — aqui, uma vez por aula, você salva.
      </p>

      <button className="repouso__link" onClick={aoDispensar}>
        Continuar sem instalar
      </button>
    </section>
  )
}
