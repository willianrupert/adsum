// A pasta escrita a partir da base: o cadastro e a planilha de faltas, que a
// pasta recebe inteiros. O log, que só cresce, está em `logDaPasta.ts`; a
// volta (pasta → base) em `restauracao.ts`. Os caminhos de ida e volta estão
// em `docs/01_cofre.md`.

import { NOMES, paraJsonConfig, paraJsonGrade, paraJsonTurma, paraJsonVinculos, paraLeiaMe } from '../nucleo/cofre.ts'
import { nomeDoArquivo, nomeSeguroDeTurma } from '../nucleo/csv.ts'
import { planilhaDeFaltas, paraCsvDeFaltas } from '../nucleo/faltas.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { escrever } from './pasta.ts'

export interface Resumo {
  arquivos: string[]
  problemas: string[]
}

export function caminhoDosRegistros(turma: string): string {
  return `registros/${nomeDoArquivo(turma)}`
}

export function caminhoDasFaltas(turma: string): string {
  return `faltas/${nomeSeguroDeTurma(turma)}.csv`
}

export function caminhoDaAuditoriaSigaa(turma: string): string {
  return `sigaa/${nomeSeguroDeTurma(turma)}.csv`
}

/**
 * Reescreve a planilha de faltas: sempre pronta na pasta, sem botão de
 * exportar. É relatório, recalculado do log; nunca é lido de volta.
 *
 * Com `turma`, só a dela (o caso de um crachá). Sem, todas. Turma sem aula
 * registrada não ganha arquivo.
 */
export async function gravarFaltas(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
  turma?: string,
): Promise<Resumo> {
  const turmas = turma ? [turma] : await repositorio.listarTurmas()
  const [eventos, matriculados, aulas] = await Promise.all([
    turma ? repositorio.listarEventos({ turma }) : repositorio.listarEventos(),
    turma ? repositorio.listarMatriculados(turma) : repositorio.listarMatriculados(),
    repositorio.listarAulas(),
  ])

  const arquivos: string[] = []
  for (const t of turmas) {
    const planilha = planilhaDeFaltas(eventos, matriculados, aulas, t)
    if (planilha.dias.length === 0 || planilha.linhas.length === 0) continue
    const caminho = caminhoDasFaltas(t)
    await escrever(pasta, caminho, paraCsvDeFaltas(planilha))
    arquivos.push(caminho)
  }
  return { arquivos, problemas: [] }
}

/**
 * Reescreve o cadastro na pasta: LEIA-ME, config, vínculos, grade e turmas.
 * O log não passa por aqui. Com `turma`, só o arquivo dela entre as turmas;
 * os outros são pequenos e sempre regravados.
 */
export async function sincronizar(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
  turma?: string,
): Promise<Resumo> {
  const [config, vinculos, aulas, matriculados] = await Promise.all([
    repositorio.lerConfig(),
    repositorio.listarVinculos(),
    repositorio.listarAulas(),
    turma ? repositorio.listarMatriculados(turma) : repositorio.listarMatriculados(),
  ])

  const arquivos: string[] = []
  const gravar = async (caminho: string, texto: string) => {
    await escrever(pasta, caminho, texto)
    arquivos.push(caminho)
  }

  await gravar(NOMES.leiaMe, paraLeiaMe())
  await gravar(NOMES.config, paraJsonConfig(config))
  await gravar(NOMES.vinculos, paraJsonVinculos(vinculos))
  await gravar(NOMES.grade, paraJsonGrade(aulas))

  const turmas = new Map<string, typeof matriculados>()
  for (const pessoa of matriculados) {
    turmas.set(pessoa.turma, [...(turmas.get(pessoa.turma) ?? []), pessoa])
  }
  for (const [t, pessoas] of turmas) {
    await gravar(NOMES.turma(t), paraJsonTurma(pessoas))
  }

  return { arquivos, problemas: [] }
}
