import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
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

// O jsdom não tem seletor de pasta, então o conselho de navegador vale nele e
// seria a primeira tela de todo teste. Quem não está testando o conselho começa
// depois dele — dispensar aqui é o equivalente ao professor que já decidiu.
beforeEach(async () => {
  bancada = await montarBancada()
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
})

afterEach(() => window.localStorage.clear())

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
    expect(await screen.findByText('Começar a chamada')).toBeInTheDocument()
  })

  // Regressão: este botão existia e não fazia nada — a rota decide pelo estado,
  // e "quero cadastrar mais um" é intenção que nenhum dado expressa.
  it('"Cadastrar mais um crachá" leva à tela de cadastro e volta', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mais um crachá' }))
    expect(await screen.findByRole('button', { name: 'Concluir' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Começar a chamada')).toBeInTheDocument()
  })

  it('a engrenagem abre os ajustes e clicar fora fecha', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

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

// O gesto do crachá é herança do aparelho, que não tinha teclado nem mouse. Num
// computador o clique é mais simples, e a tela passou a ter uma ação só — o
// crachá continua valendo, mas não é anunciado, porque anunciar dois caminhos
// para a mesma coisa é a decisão que se queria evitar.
describe('abrir e encerrar sem crachá', () => {
  it('o botão abre a chamada, e a tela não oferece outro caminho', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

    expect(screen.queryByText(/encoste/i)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(await screen.findByRole('button', { name: 'Encerrar a chamada' })).toBeInTheDocument()
    expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: 'IF685 · T01' })
  })

  // A linha do log tem de continuar dizendo quem encerrou, mesmo sem toque: o
  // uidHash sai da sessão, que guarda quem abriu.
  it('o botão encerra, e o log registra quem foi', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

    await usuario.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))

    await waitFor(async () =>
      expect(await bancada.repositorio.sessaoAberta()).toBeUndefined(),
    )
    const eventos = await bancada.repositorio.listarEventos()
    const doProfessor = eventos.filter((e) => e.origem === 'professor')
    expect(doProfessor).toHaveLength(2)
    expect(doProfessor.every((e) => e.uidHash === 'aaaa000000000000')).toBe(true)
  })
})

// O fim da linha do "menos decisões": com o horário cadastrado, o professor
// entra na sala e a chamada já está aberta. Nem clique, nem crachá.
describe('a grade abre a chamada sozinha', () => {
  const aulaAgora = async () => {
    const agora = new Date()
    const hhmm = (delta: number) => {
      const d = new Date(agora.getTime() + delta * 60_000)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    await bancada.repositorio.gravarAula({
      uidHashProfessor: 'aaaa000000000000',
      dia: agora.getDay(),
      inicio: hhmm(-30),
      fim: hhmm(30),
      turma: 'IF685 · T01',
    })
  }

  it('abre sem ninguém tocar em nada', async () => {
    await turmaInteiraComCracha()
    await aulaAgora()
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByRole('button', { name: 'Encerrar a chamada' })).toBeInTheDocument()
    expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: 'IF685 · T01' })
  })

  // Fechar às 9h30 uma aula que vai até as 10h não pode ser desfeito pelo
  // relógio no segundo seguinte.
  it('não reabre a chamada que o professor acabou de encerrar', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    await aulaAgora()
    renderizarCom(bancada, <Fluxo />)

    await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
    // Sem pasta o acento é salvar, e concluir vira "concluir sem salvar".
    await usuario.click(await screen.findByRole('button', { name: 'Concluir sem salvar' }))

    // Com grade, o repouso não pede clique nenhum: diz qual aula vem.
    expect(await screen.findByText('Sua próxima aula')).toBeInTheDocument()
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })

  // O caso que faltava provar. Abrir na montagem é o professor que chega e abre
  // o app; este é o app **já aberto na mesa** quando a aula começa — e é o que
  // dá sentido à frase "abre sozinha". Sem o relógio, ele esperaria para sempre.
  it('o relógio abre a chamada quando a aula começa com o app na tela', async () => {
    // Só o intervalo é falso. Fingir o relógio inteiro derruba o Dexie —
    // "Transaction committed too early" —, porque o IndexedDB depende de timers
    // de verdade para fechar transação.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      await turmaInteiraComCracha()
      renderizarCom(bancada, <Fluxo />)
      await screen.findByText('Começar a chamada')

      // A aula entra na grade **depois** de a tela já estar montada.
      await aulaAgora()
      expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000)
      })

      await waitFor(async () =>
        expect(await bancada.repositorio.sessaoAberta()).toMatchObject({
          turma: 'IF685 · T01',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  // Sem grade, "só existe uma turma, abre essa" valeria no domingo à noite.
  it('sem aula na grade, espera o professor', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Começar a chamada')).toBeInTheDocument()
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })
})

// O ensaio precisa alcançar **todos** os estados, senão não serve para validar
// o fluxo. Faltavam dois, e o autor achou os dois: não havia como produzir um
// crachá desconhecido depois da cerimônia, e `P` não fazia nada nem dizia nada
// enquanto o professor não tivesse crachá.
describe('as teclas de ensaio', () => {
  const comEnsaio = () => window.localStorage.setItem('adsum.modoDev', 'sim')

  it('N produz um crachá que o app nunca viu, e abre a busca', async () => {
    const usuario = userEvent.setup()
    comEnsaio()
    await turmaInteiraComCracha()
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      pessoa('1', 'Ana Paula'),
      pessoa('2', 'Breno Oliveira'),
    ])
    renderizarCom(bancada, <Fluxo />)

    await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
    await screen.findByRole('button', { name: 'Encerrar a chamada' })

    await usuario.keyboard('n')
    expect(await screen.findByText('Crachá novo')).toBeInTheDocument()
  })

  // "Como P representa o crachá do professor se ele nem foi cadastrado ainda?"
  // Não representa. A tecla passou a dizer isso em vez de parecer quebrada.
  it('P explica que ainda não há crachá de professor', async () => {
    const usuario = userEvent.setup()
    comEnsaio()
    await bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('1', 'Ana Paula')])
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText(/Encoste o crachá de|Cole sua turma|Tudo pronto/)

    await usuario.keyboard('p')
    expect(await screen.findByText(/Ainda não há crachá de professor/)).toBeInTheDocument()
  })
})

// O modo de ensaio vem desligado, e é o que separa o app publicado do banco de
// testes. A propriedade que mais importa não é a tag sumir: é a tecla morrer.
// Espaço é a tecla que mais se aperta sem querer, e viva ela marcaria presença
// sem crachá nenhum — dado inventado dentro da chamada de verdade.
describe('sem modo de ensaio', () => {
  it('não mostra as teclas de ensaio, mesmo com leitor simulado', async () => {
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

    expect(screen.queryByText('crachá')).not.toBeInTheDocument()
    expect(document.querySelector('kbd')).toBeNull()
  })

  it('espaço não encosta crachá nenhum', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    const antes = await bancada.repositorio.contarEventos()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Começar a chamada')

    await usuario.keyboard(' ')
    await usuario.keyboard('p')

    expect(await bancada.repositorio.contarEventos()).toBe(antes)
    expect(screen.getByText('Começar a chamada')).toBeInTheDocument()
  })
})

// Regressão da pior espécie: a tela da pasta não tinha saída. Cancelar o
// seletor não mudava nada, negar a permissão devolvia à mesma tela, e a rota
// nunca deixava passar — o professor ficava preso e só saía fechando o app.
// Tela sem saída é pior do que a garantia que ela protege, porque a garantia
// depende de o programa ser usado.
describe('a tela da pasta tem saída', () => {
  const comPasta = () =>
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    })

  // Devolve o jsdom ao que ele era: `showDirectoryPicker` é opcional no tipo,
  // então apagar não precisa de escape nenhum.
  afterEach(() => {
    delete window.showDirectoryPicker
  })

  it('dá para seguir sem pasta, e a escolha persiste', async () => {
    const usuario = userEvent.setup()
    comPasta()
    await turmaInteiraComCracha()
    const { unmount } = renderizarCom(bancada, <Fluxo />)

    await screen.findByText('Escolha onde guardar')
    await usuario.click(screen.getByRole('button', { name: 'Seguir sem pasta por enquanto' }))
    expect(await screen.findByText('Tudo pronto')).toBeInTheDocument()

    // Sem gravar a escolha, a tela voltaria a prender no recarregamento.
    unmount()
    renderizarCom(bancada, <Fluxo />)
    expect(await screen.findByText('Tudo pronto')).toBeInTheDocument()
  })

  // Seguir sem pasta não é seguir sem aviso.
  it('quem seguiu sem pasta continua sendo avisado', async () => {
    const usuario = userEvent.setup()
    comPasta()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)

    await screen.findByText('Escolha onde guardar')
    await usuario.click(screen.getByRole('button', { name: 'Seguir sem pasta por enquanto' }))

    expect(await screen.findByText(/Os dados só existem neste navegador/)).toBeInTheDocument()
  })
})

// O `beforeinstallprompt` chega uma vez só, e pode chegar antes de o React
// montar — por isso o ouvinte é de módulo. O teste dispara o evento como o
// Chrome dispararia.
describe('o convite de instalar no Chrome', () => {
  const oferecer = () => {
    // Tipado aqui e não pelo global: `apis.d.ts` não entra no projeto de teste,
    // e o teste só precisa da forma que o app consome.
    const evento = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    window.dispatchEvent(evento)
  }

  // Ele morava só no repouso, e quem abre o Adsum pela primeira vez vai de
  // "escolha a pasta" para "cole sua turma" — podia levar uma aula inteira até
  // parar no repouso. Convite que depende de passar por uma tela específica é
  // convite que não existe.
  it('aparece também antes de haver turma cadastrada', async () => {
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Cole sua turma')

    await act(async () => oferecer())
    expect(await screen.findByText('O Adsum em janela própria')).toBeInTheDocument()
  })

  it('some durante a chamada, onde a tela é da fila', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')

    await act(async () => oferecer())
    await screen.findByText('O Adsum em janela própria')

    await usuario.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    await screen.findByRole('button', { name: 'Encerrar a chamada' })
    expect(screen.queryByText('O Adsum em janela própria')).not.toBeInTheDocument()
  })

  it('aparece no repouso, e some para sempre ao ser recusado', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    const { unmount } = renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')

    await act(async () => oferecer())
    expect(await screen.findByText('O Adsum em janela própria')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Agora não' }))
    await waitFor(() =>
      expect(screen.queryByText('O Adsum em janela própria')).not.toBeInTheDocument(),
    )

    // Insistir a cada abertura é como um convite vira incômodo.
    unmount()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')
    expect(screen.queryByText('O Adsum em janela própria')).not.toBeInTheDocument()
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
    expect(await screen.findByText('Começar a chamada')).toBeInTheDocument()
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
describe('o conselho de navegador vem antes da turma', () => {
  const original = navigator.userAgent

  const fingirSer = (ua: string) =>
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

  beforeEach(() => window.localStorage.clear())
  afterEach(() => fingirSer(original))

  const SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

  // A recomendação é o título, e o caminho do menu é o plano B logo abaixo:
  // a diferença entre os dois arranjos não é de conforto.
  it('recomenda o Chrome primeiro e ensina o menu depois', async () => {
    fingirSer(SAFARI)
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Use o Chrome ou o Edge')).toBeInTheDocument()
    expect(screen.getByText('Vai ficar no Safari?')).toBeInTheDocument()
    expect(screen.getByText('Adicionar ao Dock')).toBeInTheDocument()
    expect(screen.queryByText('Cole sua turma')).not.toBeInTheDocument()
  })

  // A pasta grava no ato; instalar só tira o prazo de sete dias e continua
  // exigindo um clique por aula. A opção mais segura precisa estar dita.
  it('diz que Chrome e Edge são mais seguros, e por quê', async () => {
    fingirSer(SAFARI)
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText(/na hora/)).toBeInTheDocument()
    expect(
      screen.getByText(/Nada depende de você lembrar de salvar no fim da aula/),
    ).toBeInTheDocument()
  })

  // O Firefox não tem pasta, não apaga sozinho e não tem o que instalar: o
  // único ganho real é trocar de navegador, e por isso ele é a ação da tela.
  // Antes disto o Firefox caía direto em "cole sua turma", sem aviso nenhum.
  it('no Firefox a ação é trocar, porque não há conserto no lugar', async () => {
    fingirSer(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    )
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Use o Chrome ou o Edge')).toBeInTheDocument()
    // Sem plano B: no Firefox instalar não muda nada, e oferecer seria mentira.
    expect(screen.queryByText('Vai ficar no Safari?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar assim' })).toBeInTheDocument()
  })

  // Instalar é gesto de menu, e o app não tem como saber se aconteceu. Ficar
  // preso aqui seria pior do que o prazo de sete dias.
  it('"Continuar sem instalar" segue para a turma e não volta a perguntar', async () => {
    const usuario = userEvent.setup()
    fingirSer(SAFARI)
    const { unmount } = renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Use o Chrome ou o Edge')

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

    expect(await screen.findByText(/O Safari pode apagar a base sozinho/)).toBeInTheDocument()
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
    await screen.findByText('Começar a chamada')

    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByText(/sete dias de/)).toBeInTheDocument()
    expect(screen.getByText(/Arquivo › Adicionar ao Dock/)).toBeInTheDocument()
  })
})
