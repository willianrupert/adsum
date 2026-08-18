// Emissor mínimo. Não vale uma dependência: são doze linhas e o contrato é
// devolver a função que cancela, para que nenhum ouvinte fique órfão.

export function criarEmissor<T>() {
  const escutas = new Set<(valor: T) => void>()
  return {
    inscrever(escuta: (valor: T) => void) {
      escutas.add(escuta)
      return () => {
        escutas.delete(escuta)
      }
    },
    emitir(valor: T) {
      for (const escuta of escutas) escuta(valor)
    },
    get quantidade() {
      return escutas.size
    },
  }
}
