// Onde isto vai viver — a mesma pergunta que o Chrome responde pedindo a pasta.
//
// O que muda é a resposta que cada navegador sabe dar, e é por isso que a tela
// tem duas caras em vez de um texto que serve para as duas. No WebKit existe
// conserto no lugar: instalar tira a base do Safari, e a ação é um caminho de
// menu ali mesmo. No Firefox não existe — não tem pasta, não apaga sozinho, e
// instalar não muda nada; o único ganho real é trocar de navegador.
//
// **A recomendação vem depois do que dá para fazer aqui.** Mandar trocar de
// navegador como primeira frase presume que a pessoa tem outro. Onde não há
// mais nada a fazer, ela é a primeira frase — porque aí é a única verdadeira.
//
// Não há botão de instalar: `beforeinstallprompt` é do Chromium.
//
// **Sobre a precisão do texto, revisada em 19/08/2026.** A versão anterior dizia
// "sete dias sem visita", e isso é mais duro do que a regra real: o WebKit conta
// **sete dias de uso do Safari** sem interação com o site. Um mês sem abrir o
// Safari não gasta um dia sequer. Exagerar um risco verdadeiro é a forma mais
// rápida de o aviso deixar de ser levado a sério.
//
// Também sumiu o "abre sozinho": que o ícone entra no Dock na hora está
// documentado, que a janela se abre por conta própria não — e a tela não precisa
// disso para nada.

import type { Conselho } from '../ambiente/instalacao.ts'

/** Um período, e é o que decide a escolha. Repetido nas duas telas de propósito. */
function NaHora() {
  return (
    <>
      cada presença é gravada numa pasta do seu computador <strong>na hora</strong>, sem
      depender de você lembrar de salvar
    </>
  )
}

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
          Lá <NaHora />. Aqui o Adsum guarda tudo dentro do navegador, e cada aula espera
          por um clique seu.
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
        Numa aba, o Safari apaga os dados deste site depois de sete dias de uso sem você
        voltar aqui. O app instalado guarda por fora do Safari.
      </p>
      <p className="pasta__nota">
        Instale antes de cadastrar a turma: ele começa em branco.
      </p>

      <p className="pasta__nota instalar__alternativa">
        Tem Chrome ou Edge? Lá é mais seguro ainda: <NaHora />.
      </p>

      <button className="repouso__link" onClick={aoDispensar}>
        Continuar sem instalar
      </button>
    </section>
  )
}
