// Símbolos no desenho do SF Symbols.
//
// Não são os arquivos da Apple — eles não podem ser redistribuídos. São
// redesenhos com a mesma gramática: traço de peso uniforme, pontas
// arredondadas, e a forma resolvida numa grade quadrada. É o que faz um ícone
// parecer do sistema em vez de parecer colado de um pacote qualquer.

/** `gearshape`: coroa de oito dentes arredondados e furo ao centro. */
export function Engrenagem({ tamanho = 19 }: { tamanho?: number }) {
  const dentes = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dentes.map((angulo) => (
          <line
            key={angulo}
            x1="12"
            y1="3.1"
            x2="12"
            y2="5.6"
            transform={`rotate(${angulo} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="6.4" />
        <circle cx="12" cy="12" r="2.5" />
      </g>
    </svg>
  )
}

/** `lock.fill`: corpo cheio com arco fechado por cima. */
export function Cadeado({ tamanho = 12 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M7.6 10.4V7.4a4.4 4.4 0 0 1 8.8 0v3"
      />
      <rect x="4.6" y="10.2" width="14.8" height="11" rx="3.4" fill="currentColor" />
    </svg>
  )
}

/**
 * Baixar e guardar — a bandeja com a seta entrando nela.
 *
 * É a forma do `square.and.arrow.down` da Apple, que é o que ela usa para
 * "guardar isto aqui": aparece em salvar arquivo, adicionar à tela de início e
 * baixar no App Store. Reconhecível justamente por ser a mesma em toda parte.
 *
 * A bandeja é aberta em cima porque a seta **entra** nela — desenhá-la fechada
 * viraria outro símbolo, o de mover para baixo. E a ponta da seta fica dentro da
 * abertura, sem tocar as laterais: é o que dá a leitura de "entrando".
 *
 * Mesma gramática dos outros daqui: 24×24, traço 2, pontas redondas.
 */
export function Baixar({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* A bandeja: desce, atravessa embaixo com os cantos arredondados, sobe. */}
        <path d="M5 12.6v5.1a2.7 2.7 0 0 0 2.7 2.7h8.6a2.7 2.7 0 0 0 2.7-2.7v-5.1" />
        {/* A haste e a ponta, num traço só para as junções fecharem sozinhas. */}
        <path d="M12 3.2v12.4" />
        <path d="M7.9 11.5 12 15.6l4.1-4.1" />
      </g>
    </svg>
  )
}

/**
 * Ondas de aproximação — o sinal de "encoste aqui".
 *
 * A geometria foi **medida no símbolo de referência**, não estimada: o PNG foi
 * decodificado, os quatro arcos separados por componente conexa e ajustados a
 * um centro comum por mínimos quadrados. O que saiu de lá:
 *
 *   raios      58,7 · 102,9 · 149,6 · 196,3 px  (passo ~46, o primeiro menor)
 *   aberturas  90,5° · 75,7° · 69,6° · 66,6°
 *   traço      20,2 px, o mesmo nos quatro
 *
 * **A abertura diminui conforme o raio cresce**, e é isso que eu vinha errando:
 * com abertura igual o desenho vira leque, e com 180° vira wi-fi. As pontas dos
 * quatro caem sobre uma reta — passo constante de ~22 px em y e ~41 em x —, ou
 * seja, os arcos são cortados por duas diagonais, e não por um cone que sai do
 * centro. É esse corte que dá a leitura de onda.
 *
 * Os números abaixo são os medidos, reescalados para o `viewBox`.
 */
const ARCOS = [
  { raio: 58.7, meiaAbertura: 45.25 },
  { raio: 102.9, meiaAbertura: 37.85 },
  { raio: 149.6, meiaAbertura: 34.8 },
  { raio: 196.3, meiaAbertura: 33.3 },
]
const TRACO = 20.2

export function Ondas({ tamanho = 64, animado = false }: { tamanho?: number; animado?: boolean }) {
  const rad = (graus: number) => (graus * Math.PI) / 180

  // A marca é mais alta que larga; a escala vem da altura.
  const maior = ARCOS[ARCOS.length - 1]
  const meiaAltura = maior.raio * Math.sin(rad(maior.meiaAbertura)) + TRACO / 2
  const escala = 31 / meiaAltura

  const menor = ARCOS[0]
  const esquerda = menor.raio * Math.cos(rad(menor.meiaAbertura)) - TRACO / 2
  const direita = maior.raio + TRACO / 2
  const deslocamento = 32 - ((esquerda + direita) / 2) * escala

  return (
    <svg
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      className={animado ? 'ondas ondas--animadas' : 'ondas'}
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={(TRACO * escala).toFixed(2)}
        strokeLinecap="round"
        transform={`translate(${deslocamento.toFixed(2)} 32)`}
      >
        {ARCOS.map(({ raio, meiaAbertura }, i) => {
          const r = raio * escala
          const x = (r * Math.cos(rad(meiaAbertura))).toFixed(2)
          const y = (r * Math.sin(rad(meiaAbertura))).toFixed(2)
          return (
            <path
              key={raio}
              d={`M ${x} -${y} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x} ${y}`}
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          )
        })}
      </g>
    </svg>
  )
}
