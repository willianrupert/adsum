// O que este navegador sabe fazer.
//
// A tela de diagnóstico existe por causa desta lista: o app depende de APIs que
// variam por navegador e por contexto (WebSerial não existe no Firefox, WebNFC
// só no Chrome Android, quase nada funciona fora de contexto seguro). Descobrir
// isso na frente da turma é tarde. Cada item diz o que se perde sem ele.

export type Peso = 'essencial' | 'importante' | 'futuro'

export interface Capacidade {
  nome: string
  presente: boolean
  peso: Peso
  /** O que deixa de funcionar sem esta capacidade. */
  semEla: string
}

function tem(caminho: () => unknown): boolean {
  try {
    return Boolean(caminho())
  } catch {
    return false
  }
}

export function levantarCapacidades(): Capacidade[] {
  return [
    {
      nome: 'Contexto seguro (HTTPS)',
      presente: window.isSecureContext,
      peso: 'essencial',
      semEla: 'Sem ele não há service worker, WebCrypto, WebSerial nem WebNFC.',
    },
    {
      nome: 'IndexedDB',
      presente: tem(() => window.indexedDB),
      peso: 'essencial',
      semEla: 'É a base local inteira. Sem ela o app não tem onde guardar nada.',
    },
    {
      nome: 'WebCrypto · SHA-256',
      presente: tem(() => crypto.subtle?.digest),
      peso: 'essencial',
      semEla: 'Sem ela não existe uid_hash, e o UID cru circularia.',
    },
    {
      nome: 'Service Worker',
      presente: tem(() => navigator.serviceWorker),
      peso: 'importante',
      semEla: 'O app deixa de abrir offline — e a rede do CIn não é confiável.',
    },
    {
      nome: 'Armazenamento persistente',
      presente: tem(() => navigator.storage?.persist),
      peso: 'importante',
      semEla: 'O navegador pode apagar a base sozinho sob pressão de espaço.',
    },
    {
      nome: 'File System Access',
      presente: tem(() => window.showSaveFilePicker),
      peso: 'importante',
      semEla: 'Exportar CSV cai para download comum, sem gravar por cima do mesmo arquivo.',
    },
    {
      nome: 'WebSerial',
      presente: tem(() => navigator.serial),
      peso: 'futuro',
      semEla: 'Não dá para falar com o Adsum A1 por USB (passo 5 do roteiro).',
    },
    {
      nome: 'WebNFC',
      presente: tem(() => 'NDEFReader' in window),
      peso: 'futuro',
      semEla: 'O celular não lê crachá direto; só Chrome no Android tem.',
    },
    {
      nome: 'Instalado como app',
      presente: tem(() => window.matchMedia('(display-mode: standalone)').matches),
      peso: 'futuro',
      semEla: 'Rodando na aba do navegador. Instalar dá janela própria e partida offline.',
    },
  ]
}

export function descreverAmbiente(): Record<string, string> {
  return {
    origem: window.location.origin,
    caminho: window.location.pathname,
    idioma: navigator.language,
    plataforma: navigator.userAgent,
    'fuso horário': Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}
