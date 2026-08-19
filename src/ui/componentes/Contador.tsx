// O número de presentes, rolando como um odômetro.
//
// Com um crachá a cada segundo, o contador muda o tempo todo — e trocar o texto
// de uma vez faz o número "piscar", que a essa frequência vira ruído. Aqui cada
// casa é uma janela com os dez algarismos empilhados, e mudar de valor é
// **deslizar a coluna**.
//
// Duas propriedades vêm de graça desse desenho, e são as que importam no ritmo
// da fila:
//
//   não enfileira    a transição é sobre `transform`, então uma leitura nova no
//                    meio da anterior apenas redireciona o movimento a partir de
//                    onde ele está — sem esperar a vez, sem pular
//   não repinta      só a casa que mudou se move; as outras ficam paradas, e o
//                    trabalho é do compositor, não do layout
//
// A largura é fixa por `tabular-nums`: sem isso o número inteiro dança de
// posição a cada troca de algarismo.

const ALGARISMOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export function Contador({ valor }: { valor: number }) {
  const casas = String(Math.max(0, Math.trunc(valor))).split('')

  return (
    <span className="contador" role="status" aria-label={String(valor)}>
      {casas.map((algarismo, i) => (
        <span
          // A chave conta da direita para a esquerda: ao passar de 9 para 10, a
          // casa das unidades continua sendo a mesma e só rola de 9 para 0 — com
          // chave por posição da esquerda, ela seria recriada e o movimento
          // sumiria.
          key={casas.length - i}
          className="contador__casa"
          aria-hidden="true"
        >
          <span
            className="contador__coluna"
            style={{ transform: `translateY(${-Number(algarismo) * 10}%)` }}
          >
            {ALGARISMOS.map((n) => (
              <span key={n} className="contador__algarismo">
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
