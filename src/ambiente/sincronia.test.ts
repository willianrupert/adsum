import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { criarPastaFalsa } from '../testes/pastaFalsa.ts'
import {
  acrescentarNoLog,
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
  it('não troca o sal por cima de crachás já cadastrados', async () => {
    const { handle } = criarPastaFalsa()
    await repo.gravarVinculo(VINCULO)
    await sincronizar(repo, handle)

    const ocupado = new RepositorioDexie(`adsum-cofre-${n++}`)
    await ocupado.abrir()
    const salDele = (await ocupado.lerConfig()).salHex
    await ocupado.gravarVinculo({ ...VINCULO, uidHash: 'ffffffffffffffff' })

    const { problemas } = await restaurar(ocupado, handle)

    expect((await ocupado.lerConfig()).salHex).toBe(salDele)
    expect(problemas.join(' ')).toMatch(/outro segredo/)
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
