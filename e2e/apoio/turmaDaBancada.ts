// A turma da planilha da bancada, como o professor a colaria do SIGAA: a
// página de participantes, com as mesmas matrículas e nomes (anonimizados)
// da planilha. É isso que deixa o lançamento casar, no fim da jornada.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AlunoDaBancada {
  matricula: string
  nomeCompleto: string
}

export function alunosDaBancada(pasta: string): AlunoDaBancada[] {
  const html = readFileSync(join(pasta, 'planilha.html'), 'utf-8')
  const aux = /var auxAlunos = "([^"]*)"/.exec(html)?.[1] ?? ''
  const vistos = new Map<string, AlunoDaBancada>()
  for (const r of aux.split(';').filter(Boolean).map((x) => x.split(','))) {
    if (!vistos.has(r[1])) vistos.set(r[1], { matricula: r[1], nomeCompleto: r[2] })
  }
  return [...vistos.values()]
}

/** O código da disciplina, do cabeçalho da planilha. */
export function codigoDaBancada(pasta: string): string {
  const html = readFileSync(join(pasta, 'planilha.html'), 'utf-8')
  return /<legend>\s*([A-Z]{2,6}\d{2,5})/.exec(html)?.[1] ?? 'CIN0000'
}

const discente = (a: AlunoDaBancada) =>
  [
    `\tUsuário Off-Line no SIGAA ${a.nomeCompleto}  (Perfil)`,
    'Curso: CIÊNCIA DA COMPUTAÇÃO/CIN',
    `Matrícula: ${a.matricula}`,
    'Usuário: login.inventado',
    'E-mail: inventado@exemplo.com\tEnviar Mensagem',
  ].join('\n')

/** A página "Turma › Participantes", no formato que o Adsum lê. */
export function paginaDeParticipantes(professor: string, alunos: AlunoDaBancada[]): string {
  return [
    'Docentes (1)',
    `\tUsuário Off-Line no SIGAA ${professor}`,
    'Departamento: CENTRO DE INFORMÁTICA - CIN',
    'Usuário: professora.inventada',
    'E-Mail: professora@exemplo.com',
    '',
    `Discentes (${alunos.length})`,
    ...alunos.map(discente),
  ].join('\n')
}
