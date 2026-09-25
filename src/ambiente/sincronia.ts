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
import { cabecalhoCsv, deCsv, linhaCsv, nomeDoArquivo, nomeSeguroDeTurma, paraCsv, porTurma } from '../nucleo/csv.ts'
import { planilhaDeFaltas, paraCsvDeFaltas } from '../nucleo/faltas.ts'
import { saisConhecidos, salValido } from '../nucleo/hash.ts'
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

/**
 * Reconstrói a base a partir de arquivos escolhidos à mão: o caminho do
 * Safari e do Firefox, que leem arquivos mas não têm seletor de pasta.
 */
export async function restaurarDeArquivos(
  repositorio: Repositorio,
  arquivos: File[],
): Promise<Resumo> {
  const problemas: string[] = []
  const lidos: string[] = []

  const conteudo = new Map<string, string>()
  for (const arquivo of arquivos) conteudo.set(arquivo.name, await arquivo.text())

  // O sal antes de tudo: ver `adotarSal`.
  const configCru = conteudo.get(NOMES.config)
  if (configCru) {
    await adotarSal(repositorio, configCru, problemas)
    lidos.push(NOMES.config)
  }

  const vinculosCru = conteudo.get('vinculos.json')
  if (vinculosCru) {
    const { conteudo: lista, problemas: falhas } = deJsonVinculos(vinculosCru)
    for (const vinculo of lista ?? []) await repositorio.gravarVinculo(vinculo)
    problemas.push(...falhas.map((f) => f.motivo))
    lidos.push('vinculos.json')
  }

  const gradeCru = conteudo.get('grade.json')
  if (gradeCru) {
    const { conteudo: lista, problemas: falhas } = deJsonGrade(gradeCru)
    for (const aula of lista ?? []) await repositorio.gravarAula({ ...aula, id: undefined })
    problemas.push(...falhas.map((f) => f.motivo))
    lidos.push('grade.json')
  }

  for (const [nome, texto] of conteudo) {
    // O LEIA-ME não conta como arquivo lido: quem escolher só ele ouve que não veio nada.
    if (nome === NOMES.leiaMe) continue
    if (nome === 'vinculos.json' || nome === 'grade.json' || nome === 'config.json') continue

    if (nome.endsWith('.json')) {
      const { conteudo: pessoas, problemas: falhas } = deJsonTurma(texto, nome)
      if (pessoas?.length) await repositorio.salvarTurma(pessoas[0].turma, pessoas)
      problemas.push(...falhas.map((f) => f.motivo))
      lidos.push(nome)
      continue
    }

    if (nome.endsWith('.csv')) {
      const { itens, problemas: falhas } = deCsv(texto)
      await importarEventos(repositorio, itens)
      problemas.push(...falhas.map((f) => `${nome}, linha ${f.linha}: ${f.motivo}`))
      lidos.push(nome)
    }
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

  return { arquivos, problemas }
}
