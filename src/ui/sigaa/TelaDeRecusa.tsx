// Quando a folha não tem o que mostrar: o motivo, e o que o professor faz.

export interface Recusa {
  titulo: string
  texto: string
  detalhes?: string[]
}

export const RECUSAS = {
  semFavorito: {
    titulo: 'Abra pela planilha do SIGAA',
    texto: 'No SIGAA, abra "Lançar Freq. em Planilha" da turma e clique no favorito do Adsum.',
  },
  naoRespondeu: { titulo: 'A planilha não respondeu', texto: 'Clique no favorito de novo, na planilha do SIGAA.' },
  favoritoAntigo: {
    titulo: 'Favorito antigo',
    texto: 'Este favorito é de uma versão antiga. Arraste o novo, nos Ajustes do Adsum, para a barra de favoritos.',
  },
  formato: { titulo: 'Mensagem estranha', texto: 'A planilha mandou algo que o Adsum não entende. Clique no favorito de novo.' },
  naoEstaNoAdsum: { titulo: 'Esta turma não está no Adsum', texto: 'Nenhuma turma do Adsum tem o código e as matrículas desta planilha.' },
  baseVazia: {
    titulo: 'Nenhuma turma neste navegador',
    texto: 'O Adsum deste navegador não tem turma cadastrada. Abra o SIGAA no mesmo navegador em que você faz a chamada.',
  },
} satisfies Record<string, Recusa>

export function TelaDeRecusa({ recusa }: { recusa: Recusa }) {
  return (
    <main className="folha-sigaa">
      <h1>{recusa.titulo}</h1>
      <p>{recusa.texto}</p>
      {recusa.detalhes && (
        <ul className="folha-sigaa__detalhes">
          {recusa.detalhes.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
