import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { TelaColarTurma } from './TelaColarTurma.tsx'

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

async function colar(pagina = PAGINA, props: Parameters<typeof TelaColarTurma>[0] = {}) {
  const usuario = userEvent.setup()
  renderizarCom(bancada, <TelaColarTurma {...props} />)
  await usuario.type(screen.getByLabelText('turma'), 'IF685 · T01')
  await usuario.click(screen.getByLabelText('lista da turma'))
  await usuario.paste(pagina)
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
  return usuario
}

describe('colar a turma', () => {
  it('salva o docente como professor e os discentes como aluno', async () => {
    await colar()
    await waitFor(async () => {
      const matriculados = await bancada.repositorio.listarMatriculados('IF685 · T01')
      expect(matriculados).toHaveLength(3)
    })

    const matriculados = await bancada.repositorio.listarMatriculados('IF685 · T01')
    const porNome = new Map(matriculados.map((m) => [m.nome, m]))
    expect(porNome.get('Ana Paula')?.papel).toBe('professor')
    expect(porNome.get('Breno Oliveira')?.papel).toBe('aluno')
    expect([...porNome.keys()].sort()).toEqual(['Ana Paula', 'Breno Oliveira', 'Carla Regina'])
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

  it('avisa quando ninguém está marcado como professor', async () => {
    const semDocente = ['Discentes (2)', disc('BRENO OLIVEIRA FILHO', '20250000001'), disc('CARLA REGINA DO NASCIMENTO', '20250000002')].join('\n')
    await colar(semDocente)
    expect(await screen.findByText(/Ninguém marcado como professor/)).toBeInTheDocument()
  })

  // Chamar nomes e vincular crachás não é mais tarefa desta tela — é a
  // primeira chamada, em `TelaAula`. Não há mais tabela, nem cartão de
  // "encoste o crachá", nem `aoSair` de cerimônia aqui.
  it('não mostra tabela nem cartão de chamada', async () => {
    await colar()
    await waitFor(async () =>
      expect(await bancada.repositorio.listarMatriculados('IF685 · T01')).toHaveLength(3),
    )
    expect(screen.queryByText('Encoste o crachá de')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('cancelar', () => {
  it('só existe quando há para onde voltar', async () => {
    await colar()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  it('chama aoSair quando existe', async () => {
    const usuario = userEvent.setup()
    let saiu = false
    renderizarCom(bancada, <TelaColarTurma aoSair={() => (saiu = true)} />)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(saiu).toBe(true)
  })
})
