// Uma pasta de mentira, com a forma da de verdade.
//
// O seletor de diretório abre diálogo do sistema operacional e não roda em
// teste. O que dá para provar sem ele é o que importa: que o que foi escrito na
// pasta reconstrói a base inteira.

interface No {
  arquivos: Map<string, string>
  pastas: Map<string, No>
}

function no(): No {
  return { arquivos: new Map(), pastas: new Map() }
}

export function criarPastaFalsa() {
  const raiz = no()

  function handleDe(atual: No): FileSystemDirectoryHandle {
    return {
      kind: 'directory',
      name: 'adsum',
      async getDirectoryHandle(nome: string, opcoes?: { create?: boolean }) {
        const existente = atual.pastas.get(nome)
        if (existente) return handleDe(existente)
        if (!opcoes?.create) throw Object.assign(new Error('não existe'), { name: 'NotFoundError' })
        const nova = no()
        atual.pastas.set(nome, nova)
        return handleDe(nova)
      },
      async getFileHandle(nome: string, opcoes?: { create?: boolean }) {
        if (!atual.arquivos.has(nome)) {
          if (!opcoes?.create) throw Object.assign(new Error('não existe'), { name: 'NotFoundError' })
          atual.arquivos.set(nome, '')
        }
        return {
          kind: 'file',
          name: nome,
          async getFile() {
            const texto = atual.arquivos.get(nome) ?? ''
            return { text: async () => texto, size: texto.length } as File
          },
          async createWritable(opcoes?: { keepExistingData?: boolean }) {
            let buffer = opcoes?.keepExistingData ? (atual.arquivos.get(nome) ?? '') : ''
            return {
              write: async (dado: string | { type: string; position?: number; data: string }) => {
                if (typeof dado === 'string') return void (buffer += dado)
                const posicao = dado.position ?? buffer.length
                buffer = buffer.slice(0, posicao) + dado.data
              },
              close: async () => {
                atual.arquivos.set(nome, buffer)
              },
            }
          },
        } as unknown as FileSystemFileHandle
      },
      [Symbol.asyncIterator]: async function* () {
        for (const nome of atual.arquivos.keys()) yield [nome, { kind: 'file' }]
        for (const nome of atual.pastas.keys()) yield [nome, { kind: 'directory' }]
      },
    } as unknown as FileSystemDirectoryHandle
  }

  return { handle: handleDe(raiz), raiz }
}
