import { ProvedorAdsum } from './ui/ProvedorAdsum.tsx'
import { TelaDiagnostico } from './ui/TelaDiagnostico.tsx'
import { TelaRepositorio } from './ui/TelaRepositorio.tsx'
import { TelaVinculo } from './ui/TelaVinculo.tsx'
import { ROTAS, useRota } from './ui/rotas.ts'

export default function App() {
  const [rota, ir] = useRota()

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho__marca">
          <img src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="32" height="32" />
          <div>
            <h1>Adsum</h1>
            <p>registro de frequência por leitura de crachá</p>
          </div>
        </div>

        <nav className="abas">
          {ROTAS.map((r) => (
            <button
              key={r.id}
              className={r.id === rota ? 'aba aba--ativa' : 'aba'}
              onClick={() => ir(r.id)}
            >
              {r.titulo}
            </button>
          ))}
        </nav>

        <p className="cabecalho__nota">
          Os dados ficam neste navegador — não há servidor, conta nem envio.
        </p>
      </header>

      <main>
        <ProvedorAdsum>
          {rota === 'repositorio' && <TelaRepositorio />}
          {rota === 'vinculo' && <TelaVinculo />}
          {rota === 'diagnostico' && <TelaDiagnostico />}
        </ProvedorAdsum>
      </main>

      <footer className="rodape">
        Adsum · CIn/UFPE — dados locais, apenas o UID público é lido
      </footer>
    </div>
  )
}
