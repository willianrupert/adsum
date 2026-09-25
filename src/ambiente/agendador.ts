// Recalcular uma vez por rajada, não uma vez por crachá.
//
// Várias partes do app refazem trabalho a cada mudança: reler o log, recontar
// a turma, reescrever a pasta. Chamadas soltas, numa fila rápida, rodavam em
// paralelo: o custo crescia com a fila, e a última a terminar podia ser a que
// leu a base mais cedo, gravando na pasta um estado mais velho que o atual.
//
// O agendador garante duas coisas: **uma execução por vez**, e **nenhum pedido
// esquecido**. Um pedido que chega com uma execução em andamento espera ela
// terminar e roda uma vez só, junto com todos os que chegaram no meio. Quem
// pede recebe uma promessa que só se cumpre depois de uma execução que começou
// **depois** do pedido, então o que ela produziu já inclui a mudança.

/** A turma que mudou; `undefined` quando não se sabe, e aí vale para todas. */
export type Escopo = string | undefined

const TODAS = Symbol('todas')

export type Agendador = (escopo?: Escopo) => Promise<void>

export function criarAgendador(executar: (escopo: Escopo) => Promise<void>): Agendador {
  let rodando = false
  let pedido:
    | { escopo: string | typeof TODAS; cumprir: () => void; falhar: (erro: unknown) => void; promessa: Promise<void> }
    | undefined

  async function rodar(): Promise<void> {
    rodando = true
    try {
      while (pedido) {
        const atual = pedido
        pedido = undefined
        try {
          await executar(atual.escopo === TODAS ? undefined : atual.escopo)
          atual.cumprir()
        } catch (erro) {
          atual.falhar(erro)
        }
      }
    } finally {
      rodando = false
    }
  }

  return (escopo?: Escopo) => {
    const alvo = escopo ?? TODAS
    if (pedido) {
      // Duas turmas diferentes na mesma rajada: vale para todas.
      if (pedido.escopo !== alvo) pedido.escopo = TODAS
    } else {
      let cumprir!: () => void
      let falhar!: (erro: unknown) => void
      const promessa = new Promise<void>((resolve, reject) => {
        cumprir = resolve
        falhar = reject
      })
      pedido = { escopo: alvo, cumprir, falhar, promessa }
    }
    const promessa = pedido.promessa
    if (!rodando) void rodar()
    return promessa
  }
}
