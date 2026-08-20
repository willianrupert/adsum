import { beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaVinculo } from './TelaVinculo.tsx'

let bancada: Bancada

const disc = (nome: string, matricula: string) =>
  [
    `\tUsuário Off-Line no SIGAA ${nome}  (Perfil)`,
    'Curso: CIÊNCIA DA COMPUTAÇÃO/CIN',
    `Matrícula: ${matricula}`,
    'Usuário: login.que.nao.deve.ser.lido',
    'E-mail: x@g.com\tEnviar Mensagem',
  ].join('\n')

const PAGINA = [
  'Docentes (1)',
  '\tUsuário Off-Line no SIGAA ANA PAULA MENDES DE SOUZA',
  'Departamento: CENTRO DE INFORMÁTICA - CIN',
  'Usuário: ana.mendes',
  'E-Mail: ana@ufpe.br',
  '',
  'Discentes (2)',
  disc('BRENO OLIVEIRA FILHO', '20250000001'),
  disc('CARLA REGINA DO NASCIMENTO', '20250000002'),
].join('\n')

beforeEach(async () => {
  bancada = await montarBancada()
})

async function colar(pagina = PAGINA) {
  const usuario = userEvent.setup()
  renderizarCom(bancada, <TelaVinculo />)
  await usuario.type(screen.getByLabelText('turma'), 'IF685 · T01')
  await usuario.click(screen.getByLabelText('lista da turma'))
  await usuario.paste(pagina)
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
  return usuario
}

describe('colar a turma', () => {
  it('mostra a turma com o docente no topo e o nome curto', async () => {
    await colar()
    await waitFor(() => expect(screen.getByDisplayValue('Ana Paula')).toBeInTheDocument())
    const nomes = screen.getAllByRole('textbox').map((c) => (c as HTMLInputElement).value)
    expect(nomes).toEqual(['Ana Paula', 'Breno Oliveira', 'Carla Regina'])
  })

  it('quem veio da seção de docentes entra como professor', async () => {
    await colar()
    await waitFor(() => expect(screen.getByDisplayValue('Ana Paula')).toBeInTheDocument())
    expect(screen.getByLabelText('papel de Ana Paula Mendes de Souza')).toHaveValue('professor')
    expect(screen.getByLabelText('papel de Breno Oliveira Filho')).toHaveValue('aluno')
  })

  // Guardar não é decisão de ninguém: quem colou a turma quer a turma guardada.
  it('guarda a turma sozinho, sem botão', async () => {
    await colar()
    await waitFor(async () =>
      expect(await bancada.repositorio.listarMatriculados('IF685 · T01')).toHaveLength(3),
    )
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('não guarda o login do SIGAA em lugar nenhum', async () => {
    await colar()
    await waitFor(async () =>
      expect(await bancada.repositorio.listarMatriculados()).not.toHaveLength(0),
    )
    const guardado = JSON.stringify(await bancada.repositorio.listarMatriculados())
    expect(guardado).not.toContain('login.que.nao.deve.ser.lido')
    expect(guardado).toContain('20250000001')
  })

  it('avisa quando a contagem não bate com o cabeçalho', async () => {
    await colar(PAGINA.replace(disc('CARLA REGINA DO NASCIMENTO', '20250000002'), ''))
    expect(await screen.findByText(/Discentes \(2\).*lidos 1/)).toBeInTheDocument()
  })
})

describe('a cerimônia', () => {
  it('vincula o crachá ao nome chamado e avança sozinha', async () => {
    const usuario = await colar()
    await waitFor(() => expect(screen.getByDisplayValue('Ana Paula')).toBeInTheDocument())

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Simular um crachá' }))

    await waitFor(async () => {
      const vinculos = await bancada.repositorio.listarVinculos()
      expect(vinculos.map((v) => v.nome)).toEqual(['Ana Paula'])
    })
    // Avançou para o próximo sem ninguém clicar.
    expect(await screen.findByText('Breno Oliveira')).toBeInTheDocument()
  })

  // A garantia contra trocar aluno: o crachá capturado só pode ser de quem
  // estava chamado, porque não havia segundo candidato.
  it('recusa crachá que já é de outra pessoa, dizendo de quem', async () => {
    await colar()
    await waitFor(() => expect(screen.getByDisplayValue('Ana Paula')).toBeInTheDocument())

    // O mesmo crachá duas vezes, injetado direto no leitor: é a duplicata sem
    // precisar de dois crachás na mão.
    await act(async () => bancada.leitor.simular('04a23b91'))
    await waitFor(async () => expect(await bancada.repositorio.listarVinculos()).toHaveLength(1))

    // A cerimônia já avançou sozinha para o próximo; o mesmo crachá volta.
    expect(await screen.findByText('Breno Oliveira')).toBeInTheDocument()
    await act(async () => bancada.leitor.simular('04a23b91'))

    expect(await screen.findByText(/já é de Ana Paula/)).toBeInTheDocument()
    // Nada foi gravado: um crachá tem um dono só.
    expect(await bancada.repositorio.listarVinculos()).toHaveLength(1)
  })

  it('as setas andam pela turma', async () => {
    const usuario = await colar()
    await waitFor(() => expect(screen.getByDisplayValue('Ana Paula')).toBeInTheDocument())

    await usuario.keyboard('{ArrowRight}')
    expect(await screen.findByText('Breno Oliveira')).toBeInTheDocument()
    await usuario.keyboard('{ArrowLeft}')
    expect(await screen.findByText('Ana Paula')).toBeInTheDocument()
  })
})

// Quatro achados da validação de ponta a ponta, e todos na mesma tela: ela foi
// desenhada como lista com um modo escondido dentro.
describe('a cerimônia não esconde a própria ação', () => {
  it('a barra já abre chamando o primeiro pendente', async () => {
    // Sem clicar em nada depois de colar: o passo seguinte a cadastrar a turma
    // é dar crachá a ela, e a tela já começa ali.
    await colar()
    expect(await screen.findByText('Encoste o crachá de')).toBeInTheDocument()
  })

  // Clicar num botão que não responde é pior que não ter botão.
  it('"Cadastrar crachás" não fica na tela enquanto a barra está aberta', async () => {
    await colar()
    await screen.findByText('Encoste o crachá de')

    expect(screen.queryByRole('button', { name: 'Cadastrar crachás' })).not.toBeInTheDocument()
  })

  it('parar de chamar devolve o botão, agora dizendo continuar', async () => {
    const usuario = await colar()
    await screen.findByText('Encoste o crachá de')

    await usuario.click(screen.getByRole('button', { name: 'Parar de chamar' }))
    expect(screen.queryByText('Encoste o crachá de')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cadastrar crachás|Continuar cadastrando/ })).toBeInTheDocument()
  })

  // "Cadê o botão de encerrar?" A resposta é que não existe um formal, mas dá
  // pra sair mesmo assim — e a tela precisa dizer o porquê da diferença.
  it('a tela diz que ainda falta o crachá do professor, mas que dá pra sair', async () => {
    await colar()
    await screen.findByText('Encoste o crachá de')

    expect(screen.getByText(/Sem o crachá do professor, a chamada não abre/)).toBeInTheDocument()
  })
})
