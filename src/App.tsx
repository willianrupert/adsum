import { ProvedorAdsum } from './ui/ProvedorAdsum.tsx'
import { Fluxo } from './ui/Fluxo.tsx'
import { Vitrine } from './ui/Vitrine.tsx'

export default function App() {
  // A rota do app decide sozinha qual tela mostrar — ótimo para quem usa, ruim
  // para quem desenha. A vitrine mostra todas de uma vez, e só em
  // desenvolvimento: ela não vai para o site publicado.
  const naVitrine = import.meta.env.DEV && window.location.hash === '#/vitrine'

  return (
    <div className="app">
      <ProvedorAdsum>{naVitrine ? <Vitrine /> : <Fluxo />}</ProvedorAdsum>
    </div>
  )
}
