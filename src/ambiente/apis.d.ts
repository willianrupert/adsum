/// <reference types="vite-plugin-pwa/client" />
// Declarações mínimas das APIs que o TypeScript ainda não conhece por padrão.
//
// Ficam aqui, e não espalhadas em `any`, para que o dia em que o WebSerial
// entrar de verdade (passo 5) o tipo apareça num lugar só — ou seja trocado por
// `@types/w3c-web-serial` sem caçar casts pelo código.

export {}

interface OpcoesDeArquivo {
  types?: { description?: string; accept: Record<string, string[]> }[]
  excludeAcceptAllOption?: boolean
}

declare global {
  type EstadoDaPermissao = 'granted' | 'denied' | 'prompt'

  interface FileSystemHandle {
    queryPermission?: (opcoes?: { mode?: 'read' | 'readwrite' }) => Promise<EstadoDaPermissao>
    requestPermission?: (opcoes?: { mode?: 'read' | 'readwrite' }) => Promise<EstadoDaPermissao>
  }

  interface Window {
    /** File System Access — gravar por cima do mesmo arquivo, sem download novo. */
    showSaveFilePicker?: (opcoes?: OpcoesDeArquivo & { suggestedName?: string }) => Promise<FileSystemFileHandle>
    showOpenFilePicker?: (opcoes?: OpcoesDeArquivo & { multiple?: boolean }) => Promise<FileSystemFileHandle[]>
    showDirectoryPicker?: (opcoes?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: string
    }) => Promise<FileSystemDirectoryHandle>
  }

  interface Navigator {
    /** WebSerial. O dongle de hoje é HID de teclado e não precisa dela. */
    serial?: unknown
  }

  /**
   * Web NFC. Só existe no Chrome para Android, e a especificação cobre tags
   * NFC Forum tipo 1–5 — o crachá é Mifare Classic, que não é nenhum desses.
   * Se o UID vem mesmo assim é comportamento de implementação, não garantia:
   * tem que ser medido com crachá na mão. Ver `LeitorWebNfc`.
   */
  interface NDEFReadingEvent extends Event {
    /** O UID da tag, em hexadecimal separado por dois-pontos. É só o que se usa. */
    readonly serialNumber: string
  }

  class NDEFReader extends EventTarget {
    scan(opcoes?: { signal?: AbortSignal }): Promise<void>
    onreading: ((evento: NDEFReadingEvent) => void) | null
    onreadingerror: ((evento: Event) => void) | null
  }
}
