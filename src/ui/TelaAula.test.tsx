import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaAula } from './TelaAula.tsx'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { professorAtual } from '../ambiente/preferencias.ts'

const TURMA = 'IF685 · T01'
const CRACHA_DA_ANA = '04a23b91'
const CRACHA_DO_BRENO = '0499aa77'
const CRACHA_NOVO = '0471c2d8'

const pessoa = (matricula: string, nome: string): Matriculado => ({
  turma: TURMA,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto: `${nome.toUpperCase()} DA SILVA`,
  papel: 'aluno',
})

const ANA = pessoa('20250000001', 'Ana Paula')
const BRENO = pessoa('20250000002', 'Breno Oliveira')

let bancada: Bancada

const SESSAO = {
  turma: TURMA,
  abertaEm: new Date(Date.now() - 10 * 60_000).toISOString(),
  uidHashProfessor: 'professor',
}

beforeEach(async () => {
  bancada = await montarBancada()
  await bancada.repositorio.abrirSessao(SESSAO)
  // `localStorage` é compartilhado pela suíte inteira — ver `preferencias.test.ts`.
  window.localStorage.removeItem('adsum.professor.atual')
})

async function comCrachaDaAna() {
  const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_DA_ANA))
  await bancada.repositorio.gravarVinculo({
    uidHash,
    papel: 'aluno',
    nome: ANA.nome,
    matricula: ANA.matricula,
    criadoEm: new Date().toISOString(),
  })
}

function montar(pendentes: Matriculado[], daTurma = [ANA, BRENO]) {
  return renderizarCom(
    bancada,
    <TelaAula sessao={SESSAO} pendentes={pendentes} daTurma={daTurma} aoMudarBase={() => {}} />,
  )
}

/** O painel "Professores" nasce fechado (foco em aluno é o padrão — ver o
    comentário na Painel dele, em `TelaAula.tsx`), e fechado ele é `inert`:
    nada dentro dele é alcançável por `getByRole` até abrir. */
async function abrirProfessores(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole('button', { name: /^Professores/ }))
}

describe('a chamada', () => {
  it('conta presença de quem já tem crachá', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  // Repetido entra no log como duplicado e não mexe no contador.
  it('o mesmo crachá duas vezes não conta duas presenças', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    await waitFor(async () => expect(await bancada.repositorio.contarEventos()).toBe(2))
    expect(screen.getByText('1')).toBeInTheDocument()
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos.map((e) => e.resultado).sort()).toEqual(['duplicado', 'ok'])
  })
})

// A cerimônia deixou de ser uma tela à parte: é esta mesma tabela, sempre que
// há gente pendente — não só quando é literalmente o primeiro dia. Cobrar
// "faltam 2" só quando é dia 1 e calar quando falta 1 de 50 era a mesma
// inconsistência que motivou a unificação.
describe('quem falta', () => {
  it('aparece com qualquer gente pendente, mesmo que o resto já tenha crachá', () => {
    montar([BRENO])
    expect(screen.getByText('Lista de alunos')).toBeInTheDocument()
    expect(screen.getByText(/1 de 2 sem crachá/)).toBeInTheDocument()
  })

  // Até 17/09/2026, a tabela sumia inteira quando ninguém estava pendente —
  // exatamente o motivo da reclamação em uso real: turma 100% vinculada
  // ficava sem nenhuma lista na tela, sem jeito de corrigir presença de
  // quem já tinha crachá. Agora ela continua, sempre que há gente na turma.
  it('continua mostrando a lista mesmo quando ninguém está pendente', () => {
    montar([])
    expect(screen.getByText('Lista de alunos')).toBeInTheDocument()
    expect(screen.getByDisplayValue(ANA.nome)).toBeInTheDocument()
    expect(screen.getByDisplayValue(BRENO.nome)).toBeInTheDocument()
    expect(screen.queryByText(/Turma completa/)).not.toBeInTheDocument()
  })

  // Modo comum é o padrão: ninguém chamado sozinho. O nome grande na tela só
  // aparece quando o professor pede — ver o comentário no topo do arquivo.
  it('não chama ninguém sozinha — mostra o convite para chamar nomes', () => {
    montar([ANA, BRENO])
    expect(screen.queryByText('Ana Paula', { selector: '.chamado__nome' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Chamar nomes' })).toBeInTheDocument()
    expect(screen.getByText('0 de 2 com crachá')).toBeInTheDocument()
  })

  // Progresso, não pendência: o convite conta quem já tem crachá, não quem
  // falta — o mesmo "Quem falta" já diz isso de outro jeito, logo abaixo.
  it('o convite mostra quantos já têm crachá, não quantos faltam', async () => {
    await comCrachaDaAna()
    montar([BRENO])
    expect(screen.getByText('1 de 2 com crachá')).toBeInTheDocument()
  })

  it('"Chamar nomes" entra no modo de chamar, no primeiro pendente', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  // Modo comum: crachá desconhecido pergunta de quem é, mesmo sem ninguém
  // chamado — é o caso mais comum, turma com muita gente ainda sem crachá,
  // e quem encosta não é necessariamente alguém que o professor está
  // observando.
  it('modo comum: crachá desconhecido abre a busca, confirma e conta presença — sem entrar no modo de chamar', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    expect(await screen.findByText('Crachá novo')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Buscar na turma'), '{Enter}')

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome)).toEqual(['Ana Paula'])
    })
    // A mesma leitura virou presença, não só cadastro. Esperado, e não lido
    // na hora: o vínculo é gravado antes do evento (ver `vincularCracha`), e
    // numa máquina lenta a asserção chegava no meio dos dois.
    await waitFor(async () => {
      const [evento] = await bancada.repositorio.listarEventos()
      expect(evento).toMatchObject({ nome: 'Ana Paula', resultado: 'ok', origem: 'cracha' })
    })
    // Confirmar na busca não chama Breno sozinho — o convite continua ali.
    expect(screen.queryByText('Breno Oliveira', { selector: '.chamado__nome' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Chamar nomes' })).toBeInTheDocument()
  })

  // O caso que motivou a busca existir: turma com muita gente ainda sem
  // crachá, e quem encosta o crachá pode não ser quem o app palpitaria.
  it('modo comum: crachá desconhecido vai para quem foi escolhido na busca', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByText(BRENO.nomeCompleto))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome)).toEqual(['Breno Oliveira'])
    })
  })

  // Modo de chamar nomes: o professor pediu explicitamente, está observando
  // esta pessoa encostar — cadastro direto, sem perguntar de novo.
  it('modo de chamar nomes: crachá desconhecido cadastra direto no chamado, e avança para o próximo', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome)).toEqual(['Ana Paula'])
    })
    // A mesma leitura virou presença, não só cadastro. Esperado, e não lido
    // na hora: o vínculo é gravado antes do evento (ver `vincularCracha`), e
    // numa máquina lenta a asserção chegava no meio dos dois.
    await waitFor(async () => {
      const [evento] = await bancada.repositorio.listarEventos()
      expect(evento).toMatchObject({ nome: 'Ana Paula', resultado: 'ok', origem: 'cracha' })
    })
    // Avançou sozinha para quem sobrou, sem ninguém clicar.
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  it('continua depois do primeiro cadastro — não desaparece assim que alguém entra', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    expect(screen.getByText(/2 de 2 sem crachá/)).toBeInTheDocument()

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await screen.findByText('Crachá novo')
    await usuario.type(screen.getByLabelText('Buscar na turma'), '{Enter}')
    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(1))

    expect(screen.getByText('Lista de alunos')).toBeInTheDocument()
  })

  // Sem ninguém chamado, a primeira seta pousa no início da fila — não pula
  // ele. É gesto explícito o bastante para entrar no modo de chamar nomes,
  // igual a um clique em "Chamar nomes".
  it('as setas entram no modo de chamar nomes e andam pela fila de pendentes', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    await usuario.keyboard('{ArrowRight}')
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
    await usuario.keyboard('{ArrowRight}')
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    await usuario.keyboard('{ArrowLeft}')
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  // "Chamar" alcança qualquer linha, não só a primeira — é o que a cerimônia
  // já garantia com a tabela completa, e a fila sozinha não tinha. Com
  // ninguém chamado ainda, as duas linhas mostram "Chamar" — por isso o
  // clique é escopado à linha do Breno.
  it('"Chamar" numa linha específica entra direto nela', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    const linhaBreno = screen.getByText(BRENO.nomeCompleto).closest('tr')!
    await usuario.click(within(linhaBreno).getByRole('button', { name: 'Chamar' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  it('pular marca como pulado, avança, e continua alcançável pela tabela', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    await screen.findByText('Ana Paula', { selector: '.chamado__nome' })

    await usuario.click(screen.getByRole('button', { name: 'Pular' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(screen.getByText('Pulado')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Chamar' }))
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  // Sair do modo de chamar nomes é tão explícito quanto entrar — o resto da
  // turma chega sozinho, sem crachá trocado, pelo modo comum. Um interruptor
  // só, ligado e desligado com o mesmo gesto.
  it('o interruptor liga e desliga o modo de chamar nomes', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    const interruptor = screen.getByRole('switch', { name: 'Chamar nomes' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')

    await usuario.click(interruptor)
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(interruptor).toHaveAttribute('aria-checked', 'true')

    await usuario.click(interruptor)
    expect(screen.queryByText('Ana Paula', { selector: '.chamado__nome' })).not.toBeInTheDocument()
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
  })

  it('editar o nome antes do crachá chegar grava o nome editado', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    const campo = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`)
    await usuario.clear(campo)
    await usuario.type(campo, 'Aninha')

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await screen.findByText('Crachá novo')
    await usuario.type(screen.getByLabelText('Buscar na turma'), '{Enter}')

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos[0]?.nome).toBe('Aninha')
    })
  })

  it('avisa quando dois nomes exibidos ficam iguais', () => {
    const joao1 = pessoa('1', 'João')
    const joao2 = pessoa('2', 'João')
    montar([joao1, joao2], [joao1, joao2])
    expect(screen.getAllByText('Nome repetido')).toHaveLength(2)
  })

  // Até 11/09/2026, "Mais um crachá" permitia chamar de novo quem já tinha
  // vínculo — segunda via sem sair da tabela. Tirado: nem aluno nem
  // professor deveria acumular mais de um crachá ao mesmo tempo. O caminho
  // agora é "Remover crachá" e deixar a pessoa voltar a "quem falta".
  it('quem já tem crachá não ganha botão de chamar de novo', async () => {
    await comCrachaDaAna()
    montar([BRENO])

    expect(await screen.findByDisplayValue('Ana Paula')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais um crachá' })).not.toBeInTheDocument()
  })

  // A cerimônia recusava um crachá já vinculado a outra pessoa, dizendo de
  // quem era. Unificada com `decidir()`, o comportamento simplifica: o dono
  // de verdade é marcado presente — não é falha de dado, a pessoa está mesmo
  // ali —, e quem estava chamado continua chamado, sem vínculo novo nenhum.
  it('crachá já vinculado a outra pessoa marca presença para o dono, sem mexer em quem está chamado', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])
    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    expect(screen.getByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
  })
})

// Presente/Não presente na própria lista — pra quem tem crachá e pra quem
// não tem. Antes só existia em "Ver presenças", longe de onde o professor
// está olhando durante a aula. Reproduz o pedido de 17/09/2026.
describe('presença manual na lista de alunos', () => {
  it('marcar presente quem não tem crachá grava evento manual, sem exigir vínculo', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    const linha = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linha).getByRole('button', { name: 'Presente' }))

    await waitFor(async () => {
      const eventos = await bancada.repositorio.listarEventos()
      expect(eventos).toHaveLength(1)
    })
    const [evento] = await bancada.repositorio.listarEventos()
    expect(evento.origem).toBe('manual')
    expect(evento.resultado).toBe('ok')
    expect(evento.matricula).toBe(ANA.matricula)
    // Some vínculo nenhum — a matrícula basta pra identificar quem foi
    // marcado presente sem nunca ter encostado um crachá.
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(0)

    // O botão vira "Não presente" — a linha reflete o estado atual.
    expect(await within(linha).findByRole('button', { name: 'Não presente' })).toBeInTheDocument()
  })

  it('não presente derruba um crachá já lido, e aparece em vermelho na lista de leituras', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])
    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())

    const linha = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(await within(linha).findByRole('button', { name: 'Não presente' }))

    await waitFor(async () => {
      const eventos = await bancada.repositorio.listarEventos()
      expect(eventos.some((e) => e.origem === 'manual' && e.resultado === 'removido')).toBe(true)
    })

    // A remoção entra na lista de leituras recentes, com o tom vermelho —
    // é a mesma área que mostra "o que está acontecendo agora".
    const linhaDaLista = await screen.findByText('Ana Paula', { selector: '.coleta__linha--removido span' })
    expect(linhaDaLista).toBeInTheDocument()
  })

  // Achado em 22/09/2026: o contador grande do topo contava só crachá — quem
  // seguia pela via manual (dongle ausente ou quebrado, o cenário que este
  // arquivo inteiro discute) via o número travado em zero a aula inteira,
  // mesmo marcando todo mundo presente. O selo por linha (`presencasHoje`)
  // já mudava; o contador, não.
  it('presença manual soma no contador grande do topo, igual a um crachá', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-label', '0')

    const linhaDaAna = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDaAna).getByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))

    const linhaDoBreno = screen.getByLabelText(`nome de ${BRENO.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDoBreno).getByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '2'))

    // E desfazer também desconta — não é só ida, é o par completo.
    await usuario.click(await within(linhaDaAna).findByRole('button', { name: 'Não presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))
  })

  // Ensaio de 23/09/2026: "Não presente" e depois o crachá, na frente do
  // professor. O contador ficava em zero, porque a correção manual vencia
  // sempre, mesmo gravada antes do crachá.
  it('crachá encostado depois de "Não presente" devolve a presença', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])
    const status = screen.getByRole('status')

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))

    const linhaDaAna = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(await within(linhaDaAna).findByRole('button', { name: 'Não presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '0'))

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))
    expect(await within(linhaDaAna).findByRole('button', { name: 'Não presente' })).toBeInTheDocument()
  })

  it('crachá de verdade e presença manual contam juntos, sem duplicar a mesma pessoa', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])
    const status = screen.getByRole('status')

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))

    const linhaDoBreno = screen.getByLabelText(`nome de ${BRENO.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDoBreno).getByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '2'))

    // Marcar a Ana presente à mão de novo (já tem crachá lido) não soma uma
    // segunda vez — mesma pessoa, identificada pela matrícula, não pelo
    // `uidHash` sorteado do clique manual.
    const linhaDaAna = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDaAna).getByRole('button', { name: 'Não presente' }))
    await usuario.click(await within(linhaDaAna).findByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(status).toHaveAttribute('aria-label', '2'))
  })
})

// Mesmo padrão de `TelaRepositorio.tsx` (Ajustes → Vínculos): editar aqui
// grava direto no vínculo, sem esperar um novo crachá. Antes só dava pra
// corrigir um apelido de quem já tinha crachá indo em Ajustes.
describe('apelido editável mesmo com crachá já vinculado', () => {
  it('edita o campo de uma pessoa já vinculada e grava no vínculo dela', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])

    const campo = await screen.findByDisplayValue('Ana Paula')
    await usuario.clear(campo)
    // `clear()` dispara o onChange que zera o estado controlado, mas o React
    // pode não ter terminado de sincronizar `value=''` de volta pro DOM antes
    // do próximo comando — sem esperar, `type()` às vezes começa a digitar em
    // cima do texto antigo ainda visível ("Ana Paula" + "Aninha" em vez de
    // "Aninha"). Achado num loop local (falhava ~1 em cada 3 execuções).
    await waitFor(() => expect(campo).toHaveValue(''))
    await usuario.type(campo, 'Aninha')
    // Grava no `onBlur` — uma escrita por edição, não uma por tecla.
    await usuario.tab()

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos[0]?.nome).toBe('Aninha')
    })
    // Sem crachá novo nenhum: continua a mesma pessoa, só o apelido mudou.
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
  })
})

// Reproduz o susto de 17/09/2026: buzzer do dongle soando, nada acontecendo
// no Adsum — hipótese mais provável era a janela sem foco. Isto é detecção
// real (o navegador sabe se a janela está em foco), não palpite.
describe('aviso de janela sem foco', () => {
  it('não avisa na troca rápida — só depois de 2,5s sem foco', async () => {
    // Só `setTimeout`: fingir o relógio inteiro derruba o Dexie
    // ("Transaction committed too early"), que depende de timers de
    // verdade para fechar transação — mesmo cuidado de `Fluxo.test.tsx`.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      montar([ANA, BRENO])
      expect(screen.queryByText(/perdeu o foco/)).not.toBeInTheDocument()

      act(() => window.dispatchEvent(new Event('blur')))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(screen.queryByText(/perdeu o foco/)).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600)
      })
      expect(screen.getByText(/perdeu o foco/)).toBeInTheDocument()

      act(() => window.dispatchEvent(new Event('focus')))
      expect(screen.queryByText(/perdeu o foco/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('foco de volta antes dos 2,5s cancela o aviso — nunca chega a aparecer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      montar([ANA, BRENO])

      act(() => window.dispatchEvent(new Event('blur')))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      act(() => window.dispatchEvent(new Event('focus')))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })
      expect(screen.queryByText(/perdeu o foco/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

// A correção de um crachá vinculado à pessoa errada morava só em Ajustes →
// Vínculos, longe de onde o erro acontece — na fila, com a turma na frente.
// Existia mesmo antes de 11/09/2026, mas era preciso saber que existia.
describe('remover crachá', () => {
  it('desvincula depois de confirmar, e avisa a tela por cima para recontar quem falta', async () => {
    const usuario = userEvent.setup()
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const aoMudarBase = vi.fn()
    await comCrachaDaAna()
    renderizarCom(
      bancada,
      <TelaAula sessao={SESSAO} pendentes={[BRENO]} daTurma={[ANA, BRENO]} aoMudarBase={aoMudarBase} />,
    )

    expect(await screen.findByRole('button', { name: 'Remover crachá' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remover crachá' }))

    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining(ANA.nomeCompleto))
    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(0))
    // Quem sabe recontar "quem falta" é a tela por cima (`Fluxo`, de verdade)
    // — esta tela isolada só avisa que algo mudou.
    await waitFor(() => expect(aoMudarBase).toHaveBeenCalled())
  })

  // Base do Paulo, 23/09/2026: 32 alunos com um vínculo em cada sal (o
  // chaveiro guarda os dois). Apagar só o primeiro podia apagar o morto, e
  // o crachá continuava valendo — "nada aconteceu".
  it('com um vínculo em cada sal, apaga os dois de uma vez', async () => {
    const usuario = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await comCrachaDaAna()
    await bancada.repositorio.gravarVinculo({
      uidHash: 'de-um-sal-antigo',
      papel: 'aluno',
      nome: ANA.nome,
      matricula: ANA.matricula,
      criadoEm: new Date().toISOString(),
    })
    montar([BRENO])

    await usuario.click(await screen.findByRole('button', { name: 'Remover crachá' }))

    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(0))
  })

  it('cancelar a confirmação não mexe no vínculo', async () => {
    const usuario = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await comCrachaDaAna()
    montar([BRENO])

    await usuario.click(await screen.findByRole('button', { name: 'Remover crachá' }))

    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
  })

  it('não aparece para quem ainda não tem crachá', () => {
    montar([ANA, BRENO])
    expect(screen.queryByRole('button', { name: 'Remover crachá' })).not.toBeInTheDocument()
  })
})

describe('o fim da aula', () => {
  // Encerrar devolvia direto ao repouso, e a chamada que acabou de ser feita
  // desaparecia sem uma palavra.
  it('avisa quem encerrou, com quantos ficaram registrados', async () => {
    await comCrachaDaAna()
    const aoEncerrar = vi.fn()
    renderizarCom(
      bancada,
      <TelaAula
        sessao={SESSAO}
        pendentes={[BRENO]}
        daTurma={[ANA, BRENO]}
        aoMudarBase={() => {}}
        aoEncerrar={aoEncerrar}
      />,
    )

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())

    // O crachá do professor, com a aula aberta há mais de dez segundos.
    const uidProfessor = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash: uidProfessor,
      papel: 'professor',
      nome: 'Paulo Freitas',
      criadoEm: new Date().toISOString(),
    })
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalled())
    const [presentes, duracaoMs, intervalos] = aoEncerrar.mock.calls[0]
    expect(presentes).toBe(1)
    expect(duracaoMs).toBeGreaterThanOrEqual(0)
    // Só uma pessoa registrada: não há par para medir intervalo nenhum.
    expect(intervalos).toBeUndefined()
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })

  // Achado pelo autor em 22/09/2026: o contador ao vivo já contava presença
  // manual certo, mas "Fim da aula" mostrava 0 — `aoEncerrar` ainda lia
  // `jaPresentes.current` (a ref só de crachá, de propósito, pro dedup de
  // `decidir()`), não o conjunto que passou a incluir manual. Só crachá não
  // reproduzia isto: precisa de presença **sem** nenhum crachá real no
  // meio.
  it('duas presenças manuais, sem nenhum crachá: "Fim da aula" mostra as duas, não zero', async () => {
    const usuario = userEvent.setup()
    const aoEncerrar = vi.fn()
    renderizarCom(
      bancada,
      <TelaAula
        sessao={SESSAO}
        pendentes={[ANA, BRENO]}
        daTurma={[ANA, BRENO]}
        aoMudarBase={() => {}}
        aoEncerrar={aoEncerrar}
      />,
    )

    const linhaDaAna = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDaAna).getByRole('button', { name: 'Presente' }))
    const linhaDoBreno = screen.getByLabelText(`nome de ${BRENO.nomeCompleto}`).closest('tr')!
    await usuario.click(within(linhaDoBreno).getByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('aria-label', '2'))

    const uidProfessor = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash: uidProfessor,
      papel: 'professor',
      nome: 'Paulo Freitas',
      criadoEm: new Date().toISOString(),
    })
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalled())
    const [presentes] = aoEncerrar.mock.calls[0]
    expect(presentes).toBe(2)
  })

  // O dado que troca `INTERVALO_MINIMO_MS` de palpite por medição — ver
  // `estatisticaDeIntervalos`. Atraso real de propósito: sem pelo menos
  // 400 ms entre os dois crachás, o segundo seria recusado como "rápido
  // demais" e não haveria par nenhum pra medir.
  it('mede o intervalo entre crachás e a duração da aula, ao encerrar', async () => {
    await comCrachaDaAna()
    const uidBreno = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_DO_BRENO))
    await bancada.repositorio.gravarVinculo({
      uidHash: uidBreno,
      papel: 'aluno',
      nome: BRENO.nome,
      matricula: BRENO.matricula,
      criadoEm: new Date().toISOString(),
    })
    const aoEncerrar = vi.fn()
    renderizarCom(
      bancada,
      <TelaAula
        sessao={SESSAO}
        pendentes={[]}
        daTurma={[ANA, BRENO]}
        aoMudarBase={() => {}}
        aoEncerrar={aoEncerrar}
      />,
    )

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())

    await new Promise((resolve) => setTimeout(resolve, 450))
    await act(async () => bancada.leitor.simular(CRACHA_DO_BRENO))
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())

    const uidProfessor = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash: uidProfessor,
      papel: 'professor',
      nome: 'Paulo Freitas',
      criadoEm: new Date().toISOString(),
    })
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalled())
    const [presentes, duracaoMs, intervalos] = aoEncerrar.mock.calls[0]
    expect(presentes).toBe(2)
    expect(duracaoMs).toBeGreaterThan(0)
    // Ana → Breno é o único par: uma amostra só, os três valores coincidem.
    expect(intervalos).toMatchObject({ amostras: 1 })
    expect(intervalos.minimoMs).toBeGreaterThanOrEqual(400)
    expect(intervalos.minimoMs).toBe(intervalos.maximoMs)
    expect(intervalos.minimoMs).toBe(intervalos.medioMs)
  }, 10_000)

  // "Concluir" morava no rodapé de uma tabela que podia ter 49 linhas, e
  // virou o cabeçalho por causa disso — mesma regressão aqui: "Quem falta"
  // mostra a turma inteira, e o rodapé com "Encerrar a chamada" fica longe.
  // Este, no topo, é a mesma ação alcançável sem rolar a tela toda.
  it('"Encerrar" no topo funciona igual ao do rodapé', async () => {
    const usuario = userEvent.setup()
    const aoEncerrar = vi.fn()
    renderizarCom(
      bancada,
      <TelaAula sessao={SESSAO} pendentes={[BRENO]} daTurma={[ANA, BRENO]} aoMudarBase={() => {}} aoEncerrar={aoEncerrar} />,
    )

    await usuario.click(screen.getByRole('button', { name: 'Encerrar' }))

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalled())
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })
})

describe('Encerrar com a tela atrasada', () => {
  it('vários cliques gravam um encerramento só', async () => {
    const aoEncerrar = vi.fn()
    renderizarCom(
      bancada,
      <TelaAula sessao={SESSAO} pendentes={[BRENO]} daTurma={[ANA, BRENO]} aoMudarBase={() => {}} aoEncerrar={aoEncerrar} />,
    )
    const botao = screen.getByRole('button', { name: 'Encerrar' })

    await act(async () => {
      botao.click()
      botao.click()
      botao.click()
    })

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalled())
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos.filter((e) => e.origem === 'professor')).toHaveLength(1)
  })
})

// Pedido pelo Prof. Paulo. Dois crachás empilhados numa mão são lidos em
// centenas de milissegundos; duas pessoas numa fila levam segundos. Antes,
// só a chamada do dia a dia tinha essa proteção — a cerimônia, o momento de
// maior risco (fila inteira formada no leitor), não passava por `decidir()`
// e não tinha proteção nenhuma. Unificada, ela ganha a mesma.
describe('dois crachás de uma vez', () => {
  it('recusa o segundo, diz o motivo na tela e não conta presença', async () => {
    await comCrachaDaAna()
    const outro = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash: outro,
      papel: 'aluno',
      nome: BRENO.nome,
      matricula: BRENO.matricula,
      criadoEm: new Date().toISOString(),
    })
    montar([])

    // Os dois na mesma mão: sem espera nenhuma entre eles.
    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText(/Dois crachás quase juntos/)).toBeInTheDocument()
    // Um presente, não dois — que é a fraude que a regra existe para fechar.
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    expect(screen.queryByText(BRENO.nome)).not.toBeInTheDocument()
  })

  it('mesmo com gente pendente na fila, dois crachás rápidos demais recusam o segundo', async () => {
    const usuario = userEvent.setup()
    // Ana e Breno os dois sem crachá — a cerimônia é exatamente este caso.
    montar([ANA, BRENO])

    // O primeiro abre a busca (nada gravado ainda) e já marca `ultima`, que é
    // o que o segundo — quase junto — encontra para ser recusado.
    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await screen.findByText('Crachá novo')
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText(/Dois crachás quase juntos/)).toBeInTheDocument()
    // A busca do primeiro continua aberta — a recusa do segundo não mexe nela.
    await usuario.type(screen.getByLabelText('Buscar na turma'), '{Enter}')

    // Só Ana entrou — o segundo crachá foi recusado, não virou cadastro do
    // Breno chamado.
    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(1))
  })

  // Recusa muda é bug: a tentativa fica no log com o hash do crachá recusado.
  it('a recusa entra no log e aparece na lista pelo que é', async () => {
    await comCrachaDaAna()
    montar([])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText('Dois crachás de uma vez')).toBeInTheDocument()
    const eventos = await bancada.repositorio.listarEventos()
    const recusa = eventos.find((e) => e.resultado === 'rapido_demais')
    expect(recusa?.uidHash).toBe(
      await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO)),
    )
  })
})

// Fila de 300 pelo emulador, 23/09/2026: alunos a 0,7 s um do outro foram
// recusados como "dois crachás quase juntos". Com a aba ocupada, a
// identificação de um crachá terminava depois da do seguinte, e ele era
// comparado com um crachá que chegou **depois** dele: intervalo negativo,
// menor que 400. Aqui o atraso é forçado no primeiro crachá.
describe('crachás que terminam de identificar fora de ordem', () => {
  it('dois alunos a 1 s um do outro contam os dois, mesmo com o primeiro atrasado', async () => {
    await comCrachaDaAna()
    const hashDoBreno = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash: hashDoBreno,
      papel: 'aluno',
      nome: BRENO.nome,
      matricula: BRENO.matricula,
      criadoEm: new Date().toISOString(),
    })
    const hashDaAna = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_DA_ANA))
    const original = bancada.repositorio.vinculoPorHash.bind(bancada.repositorio)
    vi.spyOn(bancada.repositorio, 'vinculoPorHash').mockImplementation(async (hash) => {
      if (hash === hashDaAna) await new Promise((r) => setTimeout(r, 80))
      return original(hash)
    })
    montar([])

    const agora = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(agora)
      await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
      vi.setSystemTime(agora + 1000)
      await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    } finally {
      vi.useRealTimers()
    }

    await waitFor(async () => {
      const eventos = await bancada.repositorio.listarEventos()
      expect(eventos.map((e) => e.resultado).sort()).toEqual(['ok', 'ok'])
    })
    expect(screen.queryByText(/Dois crachás quase juntos/)).not.toBeInTheDocument()
  })
})

// A busca em spotlight abre sempre que um crachá desconhecido encosta, com
// ou sem ninguém chamado — ver o comentário em `decidir()`. Este bloco cobre
// o caso sem pendente nenhum (turma completa, alguém trouxe um crachá novo);
// o caso com pendente está em 'quem falta', acima.
describe('crachá desconhecido sem ninguém pendente', () => {
  it('abre a busca', async () => {
    await comCrachaDaAna()
    montar([])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText('Crachá novo')).toBeInTheDocument()
    expect(screen.getByText('De quem é?')).toBeInTheDocument()
  })

  it('nada é gravado antes da resposta', async () => {
    await comCrachaDaAna()
    montar([])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText('Crachá novo')).toBeInTheDocument()
    expect(await bancada.repositorio.contarEventos()).toBe(0)
  })

  it('a busca encolhe a lista a cada tecla, sem acento atrapalhar', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([], [BRENO, pessoa('3', 'João Pedro')])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')

    await usuario.type(screen.getByLabelText('Buscar na turma'), 'joao')
    expect(screen.getByText('João Pedro')).toBeInTheDocument()
    expect(screen.queryByText('Breno Oliveira')).not.toBeInTheDocument()
  })

  it('escolher alguém cadastra o crachá e conta presença — é a segunda via', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')
    // Escopado ao diálogo de busca: com a lista de alunos agora sempre
    // visível por baixo, o nome completo de Ana também aparece ali (como
    // apoio da linha dela), então `findByText` sem escopo acharia dois.
    const dialogo = within(screen.getByRole('dialog'))
    await usuario.click(await dialogo.findByText(ANA.nomeCompleto))

    // Dois crachás para a mesma pessoa, que é o que o app sempre aceitou.
    const vinculos = await bancada.repositorio.listarVinculos()
    expect(vinculos.filter((v) => v.matricula === ANA.matricula)).toHaveLength(2)
  })

  it('desistir grava como desconhecido, para não sumir da chamada', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    await screen.findByText('Crachá novo')
    await usuario.click(screen.getByRole('button', { name: 'Não está na lista' }))

    await waitFor(async () => expect(await bancada.repositorio.contarEventos()).toBe(1))
    expect((await bancada.repositorio.listarEventos())[0].resultado).toBe('desconhecido')
  })
})

describe('"Sou eu"', () => {
  const PROFESSOR: Matriculado = {
    turma: TURMA,
    chave: 'prof',
    matricula: '',
    nome: 'Paulo Freitas',
    nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO',
    papel: 'professor',
  }

  it('marca e desfaz a personalização, sem mexer no vínculo', async () => {
    const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash,
      papel: 'professor',
      nome: PROFESSOR.nome,
      criadoEm: new Date().toISOString(),
    })
    const usuario = userEvent.setup()
    montar([ANA], [PROFESSOR, ANA])
    await abrirProfessores(usuario)

    await usuario.click(await screen.findByRole('button', { name: 'Sou eu' }))
    expect(professorAtual()).toBe(uidHash)
    expect(await screen.findByRole('button', { name: 'Não sou eu' })).toBeInTheDocument()
    expect(screen.getByText('Você')).toBeInTheDocument()
    // O vínculo em si não muda — "sou eu" é fato desta máquina, não da turma.
    expect(await bancada.repositorio.vinculoPorHash(uidHash)).toMatchObject({ nome: PROFESSOR.nome })

    await usuario.click(screen.getByRole('button', { name: 'Não sou eu' }))
    expect(professorAtual()).toBeUndefined()
    expect(await screen.findByRole('button', { name: 'Sou eu' })).toBeInTheDocument()
  })

  it('sem "Sou eu" clicado, o professor não ganha o selo "Você"', async () => {
    const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_NOVO))
    await bancada.repositorio.gravarVinculo({
      uidHash,
      papel: 'professor',
      nome: PROFESSOR.nome,
      criadoEm: new Date().toISOString(),
    })
    const usuario = userEvent.setup()
    montar([ANA], [PROFESSOR, ANA])
    await abrirProfessores(usuario)

    expect(await screen.findByRole('button', { name: 'Sou eu' })).toBeInTheDocument()
    expect(screen.queryByText('Você')).not.toBeInTheDocument()
  })
})

// Professor ganhou seção própria, acima da lista de alunos: cadastro dele é
// sempre um clique explícito em "Cadastrar", nunca a fila automática de
// "Chamar nomes" — que é só dos alunos. Sem isto, um professor pendente
// entrava na mesma fila que os alunos e podia ser chamado sozinho pelas
// setas, sem ninguém ter clicado nada.
describe('professores têm seção própria', () => {
  const PROFESSOR_PENDENTE: Matriculado = {
    turma: TURMA,
    chave: 'prof-pendente',
    matricula: '',
    nome: 'Paulo Freitas',
    nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO',
    papel: 'professor',
  }

  it('professor pendente não entra na fila de "Chamar nomes" dos alunos', async () => {
    const usuario = userEvent.setup()
    montar([PROFESSOR_PENDENTE, BRENO], [PROFESSOR_PENDENTE, BRENO])
    await abrirProfessores(usuario)

    // O professor aparece na própria seção, com "Cadastrar" — não é
    // alcançado pelo interruptor nem pelas setas, que são só dos alunos.
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()

    // A fila de "Chamar nomes" continua tendo só um pendente de verdade:
    // Breno.
    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(screen.queryByText('Paulo Freitas', { selector: '.chamado__nome' })).not.toBeInTheDocument()
  })

  // Sem isto, clicar "Cadastrar" não tinha volta — a única saída era
  // encostar um crachá de verdade ou recarregar a página.
  it('"Cadastrar" de professor pode ser cancelado', async () => {
    const usuario = userEvent.setup()
    montar([PROFESSOR_PENDENTE, BRENO], [PROFESSOR_PENDENTE, BRENO])
    await abrirProfessores(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(screen.getByText('Cadastrando')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Cadastrando')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()
  })

  // A mesma correção que o aluno pendente já tinha ("Quem falta") — o
  // apelido vem do SIGAA e pode estar errado, e sem isto só dava pra
  // corrigir depois, em Ajustes → Vínculos, com o crachá já vinculado ao
  // nome errado.
  it('apelido do professor pendente é editável, e o vínculo nasce com o nome corrigido', async () => {
    const usuario = userEvent.setup()
    montar([PROFESSOR_PENDENTE, BRENO], [PROFESSOR_PENDENTE, BRENO])
    await abrirProfessores(usuario)

    const campo = screen.getByRole('textbox', { name: `nome de ${PROFESSOR_PENDENTE.nomeCompleto}` })
    await usuario.clear(campo)
    await usuario.type(campo, 'Professor Paulo')

    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos).toHaveLength(1)
      expect(vinculos[0]).toMatchObject({ papel: 'professor', nome: 'Professor Paulo' })
    })
  })

  it('a seção de professores some enquanto um aluno está chamado, e volta quando a fila termina', async () => {
    const usuario = userEvent.setup()
    montar([PROFESSOR_PENDENTE, BRENO], [PROFESSOR_PENDENTE, BRENO])
    // A seção inteira (não só o corpo) some e reaparece com o interruptor —
    // ver a checagem de existência dela primeiro, antes de tentar abri-la.
    expect(await screen.findByRole('button', { name: /^Professores/ })).toBeInTheDocument()

    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    expect(screen.queryByRole('button', { name: /^Professores/ })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('switch', { name: 'Chamar nomes' }))
    // Painel volta a montar do zero — fechado de novo, como na primeira vez.
    await abrirProfessores(usuario)
    expect(await screen.findByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()
  })

  // O crachá real do professor, identificado pelo "Cadastrar" explícito,
  // substitui um vínculo sintético que já existisse — sem isto os dois
  // conviveriam, e qualquer `Aula.uidHashProfessor` que ainda apontasse pro
  // hash velho nunca mais bateria com hash nenhum.
  it('cadastro explícito substitui um vínculo sintético e migra a grade', async () => {
    const usuario = userEvent.setup()
    await bancada.repositorio.gravarVinculo({
      uidHash: 'sintetico00000000',
      papel: 'professor',
      nome: 'Professor',
      criadoEm: new Date().toISOString(),
      sintetico: true,
    })
    await bancada.repositorio.gravarAula({
      uidHashProfessor: 'sintetico00000000',
      dia: 3,
      inicio: '08:00',
      fim: '09:50',
      turma: TURMA,
    })

    montar([PROFESSOR_PENDENTE], [PROFESSOR_PENDENTE])
    await abrirProfessores(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos).toHaveLength(1)
      expect(vinculos[0]).toMatchObject({ papel: 'professor', nome: 'Paulo Freitas' })
      expect(vinculos[0].sintetico).toBeFalsy()
    })

    const [vinculoReal] = await bancada.repositorio.listarVinculos()
    const aulas = await bancada.repositorio.listarAulas()
    expect(aulas[0].uidHashProfessor).toBe(vinculoReal.uidHash)
    expect(aulas[0].uidHashProfessor).not.toBe('sintetico00000000')
  })
})

// Professor que perdeu o crachá e trouxe outro já tem vínculo — a mesma
// regra de "crachá desconhecido sempre abre a busca, sobre a turma inteira"
// que já valia pra aluno (`ordemDaBusca` não filtrava só pendente) só que,
// até aqui, o filtro `papel === 'aluno'` deixava o professor de fora dessa
// busca. Sem isto, o professor já vinculado ficava invisível assim que o
// crachá dele mudava, e "Cadastrar" de novo criaria um segundo vínculo real
// — o mesmo bug de grade dividida entre dois professores (`nucleo/grade.ts`),
// só que reaberto pela troca em vez de nascer sozinho.
describe('professor que troca de crachá', () => {
  const PROFESSOR_JA_VINCULADO: Matriculado = {
    turma: TURMA,
    chave: 'prof-antigo',
    matricula: '',
    nome: 'Paulo Freitas',
    nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO',
    papel: 'professor',
  }

  it('a busca encontra o professor já vinculado, e o crachá novo substitui o antigo', async () => {
    const usuario = userEvent.setup()
    await bancada.repositorio.gravarVinculo({
      uidHash: 'professor-cracha-antigo',
      papel: 'professor',
      nome: PROFESSOR_JA_VINCULADO.nome,
      criadoEm: new Date().toISOString(),
    })
    await bancada.repositorio.gravarAula({
      uidHashProfessor: 'professor-cracha-antigo',
      dia: 3,
      inicio: '08:00',
      fim: '09:50',
      turma: TURMA,
    })

    // Sem pendente nenhum: o professor já tem vínculo, não está na fila —
    // e é exatamente por isso que, sem o fix, a busca não o encontrava.
    montar([], [PROFESSOR_JA_VINCULADO])

    await act(async () => bancada.leitor.simular(CRACHA_NOVO))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByText(PROFESSOR_JA_VINCULADO.nomeCompleto))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos).toHaveLength(1)
      expect(vinculos[0].uidHash).not.toBe('professor-cracha-antigo')
      expect(vinculos[0]).toMatchObject({ papel: 'professor', nome: 'Paulo Freitas' })
    })

    const [vinculoNovo] = await bancada.repositorio.listarVinculos()
    const aulas = await bancada.repositorio.listarAulas()
    expect(aulas[0].uidHashProfessor).toBe(vinculoNovo.uidHash)
  })
})

// Contador de presença subia com crachá de professor: `TelaAula` somava ao
// mesmo conjunto de presentes qualquer `cadastro`, sem olhar `papel`. O
// professor cadastrando o próprio crachá pela seção de professores não é
// aluno chegando — não deveria inflar o número.
describe('cadastro de professor não soma presença', () => {
  const PROFESSOR_PENDENTE: Matriculado = {
    turma: TURMA,
    chave: 'prof-pendente',
    matricula: '',
    nome: 'Paulo Freitas',
    nomeCompleto: 'PAULO FREITAS DE ARAUJO FILHO',
    papel: 'professor',
  }

  // O atraso real entre as duas leituras é de propósito: sem pelo menos
  // 400 ms entre crachás diferentes, a segunda seria recusada como "rápido
  // demais" (`INTERVALO_MINIMO_MS`) e não haveria cadastro nenhum pra medir.
  it('cadastro explícito do professor mantém o contador como estava', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([PROFESSOR_PENDENTE], [ANA, PROFESSOR_PENDENTE])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())

    await abrirProfessores(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await new Promise((resolve) => setTimeout(resolve, 450))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(2))
    // Continua 1 — o cadastro do professor não somou.
    expect(screen.getByText('1')).toBeInTheDocument()
  }, 10_000)
})

// `Vinculo.nome` (editado em Ajustes → Vínculos) e `Matriculado.nome` (do
// SIGAA) são campos de tabelas diferentes. `efetivo()` sempre lia só o
// segundo — um apelido trocado em Ajustes nunca aparecia na chamada.
describe('apelido editado em Ajustes aparece na chamada', () => {
  it('mostra o nome do vínculo, não o nome original do SIGAA', async () => {
    const uidHash = await calcularUidHash(bancada.config.salHex, hexParaUid(CRACHA_DA_ANA))
    await bancada.repositorio.gravarVinculo({
      uidHash,
      papel: 'aluno',
      nome: 'Aninha', // editado em Ajustes — diferente de ANA.nome
      matricula: ANA.matricula,
      criadoEm: new Date().toISOString(),
    })
    montar([BRENO], [ANA, BRENO])

    expect(await screen.findByDisplayValue('Aninha')).toBeInTheDocument()
    expect(screen.queryByText(ANA.nome)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue(ANA.nome)).not.toBeInTheDocument()
  })
})
