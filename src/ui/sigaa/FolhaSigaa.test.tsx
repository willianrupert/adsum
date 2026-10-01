import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import { PonteSimulada } from '../../adaptadores/sigaa/PonteSimulada.ts'
import { VERSAO_DO_FAVORITO, mensagemDeLeitura, receberLeitura, ORIGEM_SIGAA } from '../../nucleo/lancar/protocolo.ts'
import type { BrutoPlanilha } from '../../nucleo/lancar/leitura.ts'
import { comoDia, type Celula, type LeituraPlanilha } from '../../nucleo/lancar/tipos.ts'
import { brutoDaLeitura } from '../../testes/planilhaSigaa.ts'
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

const MATRICULAS = ['20260000001', '20260000002', '20260000003']
const TER = comoDia('2026-10-13')!
const QUI = comoDia('2026-10-15')!
/** Depois das duas aulas: nada delas é futuro para a página. */
const AGORA = () => new Date('2026-10-20T12:00:00')

/**
 * A planilha como o SIGAA a guarda (`docs/12`), a partir de uma grade de valores:
 * terça vazia no SIGAA (o Caio faltou); quinta lançada, com o Breno diferente do Adsum.
 */
function bruto(valores: string[][] = [['', '0'], ['', '2'], ['', '0']], mudar: (b: BrutoPlanilha) => void = () => {}, maximos = [2, 2]): BrutoPlanilha {
  const leitura: LeituraPlanilha = {
    id: 'modelo',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
    colunas: [
      // Lançada, como no SIGAA real, só a aula que tem algum valor.
      { indice: 0, dia: TER, maximo: maximos[0], ...(valores.some((l) => l[0] !== '') && { marca: 'lancado' as const }) },
      { indice: 1, dia: QUI, maximo: maximos[1], ...(valores.some((l) => l[1] !== '') && { marca: 'lancado' as const }) },
    ],
    linhas: valores.map((linha, indice) => ({
      indice,
      matricula: MATRICULAS[indice],
      celulas: linha.map((v): Celula => (v === '' ? { tipo: 'vazia' } : { tipo: 'lancada', faltas: Number(v) })),
    })),
  }
  const b = brutoDaLeitura(leitura)
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
  window.localStorage.removeItem('adsum.sigaa.turmas')
  await repositorio.fechar()
})

const abrir = (props: Partial<Parameters<typeof FolhaSigaa>[0]> = {}) =>
  render(<FolhaSigaa repositorio={repositorio} ponte={ponte} fechar={fechar} agora={AGORA} {...props} />)

describe('a folha, com o que lançar', () => {
  it('o título é o estado, a diferença vem primeiro, e a aula mostra números', async () => {
    abrir()
    ponte.ler(bruto(), 'l-1')
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
    expect(screen.getByText('CIN0144 · T01. Planilha lida agora, 3 alunos, todos pela matrícula.')).toBeInTheDocument()
    // Fechadas: quantas e de quantos, sem nome nenhum até o professor pedir.
    const diferenca = screen.getByRole('group', { name: 'Diferenças' })
    expect(within(diferenca).getByText('1 diferença com o SIGAA')).toBeInTheDocument()
    expect(within(diferenca).getByText('1 aluno em 1 aula. O SIGAA fica como está. Toque para conferir.')).toBeInTheDocument()
    expect(within(diferenca).queryByText('Breno Lima')).not.toBeInTheDocument()
    await userEvent.setup().click(within(diferenca).getByRole('button', { name: '1 diferença com o SIGAA' }))
    expect(within(diferenca).getByText('Qui, 15/10')).toBeInTheDocument()
    expect(within(diferenca).getByText('Breno Lima')).toBeInTheDocument()
    expect(within(diferenca).getByText('No SIGAA, 2 faltas. No Adsum, presente.')).toBeInTheDocument()
    expect(screen.getByText('2 presentes, 1 falta')).toBeInTheDocument()
    expect(screen.getByText('Ao preencher, o SIGAA salva sozinho em até 5 minutos.')).toBeInTheDocument()
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
    // Um Preencher, um instante: é por ele que o histórico dos Ajustes junta o lançamento.
    expect(new Set(auditoria.filter((l) => l.acao === 'preenchimento').map((l) => l.quando)).size).toBe(1)
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
    await usuario.click(await screen.findByRole('button', { name: /diferenças? com o SIGAA/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar o SIGAA' }))
    expect(await screen.findByText('Breno Lima, Qui, 15/10: fica como está no SIGAA.')).toBeInTheDocument()
    expect(await repositorio.lerAjustesSigaa(TURMA)).toEqual([expect.objectContaining({ matricula: '20260000002', dia: '2026-10-15', valor: 2 })])
    expect(screen.queryByRole('group', { name: 'Diferenças' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByRole('group', { name: 'Diferenças' })).toBeInTheDocument()
    expect((await repositorio.lerAjustesSigaa(TURMA)).map((a) => a.valor)).toEqual([2, 0])
    expect((await repositorio.listarAuditoriaSigaa(TURMA)).filter((l) => l.acao === 'aceite').map((l) => l.aplicado)).toEqual(['2', '0'])
  })

  it('dia com mais aulas que o comum avisa, antes de preencher, quanto a falta vale', async () => {
    abrir()
    ponte.ler(bruto([['', ''], ['', ''], ['', '']], undefined, [2, 12]), 'l-12')
    expect(await screen.findByText('Dia de 12 aulas: quem faltou leva 12 faltas.')).toBeInTheDocument()
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
    ponte.ler(bruto([['0', '0'], ['0', '0'], ['2', '0']]), 'l-2')
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
    ponte.ler(bruto([['0', '0'], ['0', '2'], ['2', '0']]), 'l-3')
    await usuario.click(await screen.findByRole('button', { name: /diferenças? com o SIGAA/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar o SIGAA' }))
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    await waitFor(() => expect(ponte.entregues).toEqual([{ id: 'l-3', instrucoes: [] }]))
  })
})

describe('a folha e a ponte', () => {
  it('se liga à planilha uma vez só, mesmo redesenhando: sem o relógio do teste também', async () => {
    const iniciar = vi.spyOn(ponte, 'iniciar')
    render(<FolhaSigaa repositorio={repositorio} ponte={ponte} fechar={fechar} />)
    ponte.ler(bruto(), 'l-9')
    await screen.findByRole('heading')
    await new Promise((r) => setTimeout(r, 50))
    expect(iniciar).toHaveBeenCalledTimes(1)
  })
})

describe('a folha recusa, e diz o que fazer', () => {
  it('aberta sem o favorito: diz onde clicar', async () => {
    abrir({ ponte: new PonteSimulada({ ligada: false }) })
    expect(await screen.findByRole('heading', { name: 'Abra pela planilha do SIGAA' })).toBeInTheDocument()
    expect(screen.getByText('No SIGAA, abra "Lançar Freq. em Planilha" da turma e clique no favorito do Adsum.')).toBeInTheDocument()
  })

  it('favorito antigo: pede o novo', async () => {
    abrir()
    const antiga = { ...mensagemDeLeitura('l-1', bruto()), versaoFavorito: VERSAO_DO_FAVORITO + 1 }
    ponte.receber(receberLeitura({ data: antiga, origin: ORIGEM_SIGAA, source: 'x' }, { abridora: 'x' }))
    expect(await screen.findByText('Este favorito é de uma versão antiga. Arraste o novo, nos Ajustes do Adsum, para a barra de favoritos.')).toBeInTheDocument()
  })

  it('página que não dá para ler: diz o motivo', async () => {
    abrir()
    ponte.ler(bruto(undefined, (b) => (b.auxAulas = b.auxAulas.replace('13,10,', '31,9,'))), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Não deu para ler a planilha' })).toBeInTheDocument()
    expect(screen.getByText(/aula 1: data ilegível/)).toBeInTheDocument()
  })

  it('turma que o Adsum não tem', async () => {
    abrir()
    ponte.ler(bruto(undefined, (b) => (b.legenda = 'CIN9999 - OUTRA - Turma: 01 (2026.2)')), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Esta turma não está no Adsum' })).toBeInTheDocument()
  })

  it('planilha que não responde: pede o favorito de novo', async () => {
    abrir({ esperaMs: 20 })
    expect(await screen.findByRole('heading', { name: 'A planilha não respondeu' })).toBeInTheDocument()
  })
})

describe('a folha pergunta a turma, quando a planilha não basta', () => {
  const copiar = (turma: string) =>
    repositorio.listarMatriculados(TURMA).then((ms) => repositorio.salvarTurma(turma, ms.map((m) => ({ ...m, turma }))))

  it('duas turmas servem: o professor escolhe, e a folha segue com a escolhida', async () => {
    const usuario = userEvent.setup()
    await copiar('CIN0144 · T01b')
    abrir()
    ponte.ler(bruto(), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Qual é a turma desta planilha?' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'CIN0144 · T01' }))
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
  })

  it('turma sem o código no nome: pergunta uma vez, e depois lembra', async () => {
    const usuario = userEvent.setup()
    await copiar('Programação')
    const outroCodigo = () => bruto(undefined, (b) => (b.legenda = 'CIN0555 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)'))
    const primeira = abrir()
    ponte.ler(outroCodigo(), 'l-1')
    expect(await screen.findByRole('heading', { name: 'Esta planilha é de CIN0555' })).toBeInTheDocument()
    expect(screen.getByText('A turma Programação do Adsum tem as mesmas matrículas, mas o nome não traz CIN0555.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Usar Programação' }))
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
    primeira.unmount()

    ponte = new PonteSimulada()
    abrir()
    ponte.ler(outroCodigo(), 'l-2')
    expect(await screen.findByRole('heading', { name: 'Tudo confere' })).toBeInTheDocument()
  })

  it('"Não é esta": nada é lembrado', async () => {
    const usuario = userEvent.setup()
    await copiar('Programação')
    abrir()
    ponte.ler(bruto(undefined, (b) => (b.legenda = 'CIN0555 - X - Turma: 01 (2026.2)')), 'l-1')
    await usuario.click(await screen.findByRole('button', { name: 'Não é esta' }))
    expect(await screen.findByRole('heading', { name: 'Esta turma não está no Adsum' })).toBeInTheDocument()
    expect(window.localStorage.getItem('adsum.sigaa.turmas')).toBeNull()
  })
})

describe('a aula dada em outra data', () => {
  const SAB = '2026-10-17'
  const SEG = comoDia('2026-10-19')!
  /** Terça vazia, quinta lançada, e uma segunda (19/10) vazia, sem chamada no Adsum. */
  const comSegunda = (): BrutoPlanilha =>
    brutoDaLeitura({
      id: 'modelo',
      versaoSigaa: '4.15.0.206',
      cabecalhoTurma: 'CIN0144 - PROGRAMAÇÃO INVENTADA - Turma: 01 (2026.2)',
      colunas: [
        { indice: 0, dia: TER, maximo: 2 },
        { indice: 1, dia: QUI, maximo: 2, marca: 'lancado' },
        { indice: 2, dia: SEG, maximo: 2 },
      ],
      linhas: MATRICULAS.map((matricula, indice) => ({
        indice,
        matricula,
        celulas: [{ tipo: 'vazia' }, { tipo: 'lancada', faltas: 0 }, { tipo: 'vazia' }],
      })),
    })

  it('o professor diz em qual aula a chamada entra, e pode desfazer', async () => {
    const usuario = userEvent.setup()
    await repositorio.acrescentarEvento(ev(SAB, { origem: 'professor', resultado: 'ok' }))
    await repositorio.acrescentarEvento(ev(SAB, { origem: 'cracha', resultado: 'ok', matricula: '20260000001' }))
    abrir()
    ponte.ler(comSegunda(), 'l-1')
    expect(await screen.findByText('O SIGAA não tem aula neste dia. Em qual aula ela entra?')).toBeInTheDocument()
    expect(screen.getByText('1 presente, 2 faltas')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Seg, 19/10' }))
    expect(await screen.findByRole('heading', { name: '2 aulas para lançar' })).toBeInTheDocument()
    expect(screen.getByText('Chamada de Sáb, 17/10')).toBeInTheDocument()
    const auditoria = await repositorio.listarAuditoriaSigaa(TURMA)
    expect(auditoria.filter((l) => l.acao === 'remanejo')).toMatchObject([{ dia: '2026-10-19', lido: SAB, matricula: '' }])

    await usuario.click(screen.getByRole('button', { name: 'Desfazer: a chamada de Sáb, 17/10 volta a ficar sem lugar' }))
    expect(await screen.findByRole('heading', { name: '1 aula para lançar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seg, 19/10' })).toBeInTheDocument()
  })
})
