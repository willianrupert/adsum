// A ponte entre o cofre em disco e o cache em IndexedDB.
//
// A regra que define a inversão: **a pasta é a dona.** O teste de que ela
// aconteceu de fato é `restaurar` — o app tem que conseguir jogar fora o
// IndexedDB inteiro e reconstruí-lo lendo a pasta. Se isso não for verdade, a
// pasta virou só mais um backup, e o professor continua podendo perder tudo.

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
import { cabecalhoCsv, deCsv, linhaCsv, nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { salValido } from '../nucleo/hash.ts'
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

  // Primeiro, porque é o que orienta quem abrir a pasta sem o app na frente.
  await gravar(NOMES.leiaMe, paraLeiaMe())
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

/**
 * Adota o sal do cofre. **É o primeiro passo de qualquer restauração.**
 *
 * O sal é o que liga UID a `uid_hash`. Sem ele, restaurar devolve os nomes e
 * perde as pessoas: cada navegador sorteia o seu ao abrir, e com sal diferente
 * o mesmo crachá dá outro hash — a turma inteira vira gente desconhecida, sem
 * uma linha de erro. O professor recadastraria todo mundo por cima, criando
 * vínculos em dois sais para as mesmas pessoas.
 *
 * Era a promessa central do cofre falhando calada: "limpar dados do site apaga
 * o handle, não a pasta" só é verdade se o sal voltar junto. Os testes usavam
 * `esvaziarCache`, que preserva a config de propósito, e por isso nunca
 * exercitaram esse caminho — navegador de verdade perde a config junto.
 *
 * **Só o sal, e não o resto da config.** O `instalacaoId` prefixa o `evento_id`
 * e precisa continuar **diferente** em cada navegador: é ele que garante que
 * duas instalações nunca cunhem o mesmo id, e é o que deixa dois logs serem
 * concatenados na mesma pasta sem que a idempotência engula registro de
 * verdade. Restaurar o `instalacaoId` junto seria trocar um bug silencioso por
 * outro.
 *
 * **Não adota por cima de vínculos locais.** Trocar o sal com base própria no
 * lugar torna irreconhecíveis os crachás daqui. Essa decisão é humana, e já tem
 * caminho: "Passar os crachás a outro professor" pergunta antes de trocar.
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

  const local = await repositorio.lerConfig()
  if (conteudo.salHex === local.salHex) return

  if ((await repositorio.listarVinculos()).length > 0) {
    problemas.push(
      'Este cofre usa outro segredo, e já há crachás cadastrados aqui. ' +
        'Nada foi trocado: use "Passar os crachás a outro professor" para decidir qual fica.',
    )
    return
  }

  await repositorio.definirSal(conteudo.salHex)
}

/**
 * Reconstrói o cache a partir de **arquivos soltos**, escolhidos à mão.
 *
 * Safari e Firefox não têm seletor de diretório, então lá a pasta do cofre não
 * pode ser aberta nem acompanhada. O que eles têm é `<input type="file">`, e
 * isso basta para **ler** o que está no disco: o professor escolhe os arquivos
 * do cofre e a base volta. Escrever de volta continua não sendo possível —
 * nesses navegadores o Adsum guarda no navegador e exporta à mão.
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
    // O LEIA-ME é documentação gerada: ignorar em silêncio é o certo, mas ele
    // não conta como "arquivo do Adsum lido" — quem escolher só ele deve ouvir
    // que não veio nada.
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
      for (const evento of itens) await repositorio.acrescentarEvento(evento)
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
    // `evento_id` é a chave: reler o mesmo arquivo não duplica nada.
    for (const evento of itens) await repositorio.acrescentarEvento(evento)
    problemas.push(...falhas.map((f) => `${nome}, linha ${f.linha}: ${f.motivo}`))
    arquivos.push(`registros/${nome}`)
  }

  return { arquivos, problemas }
}
