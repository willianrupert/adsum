// A chamada sob carga, com a pasta ligada, conferida no disco.
//
// Os testes de escala provam que o leitor não perde rajada. Este prova o resto
// do caminho: 300 crachás em rajada, bem mais depressa que uma fila de gente,
// e ao fim a base, o log da pasta e a planilha de faltas têm os 300.
//
// O limite de tempo é o teste de desempenho: antes de indexar a lista da
// turma (`indiceDeVinculos`), cada crachá custava ~630 ms de desenho no jsdom
// e o teste não terminava em 180 s; depois, ~35 ms. Ver `docs/10_carga.md`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada } from '../testes/montar.tsx'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { ContextoAdsum } from './adsum.ts'
import { Fluxo } from './Fluxo.tsx'
import { adiarHorario } from '../ambiente/preferencias.ts'
import { esquecerDiario, linhasDoDiario } from '../ambiente/diario.ts'
import { ler } from '../ambiente/pasta.ts'
import { caminhoDasFaltas, caminhoDosRegistros } from '../ambiente/sincronia.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { criarEmissor } from '../adaptadores/leitor/emissor.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  LeitorDeCracha,
  Leitura,
} from '../portas/LeitorDeCracha.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'
const TAMANHO = 300
/** Entre um crachá e outro, no relógio das leituras. Acima de `INTERVALO_MINIMO_MS`. */
const INTERVALO_LOGICO_MS = 450
/** Entre um crachá e outro, de verdade: a rajada chega bem mais rápido que a tela processa. */
const INTERVALO_REAL_MS = 20

/** Um leitor em que o teste escolhe o `em` de cada leitura. */
class LeitorDeCarga implements LeitorDeCracha {
  readonly nome = 'Leitor de carga'
  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()
  async estaDisponivel() {
    return true
  }
  estado(): EstadoLeitor {
    return 'lendo'
  }
  async iniciar() {}
  async parar() {}
  aoLer(escuta: (leitura: Leitura) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }
  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar {
    return this.#estados.inscrever(escuta)
  }
  async diagnostico(): Promise<DiagnosticoLeitor> {
    return { nome: this.nome, estado: 'lendo', disponivel: true, detalhes: {} }
  }
  encostar(uid: Uint8Array, em: Date) {
    this.#leituras.emitir({ uid, em, origem: this.nome })
  }
}

const uidDe = (i: number) => Uint8Array.from([0x40, (i >> 16) & 0xff, (i >> 8) & 0xff, i & 0xff])

function turma(): Matriculado[] {
  return Array.from({ length: TAMANHO }, (_, i) => {
    const matricula = String(20260000001 + i)
    return {
      turma: TURMA,
      chave: matricula,
      matricula,
      nome: `Aluno ${i + 1}`,
      nomeCompleto: `ALUNO ${i + 1} DE CARGA`,
      papel: 'aluno' as const,
    }
  })
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: () => Promise.resolve(undefined),
    configurable: true,
  })
})

afterEach(() => {
  delete window.showDirectoryPicker
  window.localStorage.clear()
  esquecerDiario()
})

describe('300 crachás em rajada, com a pasta ligada', () => {
  it(
    'a base, o log da pasta e a planilha de faltas terminam com os 300, sem erro',
    async () => {
      const bancada = await montarBancada()
      const leitor = new LeitorDeCarga()
      const { handle } = criarPastaFalsa()
      bancada.repositorio.lerPasta = async () => handle

      adiarHorario(TURMA)
      await bancada.repositorio.salvarTurma(TURMA, turma())
      await bancada.repositorio.gravarVinculo({
        uidHash: 'aaaa000000000000',
        papel: 'professor',
        nome: 'Prof',
        criadoEm: new Date().toISOString(),
      })
      for (const [i, aluno] of turma().entries()) {
        await bancada.repositorio.gravarVinculo({
          uidHash: await calcularUidHash(bancada.config.salHex, uidDe(i)),
          papel: 'aluno',
          nome: aluno.nome,
          matricula: aluno.matricula,
          criadoEm: new Date().toISOString(),
        })
      }

      render(
        <ContextoAdsum.Provider value={{ ...bancada, leitor }}>
          <Fluxo />
        </ContextoAdsum.Provider>,
      )
      const usuario = userEvent.setup()
      await usuario.click(await screen.findByRole('button', { name: /Começar a chamada/ }))
      await waitFor(async () => expect(await bancada.repositorio.sessaoAberta()).toBeDefined())

      // Leituras no passado recente, espaçadas como numa fila possível, e
      // disparadas de verdade quase juntas.
      const inicio = new Date(Date.now() - TAMANHO * INTERVALO_LOGICO_MS)
      const abertura = new Date(Date.parse((await bancada.repositorio.sessaoAberta())!.abertaEm))
      const base = inicio.getDate() === abertura.getDate() ? inicio : abertura
      for (let i = 0; i < TAMANHO; i++) {
        await act(async () => leitor.encostar(uidDe(i), new Date(base.getTime() + i * INTERVALO_LOGICO_MS)))
        await esperar(INTERVALO_REAL_MS)
      }

      await waitFor(
        async () => {
          const eventos = await bancada.repositorio.listarEventos({ turma: TURMA })
          const presencas = eventos.filter((e) => e.origem === 'cracha' && e.resultado === 'ok')
          expect(presencas).toHaveLength(TAMANHO)
        },
        { timeout: 60_000, interval: 250 },
      )
      const eventos = await bancada.repositorio.listarEventos({ turma: TURMA })
      expect(eventos.filter((e) => e.resultado === 'rapido_demais')).toHaveLength(0)

      // O log da pasta: uma linha por evento da base, nenhuma perdida.
      await waitFor(
        async () => {
          const log = (await ler(handle, caminhoDosRegistros(TURMA)))!
          const ids = log.trim().split('\n').slice(1).map((l) => l.split(';')[0])
          expect(new Set(ids).size).toBe(eventos.length)
        },
        { timeout: 30_000, interval: 250 },
      )

      // A planilha de faltas acompanha o último crachá: 300 presentes.
      await waitFor(
        async () => {
          const faltas = (await ler(handle, caminhoDasFaltas(TURMA)))!
          const linhas = faltas.trim().split('\n').slice(1)
          expect(linhas).toHaveLength(TAMANHO)
          expect(linhas.every((l) => l.endsWith(';0'))).toBe(true)
        },
        { timeout: 30_000, interval: 250 },
      )

      expect(linhasDoDiario().filter((l) => l.includes('| erro'))).toEqual([])
    },
    90_000,
  )
})
