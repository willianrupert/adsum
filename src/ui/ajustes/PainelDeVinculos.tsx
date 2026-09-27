// Quais crachás são de quem: filtrar, renomear, trocar papel, remover,
// importar e exportar `vinculos.json`.

import { useMemo, useState } from 'react'
import { abrirTexto, salvarTexto } from '../../ambiente/arquivos.ts'
import { deJsonVinculos, NOMES, paraJsonVinculos } from '../../nucleo/cofre.ts'
import type { Matriculado, Papel, Vinculo } from '../../nucleo/tipos.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { Painel, Selo } from '../componentes/Painel.tsx'
import type { Resultado } from '../componentes/Importacao.tsx'
import { comoFoi, confirmarOuCancelar, type Tentar } from '../hooks/useTentativa.ts'

export function PainelDeVinculos({
  vinculos,
  matriculados,
  repositorio,
  tentar,
  aoEditarLocal,
  aoImportar,
}: {
  vinculos: Vinculo[]
  matriculados: Matriculado[]
  repositorio: Repositorio
  tentar: Tentar
  /** Muda o nome na tela a cada tecla; grava ao sair do campo. */
  aoEditarLocal: (uidHash: string, nome: string) => void
  aoImportar: (resultado: Resultado) => void
}) {
  const [busca, setBusca] = useState('')
  const professores = vinculos.filter((v) => v.papel === 'professor').length
  const sinteticos = vinculos.filter((v) => v.sintetico).length
  const comCracha = vinculos.length - sinteticos

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return vinculos
    return vinculos.filter((v) => v.nome.toLowerCase().includes(termo) || v.uidHash.includes(termo))
  }, [vinculos, busca])

  /** O vínculo guarda só o nome curto; o completo vem da turma, pela matrícula. */
  const nomeCompletoPorMatricula = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const m of matriculados) if (!mapa.has(m.matricula)) mapa.set(m.matricula, m.nomeCompleto)
    return mapa
  }, [matriculados])

  const importar = tentar(`Importar ${NOMES.vinculos}`, async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { conteudo, problemas } = deJsonVinculos(arquivo.texto)
    for (const vinculo of conteudo ?? []) await repositorio.gravarVinculo(vinculo)
    aoImportar({
      arquivo: arquivo.nome,
      aceitos: conteudo?.length ?? 0,
      problemas: problemas.map((p, i) => ({ linha: i + 1, texto: arquivo.nome, motivo: p.motivo })),
    })
    return `${conteudo?.length ?? 0} vínculos.`
  })

  return (
    <Painel
      titulo="Vínculos"
      recolhivel
      legenda="Quais crachás são de quem."
      acoes={
        <>
          <button onClick={importar}>Importar</button>
          <button
            onClick={tentar(`Exportar ${NOMES.vinculos}`, async () =>
              comoFoi(await salvarTexto(NOMES.vinculos, paraJsonVinculos(vinculos)), NOMES.vinculos),
            )}
          >
            Exportar
          </button>
          <button
            className="botao--grave"
            onClick={tentar('Zerar vínculos', async () => {
              confirmarOuCancelar(`Apagar os ${vinculos.length} vínculos deste navegador?`)
              await repositorio.zerarVinculos()
            })}
          >
            Zerar
          </button>
        </>
      }
    >
      <div className="ferramentas ferramentas--topo">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="filtrar por nome ou hash"
          aria-label="filtrar vínculos"
          className="entrada--larga"
        />
        <span className="ferramentas__ou">
          {comCracha} {comCracha === 1 ? 'crachá' : 'crachás'} · {professores} de professor
          {sinteticos > 0 && ` · ${sinteticos} sem crachá`}
        </span>
      </div>

      {vinculos.length === 0 ? (
        <p className="vazio">Nenhum crachá vinculado ainda.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Papel</th>
              <th>uid_hash</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((v) => {
              const completo = v.matricula ? nomeCompletoPorMatricula.get(v.matricula) : undefined
              return (
                <tr key={v.uidHash}>
                  <td>
                    <input
                      className="entrada--celula"
                      value={v.nome}
                      onChange={(e) => aoEditarLocal(v.uidHash, e.target.value)}
                      onBlur={tentar('Renomear', () => repositorio.gravarVinculo(v))}
                      aria-label={`nome de ${v.uidHash}`}
                    />
                    {/* Só quando diz algo a mais que o nome curto. */}
                    {completo && completo !== v.nome && <span className="tabela__apoio">{completo}</span>}
                  </td>
                  <td>
                    <select
                      value={v.papel}
                      onChange={(e) => {
                        const papel = e.target.value as Papel
                        void tentar('Trocar papel', () => repositorio.gravarVinculo({ ...v, papel }))()
                      }}
                      aria-label={`papel de ${v.uidHash}`}
                    >
                      <option value="aluno">Aluno</option>
                      <option value="professor">Professor</option>
                    </select>
                  </td>
                  <td>
                    {/* O hash sintético parece o de um crachá lido; mostrá-lo diria que alguém encostou. */}
                    {v.sintetico ? <Selo tom="alerta">sem crachá — pelo botão</Selo> : <code>{v.uidHash}</code>}
                  </td>
                  <td>
                    <button
                      className="botao--grave"
                      onClick={tentar('Remover', () => repositorio.removerVinculo(v.uidHash))}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Painel>
  )
}
