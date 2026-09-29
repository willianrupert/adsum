// A janela do favorito na vitrine (`#/vitrine`, só em desenvolvimento): os
// estados que só aparecem com uma planilha do SIGAA do outro lado, com gente
// inventada, cada um numa base só dele. Preencher e Fechar recomeçam a cena.

import { useEffect, useState, type ReactNode } from 'react'
import type { BrutoPlanilha } from '../../nucleo/lancar/leitura.ts'
import type { Evento } from '../../nucleo/tipos.ts'
import type { PonteSimulavel } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { baseDaVitrine, ponteDeEnsaio } from '../adsum.ts'
import { FolhaSigaa } from './FolhaSigaa.tsx'

const TURMA = '2026.2 - IF685 - TURMA A'
const ALUNOS = [
  ['20269000001', 'Beatriz Lopes'],
  ['20269000002', 'Caio Ramalho'],
  ['20269000003', 'Débora Nunes'],
  ['20269000004', 'Enzo Barreto'],
] as const

/** Depois das duas aulas inventadas: nada delas é futuro para a planilha. */
const AGORA = () => new Date('2026-10-20T12:00:00')
const DIAS = [
  { dia: 13, data: 'Tue Oct 13 00:00:00 BRT 2026' },
  { dia: 15, data: 'Thu Oct 15 00:00:00 BRT 2026' },
]

/**
 * A planilha como o SIGAA a guarda (`docs/12`): terça sem nada lançado (Débora
 * faltou); quinta lançada, com o Caio diferente do Adsum.
 */
function planilha(tudoIgual: boolean): BrutoPlanilha {
  const terca = ['0', '0', '2', '0']
  const quinta = ['0', tudoIgual ? '0' : '2', '0', '0']
  const auxAulas = DIAS.map(({ dia, data }, j) => [dia, 10, 2, data, j === 1 || tudoIgual, false, false, false, 2026, false].join(','))
  const auxAlunos = ALUNOS.flatMap(([matricula], i) =>
    DIAS.map(({ dia, data }, j) => {
      const faltas = j === 0 ? (tudoIgual ? terca[i] : 'null') : quinta[i]
      return [900001 + i, matricula, 'ALUNO INVENTADO', dia, 10, faltas, 0, false, 2, 800001 + i, data, false, false, true, false, false].join(',')
    }),
  )
  return {
    legenda: 'IF685 - DISCIPLINA INVENTADA (60h) - Turma: 01 (2026.2)',
    periodo: { inicio: '2026-08-10 00:00:00.0', fim: '2026-12-12 00:00:00.0' },
    auxAulas: auxAulas.join(';'),
    auxAlunos: auxAlunos.join(';'),
  }
}

async function semear(repositorio: Repositorio) {
  await repositorio.salvarTurma(
    TURMA,
    ALUNOS.map(([matricula, nome]) => ({ turma: TURMA, chave: matricula, matricula, nome, nomeCompleto: nome.toUpperCase(), papel: 'aluno' as const })),
  )
  let n = 0
  const evento = (dia: string, parcial: Pick<Evento, 'origem'> & Partial<Evento>): Evento => ({
    eventoId: `web-vitrine-${dia.replaceAll('-', '')}-${++n}`,
    quando: new Date(`${dia}T10:${String(n).padStart(2, '0')}:00`).toISOString(),
    turma: TURMA,
    uidHash: 'vitrine',
    nome: '',
    resultado: 'ok',
    ...parcial,
  })
  for (const dia of ['2026-10-13', '2026-10-15']) {
    await repositorio.acrescentarEvento(evento(dia, { origem: 'professor' }))
    for (const [matricula, nome] of ALUNOS) {
      if (dia === '2026-10-13' && nome === 'Débora Nunes') continue
      await repositorio.acrescentarEvento(evento(dia, { origem: 'cracha', matricula, nome }))
    }
  }
}

function Cena({ base, bruto, ligada = true }: { base: string; bruto?: BrutoPlanilha; ligada?: boolean }) {
  const [vez, setVez] = useState(0)
  const [pronta, setPronta] = useState<{ repositorio: Repositorio; ponte: PonteSimulavel; vez: number }>()

  useEffect(() => {
    let vale = true
    void baseDaVitrine(base).then(async (repositorio) => {
      await semear(repositorio)
      if (vale) setPronta({ repositorio, ponte: ponteDeEnsaio({ ligada }), vez })
    })
    return () => {
      vale = false
    }
  }, [base, ligada, vez])

  // Depois da folha montada e ouvindo: o favorito "clicado" na planilha.
  useEffect(() => {
    if (pronta && bruto) pronta.ponte.ler(bruto, `vitrine-${base}-${pronta.vez}`)
  }, [pronta, bruto, base])

  if (!pronta || pronta.vez !== vez) return null
  return <FolhaSigaa key={pronta.vez} repositorio={pronta.repositorio} ponte={pronta.ponte} fechar={() => setVez((v) => v + 1)} agora={AGORA} />
}

export function CenasDoSigaa({ embrulho: Embrulho }: { embrulho: (props: { titulo: string; quando: string; children: ReactNode }) => ReactNode }) {
  return (
    <>
      <Embrulho titulo="SIGAA: há o que lançar" quando="janela do favorito, na planilha de frequência">
        <Cena base="adsum-vitrine-sigaa-lancar" bruto={planilha(false)} />
      </Embrulho>
      <Embrulho titulo="SIGAA: tudo confere" quando="o favorito de novo, depois do Gravar">
        <Cena base="adsum-vitrine-sigaa-confere" bruto={planilha(true)} />
      </Embrulho>
      <Embrulho titulo="SIGAA: recusa" quando="janela aberta sem o favorito">
        <Cena base="adsum-vitrine-sigaa-recusa" ligada={false} />
      </Embrulho>
    </>
  )
}
