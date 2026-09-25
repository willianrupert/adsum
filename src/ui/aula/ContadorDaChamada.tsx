import type { LinhaDaChamada } from '../../nucleo/chamada.ts'
import { Contador } from '../componentes/Contador.tsx'

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * O número grande e as últimas leituras. Sem denominador: `41/60` exigiria
 * saber quantos deveriam vir. O feedback de cada crachá é a linha que chega
 * no topo, não uma comemoração.
 */
export function ContadorDaChamada({ presentes, linhas }: { presentes: number; linhas: LinhaDaChamada[] }) {
  return (
    <div className="coleta__corpo">
      <div className="coleta__contador">
        <p className="coleta__numero">
          <Contador valor={presentes} />
        </p>
        <p className="coleta__rotulo">{presentes === 1 ? 'presente' : 'presentes'}</p>
      </div>
      <ol className="coleta__lista">
        {linhas.length === 0 && <li className="coleta__vazio">Aproxime o crachá</li>}
        {linhas.map((l) => (
          <li key={l.chave} className={`coleta__linha coleta__linha--${l.tom}`}>
            <span>{l.nome}</span>
            <time>{hhmm(l.quando)}</time>
          </li>
        ))}
      </ol>
    </div>
  )
}
