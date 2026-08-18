// A ponte entre o cofre em disco e o cache em IndexedDB.
//
// A regra que define a inversão: **a pasta é a dona.** O teste de que ela
// aconteceu de fato é `restaurar` — o app tem que conseguir jogar fora o
// IndexedDB inteiro e reconstruí-lo lendo a pasta. Se isso não for verdade, a
// pasta virou só mais um backup, e o professor continua podendo perder tudo.

import {
  NOMES,
  deJsonGrade,
  deJsonTurma,
  deJsonVinculos,
  paraJsonConfig,
  paraJsonGrade,
  paraJsonTurma,
  paraJsonVinculos,
} from '../nucleo/cofre.ts'
import { deCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { escrever, ler, listarArquivos } from './pasta.ts'

export interface Resumo {
  arquivos: string[]
  problemas: string[]
}

/** Grava o estado inteiro na pasta. Chamado depois de cada mudança. */
export async function sincronizar(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const [config, vinculos, aulas, matriculados, eventos] = await Promise.all([
    repositorio.lerConfig(),
    repositorio.listarVinculos(),
    repositorio.listarAulas(),
    repositorio.listarMatriculados(),
    repositorio.listarEventos(),
  ])

  const arquivos: string[] = []
  const gravar = async (caminho: string, texto: string) => {
    await escrever(pasta, caminho, texto)
    arquivos.push(caminho)
  }

  await gravar(NOMES.config, paraJsonConfig(config))
  await gravar(NOMES.vinculos, paraJsonVinculos(vinculos))
  await gravar(NOMES.grade, paraJsonGrade(aulas))

  const turmas = new Map<string, typeof matriculados>()
  for (const pessoa of matriculados) {
    turmas.set(pessoa.turma, [...(turmas.get(pessoa.turma) ?? []), pessoa])
  }
  for (const [turma, pessoas] of turmas) {
    await gravar(NOMES.turma(turma), paraJsonTurma(pessoas))
  }

  // Registros em ordem de acontecimento: o arquivo cresce pelo fim, como o log
  // que ele é.
  for (const [turma, linhas] of porTurma([...eventos].reverse())) {
    await gravar(`registros/${nomeDoArquivo(turma)}`, paraCsv(linhas))
  }

  return { arquivos, problemas: [] }
}

/** Reconstrói o cache a partir da pasta. É o caminho de voltar do zero. */
export async function restaurar(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const problemas: string[] = []
  const arquivos: string[] = []

  const vinculosCru = await ler(pasta, NOMES.vinculos)
  if (vinculosCru) {
    const { conteudo, problemas: falhas } = deJsonVinculos(vinculosCru)
    for (const vinculo of conteudo ?? []) await repositorio.gravarVinculo(vinculo)
    problemas.push(...falhas.map((f) => f.motivo))
    arquivos.push(NOMES.vinculos)
  }

  const gradeCru = await ler(pasta, NOMES.grade)
  if (gradeCru) {
    const { conteudo, problemas: falhas } = deJsonGrade(gradeCru)
    for (const aula of conteudo ?? []) await repositorio.gravarAula({ ...aula, id: undefined })
    problemas.push(...falhas.map((f) => f.motivo))
    arquivos.push(NOMES.grade)
  }

  for (const nome of await listarArquivos(pasta, ['turmas'])) {
    const cru = await ler(pasta, `turmas/${nome}`)
    if (!cru) continue
    const { conteudo, problemas: falhas } = deJsonTurma(cru, nome)
    if (conteudo?.length) await repositorio.salvarTurma(conteudo[0].turma, conteudo)
    problemas.push(...falhas.map((f) => f.motivo))
    arquivos.push(`turmas/${nome}`)
  }

  for (const nome of await listarArquivos(pasta, ['registros'])) {
    const cru = await ler(pasta, `registros/${nome}`)
    if (!cru) continue
    const { itens, problemas: falhas } = deCsv(cru)
    // `evento_id` é a chave: reler o mesmo arquivo não duplica nada.
    for (const evento of itens) await repositorio.acrescentarEvento(evento)
    problemas.push(...falhas.map((f) => `${nome}, linha ${f.linha}: ${f.motivo}`))
    arquivos.push(`registros/${nome}`)
  }

  return { arquivos, problemas }
}
