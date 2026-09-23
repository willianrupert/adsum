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
import { ContextoAdsum, fecharChamadaDeAntes } from './adsum.ts'
import { marcarChamadaViva } from '../ambiente/chamadaViva.ts'
import { calcularUidHash, idDoSal, saisConhecidos } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'
import { proximoEventoId } from '../nucleo/sessao.ts'
import type { Matriculado } from '../nucleo/tipos.ts'
import { adiarHorario } from '../ambiente/preferencias.ts'
import { restaurar, sincronizar } from '../ambiente/sincronia.ts'
import { LeitorTeclado } from '../adaptadores/leitor/LeitorTeclado.ts'
import { esquecerDiario, linhasDoDiario } from '../ambiente/diario.ts'
import { anotarUid, CAMINHO_DA_AUDITORIA, esquecerAuditoria } from '../ambiente/auditoriaDeUids.ts'
import { ler } from '../ambiente/pasta.ts'
import { gravarEventoNovo, gravarMarcasPendentes, identificarCracha, vinculosSemSal } from '../portas/Repositorio.ts'

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

  // A rede de segurança: mesmo que o número reservado já esteja ocupado — um
  // log trazido de fora com ids desta instalação —, a gravação acontece.
  it('id reservado já ocupado não perde o evento', async () => {
    const { repositorio, config } = bancada
    // O próximo a ser reservado é o seguinte ao que acabou de sair.
    const ocupado = proximoEventoId(config.instalacaoId, new Date(), (await repositorio.reservarSequencia()) + 1)
    await repositorio.acrescentarEvento({
      eventoId: ocupado,
      quando: new Date().toISOString(),
      turma: TURMA,
      nome: 'De outro lugar',
      origem: 'manual',
      resultado: 'ok',
      uidHash: 'aaaa111122223333',
    })

    const evento = await gravarEventoNovo(repositorio, config.instalacaoId, new Date(), (eventoId) => ({
      eventoId,
      quando: new Date().toISOString(),
      turma: TURMA,
      nome: 'Aluno 1',
      origem: 'manual' as const,
      resultado: 'ok' as const,
      uidHash: 'bbbb111122223333',
    }))
    expect(evento.eventoId).not.toBe(ocupado)
    expect(await repositorio.vinculoPorHash('bbbb111122223333')).toBeUndefined() // nada além do evento
    expect((await repositorio.listarEventos({ turma: TURMA })).map((e) => e.eventoId)).toContain(evento.eventoId)
  })

  it('trinta eventos gravados ao mesmo tempo ganham trinta ids diferentes', async () => {
    const { repositorio, config } = bancada
    const gravados = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        gravarEventoNovo(repositorio, config.instalacaoId, new Date(), (eventoId) => ({
          eventoId,
          quando: new Date().toISOString(),
          turma: TURMA,
          nome: `Aluno ${i}`,
          origem: 'manual' as const,
          resultado: 'ok' as const,
          uidHash: `cafe${String(i).padStart(12, '0')}`,
        })),
      ),
    )
    const ids = gravados.map((e) => e.eventoId)
    expect(new Set(ids).size).toBe(30)
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

// ---------------------------------------------------------------------------
// O que veio do relato, além dos dois defeitos de gravação.

function tecla(caractere: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: caractere, bubbles: true, cancelable: true }))
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/** O dongle de verdade: dígitos a 16-32 ms, e um Enter no fim. */
async function encostarNoDongle(decimal: string) {
  for (const [i, c] of [...decimal].entries()) {
    if (i > 0) await esperar(17)
    tecla(c)
  }
  tecla('Enter')
}

describe('"começou do nada": o Enter do dongle não é o Enter de uma pessoa', () => {
  beforeEach(() => window.localStorage.setItem('adsum.instalacao.dispensada', 'sim'))
  afterEach(() => window.localStorage.clear())

  it('crachá de aluno no repouso diz quem foi lido e não abre a chamada', async () => {
    const bancada = await montarBancada()
    const leitor = new LeitorTeclado()
    await leitor.iniciar()
    adiarHorario(TURMA)
    await bancada.repositorio.salvarTurma(TURMA, [pessoa(0)])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa000000000000',
      papel: 'professor',
      nome: 'Prof',
      criadoEm: new Date().toISOString(),
    })
    // 2367396804 → 8d 1b 9b c4: um dos dois UIDs medidos no dongle real.
    await bancada.repositorio.gravarVinculo({
      uidHash: await calcularUidHash(bancada.config.salHex, hexParaUid('8d1b9bc4')),
      papel: 'aluno',
      nome: 'Maria Vitória',
      matricula: pessoa(0).matricula,
      criadoEm: new Date().toISOString(),
    })
    renderizarCom({ ...bancada, leitor } as unknown as Bancada, <Fluxo />)
    // Com a turma já firmada: senão o Enter não abriria nada de qualquer
    // jeito, e o teste passaria sem provar coisa nenhuma.
    await screen.findByText(TURMA)
    await waitFor(() => expect(screen.getByRole('button', { name: /Começar a chamada/ })).toBeEnabled())

    await act(async () => encostarNoDongle('2367396804'))

    expect(await screen.findByText(/Maria Vitória foi lido/)).toBeInTheDocument()
    await esperar(200)
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
    await leitor.parar()
  })

  it('Enter de gente, no teclado, continua começando a chamada', async () => {
    const bancada = await montarBancada()
    adiarHorario(TURMA)
    await bancada.repositorio.salvarTurma(TURMA, [pessoa(0)])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa000000000000',
      papel: 'professor',
      nome: 'Prof',
      criadoEm: new Date().toISOString(),
    })
    renderizarCom(bancada, <Fluxo />)
    // A turma só se firma depois de `recontar()`; Enter antes disso não tem o
    // que abrir, e o teste mediria a corrida, não o atalho.
    await screen.findByText(TURMA)
    await waitFor(() => expect(screen.getByRole('button', { name: /Começar a chamada/ })).toBeEnabled())

    await userEvent.setup().keyboard('{Enter}')

    await waitFor(async () => expect(await bancada.repositorio.sessaoAberta()).toBeDefined())
  })
})

describe('uma chamada por turma por dia', () => {
  it('reabrir no mesmo dia continua de onde parou', async () => {
    const bancada = await montarBancada()
    const ALUNOS = [pessoa(0), pessoa(1)]
    await bancada.repositorio.salvarTurma(TURMA, ALUNOS)
    const agora = new Date()
    // Dois presentes numa chamada anterior do mesmo dia, já encerrada.
    for (const [i, aluno] of ALUNOS.entries()) {
      await bancada.repositorio.acrescentarEvento({
        eventoId: proximoEventoId(bancada.config.instalacaoId, agora, i + 1),
        quando: new Date(agora.getTime() - (5 - i) * 60_000).toISOString(),
        turma: TURMA,
        matricula: aluno.matricula,
        nome: aluno.nome,
        origem: 'cracha',
        resultado: 'ok',
        uidHash: `bbbb${String(i).padStart(12, '0')}`,
      })
    }
    const reaberta = { turma: TURMA, abertaEm: agora.toISOString(), uidHashProfessor: 'professor' }
    await bancada.repositorio.abrirSessao(reaberta)

    renderizarCom(
      bancada,
      <TelaAula sessao={reaberta} pendentes={[]} daTurma={ALUNOS} aoMudarBase={() => {}} />,
    )

    await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('aria-label', '2'))
  })

  it('outro dia é outra chamada', async () => {
    const bancada = await montarBancada()
    await bancada.repositorio.salvarTurma(TURMA, [pessoa(0)])
    const ontem = new Date(Date.now() - 24 * 60 * 60_000)
    await bancada.repositorio.acrescentarEvento({
      eventoId: proximoEventoId(bancada.config.instalacaoId, ontem, 1),
      quando: ontem.toISOString(),
      turma: TURMA,
      matricula: pessoa(0).matricula,
      nome: pessoa(0).nome,
      origem: 'cracha',
      resultado: 'ok',
      uidHash: 'bbbb000000000000',
    })
    const sessao = { turma: TURMA, abertaEm: new Date().toISOString(), uidHashProfessor: 'professor' }
    await bancada.repositorio.abrirSessao(sessao)
    renderizarCom(bancada, <TelaAula sessao={sessao} pendentes={[]} daTurma={[pessoa(0)]} aoMudarBase={() => {}} />)

    await esperar(100)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '0')
  })

  it('recarregar a mesma janela não fecha a chamada; fechar a janela, sim', async () => {
    const bancada = await montarBancada()
    const sessao = { turma: TURMA, abertaEm: new Date().toISOString(), uidHashProfessor: 'professor' }
    await bancada.repositorio.abrirSessao(sessao)

    marcarChamadaViva(true) // a janela tinha chamada aberta e recarregou
    await fecharChamadaDeAntes(bancada.repositorio)
    expect(await bancada.repositorio.sessaoAberta()).toMatchObject(sessao)

    marcarChamadaViva(false) // janela nova: o sessionStorage morreu com a antiga
    await fecharChamadaDeAntes(bancada.repositorio)
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })

  it('abrir o app fecha a chamada que ficou aberta', async () => {
    const bancada = await montarBancada()
    await bancada.repositorio.abrirSessao({
      turma: TURMA,
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'professor',
    })
    await fecharChamadaDeAntes(bancada.repositorio)
    expect(await bancada.repositorio.sessaoAberta()).toBeUndefined()
  })
})

describe('aluno cadastrado nunca se perde por troca de sal', () => {
  const CRACHA = hexParaUid('3770f213')

  it('trocar o sal guarda o anterior, e o crachá antigo segue reconhecido', async () => {
    const { repositorio, config } = await montarBancada()
    const uidHash = await calcularUidHash(config.salHex, CRACHA)
    await repositorio.gravarVinculo({ uidHash, papel: 'aluno', nome: 'Maria', criadoEm: new Date().toISOString() })

    await repositorio.definirSal('00112233445566778899aabbccddeeff')
    const depois = await repositorio.lerConfig()
    expect(depois.saisAnteriores).toContain(config.salHex)

    const achado = await identificarCracha(repositorio, CRACHA)
    expect(achado.vinculo?.nome).toBe('Maria')
    expect(achado.uidHash).toBe(uidHash)
    // Vínculo antigo ganha a impressão do sal na primeira leitura.
    // A marca não é gravada durante a leitura — só no lote, depois.
    expect((await repositorio.vinculoPorHash(uidHash))?.salId).toBeUndefined()
    await gravarMarcasPendentes()
    expect((await repositorio.vinculoPorHash(uidHash))?.salId).toBe(await idDoSal(config.salHex))
  })

  it('uids.csv guarda o hash que liga ao vínculo, mesmo cadastrado num sal antigo', async () => {
    const { repositorio, config } = await montarBancada()
    const doVinculo = await calcularUidHash(config.salHex, CRACHA)
    await repositorio.gravarVinculo({ uidHash: doVinculo, papel: 'aluno', nome: 'Maria', criadoEm: '' })
    await repositorio.definirSal('00112233445566778899aabbccddeeff')

    esquecerAuditoria()
    const { handle } = criarPastaFalsa()
    await anotarUid(handle, () => identificarCracha(repositorio, CRACHA).then((r) => r.uidHash), CRACHA, new Date(), 'Dongle USB')

    const linha = (await ler(handle, CAMINHO_DA_AUDITORIA))!.trim().split('\n')[1]
    // É esta igualdade que refaz a base sem recadastro: uid_hex ao lado do
    // mesmo texto que está em vinculos.json.
    expect(linha.split(';').slice(0, 2)).toEqual(['3770f213', doVinculo])
  })

  it('crachá desconhecido cai no sal atual, que é onde o cadastro nasce', async () => {
    const { repositorio } = await montarBancada()
    await repositorio.definirSal('00112233445566778899aabbccddeeff')
    const config = await repositorio.lerConfig()
    const achado = await identificarCracha(repositorio, CRACHA)
    expect(achado.vinculo).toBeUndefined()
    expect(achado.uidHash).toBe(await calcularUidHash(config.salHex, CRACHA))
  })

  it('o Diagnóstico conta os crachás de um sal que o navegador não tem', async () => {
    const { repositorio, config } = await montarBancada()
    await repositorio.gravarVinculo({
      uidHash: 'cccc000000000000',
      papel: 'aluno',
      nome: 'Perdido',
      criadoEm: new Date().toISOString(),
      salId: await idDoSal('ffeeddccbbaa99887766554433221100'),
    })
    await repositorio.gravarVinculo({
      uidHash: 'dddd000000000000',
      papel: 'aluno',
      nome: 'Em casa',
      criadoEm: new Date().toISOString(),
      salId: await idDoSal(config.salHex),
    })
    expect((await vinculosSemSal(repositorio, config)).map((v) => v.nome)).toEqual(['Perdido'])

    await repositorio.lembrarSais(['ffeeddccbbaa99887766554433221100'])
    expect(await vinculosSemSal(repositorio, await repositorio.lerConfig())).toEqual([])
  })

  it('o chaveiro vai para o cofre e volta na restauração', async () => {
    const antiga = await montarBancada()
    await antiga.repositorio.definirSal('00112233445566778899aabbccddeeff')
    await antiga.repositorio.gravarVinculo({ uidHash: 'eeee000000000000', papel: 'aluno', nome: 'X', criadoEm: '' })
    const { handle } = criarPastaFalsa()
    await sincronizar(antiga.repositorio, handle)

    const nova = await montarBancada()
    await restaurar(nova.repositorio, handle)
    const sais = saisConhecidos(await nova.repositorio.lerConfig())
    expect(sais).toContain(antiga.config.salHex)
    expect(sais).toContain('00112233445566778899aabbccddeeff')
    expect(sais).toContain(nova.config.salHex)
  })
})

describe('diário da chamada', () => {
  afterEach(esquecerDiario)

  it('cada crachá vira uma linha com decisão, id e tempos, e nunca com o código do crachá', async () => {
    const bancada = await montarBancada()
    const aluno = pessoa(0)
    await bancada.repositorio.salvarTurma(TURMA, [aluno])
    await bancada.repositorio.gravarVinculo({
      uidHash: await calcularUidHash(bancada.config.salHex, hexParaUid('04a23b91')),
      papel: 'aluno',
      nome: aluno.nome,
      matricula: aluno.matricula,
      criadoEm: new Date().toISOString(),
    })
    const sessao = { turma: TURMA, abertaEm: new Date().toISOString(), uidHashProfessor: 'professor' }
    await bancada.repositorio.abrirSessao(sessao)
    renderizarCom(bancada, <TelaAula sessao={sessao} pendentes={[]} daTurma={[aluno]} aoMudarBase={() => {}} />)

    await act(async () => bancada.leitor.simular('04a23b91'))

    await waitFor(() => expect(linhasDoDiario().some((l) => l.includes('| cracha |'))).toBe(true))
    const linha = linhasDoDiario().find((l) => l.includes('| cracha |'))!
    expect(linha).toMatch(/decisao=presenca/)
    expect(linha).toMatch(/evento=\S+/)
    expect(linha).toMatch(/identificar_ms=\d+ \| gravar_ms=\d+ \| tela_ms=\d+/)
    expect(linhasDoDiario().join('\n')).not.toContain('04a23b91')
    expect(linhasDoDiario().join('\n')).not.toContain(aluno.nome)
  })
})

// Achado ao vivo em 22/09/2026, testando o emulador: trocar de adaptador no
// Diagnóstico prendia o app em "o leitor caiu no meio da aula", com o dongle
// lendo normalmente, e o "Tentar de novo" não saía de lá.
describe('leitor trocado não prende a tela de problema', () => {
  beforeEach(() => window.localStorage.setItem('adsum.instalacao.dispensada', 'sim'))
  afterEach(() => window.localStorage.clear())

  it('leitor já lendo quando a tela monta não cai no problema', async () => {
    const bancada = await montarBancada()
    adiarHorario(TURMA)
    await bancada.repositorio.salvarTurma(TURMA, [pessoa(0)])
    await bancada.repositorio.gravarVinculo({
      uidHash: 'aaaa000000000000',
      papel: 'professor',
      nome: 'Prof',
      criadoEm: new Date().toISOString(),
    })
    const leitor = new LeitorTeclado()
    await leitor.iniciar() // já lendo antes de qualquer tela existir

    renderizarCom({ ...bancada, leitor } as unknown as Bancada, <Fluxo />)

    expect(await screen.findByText(/Começar a chamada/)).toBeInTheDocument()
    expect(screen.queryByText(/não está lendo/)).not.toBeInTheDocument()
    await leitor.parar()
  })
})
