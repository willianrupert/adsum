import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import {
  acrescentarNoLog,
  conferirLog,
  gravarFaltas,
  repararLog,
  restaurar,
  restaurarDeArquivos,
  sincronizar,
} from './sincronia.ts'
import { calcularUidHash } from '../nucleo/hash.ts'
import { hexParaUid } from '../nucleo/uid.ts'

let n = 0
let repo: RepositorioDexie

const VINCULO = {
  uidHash: '309940e145b847cf',
  papel: 'aluno' as const,
  nome: 'Willian Neves',
  matricula: '20250023010',
  criadoEm: '2026-08-18T10:00:00.000Z',
}
const PESSOA = {
  turma: 'IF685 · T01',
  chave: '20250023010',
  matricula: '20250023010',
  nomeCompleto: 'WILLIAN NEVES RUPERT JONES',
  nome: 'Willian Neves',
  papel: 'aluno' as const,
}
const EVENTO = {
  eventoId: 'web-a1b2-20260818-0001',
  quando: '2026-08-18T10:06:00.000Z',
  turma: 'IF685 · T01',
  matricula: '20250023010',
  nome: 'Willian Neves',
  origem: 'cracha' as const,
  resultado: 'ok' as const,
  uidHash: '309940e145b847cf',
}

beforeEach(async () => {
  repo = new RepositorioDexie(`adsum-cofre-${n++}`)
  await repo.abrir()
})

describe('cofre em pasta', () => {
  it('grava o cadastro com os nomes do desenho', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])

    const { arquivos } = await sincronizar(repo, handle)
    expect(arquivos).toEqual([
      'LEIA-ME.txt',
      'config.json',
      'vinculos.json',
      'grade.json',
      'turmas/IF685-T01.json',
    ])
  })

  // Fase 4, item C: com `turma`, só o cadastro dessa turma é regravado — os
  // quatro arquivos globais (config/vínculos/grade/leia-me) continuam
  // sempre, porque `vinculos.json` pode ter mudado em qualquer crachá.
  it('com turma informada, regrava só o cadastro dessa turma', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])
    await repo.salvarTurma('IF685 · T02', [{ ...PESSOA, turma: 'IF685 · T02', chave: '2', matricula: '2' }])

    const { arquivos } = await sincronizar(repo, handle, 'IF685 · T01')
    expect(arquivos).toEqual([
      'LEIA-ME.txt',
      'config.json',
      'vinculos.json',
      'grade.json',
      'turmas/IF685-T01.json',
    ])
  })

  // O log não entra na sincronização do cadastro: ele cresce por append, um
  // evento por vez. Regravá-lo a cada crachá seria trabalho crescente por
  // leitura — e, com a pasta sincronizada, apagaria a aula da outra máquina.
  it('o log cresce por append, e o cabeçalho vai uma vez só', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'web-a1b2-20260818-0002' })

    const texto = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    // `trim()` come o BOM — ele é espaço em branco para o JavaScript. Por isso
    // a checagem do BOM é no texto cru.
    expect(texto.startsWith('\ufeff')).toBe(true)
    const linhas = texto.trim().split('\n')
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toMatch(/^evento_id;/)
    expect(linhas[1]).toContain('20260818-0001')
    expect(linhas[2]).toContain('20260818-0002')
  })

  it('acrescentar nunca reescreve o que já estava lá', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    const antes = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'outro' })
    const depois = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    expect(depois.startsWith(antes)).toBe(true)
  })

  it('cada turma tem seu próprio arquivo', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await acrescentarNoLog(handle, EVENTO)
    await acrescentarNoLog(handle, { ...EVENTO, eventoId: 'b', turma: 'IF669 · T02' })
    expect([...raiz.pastas.get('registros')!.arquivos.keys()].sort()).toEqual([
      'IF669-T02.csv',
      'IF685-T01.csv',
    ])
  })

  // "Se a pasta é a dona, o arquivo já está pronto no disco" — a mesma regra
  // de `registros/`, agora para a planilha que o professor de fato entrega.
  // Sem botão: `gravarFaltas` roda a cada mudança (ver `mudou()`, em
  // `Fluxo.tsx`), e é recalculada do zero — nunca lida de volta na
  // reconstrução, porque não é fonte de verdade, é relatório.
  describe('a planilha organizada, sempre pronta na pasta', () => {
    it('escreve faltas/<turma>.csv com nome completo, assim que há aula registrada', async () => {
      const { handle, raiz } = criarPastaFalsa()
      await repo.gravarVinculo(VINCULO)
      await repo.salvarTurma('IF685 · T01', [PESSOA])
      await repo.acrescentarEvento({
        ...EVENTO,
        eventoId: 'web-a1b2-20260818-0000',
        uidHash: VINCULO.uidHash,
        nome: '',
        origem: 'professor',
      })
      await repo.acrescentarEvento(EVENTO)

      const { arquivos } = await gravarFaltas(repo, handle)
      expect(arquivos).toEqual(['faltas/IF685-T01.csv'])

      const texto = raiz.pastas.get('faltas')!.arquivos.get('IF685-T01.csv')!
      expect(texto.startsWith('﻿')).toBe(true)
      expect(texto).toContain(PESSOA.nomeCompleto)
    })

    it('turma sem aula registrada ainda não ganha planilha vazia', async () => {
      const { handle, raiz } = criarPastaFalsa()
      await repo.salvarTurma('IF685 · T01', [PESSOA])

      const { arquivos } = await gravarFaltas(repo, handle)
      expect(arquivos).toEqual([])
      expect(raiz.pastas.has('faltas')).toBe(false)
    })

    // Fase 4, item C (`docs/05_plano_execucao.md`): um crachá aceito numa
    // turma não pode regravar a planilha de outra que não mudou.
    it('com turma informada, regrava só essa turma — a outra fica intocada', async () => {
      const { handle, raiz } = criarPastaFalsa()
      const PESSOA_B = { ...PESSOA, turma: 'IF685 · T02', chave: '20250099099', matricula: '20250099099' }
      await repo.gravarVinculo(VINCULO)
      await repo.salvarTurma('IF685 · T01', [PESSOA])
      await repo.salvarTurma('IF685 · T02', [PESSOA_B])
      await repo.acrescentarEvento({
        ...EVENTO,
        eventoId: 'web-a1b2-20260818-0000',
        uidHash: VINCULO.uidHash,
        nome: '',
        origem: 'professor',
      })
      await repo.acrescentarEvento(EVENTO)
      await repo.acrescentarEvento({
        ...EVENTO,
        eventoId: 'web-a1b2-20260818-0002',
        turma: 'IF685 · T02',
        uidHash: VINCULO.uidHash,
        nome: '',
        origem: 'professor',
      })
      await repo.acrescentarEvento({ ...EVENTO, eventoId: 'web-a1b2-20260818-0003', turma: 'IF685 · T02' })

      // As duas primeiro, pra provar que a segunda chamada (escopada) não
      // apaga nem deixa de tocar o que já existia da outra turma.
      await gravarFaltas(repo, handle)
      expect(raiz.pastas.get('faltas')!.arquivos.has('IF685-T02.csv')).toBe(true)

      const { arquivos } = await gravarFaltas(repo, handle, 'IF685 · T01')
      expect(arquivos).toEqual(['faltas/IF685-T01.csv'])
      // A de T02 continua lá — não foi apagada, e a chamada nem tentou lê-la.
      expect(raiz.pastas.get('faltas')!.arquivos.has('IF685-T02.csv')).toBe(true)
    })

    it('não é fonte de verdade — a pasta com faltas/ ainda reconstrói pelo log', async () => {
      const { handle } = criarPastaFalsa()
      await repo.gravarVinculo(VINCULO)
      await repo.salvarTurma('IF685 · T01', [PESSOA])
      const abertura = {
        ...EVENTO,
        eventoId: 'web-a1b2-20260818-0000',
        uidHash: VINCULO.uidHash,
        nome: '',
        origem: 'professor' as const,
      }
      await repo.acrescentarEvento(abertura)
      await repo.acrescentarEvento(EVENTO)
      await acrescentarNoLog(handle, abertura)
      await acrescentarNoLog(handle, EVENTO)
      await sincronizar(repo, handle)
      await gravarFaltas(repo, handle)

      await repo.esvaziarCache()
      const { problemas } = await restaurar(repo, handle)
      expect(problemas).toEqual([])
      // A base volta inteira sem faltas/ ter sido lida — só registros/,
      // turmas/, vinculos.json e grade.json alimentam a reconstrução.
      expect(await repo.contarEventos()).toBe(2)
    })
  })

  // O teste de que a inversão aconteceu de fato: jogar fora o IndexedDB inteiro
  // e reconstruí-lo lendo a pasta. Se isto falhar, a pasta virou só backup e o
  // professor continua podendo perder tudo.
  it('reconstrói a base inteira depois de o cache ser apagado', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await repo.salvarTurma('IF685 · T01', [PESSOA])
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
    await repo.gravarAula({
      uidHashProfessor: VINCULO.uidHash,
      dia: 3,
      inicio: '08:00',
      fim: '10:00',
      turma: 'IF685 · T01',
    })
    await sincronizar(repo, handle)

    await repo.esvaziarCache()
    expect(await repo.listarVinculos()).toHaveLength(0)

    const { problemas } = await restaurar(repo, handle)
    expect(problemas).toEqual([])
    expect(await repo.listarVinculos()).toEqual([VINCULO])
    expect(await repo.listarMatriculados('IF685 · T01')).toEqual([PESSOA])
    expect(await repo.listarAulas()).toHaveLength(1)
    expect(await repo.contarEventos()).toBe(1)
  })

  // O caso que estava faltando, e o mais comum de todos: **outro navegador na
  // mesma máquina**. Os testes de restauração usavam `esvaziarCache`, que
  // preserva a config de propósito — e por isso nunca exercitaram a perda do
  // sal. Um navegador novo sorteia o dele ao abrir; se a restauração não
  // adotar o do cofre, cada crachá passa a dar outro `uid_hash` e a turma
  // inteira vira gente desconhecida, sem uma linha de erro.
  it('outro navegador adota o sal do cofre ao restaurar', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await sincronizar(repo, handle)
    const doCofre = (await repo.lerConfig()).salHex

    const outroNavegador = new RepositorioDexie(`adsum-cofre-${n++}`)
    await outroNavegador.abrir()
    expect((await outroNavegador.lerConfig()).salHex).not.toBe(doCofre)

    await restaurar(outroNavegador, handle)
    expect((await outroNavegador.lerConfig()).salHex).toBe(doCofre)
  })

  // O que o sal significa na prática, e é isto que o professor sente: o mesmo
  // crachá, na mesma máquina, em outro navegador. Sem adotar o sal do cofre a
  // conta abaixo dá outro hash e a pessoa some da base sem erro nenhum.
  it('o mesmo crachá é reconhecido depois de trocar de navegador', async () => {
    const { handle } = criarPastaFalsa()
    const CRACHA = hexParaUid('04a23b91')

    const meuHash = await calcularUidHash((await repo.lerConfig()).salHex, CRACHA)
    await repo.gravarVinculo({ ...VINCULO, uidHash: meuHash })
    await sincronizar(repo, handle)

    const outroNavegador = new RepositorioDexie(`adsum-cofre-${n++}`)
    await outroNavegador.abrir()
    await restaurar(outroNavegador, handle)

    const hashLa = await calcularUidHash((await outroNavegador.lerConfig()).salHex, CRACHA)
    expect(await outroNavegador.vinculoPorHash(hashLa)).toMatchObject({ nome: 'Willian Neves' })
  })

  // O Safari não tem seletor de diretório: lá a volta é por arquivos soltos, e
  // o sal precisa vir por esse caminho também — senão trocar Chrome por Safari
  // na mesma máquina quebra do mesmo jeito.
  it('o sal também volta pelo caminho dos arquivos soltos', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await sincronizar(repo, handle)
    const doCofre = (await repo.lerConfig()).salHex

    const soltos = [...raiz.arquivos].map(
      ([nome, texto]) => ({ name: nome, text: async () => texto }) as File,
    )

    const safari = new RepositorioDexie(`adsum-cofre-${n++}`)
    await safari.abrir()
    const { arquivos, problemas } = await restaurarDeArquivos(safari, soltos)

    expect(problemas).toEqual([])
    expect(arquivos).toContain('config.json')
    expect((await safari.lerConfig()).salHex).toBe(doCofre)
  })

  // Trocar o sal com base própria no lugar torna irreconhecíveis os crachás
  // daqui. Recusar e dizer por quê é o único desfecho aceitável: adotar em
  // silêncio apagaria a turma de quem está usando.
  // Antes isto recusava, e os crachás do cofre ficavam mortos numa base que
  // já tinha os seus. Agora os dois valem: o atual fica, o do cofre entra no
  // chaveiro (17/09/2026, ver `adotarSal`).
  it('com crachás dos dois lados, mantém o sal daqui e guarda o do cofre', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await sincronizar(repo, handle)
    const doCofre = (await repo.lerConfig()).salHex

    const ocupado = new RepositorioDexie(`adsum-cofre-${n++}`)
    await ocupado.abrir()
    const salDele = (await ocupado.lerConfig()).salHex
    await ocupado.gravarVinculo({ ...VINCULO, uidHash: 'ffffffffffffffff' })

    const { problemas } = await restaurar(ocupado, handle)

    const depois = await ocupado.lerConfig()
    expect(depois.salHex).toBe(salDele)
    expect(depois.saisAnteriores).toContain(doCofre)
    expect(problemas).toEqual([])
  })

  it('base vazia adota o sal do cofre sem jogar fora o que tinha sorteado', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await sincronizar(repo, handle)
    const doCofre = (await repo.lerConfig()).salHex

    const nova = new RepositorioDexie(`adsum-cofre-${n++}`)
    await nova.abrir()
    const sorteado = (await nova.lerConfig()).salHex
    await restaurar(nova, handle)

    const depois = await nova.lerConfig()
    expect(depois.salHex).toBe(doCofre)
    expect(depois.saisAnteriores).toContain(sorteado)
  })

  it('restaurar duas vezes não duplica evento', async () => {
    const { handle } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
    await sincronizar(repo, handle)
    await repo.esvaziarCache()
    await restaurar(repo, handle)
    await restaurar(repo, handle)
    expect(await repo.contarEventos()).toBe(1)
  })

  it('pasta vazia não é erro — é primeira vez', async () => {
    const { handle } = criarPastaFalsa()
    const { arquivos, problemas } = await restaurar(repo, handle)
    expect(arquivos).toEqual([])
    expect(problemas).toEqual([])
  })
})

describe('conserto depois de falha de gravação', () => {
  // Se a permissão cai no meio da aula, a pasta fica para trás do cache. O
  // cache tem tudo o que ela tem e mais, então regravar não perde nada — e é
  // por isso que este caminho existe separado do append.
  it('regrava o log inteiro a partir do cache', async () => {
    const { handle, raiz } = criarPastaFalsa()
    for (const i of [1, 2, 3]) {
      await repo.acrescentarEvento({
        ...EVENTO,
        eventoId: `web-a1b2-20260818-000${i}`,
        quando: `2026-08-18T10:0${i}:00.000Z`,
      })
    }
    // Nada foi para a pasta: é o estado depois de a gravação falhar.
    expect(raiz.pastas.get('registros')).toBeUndefined()

    await repararLog(repo, handle)
    const texto = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    expect(texto.trim().split('\n')).toHaveLength(4)
    expect(deCsvTeste(texto)).toEqual([
      'web-a1b2-20260818-0001',
      'web-a1b2-20260818-0002',
      'web-a1b2-20260818-0003',
    ])
  })

  it('consertar duas vezes não duplica linha', async () => {
    const { handle, raiz } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await repararLog(repo, handle)
    await repararLog(repo, handle)
    const texto = raiz.pastas.get('registros')!.arquivos.get('IF685-T01.csv')!
    expect(texto.trim().split('\n')).toHaveLength(2)
  })
})

function deCsvTeste(texto: string): string[] {
  return texto
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(';')[0])
}

// 22/09/2026: a planilha e a base divergiram calado. A conferência compara as
// duas e só acrescenta — nunca reescreve o que já foi gravado.
describe('conferência da planilha contra a base', () => {
  const SEGUNDO = { ...EVENTO, eventoId: 'web-a1b2-20260818-0002', quando: '2026-08-18T10:07:00.000Z' }

  it('evento que a pasta perdeu volta para o fim do arquivo', async () => {
    const { handle } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
    // Gravou na base, e a gravação na pasta falhou.
    await repo.acrescentarEvento(SEGUNDO)

    const [c] = await conferirLog(repo, handle)
    expect(c).toMatchObject({ naBase: 2, noArquivo: 1, acrescentados: 1, soNoArquivo: 0, repetidos: 0 })

    const [depois] = await conferirLog(repo, handle)
    expect(depois).toMatchObject({ naBase: 2, noArquivo: 2, acrescentados: 0 })
  })

  it('denuncia, sem apagar, a linha repetida que a base recusou', async () => {
    const { handle } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
    // O defeito de 22/09: mesmo id, outra pessoa, só no arquivo.
    await acrescentarNoLog(handle, { ...EVENTO, nome: 'Outra Pessoa', quando: '2026-08-18T10:09:00.000Z' })

    const [c] = await conferirLog(repo, handle)
    expect(c).toMatchObject({ naBase: 1, noArquivo: 2, acrescentados: 0, repetidos: 1 })
  })

  it('linha no arquivo que a base não tem é contada', async () => {
    const { handle } = criarPastaFalsa()
    await repo.acrescentarEvento(EVENTO)
    await acrescentarNoLog(handle, EVENTO)
    await acrescentarNoLog(handle, SEGUNDO)

    const [c] = await conferirLog(repo, handle)
    expect(c).toMatchObject({ soNoArquivo: 1, acrescentados: 0 })
  })
})
