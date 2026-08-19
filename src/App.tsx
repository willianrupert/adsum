import { useEffect, useState } from 'react'
import { ProvedorAdsum } from './ui/ProvedorAdsum.tsx'
import { Fluxo } from './ui/Fluxo.tsx'
import { Vitrine } from './ui/Vitrine.tsx'

export default function App() {
  // A rota do app decide sozinha qual tela mostrar — ótimo para quem usa, ruim
  // para quem desenha. A vitrine mostra todas de uma vez, e só em
  // desenvolvimento: ela não vai para o site publicado.
  //
  // Escuta `hashchange` porque ler o hash uma vez fazia `#/vitrine` só
  // funcionar recarregando a página — e quem está desenhando alterna entre as
  // duas o tempo todo.
  const [naVitrine, setNaVitrine] = useState(
    () => import.meta.env.DEV && window.location.hash === '#/vitrine',
  )

  useEffect(() => {
    const ouvir = () => setNaVitrine(import.meta.env.DEV && window.location.hash === '#/vitrine')
    window.addEventListener('hashchange', ouvir)
    return () => window.removeEventListener('hashchange', ouvir)
  }, [])

  return (
    <div className="app">
      <ProvedorAdsum>{naVitrine ? <Vitrine /> : <Fluxo />}</ProvedorAdsum>
    </div>
  )
}
