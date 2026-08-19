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
 * Ondas de aproximação — o sinal de "encoste aqui".
 *
 * São só os arcos, de propósito: o símbolo com a mão e a elipse é o Contactless
 * Indicator da EMVCo, marca licenciada. Os arcos sozinhos são o sinal universal.
 *
 * O que separa isto de um ícone de AirDrop ou de wi-fi é **a abertura**: meia
 * circunferência lê como sinal irradiando; arco curto de ~110°, todos do mesmo
 * tom e com a mesma espessura, lê como onda de aproximação. A primeira versão
 * errou nos dois pontos.
 */
export function Ondas({ tamanho = 64, animado = false }: { tamanho?: number; animado?: boolean }) {
  const abertura = (55 * Math.PI) / 180
  // Vão de 9 entre raios com traço de 4,6: o espaço entre os arcos fica quase
  // do tamanho do próprio traço, que é a proporção do símbolo real.
  const arcos = [8, 17, 26, 35]
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
        strokeWidth="4.6"
        strokeLinecap="round"
        transform="translate(16 32)"
      >
        {arcos.map((r, i) => {
          const x = (r * Math.cos(abertura)).toFixed(2)
          const y = (r * Math.sin(abertura)).toFixed(2)
          return (
            <path
              key={r}
              d={`M ${x} -${y} A ${r} ${r} 0 0 1 ${x} ${y}`}
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          )
        })}
      </g>
    </svg>
  )
}
