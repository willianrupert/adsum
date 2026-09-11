// Uma jornada inteira, do zero a uma aula fechada — sem um vínculo feito à
// mão, sem um clique de crachá.
//
// Pergunta que motivou este arquivo: "isso pode simular automaticamente os
// crachás pra mim, sem eu fazer nada? Vincular a nomes e etc?" Sim, e este
// arquivo é a prova — `baterCrachasEmSequencia` (`testes/simular.ts`) faz o
// que uma turma inteira faria numa fila, uma pessoa de cada vez, e cada
// asserção aqui olha a tela como o professor olharia: quem falta, quantos
// presentes, o CSV que sai no fim, a planilha depois de encerrar.
//
// A versão original ia até um segundo dia de aula, com o relógio adiantado
// artificialmente pra separar as duas datas. Cortado: o relógio falso ligado
// o teste inteiro travava no GitHub Actions sem nunca resolver — não era
// demora, era travamento, e nenhum prazo maior consertava. A cobertura de
// "planilha com mais de um dia" mora agora em
// `componentes/GradeDePresencas.test.tsx`, com datas fixas indo direto pro
// componente — não precisa de sessão nenhuma pra provar isso.
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { baterCrachasEmSequencia, gerarBaralho } from '../testes/simular.ts'
import { Fluxo } from './Fluxo.tsx'
import { adiarHorario } from '../ambiente/preferencias.ts'
import { paraCsv, porTurma } from '../nucleo/csv.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'
const TAMANHO = 12

function turmaFicticia(): Matriculado[] {
  return Array.from({ length: TAMANHO }, (_, i) => ({
    turma: TURMA,
    chave: String(30250000000 + i),
    matricula: String(30250000000 + i),
    nomeCompleto: `ALUNO ${String(i + 1).padStart(2, '0')} DA SILVA`,
    nome: `Aluno ${String(i + 1).padStart(2, '0')}`,
    papel: 'aluno' as const,
  }))
}

let bancada: Bancada

beforeEach(async () => {
  bancada = await montarBancada()
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
})

describe('jornada completa: turma nova, uma aula inteira, tudo simulado', () => {
  it('cadastra, chama, encerra e exporta — sem um crachá pisar no outro', async () => {
    const usuario = userEvent.setup()
    const turma = turmaFicticia()
    const baralho = gerarBaralho(TAMANHO)

    adiarHorario(TURMA)
    await bancada.repositorio.salvarTurma(TURMA, turma)
    renderizarCom(bancada, <Fluxo />)

    // Turma inteira sem crachá ainda. "Começar a chamada" sintetiza o crachá
    // do professor sozinho; nenhum vínculo existe antes disto.
    await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
    await screen.findByText('Quem falta')

    await baterCrachasEmSequencia(
      bancada.leitor,
      baralho,
      () => bancada.repositorio.contarEventos(),
      async (indice, restam) => {
        // A cadeia de um toque não termina na gravação do evento: só depois
        // dela vem `aoMudarBase` → `recontar()`, no `Fluxo` de verdade, que
        // recalcula quem ainda falta e passa a lista nova pra baixo — e é só
        // com essa lista nova que `TelaAula` sabe quem chamar em seguida. O
        // contador de presentes é outra cadeia, decidida dentro da própria
        // `TelaAula` — as duas partem do mesmo toque, sem garantia de
        // terminar juntas (ver o mesmo achado em `Fluxo.test.tsx`).
        await waitFor(() => {
          expect(screen.getByLabelText(String(indice + 1))).toBeInTheDocument()
          if (restam > 0) {
            expect(screen.getByText(`${restam} de ${TAMANHO} sem crachá`)).toBeInTheDocument()
          } else {
            expect(screen.queryByText('Quem falta')).not.toBeInTheDocument()
          }
        })
      },
    )

    expect(await screen.findByLabelText(String(TAMANHO))).toBeInTheDocument()
    expect(screen.getByText(/Turma completa/)).toBeInTheDocument()

    // Encerra e confere o CSV que de fato sai — não a tela, a fonte que o
    // professor leva pra planilha.
    await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
    await screen.findByRole('button', { name: 'Concluir sem salvar' })

    const eventos = await bancada.repositorio.listarEventos()
    const csv = paraCsv(porTurma([...eventos].reverse()).get(TURMA) ?? [])
    for (const pessoa of turma) {
      expect(csv).toContain(pessoa.matricula)
    }
    expect(csv.split('\n').filter((l) => l.includes(';cracha;'))).toHaveLength(TAMANHO)

    // A planilha depois de encerrar — a mesma leitura que "Ver presenças"
    // mostra de verdade, um dia só, todo mundo presente. Nome completo, como
    // no SIGAA: é o que a instituição reconhece, não a forma curta da tela
    // de chamada.
    await usuario.click(screen.getByRole('button', { name: 'Concluir sem salvar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Ver presenças' }))
    const popup = await screen.findByRole('dialog', { name: 'Presenças' })

    for (const pessoa of turma) {
      expect(within(popup).getByText(pessoa.nomeCompleto)).toBeInTheDocument()
    }
    expect(within(popup).getAllByText('1/1')).toHaveLength(TAMANHO)
  }, 60_000)
})
