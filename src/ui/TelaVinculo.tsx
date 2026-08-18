// Cerimônia de vínculo: um UID vira um nome, sem chance de trocar aluno.
//
// A garantia não vem do meio de transporte. Vem de haver **um só nome armado
// por vez**: arma-se um nome, ele aparece grande na tela, o aluno confere e
// encosta o crachá. O UID capturado só pode ser daquele nome — não havia
// segundo candidato. E o aluno lê o próprio nome antes de encostar, o que faz
// disso conferência de duas partes, não confiança em quem opera.
//
// O padrão anterior era auto-cadastro, com o nome preenchido depois na planilha.
// Casar depois é exatamente onde a troca acontece: sobram uma lista de UIDs e
// uma lista de nomes, pareadas por memória ou por horário.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularUidHash } from '../nucleo/hash.ts'
import { MAX_BYTES, prepararLista, remedir, type NomePreparado } from '../nucleo/nomes.ts'
import { uidLegivel } from '../nucleo/uid.ts'
import type { Papel } from '../nucleo/tipos.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'

type EstadoDaVez = 'pendente' | 'feito' | 'recusado' | 'pulado'

interface Entrada extends NomePreparado {
  estado: EstadoDaVez
  detalhe?: string
}

const EXEMPLO = `Cole aqui a página do SIGAA inteira, ou um nome por linha.

Aluno vem seguido de "(Perfil)"; docente, de "Departamento:".
Os dois são reconhecidos, e o professor entra no topo da fila.`

export function TelaVinculo() {
  const { leitor, repositorio, config } = useAdsum()

  const [colado, setColado] = useState('')
  const [fila, setFila] = useState<Entrada[]>([])
  const [armado, setArmado] = useState<number>()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'grave' | 'alerta'; texto: string }>()
  const [estadoLeitor, setEstadoLeitor] = useState(leitor.estado())

  useEffect(() => leitor.aoMudarEstado(setEstadoLeitor), [leitor])
  useEffect(() => setEstadoLeitor(leitor.estado()), [leitor])

  const carregar = useCallback(async () => {
    const preparados = prepararLista(colado)
    if (preparados.length === 0) {
      setRecado({ tom: 'grave', texto: 'Nenhum nome reconhecido nessa colagem.' })
      return
    }
    // Quem já tem crachá entra como feito: recarregar a lista no meio da
    // cerimônia não desfaz o que já foi vinculado.
    const jaVinculados = new Set((await repositorio.listarVinculos()).map((v) => v.nome))
    setFila(
      preparados.map((p) => ({
        ...p,
        estado: jaVinculados.has(p.nome) ? 'feito' : 'pendente',
      })),
    )
    setArmado(undefined)

    const docentes = preparados.filter((p) => p.docenteNoSigaa).length
    const largos = preparados.filter((p) => !p.cabeNaLista).length
    const longos = preparados.filter((p) => !p.cabeNoBuffer).length
    const ambiguos = preparados.filter((p) => p.ambiguo).length
    const avisos = [
      ambiguos > 0 && `${ambiguos} ficaram com nomes iguais — edite antes de armar`,
      largos > 0 && `${largos} não cabem na coluna do aparelho e apareceriam cortados`,
      longos > 0 && `${longos} passam de ${MAX_BYTES} bytes e seriam truncados pelo firmware`,
    ].filter(Boolean)

    setRecado({
      tom: avisos.length > 0 ? 'alerta' : 'ok',
      texto:
        `${preparados.length} nomes, todos como aluno.` +
        (docentes > 0 ? ` O SIGAA marcou ${docentes} como docente, no topo da lista.` : '') +
        (avisos.length > 0 ? ` Atenção: ${avisos.join('; ')}.` : ''),
    })
  }, [colado, repositorio])

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < fila.length; i++) {
        if (fila[i].estado === 'pendente') return i
      }
      return undefined
    },
    [fila],
  )

  // O laço da cerimônia. Só reage se houver exatamente um nome armado — sem
  // armado, uma leitura não tem a quem pertencer, e adivinhar seria justamente
  // o erro que tudo isto evita.
  useEffect(() => {
    return leitor.aoLer((leitura) => {
      void (async () => {
        if (armado === undefined) {
          setRecado({
            tom: 'alerta',
            texto: `Crachá ${uidLegivel(leitura.uid)} lido sem nome armado — nada foi gravado.`,
          })
          return
        }

        const entrada = fila[armado]
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const dono = await repositorio.vinculoPorHash(uidHash)

        // Trava: crachá já vinculado é recusado, dizendo de quem é. Pega crachá
        // emprestado e segunda via cadastrada duas vezes.
        if (dono) {
          setFila((antes) =>
            antes.map((e, i) =>
              i === armado ? { ...e, estado: 'recusado', detalhe: `crachá é de ${dono.nome}` } : e,
            ),
          )
          setRecado({
            tom: 'grave',
            texto: `Recusado: este crachá já é de ${dono.nome}. ${entrada.nome} continua armado — pode encostar outro.`,
          })
          return
        }

        await repositorio.gravarVinculo({
          uidHash,
          papel: entrada.papel,
          nome: entrada.nome,
          criadoEm: new Date().toISOString(),
        })

        setFila((antes) =>
          antes.map((e, i) =>
            i === armado ? { ...e, estado: 'feito', detalhe: uidHash } : e,
          ),
        )
        setRecado({ tom: 'ok', texto: `${entrada.nome} vinculado.` })
        setArmado(proximoPendente(armado + 1))
      })()
    })
  }, [leitor, armado, fila, repositorio, config.salHex, proximoPendente])

  const feitos = useMemo(() => fila.filter((e) => e.estado === 'feito').length, [fila])
  const pendentes = useMemo(() => fila.filter((e) => e.estado === 'pendente').length, [fila])
  const semProfessor = fila.length > 0 && fila.every((e) => e.papel !== 'professor')

  function renomear(indice: number, nome: string) {
    setFila((antes) =>
      antes.map((e, i) => (i === indice ? { ...e, ...remedir(e, nome), ambiguo: false } : e)),
    )
  }

  function trocarPapel(indice: number, papel: Papel) {
    setFila((antes) => antes.map((e, i) => (i === indice ? { ...e, papel } : e)))
  }

  const emCerimonia = armado !== undefined
  const atual = emCerimonia ? fila[armado] : undefined

  return (
    <div className="diagnostico">
      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}

      {semProfessor && (
        <div className="aviso aviso--alerta">
          <strong>Ninguém está marcado como professor.</strong>
          <p>
            Todo mundo entra como aluno de propósito — mas o crachá que abre a sessão é o
            do professor, e sem ele a aula não começa. Se o SIGAA sinalizou algum docente,
            ele está no topo da lista com a dica <code>SIGAA: docente</code>.
          </p>
        </div>
      )}

      {estadoLeitor !== 'lendo' && (
        <div className="aviso aviso--alerta">
          <strong>O leitor está {estadoLeitor}.</strong>
          <p>
            Sem leitor, nenhum crachá chega. Escolha e inicie um no{' '}
            <a href="#/diagnostico">Diagnóstico</a>.
          </p>
        </div>
      )}

      {armado !== undefined && atual && (
        <section className="armado">
          <p className="armado__rotulo">encoste o crachá de</p>
          <p className="armado__nome">{atual.nome}</p>
          <p className="armado__completo">
            {atual.completo} · {atual.papel}
          </p>
          <div className="armado__acoes">
            <button
              onClick={() => {
                setFila((antes) =>
                  antes.map((e, i) => (i === armado ? { ...e, estado: 'pulado' } : e)),
                )
                setArmado(proximoPendente(armado + 1))
              }}
            >
              pular
            </button>
            <button onClick={() => setArmado(undefined)}>encerrar</button>
          </div>
          <p className="armado__nota">
            O aluno lê o próprio nome antes de encostar, e pode dizer "não sou eu". É por
            isso que não existe segundo candidato.
          </p>

          {/* Com leitor simulado a cerimônia inteira roda sem hardware — é como
              se ensaia o roteiro antes de ter cinquenta alunos na fila. */}
          {ehSimulavel(leitor) && (
            <div className="armado__acoes">
              <button
                onClick={() => {
                  try {
                    leitor.encostarProximo()
                  } catch (erro) {
                    setRecado({ tom: 'grave', texto: (erro as Error).message })
                  }
                }}
              >
                simular um crachá
              </button>
            </div>
          )}
        </section>
      )}

      <Painel
        titulo="A turma"
        legenda="Cole a lista do SIGAA. Ela fica só aqui — o aparelho recebe um nome por vez e nunca conhece a turma inteira."
        acoes={
          <>
            <button onClick={() => void carregar()}>carregar</button>
            {fila.length > 0 && !emCerimonia && (
              <button
                className="botao--acento"
                onClick={() => {
                  const primeiro = proximoPendente(0)
                  if (primeiro === undefined) {
                    setRecado({ tom: 'ok', texto: 'Nada pendente — a turma inteira já tem crachá.' })
                    return
                  }
                  setArmado(primeiro)
                }}
              >
                iniciar cerimônia
              </button>
            )}
          </>
        }
      >
        {fila.length === 0 ? (
          <textarea
            value={colado}
            onChange={(e) => setColado(e.target.value)}
            placeholder={EXEMPLO}
            rows={8}
            aria-label="lista da turma"
          />
        ) : (
          <>
            <Linha rotulo="progresso">
              {feitos} de {fila.length} vinculados · {pendentes} pendentes
            </Linha>
            <table className="tabela">
              <thead>
                <tr>
                  <th>nome no aparelho</th>
                  <th>papel</th>
                  <th>px</th>
                  <th>estado</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((e, i) => (
                  <tr key={`${e.completo}-${i}`} className={i === armado ? 'linha--armada' : ''}>
                    <td>
                      <input
                        className="entrada--celula"
                        value={e.nome}
                        onChange={(evento) => renomear(i, evento.target.value)}
                        aria-label={`nome de ${e.completo}`}
                      />
                    </td>
                    <td className="celula--estado">
                      <select
                        value={e.papel}
                        onChange={(evento) => trocarPapel(i, evento.target.value as Papel)}
                        aria-label={`papel de ${e.completo}`}
                      >
                        <option value="aluno">aluno</option>
                        <option value="professor">professor</option>
                      </select>
                      {e.docenteNoSigaa && e.papel === 'aluno' && (
                        <Selo tom="alerta">SIGAA: docente</Selo>
                      )}
                    </td>
                    <td className="celula--estado">
                      <Selo tom={e.cabeNaLista && e.cabeNoBuffer ? 'neutro' : 'alerta'}>
                        {e.larguraNaLista}
                        {!e.cabeNoBuffer && ` · ${e.bytes}B`}
                      </Selo>
                      {e.ambiguo && <Selo tom="grave">nome repetido</Selo>}
                    </td>
                    {/* Armar continua disponível depois de vinculado: um aluno com
                        dois crachás é permitido de propósito, porque segunda via
                        existe. A relação é muitos-para-um. */}
                    <td className="celula--estado">
                      {i === armado ? (
                        <Selo tom="ok">armado</Selo>
                      ) : (
                        <>
                          {e.estado === 'feito' && <Selo tom="ok">vinculado</Selo>}
                          {e.estado === 'recusado' && <Selo tom="grave">{e.detalhe}</Selo>}
                          {e.estado === 'pulado' && <Selo tom="neutro">pulado</Selo>}
                          <button onClick={() => setArmado(i)}>
                            {e.estado === 'feito' ? 'outro crachá' : 'armar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ferramentas">
              <button
                onClick={() => {
                  setFila([])
                  setArmado(undefined)
                  setRecado(undefined)
                }}
              >
                trocar de lista
              </button>
              <span className="ferramentas__ou">
                Um aluno com dois crachás é permitido — segunda via existe. Basta armar o
                nome de novo.
              </span>
            </div>
          </>
        )}
      </Painel>
    </div>
  )
}
