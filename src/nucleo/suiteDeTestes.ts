// A suíte de testes físicos: lógica pura de avaliação, sem Web Serial, sem
// React, sem `window`. Quem dispara os crachás e escuta o leitor de verdade
// é `ambiente/suiteFisica.ts`; este arquivo só decide, dado o que chegou, se
// o cenário passou.
//
// Existe porque o incidente do Prof. Paulo (15 e 17/09/2026) provou que o
// caminho do teclado real — sistema operacional, foco de janela, ritmo de
// USB — não é o mesmo que `LeitorSimulado` exercita. Testar isso hoje exige
// alguém sentado com o rig e `rig.py`, digitando comando por comando; esta
// suíte automatiza o julgamento, não só o disparo.

export type MotivoDeRecusa = 'ritmo' | 'formato' | 'linha'

export interface EventoObservado {
  tipo: 'aceita' | 'recusa'
  motivo?: MotivoDeRecusa
  em: number
}

export interface ResultadoCenario {
  nome: string
  aprovado: boolean
  detalhe: string
}

export interface ExpectativaCenario {
  nome: string
  aceitas: number
  recusas: number
  /** Quando definido, toda recusa observada precisa ter este motivo — senão
      o cenário passou pela contagem certa, mas pela razão errada. */
  motivoRecusa?: MotivoDeRecusa
}

/** Faixa de UID sintético, bem longe dos dois UIDs medidos do dongle real
    (`0930148883`, `2367396804`, em `nucleo/digitacao.ts`) — a mesma que
    `ferramentas/rig-de-cracha/rig.py` já usa, pra nunca colidir por acidente
    com um crachá físico já vinculado numa base de verdade. */
export function uidDeTeste(indice: number): string {
  return String(1_700_000_000 + indice * 3)
}

/**
 * Compara o que chegou com o que devia ter chegado. Uma contagem certa com o
 * motivo errado não é aprovação — é o mesmo raciocínio de
 * `LeitorTeclado`: duas causas diferentes não podem virar a mesma resposta.
 */
export function avaliarCenario(
  expectativa: ExpectativaCenario,
  eventos: readonly EventoObservado[],
): ResultadoCenario {
  const aceitas = eventos.filter((e) => e.tipo === 'aceita').length
  const recusas = eventos.filter((e) => e.tipo === 'recusa')
  const motivoBate =
    expectativa.motivoRecusa === undefined || recusas.every((r) => r.motivo === expectativa.motivoRecusa)
  const aprovado = aceitas === expectativa.aceitas && recusas.length === expectativa.recusas && motivoBate

  const partes = [
    `${aceitas} aceito(s) (esperado ${expectativa.aceitas})`,
    `${recusas.length} recusado(s) (esperado ${expectativa.recusas})`,
  ]
  if (expectativa.motivoRecusa) {
    partes.push(`motivo: ${recusas.length ? recusas.map((r) => r.motivo ?? '—').join(', ') : '—'}`)
  }
  return { nome: expectativa.nome, aprovado, detalhe: partes.join(' · ') }
}

/**
 * O cenário de foco tem duas fases (sem foco, depois com foco de volta) e
 * a aprovação depende das duas juntas: nada chegar sem foco não é bug — é
 * o limite físico do teclado HID, o mesmo do dongle real. O que importa é
 * que a leitura **volta sozinha** assim que o foco volta, sem travar.
 */
export function avaliarPerdaDeFoco(
  semFoco: readonly EventoObservado[],
  comFocoDeVolta: readonly EventoObservado[],
): ResultadoCenario {
  const nadaChegouSemFoco = semFoco.length === 0
  const voltouAFuncionar = comFocoDeVolta.some((e) => e.tipo === 'aceita')
  const aprovado = nadaChegouSemFoco && voltouAFuncionar

  let detalhe: string
  if (aprovado) {
    detalhe = 'Sem foco, nada chegou (o esperado); com o foco de volta, a leitura voltou a funcionar sozinha.'
  } else if (!nadaChegouSemFoco) {
    detalhe = `Sem foco, ${semFoco.length} evento(s) chegaram mesmo assim — inesperado.`
  } else {
    detalhe = 'O foco voltou, mas a leitura não voltou a funcionar — ficou travada.'
  }
  return { nome: 'Perda de foco', aprovado, detalhe }
}
