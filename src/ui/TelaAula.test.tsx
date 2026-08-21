import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaAula } from './TelaAula.tsx'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'
const CRACHA_DA_ANA = '04a23b91'
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

  it('some quando ninguém está pendente', () => {
    montar([])
    expect(screen.queryByText('Quem falta')).not.toBeInTheDocument()
  })

  it('chama o primeiro pendente sozinha, sem clique nenhum', () => {
    montar([ANA, BRENO])
    expect(screen.getByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  it('cadastra e conta presença no mesmo toque, e avança para o próximo pendente', async () => {
    montar([ANA, BRENO])

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
    montar([ANA, BRENO])
    expect(screen.getByText(/2 de 2 sem crachá/)).toBeInTheDocument()

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(1))

    expect(screen.getByText('Quem falta')).toBeInTheDocument()
  })

  it('as setas andam pela fila de pendentes', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    expect(screen.getByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()

    await usuario.keyboard('{ArrowRight}')
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    await usuario.keyboard('{ArrowLeft}')
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  // "Chamar" alcança qualquer linha, não só a próxima — é o que a cerimônia
  // já garantia com a tabela completa, e a fila sozinha não tinha.
  it('"Chamar" numa linha que não é a próxima muda quem está chamado', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])
    expect(screen.getByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Chamar' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  it('pular marca como pulado, avança, e continua alcançável pela tabela', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    await usuario.click(screen.getByRole('button', { name: 'Pular' }))
    expect(await screen.findByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(screen.getByText('Pulado')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Chamar' }))
    expect(await screen.findByText('Ana Paula', { selector: '.chamado__nome' })).toBeInTheDocument()
  })

  it('editar o nome antes do crachá chegar grava o nome editado', async () => {
    const usuario = userEvent.setup()
    montar([ANA, BRENO])

    const campo = screen.getByLabelText(`nome de ${ANA.nomeCompleto}`)
    await usuario.clear(campo)
    await usuario.type(campo, 'Aninha')

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

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
    await comCrachaDaAna()
    montar([BRENO])
    expect(screen.getByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    expect(screen.getByText('Breno Oliveira', { selector: '.chamado__nome' })).toBeInTheDocument()
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
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

    await waitFor(() => expect(aoEncerrar).toHaveBeenCalledWith(1))
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
    // Ana e Breno os dois sem crachá — a cerimônia é exatamente este caso.
    montar([ANA, BRENO])

    await act(async () => bancada.leitor.simular(CRACHA_DA_ANA))
    await act(async () => bancada.leitor.simular(CRACHA_NOVO))

    expect(await screen.findByText(/Dois crachás quase juntos/)).toBeInTheDocument()
    // Só Ana entrou — o segundo crachá foi recusado, não virou cadastro do
    // Breno chamado.
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
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

// A busca em spotlight só entra quando não há ninguém chamado — com gente
// pendente, `decidir()` já sabe a quem atribuir um crachá desconhecido, e
// perguntar seria um clique a mais para uma resposta que a tela já tem.
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
