import { useEffect, useState } from 'react'
import { ProvedorAdsum } from './ui/ProvedorAdsum.tsx'
import { Fluxo } from './ui/Fluxo.tsx'
import { Vitrine } from './ui/Vitrine.tsx'
import { JanelaSigaa } from './ui/sigaa/JanelaSigaa.tsx'

export default function App() {
  // A rota do app decide sozinha qual tela mostrar — ótimo para quem usa, ruim
  // para quem quer conhecer o programa antes de usá-lo. A vitrine mostra todas
  // de uma vez, e **vai ao ar**: é como um professor vê o Adsum inteiro sem
  // cadastrar turma nenhuma, e como opina sobre uma tela que talvez só
  // encontrasse no meio de uma aula.
  //
  // Ninguém cai nela por acaso — está atrás de um hash que só quem recebe o
  // endereço digita. E as duas telas que mexem na base de verdade ficam de fora
  // fora de desenvolvimento; ver `Vitrine.tsx`.
  //
  // Escuta `hashchange` porque ler o hash uma vez fazia `#/vitrine` só
  // funcionar recarregando a página — e quem está desenhando alterna entre as
  // duas o tempo todo.
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const ouvir = () => setHash(window.location.hash)
    window.addEventListener('hashchange', ouvir)
    return () => window.removeEventListener('hashchange', ouvir)
  }, [])

  // A janela do favorito do SIGAA não monta o provedor: não liga leitor nem
  // fecha a chamada da janela principal. Ver `abrirBaseDaJanelaSigaa`.
  if (hash === '#/sigaa') {
    return (
      <div className="app">
        <JanelaSigaa />
      </div>
    )
  }

  return (
    <div className="app">
      <ProvedorAdsum>{hash === '#/vitrine' ? <Vitrine /> : <Fluxo />}</ProvedorAdsum>
    </div>
  )
}
