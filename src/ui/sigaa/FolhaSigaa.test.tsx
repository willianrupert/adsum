import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import { PonteSimulada } from '../../adaptadores/sigaa/PonteSimulada.ts'
import { VERSAO_DO_FAVORITO, mensagemDeLeitura, receberLeitura, ORIGEM_SIGAA } from '../../nucleo/lancar/protocolo.ts'
import type { BrutoPlanilha } from '../../nucleo/lancar/leitura.ts'
import type { Evento } from '../../nucleo/tipos.ts'
import { FolhaSigaa } from './FolhaSigaa.tsx'

const TURMA = 'CIN0144 · T01'
let n = 0
let k = 0
let repositorio: RepositorioDexie
let ponte: PonteSimulada
const fechar = vi.fn()

const ev = (dia: string, parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento => ({
  eventoId: `web-t-${dia.replaceAll('-', '')}-${++k}`,
  quando: new Date(`${dia}T10:${String(k % 60).padStart(2, '0')}:00`).toISOString(),
  turma: TURMA,
  uidHash: 'x',
  nome: '',
  ...parcial,
})

/** Terça vazia no SIGAA (o Caio faltou); quinta lançada, com o Breno diferente do Adsum. */
function bruto(mudar: (b: BrutoPlanilha) => void = () => {}): BrutoPlanilha {
  const b: BrutoPlanilha = {
    rodape: 'SIGAA | STI - v4.15.0.206',
    cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
    meses: [{ texto: 'Outubro', colunas: 2 }],
    dias: [{ texto: '13', maximoTexto: '2' }, { texto: '15', maximoTexto: '2', marcaTexto: 'Lançado' }],
    linhas: [
      { matriculaTexto: '20260000001', celulas: [{ valor: '', desabilitada: false }, { valor: '0', desabilitada: false }] },
      { matriculaTexto: '20260000002', celulas: [{ valor: '', desabilitada: false }, { valor: '2', desabilitada: false }] },
      { matriculaTexto: '20260000003', celulas: [{ valor: '', desabilitada: false }, { valor: '0', desabilitada: false }] },
    ],
  }
  mudar(b)
  return b
}

beforeEach(async () => {
  window.localStorage.setItem('adsum.modoDev', 'sim')
  fechar.mockReset()
  repositorio = new RepositorioDexie(`adsum-folha-${n++}`)
  await repositorio.abrir()
  const alunos = [
    ['20260000001', 'Ana Clara'],
    ['20260000002', 'Breno Lima'],
    ['20260000003', 'Caio Dias'],
  ] as const
  await repositorio.salvarTurma(
    TURMA,
    alunos.map(([matricula, nome]) => ({ turma: TURMA, chave: matricula, matricula, nome, nomeCompleto: `${nome.toUpperCase()} INVENTADO`, papel: 'aluno' as const })),
  )
  const log = [
    ev('2026-10-13', { origem: 'professor', resultado: 'ok' }),
    ev('2026-10-13', { origem: 'cracha', resultado: 'ok', matricula: '20260000001' }),
    ev('2026-10-13', { origem: 'cracha', resultado: 'ok', matricula: '20260000002' }),
    ev('2026-10-15', { origem: 'professor', resultado: 'ok' }),
    ev('2026-10-15', { origem: 'cracha', resultado: 'ok', matricula: '20260000001' }),
    ev('2026-10-15', { origem: 'cracha', resultado: 'ok', matricula: '20260000002' }),
    ev('2026-10-15', { origem: 'cracha', resultado: 'ok', matricula: '20260000003' }),
  ]
  for (const e of log) await repositorio.acrescentarEvento(e)
  ponte = new PonteSimulada()
})

afterEach(async () => {
  window.localStorage.removeItem('adsum.modoDev')
  await repositorio.fechar()
})

const abrir = (props: Partial<Parameters<typeof FolhaSigaa>[0]> = {}) =>
  render(<FolhaSigaa repositorio={repositorio} ponte={ponte} fechar={fechar} {...props} />)

describe('a folha, com o que lançar', () => {
  it('o título é o estado, a diferença vem primeiro, e a aula mostra números', async () => {
    abrir()
    ponte.ler(bruto(), 'l-1')
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
    expect(screen.getByText('CIN0144 · T01. Planilha lida agora, 3 alunos, todos pela matrícula.')).toBeInTheDocument()
    const diferenca = screen.getByRole('group', { name: 'Diferenças' })
    expect(within(diferenca).getByText('Breno Lima')).toBeInTheDocument()
    expect(within(diferenca).getByText('Qui, 15/10. No SIGAA, 2 faltas. No Adsum, presente.')).toBeInTheDocument()
    expect(within(diferenca).getByText('O SIGAA fica como está.')).toBeInTheDocument()
    expect(screen.getByText('2 presentes, 1 falta')).toBeInTheDocument()
    expect(screen.getByText('Nada é gravado aqui. Você confere e grava no SIGAA.')).toBeInTheDocument()
  })

  it('quem faltou só aparece pelo nome depois do toque na aula', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto(), 'l-1')
    await screen.findByRole('heading', { name: '1 aula para lançar' })
    expect(screen.queryByText(/Caio Dias/)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Ter, 13\/10/ }))
    expect(screen.getByText('Caio Dias, 2 faltas')).toBeInTheDocument()
  })

  it('desmarcar a aula tira ela do botão', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto(), 'l-1')
    await screen.findByRole('button', { name: 'Preencher 1 aula' })
    await usuario.click(screen.getByRole('checkbox', { name: 'Incluir Ter, 13/10' }))
    expect(screen.getByRole('button', { name: 'Nada marcado' })).toBeDisabled()
  })

  it('Preencher entrega o plano à planilha, registra na auditoria, e fecha a janela', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto(), 'l-1')
    await usuario.click(await screen.findByRole('button', { name: 'Preencher 1 aula' }))
    await waitFor(() => expect(fechar).toHaveBeenCalled())
    expect(ponte.entregues).toEqual([
      {
        id: 'l-1',
        instrucoes: [
          { linha: 0, coluna: 0, antes: 'vazia', valor: 0 },
          { linha: 1, coluna: 0, antes: 'vazia', valor: 0 },
          { linha: 2, coluna: 0, antes: 'vazia', valor: 2 },
        ],
      },
    ])
    const auditoria = await repositorio.listarAuditoriaSigaa(TURMA)
    expect(auditoria.filter((l) => l.acao === 'preenchimento').map((l) => [l.matricula, l.proposto])).toEqual([
      ['20260000001', '0'],
      ['20260000002', '0'],
      ['20260000003', '2'],
    ])
  })

  it('a conferência registra a diferença na auditoria, sem nome', async () => {
    abrir()
    ponte.ler(bruto(), 'l-1')
    await screen.findByRole('heading', { name: '1 aula para lançar' })
    await waitFor(async () =>
      expect(await repositorio.listarAuditoriaSigaa(TURMA)).toEqual([
        expect.objectContaining({ acao: 'conferencia', dia: '2026-10-15', matricula: '20260000002', lido: '2', proposto: '0', aplicado: '' }),
      ]),
    )
    expect(JSON.stringify(await repositorio.listarAuditoriaSigaa(TURMA))).not.toMatch(/Breno/)
  })

  it('Aceitar o SIGAA grava o ajuste num toque, e Desfazer grava outro com o valor do Adsum', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto(), 'l-1')
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar o SIGAA' }))
    expect(await screen.findByText('Breno Lima, Qui, 15/10: fica como está no SIGAA.')).toBeInTheDocument()
    expect(await repositorio.lerAjustesSigaa(TURMA)).toEqual([expect.objectContaining({ matricula: '20260000002', dia: '2026-10-15', valor: 2 })])
    expect(screen.queryByRole('group', { name: 'Diferenças' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByRole('group', { name: 'Diferenças' })).toBeInTheDocument()
    expect((await repositorio.lerAjustesSigaa(TURMA)).map((a) => a.valor)).toEqual([2, 0])
    expect((await repositorio.listarAuditoriaSigaa(TURMA)).filter((l) => l.acao === 'aceite').map((l) => l.aplicado)).toEqual(['2', '0'])
  })

  it('Agora não só fecha', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto(), 'l-1')
    await usuario.click(await screen.findByRole('button', { name: 'Agora não' }))
    expect(fechar).toHaveBeenCalled()
    expect(ponte.entregues).toEqual([])
  })
})

describe('a folha, quando tudo confere', () => {
  it('diz em quantas aulas, e avisa a planilha que não há nada a preencher', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto((b) => {
      for (const [i, l] of b.linhas.entries()) l.celulas[0].valor = i === 2 ? '2' : '0'
      b.linhas[1].celulas[1].valor = '0'
    }), 'l-2')
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    expect(screen.getByText('SIGAA e Adsum iguais em 2 aulas.')).toBeInTheDocument()
    await waitFor(() => expect(ponte.entregues).toEqual([{ id: 'l-2', instrucoes: [] }]))
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(fechar).toHaveBeenCalled()
  })
})

describe('a folha, quando o aceite deixa tudo igual', () => {
  it('avisa a planilha que não há nada a preencher, também depois do aceite', async () => {
    const usuario = userEvent.setup()
    abrir()
    ponte.ler(bruto((b) => {
      for (const [i, l] of b.linhas.entries()) l.celulas[0].valor = i === 2 ? '2' : '0'
    }), 'l-3')
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar o SIGAA' }))
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    await waitFor(() => expect(ponte.entregues).toEqual([{ id: 'l-3', instrucoes: [] }]))
  })
})

describe('a folha recusa, e diz o que fazer', () => {
  it('aberta sem o favorito: diz onde clicar, e oferece a lista à mão', async () => {
    const usuario = userEvent.setup()
    abrir({ ponte: new PonteSimulada({ ligada: false }) })
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Lançar à mão' }))
    expect(await screen.findByText(/13\/10: todos presentes, exceto:/)).toBeInTheDocument()
  })

  it('favorito antigo: pede o novo', async () => {
    abrir()
    const antiga = { ...mensagemDeLeitura('l-1', bruto()), versaoFavorito: VERSAO_DO_FAVORITO + 1 }
    ponte.receber(receberLeitura({ data: antiga, origin: ORIGEM_SIGAA, source: 'x' }, { abridora: 'x' }))
    expect(await screen.findByText('Este favorito é de uma versão antiga. Arraste o novo, nos Ajustes do Adsum, para a barra de favoritos.')).toBeInTheDocument()
  })

  it('página que não dá para ler: diz o motivo', async () => {
    abrir()
    ponte.ler(bruto((b) => (b.dias[0].texto = 'ter')), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Não deu para ler a planilha' })).toBeInTheDocument()
    expect(screen.getByText(/coluna 1: data ilegível/)).toBeInTheDocument()
  })

  it('turma que o Adsum não tem', async () => {
    abrir()
    ponte.ler(bruto((b) => (b.cabecalhoTurma = 'CIN9999 - OUTRA - Turma: 01 (2026.2)')), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Esta turma não está no Adsum' })).toBeInTheDocument()
  })

  it('planilha que não responde: pede o favorito de novo', async () => {
    abrir({ esperaMs: 20 })
    expect(await screen.findByRole('heading', { name: 'A planilha não respondeu' })).toBeInTheDocument()
  })
})
