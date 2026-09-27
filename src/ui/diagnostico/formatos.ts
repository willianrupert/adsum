export function formatarBytes(n?: number): string {
  if (n === undefined) return '—'
  const unidades = ['B', 'kB', 'MB', 'GB']
  let valor = n
  let i = 0
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024
    i++
  }
  return `${i === 0 ? valor : valor.toFixed(1)} ${unidades[i]}`
}

export function hora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function duracao(ms: number): string {
  const totalSeg = Math.round(ms / 1000)
  return `${Math.floor(totalSeg / 60)}min ${String(totalSeg % 60).padStart(2, '0')}s`
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
