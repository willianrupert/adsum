import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { Fluxo } from './Fluxo.tsx'
import { adiarHorario, dispensarCadastro } from '../ambiente/preferencias.ts'
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

// Quem não está testando o cronograma começa depois dele — é o equivalente ao
// professor que já respondeu "depois". Os testes do cronograma não usam este
// helper, justamente para encontrá-lo.
async function turmaInteiraComCracha() {
  adiarHorario('IF685 · T01')
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

  // Regressão: `professorSemCracha` é lido de novo a cada vínculo gravado, e a
  // rota decidia por ele a cada render. O crachá do professor, tocado no meio
  // da própria cerimônia, mudava esse estado e a rota recalculava para
  // 'pronto' na hora — a tela sumia debaixo do professor antes de ele poder
  // chamar o próximo aluno da fila. Isto é o "não sei o que eu faço depois de
  // cadastrar alguns" relatado ao vivo: o professor seguiu a instrução
  // "comece pelo seu crachá" e foi ejetado da cerimônia sem completar mais
  // ninguém.
  it('o crachá do professor no meio da fila não expulsa a cerimônia antes da hora', async () => {
    const usuario = userEvent.setup()
    adiarHorario('IF685 · T01')
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      {
        turma: 'IF685 · T01',
        chave: 'ana paula mendes de souza',
        matricula: '',
        nomeCompleto: 'ANA PAULA MENDES DE SOUZA',
        nome: 'Ana Paula',
        papel: 'professor',
      },
      {
        turma: 'IF685 · T01',
        chave: '2',
        matricula: '2',
        nomeCompleto: 'BRENO OLIVEIRA FILHO',
        nome: 'Breno Oliveira',
        papel: 'aluno',
      },
    ])
    renderizarCom(bancada, <Fluxo />)

    // A cerimônia abre sozinha chamando o docente primeiro.
    await screen.findByText('Encoste o crachá de')
    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()

    // O crachá do professor: em qualquer outra tela, é o que abre a aula.
    // Aqui, no meio da própria cerimônia, ele só deveria registrar o vínculo.
    await act(async () => bancada.leitor.simular('04a23b91'))

    // A tela continua na cerimônia, chamando quem sobrou — não pulou para o
    // repouso por baixo do professor.
    expect(await screen.findByText('Breno Oliveira')).toBeInTheDocument()
    expect(screen.getByText('Encoste o crachá de')).toBeInTheDocument()

    await act(async () => bancada.leitor.simular('04a23b92'))

    // Com todo mundo vinculado, o botão agora conclui de verdade — e só agora.
    const concluir = await screen.findByRole('button', { name: 'Concluir' })
    await usuario.click(concluir)
    expect(await screen.findByText('Tudo pronto')).toBeInTheDocument()
  })

  // Regressão irmã da anterior, achada testando-a ao vivo: o docente não tem
  // matrícula na página do SIGAA, e `abrirTurma` só reconhecia "já tem
  // crachá" por matrícula. Reabrir "mais um crachá" chamava o professor de
  // novo, sempre — mesmo bug que `recontar()` já tinha corrigido para a
  // contagem de pendentes, só que não aqui.
  it('reabrir "mais um crachá" não chama o professor de novo', async () => {
    const usuario = userEvent.setup()
    adiarHorario('IF685 · T01')
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      {
        turma: 'IF685 · T01',
        chave: 'ana paula mendes de souza',
        matricula: '',
        nomeCompleto: 'ANA PAULA MENDES DE SOUZA',
        nome: 'Ana Paula',
        papel: 'professor',
      },
      {
        turma: 'IF685 · T01',
        chave: '2',
        matricula: '2',
        nomeCompleto: 'BRENO OLIVEIRA FILHO',
        nome: 'Breno Oliveira',
        papel: 'aluno',
      },
      {
        turma: 'IF685 · T01',
        chave: '3',
        matricula: '3',
        nomeCompleto: 'CARLA REGINA DO NASCIMENTO',
        nome: 'Carla Regina',
        papel: 'aluno',
      },
    ])
    renderizarCom(bancada, <Fluxo />)

    // Professor e Breno chegam; Carla ainda não — é o "só alguns" da sala.
    await screen.findByText('Ana Paula')
    await act(async () => bancada.leitor.simular('04a23b91'))
    await screen.findByText('Breno Oliveira')
    await act(async () => bancada.leitor.simular('04a23b92'))

    await usuario.click(await screen.findByRole('button', { name: 'Concluir' }))
    await screen.findByText('Tudo pronto')

    // Reabre para dar o crachá de quem faltou.
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mais um crachá' }))

    // Chama Carla, não Ana Paula de novo.
    expect(await screen.findByText('Carla Regina')).toBeInTheDocument()
    expect(screen.queryByText('Ana Paula', { selector: '.chamado__nome' })).not.toBeInTheDocument()
  })

  // "O botão pra iniciar e encerrar tem que ser equivalente. Passar o
  // crachá do professor é opcional." Sem vínculo de professor nenhum — nem
  // real, nem adiado —, "Começar a chamada" tinha que funcionar mesmo assim.
  it('"Começar a chamada" funciona mesmo sem crachá de professor nenhum', async () => {
    const usuario = userEvent.setup()
    adiarHorario('IF685 · T01')
    await bancada.repositorio.salvarTurma('IF685 · T01', [
      {
        turma: 'IF685 · T01',
        chave: 'ana paula mendes de souza',
        matricula: '',
        nomeCompleto: 'ANA PAULA MENDES DE SOUZA',
        nome: 'Ana Paula',
        papel: 'professor',
      },
      pessoa('2', 'Breno Oliveira'),
    ])
    // Ninguém tocou em crachá nenhum: pula a cerimônia de propósito.
    dispensarCadastro()

    renderizarCom(bancada, <Fluxo />)
    await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))

    // Abriu — e o vínculo criado usa o nome do docente que o SIGAA apontou.
    await screen.findByText('IF685 · T01')
    const vinculos = await bancada.repositorio.listarVinculos()
    expect(vinculos).toHaveLength(1)
    expect(vinculos[0]).toMatchObject({ papel: 'professor', nome: 'Ana Paula' })

    const sessao = await bancada.repositorio.sessaoAberta()
    expect(sessao?.uidHashProfessor).toBe(vinculos[0].uidHash)
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

// A grade existia só como três campos nos Ajustes, e ninguém preenche três
// campos cinco vezes. Vem depois de colar a lista porque precisa saber de qual
// turma fala, e é pulável porque a chamada funciona sem ela.
describe('o cronograma da turma', () => {
  const comTurma = () =>
    bancada.repositorio.salvarTurma('IF685 · T01', [pessoa('1', 'Ana Paula')])

  it('vem logo depois de colar a lista', async () => {
    await comTurma()
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Quando esta turma tem aula')).toBeInTheDocument()
    expect(screen.getByText('IF685 · T01')).toBeInTheDocument()
  })

  it('tocar num horário e salvar grava a aula daquela turma', async () => {
    const usuario = userEvent.setup()
    await comTurma()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    await usuario.click(screen.getByRole('button', { name: 'QUA, 13:00 às 14:50' }))
    expect(screen.getByText(/1 horário/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar horário' }))

    await waitFor(async () => {
      const aulas = await bancada.repositorio.listarAulas()
      expect(aulas).toHaveLength(1)
      expect(aulas[0]).toMatchObject({ dia: 3, inicio: '13:00', fim: '14:50', turma: 'IF685 · T01' })
    })
  })

  // Salvar sem marcar nada é o mesmo que adiar: sem isto a tela voltaria na
  // hora, porque a turma continua sem horário.
  it('"Depois" e salvar em branco não prendem o professor aqui', async () => {
    const usuario = userEvent.setup()
    await comTurma()
    const { unmount } = renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    await usuario.click(screen.getByRole('button', { name: 'Depois' }))
    await waitFor(() =>
      expect(screen.queryByText('Quando esta turma tem aula')).not.toBeInTheDocument(),
    )

    unmount()
    renderizarCom(bancada, <Fluxo />)
    await waitFor(() =>
      expect(screen.queryByText('Quando esta turma tem aula')).not.toBeInTheDocument(),
    )
  })

  // Aula de 4h ocupa dois blocos seguidos, e três encontros na semana custavam
  // seis cliques certeiros. Arrastando, é um gesto.
  it('arrastar pinta vários blocos de uma vez', async () => {
    const usuario = userEvent.setup()
    await comTurma()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    const manha = screen.getByRole('button', { name: 'QUA, 08:00 às 09:50' })
    const meio = screen.getByRole('button', { name: 'QUA, 10:00 às 11:50' })

    fireEvent.pointerDown(manha)
    fireEvent.pointerEnter(meio)
    fireEvent.pointerUp(window)

    expect(screen.getByText(/2 horários/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar horário' }))
    await waitFor(async () =>
      expect(await bancada.repositorio.listarAulas()).toHaveLength(2),
    )
  })

  // O primeiro bloco decide o modo. Alternar cada um por onde se passa
  // transformaria um tremor da mão em xadrez.
  it('começar num bloco marcado apaga em vez de pintar', async () => {
    await comTurma()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    const a = screen.getByRole('button', { name: 'SEG, 13:00 às 14:50' })
    const b = screen.getByRole('button', { name: 'SEG, 15:00 às 16:50' })

    // Pinta os dois.
    fireEvent.pointerDown(a)
    fireEvent.pointerEnter(b)
    fireEvent.pointerUp(window)
    expect(screen.getByText(/2 horários/)).toBeInTheDocument()

    // Começando por um já marcado, o mesmo arrasto apaga os dois.
    fireEvent.pointerDown(a)
    fireEvent.pointerEnter(b)
    fireEvent.pointerUp(window)
    expect(screen.getByText('Nenhum horário escolhido')).toBeInTheDocument()
  })

  // Sair e voltar sobre a mesma célula não pode alternar de novo: passar o
  // mouse de lado viraria pisca-pisca.
  it('um bloco só muda uma vez por arrasto', async () => {
    await comTurma()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    const a = screen.getByRole('button', { name: 'TER, 13:00 às 14:50' })
    const b = screen.getByRole('button', { name: 'TER, 15:00 às 16:50' })

    fireEvent.pointerDown(a)
    fireEvent.pointerEnter(b)
    fireEvent.pointerEnter(a)
    fireEvent.pointerEnter(b)
    fireEvent.pointerUp(window)

    expect(screen.getByText(/2 horários/)).toBeInTheDocument()
  })

  // Trocar o horário de uma turma não pode apagar o das outras: era isso que
  // `zerarAulas` fazia, e por isso a porta ganhou `definirHorarioDaTurma`.
  it('salvar uma turma não mexe no horário das outras', async () => {
    const usuario = userEvent.setup()
    await bancada.repositorio.gravarAula({
      uidHashProfessor: 'p',
      dia: 5,
      inicio: '08:00',
      fim: '09:50',
      turma: 'IF969 · T02',
    })
    await comTurma()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Quando esta turma tem aula')

    await usuario.click(screen.getByRole('button', { name: 'SEG, 10:00 às 11:50' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar horário' }))

    await waitFor(async () => {
      const aulas = await bancada.repositorio.listarAulas()
      expect(aulas.map((a) => a.turma).sort()).toEqual(['IF685 · T01', 'IF969 · T02'])
    })
  })
})

// Regressão de desenho: colar a lista da turma e cair num painel de nove
// capacidades do navegador. O professor não pediu diagnóstico, ele quer saber o
// que fazer agora — e o CLAUDE.md já dizia que diagnóstico é item discreto
// atrás da engrenagem, não a tela em que se para.
describe('quando o leitor não está lendo', () => {
  it('mostra uma frase e uma ação, não o diagnóstico inteiro', async () => {
    await turmaInteiraComCracha()
    await bancada.leitor.parar()
    renderizarCom(bancada, <Fluxo />)

    expect(await screen.findByText('Ligue o leitor de crachá')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    // O painel de capacidades não pertence a esta tela.
    expect(screen.queryByText('Contexto seguro (HTTPS)')).not.toBeInTheDocument()
    expect(screen.queryByText('Últimas leituras')).not.toBeInTheDocument()
  })

  it('tentar de novo religa o leitor e devolve a tela ao lugar', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    await bancada.leitor.parar()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Ligue o leitor de crachá')

    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Tudo pronto')).toBeInTheDocument()
  })
})

// Encerrar por engano é fácil: o crachá do professor encerra, e ele também é o
// crachá de alguém que pode encostar sem pensar. Sem reabrir, a saída seria
// abrir outra chamada — e aí a aula fica partida em dois arquivos.
describe('reabrir a chamada encerrada por engano', () => {
  it('volta para a chamada, na mesma turma', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)

    await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
    await screen.findByText(/Chamada encerrada/)

    await usuario.click(
      screen.getByRole('button', { name: 'Encerrei sem querer, reabrir a chamada' }),
    )

    expect(await screen.findByRole('button', { name: 'Encerrar a chamada' })).toBeInTheDocument()
    expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: 'IF685 · T01' })
  })

  // O log conta o que aconteceu, inclusive que foi reaberta.
  it('a reabertura fica no log, como qualquer abertura', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)

    await usuario.click(await screen.findByRole('button', { name: 'Começar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Encerrar a chamada' }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Encerrei sem querer, reabrir a chamada' }),
    )

    await waitFor(async () => {
      const eventos = await bancada.repositorio.listarEventos()
      expect(eventos.filter((e) => e.origem === 'professor')).toHaveLength(3)
    })
  })
})

// Os Ajustes mostravam tudo de uma vez: pasta, vínculos, grade, registros, sal e
// diagnóstico empilhados. Tudo necessário, e por isso mesmo impossível de achar.
describe('os Ajustes se recolhem', () => {
  it('as tabelas grandes começam fechadas, e o cabeçalho abre', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')
    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))

    const vinculos = await screen.findByRole('button', { name: /Vínculos/ })
    expect(vinculos).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByPlaceholderText('filtrar por nome ou hash')).not.toBeInTheDocument()

    await usuario.click(vinculos)
    expect(vinculos).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByPlaceholderText('filtrar por nome ou hash')).toBeInTheDocument()
  })

  // Botão de zerar ao lado de um título recolhido é convite a clicar sem ver
  // no quê.
  it('as ações somem com o painel fechado', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')
    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))

    await screen.findByRole('button', { name: /Registros/ })
    expect(screen.queryByRole('button', { name: 'Zerar registros' })).not.toBeInTheDocument()
  })

  // A mesma grade do cronograma, e não a lista de campos que existia aqui.
  it('a grade horária é a semana visual', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')
    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))

    // Todos começam fechados, sem exceção: regra com exceção é regra que o
    // usuário precisa decorar.
    await usuario.click(await screen.findByRole('button', { name: /Grade horária/ }))
    expect(
      await screen.findByRole('group', { name: 'Horários de IF685 · T01' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QUA, 13:00 às 14:50' })).toBeInTheDocument()
  })
})

// Nota: desconectar a pasta não tem teste de tela. O handle de mentira não
// sobrevive ao `structuredClone` do IndexedDB, então não há como montar o Fluxo
// com uma pasta ligada em jsdom — e um teste que finge a pasta não provaria o
// que interessa. `esquecerPasta` está coberto no adaptador.

// Existia só no modo de ensaio, e o professor real também precisa: fim de
// semestre, máquina que muda de dono, refazer o cadastro sem resíduo.
describe('recomeçar do zero', () => {
  it('apaga a base e diz que os arquivos da pasta ficam', async () => {
    const usuario = userEvent.setup()
    await turmaInteiraComCracha()
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Tudo pronto')

    await usuario.click(screen.getByRole('button', { name: 'Ajustes' }))
    await usuario.click(await screen.findByRole('button', { name: /Recomeçar do zero/ }))

    // O texto é o que impede o professor de apagar achando que apagou os dois,
    // ou de não apagar achando que apagaria.
    expect(screen.getByText(/Não apaga os arquivos da pasta/)).toBeInTheDocument()
    expect(screen.getByText(/preferências/)).toBeInTheDocument()
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
    await usuario.click(await screen.findByRole('button', { name: /Onde os dados ficam/ }))
    expect(await screen.findByText(/sete dias de/)).toBeInTheDocument()
    expect(screen.getByText(/Arquivo › Adicionar ao Dock/)).toBeInTheDocument()
  })
})
