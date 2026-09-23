// Painel do Diagnóstico: liga o rig de teste (ESP32-S3, `ferramentas/rig-de-cracha/`)
// pela porta ponte, dispara a suíte física e mostra o resultado. Só existe no
// modo de ensaio — como `ehSimulavel`, é ferramenta de quem testa o app, nunca
// aparece pra quem dá aula.
//
// "Rodar suíte" abre uma janela auxiliar em branco (o mecanismo do cenário de
// perda de foco, em `ambiente/suiteFisica.ts`) — é esperado que o foco pisque
// por um instante durante a corrida. Fechar essa janela no meio interrompe só
// aquele cenário; os outros já rodaram e continuam no relatório.
//
// O cenário avançado ("dois crachás juntos") precisa de uma chamada aberta
// de verdade — `INTERVALO_MINIMO_MS` só é decidido dentro dela
// (`nucleo/sessao.ts`), fora do alcance do que o Diagnóstico sozinho vê.
// "Preparar" recarrega a página de propósito: é o mesmo mecanismo que o
// resto do app já usa pra sincronizar estado com o banco — mais simples e
// mais confiável que empurrar a rota de dentro do Diagnóstico.

import { useEffect, useState } from 'react'
import { RigDeCracha } from '../ambiente/rigDeCracha.ts'
import {
  cadastrarFilaDeRadio,
  rodarCenarioAvancado,
  rodarChamadaComHistorico,
  rodarFilaDeRadio,
  rodarSuiteFisica,
} from '../ambiente/suiteFisica.ts'
import { prepararTurmaDeTeste, situacaoDaTurmaDeTeste, type SituacaoDaTurmaDeTeste } from '../ambiente/turmaDeTeste.ts'
import type { ResultadoCenario } from '../nucleo/suiteDeTestes.ts'
import type { Config } from '../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { Linha, Painel, Selo } from './componentes/Painel.tsx'

export function PainelDeTestesFisicos({
  leitor,
  leitorId,
  repositorio,
  config,
  rig: rigInjetado,
}: {
  leitor: LeitorDeCracha
  leitorId: string
  repositorio: Repositorio
  config: Config
  /** Para teste. Em produção, sempre um `RigDeCracha` novo. */
  rig?: RigDeCracha
}) {
  const [rig] = useState(() => rigInjetado ?? new RigDeCracha())
  const [conectado, setConectado] = useState(false)
  const [conectando, setConectando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState<string>()
  const [resultados, setResultados] = useState<ResultadoCenario[]>()
  const [erro, setErro] = useState<string>()

  const [situacaoDaTurma, setSituacaoDaTurma] = useState<SituacaoDaTurmaDeTeste>()
  const [preparando, setPreparando] = useState(false)
  const [rodandoAvancado, setRodandoAvancado] = useState(false)
  const [rodandoHistorico, setRodandoHistorico] = useState(false)
  const [rodandoFila, setRodandoFila] = useState(false)

  // Reencontra o rig sozinho se a página acabou de recarregar por causa do
  // "Preparar" — sem isto, o professor precisaria clicar em "Conectar" de
  // novo só porque a aba reabriu.
  useEffect(() => {
    // Falha aqui não é erro de tela — é só "não deu pra reconectar sozinho",
    // e o botão "Conectar" continua disponível pro professor tentar na mão.
    // `RigDeCracha` já desfaz a conexão pela metade sozinha (`#abrir`) antes
    // de rejeitar, então não há porta presa esperando aqui.
    void rig
      .iniciar()
      .then(() => setConectado(rig.conectado))
      .catch(() => setConectado(false))

    // Achado ao vivo em 22/09/2026: o Diagnóstico é uma folha — fecha e
    // desmonta este painel inteiro, e reabrir monta um `PainelDeTestesFisicos`
    // novo, com um `RigDeCracha` novo (`useState` acima). Sem isto, o rig
    // antigo ficava esquecido com a porta ainda aberta pro navegador — nunca
    // desconectado de verdade — e o novo, ao tentar reencontrar essa mesma
    // porta (`iniciar()`, acima), esbarrava nela como "já aberta", igual ao
    // bug do recarregamento que já tinha sido corrigido, só que por um
    // gatilho diferente (fechar a folha, não recarregar a página).
    return () => void rig.desconectar()
  }, [rig])

  useEffect(() => {
    void situacaoDaTurmaDeTeste(repositorio).then(setSituacaoDaTurma)
  }, [repositorio])

  const conectar = async () => {
    setErro(undefined)
    setConectando(true)
    try {
      await rig.conectar()
      setConectado(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setConectando(false)
    }
  }

  const rodar = async () => {
    setErro(undefined)
    setResultados(undefined)
    setRodando(true)
    try {
      const resultado = await rodarSuiteFisica(rig, leitor, setProgresso)
      setResultados(resultado)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRodando(false)
      setProgresso(undefined)
    }
  }

  const preparar = async () => {
    setErro(undefined)
    setPreparando(true)
    try {
      await prepararTurmaDeTeste(repositorio, config)
      window.location.reload()
    } catch (e) {
      setErro((e as Error).message)
      setPreparando(false)
    }
  }

  const rodarAvancado = async () => {
    setErro(undefined)
    setRodandoAvancado(true)
    try {
      const resultado = await rodarCenarioAvancado(rig, repositorio, setProgresso)
      setResultados((antes) => [...(antes ?? []), resultado])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRodandoAvancado(false)
      setProgresso(undefined)
    }
  }

  /**
   * A fila para **assistir**, não para medir: começa depois de alguns
   * segundos, o bastante para fechar o Diagnóstico e ver os nomes entrando na
   * chamada. Quem dispara é o ESP32, que não depende desta tela continuar
   * aberta — fechar a folha desliga a porta serial, e a fila segue.
   */
  const rodarFilaParaAssistir = async () => {
    setErro(undefined)
    try {
      // Os crachás da fila precisam existir antes de ela começar, senão a
      // tela vira um desfile de "de quem é este crachá?" — foi o que
      // aconteceu na bancada de 22/09/2026 quando este modo pulava o passo.
      await cadastrarFilaDeRadio(repositorio, config, 12)
      await rig.fila(12, 900, 400, 6000)
    } catch (e) {
      // Fechar o Diagnóstico derruba a porta antes da resposta chegar: é o
      // esperado neste modo, e não é erro que valha mostrar.
      if (!(e as Error).message.includes('porta')) setErro((e as Error).message)
    }
  }

  const rodarFila = async () => {
    setErro(undefined)
    setRodandoFila(true)
    try {
      const resultado = await rodarFilaDeRadio(rig, repositorio, config, 12, setProgresso)
      setResultados((antes) => [...(antes ?? []), resultado])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRodandoFila(false)
      setProgresso(undefined)
    }
  }

  const rodarComHistorico = async () => {
    setErro(undefined)
    setRodandoHistorico(true)
    try {
      const resultado = await rodarChamadaComHistorico(rig, repositorio, config, setProgresso)
      setResultados((antes) => [...(antes ?? []), resultado])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setRodandoHistorico(false)
      setProgresso(undefined)
    }
  }

  return (
    <Painel
      titulo="Testes físicos com o rig"
      legenda='ESP32-S3 fingindo o dongle de verdade — teclado, ritmo e foco de janela, sem dublê. Ver "ferramentas/rig-de-cracha".'
      recolhivel
    >
      <Linha rotulo="rig">
        <Selo tom={conectado ? 'ok' : 'neutro'}>{conectado ? 'conectado' : 'desconectado'}</Selo>
      </Linha>

      {!conectado && (
        <button disabled={conectando} onClick={() => void conectar()}>
          {conectando ? 'Conectando...' : 'Conectar rig de teste'}
        </button>
      )}

      {conectado && leitorId !== 'dongle' && (
        <p className="vazio">
          Troque o adaptador para &quot;Dongle USB&quot;, acima — só ele recebe teclado de verdade do sistema
          operacional, e é esse caminho que a suíte testa.
        </p>
      )}

      {conectado && leitorId === 'dongle' && (
        <button disabled={rodando} onClick={() => void rodar()}>
          {rodando ? 'Rodando...' : 'Rodar suíte (4 cenários, ~30 s)'}
        </button>
      )}

      {(rodando || rodandoAvancado || rodandoHistorico || rodandoFila) && progresso && <p className="vazio">{progresso}</p>}

      {/* O cenário avançado é uma seção à parte — depende de uma chamada
          aberta, e as outras quatro não. */}
      {situacaoDaTurma === 'outra_sessao_aberta' && (
        <p className="vazio">
          Há uma chamada de verdade aberta agora. O cenário "dois crachás juntos" espera ela encerrar — não
          mexe numa aula que não é de teste.
        </p>
      )}

      {situacaoDaTurma === 'precisa_preparar' && (
        <button disabled={preparando} onClick={() => void preparar()}>
          {preparando ? 'Preparando...' : 'Preparar turma de teste e abrir a chamada'}
        </button>
      )}

      {situacaoDaTurma === 'pronta' && conectado && leitorId === 'dongle' && (
        <button disabled={rodandoAvancado || rodandoHistorico} onClick={() => void rodarAvancado()}>
          {rodandoAvancado ? 'Rodando...' : 'Rodar cenário avançado (dois crachás juntos)'}
        </button>
      )}

      {/* O emulador de rádio, quando é ele do outro lado: uma turma inteira
          passando no dongle de verdade. O rig de HID responde ERR ao FILA,
          que é a resposta certa — o botão aparece igual, e o erro explica. */}
      {situacaoDaTurma === 'pronta' && conectado && leitorId === 'dongle' && (
        <button disabled={rodandoFila || rodandoAvancado || rodandoHistorico} onClick={() => void rodarFila()}>
          {rodandoFila ? 'Rodando...' : 'Rodar fila de 12 pelo rádio (emulador)'}
        </button>
      )}

      {situacaoDaTurma === 'pronta' && conectado && leitorId === 'dongle' && (
        <>
          <button disabled={rodandoFila || rodandoAvancado || rodandoHistorico} onClick={() => void rodarFilaParaAssistir()}>
            Fila de 12 para assistir (começa em 6 s)
          </button>
          <p className="ferramentas__nota">
            Clique, feche o Diagnóstico e olhe a chamada: os nomes entram sozinhos, um a cada 1,3 s.
            O LED pisca depressa durante a contagem. Este modo não confere nada, só mostra.
          </p>
        </>
      )}

      {/* A aula de 22/09 em miniatura: ids ocupados e um sal antigo antes
          dos crachás. É o único cenário que confere a base, e não só o
          leitor — o defeito daquele dia estava depois da leitura. */}
      {situacaoDaTurma === 'pronta' && conectado && leitorId === 'dongle' && (
        <button disabled={rodandoAvancado || rodandoHistorico} onClick={() => void rodarComHistorico()}>
          {rodandoHistorico ? 'Rodando...' : 'Rodar chamada com histórico (22/09)'}
        </button>
      )}

      {erro && (
        <div className="aviso aviso--grave">
          <strong>Não deu.</strong>
          <p>{erro}</p>
        </div>
      )}

      {resultados?.map((r) => (
        <Linha key={r.nome} rotulo={r.nome}>
          <Selo tom={r.aprovado ? 'ok' : 'grave'}>{r.aprovado ? 'passou' : 'falhou'}</Selo>
          {r.detalhe}
        </Linha>
      ))}
    </Painel>
  )
}
