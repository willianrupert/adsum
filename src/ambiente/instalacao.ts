// Instalar o app, e por que isso importa mais no Safari.
//
// O WebKit apaga **toda** a escrita de script — IndexedDB, localStorage, até o
// registro do service worker — depois de sete dias de uso do Safari sem
// visitar o site. Não é despejo sob pressão de espaço, que é raro: é rotina.
// Um recesso e o cadastro da turma some sem uma palavra.
//
// A saída existe e é do próprio WebKit: app adicionado ao Dock (macOS) ou à
// tela de início (iOS) sai do Safari, ganha container próprio, e o ITP **pula
// esse domínio** no algoritmo de remoção. O contador passa a ser de uso do app.
//
// Duas consequências que mudam o desenho:
//
// 1. O convite tem de vir **antes de cadastrar a turma**. O app instalado não
//    enxerga o que ficou na aba — armazenamento próprio quer dizer separado —
//    e instalar depois faria o professor recomeçar.
// 2. Não há como instalar por JavaScript no Safari: não existe
//    `beforeinstallprompt`. A tela só pode ensinar o caminho do menu, e é por
//    isso que ela é instrução, não botão.
//
// Onde há seletor de pasta, nada disso é urgente — lá os arquivos são arquivos.

export type Plataforma = 'mac' | 'ios' | 'outra'

const CHAVE_DISPENSA = 'adsum.instalacao.dispensada'

/**
 * O iPadOS se apresenta como `Macintosh` desde 2019. O que o denuncia é o
 * toque: Mac nenhum tem tela sensível, então `maxTouchPoints > 1` separa os
 * dois sem depender de string de versão.
 */
export function plataforma(
  ua: string = navigator.userAgent,
  toques: number = navigator.maxTouchPoints ?? 0,
): Plataforma {
  if (/iPhone|iPod|iPad/.test(ua)) return 'ios'
  if (/Macintosh/.test(ua)) return toques > 1 ? 'ios' : 'mac'
  return 'outra'
}

/**
 * Safari, e todo navegador no iOS — onde o iOS obriga o WebKit por baixo, o
 * Chrome do iPhone tem a mesma regra de sete dias.
 *
 * O Firefox também não tem seletor de pasta, mas não apaga nada sozinho: é a
 * diferença entre "sem cofre" e "com prazo de validade", e misturar as duas
 * faria o aviso mentir para metade dos navegadores.
 */
export function ehWebKit(
  ua: string = navigator.userAgent,
  toques: number = navigator.maxTouchPoints ?? 0,
): boolean {
  if (plataforma(ua, toques) === 'ios') return true
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua)
}

export function instalado(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    // matchMedia sem suporte à consulta devolve o quê varia; ausência não é erro.
  }
  // O Safari do iOS nunca implementou `display-mode`; o sinal lá é este.
  return (navigator as { standalone?: boolean }).standalone === true
}

/** Instalado, o domínio é pulado na remoção. Na aba, tem sete dias. */
export function riscoDeApagar(): boolean {
  return ehWebKit() && !instalado()
}

export interface ComoInstalar {
  onde: string
  passos: string[]
}

export function comoInstalar(alvo: Plataforma = plataforma()): ComoInstalar | undefined {
  if (alvo === 'mac') {
    return { onde: 'no Safari', passos: ['Arquivo', 'Adicionar ao Dock'] }
  }
  if (alvo === 'ios') {
    return { onde: 'no Safari', passos: ['Compartilhar', 'Adicionar à Tela de Início'] }
  }
  return undefined
}

export function instalacaoDispensada(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DISPENSA) === 'sim'
  } catch {
    return false
  }
}

/**
 * `window.localStorage` e não o global solto: o Node tem um `localStorage`
 * próprio, incompleto, que ganha do jsdom sob o vitest — e o `try` esconderia a
 * diferença até alguém depender dela.
 *
 * Dispensar mora no localStorage de propósito: é preferência **desta máquina**,
 * não da base, e não deve viajar na pasta para o computador de outro professor.
 * Que o próprio WebKit apague isso em sete dias é aceitável — a essa altura o
 * convite voltar a aparecer é o comportamento certo.
 */
export function dispensarInstalacao(): void {
  try {
    window.localStorage.setItem(CHAVE_DISPENSA, 'sim')
  } catch {
    // Modo privado recusa a escrita. O convite reaparece, e é só isso.
  }
}

/** O convite só faz sentido onde a base tem prazo e ninguém dispensou ainda. */
export function convidarAInstalar(): boolean {
  return riscoDeApagar() && comoInstalar() !== undefined && !instalacaoDispensada()
}
