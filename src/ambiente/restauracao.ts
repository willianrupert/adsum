// A volta: da pasta (a dona dos dados) para a base no navegador (o cache).
//
// A prova de que a pasta é a dona é `restaurar`: jogar fora a base inteira e
// reconstruí-la lendo a pasta. `mesclarDaPasta` é o caso da base que já tem
// dados, e só traz o que falta nela.

import { NOMES, deJsonConfig, deJsonGrade, deJsonTurma, deJsonVinculos } from '../nucleo/cofre.ts'
import { CABECALHO, deCsv } from '../nucleo/csv.ts'
import { saisConhecidos, salValido } from '../nucleo/hash.ts'
import { CABECALHO_DA_AUDITORIA, deCsvDaAuditoria } from '../nucleo/lancar/auditoria.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { conferirAuditoriaSigaa, problemaDeTurma, trazerAuditoria, turmasPorNomeDeArquivo } from './auditoriaSigaaNaPasta.ts'
import { importarEventos } from './logDaPasta.ts'
import { ler, listarArquivos } from './pasta.ts'
import { caminhoDaAuditoriaSigaa, type Resumo } from './sincronia.ts'

/**
 * Traz da pasta o que a base não tem, sem tocar no que ela tem. É o que ligar
 * uma pasta faz quando a base já tem dados: sem isto, a primeira gravação
 * reescrevia a pasta a partir da base e apagava dela os vínculos que só ela
 * tinha. Grade só entra para turma sem nenhuma: aulas não têm chave natural.
 */
export async function mesclarDaPasta(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<{ vinculos: number; turmas: number; aulas: number; problemas: string[] }> {
  const problemas: string[] = []
  await lembrarSaisDaPasta(repositorio, pasta)

  let vinculos = 0
  const vinculosCru = await ler(pasta, NOMES.vinculos)
  if (vinculosCru) {
    const { conteudo, problemas: falhas } = deJsonVinculos(vinculosCru)
    problemas.push(...falhas.map((f) => f.motivo))
    const locais = new Set((await repositorio.listarVinculos()).map((v) => v.uidHash))
    for (const vinculo of conteudo ?? []) {
      if (locais.has(vinculo.uidHash)) continue
      await repositorio.gravarVinculo(vinculo)
      vinculos++
    }
  }

  let turmas = 0
  const turmasLocais = new Set(await repositorio.listarTurmas())
  for (const nome of await listarArquivos(pasta, ['turmas'])) {
    const cru = await ler(pasta, `turmas/${nome}`)
    if (!cru) continue
    const { conteudo, problemas: falhas } = deJsonTurma(cru, nome)
    problemas.push(...falhas.map((f) => f.motivo))
    if (!conteudo?.length || turmasLocais.has(conteudo[0].turma)) continue
    await repositorio.salvarTurma(conteudo[0].turma, conteudo)
    turmas++
  }

  let aulas = 0
  const gradeCru = await ler(pasta, NOMES.grade)
  if (gradeCru) {
    const { conteudo, problemas: falhas } = deJsonGrade(gradeCru)
    problemas.push(...falhas.map((f) => f.motivo))
    const comGrade = new Set((await repositorio.listarAulas()).map((a) => a.turma))
    for (const aula of conteudo ?? []) {
      if (comGrade.has(aula.turma)) continue
      await repositorio.gravarAula({ ...aula, id: undefined })
      aulas++
    }
  }

  return { vinculos, turmas, aulas, problemas }
}

/**
 * Traz o sal do cofre: o primeiro passo de qualquer restauração, porque sem
 * ele os nomes voltam e as pessoas não (o mesmo crachá dá outro hash).
 *
 * **Nenhum sal é descartado.** Base vazia adota o do cofre como atual e
 * guarda o seu no chaveiro; base com crachás mantém o atual e acrescenta os
 * do cofre. Só o sal: o `instalacaoId` continua diferente em cada navegador,
 * senão duas instalações cunhariam o mesmo `evento_id`.
 */
async function adotarSal(
  repositorio: Repositorio,
  texto: string,
  problemas: string[],
): Promise<void> {
  const { conteudo, problemas: falhas } = deJsonConfig(texto)
  if (!conteudo || !salValido(conteudo.salHex)) {
    problemas.push(...falhas.map((f) => f.motivo))
    if (conteudo && !salValido(conteudo.salHex)) {
      problemas.push(`${NOMES.config}: o segredo do cofre não tem a forma esperada.`)
    }
    return
  }

  const doCofre = saisConhecidos(conteudo)
  const local = await repositorio.lerConfig()
  if (conteudo.salHex !== local.salHex && (await repositorio.listarVinculos()).length === 0) {
    await repositorio.definirSal(conteudo.salHex)
  }
  await repositorio.lembrarSais(doCofre)
}

/** Junta os sais do cofre ao chaveiro, sem mexer no atual nem trazer mais nada. */
export async function lembrarSaisDaPasta(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<void> {
  const texto = await ler(pasta, NOMES.config)
  if (!texto) return
  const { conteudo } = deJsonConfig(texto)
  if (conteudo && salValido(conteudo.salHex)) await repositorio.lembrarSais(saisConhecidos(conteudo))
}

/** O que um arquivo solto é, pela pasta de onde veio ou, sem ela, pelo nome e pelo cabeçalho. */
type Papel = 'config' | 'vinculos' | 'grade' | 'turma' | 'log' | 'sigaa' | 'fora' | 'desconhecido'

/** Pastas do cofre que não são fonte de dado: relatório, diário, auditoria. */
const PASTAS_FORA = new Set(['faltas', 'diagnostico', 'auditoria'])

function papelDoArquivo(arquivo: File, texto: string): Papel {
  const partes = (arquivo.webkitRelativePath ?? '').split('/')
  const pasta = partes.length > 2 ? partes[partes.length - 2] : undefined
  const nome = arquivo.name
  if (pasta === 'registros') return nome.endsWith('.csv') ? 'log' : 'desconhecido'
  if (pasta === 'turmas') return nome.endsWith('.json') ? 'turma' : 'desconhecido'
  if (pasta === 'sigaa') return nome.endsWith('.csv') ? 'sigaa' : 'desconhecido'
  if (pasta && PASTAS_FORA.has(pasta)) return 'fora'
  if (nome === NOMES.config) return 'config'
  if (nome === NOMES.vinculos) return 'vinculos'
  if (nome === NOMES.grade) return 'grade'
  if (nome === NOMES.leiaMe || nome.endsWith('.log')) return 'fora'
  if (nome.endsWith('.json')) return 'turma'
  if (!nome.endsWith('.csv')) return 'fora'
  // Solto, sem pasta: `registros/X.csv` e `faltas/X.csv` têm o mesmo nome.
  const primeira = texto.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].trim()
  if (primeira === CABECALHO) return 'log'
  if (primeira === CABECALHO_DA_AUDITORIA) return 'sigaa'
  if (primeira.startsWith('nome;') || primeira.startsWith('uid_hex;')) return 'fora'
  return 'desconhecido'
}

/**
 * Restaura de arquivos soltos (Safari e Firefox, `webkitdirectory`), onde o
 * nome não identifica: o log e a planilha de faltas de uma turma têm o mesmo.
 * O sal vem antes de tudo, como em `restaurar`.
 */
export async function restaurarDeArquivos(
  repositorio: Repositorio,
  arquivos: File[],
): Promise<Resumo> {
  const problemas: string[] = []
  const lidos: string[] = []

  const porPapel = new Map<Papel, { arquivo: File; texto: string }[]>()
  for (const arquivo of arquivos) {
    const texto = await arquivo.text()
    const papel = papelDoArquivo(arquivo, texto)
    porPapel.set(papel, [...(porPapel.get(papel) ?? []), { arquivo, texto }])
  }
  const doPapel = (papel: Papel) => porPapel.get(papel) ?? []
  const nomeDe = (arquivo: File) => arquivo.webkitRelativePath || arquivo.name

  // O sal antes de tudo: ver `adotarSal`.
  for (const { arquivo, texto } of doPapel('config')) {
    await adotarSal(repositorio, texto, problemas)
    lidos.push(nomeDe(arquivo))
  }

  for (const { arquivo, texto } of doPapel('vinculos')) {
    const { conteudo: lista, problemas: falhas } = deJsonVinculos(texto)
    for (const vinculo of lista ?? []) await repositorio.gravarVinculo(vinculo)
    problemas.push(...falhas.map((f) => f.motivo))
    lidos.push(nomeDe(arquivo))
  }

  for (const { arquivo, texto } of doPapel('grade')) {
    const { conteudo: lista, problemas: falhas } = deJsonGrade(texto)
    for (const aula of lista ?? []) await repositorio.gravarAula({ ...aula, id: undefined })
    problemas.push(...falhas.map((f) => f.motivo))
    lidos.push(nomeDe(arquivo))
  }

  for (const { arquivo, texto } of doPapel('turma')) {
    const { conteudo: pessoas, problemas: falhas } = deJsonTurma(texto, arquivo.name)
    if (pessoas?.length) await repositorio.salvarTurma(pessoas[0].turma, pessoas)
    problemas.push(...falhas.map((f) => f.motivo))
    lidos.push(nomeDe(arquivo))
  }

  for (const { arquivo, texto } of doPapel('log')) {
    const { itens, problemas: falhas } = deCsv(texto)
    await importarEventos(repositorio, itens)
    problemas.push(...falhas.map((f) => `${nomeDe(arquivo)}, linha ${f.linha}: ${f.motivo}`))
    lidos.push(nomeDe(arquivo))
  }

  // Depois das turmas e dos logs: a turma sai do nome do arquivo.
  const porNome = doPapel('sigaa').length > 0 ? await turmasPorNomeDeArquivo(repositorio) : new Map<string, string[]>()
  for (const { arquivo, texto } of doPapel('sigaa')) {
    const candidatas = porNome.get(arquivo.name)
    if (candidatas?.length !== 1) {
      problemas.push(problemaDeTurma(nomeDe(arquivo), candidatas))
      continue
    }
    const { itens, problemas: falhas } = deCsvDaAuditoria(texto, candidatas[0])
    await trazerAuditoria(repositorio, candidatas[0], itens)
    problemas.push(...falhas.map((f) => `${nomeDe(arquivo)}, linha ${f.linha}: ${f.motivo}`))
    lidos.push(nomeDe(arquivo))
  }

  for (const { arquivo } of doPapel('desconhecido')) {
    problemas.push(`${nomeDe(arquivo)}: não parece um arquivo do Adsum, ficou de fora.`)
  }

  if (lidos.length === 0) {
    problemas.push('Nenhum arquivo do Adsum entre os escolhidos.')
  }

  return { arquivos: lidos, problemas }
}

/** Reconstrói o cache a partir da pasta. É o caminho de voltar do zero. */
export async function restaurar(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const problemas: string[] = []
  const arquivos: string[] = []

  const configCru = await ler(pasta, NOMES.config)
  if (configCru) {
    await adotarSal(repositorio, configCru, problemas)
    arquivos.push(NOMES.config)
  }

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
    await importarEventos(repositorio, itens)
    problemas.push(...falhas.map((f) => `${nome}, linha ${f.linha}: ${f.motivo}`))
    arquivos.push(`registros/${nome}`)
  }

  const auditoria = await conferirAuditoriaSigaa(repositorio, pasta)
  problemas.push(...auditoria.problemas)
  arquivos.push(...auditoria.conferidas.map((c) => caminhoDaAuditoriaSigaa(c.turma)))

  return { arquivos, problemas }
}
