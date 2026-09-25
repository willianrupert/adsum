// A turma inteira durante a chamada: apelido editável, papel antes do crachá,
// e as correções que não precisam sair da aula (Presente/Não presente,
// Remover crachá). Não mexe em estado: só chama quem manda.

import { chaveDeIdentidade } from '../../nucleo/faltas.ts'
import type { Matriculado, Papel } from '../../nucleo/tipos.ts'
import { Painel, Selo } from '../componentes/Painel.tsx'

export function ListaDeAlunos({
  alunos,
  chavesPendentes,
  efetivo,
  vezesDoNome,
  presencasHoje,
  chamadoChave,
  pulados,
  aoChamar,
  aoEditarNome,
  aoGravarNome,
  aoEditarPapel,
  aoAlterarPresenca,
  aoRemover,
}: {
  alunos: Matriculado[]
  /** Quem ainda não tem crachá. */
  chavesPendentes: ReadonlySet<string>
  efetivo: (p: Matriculado) => Matriculado
  /** Quantas vezes cada nome exibido aparece na turma. */
  vezesDoNome: ReadonlyMap<string, number>
  presencasHoje: ReadonlyMap<string, { presente: boolean }>
  chamadoChave?: string
  pulados: ReadonlySet<string>
  aoChamar: (chave: string) => void
  aoEditarNome: (p: Matriculado, nome: string, vinculado: boolean) => void
  aoGravarNome: (p: Matriculado) => void
  aoEditarPapel: (p: Matriculado, papel: Papel) => void
  aoAlterarPresenca: (p: Matriculado, presente: boolean) => void
  aoRemover: (p: Matriculado) => void
}) {
  return (
    <Painel titulo="Lista de alunos" legenda={`${chavesPendentes.size} de ${alunos.length} sem crachá`}>
      <table className="tabela">
        <thead>
          <tr>
            <th>Nome exibido</th>
            <th>Papel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {alunos.map((p) => {
            const vinculado = !chavesPendentes.has(p.chave)
            const e = efetivo(p)
            const repetido = (vezesDoNome.get(e.nome) ?? 0) > 1
            const presente = presencasHoje.get(chaveDeIdentidade(p))?.presente ?? false
            return (
              <tr key={p.chave} className={p.chave === chamadoChave ? 'linha--chamada' : ''}>
                <td>
                  {/* O apelido é o que se chama em voz alta: editável sempre. */}
                  <input
                    className="entrada--celula entrada--recuada"
                    value={e.nome}
                    onChange={(evento) => aoEditarNome(p, evento.target.value, vinculado)}
                    onBlur={() => vinculado && aoGravarNome(p)}
                    aria-label={`nome de ${p.nomeCompleto}`}
                  />
                  <span className="tabela__apoio">{p.nomeCompleto}</span>
                </td>
                <td className="celula--estado">
                  {vinculado ? (
                    e.papel
                  ) : (
                    <select
                      value={e.papel}
                      onChange={(evento) => aoEditarPapel(p, evento.target.value as Papel)}
                      aria-label={`papel de ${p.nomeCompleto}`}
                    >
                      <option value="aluno">Aluno</option>
                      <option value="professor">Professor</option>
                    </select>
                  )}
                  {repetido && <Selo tom="grave">Nome repetido</Selo>}
                </td>
                <td className="celula--estado">
                  {p.chave === chamadoChave ? (
                    <Selo tom="ok">Chamando</Selo>
                  ) : (
                    <>
                      {vinculado && <Selo tom="ok">Vinculado</Selo>}
                      {!vinculado && pulados.has(p.chave) && <Selo tom="neutro">Pulado</Selo>}
                      {!vinculado && <button onClick={() => aoChamar(p.chave)}>Chamar</button>}
                      {presente ? (
                        <button className="botao--quieto" onClick={() => aoAlterarPresenca(p, false)}>
                          Não presente
                        </button>
                      ) : (
                        <button onClick={() => aoAlterarPresenca(p, true)}>Presente</button>
                      )}
                      {vinculado && (
                        <button className="botao--grave" onClick={() => aoRemover(p)}>
                          Remover crachá
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Painel>
  )
}
