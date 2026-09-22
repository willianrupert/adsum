// A aula de 22/09/2026, reconstruída a partir do cofre do Prof. Paulo.
//
// Dois defeitos, nenhum deles no leitor. O dongle leu tudo o que devia; o que
// falhou foi o que vinha depois da leitura:
//
// 1. `evento_id` repetido. Cada tela contava a sequência de um lugar — a
//    chamada pela contagem **da turma**, a abertura pela da base inteira —, e
//    numa base com duas turmas as duas cunhavam o mesmo id. O repetido era
//    recusado em silêncio e o id seguinte era o mesmo de novo: a partir dali,
//    nenhum crachá e nenhum "Presente" gravava mais nada.
//
// 2. Sal em dois lugares. Restaurar a pasta adotava o sal do cofre na base,
//    mas as telas calculavam o hash com a cópia lida quando o app abriu. A
//    turma recadastrada naquele dia ficou num sal que sumiu ao reabrir.
//
// A suíte não pegava nenhum dos dois porque todo teste começava de uma base
// com uma turma só e um sal só. A base de um professor de verdade, na
// segunda semana, não é assim — é isso que os testes daqui montam.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { montarBancada, renderizarCom, type Bancada } from '../testes/montar.tsx'
import { baterCrachasEmSequencia, gerarBaralho } from '../testes/simular.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import { TelaAula } from './TelaAula.tsx'
import { Fluxo } from './Fluxo.tsx'
import { ContextoAdsum } from './adsum.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { proximoEventoId } from '../nucleo/sessao.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { adiarHorario } from '../ambiente/preferencias.ts'
import { sincronizar } from '../ambiente/sincronia.ts'

const TURMA = 'IF685 · T01'
const OUTRA_TURMA = 'IF969 · T02'

const pessoa = (i: number): Matriculado => {
  const matricula = String(20260000001 + i)
  return {
    turma: TURMA,
    chave: matricula,
    matricula,
    nome: `Aluno ${i + 1}`,
    nomeCompleto: `ALUNO ${i + 1} DA SILVA`,
    papel: 'aluno',
  }
}

describe('base com duas turmas: cada evento novo ganha um id que ainda não existe', () => {
  let bancada: Bancada
  const ALUNOS = Array.from({ length: 6 }, (_, i) => pessoa(i))
  const BARALHO = gerarBaralho(ALUNOS.length)
  const SESSAO = {
    turma: TURMA,
    abertaEm: new Date(Date.now() - 10 * 60_000).toISOString(),
    uidHashProfessor: 'professor',
  }

  beforeEach(async () => {
    bancada = await montarBancada()
    const { repositorio, config } = bancada
    await repositorio.salvarTurma(TURMA, ALUNOS)

    // A outra turma já teve aula hoje. É o que faz a contagem da turma (zero)
    // e a da base (vinte) divergirem — e os ids 0001… já estarem tomados.
    const hoje = new Date()
    for (let n = 1; n <= 20; n++) {
      await repositorio.acrescentarEvento({
        eventoId: proximoEventoId(config.instalacaoId, hoje, n),
        quando: new Date(hoje.getTime() - 60 * 60_000 + n * 1000).toISOString(),
        turma: OUTRA_TURMA,
        nome: `Outro ${n}`,
        origem: 'cracha',
        resultado: 'ok',
        uidHash: `ffff${String(n).padStart(12, '0')}`,
      })
    }

    for (const [i, aluno] of ALUNOS.entries()) {
      await repositorio.gravarVinculo({
        uidHash: await calcularUidHash(config.salHex, hexParaUid(BARALHO[i])),
        papel: 'aluno',
        nome: aluno.nome,
        matricula: aluno.matricula,
        criadoEm: new Date().toISOString(),
      })
    }
    await repositorio.abrirSessao(SESSAO)
  })

  const montar = (pendentes: Matriculado[] = []) =>
    renderizarCom(
      bancada,
      <TelaAula sessao={SESSAO} pendentes={pendentes} daTurma={ALUNOS} aoMudarBase={() => {}} />,
    )

  const presencasDaTurma = async () =>
    (await bancada.repositorio.listarEventos({ turma: TURMA })).filter(
      (e) => e.origem === 'cracha' && e.resultado === 'ok',
    )

  it('todo crachá conta presença, e o contador acompanha', async () => {
    montar()
    await baterCrachasEmSequencia(bancada.leitor, BARALHO, () => bancada.repositorio.contarEventos())

    expect(await presencasDaTurma()).toHaveLength(ALUNOS.length)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', String(ALUNOS.length)),
    )
  }, 30_000)

  it('o botão Presente grava, para quem está sem crachá', async () => {
    const usuario = userEvent.setup()
    montar()
    const status = screen.getByRole('status')

    const linha = screen.getByLabelText(`nome de ${ALUNOS[0].nomeCompleto}`).closest('tr')!
    await usuario.click(within(linha).getByRole('button', { name: 'Presente' }))

    await waitFor(() => expect(status).toHaveAttribute('aria-label', '1'))
    expect(await within(linha).findByRole('button', { name: 'Não presente' })).toBeInTheDocument()
  })

  it('nenhum id se repete no log, nem entre as duas turmas', async () => {
    montar()
    await baterCrachasEmSequencia(bancada.leitor, BARALHO, () => bancada.repositorio.contarEventos())

    const ids = (await bancada.repositorio.listarEventos()).map((e) => e.eventoId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(20 + ALUNOS.length)
  }, 30_000)
})

// O provedor de verdade relê a config do banco quando pedem; a bancada comum
// devolve sempre a mesma. Aqui precisa ser a de verdade, porque o defeito era
// justamente a cópia em memória divergir da base.
function ProvedorQueRele({ bancada, children }: { bancada: Bancada; children: ReactNode }) {
  const [config, setConfig] = useState(bancada.config)
  const valor = {
    ...bancada,
    config,
    recarregarConfig: async () => setConfig(await bancada.repositorio.lerConfig()),
  }
  return <ContextoAdsum.Provider value={valor}>{children}</ContextoAdsum.Provider>
}

describe('reinstalar e religar a pasta: o sal do cofre vale na hora, não só ao reabrir', () => {
  const CRACHA = '3770f213'

  beforeEach(() => {
    window.localStorage.setItem('adsum.instalacao.dispensada', 'sim')
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    })
  })

  afterEach(() => {
    delete window.showDirectoryPicker
    window.localStorage.clear()
  })

  it('um crachá cadastrado antes de reinstalar é reconhecido logo depois', async () => {
    // A instalação antiga, com a turma cadastrada, grava o cofre.
    const antiga = await montarBancada()
    const { handle } = criarPastaFalsa()
    adiarHorario(TURMA)
    await antiga.repositorio.salvarTurma(TURMA, [pessoa(0)])
    await antiga.repositorio.gravarVinculo({
      uidHash: 'aaaa000000000000',
      papel: 'professor',
      nome: 'Prof',
      matricula: 'p',
      criadoEm: new Date().toISOString(),
    })
    await antiga.repositorio.gravarVinculo({
      uidHash: await calcularUidHash(antiga.config.salHex, hexParaUid(CRACHA)),
      papel: 'aluno',
      nome: 'Maria Vitória',
      matricula: pessoa(0).matricula,
      criadoEm: new Date().toISOString(),
    })
    await sincronizar(antiga.repositorio, handle)

    // Reinstalado: base vazia, sal novo sorteado, e o professor religa a pasta.
    const nova = await montarBancada()
    expect(nova.config.salHex).not.toBe(antiga.config.salHex)
    // A pasta falsa não é clonável pelo IndexedDB falso; o handle guardado é
    // entregue direto, como o navegador entregaria o que guardou.
    nova.repositorio.lerPasta = async () => handle

    render(
      <ProvedorQueRele bancada={nova}>
        <Fluxo />
      </ProvedorQueRele>,
    )
    await screen.findByText(/Começar a chamada/)
    await waitFor(async () =>
      expect((await nova.repositorio.lerConfig()).salHex).toBe(antiga.config.salHex),
    )

    await act(async () => nova.leitor.simular(CRACHA))

    expect(await screen.findByText(/Maria Vitória foi lido/)).toBeInTheDocument()
  })
})
