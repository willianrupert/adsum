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

import type { Matriculado } from './tipos.ts'

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

// A turma sintética: só existe pra exercitar cenários que dependem de uma
// chamada aberta de verdade (`decidir()`, em `nucleo/sessao.ts`) — o "dois
// crachás juntos" é o primeiro caso, e é o único motivo de tudo daqui pra
// baixo. Nome inconfundível de teste, nunca parecido com turma real — a
// mesma regra do `LeitorSimulavel`.


export const TURMA_DE_TESTE = '🧪 Suíte de testes (Diagnóstico)'

/**
 * UID curto (6 dígitos, o mínimo que `interpretarTexto` aceita), numa faixa
 * própria (510000+) que nunca cruza nem com `uidDeTeste` nem com os UIDs
 * medidos do dongle real. Existe só para o cenário "dois crachás juntos":
 * ele precisa que a rajada inteira termine rápido, pra sobrar margem real
 * sob os 400 ms de `INTERVALO_MINIMO_MS` — com o UID de 10 dígitos normal,
 * o tempo de digitação do segundo crachá sozinho já cegaria boa parte
 * dessa janela.
 */
export function uidCurtoDeTeste(indice: number): string {
  return String(510_000 + indice)
}

/** N alunos inventados, óbvios como teste — nunca parecidos com gente real
    (o inverso da regra "dado real não entra no repositório": dado de
    teste não pode parecer real). */
export function matriculadosDeTeste(n: number): Matriculado[] {
  return Array.from({ length: n }, (_, i) => {
    const numero = String(i + 1).padStart(2, '0')
    return {
      turma: TURMA_DE_TESTE,
      chave: `teste-${numero}`,
      matricula: `TESTE${numero}`,
      nomeCompleto: `TESTE ${numero} DA SUÍTE FÍSICA`,
      nome: `Teste ${numero}`,
      papel: 'aluno' as const,
    }
  })
}

/**
 * O cenário que só existe dentro de uma chamada de verdade: dois crachás
 * diferentes, quase juntos, têm que virar "um presente, um recusado por
 * rápido demais" — não duas presenças. `gapMs` é o intervalo real medido
 * entre os dois eventos gravados, não o que se pediu ao rig: hardware é
 * hardware, e o que importa é o que aconteceu, não a intenção.
 *
 * Gap acima de `INTERVALO_MINIMO_MS` não é reprovação — é inconclusivo: o
 * hardware não chegou perto o suficiente pra testar a regra, e dizer
 * "falhou" seria confundir "não deu pra saber" com "sei que está errado".
 */
export function avaliarDoisCrachasJuntos(dados: {
  gapMs: number
  resultados: [primeiro: string, segundo: string]
}): ResultadoCenario {
  const nome = 'Dois crachás juntos (INTERVALO_MINIMO_MS)'
  const [primeiro, segundo] = dados.resultados
  const gap = `${Math.round(dados.gapMs)} ms de intervalo real entre os dois`

  if (dados.gapMs >= 400) {
    return {
      nome,
      aprovado: false,
      detalhe: `Inconclusivo: ${gap} — acima dos 400 ms de INTERVALO_MINIMO_MS, então a regra nem chegou a ser testada. Rode de novo.`,
    }
  }

  const aprovado = primeiro === 'ok' && segundo === 'rapido_demais'
  const detalhe = aprovado
    ? `${gap}. O primeiro contou presença; o segundo foi recusado como rápido demais — o anti-fraude funcionou.`
    : `${gap}, dentro da janela de 400 ms — mas o resultado esperado era "ok" seguido de "rapido_demais", e veio "${primeiro}" seguido de "${segundo}".`
  return { nome, aprovado, detalhe }
}
