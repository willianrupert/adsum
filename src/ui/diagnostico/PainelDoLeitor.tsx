// Qual leitor está em uso, em que estado, e tudo o que ele diz de si. No modo
// de ensaio, encostar ou simular um crachá.

import { useState } from 'react'
import { ehConectavel, ehSimulavel, type DiagnosticoLeitor, type EstadoLeitor } from '../../portas/LeitorDeCracha.ts'
import { leitoresVisiveis, useAdsum } from '../adsum.ts'
import { Linha, Painel, Selo } from '../componentes/Painel.tsx'
import type { Tentar } from '../hooks/useTentativa.ts'

export function PainelDoLeitor({
  estado,
  diagnostico,
  ensaio,
  tentar,
}: {
  estado: EstadoLeitor
  diagnostico?: DiagnosticoLeitor
  ensaio: boolean
  tentar: Tentar
}) {
  const { leitor, leitorId, trocarLeitor } = useAdsum()
  const [uidManual, setUidManual] = useState('04a23b91')

  return (
    <Painel
      titulo="Leitor de crachá"
      recolhivel
      legenda="De onde vêm os UIDs."
      acoes={
        <>
          <button onClick={tentar('Iniciar', () => leitor.iniciar())}>Iniciar</button>
          <button onClick={tentar('Parar', () => leitor.parar())}>Parar</button>
          {ehConectavel(leitor) && (
            <button onClick={tentar('Conectar leitor USB', () => leitor.conectar())}>Conectar leitor USB</button>
          )}
        </>
      }
    >
      <Linha rotulo="adaptador">
        <div className="segmentado" role="group">
          {leitoresVisiveis().map((opcao) => (
            <button
              key={opcao.id}
              className={opcao.id === leitorId ? 'segmento segmento--ativo' : 'segmento'}
              onClick={tentar(`Trocar para ${opcao.nome}`, () => trocarLeitor(opcao.id))}
            >
              {opcao.nome}
            </button>
          ))}
        </div>
      </Linha>
      <Linha rotulo="estado">
        <Selo tom={estado === 'lendo' ? 'ok' : estado === 'erro' ? 'grave' : 'neutro'}>{estado}</Selo>
      </Linha>
      {diagnostico?.motivo && (
        <Linha rotulo="indisponível porque">
          <Selo tom="alerta">{diagnostico.motivo}</Selo>
        </Linha>
      )}
      {diagnostico &&
        Object.entries(diagnostico.detalhes).map(([k, v]) => (
          <Linha key={k} rotulo={k}>
            <code>{v}</code>
          </Linha>
        ))}

      {ensaio && ehSimulavel(leitor) && (
        <div className="ferramentas">
          <button onClick={tentar('Encostar crachá', () => void leitor.encostarProximo())}>
            Encostar próximo crachá
          </button>
          <span className="ferramentas__ou">ou</span>
          <input
            value={uidManual}
            onChange={(e) => setUidManual(e.target.value)}
            spellCheck={false}
            aria-label="UID em hexadecimal"
          />
          <button onClick={tentar('Simular', () => leitor.simular(uidManual))}>Simular</button>
        </div>
      )}
    </Painel>
  )
}
