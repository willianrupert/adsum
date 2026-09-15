// Pedido do Prof. Paulo, depois do incidente de 15/09/2026 em aula real:
// "tenta simular/emular para uma turma com 100 alunos". A causa raiz já foi
// achada e corrigida em `LeitorTeclado.ts` (ver o commit e o teste em
// `LeitorTeclado.test.ts`) — este arquivo é a validação que ele pediu, sob
// carga de verdade: turma grande, já vinculada (o caso comum depois do
// primeiro dia, que é quando o incidente aconteceu), `TelaAula`
// reatualizando a cada leitura, e o leitor de teclado de verdade (não
// `LeitorSimulado`, que nunca passa pelo gargalo que quebrou).
// `montarBancada()` não serve aqui — ela fixa `LeitorSimulado` — então o
// contexto é montado à mão, com `LeitorTeclado` de verdade.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { ContextoAdsum } from './adsum.ts'
import { TelaAula } from './TelaAula.tsx'
import { calcularUidHash } from '../nucleo/hash.ts'
import type { Leitura } from '../portas/LeitorDeCracha.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01 · turma cheia'
const TAMANHO = 100

function turma(tamanho: number): Matriculado[] {
  return Array.from({ length: tamanho }, (_, i) => {
    const matricula = String(20260000001 + i)
    return {
      turma: TURMA,
      chave: matricula,
      matricula,
      nome: `Aluno ${i + 1}`,
      nomeCompleto: `ALUNO ${i + 1} DA SILVA`,
      papel: 'aluno' as const,
    }
  })
}

/** 100 UIDs decimais de 10 dígitos distintos — o mesmo formato medido do
 * dongle real (ver `nucleo/digitacao.ts`). */
function uidsDecimais(quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => String(1000000000 + i * 37))
}

/** Mesma conversão de `decimalParaBytes`, em `nucleo/digitacao.ts` — não
 * exportada de lá, então replicada aqui só para montar o vínculo prévio. */
function uidDecimalParaBytes(texto: string): Uint8Array {
  const valor = Number(texto)
  return Uint8Array.from([(valor >>> 24) & 0xff, (valor >>> 16) & 0xff, (valor >>> 8) & 0xff, valor & 0xff])
}

function tecla(caractere: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: caractere, bubbles: true, cancelable: true }))
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/** Mesmo ritmo medido do dongle real: 16-32 ms entre teclas. */
async function digitarRajada(texto: string) {
  const deltas = [16, 32, 17, 17, 17]
  for (let i = 0; i < texto.length; i++) {
    if (i > 0) await esperar(deltas[(i - 1) % deltas.length])
    tecla(texto[i])
  }
  tecla('Enter')
}

let repositorio: RepositorioDexie
let leitor: LeitorTeclado

beforeEach(async () => {
  repositorio = new RepositorioDexie(`adsum-escala-${Date.now()}-${Math.random()}`)
  await repositorio.abrir()
  await repositorio.salvarTurma(TURMA, turma(TAMANHO))
  await repositorio.abrirSessao({
    turma: TURMA,
    abertaEm: new Date(Date.now() - 10 * 60_000).toISOString(),
    uidHashProfessor: 'professor',
  })

  // Turma já vinculada — o caso comum numa aula que não é a primeira do
  // semestre, e o cenário do incidente relatado: ninguém em modo de
  // cadastro, o crachá só precisa bater com quem já existe.
  const config = await repositorio.lerConfig()
  for (const [i, aluno] of turma(TAMANHO).entries()) {
    const uid = uidDecimalParaBytes(String(1000000000 + i * 37))
    const uidHash = await calcularUidHash(config.salHex, uid)
    await repositorio.gravarVinculo({
      uidHash,
      papel: 'aluno',
      nome: aluno.nome,
      matricula: aluno.matricula,
      criadoEm: new Date().toISOString(),
    })
  }

  leitor = new LeitorTeclado()
  await leitor.iniciar()
})

afterEach(async () => {
  await leitor.parar()
  await repositorio.fechar()
})

describe('turma de 100 alunos, já vinculada, dongle de verdade', () => {
  it(
    'nenhuma leitura se perde, e todo mundo conta presença, com a lista de 100 reatualizando a cada crachá',
    async () => {
      const alunos: Matriculado[] = [] // ninguém pendente — todo mundo já vinculado, como no beforeEach
      const config = await repositorio.lerConfig()

      const leituras: Leitura[] = []
      leitor.aoLer((leitura) => leituras.push(leitura))

      render(
        <ContextoAdsum.Provider
          value={{
            leitor,
            leitorId: 'dongle',
            trocarLeitor: async () => {},
            repositorio,
            config,
            recarregarConfig: async () => {},
          }}
        >
          <TelaAula
            sessao={{
              turma: TURMA,
              abertaEm: new Date(Date.now() - 10 * 60_000).toISOString(),
              uidHashProfessor: 'professor',
            }}
            pendentes={alunos}
            daTurma={turma(TAMANHO)}
            aoMudarBase={() => {}}
          />
        </ContextoAdsum.Provider>,
      )

      const uids = uidsDecimais(TAMANHO)
      for (const uid of uids) {
        await digitarRajada(uid)
        // Acima de INTERVALO_MINIMO_MS (400ms, `nucleo/sessao.ts`) — regra
        // à parte, o anti-fraude contra dois crachás de uma vez, não o que
        // está sendo provado aqui. Abaixo disso, a fila real de estudantes
        // nunca chega — é bem mais rápido que qualquer fila com corpo
        // humano no meio.
        await esperar(420)
      }

      // A prova principal: o leitor de teclado reconheceu as 100 rajadas
      // como crachá — nenhuma foi engolida em silêncio por parecer "gente
      // digitando devagar" por causa do custo de reatualizar uma lista de
      // 100 a cada leitura. É a mesma causa do incidente relatado.
      expect(leituras).toHaveLength(TAMANHO)

      // E a prova de ponta a ponta: todo mundo que encostou o crachá conta
      // presença de verdade, gravado no repositório.
      const eventos = await repositorio.listarEventos()
      const presencas = eventos.filter(
        (e) => e.turma === TURMA && e.origem === 'cracha' && e.resultado === 'ok',
      )
      expect(presencas).toHaveLength(TAMANHO)
    },
    120_000,
  )
})
