// Onde isto vai viver — a mesma pergunta que o Chrome responde pedindo a pasta.
//
// **A recomendação virou o título, em 20/08/2026.** Antes ela era o terceiro
// parágrafo, depois do caminho do menu, com o raciocínio de que mandar trocar de
// navegador presume que a pessoa tem outro. O professor que vai usar isso viu a
// tela e pediu mais ênfase, e ele tem razão: a diferença entre os dois arranjos
// não é de conforto.
//
//   Chrome — cada presença gravada no disco no instante em que acontece.
//            A janela de perda é zero, e não depende de ninguém lembrar.
//   Safari — a chamada existe só no navegador até alguém clicar em salvar,
//            e instalar só remove o prazo de sete dias; o clique continua.
//
// Instalar continua ali, logo abaixo, para quem vai ficar no Safari de qualquer
// jeito — que é o caso de quem não tem outro navegador, e continua atendido.
//
// Não há botão de instalar: `beforeinstallprompt` é do Chromium.
//
// Sobre a precisão do texto: o WebKit conta **sete dias de uso do Safari** sem
// interação com o site, não dias de calendário. Um mês sem abrir o Safari não
// gasta um dia sequer, e exagerar um risco verdadeiro é a forma mais rápida de
// o aviso deixar de ser levado a sério.

import type { Conselho } from '../ambiente/instalacao.ts'

export function TelaNavegador({
  conselho,
  aoDispensar,
}: {
  conselho: Conselho
  aoDispensar: () => void
}) {
  const instalavel = conselho.tipo === 'instalar'

  return (
    <section className="repouso">
      <p className="repouso__turma">Antes de começar</p>
      <p className="repouso__acao">Use o Chrome ou o Edge</p>

      <p className="pasta__nota">
        Lá cada presença é gravada numa pasta do seu computador{' '}
        <strong className="sem-quebra">na hora</strong>. Nada depende de você lembrar de
        salvar no fim da aula. É o arranjo mais seguro que existe para este programa, e a
        diferença não é pequena.
      </p>

      {instalavel && (
        <>
          {/* O plano B, e apresentado como tal. Quem só tem Safari continua
              atendido — instalar tira o prazo de sete dias, que é o risco maior
              deste navegador. O que não sai é o clique por aula. */}
          <p className="navegador__ou">Vai ficar no Safari?</p>

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
            Numa aba, o Safari apaga os dados deste site depois de sete dias de uso sem
            você voltar aqui. Instalado, ele guarda por fora do Safari. A chamada continua
            esperando um clique seu no fim de cada aula.
          </p>
          <p className="pasta__nota">
            Instale antes de cadastrar a turma: o app começa em branco.
          </p>
        </>
      )}

      <button className="repouso__link botao--quieto" onClick={aoDispensar}>
        {instalavel ? 'Continuar sem instalar' : 'Continuar assim'}
      </button>
    </section>
  )
}
