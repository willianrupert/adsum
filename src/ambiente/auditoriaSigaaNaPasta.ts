// A auditoria do SIGAA na pasta (`sigaa/<turma>.csv`): como o log, só
// acrescenta, e é conferida contra a base nos dois sentidos.

import { nomeSeguroDeTurma } from '../nucleo/csv.ts'
import { ajustesDaAuditoria, cabecalhoDaAuditoria, deCsvDaAuditoria, linhaDaAuditoria } from '../nucleo/lancar/auditoria.ts'
import type { LinhaDeAuditoria } from '../nucleo/lancar/tipos.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { acrescentar, ler, listarArquivos } from './pasta.ts'
import { caminhoDaAuditoriaSigaa } from './sincronia.ts'

/** Linhas de auditoria que a base não tem entram nela, e cada aceite volta a ser ajuste. */
export async function trazerAuditoria(repositorio: Repositorio, turma: string, doArquivo: LinhaDeAuditoria[]): Promise<number> {
  const naBase = new Set((await repositorio.listarAuditoriaSigaa(turma)).map(linhaDaAuditoria))
  const novas = new Map<string, LinhaDeAuditoria>()
  for (const l of doArquivo) if (!naBase.has(linhaDaAuditoria(l))) novas.set(linhaDaAuditoria(l), l)
  const lista = [...novas.values()]
  if (lista.length === 0) return 0
  await repositorio.acrescentarAuditoriaSigaa(lista)
  for (const ajuste of ajustesDaAuditoria(lista)) await repositorio.gravarAjusteSigaa(ajuste)
  return lista.length
}

/**
 * O nome do arquivo não guarda a turma inteira (`CIN0144 · T01` vira
 * `CIN0144-T01`): ela sai das turmas que a base conhece, e ambiguidade é
 * problema dito.
 */
export async function turmasPorNomeDeArquivo(repositorio: Repositorio): Promise<Map<string, string[]>> {
  const turmas = new Set(await repositorio.listarTurmas())
  for (const e of await repositorio.listarEventos()) turmas.add(e.turma)
  const porNome = new Map<string, string[]>()
  for (const t of turmas) porNome.set(`${nomeSeguroDeTurma(t)}.csv`, [...(porNome.get(`${nomeSeguroDeTurma(t)}.csv`) ?? []), t])
  return porNome
}

export const problemaDeTurma = (nome: string, candidatas: string[] = []) =>
  candidatas.length === 0
    ? `${nome}: nenhuma turma da base com este nome de arquivo, ficou de fora.`
    : `${nome}: mais de uma turma da base com este nome de arquivo (${candidatas.join(', ')}), ficou de fora.`

/**
 * O arquivo é do Adsum pelo cabeçalho, como o log se reconhece pela linha. A
 * anotação do professor e o `._` do macOS não são auditoria órfã: ficam onde
 * estão, sem virar erro no diário.
 */
async function ehAuditoria(pasta: FileSystemDirectoryHandle, caminho: string): Promise<boolean> {
  const sem = (t: string) => t.replace(/^\uFEFF/, '')
  return sem((await ler(pasta, caminho)) ?? '').startsWith(sem(cabecalhoDaAuditoria()).trim())
}

/**
 * A auditoria do SIGAA contra a pasta, nos dois sentidos, sem reescrever
 * nada: linha só na pasta entra na base (e o aceite volta a ser ajuste);
 * linha só na base vai para o fim do arquivo. Turma sem auditoria não ganha
 * arquivo.
 */
export async function conferirAuditoriaSigaa(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<{ conferidas: { turma: string; trazidas: number; levadas: number }[]; problemas: string[] }> {
  const problemas: string[] = []
  const porNome = await turmasPorNomeDeArquivo(repositorio)
  const turmas = new Set<string>()
  for (const nome of await listarArquivos(pasta, ['sigaa'])) {
    const candidatas = porNome.get(nome)
    if (candidatas?.length === 1) turmas.add(candidatas[0])
    else if (candidatas || (await ehAuditoria(pasta, `sigaa/${nome}`))) problemas.push(problemaDeTurma(`sigaa/${nome}`, candidatas))
  }
  for (const lista of porNome.values()) for (const t of lista) turmas.add(t)

  const conferidas: { turma: string; trazidas: number; levadas: number }[] = []
  for (const turma of turmas) {
    const caminho = caminhoDaAuditoriaSigaa(turma)
    const homonimas = porNome.get(caminho.slice('sigaa/'.length)) ?? []
    if (homonimas.length > 1) {
      if ((await repositorio.listarAuditoriaSigaa(turma)).length > 0) problemas.push(problemaDeTurma(caminho, homonimas))
      continue
    }
    const texto = await ler(pasta, caminho)
    const { itens, problemas: falhas } = deCsvDaAuditoria(texto ?? '', turma)
    problemas.push(...falhas.map((f) => `${caminho}, linha ${f.linha}: ${f.motivo}`))

    const trazidas = await trazerAuditoria(repositorio, turma, itens)
    const noArquivo = new Set(itens.map(linhaDaAuditoria))
    const faltando = (await repositorio.listarAuditoriaSigaa(turma)).filter((l) => !noArquivo.has(linhaDaAuditoria(l)))
    if (faltando.length > 0) {
      await acrescentar(pasta, caminho, faltando.map((l) => linhaDaAuditoria(l) + '\n').join(''), cabecalhoDaAuditoria())
    }
    if (texto !== undefined || faltando.length > 0) conferidas.push({ turma, trazidas, levadas: faltando.length })
  }
  return { conferidas, problemas }
}
