// A folha de uma turma: conciliação, diferenças, escolhas e o Preencher. Grava
// só na base (ajustes e auditoria), nunca no SIGAA.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conciliar } from '../../nucleo/lancar/conciliar.ts'
import { resumoDaFolha, type DiferencaDaFolha } from '../../nucleo/lancar/folha.ts'
import { planejar, validarPlano } from '../../nucleo/lancar/plano.ts'
import { remanejosDaAuditoria } from '../../nucleo/lancar/auditoria.ts'
import type { AjusteSigaa, Dia, LeituraPlanilha, LinhaDeAuditoria, RemanejoSigaa } from '../../nucleo/lancar/tipos.ts'
import type { Evento, Matriculado } from '../../nucleo/tipos.ts'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'

const valorLegivel = (n: number) => (n === 0 ? 'presente' : n === 1 ? '1 falta' : `${n} faltas`)
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * As diferenças num cartão só, fechado: quantas, de quantos alunos, em
 * quantas aulas. Aberto, por aula, um aluno por linha. Dez alunos diferentes
 * continuam sendo um cartão, e nenhum nome aparece sem o professor pedir.
 */
function ResumoDasDiferencas({
  diferencas,
  aberto,
  alternar,
  aceitar,
}: {
  diferencas: DiferencaDaFolha[]
  aberto: boolean
  alternar: () => void
  aceitar: (d: DiferencaDaFolha) => void
}) {
  const porAula = new Map<string, DiferencaDaFolha[]>()
  for (const d of [...diferencas].sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome))) {
    porAula.set(d.rotulo, [...(porAula.get(d.rotulo) ?? []), d])
  }
  const alunos = new Set(diferencas.map((d) => d.matricula)).size
  const titulo = `${contar(diferencas.length, 'diferença', 'diferenças')} com o SIGAA`
  return (
    <section role="group" aria-label="Diferenças" className="folha-sigaa__diferencas">
      <button className="cartao cartao--botao" aria-expanded={aberto} aria-label={titulo} onClick={alternar}>
        <span className="cartao__icone cartao__icone--alerta" aria-hidden="true">
          !
        </span>
        <span className="cartao__texto">
          <strong>{titulo}</strong>
          <small>{`${contar(alunos, 'aluno', 'alunos')} em ${contar(porAula.size, 'aula', 'aulas')}. O SIGAA fica como está.${aberto ? '' : ' Toque para conferir.'}`}</small>
        </span>
      </button>
      {aberto &&
        [...porAula].map(([rotulo, itens]) => (
          <div key={rotulo} className="folha-sigaa__dif-aula">
            <p className="folha-sigaa__dif-dia">{rotulo}</p>
            {itens.map((d) => (
              <div key={`${d.matricula}|${d.dia}`} className="folha-sigaa__diferenca">
                <span className="folha-sigaa__dif-texto">
                  <strong>{d.nome}</strong>
                  <small>{`No SIGAA, ${valorLegivel(d.sigaa)}. No Adsum, ${valorLegivel(d.esperado)}.`}</small>
                </span>
                <button onClick={() => aceitar(d)}>Aceitar o SIGAA</button>
              </div>
            ))}
          </div>
        ))}
    </section>
  )
}

/** A planilha lida e a turma escolhida: conciliação, escolhas e Preencher. */
export function FolhaDaTurma({
  repositorio,
  ponte,
  leitura,
  turma,
  avisos,
  fechar,
}: {
  repositorio: Repositorio
  ponte: PonteSigaa
  leitura: LeituraPlanilha
  turma: string
  avisos: string[]
  fechar: () => void
}) {
  const [dados, setDados] = useState<{
    eventos: Evento[]
    matriculados: Matriculado[]
    ajustes: AjusteSigaa[]
    remanejos: RemanejoSigaa[]
    auditoria: LinhaDeAuditoria[]
  }>()
  const [desmarcadas, setDesmarcadas] = useState<Dia[]>([])
  // Quanto vale a falta, quando o professor muda nesta folha (`docs/13`).
  const [escolhas, setEscolhas] = useState<Partial<Record<Dia, number>>>({})
  const [aberta, setAberta] = useState<Dia>()
  // Fechadas por padrão: nome de aluno só aparece quando o professor pede.
  const [verDiferencas, setVerDiferencas] = useState(false)
  const [aceitas, setAceitas] = useState<DiferencaDaFolha[]>([])
  const [recado, setRecado] = useState<string>()
  const conferida = useRef(false)
  const avisada = useRef(false)

  const carregar = useCallback(async () => {
    const [eventos, matriculados, ajustes, auditoria] = await Promise.all([
      repositorio.listarEventos({ turma }),
      repositorio.listarMatriculados(turma),
      repositorio.lerAjustesSigaa(turma),
      repositorio.listarAuditoriaSigaa(turma),
    ])
    setDados({ eventos, matriculados, ajustes, remanejos: remanejosDaAuditoria(auditoria), auditoria })
  }, [repositorio, turma])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const relatorio = useMemo(
    () =>
      dados &&
      conciliar({
        leitura,
        turma,
        matriculados: dados.matriculados,
        eventos: dados.eventos,
        ajustes: dados.ajustes,
        remanejos: dados.remanejos,
        auditoria: dados.auditoria,
        escolhas,
      }),
    [dados, leitura, turma, escolhas],
  )
  const resumo = useMemo(
    () => relatorio && dados && resumoDaFolha({ relatorio, leitura, matriculados: dados.matriculados, desmarcadas }),
    [relatorio, dados, leitura, desmarcadas],
  )

  const linha = useCallback(
    (acao: LinhaDeAuditoria['acao'], dia: Dia, matricula: string, lido: string, proposto: string, aplicado: string, quando = new Date().toISOString()): LinhaDeAuditoria => ({
      turma,
      quando,
      acao,
      versaoSigaa: leitura.versaoSigaa,
      dia,
      matricula,
      lido,
      proposto,
      aplicado,
    }),
    [leitura.versaoSigaa, turma],
  )

  // Uma vez por leitura: as diferenças da primeira conferência vão para a auditoria.
  useEffect(() => {
    if (!relatorio || conferida.current) return
    conferida.current = true
    const divergentes = relatorio.celulas.flatMap((c) =>
      c.categoria === 'diverge' ? [linha('conferencia', c.dia, c.matricula, String(c.sigaa), String(c.esperado), '')] : [],
    )
    if (divergentes.length > 0) void repositorio.acrescentarAuditoriaSigaa(divergentes)
  }, [relatorio, linha, repositorio])

  // Ficar tudo igual, na hora ou depois de um aceite, avisa a planilha: o favorito espera o plano.
  useEffect(() => {
    if (resumo?.estado !== 'tudoConfere' || avisada.current) return
    avisada.current = true
    ponte.entregar(leitura.id, [])
  }, [resumo, ponte, leitura.id])

  const aceitar = async (d: DiferencaDaFolha) => {
    await repositorio.gravarAjusteSigaa({ turma, dia: d.dia, matricula: d.matricula, valor: d.sigaa, em: new Date().toISOString() })
    await repositorio.acrescentarAuditoriaSigaa([linha('aceite', d.dia, d.matricula, String(d.sigaa), String(d.esperado), String(d.sigaa))])
    setAceitas((antes) => [...antes, d])
    await carregar()
  }

  /** Voltar atrás é outro ajuste, com o valor do Adsum: só acréscimo. */
  const desfazerAceite = async (d: DiferencaDaFolha) => {
    await repositorio.gravarAjusteSigaa({ turma, dia: d.dia, matricula: d.matricula, valor: d.esperado, em: new Date().toISOString() })
    await repositorio.acrescentarAuditoriaSigaa([linha('aceite', d.dia, d.matricula, String(d.sigaa), String(d.esperado), String(d.esperado))])
    setAceitas((antes) => antes.filter((a) => a !== d))
    await carregar()
  }

  /** A chamada de `de` entra na aula `para` do SIGAA; `para` igual a `de` desfaz. Só acréscimo. */
  const remanejar = async (de: Dia, para: Dia) => {
    await repositorio.acrescentarAuditoriaSigaa([linha('remanejo', para, '', de, para, para)])
    await carregar()
  }

  const preencher = async () => {
    if (!relatorio) return
    const plano = planejar(relatorio, desmarcadas)
    const validacao = validarPlano(plano, leitura)
    if (!validacao.ok) return setRecado('O plano não confere com a planilha. Nada foi mandado. Clique no favorito de novo.')
    if (!ponte.entregar(leitura.id, plano)) return setRecado('A planilha foi fechada. Clique no favorito de novo.')
    const porPosicao = new Map(relatorio.celulas.map((c) => [`${c.linha}|${c.coluna}`, c]))
    // Um instante para o Preencher inteiro: o histórico junta o lançamento por ele.
    const quando = new Date().toISOString()
    await repositorio.acrescentarAuditoriaSigaa(
      plano.map((i) => {
        const c = porPosicao.get(`${i.linha}|${i.coluna}`)!
        return linha('preenchimento', c.dia, c.matricula, '', String(i.valor), String(i.valor), quando)
      }),
    )
    fechar()
  }

  if (!resumo) return <main className="folha-sigaa" aria-busy="true" />

  /** A partir da escolha mais recente: dois toques rápidos são dois passos. */
  const mudarFalta = (dia: Dia, falta: { valor: number; maximo: number }, passo: number) =>
    setEscolhas((antes) => ({ ...antes, [dia]: Math.min(falta.maximo, Math.max(1, (antes[dia] ?? falta.valor) + passo)) }))
  const alternar = (dia: Dia) => setDesmarcadas((antes) => (antes.includes(dia) ? antes.filter((d) => d !== dia) : [...antes, dia]))
  const marcadas = resumo.aulas.filter((a) => a.marcada).length

  return (
    <main className="folha-sigaa">
      <h1>{resumo.titulo}</h1>
      <p className="folha-sigaa__apoio">{resumo.apoio}</p>

      {resumo.diferencas.length > 0 && (
        <ResumoDasDiferencas diferencas={resumo.diferencas} aberto={verDiferencas} alternar={() => setVerDiferencas((v) => !v)} aceitar={(d) => void aceitar(d)} />
      )}

      {aceitas.map((d) => (
        <p key={`${d.matricula}|${d.dia}`} className="folha-sigaa__aceita">
          <span>{`${d.nome}, ${d.rotulo}: fica como está no SIGAA.`}</span>
          <button className="botao--quieto" onClick={() => void desfazerAceite(d)}>
            Desfazer
          </button>
        </p>
      ))}

      {resumo.semLugar.map((s) => (
        <section key={s.dia} aria-label={`Chamada de ${s.rotulo}`} className="cartao folha-sigaa__sem-lugar">
          <strong>{s.rotulo}</strong>
          <small>{`${contar(s.presentes, 'presente', 'presentes')}, ${contar(s.faltas, 'falta', 'faltas')}`}</small>
          <p>{s.explicacao}</p>
          <div className="folha-sigaa__opcoes">
            {s.opcoes.map((o) => (
              <button key={o.dia} onClick={() => void remanejar(s.dia, o.dia)}>
                {o.rotulo}
              </button>
            ))}
          </div>
        </section>
      ))}

      {resumo.aulas.map((a) => (
        <div key={a.dia} className="cartao folha-sigaa__aula">
          <input type="checkbox" checked={a.marcada} onChange={() => alternar(a.dia)} aria-label={`Incluir ${a.rotulo}`} />
          <button className="folha-sigaa__abrir" aria-expanded={aberta === a.dia} onClick={() => setAberta(aberta === a.dia ? undefined : a.dia)}>
            <strong>{a.rotulo}</strong>
            <small>{`${contar(a.presentes, 'presente', 'presentes')}, ${contar(a.faltas, 'falta', 'faltas')}`}</small>
            {a.de && <small>{`Chamada de ${a.de.rotulo}`}</small>}
          </button>
          {a.falta && (
            <div className="folha-sigaa__falta">
              <span>Quem faltou leva</span>
              <button
                aria-label={`Uma falta a menos em ${a.rotulo}`}
                disabled={a.falta.valor <= 1}
                onClick={() => mudarFalta(a.dia, a.falta!, -1)}
              >
                −
              </button>
              <strong>{a.falta.valor}</strong>
              <button
                aria-label={`Uma falta a mais em ${a.rotulo}`}
                disabled={a.falta.valor >= a.falta.maximo}
                onClick={() => mudarFalta(a.dia, a.falta!, 1)}
              >
                +
              </button>
              <span>{`de ${a.falta.maximo}.`}</span>
            </div>
          )}
          {a.de && (
            <button
              className="botao--quieto"
              aria-label={`Desfazer: a chamada de ${a.de.rotulo} volta a ficar sem lugar`}
              onClick={() => void remanejar(a.de!.dia, a.de!.dia)}
            >
              Desfazer
            </button>
          )}
          {aberta === a.dia && (
            <ul className="folha-sigaa__ausentes">
              {a.ausentes.length === 0 ? <li>Ninguém faltou.</li> : a.ausentes.map((p) => <li key={p.matricula}>{`${p.nome}, ${valorLegivel(p.faltas)}`}</li>)}
            </ul>
          )}
        </div>
      ))}

      {[resumo.informativos, ...avisos].filter(Boolean).map((t) => (
        <p key={t} className="folha-sigaa__informativo">
          {t}
        </p>
      ))}
      {recado && <div className="aviso aviso--grave">{recado}</div>}

      {resumo.estado === 'tudoConfere' ? (
        <button className="botao--acento folha-sigaa__acao" onClick={fechar}>
          Fechar
        </button>
      ) : (
        <>
          {resumo.botao && (
            <button className="botao--acento folha-sigaa__acao" disabled={marcadas === 0} onClick={() => void preencher()}>
              {resumo.botao}
            </button>
          )}
          <button className="botao--quieto" onClick={fechar}>
            Agora não
          </button>
          <p className="folha-sigaa__garantia">Ao preencher, o SIGAA salva sozinho em até 5 minutos.</p>
        </>
      )}
    </main>
  )
}
