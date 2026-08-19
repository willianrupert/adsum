import type { Problema } from '../../nucleo/csv.ts'

export interface Resultado {
  arquivo: string
  aceitos: number
  problemas: Problema[]
}

/**
 * O relatório de uma importação. Existe porque descartar linha em silêncio é
 * defeito: a lista vem com 46 de 48 alunos e nada diz que dois ficaram para
 * trás.
 */
export function Importacao({ resultado }: { resultado: Resultado }) {
  const { arquivo, aceitos, problemas } = resultado
  return (
    <div className={`aviso aviso--${problemas.length > 0 ? 'alerta' : 'ok'}`}>
      <strong>
        {arquivo}: {aceitos} {aceitos === 1 ? 'linha aceita' : 'linhas aceitas'}
        {problemas.length > 0 && `, ${problemas.length} descartada${problemas.length > 1 ? 's' : ''}`}
      </strong>
      {problemas.length > 0 && (
        <table className="tabela">
          <thead>
            <tr>
              <th>Linha</th>
              <th>Conteúdo</th>
              <th>Por que ficou de fora</th>
            </tr>
          </thead>
          <tbody>
            {problemas.slice(0, 20).map((p) => (
              <tr key={p.linha}>
                <td>{p.linha}</td>
                <td>
                  <code>{p.texto.slice(0, 60)}</code>
                </td>
                <td>{p.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problemas.length > 20 && (
        <p>… e mais {problemas.length - 20}. Corrija estas primeiro e importe de novo.</p>
      )}
    </div>
  )
}
