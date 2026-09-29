// A folha do Adsum na janela aberta pelo favorito (`docs/08` §5, `docs/09`).
//
// Lê a planilha, concilia com a base e mostra o estado em uma frase: tudo
// confere, há o que lançar, ou a recusa com o que fazer. Grava só na base
// (ajustes e auditoria): a pasta recebe na próxima vez que o Adsum abrir.
// O Gravar do SIGAA é sempre do professor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conciliar, escolherTurma } from '../../nucleo/lancar/conciliar.ts'
import { resumoDaFolha, type DiferencaDaFolha } from '../../nucleo/lancar/folha.ts'
import { lerPlanilha } from '../../nucleo/lancar/leitura.ts'
import { planejar, validarPlano } from '../../nucleo/lancar/plano.ts'
import type { LeituraRecebida } from '../../nucleo/lancar/protocolo.ts'
import type { AjusteSigaa, Dia, LeituraPlanilha, LinhaDeAuditoria } from '../../nucleo/lancar/tipos.ts'
import type { Evento, Matriculado } from '../../nucleo/tipos.ts'
import type { PonteSigaa } from '../../portas/PonteSigaa.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { confirmarTurma, turmasConfirmadas } from '../../ambiente/preferencias.ts'
import { ListaParaLancarAMao } from '../ajustes/PainelLancarNoSigaa.tsx'

interface Recusa {
  titulo: string
  texto: string
  detalhes?: string[]
  /** Oferece o chão: a lista para lançar à mão. */
  aMao?: boolean
}

type Pergunta = { candidatas: string[] } | { confirmar: string; codigo: string }

type Estado =
  | { tipo: 'esperando' }
  | { tipo: 'recusa'; recusa: Recusa }
  | { tipo: 'pergunta'; leitura: LeituraPlanilha; avisos: string[]; pergunta: Pergunta }
  | { tipo: 'pronta'; leitura: LeituraPlanilha; turma: string; avisos: string[] }

const RECUSAS = {
  semFavorito: {
    titulo: 'Abra pela planilha do SIGAA',
    texto: 'No SIGAA, abra "Lançar Freq. em Planilha" da turma e clique no favorito do Adsum.',
    aMao: true,
  },
  naoRespondeu: { titulo: 'A planilha não respondeu', texto: 'Clique no favorito de novo, na planilha do SIGAA.', aMao: true },
  favoritoAntigo: {
    titulo: 'Favorito antigo',
    texto: 'Este favorito é de uma versão antiga. Arraste o novo, nos Ajustes do Adsum, para a barra de favoritos.',
  },
  formato: { titulo: 'Mensagem estranha', texto: 'A planilha mandou algo que o Adsum não entende. Clique no favorito de novo.' },
  naoEstaNoAdsum: { titulo: 'Esta turma não está no Adsum', texto: 'Nenhuma turma do Adsum tem o código e as matrículas desta planilha.', aMao: true },
  baseVazia: {
    titulo: 'Nenhuma turma neste navegador',
    texto: 'O Adsum deste navegador não tem turma cadastrada. Abra o SIGAA no mesmo navegador em que você faz a chamada.',
  },
} satisfies Record<string, Recusa>

const valorLegivel = (n: number) => (n === 0 ? 'presente' : n === 1 ? '1 falta' : `${n} faltas`)
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function TelaDeRecusa({ recusa, repositorio }: { recusa: Recusa; repositorio: Repositorio }) {
  const [aMao, setAMao] = useState(false)
  const [turmas, setTurmas] = useState<string[]>([])
  useEffect(() => {
    if (aMao) void repositorio.listarTurmas().then(setTurmas)
  }, [aMao, repositorio])
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
      {recusa.aMao &&
        (aMao ? (
          <ListaParaLancarAMao turmas={turmas} repositorio={repositorio} />
        ) : (
          <button className="botao--quieto" onClick={() => setAMao(true)}>
            Lançar à mão
          </button>
        ))}
    </main>
  )
}

/** A planilha não basta para achar a turma: o professor diz qual é, num toque. */
function TelaDaPergunta({ pergunta, escolher, recusar }: { pergunta: Pergunta; escolher: (turma: string) => void; recusar: () => void }) {
  if ('confirmar' in pergunta) {
    const { confirmar, codigo } = pergunta
    return (
      <main className="folha-sigaa">
        <h1>{`Esta planilha é de ${codigo}`}</h1>
        <p className="folha-sigaa__apoio">{`A turma ${confirmar} do Adsum tem as mesmas matrículas, mas o nome não traz ${codigo}.`}</p>
        <button
          className="botao--acento folha-sigaa__acao"
          onClick={() => {
            confirmarTurma(codigo, confirmar)
            escolher(confirmar)
          }}
        >
          {`Usar ${confirmar}`}
        </button>
        <button className="botao--quieto" onClick={recusar}>
          Não é esta
        </button>
      </main>
    )
  }
  return (
    <main className="folha-sigaa">
      <h1>Qual é a turma desta planilha?</h1>
      <p className="folha-sigaa__apoio">Mais de uma turma do Adsum tem as matrículas desta planilha.</p>
      {pergunta.candidatas.map((turma) => (
        <button key={turma} className="cartao folha-sigaa__turma" onClick={() => escolher(turma)}>
          {turma}
        </button>
      ))}
    </main>
  )
}

/** A planilha lida e a turma escolhida: conciliação, escolhas e Preencher. */
function FolhaDaTurma({
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
  const [dados, setDados] = useState<{ eventos: Evento[]; matriculados: Matriculado[]; ajustes: AjusteSigaa[] }>()
  const [desmarcadas, setDesmarcadas] = useState<Dia[]>([])
  const [aberta, setAberta] = useState<Dia>()
  const [aceitas, setAceitas] = useState<DiferencaDaFolha[]>([])
  const [recado, setRecado] = useState<string>()
  const conferida = useRef(false)
  const avisada = useRef(false)

  const carregar = useCallback(async () => {
    const [eventos, matriculados, ajustes] = await Promise.all([
      repositorio.listarEventos({ turma }),
      repositorio.listarMatriculados(turma),
      repositorio.lerAjustesSigaa(turma),
    ])
    setDados({ eventos, matriculados, ajustes })
  }, [repositorio, turma])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const relatorio = useMemo(
    () => dados && conciliar({ leitura, turma, matriculados: dados.matriculados, eventos: dados.eventos, ajustes: dados.ajustes }),
    [dados, leitura, turma],
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

  const alternar = (dia: Dia) => setDesmarcadas((antes) => (antes.includes(dia) ? antes.filter((d) => d !== dia) : [...antes, dia]))
  const marcadas = resumo.aulas.filter((a) => a.marcada).length

  return (
    <main className="folha-sigaa">
      <h1>{resumo.titulo}</h1>
      <p className="folha-sigaa__apoio">{resumo.apoio}</p>

      {resumo.diferencas.length > 0 && (
        <section role="group" aria-label="Diferenças" className="folha-sigaa__diferencas">
          {resumo.diferencas.map((d) => (
            <div key={`${d.matricula}|${d.dia}`} className="folha-sigaa__diferenca">
              <strong>{d.nome}</strong>
              <span>{`${d.rotulo}. No SIGAA, ${valorLegivel(d.sigaa)}. No Adsum, ${valorLegivel(d.esperado)}.`}</span>
              <small>O SIGAA fica como está.</small>
              <button onClick={() => void aceitar(d)}>Aceitar o SIGAA</button>
            </div>
          ))}
        </section>
      )}

      {aceitas.map((d) => (
        <p key={`${d.matricula}|${d.dia}`} className="folha-sigaa__aceita">
          <span>{`${d.nome}, ${d.rotulo}: fica como está no SIGAA.`}</span>
          <button className="botao--quieto" onClick={() => void desfazerAceite(d)}>
            Desfazer
          </button>
        </p>
      ))}

      {resumo.aulas.map((a) => (
        <div key={a.dia} className="cartao folha-sigaa__aula">
          <input type="checkbox" checked={a.marcada} onChange={() => alternar(a.dia)} aria-label={`Incluir ${a.rotulo}`} />
          <button className="folha-sigaa__abrir" aria-expanded={aberta === a.dia} onClick={() => setAberta(aberta === a.dia ? undefined : a.dia)}>
            <strong>{a.rotulo}</strong>
            <small>{`${contar(a.presentes, 'presente', 'presentes')}, ${contar(a.faltas, 'falta', 'faltas')}`}</small>
            {a.aviso && <small className="folha-sigaa__aviso">{a.aviso}</small>}
          </button>
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

/** Fora do componente: uma função nova a cada desenho refaria a ligação com a planilha. */
const relogio = () => new Date()

export function FolhaSigaa({
  repositorio,
  ponte,
  fechar,
  esperaMs = 8000,
  agora = relogio,
}: {
  repositorio: Repositorio
  ponte: PonteSigaa
  fechar: () => void
  /** Sem leitura até lá, a planilha não respondeu. */
  esperaMs?: number
  /** A leitura bloqueia o dia futuro, como a página; o teste fixa o relógio. */
  agora?: () => Date
}) {
  const [estado, setEstado] = useState<Estado>(() => (ponte.ligada() ? { tipo: 'esperando' } : { tipo: 'recusa', recusa: RECUSAS.semFavorito }))

  const tratar = useCallback(
    async (recebida: LeituraRecebida) => {
      const recusar = (recusa: Recusa) => setEstado({ tipo: 'recusa', recusa })
      if (!recebida.ok) return recusar(recebida.motivo === 'versaoDoFavorito' ? RECUSAS.favoritoAntigo : RECUSAS.formato)
      const { leitura, problemas } = lerPlanilha(recebida.bruto, recebida.id, agora())
      const detalhes = problemas.map((p) => `${p.onde}: ${p.motivo}${p.conteudo ? ` ("${p.conteudo}")` : ''}`)
      if (!leitura) return recusar({ titulo: 'Não deu para ler a planilha', texto: 'O Adsum não preencheu nada. O motivo:', detalhes, aMao: true })
      const matriculados = await repositorio.listarMatriculados()
      if (matriculados.length === 0) return recusar(RECUSAS.baseVazia)
      const escolha = escolherTurma(leitura, matriculados, turmasConfirmadas())
      if ('turma' in escolha) return setEstado({ tipo: 'pronta', leitura, turma: escolha.turma, avisos: detalhes })
      if ('confirmar' in escolha) return setEstado({ tipo: 'pergunta', leitura, avisos: detalhes, pergunta: escolha })
      if (escolha.recusa === 'duas') return setEstado({ tipo: 'pergunta', leitura, avisos: detalhes, pergunta: { candidatas: escolha.candidatas } })
      recusar(RECUSAS.naoEstaNoAdsum)
    },
    [repositorio, agora],
  )

  useEffect(() => {
    if (!ponte.ligada()) return
    const cancelar = ponte.aoLer((r) => void tratar(r))
    ponte.iniciar()
    const espera = setTimeout(() => setEstado((e) => (e.tipo === 'esperando' ? { tipo: 'recusa', recusa: RECUSAS.naoRespondeu } : e)), esperaMs)
    return () => {
      clearTimeout(espera)
      cancelar()
      ponte.parar()
    }
  }, [ponte, tratar, esperaMs])

  if (estado.tipo === 'esperando') {
    return (
      <main className="folha-sigaa" aria-busy="true">
        <h1>Lendo a planilha</h1>
      </main>
    )
  }
  if (estado.tipo === 'recusa') return <TelaDeRecusa recusa={estado.recusa} repositorio={repositorio} />
  if (estado.tipo === 'pergunta') {
    const { leitura, avisos } = estado
    return (
      <TelaDaPergunta
        pergunta={estado.pergunta}
        escolher={(turma) => setEstado({ tipo: 'pronta', leitura, turma, avisos })}
        recusar={() => setEstado({ tipo: 'recusa', recusa: RECUSAS.naoEstaNoAdsum })}
      />
    )
  }
  return (
    <FolhaDaTurma
      key={estado.leitura.id}
      repositorio={repositorio}
      ponte={ponte}
      leitura={estado.leitura}
      turma={estado.turma}
      avisos={estado.avisos}
      fechar={fechar}
    />
  )
}
