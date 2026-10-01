// O que o professor precisa ter na mesa: o leitor de crachá. Sem ele o Adsum
// abre, mas não faz chamada, e nada na tela dizia isso a quem chega.

import { Leitor } from './Simbolos.tsx'

/** Na chegada, o que falta ter; nos Ajustes, qual é o leitor. */
export function CartaoDoLeitor({ chegando = false }: { chegando?: boolean }) {
  return (
    <div className="cartao cartao--leitor">
      <Leitor />
      <span className="cartao__texto">
        <strong>{chegando ? 'Você vai precisar de um leitor de crachá USB' : 'Leitor USB de 13,56 MHz'}</strong>
        <small>
          {chegando ? 'De 13,56 MHz, como o do desenho. ' : 'O testado com o Adsum, como o do desenho. '}
          Funciona como um teclado: liga na USB e lê, sem driver, no Mac e no Windows.
        </small>
      </span>
    </div>
  )
}
