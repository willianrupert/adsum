// O Diagnóstico: toda regra precisa de voz na tela, e aqui cada peça diz se
// está lá e como está. Cada painel mora em `ui/diagnostico/`; aqui ficam os
// dados que eles compartilham e a ordem em que aparecem.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { semDono } from '../ambiente/diario.ts'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { modoDev } from '../ambiente/preferencias.ts'
import { uidLegivel, uidParaHex } from '../nucleo/uid.ts'
import type { Aula, Evento, Matriculado, Vinculo } from '../nucleo/tipos.ts'
import { ehSimulavel, type DiagnosticoLeitor, type EstadoLeitor } from '../portas/LeitorDeCracha.ts'
import { identificarCracha, vinculosSemSal, type DiagnosticoRepositorio } from '../portas/Repositorio.ts'
import { useAdsum } from './adsum.ts'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'
import { PainelAmbiente } from './diagnostico/PainelAmbiente.tsx'
import { PainelDeRegistros } from './diagnostico/PainelDeRegistros.tsx'
import { PainelDoLeitor } from './diagnostico/PainelDoLeitor.tsx'
import { PainelEstadoDoApp } from './diagnostico/PainelEstadoDoApp.tsx'
import {
  PainelCodigosDosCrachas,
  PainelDiario,
  PainelDoSegredo,
  PainelModoDeEnsaio,
} from './diagnostico/PaineisDaPasta.tsx'
import { PainelChamadasRecentes, PainelUltimasLeituras, type LeituraNaTela } from './diagnostico/PaineisDeLeitura.tsx'
import { semear } from './diagnostico/semear.ts'
import { useTentativa } from './hooks/useTentativa.ts'
import { PainelDeTestesFisicos } from './PainelDeTestesFisicos.tsx'

export function TelaDiagnostico() {
  const { leitor, leitorId, repositorio, config } = useAdsum()
  const ensaio = useMemo(modoDev, [])
  const essenciaisFaltando = useMemo(
    () => levantarCapacidades().filter((c) => c.peso === 'essencial' && !c.presente),
    [],
  )

  const [estadoLeitor, setEstadoLeitor] = useState<EstadoLeitor>(leitor.estado())
  const [diagLeitor, setDiagLeitor] = useState<DiagnosticoLeitor>()
  const [diagRepo, setDiagRepo] = useState<DiagnosticoRepositorio>()
  const [leituras, setLeituras] = useState<LeituraNaTela[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [turmas, setTurmas] = useState<string[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [importacao, setImportacao] = useState<Resultado>()
  /** Crachás cujo sal não está no chaveiro. Ver `vinculosSemSal`. */
  const [semSal, setSemSal] = useState<Vinculo[]>([])

  useEffect(() => {
    setEstadoLeitor(leitor.estado())
    setLeituras([])
  }, [leitor])

  const atualizar = useCallback(async () => {
    const [dl, dr, ev, t, a, m, te] = await Promise.all([
      leitor.diagnostico(),
      repositorio.diagnostico(),
      repositorio.listarEventos({ limite: 6 }),
      repositorio.listarTurmas(),
      repositorio.listarAulas(),
      repositorio.listarMatriculados(),
      repositorio.contarEventos(),
    ])
    setSemSal(await vinculosSemSal(repositorio, config))
    setDiagLeitor(dl)
    setDiagRepo(dr)
    setEventos(ev)
    setTurmas(t)
    setAulas(a)
    setMatriculados(m)
    setTotalEventos(te)
  }, [leitor, repositorio, config])

  useEffect(() => {
    semDono('atualizar diagnóstico', atualizar)
  }, [atualizar])

  useEffect(() => leitor.aoMudarEstado(setEstadoLeitor), [leitor])

  useEffect(() => {
    return leitor.aoLer((leitura) => {
      semDono('leitura no diagnóstico', async () => {
        const hex = uidParaHex(leitura.uid)
        const { uidHash, vinculo } = await identificarCracha(repositorio, leitura.uid)
        const nova = { chave: `${hex}-${leitura.em.getTime()}`, hex, legivel: uidLegivel(leitura.uid), uidHash, em: leitura.em, vinculo }
        setLeituras((antes) => [nova, ...antes].slice(0, 8))
        semDono('atualizar diagnóstico', atualizar)
      })
    })
  }, [leitor, repositorio, config, atualizar])

  const { recado, tentar } = useTentativa(atualizar)

  return (
    <div className="diagnostico">
      {essenciaisFaltando.length > 0 && (
        <div className="aviso aviso--grave">
          <strong>Falta peça essencial neste navegador.</strong>
          <p>{essenciaisFaltando.map((c) => c.nome).join(', ')}. Veja o painel Ambiente.</p>
        </div>
      )}
      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}
      {importacao && <Importacao resultado={importacao} />}

      <PainelAmbiente />
      <PainelDoLeitor estado={estadoLeitor} diagnostico={diagLeitor} ensaio={ensaio} tentar={tentar} />
      {ensaio && <PainelDeTestesFisicos leitor={leitor} leitorId={leitorId} repositorio={repositorio} config={config} />}
      <PainelChamadasRecentes />
      <PainelUltimasLeituras leituras={leituras} />
      <PainelDeRegistros
        repositorio={repositorio}
        turmas={turmas}
        aulas={aulas}
        matriculados={matriculados}
        totalEventos={totalEventos}
        tentar={tentar}
        aoImportar={setImportacao}
      />
      <PainelDoSegredo config={config} semSal={semSal} />
      <PainelEstadoDoApp
        diagnostico={diagRepo}
        eventos={eventos}
        config={config}
        repositorio={repositorio}
        ensaio={ensaio}
        tentar={tentar}
        aoSemear={async () => {
          if (!ehSimulavel(leitor)) throw new Error('o leitor em uso não tem baralho virtual')
          await semear(repositorio, config, leitor.baralho())
        }}
        aoApagar={() => setLeituras([])}
      />
      <PainelDiario />
      <PainelCodigosDosCrachas />
      <PainelModoDeEnsaio ensaio={ensaio} />
    </div>
  )
}
