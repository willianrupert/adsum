// "Chamar nomes": um interruptor só, sempre no mesmo lugar. Desligado (o
// padrão), crachá desconhecido abre a busca. Ligado, o professor está
// olhando a pessoa chamada, e o próximo crachá desconhecido é dela.

import type { Matriculado } from '../../nucleo/tipos.ts'
import { Ondas } from '../componentes/Simbolos.tsx'

export function CartaoDoChamado({
  pendentes,
  totalDeAlunos,
  chamado,
  aoLigar,
  aoDesligar,
  aoAndar,
  aoPular,
  aoSimular,
}: {
  /** Alunos sem crachá, na ordem da fila. */
  pendentes: Matriculado[]
  totalDeAlunos: number
  /** Quem está chamado, com a edição local aplicada. */
  chamado?: Matriculado
  aoLigar: () => void
  aoDesligar: () => void
  /** -1 volta, 1 avança, sem dar a volta. */
  aoAndar: (direcao: -1 | 1) => void
  aoPular: () => void
  /** Só no modo de ensaio. */
  aoSimular?: () => void
}) {
  const indice = chamado ? pendentes.findIndex((p) => p.chave === chamado.chave) : -1

  return (
    <section className="chamado">
      <div className="chamado__interruptor">
        <span className="chamado__interruptor-textos">
          <span className="chamado__interruptor-rotulo">Chamar nomes</span>
          <span className="chamado__interruptor-estado">
            {chamado ? 'Ligado: o próximo crachá vira desta pessoa' : 'Desligado: crachá desconhecido abre a busca'}
          </span>
        </span>
        <button
          role="switch"
          aria-checked={!!chamado}
          aria-label="Chamar nomes"
          className="interruptor"
          onClick={chamado ? aoDesligar : aoLigar}
        >
          <span className="interruptor__bolinha" aria-hidden="true" />
        </button>
      </div>

      {/* As ondas pulsam nos dois estados: é o sinal de que o leitor está lendo. */}
      <Ondas tamanho={54} animado />
      {chamado ? (
        <>
          <p className="chamado__rotulo">Encoste o crachá de</p>
          <p className="chamado__nome">{chamado.nome}</p>
          <p className="chamado__completo">
            {chamado.nomeCompleto} · {chamado.papel}
          </p>
          <div className="chamado__acoes">
            <button onClick={() => aoAndar(-1)} aria-label="anterior" disabled={indice <= 0}>
              ←
            </button>
            <button onClick={aoPular}>Pular</button>
            <button onClick={() => aoAndar(1)} aria-label="próximo" disabled={indice >= pendentes.length - 1}>
              →
            </button>
          </div>
          <p className="chamado__atalho">← e → andam pela fila</p>
          {aoSimular && (
            <div className="chamado__acoes">
              <button onClick={aoSimular}>Simular um crachá</button>
            </div>
          )}
        </>
      ) : (
        // Quantos já têm crachá, não quantos faltam: progresso, não pendência.
        <p className="chamado__rotulo">
          {totalDeAlunos - pendentes.length} de {totalDeAlunos} com crachá
        </p>
      )}
    </section>
  )
}
