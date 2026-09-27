// Recomeçar do zero. O texto importa mais que o botão: a base deste navegador
// some, os arquivos da pasta ficam, e quem não souber disso erra nos dois
// sentidos.

import { Painel } from '../componentes/Painel.tsx'
import { confirmarOuCancelar, type Tentar } from '../hooks/useTentativa.ts'

export function PainelRecomecar({ tentar, aoResetar }: { tentar: Tentar; aoResetar: () => Promise<void> }) {
  return (
    <Painel titulo="Recomeçar do zero" recolhivel legenda="Devolve este navegador ao estado de quem nunca abriu o Adsum.">
      <p className="ferramentas__nota">
        Apaga <strong>deste navegador</strong>: turmas, crachás vinculados, grade
        horária, registros de presença e as preferências (leitor escolhido, avisos
        dispensados). O segredo desta instalação some junto, e com ele os crachás
        deixam de ser reconhecíveis.
      </p>
      <p className="ferramentas__nota ferramentas__nota--forte">
        Não apaga os arquivos da pasta. Eles continuam onde estão, e reescolher a
        pasta depois traz tudo de volta — inclusive o segredo. Para apagar de
        verdade, apague a pasta você mesmo, no Finder.
      </p>
      <div className="ferramentas">
        <button
          className="botao--grave"
          onClick={tentar('Recomeçar', async () => {
            confirmarOuCancelar('Apagar a base deste navegador? Os arquivos da pasta continuam onde estão.')
            await aoResetar()
            return 'pronto. O Adsum vai recomeçar.'
          })}
        >
          Apagar a base deste navegador
        </button>
      </div>
    </Painel>
  )
}
