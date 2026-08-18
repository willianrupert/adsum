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
import { cabecalhoCsv, deCsv, linhaCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import type { Evento } from '../nucleo/tipos.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { acrescentar, escrever, ler, listarArquivos } from './pasta.ts'

export interface Resumo {
  arquivos: string[]
  problemas: string[]
}

export function caminhoDosRegistros(turma: string): string {
  return `registros/${nomeDoArquivo(turma)}`
}

/**
 * Uma linha nova no log da turma. **Nunca reescreve o arquivo.**
 *
 * Chamada por evento, e não por sincronização inteira: com cinquenta alunos
 * numa fila, regravar o arquivo a cada crachá seria trabalho crescente por
 * leitura — e, com a pasta sincronizada, apagaria o que outra máquina escreveu.
 */
export async function acrescentarNoLog(
  pasta: FileSystemDirectoryHandle,
  evento: Evento,
): Promise<void> {
  await acrescentar(
    pasta,
    caminhoDosRegistros(evento.turma),
    linhaCsv(evento) + '\n',
    cabecalhoCsv(),
  )
}

/**
 * Reescreve os arquivos de log a partir do cache. **Só para conserto.**
 *
 * O caminho normal é append, uma linha por vez. Este existe para quando uma
 * gravação falhou — permissão revogada, pasta desmontada, disco cheio — e a
 * pasta ficou para trás do IndexedDB. Como o cache tem tudo o que a pasta tem e
 * mais, regravar aqui não perde nada.
 *
 * Não use no caminho normal: com a pasta sincronizada, regravar apaga o que
 * outra máquina escreveu.
 */
export async function repararLog(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const eventos = await repositorio.listarEventos()
  const arquivos: string[] = []
  for (const [turma, linhas] of porTurma([...eventos].reverse())) {
    const caminho = caminhoDosRegistros(turma)
    await escrever(pasta, caminho, paraCsv(linhas))
    arquivos.push(caminho)
  }
  return { arquivos, problemas: [] }
}

/**
 * Grava o cadastro na pasta: config, vínculos, grade e turmas.
 *
 * Só o que é reescrito por inteiro passa por aqui. O log não — ele cresce por
 * `acrescentarNoLog`.
 */
export async function sincronizar(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const [config, vinculos, aulas, matriculados] = await Promise.all([
    repositorio.lerConfig(),
    repositorio.listarVinculos(),
    repositorio.listarAulas(),
    repositorio.listarMatriculados(),
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
