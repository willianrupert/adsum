// Painel do Diagnóstico: liga o rig de teste (ESP32-S3, `ferramentas/rig-de-cracha/`)
// pela porta ponte, dispara a suíte física e mostra o resultado. Só existe no
// modo de ensaio — como `ehSimulavel`, é ferramenta de quem testa o app, nunca
// aparece pra quem dá aula.
//
// "Rodar suíte" abre uma janela auxiliar em branco (o mecanismo do cenário de
// perda de foco, em `ambiente/suiteFisica.ts`) — é esperado que o foco pisque
// por um instante durante a corrida. Fechar essa janela no meio interrompe só
// aquele cenário; os outros já rodaram e continuam no relatório.

import { useState } from 'react'
import { RigDeCracha } from '../ambiente/rigDeCracha.ts'
import { rodarSuiteFisica } from '../ambiente/suiteFisica.ts'
import type { ResultadoCenario } from '../nucleo/suiteDeTestes.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'

export function PainelDeTestesFisicos({
  leitor,
  leitorId,
  rig: rigInjetado,
}: {
  leitor: LeitorDeCracha
  leitorId: string
  /** Para teste. Em produção, sempre um `RigDeCracha` novo. */
  rig?: RigDeCracha
}) {
  const [rig] = useState(() => rigInjetado ?? new RigDeCracha())
  const [conectado, setConectado] = useState(false)
  const [conectando, setConectando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState<string>()
  const [resultados, setResultados] = useState<ResultadoCenario[]>()
  const [erro, setErro] = useState<string>()

  const conectar = async () => {
    setErro(undefined)
    setConectando(true)
    try {
      await rig.conectar()
      setConectado(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setConectando(false)
    }
  }

  const rodar = async () => {
    setErro(undefined)
    setResultados(undefined)
    setRodando(true)
    try {
      const resultado = await rodarSuiteFisica(rig, leitor, setProgresso)
      setResultados(resultado)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRodando(false)
      setProgresso(undefined)
    }
  }

  return (
    <Painel
      titulo="Testes físicos com o rig"
      legenda='ESP32-S3 fingindo o dongle de verdade — teclado, ritmo e foco de janela, sem dublê. Ver "ferramentas/rig-de-cracha".'
      recolhivel
    >
      <Linha rotulo="rig">
        <Selo tom={conectado ? 'ok' : 'neutro'}>{conectado ? 'conectado' : 'desconectado'}</Selo>
      </Linha>

      {!conectado && (
        <button disabled={conectando} onClick={() => void conectar()}>
          {conectando ? 'Conectando...' : 'Conectar rig de teste'}
        </button>
      )}

      {conectado && leitorId !== 'dongle' && (
        <p className="vazio">
          Troque o adaptador para &quot;Dongle USB&quot;, acima — só ele recebe teclado de verdade do sistema
          operacional, e é esse caminho que a suíte testa.
        </p>
      )}

      {conectado && leitorId === 'dongle' && (
        <button disabled={rodando} onClick={() => void rodar()}>
          {rodando ? 'Rodando...' : 'Rodar suíte (4 cenários, ~30 s)'}
        </button>
      )}

      {rodando && progresso && <p className="vazio">{progresso}</p>}

      {erro && (
        <div className="aviso aviso--grave">
          <strong>Não deu.</strong>
          <p>{erro}</p>
        </div>
      )}

      {resultados?.map((r) => (
        <Linha key={r.nome} rotulo={r.nome}>
          <Selo tom={r.aprovado ? 'ok' : 'grave'}>{r.aprovado ? 'passou' : 'falhou'}</Selo>
          {r.detalhe}
        </Linha>
      ))}
    </Painel>
  )
}
