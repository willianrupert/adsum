// Uma jornada inteira, do zero a duas aulas fechadas — sem um vínculo feito à
// mão, sem um clique de crachá.
//
// Pergunta que motivou este arquivo: "isso pode simular automaticamente os
// crachás pra mim, sem eu fazer nada? Vincular a nomes e etc?" Sim, e este
// arquivo é a prova — `baterCrachasEmSequencia` (`testes/simular.ts`) faz o
// que uma turma inteira faria numa fila, uma pessoa de cada vez, e cada
// asserção aqui olha a tela como o professor olharia: quem falta, quantos
// presentes, o CSV que sai no fim, a planilha depois de dois dias.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { baterCrachasEmSequencia, comRelogioSimulado, gerarBaralho } from '../testes/simular.ts'
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

describe('jornada completa: turma nova, dois dias de aula, tudo simulado', () => {
  it('cadastra, chama, encerra, exporta e reabre — sem um crachá pisar no outro', async () => {
    // Dezoito idas reais ao IndexedDB, com a suíte inteira competindo pelo
    // mesmo CPU: o limite padrão de 5s do teste em si (não de cada espera
    // dentro dele) estourava antes de a jornada terminar.
    const usuario = userEvent.setup()
    const turma = turmaFicticia()
    const baralho = gerarBaralho(TAMANHO)

    adiarHorario(TURMA)
    await bancada.repositorio.salvarTurma(TURMA, turma)
    renderizarCom(bancada, <Fluxo />)

    const metade = baralho.slice(0, Math.ceil(TAMANHO / 2))

    // Um relógio falso só, do início ao fim dos dois dias — nunca recua.
    // `TelaAula.recarregar` decide o que é "deste dia" comparando `quando`
    // com `sessao.abertaEm`, texto ISO: se o relógio voltasse pro real entre
    // um dia e outro, um evento do dia 1 com carimbo no futuro (fake) passaria
    // a valer como se fosse do dia 2, porque o "agora" do dia 2 chegaria antes
    // dele no relógio de verdade.
    await comRelogioSimulado(async () => {
      // Dia 1 — turma inteira sem crachá ainda. "Começar a chamada" sintetiza
      // o crachá do professor sozinho; nenhum vínculo existe antes disto.
      await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
      await screen.findByText('Quem falta')

      await baterCrachasEmSequencia(bancada.leitor, baralho, async (_, restam) => {
        await waitFor(() => {
          if (restam > 0) {
            expect(screen.getByText(`${restam} de ${TAMANHO} sem crachá`)).toBeInTheDocument()
          } else {
            expect(screen.queryByText('Quem falta')).not.toBeInTheDocument()
          }
        })
      })

      expect(await screen.findByLabelText(String(TAMANHO))).toBeInTheDocument()
      expect(screen.getByText(/Turma completa/)).toBeInTheDocument()

      // Encerra e confere o CSV que de fato sai — não a tela, a fonte que o
      // professor leva pra planilha.
      await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
      await screen.findByRole('button', { name: 'Concluir sem salvar' })

      const eventosDoDia1 = await bancada.repositorio.listarEventos()
      const csvDoDia1 = paraCsv(porTurma([...eventosDoDia1].reverse()).get(TURMA) ?? [])
      for (const pessoa of turma) {
        expect(csvDoDia1).toContain(pessoa.matricula)
      }
      expect(csvDoDia1.split('\n').filter((l) => l.includes(';cracha;'))).toHaveLength(TAMANHO)

      await usuario.click(screen.getByRole('button', { name: 'Concluir sem salvar' }))
      await screen.findByRole('button', { name: 'Começar a chamada' })

      // Vira o dia de verdade — a planilha agrupa por data de calendário
      // (`GradeDePresencas`), e sem isso os dois dias cairiam na mesma coluna:
      // o relógio só avançou minutos até aqui, não um dia inteiro.
      vi.setSystemTime(new Date(Date.now() + 24 * 3600_000))

      // Dia 2 — mesmo gesto reabre a mesma turma (só existe uma, e o crachá
      // sintético do professor já existe: "Começar a chamada" não pede nada
      // de novo). Todo mundo já tem crachá agora, então não é mais cadastro —
      // é presença de quem já tinha vínculo, e só metade comparece. É o caso
      // que prova ausência, não só presença perfeita.
      await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
      await screen.findByRole('button', { name: 'Encerrar a chamada' })
      // Ninguém pendente no início do dia 2 — e é a prova de que o contador
      // zerou de verdade, não ficou arrastando os doze do dia 1.
      expect(screen.queryByText('Quem falta')).not.toBeInTheDocument()
      expect(await screen.findByLabelText('0')).toBeInTheDocument()

      const eventosAntes = await bancada.repositorio.contarEventos()
      await baterCrachasEmSequencia(bancada.leitor, metade, async (i) => {
        // Sem "quem está chamado" envolvido aqui — é presença de crachá já
        // vinculado, não cadastro. Esperar o evento gravar é esperar pelo
        // único estado do qual este caminho depende.
        await waitFor(async () =>
          expect(await bancada.repositorio.contarEventos()).toBe(eventosAntes + i + 1),
        )
      })
      expect(await screen.findByLabelText(String(metade.length))).toBeInTheDocument()

      await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
      await usuario.click(await screen.findByRole('button', { name: 'Concluir sem salvar' }))
    })

    // A planilha final: dois dias, presença completa no primeiro, metade no
    // segundo — e é a mesma leitura que "Ver presenças" mostra de verdade.
    await usuario.click(await screen.findByRole('button', { name: 'Ver presenças' }))
    const popup = await screen.findByRole('dialog', { name: 'Presenças' })

    const dias = within(popup)
      .getAllByRole('columnheader')
      .filter((th) => th.className.includes('planilha__dia'))
    expect(dias).toHaveLength(2)

    const linhas = within(popup).getAllByRole('row').slice(1) // pula o cabeçalho
    expect(linhas).toHaveLength(TAMANHO)

    const presentesNosDoisDias = linhas.filter(
      (tr) => within(tr).queryAllByText('2/2').length > 0,
    )
    const presentesSoNoPrimeiro = linhas.filter(
      (tr) => within(tr).queryAllByText('1/2').length > 0,
    )
    expect(presentesNosDoisDias).toHaveLength(metade.length)
    expect(presentesSoNoPrimeiro).toHaveLength(TAMANHO - metade.length)
  }, 60_000)
})
