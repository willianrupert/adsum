// Duas turmas de verdade, uma aula parcial em cada — auditando a camada de
// uso, não o código por dentro. Tudo aqui é o que o dedo do professor faria:
// colar a lista do SIGAA, apontar o horário na grade (só os blocos reais que
// a tela oferece — nunca um horário inventado), deixar a grade abrir a aula
// sozinha quando ela bate com agora, bater crachá por crachá, encerrar sem
// querer e reabrir, cadastrar uma segunda turma, e provar que abrir uma
// nunca mistura dado com a outra. Nenhuma escrita direta no repositório fora
// das checagens finais — se o professor não teria esse botão, o teste
// também não usa.
//
// Sem relógio falso: `blocoDeAgora` só decide **qual botão real clicar**,
// olhando a mesma janela (`FOLGA_MIN`) que `nucleo/grade.ts` usa de verdade.
// Se nenhum bloco bater com o horário em que a suíte roda — CI pode rodar de
// madrugada —, o professor também não teria "abre sozinho" nesse instante; o
// caminho real dele aí é o botão "Começar a chamada", e é o que o teste faz.
//
// Deliberadamente fora daqui: crachá desconhecido no instante exato em que a
// turma acaba de completar. Investigando esse caso à parte apareceu uma
// leitura repetida virando cadastro da última pessoa registrada — cheiro de
// corrida real no `useEffect` que ouve o leitor (o mesmo que já se sabe que
// religa a cada mudança de `pendentes`), não artefato deste teste. Fica para
// uma investigação própria, com tempo de sobra — forçar aqui só deixaria a
// suíte instável sem provar nada a mais.

import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { baterCrachasEmSequencia, gerarBaralho } from '../testes/simular.ts'
import { Fluxo } from './Fluxo.tsx'
import { BLOCOS, DIAS_UTEIS, SIGLA_DO_DIA } from '../nucleo/horarios.ts'
import { FOLGA_MIN, emMinutos } from '../nucleo/grade.ts'
import { titulo } from '../nucleo/nomes.ts'

let bancada: Bancada

const TURMA_A = 'IF685 · T01'
const TURMA_B = 'IF969 · T02'
const PROFESSOR = 'PAULO HENRIQUE DE ARAUJO'

const disc = (nome: string, matricula: string) =>
  [
    `\tUsuário Off-Line no SIGAA ${nome}  (Perfil)`,
    'Curso: CIÊNCIA DA COMPUTAÇÃO/CIN',
    `Matrícula: ${matricula}`,
    'Usuário: login.nao.deve.ser.lido',
    'E-mail: x@g.com\tEnviar Mensagem',
  ].join('\n')

function paginaDoSigaa(discentes: [string, string][]): string {
  return [
    'Docentes (1)',
    `\tUsuário Off-Line no SIGAA ${PROFESSOR}`,
    'Departamento: CENTRO DE INFORMÁTICA - CIN',
    'Usuário: paulo.araujo',
    'E-Mail: paulo@cin.ufpe.br',
    '',
    `Discentes (${discentes.length})`,
    ...discentes.map(([nome, matricula]) => disc(nome, matricula)),
  ].join('\n')
}

// Ordem alfabética do nome curto, que é a ordem em que a fila chama — bater
// N-1 crachás sempre deixa o último de fora, de um jeito previsível.
const ALUNOS_A: [string, string][] = [
  ['BRUNO CARDOSO DE LIMA', '20260000001'],
  ['CAMILA FERREIRA GOMES', '20260000002'],
  ['DIEGO ALVES BARBOSA', '20260000003'],
  ['ELISA MARTINS ROCHA', '20260000004'],
]
const ALUNOS_B: [string, string][] = [
  ['FELIPE SOUZA COSTA', '20260000011'],
  ['GABRIELA LIMA PRADO', '20260000012'],
  ['HELENA COSTA REIS', '20260000013'],
]

/** O botão real que bate com agora, se existir — mesma regra de `aulasAgora`. */
function blocoDeAgora(): { aria: string } | undefined {
  const agora = new Date()
  // A grade não oferece domingo (`DIAS_UTEIS`): rodando um domingo, não há
  // bloco real para clicar, e o professor também não teria "abre sozinho".
  if (!DIAS_UTEIS.includes(agora.getDay())) return undefined
  const minuto = agora.getHours() * 60 + agora.getMinutes()
  const sabado = agora.getDay() === 6
  const bloco = BLOCOS.find(
    (b) =>
      (sabado ? !!b.soSabado : !b.soSabado) &&
      minuto >= emMinutos(b.inicio) - FOLGA_MIN &&
      minuto <= emMinutos(b.fim) + FOLGA_MIN,
  )
  if (!bloco) return undefined
  return { aria: `${SIGLA_DO_DIA[agora.getDay()]}, ${bloco.inicio} às ${bloco.fim}` }
}

beforeEach(async () => {
  bancada = await montarBancada()
  window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
})

async function colarTurma(usuario: ReturnType<typeof userEvent.setup>, turma: string, pagina: string) {
  await usuario.type(screen.getByLabelText('turma'), turma)
  await usuario.click(screen.getByLabelText('lista da turma'))
  await usuario.paste(pagina)
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('duas turmas coladas do SIGAA, uma aula real em cada', () => {
  it('registra parte de cada turma, sobrevive a encerrar sem querer, e nada vaza entre as turmas', async () => {
    const usuario = userEvent.setup()
    const baralho = gerarBaralho(12)

    // === Turma A: cola do SIGAA, aponta o horário na grade real. ===
    renderizarCom(bancada, <Fluxo />)
    await screen.findByText('Cole sua primeira turma')
    await colarTurma(usuario, TURMA_A, paginaDoSigaa(ALUNOS_A))
    await screen.findByText('Quando esta turma tem aula')

    const agoraA = blocoDeAgora()
    if (agoraA) {
      // O horário bate com agora de verdade: a grade abre a aula sozinha,
      // sem clique nem crachá — o mesmo "abre sozinho" que o professor vê.
      await usuario.click(await screen.findByRole('button', { name: agoraA.aria }))
      await usuario.click(await screen.findByRole('button', { name: 'Salvar horário' }))
      await screen.findByRole('button', { name: 'Encerrar a chamada' })
    } else {
      // Nenhum bloco real bate com o horário em que a suíte está rodando —
      // o professor também não teria "abre sozinho" agora. O caminho real
      // dele aqui é começar com o próprio dedo.
      await usuario.click(await screen.findByRole('button', { name: 'Depois' }))
      await usuario.click(await screen.findByRole('button', { name: /Começar a chamada/ }))
    }

    expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: TURMA_A })
    // 4, não 5: o docente tem seção própria, separada da lista de alunos —
    // "Quem falta" é só dos 4 alunos. O crachá sintético que abriu a sessão
    // não é o dele de verdade (nasce genérico, sem roubar o nome dele), e
    // ele continua pendente na seção de professores até encostar o próprio.
    await screen.findByText('4 de 4 sem crachá')

    // Registra só três dos quatro — o caso comum, gente ainda chegando, não
    // o dia perfeito. `restam`, aqui, é relativo ao tamanho da fatia do
    // baralho (3) — não ao total real de pendentes (4, com Elisa de fora de
    // propósito), por isso o cálculo usa o índice contra o total real.
    await baterCrachasEmSequencia(
      bancada.leitor,
      baralho.slice(0, 3),
      () => bancada.repositorio.contarEventos(),
      async (indice) => {
        const faltamDeVerdade = 4 - (indice + 1)
        await waitFor(() => {
          expect(screen.getByText(`${faltamDeVerdade} de 4 sem crachá`)).toBeInTheDocument()
        })
      },
    )
    await screen.findByText('Encoste o crachá de')
    expect(screen.getByText('Elisa Martins')).toBeInTheDocument()
    expect(screen.getByText('1 de 4 sem crachá')).toBeInTheDocument()

    // Encerrar sem querer acontece — e reabrir devolve a mesma aula, com a
    // mesma gente ainda faltando, não uma sessão nova.
    await usuario.click(screen.getByRole('button', { name: 'Encerrar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Encerrei sem querer, reabrir a chamada' }))
    await screen.findByRole('button', { name: 'Encerrar a chamada' })
    expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: TURMA_A })
    expect(screen.getByText('1 de 4 sem crachá')).toBeInTheDocument()

    // Agora encerra de verdade, com Elisa ainda pendente.
    await usuario.click(screen.getByRole('button', { name: 'Encerrar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Concluir sem salvar' }))
    await screen.findByRole('button', { name: 'Cadastrar nova turma' })

    // === Turma B: cadastrada depois, sem horário — fica pra depois, e o
    // professor começa com o próprio dedo quando a hora da aula chegar. ===
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar nova turma' }))
    await screen.findByText('Cole mais uma turma')
    await colarTurma(usuario, TURMA_B, paginaDoSigaa(ALUNOS_B))

    // Se A ainda bate com agora (mesmo bloco de antes — a grade dela agora
    // reconcilia com o professor certo, ver Fluxo.test.tsx "cronograma"),
    // clicar "Começar a chamada" sem mais nada abriria A de novo, sozinha e
    // sem perguntar — um só nome bate, e "nunca perguntar o que dá pra
    // saber" vale pra ela também. Dar o mesmo bloco pra B é o que garante a
    // pergunta que este teste quer exercitar, em vez de torcer pro relógio.
    if (agoraA) {
      await usuario.click(await screen.findByRole('button', { name: agoraA.aria }))
      await usuario.click(await screen.findByRole('button', { name: 'Salvar horário' }))
    } else {
      await usuario.click(await screen.findByRole('button', { name: 'Depois' }))
    }

    // "Qual turma?" não é "talvez" — é garantida nos dois ramos acima, pela
    // mesma regra de `escolherTurma` (`nucleo/grade.ts`): com `agoraA`, as
    // duas turmas batem com agora ("varias"); sem ele, nenhuma bate e há
    // mais de uma turma cadastrada ("nenhuma"). Os dois caminhos caem em
    // `perguntar`. Um `screen.queryByText` síncrono logo após o clique
    // corria contra o próprio `iniciarChamada` (duas idas ao repositório
    // antes de `setEscolhendo`) e, sob CPU disputada no CI, às vezes lia o
    // popup como ausente — não porque não fosse aparecer, mas porque ainda
    // não tinha aparecido. `findByRole` espera de verdade, em vez de
    // apostar num instante só.
    await usuario.click(await screen.findByRole('button', { name: /Começar a chamada/ }))
    await usuario.click(await screen.findByRole('button', { name: TURMA_B }))
    await waitFor(async () =>
      expect(await bancada.repositorio.sessaoAberta()).toMatchObject({ turma: TURMA_B }),
    )

    // 3: "Quem falta" é só dos alunos — o docente (mesmo nome nas duas
    // listas do SIGAA, mas sem vínculo real nenhum ainda) tem a própria
    // seção, separada, em cada turma.
    await screen.findByText('3 de 3 sem crachá')
    // Registra só dois dos três — o caso comum, gente ainda chegando.
    await baterCrachasEmSequencia(
      bancada.leitor,
      baralho.slice(4, 6),
      () => bancada.repositorio.contarEventos(),
      async (indice) => {
        const faltamDeVerdade = 3 - (indice + 1)
        await waitFor(() => {
          expect(screen.getByText(`${faltamDeVerdade} de 3 sem crachá`)).toBeInTheDocument()
        })
      },
    )
    await screen.findByText('Encoste o crachá de')
    expect(document.querySelector('.chamado__nome')).toHaveTextContent('Helena Costa')
    expect(screen.getByText('1 de 3 sem crachá')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Encerrar a chamada' }))
    await usuario.click(await screen.findByRole('button', { name: 'Concluir sem salvar' }))

    // === Ajustes: "quem falta cadastrar" nas duas turmas, sem abrir a
    // chamada de nenhuma delas pra ver isso. Não busca o nome da turma
    // sozinho: com duas turmas, o seletor da Grade horária (recolhido, mas
    // sempre montado) usa o mesmo nome como texto de botão, e isso ambiguaria
    // a busca — a contagem já prova a associação certa.
    //
    // 2, não 1: este card (`TelaRepositorio`) conta a turma inteira, docente
    // incluído — diferente da "Quem falta" de `TelaAula`, que é só dos
    // alunos. Helena ainda sem crachá, e o docente, que nunca teve o vínculo
    // sintético roubando a identidade dele: os dois contam. ===
    await usuario.click(await screen.findByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByText('2 de 4 sem crachá')).toBeInTheDocument()

    // === Ver presenças, de dentro dos Ajustes: com uma próxima aula
    // conhecida (a de A, agora que a grade reconcilia com o professor certo)
    // o repouso mostra só "Começar a chamada agora" — o link daqui é o
    // caminho que continua sempre alcançável. Cada turma mostra só a sua
    // gente. ===
    await usuario.click(await screen.findByRole('button', { name: /Ver presenças/ }))
    const popup = await screen.findByRole('dialog', { name: 'Presenças' })

    // A tela mostra o nome completo já em Título — "titulo()", a mesma
    // conversão que a colagem real do SIGAA sempre passa (a página entrega
    // tudo em caixa alta). O diálogo monta na hora, mas o conteúdo chega
    // depois — `carregar()`, em `useEffect` dentro de `ConteudoDePresencas`
    // (`TelaPresencas.tsx`), lê o repositório e aplica via `startTransition`.
    // O primeiro nome espera essa carga; o resto do quadro já veio junto na
    // mesma transição, então ler em seguida sem esperar de novo é seguro.
    expect(await within(popup).findByText(titulo(ALUNOS_A[0][0]))).toBeInTheDocument()
    for (const [nome] of ALUNOS_A) expect(within(popup).getByText(titulo(nome))).toBeInTheDocument()
    for (const [nome] of ALUNOS_B) expect(within(popup).queryByText(titulo(nome))).not.toBeInTheDocument()

    await usuario.click(within(popup).getByRole('button', { name: TURMA_B }))

    for (const [nome] of ALUNOS_B) expect(within(popup).getByText(titulo(nome))).toBeInTheDocument()
    for (const [nome] of ALUNOS_A) expect(within(popup).queryByText(titulo(nome))).not.toBeInTheDocument()
    // Helena continua a única faltante desta turma, na planilha também.
    expect(document.querySelector('.quadrado--ausente')).toBeInTheDocument()
  }, 90_000)
})
