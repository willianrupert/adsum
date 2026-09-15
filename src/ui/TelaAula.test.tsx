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
    expect(screen.getByText('Quem falta')).toBeInTheDocument()
    expect(screen.getByText(/1 de 2 sem crachá/)).toBeInTheDocument()
  })

  it('some quando ninguém está pendente, e diz que o cadastro terminou', () => {
    montar([])
    expect(screen.queryByText('Quem falta')).not.toBeInTheDocument()
    expect(screen.getByText(/Turma completa/)).toBeInTheDocument()
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
    // A mesma leitura virou presença, não só cadastro.
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos[0]).toMatchObject({ nome: 'Ana Paula', resultado: 'ok', origem: 'cracha' })
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
    // A mesma leitura virou presença, não só cadastro.
    const eventos = await bancada.repositorio.listarEventos()
    expect(eventos[0]).toMatchObject({ nome: 'Ana Paula', resultado: 'ok', origem: 'cracha' })
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

    expect(screen.getByText('Quem falta')).toBeInTheDocument()
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

  it('"Mais um crachá" chama de novo quem já tem vínculo — segunda via', async () => {
    const usuario = userEvent.setup()
    await comCrachaDaAna()
    montar([BRENO])

    await usuario.click(screen.getByRole('button', { name: 'Mais um crachá' }))
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()

    // Ana está explicitamente chamada — cadastra direto, sem perguntar.
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.filter((v) => v.matricula === ANA.matricula)).toHaveLength(2)
    })
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
    await usuario.click(await screen.findByText(ANA.nomeCompleto))

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
    montar([ANA], [PROFESSOR, ANA])

    expect(await screen.findByRole('button', { name: 'Sou eu' })).toBeInTheDocument()
    expect(screen.queryByText('Você')).not.toBeInTheDocument()
  })
})
