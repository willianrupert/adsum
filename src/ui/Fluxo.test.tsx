import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { Fluxo } from './Fluxo.tsx'
import type { Matriculado } from '../nucleo/tipos.ts'

let bancada: Bancada

const pessoa = (matricula: string, nome: string): Matriculado => ({
  turma: 'IF685 · T01',
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

beforeEach(async () => {
  bancada = await montarBancada()
})

async function turmaInteiraComCracha() {
  await bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('1', 'Ana Paula')])
  await bancada.repositorio.gravarVinculo({
    uidHash: 'aaaa000000000000',
    papel: 'professor',
    nome: 'Ana Paula',
    matricula: '1',
    criadoEm: new Date().toISOString(),
  })
}

describe('a rota decide a tela', () => {
  it('sem turma, pede a turma', async () => {
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Cole sua turma')).toBeInTheDocument()
  })

  it('com tudo pronto, espera o crachá', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Encoste o seu crachá')).toBeInTheDocument()
  })

  // Regressão: este botão existia e não fazia nada — a rota decide pelo estado,
  // e "quero cadastrar mais um" é intenção que nenhum dado expressa.
  it('"Cadastrar mais um crachá" leva à tela de cadastro e volta', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Encoste o seu crachá')

    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mais um crachá' }))
    expect(await screen.findByRole('button', { name: 'Concluir' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Encoste o seu crachá')).toBeInTheDocument()
  })

  it('a engrenagem abre os ajustes e clicar fora fecha', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Encoste o seu crachá')

    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()

    await usuario.click(document.querySelector('.folha__fundo')!)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Ajustes' })).not.toBeInTheDocument(),
    )
  })

  // Sem pasta, os dados existem num navegador — e o app precisa dizer isso em
  // vez de deixar entender que estão guardados. No jsdom não há seletor de
  // diretório, então o aviso é o específico desse caso.
  it('avisa quando não há pasta', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText(/Sem pasta neste navegador/)).toBeInTheDocument()
  })
})

// O caminho que perde trabalho de verdade: aula dada sem pasta, professor
// conclui sem salvar, e a chamada fica só no navegador. Antes disto o app
// esquecia junto com ele — nada na tela, nada na base, e a única memória de que
// havia algo em risco era a do professor.
describe('aula que só existe neste navegador', () => {
  const EVENTO = {
    eventoId: 'web-aaaa-20260819-0001',
    quando: '2026-08-19T10:00:00.000Z',
    turma: 'IF685 · T01',
    matricula: '1',
    nome: 'Ana Paula',
    origem: 'cracha' as const,
    resultado: 'ok' as const,
    uidHash: 'aaaa000000000000',
  }

  it('o repouso cobra a aula por salvar, com turma e quantidade', async () => {
    await turmaInteiraComCracha()
    await bancada.repositorio.acrescentarEvento(EVENTO)
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Uma aula existe só neste navegador')).toBeInTheDocument()
    expect(screen.getByText(/1 registro desde 19 de agosto/)).toBeInTheDocument()
    expect(await screen.findByText(/1 registro ainda não salvo/)).toBeInTheDocument()
  })

  it('salvar limpa a cobrança, e a marca sobrevive ao recarregamento', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    await bancada.repositorio.acrescentarEvento(EVENTO)
    const { unmount } = renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Uma aula existe só neste navegador')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(screen.queryByText('Uma aula existe só neste navegador')).not.toBeInTheDocument(),
    )

    // Gravou no banco, e não só no React: sem isto a cobrança voltaria a cada
    // recarregamento e o professor salvaria a mesma aula todo dia.
    unmount()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Encoste o seu crachá')).toBeInTheDocument()
    expect(screen.queryByText('Uma aula existe só neste navegador')).not.toBeInTheDocument()
  })

  // Cancelar o diálogo não pode limpar a pendência: seria o app esquecendo
  // trabalho que continua só aqui.
  it('um registro novo depois de salvar volta a cobrar', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    await bancada.repositorio.acrescentarEvento(EVENTO)
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Uma aula existe só neste navegador')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(screen.queryByText('Uma aula existe só neste navegador')).not.toBeInTheDocument(),
    )

    await bancada.repositorio.acrescentarEvento({
      ...EVENTO,
      eventoId: 'web-aaaa-20260819-0002',
      quando: '2026-08-19T10:05:00.000Z',
    })
    cleanup()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Uma aula existe só neste navegador')).toBeInTheDocument()
  })
})

// O jsdom se apresenta como um navegador que não é nenhum: para exercitar a
// regra do WebKit é preciso dizer qual navegador é. Trocar o `userAgent` é o
// único jeito, e por isso `ehWebKit` aceita a string por parâmetro — o teste
// mexe no ambiente uma vez, e a lógica em si é testada pura em
// `ambiente/instalacao.test.ts`.
describe('no Safari, instalar vem antes da turma', () => {
  const original = navigator.userAgent

  const fingirSer = (ua: string) =>
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

  afterEach(() => {
    fingirSer(original)
    window.localStorage.clear()
  })

  const SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

  it('ensina o caminho do menu em vez de pedir a turma', async () => {
    fingirSer(SAFARI)
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Instale o Adsum')).toBeInTheDocument()
    expect(screen.getByText('Adicionar ao Dock')).toBeInTheDocument()
    expect(screen.queryByText('Cole sua turma')).not.toBeInTheDocument()
  })

  // Instalar é gesto de menu, e o app não tem como saber se aconteceu. Ficar
  // preso aqui seria pior do que o prazo de sete dias.
  it('"Continuar sem instalar" segue para a turma e não volta a perguntar', async () => {
    const usuario = userEvent.setup()
    fingirSer(SAFARI)
    const { unmount } = renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Instale o Adsum')

    await usuario.click(screen.getByRole('button', { name: 'Continuar sem instalar' }))
    expect(await screen.findByText('Cole sua turma')).toBeInTheDocument()

    unmount()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Cole sua turma')).toBeInTheDocument()
  })

  it('o aviso do canto passa a falar do prazo, não só da falta de pasta', async () => {
    fingirSer(SAFARI)
    window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText(/apaga a base em 7 dias/)).toBeInTheDocument()
  })

  // A tela da base dizia só "os dados ficam no navegador", como se fosse
  // inconveniência. Tranquilizar onde se deveria avisar é o pior defeito que
  // uma tela dessas pode ter.
  it('os ajustes explicam o prazo e o caminho do menu', async () => {
    const usuario = userEvent.setup()
    fingirSer(SAFARI)
    window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Encoste o seu crachá')

    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByText(/sete dias/)).toBeInTheDocument()
    expect(screen.getByText(/Arquivo › Adicionar ao Dock/)).toBeInTheDocument()
  })
})
