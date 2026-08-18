// Entrada e saída de arquivo, com dois caminhos e uma promessa só.
//
// Com File System Access (Chrome, Edge), gravar é **gravar por cima do mesmo
// arquivo**: escolhe-se uma vez e as exportações seguintes caem no mesmo lugar.
// Sem ela (Firefox, Safari), cai no download comum — que funciona, mas espalha
// `registros (3).csv` pela pasta de downloads.
//
// A degradação é silenciosa por escolha: o resultado diz qual caminho foi usado,
// e quem chama decide se conta ao professor.

export type ComoSalvou = 'gravado' | 'baixado' | 'cancelado'

export interface ArquivoLido {
  nome: string
  texto: string
}

const TIPO_CSV = {
  description: 'Arquivo do Adsum',
  accept: { 'text/csv': ['.csv'] },
}

function cancelou(erro: unknown): boolean {
  return erro instanceof Error && erro.name === 'AbortError'
}

export async function salvarTexto(nomeSugerido: string, texto: string): Promise<ComoSalvou> {
  if (window.showSaveFilePicker) {
    try {
      const alvo = await window.showSaveFilePicker({
        suggestedName: nomeSugerido,
        types: [TIPO_CSV],
      })
      const fluxo = await alvo.createWritable()
      await fluxo.write(texto)
      await fluxo.close()
      return 'gravado'
    } catch (erro) {
      if (cancelou(erro)) return 'cancelado'
      throw erro
    }
  }

  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeSugerido
  link.click()
  // Revogar cedo demais cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'baixado'
}

export async function abrirTexto(): Promise<ArquivoLido | undefined> {
  if (window.showOpenFilePicker) {
    try {
      const [alvo] = await window.showOpenFilePicker({ types: [TIPO_CSV], multiple: false })
      const arquivo = await alvo.getFile()
      return { nome: arquivo.name, texto: await arquivo.text() }
    } catch (erro) {
      if (cancelou(erro)) return undefined
      throw erro
    }
  }

  return await new Promise<ArquivoLido | undefined>((resolver) => {
    const campo = document.createElement('input')
    campo.type = 'file'
    campo.accept = '.csv,text/csv'
    campo.onchange = async () => {
      const arquivo = campo.files?.[0]
      resolver(arquivo ? { nome: arquivo.name, texto: await arquivo.text() } : undefined)
    }
    // Sem evento de cancelamento confiável em todo navegador: se o professor
    // fechar o seletor, a promessa fica pendente e nada acontece — que é o que
    // ele pediu ao fechar.
    campo.click()
  })
}
