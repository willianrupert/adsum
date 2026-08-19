// O som é o feedback primário.
//
// Em fila ninguém olha a tela, e depois de cinco leituras o nome nem está mais
// visível. O som é o único retorno garantido — mas ele vai tocar **cinquenta
// vezes em um minuto**, e é esse número que manda no desenho.
//
// O que a primeira versão fazia de errado, e por quê:
//
//   senoide pura a 1200 Hz     agudo cansa rápido, e senoide sem harmônico soa
//                              a caixa de supermercado
//   bipe duplo para repetido   repetição é o recurso que mais irrita quando
//                              acontece cinquenta vezes
//   corte linear no fim        deixa estalo audível
//   sons que se somam          duas leituras juntas dobravam o volume
//
// O que substitui: notas curtas com **decaimento exponencial**, como corda
// beliscada — som que já está sumindo quando você o percebe. Grave o bastante
// para não furar o ouvido, com um filtro tirando o brilho, e volume baixo. A
// diferença entre os avisos é de **altura**, nunca de repetição: subir é bom,
// descer é problema.
//
// O som toca **depois** de gravar. Bipe significa "está salvo", não "eu ouvi".

export type Toque = 'ok' | 'repetido' | 'desconhecido' | 'abertura' | 'encerramento'

interface Nota {
  hz: number
  /** Segundos até a nota começar, contados do toque. */
  atraso: number
  duracao: number
  volume: number
}

/**
 * Cada toque em no máximo duas notas e menos de meio segundo.
 *
 * `ok` é o mais discreto de todos de propósito: é o que toca o tempo inteiro, e
 * a presença registrada é o caso normal — o normal não se anuncia.
 */
const TOQUES: Record<Toque, Nota[]> = {
  ok: [{ hz: 784, atraso: 0, duracao: 0.16, volume: 0.1 }],
  // Mais grave e mais curto que o `ok`: "já contei", não "erro".
  repetido: [{ hz: 523, atraso: 0, duracao: 0.14, volume: 0.09 }],
  // Duas notas descendo. Descer é a forma de dizer que algo não completou, e
  // não precisa ser alto para ser entendido.
  desconhecido: [
    { hz: 466, atraso: 0, duracao: 0.13, volume: 0.12 },
    { hz: 349, atraso: 0.1, duracao: 0.22, volume: 0.12 },
  ],
  abertura: [
    { hz: 523, atraso: 0, duracao: 0.16, volume: 0.11 },
    { hz: 784, atraso: 0.09, duracao: 0.28, volume: 0.11 },
  ],
  encerramento: [
    { hz: 784, atraso: 0, duracao: 0.16, volume: 0.11 },
    { hz: 523, atraso: 0.09, duracao: 0.3, volume: 0.11 },
  ],
}

let contexto: AudioContext | undefined
let mestre: GainNode | undefined
let filtro: BiquadFilterNode | undefined
let tocandoAte = 0

function preparar(): AudioContext | undefined {
  try {
    if (!contexto) {
      contexto = new AudioContext()
      // Tira o brilho: o que sobra é corpo, e corpo não fura o ouvido.
      filtro = contexto.createBiquadFilter()
      filtro.type = 'lowpass'
      filtro.frequency.value = 2600
      mestre = contexto.createGain()
      mestre.gain.value = 1
      filtro.connect(mestre).connect(contexto.destination)
    }
    if (contexto.state === 'suspended') void contexto.resume()
    return contexto
  } catch {
    return undefined
  }
}

/**
 * Toca, cortando o que ainda estava soando.
 *
 * Sem o corte, duas leituras próximas somam amplitude e o resultado estala. Com
 * ele, a fila rápida vira uma sequência de notas curtas — que é como soa um
 * instrumento, não um alarme.
 */
export function tocar(toque: Toque): void {
  const ctx = preparar()
  if (!ctx || !filtro || !mestre) return

  const agora = ctx.currentTime
  if (tocandoAte > agora) {
    mestre.gain.cancelScheduledValues(agora)
    mestre.gain.setValueAtTime(mestre.gain.value, agora)
    mestre.gain.linearRampToValueAtTime(0, agora + 0.02)
    mestre.gain.setValueAtTime(1, agora + 0.025)
  }

  let fim = agora
  for (const nota of TOQUES[toque]) {
    const inicio = agora + nota.atraso + 0.03
    const oscilador = ctx.createOscillator()
    const envelope = ctx.createGain()

    // Triangular tem harmônicos suficientes para soar a corda, e poucos o
    // bastante para não soar a apito.
    oscilador.type = 'triangle'
    oscilador.frequency.value = nota.hz

    // Ataque de 6 ms e decaimento exponencial: já está sumindo quando se ouve.
    envelope.gain.setValueAtTime(0.0001, inicio)
    envelope.gain.exponentialRampToValueAtTime(nota.volume, inicio + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, inicio + nota.duracao)

    oscilador.connect(envelope).connect(filtro)
    oscilador.start(inicio)
    oscilador.stop(inicio + nota.duracao + 0.02)
    fim = Math.max(fim, inicio + nota.duracao)
  }
  tocandoAte = fim
}

/** Só para teste: o desenho dos toques, sem depender de áudio. */
export const desenhoDosToques = TOQUES
