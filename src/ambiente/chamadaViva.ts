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

const CHAVE = 'adsum.chamada.viva'

export function marcarChamadaViva(viva: boolean): void {
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
