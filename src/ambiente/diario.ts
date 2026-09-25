// O diário de diagnóstico: uma linha por coisa que aconteceu, na pasta do cofre.
//
// Existe por causa de 22/09/2026. A aula falhou e a causa só foi achada
// reconstruindo o log de presença à mão — ids repetidos, hashes que mudaram
// de um dia para o outro. Nada registrava o que o app **tentou** fazer e o
// que deu errado no caminho. Com isto, o zip da pasta que o professor manda
// já traz a resposta: cada leitura, a decisão, o id gravado, quanto tempo
// levou, e todo erro.
//
// **Sem nome e sem UID.** O crachá aparece pelos 8 primeiros caracteres do
// `uid_hash`, o bastante para seguir a mesma pessoa pelo dia e cruzar com
// `vinculos.json`, e nada que sirva sozinho. A leitura recusada aparece pelo
// tamanho, não pelo texto cru, que é o UID.
//
// **Barato por desenho.** Registrar é empurrar uma string num vetor. O disco
// só é tocado a cada `INTERVALO_MS`, num lote só: a fila de crachás nunca
// espera o diário.

import { acrescentar } from './pasta.ts'

type Valor = string | number | boolean | undefined

/** O que a tela de diagnóstico mostra, e o que sobra sem pasta. */
const GUARDADAS_EM_MEMORIA = 400
const INTERVALO_MS = 5000

let pasta: FileSystemDirectoryHandle | undefined
let recentes: string[] = []
let pendentes: { dia: string; linha: string }[] = []
let relogio: ReturnType<typeof setTimeout> | undefined
/** A gravação em andamento. Toda descarga entra atrás dela: ver `descarregar`. */
let gravando: Promise<void> = Promise.resolve()

const doisDigitos = (n: number) => String(n).padStart(2, '0')

function diaDe(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`
}

function horaDe(d: Date): string {
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function caminhoDoDiario(dia: string): string {
  return `diagnostico/${dia}.log`
}

/**
 * Um valor numa linha só. O diário é lido linha a linha, e `|` separa campo:
 * mensagem de erro com quebra de linha (as de `DOMException` costumam ter)
 * partia o registro em dois, e a segunda metade chegava ao zip sem hora nem
 * tipo.
 */
function numaLinha(valor: string): string {
  return valor.replace(/\s*[\r\n]+\s*/g, ' ⏎ ').replaceAll('|', '/')
}

export function registrar(tipo: string, dados: Record<string, Valor> = {}): void {
  const agora = new Date()
  const campos = Object.entries(dados)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${numaLinha(String(v))}`)
  const linha = [horaDe(agora), tipo, ...campos].join(' | ')
  recentes.push(linha)
  if (recentes.length > GUARDADAS_EM_MEMORIA) recentes = recentes.slice(-GUARDADAS_EM_MEMORIA)
  pendentes.push({ dia: diaDe(agora), linha })
  // Sem pasta, o pendente não pode crescer sem limite: fica o que cabe na tela.
  if (pendentes.length > GUARDADAS_EM_MEMORIA) pendentes = pendentes.slice(-GUARDADAS_EM_MEMORIA)
  agendar()
}

/**
 * Cadeia "dispare e esqueça" que não vira promessa rejeitada sem dono.
 *
 * Efeito de tela e manipulador de evento não têm quem espere por eles: se a
 * base fecha no meio — a aba indo embora, a base trocada por uma restauração,
 * a suíte encerrando o teste — a rejeição some no console, e some junto a
 * informação de que algo não aconteceu. Aqui ela vai para o diário, com o
 * nome de quem falhou.
 */
export function semDono(onde: string, tarefa: () => Promise<unknown>): void {
  // `then` e não `tarefa()` direto: uma tarefa que lança antes do primeiro
  // `await` falharia fora do `catch`, justo o erro sem dono que isto evita.
  void Promise.resolve()
    .then(tarefa)
    .catch((erro: Error) => registrar('erro_em_efeito', { onde, mensagem: erro?.message ?? String(erro) }))
}

/** Os 8 primeiros do hash: segue a pessoa sem identificá-la. */
export const curto = (uidHash: string | undefined) => uidHash?.slice(0, 8)

export function ligarDiario(nova: FileSystemDirectoryHandle | undefined): void {
  pasta = nova
  agendar()
  ouvirSaida()
}

/**
 * Aba escondida ou fechando: grava o lote na hora, sem esperar os 5 s. É o
 * momento em que o diário mais importa — a aula que terminou com o
 * computador desligando — e o único em que esperar perde as últimas linhas.
 * Não há garantia de que o navegador deixe terminar uma gravação ao fechar;
 * `visibilitychange` chega antes, com a página ainda viva, e costuma bastar.
 */
let ouvindoSaida = false
function ouvirSaida(): void {
  if (ouvindoSaida || typeof document === 'undefined') return
  ouvindoSaida = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void descarregar()
  })
  window.addEventListener('pagehide', () => void descarregar())
}

export function linhasDoDiario(): readonly string[] {
  return recentes
}

/** Só para testes: o diário é estado de módulo, e um teste não herda o outro. */
export function esquecerDiario(): void {
  clearTimeout(relogio)
  relogio = undefined
  pasta = undefined
  recentes = []
  pendentes = []
  gravando = Promise.resolve()
}

function agendar(): void {
  if (relogio || !pasta || pendentes.length === 0) return
  relogio = setTimeout(() => void descarregar(), INTERVALO_MS)
}

/**
 * Grava o lote agora. A tela de diagnóstico chama antes de mostrar o arquivo.
 *
 * As descargas andam em fila. O relógio, a aba escondendo e o Diagnóstico
 * podem pedir ao mesmo tempo, e sem a fila quem chegasse em segundo achava o
 * lote já tomado pelo primeiro, voltava na hora e lia o arquivo antes de ele
 * ser gravado. Na fila, voltar quer dizer que o que foi registrado até ali
 * está no disco (ou de volta aos pendentes, se a pasta falhou).
 */
export function descarregar(): Promise<void> {
  // `gravarLote` não rejeita (a falha da pasta volta para os pendentes); o
  // `catch` é para a fila nunca travar se um dia rejeitar.
  gravando = gravando.then(gravarLote).catch(() => undefined)
  return gravando
}

async function gravarLote(): Promise<void> {
  clearTimeout(relogio)
  relogio = undefined
  const destino = pasta
  if (!destino || pendentes.length === 0) return
  const lote = pendentes
  pendentes = []
  const porDia = new Map<string, string[]>()
  for (const { dia, linha } of lote) porDia.set(dia, [...(porDia.get(dia) ?? []), linha])
  const gravados = new Set<string>()
  try {
    for (const [dia, linhas] of porDia) {
      await acrescentar(destino, caminhoDoDiario(dia), linhas.join('\n') + '\n')
      gravados.add(dia)
    }
  } catch {
    // Pasta sem permissão ou desmontada: o que não foi gravado volta para a
    // fila e tenta de novo. Só o que não foi: o dia que já foi para o disco
    // voltaria duplicado (aula que atravessa a meia-noite com a pasta caindo
    // entre um arquivo e outro). A falha em si já aparece na tela pelo
    // caminho de sempre (`falhaNaPasta`), não precisa de um segundo aviso.
    const falta = lote.filter(({ dia }) => !gravados.has(dia))
    pendentes = [...falta, ...pendentes].slice(-GUARDADAS_EM_MEMORIA)
  }
  agendar()
}
