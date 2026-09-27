// A ponte entre a pasta (a dona dos dados) e a base no navegador (o cache).
//
// A prova de que a pasta é a dona é `restaurar`: jogar fora a base inteira e
// reconstruí-la lendo a pasta. Os caminhos de ida e volta estão em
// `docs/01_cofre.md`.

import {
  NOMES,
  deJsonConfig,
  deJsonGrade,
  deJsonTurma,
  deJsonVinculos,
  paraJsonConfig,
  paraJsonGrade,
  paraLeiaMe,
  paraJsonTurma,
  paraJsonVinculos,
} from '../nucleo/cofre.ts'
import { CABECALHO, cabecalhoCsv, deCsv, linhaCsv, nomeDoArquivo, nomeSeguroDeTurma, paraCsv, porTurma } from '../nucleo/csv.ts'
import { planilhaDeFaltas, paraCsvDeFaltas } from '../nucleo/faltas.ts'
import { saisConhecidos, salValido } from '../nucleo/hash.ts'
import { ajustesDaAuditoria, CABECALHO_DA_AUDITORIA, cabecalhoDaAuditoria, deCsvDaAuditoria, linhaDaAuditoria } from '../nucleo/lancar/auditoria.ts'
import type { LinhaDeAuditoria } from '../nucleo/lancar/tipos.ts'
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
 * Uma linha nova no log da turma. **Nunca reescreve o arquivo:** com a pasta
 * sincronizada, reescrever apagaria o que outra máquina gravou.
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

/** Mesmo acontecimento, e não só o mesmo `evento_id`. */
function mesmoEvento(a: Evento, b: Evento): boolean {
  return (
    a.quando === b.quando &&
    a.uidHash === b.uidHash &&
    a.turma === b.turma &&
    a.origem === b.origem &&
    a.resultado === b.resultado
  )
}

/** `web-8c56-20260922-0098.2` → `web-8c56-20260922-0098`. Ver `importarEventos`. */
export const idDeOrigem = (eventoId: string) => eventoId.replace(/\.\d+$/, '')

/**
 * Traz linhas de um log para a base. **Nenhuma fica de fora em silêncio.**
 *
 * `evento_id` repetido com o mesmo conteúdo é releitura (idempotência).
 * Repetido com outro conteúdo é outro acontecimento (o defeito de 22/09/2026
 * deixou isso nos arquivos): entra com id derivado, `<id>.2`, só na base.
 */
export async function importarEventos(
  repositorio: Repositorio,
  itens: Evento[],
): Promise<{ novos: number; renumerados: number }> {
  const existentes = new Map((await repositorio.listarEventos()).map((e) => [e.eventoId, e]))
  // O contador não pode ficar atrás de um id desta instalação que veio no
  // arquivo: seria cunhar de novo um número já gasto.
  const { instalacaoId } = await repositorio.lerConfig()
  let maiorDaCasa = 0
  for (const e of itens) {
    if (!e.eventoId.startsWith(`${instalacaoId}-`)) continue
    const numero = Number.parseInt(e.eventoId.split('-').pop() ?? '', 10)
    if (Number.isFinite(numero) && numero > maiorDaCasa) maiorDaCasa = numero
  }
  if (maiorDaCasa > 0) await repositorio.garantirSequenciaAcimaDe(maiorDaCasa)
  let novos = 0
  let renumerados = 0
  for (const evento of itens) {
    const ja = existentes.get(evento.eventoId)
    if (!ja) {
      if (await repositorio.acrescentarEvento(evento)) {
        existentes.set(evento.eventoId, evento)
        novos++
      }
      continue
    }
    if (mesmoEvento(ja, evento)) continue

    // Já trazido antes com id derivado? Então é releitura, não linha nova.
    let derivado: string | undefined
    for (let n = 2; ; n++) {
      const candidato = `${evento.eventoId}.${n}`
      const outro = existentes.get(candidato)
      if (!outro) {
        derivado = candidato
        break
      }
      if (mesmoEvento(outro, evento)) break
    }
    if (!derivado) continue
    const copia = { ...evento, eventoId: derivado }
    if (await repositorio.acrescentarEvento(copia)) {
      existentes.set(derivado, copia)
      renumerados++
    }
  }
  return { novos, renumerados }
}

export interface Conferencia {
  turma: string
  naBase: number
  noArquivo: number
  /** Estavam só no arquivo e entraram na base agora. */
  trazidos: number
  /** Dos trazidos, os que tinham `evento_id` repetido e ganharam id derivado. */
  renumerados: number
  /** Estavam só na base e foram acrescentados ao fim do arquivo agora. */
  acrescentados: number
  /** `evento_id` que aparece mais de uma vez no arquivo. */
  repetidos: number
}

/**
 * Confere o log da pasta contra a base, turma a turma, nos dois sentidos, e
 * os deixa iguais sem reescrever nada: linha só no arquivo entra na base;
 * evento só na base vai para o fim do arquivo. Evento de id derivado não
 * volta ao arquivo, onde já está com o id original.
 */
export async function conferirLog(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
  turma?: string,
): Promise<Conferencia[]> {
  const turmas = new Set<string>()
  if (turma) turmas.add(turma)
  else {
    for (const e of await repositorio.listarEventos()) turmas.add(e.turma)
    for (const nome of await listarArquivos(pasta, ['registros'])) {
      const cru = await ler(pasta, `registros/${nome}`)
      const primeira = cru ? deCsv(cru).itens[0] : undefined
      if (primeira) turmas.add(primeira.turma)
    }
  }

  const resultado: Conferencia[] = []
  for (const t of turmas) {
    const texto = await ler(pasta, caminhoDosRegistros(t))
    const doArquivo = texto ? deCsv(texto).itens.filter((e) => e.turma === t) : []
    const { novos, renumerados } = await importarEventos(repositorio, doArquivo)

    const idsNoArquivo = new Set(doArquivo.map((e) => e.eventoId))
    const daBase = [...(await repositorio.listarEventos({ turma: t }))].reverse()
    const faltando = daBase.filter((e) => !idsNoArquivo.has(idDeOrigem(e.eventoId)))
    for (const evento of faltando) await acrescentarNoLog(pasta, evento)

    resultado.push({
      turma: t,
      naBase: daBase.length,
      noArquivo: doArquivo.length,
      trazidos: novos + renumerados,
      renumerados,
      acrescentados: faltando.length,
      repetidos: doArquivo.length - idsNoArquivo.size,
    })
  }
  return resultado
}

/** Linhas de auditoria que a base não tem entram nela, e cada aceite volta a ser ajuste. */
async function trazerAuditoria(repositorio: Repositorio, turma: string, doArquivo: LinhaDeAuditoria[]): Promise<number> {
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
async function turmasPorNomeDeArquivo(repositorio: Repositorio): Promise<Map<string, string[]>> {
  const turmas = new Set(await repositorio.listarTurmas())
  for (const e of await repositorio.listarEventos()) turmas.add(e.turma)
  const porNome = new Map<string, string[]>()
  for (const t of turmas) porNome.set(`${nomeSeguroDeTurma(t)}.csv`, [...(porNome.get(`${nomeSeguroDeTurma(t)}.csv`) ?? []), t])
  return porNome
}

const problemaDeTurma = (nome: string, candidatas: string[] = []) =>
  candidatas.length === 0
    ? `${nome}: nenhuma turma da base com este nome de arquivo, ficou de fora.`
    : `${nome}: mais de uma turma da base com este nome de arquivo (${candidatas.join(', ')}), ficou de fora.`

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
    else problemas.push(problemaDeTurma(`sigaa/${nome}`, candidatas))
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
 * Reescreve os logs a partir da base. **Só para conserto**, depois de uma
 * gravação que falhou: a base tem tudo o que a pasta tem. No caminho normal,
 * apagaria o que outra máquina escreveu.
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
 * Traz o sal do cofre: o primeiro passo de qualquer restauração, porque sem
 * ele os nomes voltam e as pessoas não (o mesmo crachá dá outro hash).
 *
 * **Nenhum sal é descartado.** Base vazia adota o do cofre como atual e
 * guarda o seu no chaveiro; base com crachás mantém o atual e acrescenta os
 * do cofre. Só o sal: o `instalacaoId` continua diferente em cada navegador,
 * senão duas instalações cunhariam o mesmo `evento_id`.
 *
 * Os arquivos chegam soltos (Safari e Firefox, `webkitdirectory`), e o nome
 * não identifica: o log e a planilha de faltas de uma turma têm o mesmo.
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
