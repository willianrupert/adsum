// "Esta janela tem uma chamada aberta" — no `sessionStorage`, de propósito.
//
// Fechar o app fecha a chamada (pedido do professor, 22/09/2026). Mas
// recarregar a mesma janela não é fechar: um F5 sem querer, ou a versão nova
// que o próprio app instala sozinho, não podem jogar o professor de volta ao
// repouso no meio da fila. O `sessionStorage` é exatamente essa fronteira:
// sobrevive a recarregar a janela e morre quando ela fecha.
//
// Serve também ao service worker (`main.tsx`): com chamada aberta, a versão
// nova espera a chamada terminar para entrar.
//
// Outra janela do Adsum aberta no meio da aula tem `sessionStorage` próprio e
// fechava a chamada desta. Por isso a janela com a chamada também segura uma
// trava do navegador (Web Locks), que ele solta sozinho quando ela fecha:
// quem abre depois vê a trava e deixa a chamada como está.

const CHAVE = 'adsum.chamada.viva'
const TRAVA = 'adsum.chamada.viva'

let soltarTrava: (() => void) | undefined

function travas(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks
}

export function marcarChamadaViva(viva: boolean): void {
  if (viva && !soltarTrava) {
    const gerente = travas()
    if (gerente) {
      const cancelar = new AbortController()
      let liberar = () => {}
      const segurando = new Promise<void>((r) => (liberar = r))
      soltarTrava = () => {
        cancelar.abort()
        liberar()
      }
      // Compartilhada: duas janelas em chamada não esperam uma pela outra.
      gerente.request(TRAVA, { mode: 'shared', signal: cancelar.signal }, () => segurando).catch(() => {})
    }
  } else if (!viva) {
    soltarTrava?.()
    soltarTrava = undefined
  }
  try {
    if (viva) window.sessionStorage.setItem(CHAVE, 'sim')
    else window.sessionStorage.removeItem(CHAVE)
  } catch {
    // Sem sessionStorage (modo privado estrito): recarregar volta a fechar a
    // chamada, que é o comportamento de antes, e nada se perde — o dia é o
    // mesmo e a chamada reabre inteira.
  }
}

export function chamadaViva(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE) === 'sim'
  } catch {
    return false
  }
}

/** Outra janela deste navegador está com uma chamada aberta. Sem Web Locks, não se sabe: `false`. */
export async function chamadaVivaEmOutraJanela(): Promise<boolean> {
  const gerente = travas()
  if (!gerente) return false
  try {
    const { held = [] } = await gerente.query()
    return held.some((t) => t.name === TRAVA)
  } catch {
    return false
  }
}
