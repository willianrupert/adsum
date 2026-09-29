// Lançar no SIGAA, nos Ajustes (`docs/08`): o favorito para arrastar e o
// histórico do que ele preencheu. A lista para passar à mão saiu em 29/09,
// por decisão do autor: "Ver presenças" já mostra quem faltou em cada aula.

import { useAdsum } from '../adsum.ts'
import { Painel } from '../componentes/Painel.tsx'
import { CartaoDoFavorito } from './CartaoDoFavorito.tsx'
import { HistoricoDoSigaa } from './HistoricoDoSigaa.tsx'

export function PainelLancarNoSigaa({ turmas }: { turmas: string[] }) {
  const { repositorio } = useAdsum()
  return (
    <Painel titulo="Lançar no SIGAA" recolhivel legenda="Um clique na planilha de frequência preenche as aulas.">
      <CartaoDoFavorito />
      <HistoricoDoSigaa turmas={turmas} repositorio={repositorio} />
    </Painel>
  )
}
