// O som é o feedback primário.
//
// Em fila ninguém olha a tela — depois de cinco registros o nome nem está mais
// visível para piscar. O bipe é o único retorno garantido, e por isso precisa
// ser inequívoco: agudo curto para presença, duplo para repetido, grave para
// crachá desconhecido.
//
// Ele toca **depois** de gravar. Bipe significa "está salvo", não "eu ouvi".

export type Toque = 'ok' | 'repetido' | 'desconhecido' | 'sessao'

const NOTAS: Record<Toque, { hz: number; ms: number }[]> = {
  ok: [{ hz: 1200, ms: 90 }],
  repetido: [
    { hz: 1200, ms: 70 },
    { hz: 1200, ms: 70 },
  ],
  desconhecido: [{ hz: 320, ms: 220 }],
  sessao: [
    { hz: 700, ms: 90 },
    { hz: 1050, ms: 130 },
  ],
}

let contexto: AudioContext | undefined

/**
 * O navegador só deixa tocar depois de um gesto do usuário. O primeiro crachá
 * da aula chega depois de alguém ter clicado em algo, então na prática o
 * contexto já está liberado — e se não estiver, o silêncio não pode derrubar a
 * leitura, que é a parte que importa.
 */
export function tocar(toque: Toque): void {
  try {
    contexto ??= new AudioContext()
    if (contexto.state === 'suspended') void contexto.resume()

    let quando = contexto.currentTime
    for (const { hz, ms } of NOTAS[toque]) {
      const oscilador = contexto.createOscillator()
      const ganho = contexto.createGain()
      oscilador.frequency.value = hz
      oscilador.type = 'sine'
      // Rampa curta nas pontas: onda cortada no zero estala, e estalo em sala
      // de aula soa como defeito.
      ganho.gain.setValueAtTime(0, quando)
      ganho.gain.linearRampToValueAtTime(0.22, quando + 0.01)
      ganho.gain.setValueAtTime(0.22, quando + ms / 1000 - 0.02)
      ganho.gain.linearRampToValueAtTime(0, quando + ms / 1000)
      oscilador.connect(ganho).connect(contexto.destination)
      oscilador.start(quando)
      oscilador.stop(quando + ms / 1000)
      quando += ms / 1000 + 0.05
    }
  } catch {
    // Sem áudio, a tela ainda mostra. Nunca ao contrário.
  }
}
