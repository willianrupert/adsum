// Professores têm painel próprio, acima dos alunos: o cadastro deles é sempre
// um clique em "Cadastrar", nunca a fila de "Chamar nomes".

import type { Matriculado, Vinculo } from '../../nucleo/tipos.ts'
import { Painel, Selo } from '../componentes/Painel.tsx'

export function PainelDeProfessores({
  professores,
  vinculoDe,
  efetivo,
  chamadoChave,
  professorAtual,
  aoChamar,
  aoEditarNome,
  aoRemover,
  aoMarcarComoEu,
}: {
  professores: Matriculado[]
  vinculoDe: (p: Matriculado) => Vinculo | undefined
  efetivo: (p: Matriculado) => Matriculado
  chamadoChave?: string
  /** O `uidHash` marcado como "Sou eu" neste computador. */
  professorAtual?: string
  aoChamar: (chave: string | undefined) => void
  aoEditarNome: (p: Matriculado, nome: string) => void
  aoRemover: (p: Matriculado) => void
  aoMarcarComoEu: (uidHash: string | undefined) => void
}) {
  const vinculados = professores.filter((p) => vinculoDe(p)).length

  return (
    <Painel titulo="Professores" recolhivel legenda={`${vinculados} de ${professores.length} com crachá`}>
      <table className="tabela">
        <thead>
          <tr>
            <th>Nome exibido</th>
            <th>Papel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {professores.map((p) => {
            const vinculo = vinculoDe(p)
            const e = efetivo(p)
            const chamando = p.chave === chamadoChave
            return (
              <tr key={p.chave} className={chamando ? 'linha--chamada' : ''}>
                <td>
                  {/* Antes do crachá o apelido é editável aqui; depois, em Ajustes → Vínculos. */}
                  {vinculo ? (
                    e.nome
                  ) : (
                    <input
                      className="entrada--celula"
                      value={e.nome}
                      onChange={(evento) => aoEditarNome(p, evento.target.value)}
                      aria-label={`nome de ${p.nomeCompleto}`}
                    />
                  )}
                  <span className="tabela__apoio">{p.nomeCompleto}</span>
                </td>
                <td className="celula--estado">{e.papel}</td>
                <td className="celula--estado">
                  {chamando ? (
                    <>
                      <Selo tom="ok">Cadastrando</Selo>
                      <button className="botao--quieto" onClick={() => aoChamar(undefined)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      {vinculo && <Selo tom="ok">Vinculado</Selo>}
                      {!vinculo && <button onClick={() => aoChamar(p.chave)}>Cadastrar</button>}
                      {vinculo && (
                        <button className="botao--grave" onClick={() => aoRemover(p)}>
                          Remover crachá
                        </button>
                      )}
                      {/* "Sou eu" só personaliza a saudação; não mexe no vínculo. */}
                      {vinculo &&
                        (professorAtual === vinculo.uidHash ? (
                          <>
                            <Selo tom="ok">Você</Selo>
                            <button className="botao--quieto" onClick={() => aoMarcarComoEu(undefined)}>
                              Não sou eu
                            </button>
                          </>
                        ) : (
                          <button className="botao--quieto" onClick={() => aoMarcarComoEu(vinculo.uidHash)}>
                            Sou eu
                          </button>
                        ))}
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
