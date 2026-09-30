// Web Locks para o jsdom, que não os tem: travas por nome, exclusivas ou
// compartilhadas, soltas quando a promessa de quem segura se cumpre. Só o que
// o Adsum usa (`ambiente/chamadaViva.ts`): `request` com `signal` e `query`.

interface Pedido {
  nome: string
  modo: LockMode
}

export function instalarTravas(): () => void {
  const seguradas: Pedido[] = []
  const gerente = {
    async request(nome: string, opcoes: LockOptions, segurar: (trava: Lock | null) => Promise<unknown>) {
      if (opcoes.signal?.aborted) throw new DOMException('cancelado', 'AbortError')
      const exclusiva = (opcoes.mode ?? 'exclusive') === 'exclusive'
      if (seguradas.some((t) => t.nome === nome && (exclusiva || t.modo === 'exclusive'))) {
        throw new Error('travas de teste: esperar pela trava não está implementado')
      }
      const pedido = { nome, modo: opcoes.mode ?? 'exclusive' }
      seguradas.push(pedido)
      try {
        return await segurar({ name: nome, mode: pedido.modo } as Lock)
      } finally {
        seguradas.splice(seguradas.indexOf(pedido), 1)
      }
    },
    async query() {
      return { held: seguradas.map((t) => ({ name: t.nome, mode: t.modo, clientId: 'teste' })), pending: [] }
    },
  }
  Object.defineProperty(navigator, 'locks', { value: gerente, configurable: true })
  return () => {
    delete (navigator as { locks?: unknown }).locks
  }
}
