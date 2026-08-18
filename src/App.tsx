import { ProvedorAdsum } from './ui/ProvedorAdsum.tsx'
import { Fluxo } from './ui/Fluxo.tsx'

export default function App() {
  return (
    <div className="app">
      <ProvedorAdsum>
        <Fluxo />
      </ProvedorAdsum>
    </div>
  )
}
