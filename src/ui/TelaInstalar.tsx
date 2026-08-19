// Instalar, no lugar onde o Chrome pede a pasta.
//
// A simetria é proposital: nos dois navegadores a primeira pergunta é a mesma —
// onde isto vai viver. O que muda é a resposta que cada um sabe dar.
//
// Não há botão de instalar porque o Safari não expõe nenhum: `beforeinstallprompt`
// é do Chromium. A tela ensina o caminho do menu, e o passo largo em cima é o
// que faz uma instrução parecer a ação da tela em vez de nota de rodapé.

import type { ComoInstalar } from '../ambiente/instalacao.ts'

export function TelaInstalar({
  como,
  aoDispensar,
}: {
  como: ComoInstalar
  aoDispensar: () => void
}) {
  return (
    <section className="repouso">
      <p className="repouso__turma">Antes de começar</p>
      <p className="repouso__acao">Instale o Adsum</p>

      <p className="instalar__caminho">
        <span className="instalar__onde">{como.onde}</span>
        {como.passos.map((passo, i) => (
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
        Este navegador apaga os dados de sites depois de sete dias sem visita — e
        levaria a turma junto. Instalado, o Adsum sai do Safari, ganha janela e
        armazenamento próprios, e essa contagem não corre mais.
      </p>
      <p className="pasta__nota">
        Ao adicionar, o Adsum abre sozinho numa janela própria — é lá que você trabalha, e
        esta aba pode fechar. Faça isso <strong>antes</strong> de cadastrar a turma: o
        armazenamento é separado, e o app instalado começa em branco.
      </p>

      <button className="repouso__link" onClick={aoDispensar}>
        Continuar sem instalar
      </button>
    </section>
  )
}
