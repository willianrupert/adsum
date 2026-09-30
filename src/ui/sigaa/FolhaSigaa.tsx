// A folha do Adsum na janela aberta pelo favorito (`docs/08` §5, `docs/09`).
//
// Lê a planilha, concilia com a base e mostra o estado em uma frase: tudo
// confere, há o que lançar, ou a recusa com o que fazer. Grava só na base
// (ajustes e auditoria): a pasta recebe na próxima vez que o Adsum abrir.
// O Gravar do SIGAA é sempre do professor.
//
// Aqui só se decide a tela, pelo estado da leitura; cada uma mora no seu arquivo.

import { useCallback, useEffect, useState } from 'react'
import { escolherTurma } from '../../nucleo/lancar/conciliar.ts'
import { lerPlanilha } from '../../nucleo/lancar/leitura.ts'
import type { LeituraRecebida } from '../../nucleo/lancar/protocolo.ts'
import type { LeituraPlanilha } from '../../nucleo/lancar/tipos.ts'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { turmasConfirmadas } from '../../ambiente/preferencias.ts'
import { FolhaDaTurma } from './FolhaDaTurma.tsx'
import { RECUSAS, TelaDeRecusa, type Recusa } from './TelaDeRecusa.tsx'
import { TelaDaPergunta, type Pergunta } from './TelaDaPergunta.tsx'

type Estado =
  | { tipo: 'esperando' }
  | { tipo: 'recusa'; recusa: Recusa }
  | { tipo: 'pergunta'; leitura: LeituraPlanilha; avisos: string[]; pergunta: Pergunta }
  | { tipo: 'pronta'; leitura: LeituraPlanilha; turma: string; avisos: string[] }

/** Fora do componente: uma função nova a cada desenho refaria a ligação com a planilha. */
const relogio = () => new Date()

export function FolhaSigaa({
  repositorio,
  ponte,
  fechar,
  esperaMs = 8000,
  agora = relogio,
}: {
  repositorio: Repositorio
  ponte: PonteSigaa
  fechar: () => void
  /** Sem leitura até lá, a planilha não respondeu. */
  esperaMs?: number
  /** A leitura bloqueia o dia futuro, como a página; o teste fixa o relógio. */
  agora?: () => Date
}) {
  const [estado, setEstado] = useState<Estado>(() => (ponte.ligada() ? { tipo: 'esperando' } : { tipo: 'recusa', recusa: RECUSAS.semFavorito }))

  const tratar = useCallback(
    async (recebida: LeituraRecebida) => {
      const recusar = (recusa: Recusa) => setEstado({ tipo: 'recusa', recusa })
      if (!recebida.ok) return recusar(recebida.motivo === 'versaoDoFavorito' ? RECUSAS.favoritoAntigo : RECUSAS.formato)
      const { leitura, problemas } = lerPlanilha(recebida.bruto, recebida.id, agora())
      const detalhes = problemas.map((p) => `${p.onde}: ${p.motivo}${p.conteudo ? ` ("${p.conteudo}")` : ''}`)
      if (!leitura) return recusar({ titulo: 'Não deu para ler a planilha', texto: 'O Adsum não preencheu nada. O motivo:', detalhes })
      const matriculados = await repositorio.listarMatriculados()
      if (matriculados.length === 0) return recusar(RECUSAS.baseVazia)
      const escolha = escolherTurma(leitura, matriculados, turmasConfirmadas())
      if ('turma' in escolha) return setEstado({ tipo: 'pronta', leitura, turma: escolha.turma, avisos: detalhes })
      if ('confirmar' in escolha) return setEstado({ tipo: 'pergunta', leitura, avisos: detalhes, pergunta: escolha })
      if (escolha.recusa === 'duas') return setEstado({ tipo: 'pergunta', leitura, avisos: detalhes, pergunta: { candidatas: escolha.candidatas } })
      recusar(RECUSAS.naoEstaNoAdsum)
    },
    [repositorio, agora],
  )

  useEffect(() => {
    if (!ponte.ligada()) return
    const cancelar = ponte.aoLer((r) => void tratar(r))
    ponte.iniciar()
    const espera = setTimeout(() => setEstado((e) => (e.tipo === 'esperando' ? { tipo: 'recusa', recusa: RECUSAS.naoRespondeu } : e)), esperaMs)
    return () => {
      clearTimeout(espera)
      cancelar()
      ponte.parar()
    }
  }, [ponte, tratar, esperaMs])

  if (estado.tipo === 'esperando') {
    return (
      <main className="folha-sigaa" aria-busy="true">
        <h1>Lendo a planilha</h1>
      </main>
    )
  }
  if (estado.tipo === 'recusa') return <TelaDeRecusa recusa={estado.recusa} />
  if (estado.tipo === 'pergunta') {
    const { leitura, avisos } = estado
    return (
      <TelaDaPergunta
        pergunta={estado.pergunta}
        escolher={(turma) => setEstado({ tipo: 'pronta', leitura, turma, avisos })}
        recusar={() => setEstado({ tipo: 'recusa', recusa: RECUSAS.naoEstaNoAdsum })}
      />
    )
  }
  return (
    <FolhaDaTurma
      key={estado.leitura.id}
      repositorio={repositorio}
      ponte={ponte}
      leitura={estado.leitura}
      turma={estado.turma}
      avisos={estado.avisos}
      fechar={fechar}
    />
  )
}
