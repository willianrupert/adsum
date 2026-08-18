// A pasta do professor, no disco dele.
//
// É o que inverte a posse: hoje o IndexedDB é o dono e o arquivo é cópia, e é
// por isso que limpar dados do site apaga tudo. Com a pasta, os arquivos são
// **arquivos de verdade** — limpar dados do site apaga o handle, não a pasta.
// O professor reescolhe a pasta e a base inteira volta.
//
// Só Chrome e Edge têm seletor de diretório. O OPFS do Safari não serve: mora
// dentro do armazenamento do navegador e some junto — é o problema original com
// outro nome. Ver `docs/01_cofre.md`.

export type EstadoDaPasta = 'indisponivel' | 'sem_pasta' | 'sem_permissao' | 'ligada'

export function pastaDisponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function escolherPasta(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!window.showDirectoryPicker) throw new Error('este navegador não tem seletor de pasta')
  try {
    // `id` faz o navegador lembrar onde o professor escolheu da última vez.
    return await window.showDirectoryPicker({ id: 'adsum', mode: 'readwrite' })
  } catch (erro) {
    if (erro instanceof Error && erro.name === 'AbortError') return undefined
    throw erro
  }
}

/**
 * `pedir: false` só consulta. Pedir permissão exige gesto do usuário, então na
 * volta de uma sessão a consulta acontece sozinha e o pedido espera um clique —
 * senão o navegador recusa e a pasta parece quebrada sem motivo.
 */
export async function permissao(
  handle: FileSystemDirectoryHandle,
  pedir = false,
): Promise<EstadoDaPermissao> {
  const opcoes = { mode: 'readwrite' as const }
  const atual = (await handle.queryPermission?.(opcoes)) ?? 'granted'
  if (atual === 'granted' || !pedir) return atual
  return (await handle.requestPermission?.(opcoes)) ?? 'denied'
}

async function subpasta(
  raiz: FileSystemDirectoryHandle,
  caminho: string[],
): Promise<FileSystemDirectoryHandle> {
  let atual = raiz
  for (const parte of caminho) {
    atual = await atual.getDirectoryHandle(parte, { create: true })
  }
  return atual
}

/**
 * Escreve um arquivo, criando as pastas do caminho.
 *
 * `close()` do fluxo é o que confirma a gravação — é depois dele que se pode
 * dizer que está no disco, e é por isso que o bipe da coleta vem depois.
 */
export async function escrever(
  raiz: FileSystemDirectoryHandle,
  caminho: string,
  texto: string,
): Promise<void> {
  const partes = caminho.split('/')
  const arquivo = partes.pop()!
  const pasta = await subpasta(raiz, partes)
  const alvo = await pasta.getFileHandle(arquivo, { create: true })
  const fluxo = await alvo.createWritable()
  await fluxo.write(texto)
  await fluxo.close()
}

/** Devolve `undefined` quando o arquivo não existe — ausência não é erro. */
export async function ler(
  raiz: FileSystemDirectoryHandle,
  caminho: string,
): Promise<string | undefined> {
  const partes = caminho.split('/')
  const arquivo = partes.pop()!
  try {
    let pasta = raiz
    for (const parte of partes) pasta = await pasta.getDirectoryHandle(parte)
    const alvo = await pasta.getFileHandle(arquivo)
    return await (await alvo.getFile()).text()
  } catch (erro) {
    if (erro instanceof Error && erro.name === 'NotFoundError') return undefined
    throw erro
  }
}

export async function listarArquivos(
  raiz: FileSystemDirectoryHandle,
  caminho: string[] = [],
): Promise<string[]> {
  try {
    let pasta = raiz
    for (const parte of caminho) pasta = await pasta.getDirectoryHandle(parte)
    const nomes: string[] = []
    for await (const [nome, handle] of pasta as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind === 'file') nomes.push(nome)
    }
    return nomes
  } catch {
    return []
  }
}

/**
 * Acrescenta ao fim, sem reescrever o que já está lá.
 *
 * É a diferença entre um log e um arquivo que se regrava: com append, a pasta
 * pode estar no iCloud com duas máquinas escrevendo e nenhuma linha se perde —
 * no pior caso a sincronização gera um arquivo em conflito, e `evento_id`
 * deduplica na junção. Reescrever o arquivo inteiro a cada crachá perderia a
 * aula da outra máquina, silenciosamente.
 */
export async function acrescentar(
  raiz: FileSystemDirectoryHandle,
  caminho: string,
  texto: string,
  cabecalho?: string,
): Promise<void> {
  const partes = caminho.split('/')
  const arquivo = partes.pop()!
  const pasta = await subpasta(raiz, partes)
  const alvo = await pasta.getFileHandle(arquivo, { create: true })

  const tamanho = (await alvo.getFile()).size
  const fluxo = await alvo.createWritable({ keepExistingData: true })
  // Arquivo recém-criado nasce com o cabeçalho; os seguintes só crescem.
  const conteudo = tamanho === 0 && cabecalho ? cabecalho + texto : texto
  await fluxo.write({ type: 'write', position: tamanho, data: conteudo })
  await fluxo.close()
}
