// A casca do app. Não há menu: a rota decorre do estado (ver `nucleo/rota.ts`).
//
// Diagnóstico e Repositório deixaram de ser abas. Viraram folhas, alcançáveis
// pela engrenagem, no canto — quieta quando está tudo bem, e o aviso na tela
// inteira quando não está. Diagnóstico é uma folha à parte, atrás de um link
// discreto dentro de Ajustes: ninguém deve saber que ela existe até precisar
// dela, e cinco painéis de "não é uso do dia a dia" não deveriam pesar na
// primeira vista dos Ajustes de verdade.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { decidirRota } from '../nucleo/rota.ts'
import { calcularUidHash, uidHashSintetico } from '../nucleo/hash.ts'
import { uidInedito, hexParaUid } from '../nucleo/uid.ts'
import { ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { podeApagar } from '../portas/Repositorio.ts'
import { eventoDe, proximoEventoId, quemFalta, type Sessao } from '../nucleo/sessao.ts'
import {
  abrirSozinhoEntreProfessores,
  aulasAgora,
  escolherTurma,
  proximaAulaDeQualquer,
  DIAS,
  type Aula,
} from '../nucleo/grade.ts'
import { saudacao } from '../nucleo/horarios.ts'
import type { Matriculado, Vinculo } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { escolherPasta, pastaDisponivel, permissao } from '../ambiente/pasta.ts'
import {
  aoPoderInstalar,
  conselho,
  dispensarConvite,
  instalarApp,
  podeInstalarApp,
  riscoDeApagar,
} from '../ambiente/instalacao.ts'
import {
  adiarHorario,
  dispensarConselho,
  horariosAdiados,
  dispensarPasta,
  esquecerDispensaDaPasta,
  esquecerPreferencias,
  pastaDispensada,
  cadastroDispensado,
  esquecerDispensaDoCadastro,
  encerradas,
  esquecerEncerramento,
  marcarEncerrada,
  modoDev,
  professorAtual,
  registrarChamadaEncerrada,
} from '../ambiente/preferencias.ts'
import {
  acrescentarNoLog,
  caminhoDosRegistros,
  gravarFaltas,
  repararLog,
  restaurar,
  sincronizar,
} from '../ambiente/sincronia.ts'
import { nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { salvarBinario, salvarTexto } from '../ambiente/arquivos.ts'
import { MANUAL_URL } from '../nucleo/cofre.ts'
import type { EstadoDaPasta } from '../nucleo/rota.ts'
import { TelaAula } from './TelaAula.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { TelaNavegador } from './TelaNavegador.tsx'
import { TelaResumo } from './TelaResumo.tsx'
import { EscolherTurma } from './componentes/EscolherTurma.tsx'
import { Baixar, Cadeado, Engrenagem, Ondas } from './componentes/Simbolos.tsx'
import { Sheet } from './componentes/Sheet.tsx'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import { marcarAte, naoSalvos, totalNaoSalvo, type Pendencia } from '../nucleo/pendencias.ts'
import { useAdsum } from './adsum.ts'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaProblema } from './TelaProblema.tsx'
import { TelaCronograma } from './TelaCronograma.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaColarTurma } from './TelaColarTurma.tsx'
import { ConteudoDePresencas } from './TelaPresencas.tsx'

type Folha = 'ajustes' | 'presencas' | 'diagnostico'

export function Fluxo() {
  const { leitor, repositorio, config } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const [turmas, setTurmas] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [pendentesDaTurma, setPendentesDaTurma] = useState<Matriculado[]>([])
  const [matriculadosTodos, setMatriculadosTodos] = useState<Matriculado[]>([])
  const [professorSemCracha, setProfessorSemCracha] = useState(false)
  const [sessao, setSessao] = useState<Sessao>()
  const [pasta, setPasta] = useState<FileSystemDirectoryHandle>()
  const [estadoDaPasta, setEstadoDaPasta] = useState<EstadoDaPasta>(
    pastaDisponivel() ? 'sem_pasta' : 'indisponivel',
  )
  // Decidido uma vez: reavaliar a cada render faria a tela sumir no meio de um
  // clique. Dispensar troca o estado, não a leitura.
  const [conselhoDoNavegador, setConselho] = useState(conselho)
  const [semPasta, setSemPasta] = useState(pastaDispensada)
  // `cadastroDispensado` era o "sigo sem, por agora" de uma cerimônia que
  // travava a tela. Ela não trava mais nada — abrir sozinho leva direto a
  // `TelaAula`, que já tem saída própria ("Encerrar a chamada"), mesmo com
  // zero presença. Fica como leitura, sem gatilho de UI que a acione: se um
  // dia fizer sentido "não abra sozinho agora" de novo, o lugar já existe.
  const [semCadastro, setSemCadastro] = useState(cadastroDispensado)
  /** Recado das teclas de ensaio. Some sozinho: é resposta a um toque. */
  const [dicaDeEnsaio, setDicaDeEnsaio] = useState<string>()
  /**
   * Recado sobre um crachá lido fora de aula aberta, ou sobre a aula que a
   * grade abriu sozinha. Some sozinho, mesma forma de `dicaDeEnsaio`.
   *
   * Antes, um crachá encostado sem sessão aberta e sem ser o do professor não
   * produzia nada — nem som, nem texto. Quem encostasse ficava sem saber se o
   * leitor estava quebrado ou se aquilo era esperado. E a aula que abre
   * sozinha pela grade trocava a tela inteira sem nenhuma explicação de por
   * que ela mudou sem ninguém tocar em nada.
   */
  const [avisoLeitura, setAvisoLeitura] = useState<string>()
  const [convidarApp, setConvidarApp] = useState(podeInstalarApp)
  const [falhaNaPasta, setFalhaNaPasta] = useState<string>()
  // Sem pasta, isto é a única memória de que existe trabalho fora do disco.
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [proxima, setProxima] = useState<{ turma: string; quando: Date }>()
  /**
   * A turma que a grade identificou como acontecendo agora — a mesma conta
   * de `abrirSozinho`, que decide o auto-abrir do relógio logo abaixo. Não é
   * a mesma conta de `escolherTurma`: aquela tem a degradação "só existe uma
   * turma, abre essa" — boa para um clique deliberado, errada aqui, porque
   * diria "Começar chamada em X" como se o relógio tivesse identificado X,
   * quando na verdade não havia aula nenhuma agora e X só apareceu por ser a
   * única opção. Existia "Sua próxima aula", calculada por `proximaAula` (que olha
   * só o **início** de cada aula): com uma turma em andamento e outra ainda
   * por vir, a que já começou perdia — o início dela já tinha passado — e a
   * tela anunciava uma turma diferente da que o clique abria. Reproduzido de
   * verdade pelo autor: 13:58, dentro do bloco de uma turma, "Sua próxima
   * aula" apontava outra.
   */
  const [comecarEm, setComecarEm] = useState<string>()
  const [semHorario, setSemHorario] = useState<{ turma: string; aulas: Aula[] }>()
  const [uidDoProfessor, setUidDoProfessor] = useState('')
  /** Nome de quem marcou "Sou eu" — personaliza a saudação do repouso. Ver
      `professorAtual`, em `preferencias.ts`. Sem marcação, continua vazio, e
      a saudação segue anônima como sempre foi. */
  const [nomeDoProfessorAtual, setNomeDoProfessorAtual] = useState('')
  const [folha, setFolha] = useState<Folha>()
  /** Resultado de baixar o manual, pelo botão ao lado de "Diagnóstico" —
      ver o comentário perto de onde ele é renderizado. */
  const [recadoManual, setRecadoManual] = useState<string>()
  /**
   * "Estou colando uma turma nova" — a única intenção que ainda precisa de
   * estado próprio. Chamar nomes deixou de ser um modo à parte: com gente
   * pendente, `TelaAula` já mostra a fila sozinha, dentro da própria aula.
   * Colar uma turma nova é diferente — ela ainda não existe, então não há
   * aula nenhuma para abrir até a colagem terminar.
   */
  const [colandoNova, setColandoNova] = useState(false)
  /**
   * Quantas turmas existiam quando "Cadastrar nova turma" foi aberto.
   *
   * Colar salva a turma na hora, e o cronograma pode entrar no meio (turma
   * nova nunca tem horário ainda): sem isto, a tela recém-cadastrada
   * reabriria em branco de novo ao voltar do cronograma, como se nada
   * tivesse sido colado.
   */
  const [turmasAntesDaNova, setTurmasAntesDaNova] = useState(0)
  const [resumo, setResumo] = useState<{ sessao: Sessao; presentes: number }>()
  const [escolhendo, setEscolhendo] = useState<{
    opcoes: string[]
    /** 'manual': o professor pediu para trocar, não é o app perguntando. */
    motivo: 'nenhuma' | 'varias' | 'manual'
    uidHash: string
    em: Date
  }>()

  const ambienteQuebrado = levantarCapacidades().some((c) => c.peso === 'essencial' && !c.presente)
  // Lido uma vez: o modo de ensaio muda pelos Ajustes, e a folha recarrega a
  // página ao trocar — ver `TelaDiagnostico`.
  const ensaio = useMemo(modoDev, [])
  // Com pasta nada fica pendente: cada evento é gravado no ato.
  const porSalvar = pasta ? 0 : totalNaoSalvo(pendencias)

  useEffect(() => leitor.aoMudarEstado((e) => setLendo(e === 'lendo')), [leitor])

  // Fechar a aba com aula por salvar é a forma mais fácil de perder trabalho:
  // um gesto de um segundo, sem confirmação, e a chamada some no prazo do
  // navegador. O `beforeunload` só é registrado quando há algo a perder — um
  // que estivesse sempre ligado viraria ruído e seria ignorado quando importa.
  useEffect(() => {
    if (pasta || pendencias.length === 0) return
    // `preventDefault` é o contrato atual; `returnValue` é o que o WebKit ainda
    // exige, e este aviso existe justamente por causa do Safari.
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pasta, pendencias.length])

  // O `beforeinstallprompt` pode chegar antes ou depois desta montagem, e uma
  // vez só. O ouvinte é de módulo (ver `instalacao.ts`); aqui só se reage.
  useEffect(() => aoPoderInstalar(() => setConvidarApp(podeInstalarApp())), [])

  useEffect(() => {
    if (!dicaDeEnsaio) return
    const relogio = setTimeout(() => setDicaDeEnsaio(undefined), 6000)
    return () => clearTimeout(relogio)
  }, [dicaDeEnsaio])

  useEffect(() => {
    if (!avisoLeitura) return
    const relogio = setTimeout(() => setAvisoLeitura(undefined), 6000)
    return () => clearTimeout(relogio)
  }, [avisoLeitura])

  const recontar = useCallback(async () => {
    const [listaDeTurmas, matriculados, vinculos, aberta, eventos, atual] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
      repositorio.sessaoAberta(),
      repositorio.listarEventos(),
      repositorio.lerConfig(),
    ])
    setSessao(aberta)
    setPendencias(naoSalvos(eventos, atual.exportado))

    // Com a grade abrindo sozinha, o repouso virou espera — e espera sem prazo
    // é ansiedade. Qual turma vem e quando é a única informação que a tela tem
    // para dar, e é a que responde "estou no lugar certo?" sem ninguém pedir.
    //
    // Pode haver mais de um vínculo `papel: 'professor'` na base — mais de um
    // docente cadastrado, ou um sintético convivendo com o real por um
    // instante — e a checagem de horário abaixo olha a grade de **todos**,
    // não só do primeiro que vence a ordem alfabética de `listarVinculos()`.
    // Um `.find` aqui já causou o bug ao vivo: professor cuja turma batia
    // "agora" não aparecia porque o vínculo checado era o de outro docente,
    // sem aula nenhuma naquele horário.
    const vinculosDeProfessor = vinculos.filter((v) => v.papel === 'professor')
    const professor = vinculosDeProfessor[0]
    setUidDoProfessor(professor?.uidHash ?? '')
    const hashAtual = professorAtual()
    setNomeDoProfessorAtual(
      hashAtual ? (vinculos.find((v) => v.uidHash === hashAtual)?.nome ?? '') : '',
    )

    // A primeira turma sem horário que ele ainda não adiou. Uma por vez: a tela
    // pergunta de uma turma, e enfileirar cinco de uma vez seria formulário.
    let todasAsAulas = await repositorio.listarAulas()

    // Autocorreção de uma grade cujo `uidHashProfessor` não bate com **nenhum**
    // vínculo de professor vivo — vazio (grade salva antes de existir crachá
    // de professor, ver o comentário em `aoSalvar` do cronograma, abaixo) ou
    // órfão (apontava pra um vínculo sintético que já foi substituído pelo
    // real, ou apagado em Ajustes). Os dois casos são o mesmo problema: a aula
    // existe, no dia e hora certos, e `aulasAgora`/`proximaAula` comparam hash
    // por igualdade — nada a acha. Assim que existe um professor de verdade,
    // escrever o hash certo por cima é a mesma correção que o cronograma já
    // faz na origem, só que para quem já tinha salvado antes disso existir.
    if (professor) {
      const hashesValidos = new Set(vinculosDeProfessor.map((v) => v.uidHash))
      const quebradas = todasAsAulas.filter((a) => !hashesValidos.has(a.uidHashProfessor))
      if (quebradas.length > 0) {
        for (const aula of quebradas) {
          await repositorio.gravarAula({ ...aula, uidHashProfessor: professor.uidHash })
        }
        todasAsAulas = await repositorio.listarAulas()
      }
    }

    const adiadas = new Set(horariosAdiados())
    const semGrade = listaDeTurmas.find(
      (t) => !adiadas.has(t) && !todasAsAulas.some((a) => a.turma === t),
    )
    setSemHorario(semGrade ? { turma: semGrade, aulas: [] } : undefined)

    const hashesDeProfessor = vinculosDeProfessor.map((v) => v.uidHash)
    const aulas = hashesDeProfessor.length > 0 ? todasAsAulas : []
    const vem =
      hashesDeProfessor.length > 0 ? proximaAulaDeQualquer(aulas, hashesDeProfessor, new Date()) : undefined
    setProxima(vem && { turma: vem.aula.turma, quando: vem.quando })
    // A mesma conta de `abrirSozinhoEntreProfessores` — a mesma que decide o
    // auto-abrir do relógio, acima. Nada de fallback de "só existe uma turma"
    // (isso é só para o clique deliberado, em `abrirComProfessor`): aqui a
    // tela só pode anunciar uma turma se o relógio de fato a identificou, e
    // duas turmas batendo "agora" entre professores diferentes é ambiguidade,
    // não escolha — a função já recusa decidir sozinha. `encerradas()`
    // importa tanto quanto o horário — sem checá-la, encerrar uma aula e
    // voltar ao repouso mostrava "Começar chamada em X" de novo, a mesma
    // turma que acabou de ser fechada, porque o horário dela ainda "bate
    // agora"; a tela prometia reabrir o que o professor acabou de encerrar.
    setComecarEm(
      hashesDeProfessor.length > 0
        ? abrirSozinhoEntreProfessores(aulas, hashesDeProfessor, new Date(), encerradas())
        : undefined,
    )
    const faltando = quemFalta(matriculados, vinculos)
    setTurmas(listaDeTurmas.length)
    setPendentes(faltando.length)
    setPendentesDaTurma(faltando)
    setMatriculadosTodos(matriculados)
    const temProfessor = vinculos.some((v) => v.papel === 'professor')
    setProfessorSemCracha(!temProfessor)
    // A dispensa é "por agora": assim que o professor tem crachá, não há mais
    // o que adiar. Sem isto, o repouso continuaria cobrando um crachá que já
    // existe, só porque a marca ficou de uma visita anterior.
    if (temProfessor) {
      esquecerDispensaDoCadastro()
      setSemCadastro(false)
    }
  }, [repositorio])

  useEffect(() => {
    void recontar()
  }, [recontar])

  // Na volta de uma sessão, a pasta é reencontrada sozinha; só a permissão
  // espera um clique, porque o navegador exige gesto para concedê-la.
  useEffect(() => {
    if (!pastaDisponivel()) return
    void (async () => {
      const guardada = await repositorio.lerPasta()
      if (!guardada) return setEstadoDaPasta('sem_pasta')
      const estado = await permissao(guardada)
      if (estado !== 'granted') return setEstadoDaPasta('sem_permissao')
      setPasta(guardada)
      setEstadoDaPasta('ligada')
    })()
  }, [repositorio])

  // A pasta é a dona: se o cache está vazio e ela tem conteúdo, quem manda é
  // ela. É este caminho que transforma "perdi tudo" em "cliquei de novo".
  useEffect(() => {
    if (!pasta) return
    void (async () => {
      if ((await repositorio.listarVinculos()).length === 0) {
        await restaurar(repositorio, pasta)
      }
      await recontar()
    })()
  }, [pasta, repositorio, recontar])

  // Gravação que falha em silêncio é o pior defeito possível aqui: a aula segue
  // parecendo salva e só se descobre depois. O erro vira estado visível, e o
  // dado continua no cache até o conserto — nada se perde, mas ninguém fica
  // sabendo por acaso.
  const gravarNaPasta = useCallback(async () => {
    if (!pasta) return
    try {
      await sincronizar(repositorio, pasta)
      // A planilha organizada (nome completo, faltas por dia) recalculada e
      // reescrita a cada mudança — a mesma regra de "sem botão de exportar"
      // que já vale para `registros/`. Ver o comentário em `gravarFaltas`.
      await gravarFaltas(repositorio, pasta)
      setFalhaNaPasta(undefined)
    } catch (erro) {
      setFalhaNaPasta((erro as Error).message)
    }
  }, [pasta, repositorio])

  const gravarLinha = useCallback(
    async (evento: Parameters<typeof acrescentarNoLog>[1]) => {
      if (!pasta) return
      try {
        await acrescentarNoLog(pasta, evento)
        setFalhaNaPasta(undefined)
      } catch (erro) {
        setFalhaNaPasta((erro as Error).message)
      }
    },
    [pasta],
  )

  /** Uma cópia do log da turma, para onde o professor quiser. */
  // Devolve como salvou porque a tela do fim precisa disso: o download do
  // Safari acontece sem diálogo nenhum, e sem uma linha na tela o clique não
  // produz sinal algum.
  const salvarCopia = useCallback(
    async (turma: string) => {
      const eventos = await repositorio.listarEventos()
      const daTurma = porTurma([...eventos].reverse()).get(turma) ?? []
      const como = await salvarTexto(nomeDoArquivo(turma), paraCsv(daTurma))

      // Só marca o que de fato saiu. Cancelar o diálogo não pode limpar a
      // pendência — seria o app esquecendo trabalho que continua só aqui.
      const ate = marcarAte(daTurma)
      if (como !== 'cancelado' && ate) {
        await repositorio.marcarExportado(turma, ate)
        await recontar()
      }
      return como
    },
    [repositorio, recontar],
  )


  const consertarPasta = useCallback(async () => {
    if (!pasta) return
    try {
      if ((await permissao(pasta, true)) !== 'granted') {
        return setEstadoDaPasta('sem_permissao')
      }
      await sincronizar(repositorio, pasta)
      await repararLog(repositorio, pasta)
      await gravarFaltas(repositorio, pasta)
      setFalhaNaPasta(undefined)
    } catch (erro) {
      setFalhaNaPasta((erro as Error).message)
    }
  }, [pasta, repositorio])

  const mudou = useCallback(async () => {
    await recontar()
    await gravarNaPasta()
  }, [recontar, gravarNaPasta])

  /**
   * A sessão é única no app inteiro — não por turma. O crachá do professor
   * sempre encerra a que já está aberta, nunca abre outra por cima; quem
   * esquece de encerrar a aula das 8h e chega às 10h vê o próprio crachá
   * "fechar a errada" sem entender por quê. Sem aviso, a segunda turma
   * esperaria em silêncio um crachá que já foi encostado uma vez.
   */
  const avisarSeOutraTurmaEsperava = useCallback(
    async (encerrada: Sessao) => {
      const aulas = await repositorio.listarAulas()
      const outra = aulasAgora(aulas, encerrada.uidHashProfessor, new Date()).find(
        (a) => a.turma !== encerrada.turma,
      )
      if (outra) {
        setAvisoLeitura(
          `A grade diz que ${outra.turma} deveria estar rodando agora. Encoste o crachá de novo para abri-la.`,
        )
      }
    },
    [repositorio],
  )

  const abrirChamada = useCallback(
    async (turma: string, uidHash: string, em: Date, automatico = false) => {
      const [total, vinculo] = await Promise.all([
        repositorio.contarEventos(),
        repositorio.vinculoPorHash(uidHash),
      ])
      const evento = eventoDe(
        { tipo: 'abrir', turma, vinculo },
        {
          eventoId: proximoEventoId(config.instalacaoId, em, total + 1),
          quando: em,
          turma,
          uidHash,
        },
      )
      if (evento) {
        await repositorio.acrescentarEvento(evento)
        await gravarLinha(evento)
      }
      await repositorio.abrirSessao({ turma, abertaEm: em.toISOString(), uidHashProfessor: uidHash })
      tocar('abertura')
      // Sem isto, a tela trocava inteira sem ninguém ter tocado em nada — e
      // quem não sabia que a grade abre aula sozinha lia isso como bug, não
      // como o comportamento pretendido.
      if (automatico) setAvisoLeitura('A grade horária abriu esta aula sozinha.')
      await mudou()
    },
    [repositorio, config.instalacaoId, gravarLinha, mudou],
  )

  /**
   * O relógio e a grade escolhem a turma; só o caso ambíguo vira pergunta.
   *
   * Compartilhado entre os dois jeitos de abrir — o botão e o crachá — porque a
   * regra é a mesma e duplicá-la seria a forma de os dois divergirem sem
   * ninguém notar.
   */
  const abrirComProfessor = useCallback(
    async (uidHash: string, em: Date) => {
      const [aulas, listaDeTurmas] = await Promise.all([
        repositorio.listarAulas(),
        repositorio.listarTurmas(),
      ])
      const escolha = escolherTurma(aulas, listaDeTurmas, uidHash, em)

      if (escolha.tipo === 'sem_turma') return
      if (escolha.tipo === 'perguntar') {
        return setEscolhendo({ opcoes: escolha.opcoes, motivo: escolha.motivo, uidHash, em })
      }
      await abrirChamada(escolha.turma, uidHash, em)
    },
    [repositorio, abrirChamada],
  )

  /**
   * Garante que existe um vínculo de professor, criando um sem crachá se
   * for preciso.
   *
   * "O botão pra começar e o crachá têm que ser equivalentes — passar o
   * crachá é opcional, não pré-requisito." Sem isto, o clique só funcionava
   * depois que alguém já tivesse encostado um crachá real uma vez, o que não
   * é um gesto equivalente — é um atalho que depende do outro ter acontecido
   * primeiro. O vínculo criado aqui é tão de professor quanto qualquer
   * outro: abre e fecha aula, e a grade reconhece ele igual. O nome vem do
   * docente que o SIGAA já apontou, se a turma tiver um.
   *
   * `sintetico: true` marca que este `uidHash` não veio de toque nenhum —
   * sorteado, não lido. Sem a marca, "Vínculos" em Ajustes mostrava esse
   * hash igual a um de verdade, e a leitura era "encostei um crachá e ele
   * tá aqui" quando ninguém tinha encostado nada. Ver o comentário em
   * `Vinculo`, em `nucleo/tipos.ts`.
   */
  const garantirProfessor = useCallback(async (): Promise<Vinculo> => {
    const existente = (await repositorio.listarVinculos()).find((v) => v.papel === 'professor')
    if (existente) return existente

    const docente = (await repositorio.listarMatriculados()).find((m) => m.papel === 'professor')
    const vinculo: Vinculo = {
      uidHash: uidHashSintetico(),
      papel: 'professor',
      nome: docente?.nome ?? 'Professor',
      matricula: docente?.matricula || undefined,
      criadoEm: new Date().toISOString(),
      sintetico: true,
    }
    await repositorio.gravarVinculo(vinculo)
    await mudou()
    return vinculo
  }, [repositorio, mudou])

  /**
   * Abrir sem crachá.
   *
   * O gesto do crachá é herança do aparelho, que não tinha teclado nem mouse —
   * ali era o único jeito de dizer qualquer coisa. Num computador, o clique é
   * mais simples e continua sendo o professor quem clica: a máquina é dele.
   *
   * O crachá continua valendo, para quem está longe do teclado.
   */
  const iniciarChamada = useCallback(async () => {
    const professor = await garantirProfessor()
    await abrirComProfessor(professor.uidHash, new Date())
  }, [garantirProfessor, abrirComProfessor])

  /**
   * "Não é esta, é outra" — a saída para quando `comecarEm` acertou a turma
   * errada (duas turmas bem coladas no horário, uma delas sem grade
   * cadastrada ainda, e por aí vai) ou para quem só quer abrir uma turma
   * fora do horário dela mesmo. Mesma folha de `EscolherTurma` que a
   * ambiguidade automática já usa — motivo `'manual'` porque quem está
   * perguntando aqui é o professor, não o app.
   */
  const aoEscolherOutraTurma = useCallback(async () => {
    const [professor, listaDeTurmas] = await Promise.all([
      garantirProfessor(),
      repositorio.listarTurmas(),
    ])
    setEscolhendo({ opcoes: listaDeTurmas, motivo: 'manual', uidHash: professor.uidHash, em: new Date() })
  }, [garantirProfessor, repositorio])

  // Não se reconta ao ouvir o crachá: a gravação acontece depois, e contar
  // antes dela devolveria a pendência que acabou de deixar de existir. Quem
  // grava avisa, e é isso que faz a tela sair sozinha da cerimônia para o
  // repouso sem ninguém clicar em nada.

  // Fora da coleta, o crachá do professor é o que abre a aula. É o único
  // gesto que a tela de repouso precisa entender — e é o que faz a aula
  // começar sem ninguém tocar em nada.
  useEffect(() => {
    if (sessao) return
    return leitor.aoLer((leitura) => {
      void (async () => {
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        if (vinculo?.papel === 'professor') return await abrirComProfessor(uidHash, leitura.em)
        // Um crachá que não é do professor, encostado sem aula aberta, não
        // tem o que fazer — mas ficar mudo sobre isso é indistinguível de um
        // leitor quebrado. Dizer o que aconteceu é mais barato que a dúvida.
        tocar('desconhecido')
        setAvisoLeitura('Nenhuma aula aberta agora. Peça ao professor para começar.')
      })()
    })
  }, [leitor, repositorio, config, sessao, abrirComProfessor])

  // Ensaio sem hardware: espaço encosta o próximo crachá do baralho, e P
  // encosta o do professor — que é o que abre e fecha a aula. Sem isso, testar
  // o fluxo inteiro exigia caçar a carta certa no baralho.
  //
  // Só existe com leitor simulado e modo de ensaio ligado. Uma tecla que dispara
  // presença não pode estar viva no app publicado: espaço é a tecla que mais se
  // aperta sem querer, e ali ela marcaria alguém presente.
  useEffect(() => {
    if (!ensaio || !ehSimulavel(leitor)) return
    const simulado = leitor

    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null
      const digitando =
        alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.isContentEditable
      if (digitando || evento.metaKey || evento.ctrlKey || evento.altKey) return

      if (evento.code === 'Space') {
        evento.preventDefault()
        try {
          simulado.encostarProximo()
        } catch {
          /* leitor parado: o diagnóstico já diz */
        }
        return
      }

      // Um crachá que o app nunca viu, para exercitar a busca do desconhecido.
      // Sem esta tecla ela era **intestável depois da cerimônia**: o baralho é
      // finito e, cadastrado inteiro, toda carta vira gente conhecida.
      if (evento.key.toLowerCase() === 'n') {
        evento.preventDefault()
        try {
          simulado.simular(uidInedito(simulado.baralho()))
        } catch {
          /* leitor parado: o diagnóstico já diz */
        }
        return
      }

      if (evento.key.toLowerCase() === 'p') {
        evento.preventDefault()
        void (async () => {
          const professor = (await repositorio.listarVinculos()).find(
            (v) => v.papel === 'professor',
          )
          // Antes ele não fazia nada e não dizia nada, e a pergunta certa é a
          // que o autor fez: como `P` seria o crachá do professor se o professor
          // ainda não tem crachá? Não seria. Agora a tecla explica isso em vez
          // de parecer quebrada.
          if (!professor) {
            return setDicaDeEnsaio(
              'Ainda não há crachá de professor. Na cerimônia, chame o nome dele e aperte espaço.',
            )
          }
          // O vínculo guarda o hash, não o UID. O baralho é curto: acha-se qual
          // carta gera aquele hash e encosta ela.
          for (const hex of simulado.baralho()) {
            const hash = await calcularUidHash(config.salHex, hexParaUid(hex))
            if (hash === professor.uidHash) return simulado.simular(hex)
          }
        })()
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ensaio, leitor, repositorio, config.salHex])

  const rota = decidirRota({
    ambienteQuebrado,
    pasta: estadoDaPasta,
    lendo,
    turmas,
    pendentes,
    chamadaAberta: !!sessao,
    professorSemCracha,
    conselharNavegador: !!conselhoDoNavegador,
    turmaSemHorario: semHorario?.turma,
    pastaDispensada: semPasta,
    cadastroDispensado: semCadastro,
  })

  // 'cerimonia' deixou de ser uma tela própria: é o sinal de "abra sozinho",
  // com as mesmas funções que "Começar a chamada" já usa — inclusive
  // sintetizando o crachá do professor se for preciso. A sessão abre, a rota
  // recalcula para 'chamada' no instante seguinte, e é `TelaAula` — com a
  // turma inteira pendente — quem aparece, não uma tela à parte.
  useEffect(() => {
    if (rota === 'cerimonia') void iniciarChamada()
  }, [rota, iniciarChamada])

  // Sai da colagem assim que a turma colada é salva — ver o comentário de
  // `turmasAntesDaNova`. Sem isto, voltar do cronograma da turma recém
  // criada reabria a colagem em branco, como se a lista nunca tivesse sido
  // colada.
  useEffect(() => {
    if (colandoNova && turmas > turmasAntesDaNova) setColandoNova(false)
  }, [colandoNova, turmas, turmasAntesDaNova])

  const naColagem = rota === 'turma' || (rota === 'pronto' && colandoNova)

  /**
   * O que está na tela, para depuração — só em modo de ensaio.
   *
   * `rota` sozinha não basta: `resumo`, `escolhendo`, `colandoNova` e `folha`
   * são sobreposições que vivem fora de `decidirRota`, em estado local daqui.
   * É possível estar em `rota === 'pronto'` com `TelaResumo` na tela, e uma
   * etiqueta que mostrasse só a rota mentiria nesse caso. A ordem aqui segue
   * a ordem em que o JSX abaixo de fato decide o que aparece.
   */
  const camadas = [
    rota,
    colandoNova && 'colando turma nova',
    escolhendo && 'escolhendo turma',
    resumo && 'resumo aberto',
    folha && `folha: ${folha}`,
  ]
    .filter(Boolean)
    .join(' · ')

  /**
   * A grade abre a aula sozinha.
   *
   * É o fim da linha do "menos decisões": com o horário cadastrado, o professor
   * entra na sala e a chamada já está aberta — nem clique, nem crachá. As
   * recusas que tornam isso seguro estão em `abrirSozinho`.
   *
   * Um relógio de 30 s, e não só na montagem: a aula que começa com o app
   * aberto na mesa precisa abrir sem ninguém tocar em nada, que é o ponto.
   *
   * **Encerrar continua sendo do professor.** Abrir cedo demais não custa nada
   * — ninguém está encostando crachá —, mas fechar cedo demais custa um aluno.
   * Automatizar só o lado barato do erro.
   */
  useEffect(() => {
    if (sessao || rota !== 'pronto') return

    const olhar = async () => {
      const [aulas, vinculos] = await Promise.all([
        repositorio.listarAulas(),
        repositorio.listarVinculos(),
      ])
      // Mesma correção de `recontar()`: olha a grade de todos os vínculos de
      // professor, não só do primeiro — senão a aula de um docente que perde
      // o `.find` nunca abre sozinha.
      const hashesDeProfessor = vinculos.filter((v) => v.papel === 'professor').map((v) => v.uidHash)
      if (hashesDeProfessor.length === 0) return

      const agora = new Date()
      const turma = abrirSozinhoEntreProfessores(aulas, hashesDeProfessor, agora, encerradas())
      if (!turma) return
      // O hash de quem abre precisa ser o do professor **dono** desta turma,
      // não um qualquer entre os vários — é ele quem a sessão registra como
      // podendo encerrar.
      const aula = aulas.find((a) => a.turma === turma && hashesDeProfessor.includes(a.uidHashProfessor))
      if (aula) await abrirChamada(turma, aula.uidHashProfessor, agora, true)
    }

    void olhar()
    const relogio = setInterval(() => void olhar(), 30_000)
    return () => clearInterval(relogio)
  }, [sessao, rota, repositorio, abrirChamada])

  const ligarPasta = async (escolhendo: boolean) => {
    const handle = escolhendo ? await escolherPasta() : await repositorio.lerPasta()
    if (!handle) return
    if ((await permissao(handle, true)) !== 'granted') return setEstadoDaPasta('sem_permissao')
    await repositorio.guardarPasta(handle)
    // Ele mudou de ideia: a dispensa some junto, senão o app seguiria achando
    // que ele não quer pasta enquanto grava numa.
    esquecerDispensaDaPasta()
    setSemPasta(false)
    setPasta(handle)
    setEstadoDaPasta('ligada')
  }

  return (
    <>
      {/* Uma folha (Ajustes, Presenças, Diagnóstico) cobre a tela, mas o que
          está por baixo continuava montado — inclusive para quem navega por
          leitor de tela ou teclado, que podia cair num botão coberto pelo
          vidro. Ficou visível quando "Ver presenças" passou a existir nas
          duas camadas ao mesmo tempo: duas opções com o mesmo nome, uma
          delas inalcançável. `aria-hidden` tira o fundo da árvore de
          acessibilidade enquanto a folha estiver aberta — o clique já não
          chegava lá, por causa do `folha__fundo`; agora a busca por nome
          também não. */}
      <div aria-hidden={folha ? true : undefined}>
      {rota === 'problema' && (
        <TelaProblema aoAbrirAjustes={() => setFolha('ajustes')} sessao={sessao} />
      )}
      {rota === 'pasta' && (
        <TelaPasta
          precisaDePermissao={estadoDaPasta === 'sem_permissao'}
          aoEscolher={() => void ligarPasta(true)}
          aoLiberar={() => void ligarPasta(false)}
          aoDispensar={() => {
            dispensarPasta()
            setSemPasta(true)
          }}
        />
      )}
      {rota === 'navegador' && conselhoDoNavegador && (
        <TelaNavegador
          conselho={conselhoDoNavegador}
          aoDispensar={() => {
            dispensarConselho()
            setConselho(undefined)
          }}
        />
      )}
      {rota === 'cronograma' && semHorario && (
        <TelaCronograma
          turma={semHorario.turma}
          aulas={semHorario.aulas}
          uidHashProfessor={uidDoProfessor}
          aoSalvar={(novas) => {
            void (async () => {
              // A grade é indexada pelo professor — e o cronograma aparece
              // **antes** de existir qualquer crachá dele (é a primeira turma
              // colada, o repouso ainda nem existe). `uidHashProfessor` chega
              // vazio nesse instante, e as aulas eram salvas com ele. O vazio
              // nunca se reconciliava sozinho com o vínculo criado depois —
              // sintético, ao clicar "Começar a chamada", ou de um crachá de
              // verdade — porque são hashes diferentes: `aulasAgora` compara
              // por igualdade e nunca achava a aula certa, mesmo no horário
              // certo. `garantirProfessor` já resolve exatamente isso para o
              // botão de iniciar; usar o mesmo aqui fecha o mesmo buraco na
              // origem, não só quando o professor aparece depois.
              const professor = await garantirProfessor()
              const comProfessorCerto = novas.map((a) => ({
                ...a,
                uidHashProfessor: professor.uidHash,
              }))
              await repositorio.definirHorarioDaTurma(semHorario.turma, comProfessorCerto)
              // Salvar sem marcar nada é o mesmo que adiar: sem isto a tela
              // voltaria na hora, porque a turma continua sem horário.
              if (novas.length === 0) adiarHorario(semHorario.turma)
              await mudou()
            })()
          }}
          aoPular={() => {
            adiarHorario(semHorario.turma)
            void recontar()
          }}
        />
      )}
      {naColagem && (
        <TelaColarTurma
          aoMudarBase={mudou}
          // Só existe quando há repouso pra onde voltar: com `turmas === 0`
          // esta tela é a única que existe, e cancelar não levaria a lugar
          // nenhum.
          aoSair={
            rota === 'turma'
              ? undefined
              : () => setColandoNova(false)
          }
        />
      )}
      {rota === 'chamada' && sessao && (
        <TelaAula
          sessao={sessao}
          pendentes={pendentesDaTurma.filter((p) => p.turma === sessao.turma)}
          daTurma={matriculadosTodos.filter((p) => p.turma === sessao.turma)}
          aoMudarBase={mudou}
          aoRegistrar={gravarLinha}
          aoEncerrar={(presentes, duracaoMs, intervalos) => {
            // Sem esta marca o relógio reabriria a aula que acabou de fechar.
            marcarEncerrada(sessao.turma, new Date().toISOString())
            setResumo({ sessao, presentes })
            // Diagnóstico, não a tela de fim de aula: é dado para calibrar
            // `INTERVALO_MINIMO_MS`, não algo que toda aula precisa mostrar.
            registrarChamadaEncerrada({
              turma: sessao.turma,
              encerradaEm: new Date().toISOString(),
              duracaoMs,
              intervalos,
            })
            void avisarSeOutraTurmaEsperava(sessao)
          }}
        />
      )}
      {escolhendo && (
        <EscolherTurma
          opcoes={escolhendo.opcoes}
          motivo={escolhendo.motivo}
          aoDesistir={() => setEscolhendo(undefined)}
          aoEscolher={(turma) => {
            const pedido = escolhendo
            setEscolhendo(undefined)
            void abrirChamada(turma, pedido.uidHash, pedido.em)
          }}
          aoNovaTurma={() => {
            setEscolhendo(undefined)
            setTurmasAntesDaNova(turmas)
            setColandoNova(true)
          }}
        />
      )}

      {resumo && (
        <TelaResumo
          sessao={resumo.sessao}
          presentes={resumo.presentes}
          arquivo={pasta ? `${pasta.name} ▸ ${caminhoDosRegistros(resumo.sessao.turma)}` : undefined}
          aoSalvarCopia={() => salvarCopia(resumo.sessao.turma)}
          aoConcluir={() => setResumo(undefined)}
          aoReabrir={() => {
            void (async () => {
              // A marca de encerrada some junto, senão o relógio da grade
              // entenderia que esta aula já acabou e não reabriria nada.
              esquecerEncerramento(resumo.sessao.turma)
              await abrirChamada(
                resumo.sessao.turma,
                resumo.sessao.uidHashProfessor,
                new Date(),
              )
              setResumo(undefined)
            })()
          }}
        />
      )}

      {!resumo && rota === 'pronto' && !colandoNova && (
        <Repouso
          turmas={turmas}
          pendencias={pasta ? [] : pendencias}
          nomeDoProfessor={nomeDoProfessorAtual}
          comecarEm={comecarEm}
          proxima={proxima}
          aoIniciar={() => void iniciarChamada()}
          aoEscolherOutra={() => void aoEscolherOutraTurma()}
          aoSalvar={(turma) => void salvarCopia(turma)}
          aoVerPresencas={() => setFolha('presencas')}
          aoNovaTurma={() => {
            setTurmasAntesDaNova(turmas)
            setColandoNova(true)
          }}
        />
      )}

      {falhaNaPasta && (
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            {falhaNaPasta}. Nada se perdeu: está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button onClick={() => void consertarPasta()}>Gravar de novo</button>
        </div>
      )}

      {/* Engrenagem no canto superior direito, fixa, sempre no mesmo lugar.
          Diagnóstico e base são ferramentas de quem conserta, não de quem dá
          aula — como botões visíveis convidavam ao clique sem querer, e uma
          delas trocava o sal.

          O aviso ao lado **não é botão**: com a engrenagem a oito pixels dele,
          dois caminhos para o mesmo lugar só fazem duvidar de qual é o certo.
          Ele informa; ela abre. */}
      {/* Fora de qualquer tela, de propósito.
          Ele morava só no repouso, e quem abre o Adsum pela primeira vez vai de
          "escolha a pasta" para "cole sua primeira turma" para a cerimônia — pode levar
          uma aula inteira até parar no repouso, e o convite chegava tarde ou
          nunca. Um convite que depende de a pessoa passar por uma tela
          específica é um convite que não existe.

          Some durante a chamada: ali a tela é da fila, e nada mais. */}
      {convidarApp && rota !== 'chamada' && (
        <div className="convite">
          <span className="convite__icone" aria-hidden="true">
            <Baixar />
          </span>
          <span className="convite__texto">
            <strong>O Adsum em janela própria</strong>
            <small>Abre num clique, sem procurar entre as abas</small>
          </span>
          <span className="convite__acoes">
            <button
              className="botao--quieto"
              onClick={() => {
                dispensarConvite()
                setConvidarApp(false)
              }}
            >
              Agora não
            </button>
            <button
              className="botao--acento"
              onClick={() => void instalarApp().finally(() => setConvidarApp(false))}
            >
              Instalar
            </button>
          </span>
        </div>
      )}

      {dicaDeEnsaio && <p className="dica-ensaio">{dicaDeEnsaio}</p>}
      {avisoLeitura && <p className="aviso-leitura">{avisoLeitura}</p>}

      <div className="canto">
        {(falhaNaPasta || porSalvar > 0 || !lendo || !pasta) && (
          <span
            className={
              falhaNaPasta || porSalvar > 0 ? 'selo-status selo-status--grave' : 'selo-status'
            }
          >
            {pasta || falhaNaPasta || porSalvar > 0 ? (
              <span
                className={
                  falhaNaPasta || porSalvar > 0 ? 'ponto ponto--grave' : 'ponto ponto--alerta'
                }
              />
            ) : (
              <Cadeado />
            )}
            {falhaNaPasta
              ? 'A pasta não recebeu a gravação'
              : // Trabalho que só existe aqui vence os avisos de condição: os
                // outros descrevem o navegador, este descreve uma aula em risco.
                porSalvar > 0
                ? `${porSalvar} ${porSalvar === 1 ? 'registro ainda não salvo' : 'registros ainda não salvos'}`
                : !lendo
                  ? 'Nenhum leitor ativo'
                  : estadoDaPasta === 'indisponivel'
                    ? riscoDeApagar()
                      ? 'Sem pasta. O Safari pode apagar a base sozinho'
                      : 'Sem pasta neste navegador. Exporte uma cópia'
                    : 'Os dados só existem neste navegador'}
          </span>
        )}

        {/* As teclas de ensaio, e **o que cada uma faz aqui**.
            O `N` produz um crachá desconhecido em qualquer tela: cadastra
            direto se houver alguém chamado (modo de chamar nomes), ou abre a
            busca se não houver (modo comum, o padrão) — ver `decidir()`, em
            `nucleo/sessao.ts`. `TelaAula` não expõe isso a `Fluxo`, então a
            dica aqui descreve os dois em vez de escolher qual vale agora. */}
        {ensaio && ehSimulavel(leitor) && (
          <span className="selo-status" title="Modo de ensaio, com leitor simulado">
            <kbd>espaço</kbd> crachá
            {rota === 'chamada' ? (
              <>
                {' · '}
                <kbd>N</kbd> crachá novo
              </>
            ) : null}
            {' · '}
            <kbd>P</kbd> professor
          </span>
        )}

        {/* A rota nunca aparecia em lugar nenhum — nem aqui, nem no
            diagnóstico. Sem isso, "por que a tela está assim" só se responde
            lendo código. Fica atrás do ensaio pelo mesmo motivo das teclas:
            é ferramenta de quem testa, e o professor de verdade nunca deve
            ver estado interno na tela — é a regra de "nenhuma configuração à
            vista" deste projeto. */}
        {ensaio && (
          <span className="selo-status" title="Estado da rota, para depuração">
            {camadas}
          </span>
        )}

        <button
          className="engrenagem"
          onClick={() => setFolha('ajustes')}
          aria-label="Ajustes"
          title="Ajustes"
        >
          <Engrenagem />
        </button>
      </div>
      </div>

      {/* Uma folha só, não três — ver o comentário em `folha`, no topo do
          arquivo. Ajustes → Presenças (o card "Ver presenças") e Ajustes →
          Diagnóstico trocavam de `<Sheet>` inteiro: a folha antiga desmontava
          e a nova montava do zero, e a animação de fundo (`.folha__fundo`,
          que escurece e borra) recomeçava do transparente — por um instante
          a tela de baixo reaparecia, sem escurecimento nenhum, antes do novo
          fundo terminar de entrar. Uma única `<Sheet>` persistente, com só o
          conteúdo trocando por dentro, tira esse instante: o fundo nunca
          desmonta entre as três, só a primeira abertura (vindo de nenhuma
          folha) toca a entrada. */}
      {folha && (
        <Sheet
          titulo={folha === 'ajustes' ? 'Ajustes' : folha === 'presencas' ? 'Presenças' : 'Diagnóstico'}
          aoFechar={() => setFolha(undefined)}
          cheia={folha === 'presencas'}
        >
          {folha === 'ajustes' && (
            <>
              <TelaRepositorio
                pasta={pasta}
                aoTrocarPasta={() => void ligarPasta(true)}
                aoResetar={
                  podeApagar(repositorio)
                    ? async () => {
                        await repositorio.apagarTudo()
                        await repositorio.esquecerPasta()
                        esquecerPreferencias()
                        // Recarrega em vez de reconstruir o estado à mão: são doze
                        // pedaços de estado nesta tela, e "meio zerado" é o defeito
                        // que este botão existe para não produzir.
                        location.reload()
                      }
                    : undefined
                }
                aoDesconectarPasta={async () => {
                  await repositorio.esquecerPasta()
                  setPasta(undefined)
                  setEstadoDaPasta(pastaDisponivel() ? 'sem_pasta' : 'indisponivel')
                  setFalhaNaPasta(undefined)
                  // Sem dispensar, a rota mandaria escolher pasta na hora — e
                  // desconectar viraria um laço com a tela que pede uma.
                  dispensarPasta()
                  setSemPasta(true)
                }}
                aoRelerPasta={async () => {
                  const resumo = await restaurar(repositorio, pasta!)
                  await recontar()
                  return resumo
                }}
                aoVerPresencas={() => setFolha('presencas')}
              />
              {/* Rodapé dos Ajustes: dois links quietos, separados do resto
                  por não serem uso do dia a dia. Diagnóstico virou folha
                  própria — ver o comentário no topo do arquivo — e o manual
                  mora aqui pelo mesmo motivo: nenhum dos dois compete por
                  atenção com trocar a pasta ou corrigir a grade. */}
              <div className="ajustes__rodape">
                <button
                  className="botao--quieto"
                  onClick={() => {
                    setRecadoManual(undefined)
                    void (async () => {
                      try {
                        const resposta = await fetch(MANUAL_URL)
                        if (!resposta.ok) {
                          throw new Error(
                            `sem internet ou o arquivo mudou de lugar (HTTP ${resposta.status}). Baixe direto em ${MANUAL_URL}`,
                          )
                        }
                        const salvou = await salvarBinario(
                          'Adsum-manual-e-LGPD.docx',
                          await resposta.blob(),
                        )
                        setRecadoManual(
                          salvou === 'cancelado'
                            ? undefined
                            : salvou === 'gravado'
                              ? 'Manual gravado.'
                              : 'Manual foi para a pasta de downloads. Este navegador não tem File System Access.',
                        )
                      } catch (erro) {
                        setRecadoManual((erro as Error).message)
                      }
                    })()
                  }}
                >
                  Manual e LGPD
                </button>
                <button className="botao--quieto" onClick={() => setFolha('diagnostico')}>
                  Diagnóstico
                </button>
              </div>
              {recadoManual && <p className="ferramentas__nota">{recadoManual}</p>}
            </>
          )}
          {folha === 'presencas' && <ConteudoDePresencas nomeDaPasta={pasta?.name} />}
          {folha === 'diagnostico' && <TelaDiagnostico />}
        </Sheet>
      )}
    </>
  )
}

/**
 * O repouso é onde o professor cai depois de encerrar — e por isso é o único
 * lugar onde uma aula esquecida pode ser lembrada. Antes daqui, "concluir sem
 * salvar" fazia a pendência sumir da tela e da memória do app ao mesmo tempo.
 *
 * A pendência empurra o "encoste o crachá" para baixo de propósito: enquanto
 * houver aula só neste navegador, ela é a tarefa da tela, e não um rodapé.
 */
export function Repouso({
  turmas,
  pendencias,
  nomeDoProfessor,
  comecarEm,
  proxima,
  aoIniciar,
  aoEscolherOutra,
  aoSalvar,
  aoVerPresencas,
  aoNovaTurma,
}: {
  turmas: number
  pendencias: Pendencia[]
  /** De "Sou eu", na chamada — ver `professorAtual`, em `preferencias.ts`.
      Vazio sem marcação: a saudação continua anônima, como sempre foi. */
  nomeDoProfessor?: string
  /** A turma que "Começar a chamada" abriria agora — ver o comentário em
      `Fluxo`, onde é calculada. Quando existe, a tela nunca mais anuncia uma
      turma diferente da que o clique vai abrir. */
  comecarEm?: string
  proxima?: { turma: string; quando: Date }
  aoIniciar: () => void
  /** "Não é esta, é outra" — só existe junto de `comecarEm`. */
  aoEscolherOutra: () => void
  aoSalvar: (turma: string) => void
  aoVerPresencas: () => void
  aoNovaTurma: () => void
}) {
  const dia = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  /** "hoje às 08:00", "amanhã às 10:00", "segunda às 10:00". */
  function quandoPorExtenso(quando: Date): string {
    const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const meiaNoite = (d: Date) => new Date(d).setHours(0, 0, 0, 0)
    const dias = Math.round((meiaNoite(quando) - meiaNoite(new Date())) / 86_400_000)
    if (dias === 0) return `hoje às ${hora}`
    if (dias === 1) return `amanhã às ${hora}`
    return `${DIAS[quando.getDay()]} às ${hora}`
  }

  return (
    <section className="repouso">
      {pendencias.length > 0 && (
        <div className="porsalvar">
          <p className="porsalvar__titulo">
            {pendencias.length === 1
              ? 'Uma aula existe só neste navegador'
              : `${pendencias.length} aulas existem só neste navegador`}
          </p>
          {pendencias.map((p) => (
            <div className="porsalvar__linha" key={p.turma}>
              <span className="porsalvar__turma">
                <strong>{p.turma}</strong>
                <span className="porsalvar__apoio">
                  {p.quantos} {p.quantos === 1 ? 'registro' : 'registros'} desde {dia(p.desde)}
                </span>
              </span>
              <button className="botao--acento" onClick={() => aoSalvar(p.turma)}>
                Salvar
              </button>
            </div>
          ))}
        </div>
      )}

      <Ondas tamanho={72} animado />

      {comecarEm ? (
        <>
          {/* "Começar chamada em", não "Sua próxima aula": a turma aqui é a
              mesma que o botão abaixo vai abrir, sempre — nunca uma dita e
              outra aberta. */}
          <p className="repouso__turma">Começar chamada em</p>
          <p className="repouso__acao">{comecarEm}</p>
        </>
      ) : proxima ? (
        <>
          {/* Com grade, a turma é o assunto e a hora é o apoio: é a ordem em
              que a pergunta se forma na cabeça de quem olha — "qual aula?" vem
              antes de "que horas?". Só chega aqui quando nem `comecarEm` sabe
              dizer sozinho — duas turmas bem coladas no horário, por
              exemplo —, então a hora é a única pista extra que ajuda. */}
          <p className="repouso__turma">Sua próxima aula</p>
          <p className="repouso__acao">{proxima.turma}</p>
          <p className="repouso__quando">{quandoPorExtenso(proxima.quando)}</p>
        </>
      ) : (
        <>
          {/* Sem próxima aula conhecida — sem grade, ou grade que já acabou
              por hoje —, "Tudo pronto" soava a convite pro crachá quando não
              há aula nenhuma por perto. Um cumprimento é o que cabe fora do
              horário, e continua sendo hora do dia mesmo sem grade nenhuma
              cadastrada. */}
          <p className="repouso__turma">
            {/* Só o primeiro nome — "Bom dia, Paulo", não o nome de tela
                inteiro. Sem "Sou eu" marcado, continua anônima: ninguém
                pediu, ninguém decide por ele. */}
            {nomeDoProfessor ? `${saudacao(new Date())}, ${nomeDoProfessor.split(' ')[0]}` : saudacao(new Date())}
          </p>
          <p className="repouso__acao">
            {turmas === 1 ? 'Sua turma está cadastrada' : `${turmas} turmas cadastradas`}
          </p>
        </>
      )}

      {comecarEm ? (
        <>
          <button className="botao--acento pasta__botao" onClick={aoIniciar}>
            Começar a chamada agora
          </button>
          {/* Terciário, e só aparece quando há uma turma nomeada acima pra
              corrigir — sem isso não havia como dizer "não é esta" sem
              esperar o horário dela passar sozinho. */}
          <button className="repouso__link botao--quieto" onClick={aoEscolherOutra}>
            Chamada em outra turma
          </button>
        </>
      ) : proxima ? (
        // Com grade e aula à vista, o gesto óbvio é abrir a chamada — a
        // pergunta "quero ver presença" pode esperar a aula acabar.
        <button className="botao--acento pasta__botao" onClick={aoIniciar}>
          Começar a chamada agora
        </button>
      ) : (
        <>
          {/* Fora do horário, "Começar a chamada" deixou de ser o convite:
              o software sabe que não há aula agora, e sugerir mesmo assim
              era empurrar pro crachá numa hora em que ele não faz sentido.
              "Ver presenças" — a pergunta mais comum fora de aula — vira o
              acento; começar continua possível, só que quieto, para
              reposição ou aula fora do horário cadastrado. */}
          <button className="botao--acento pasta__botao" onClick={aoVerPresencas}>
            Ver presenças
          </button>
          <button className="repouso__link botao--quieto" onClick={aoIniciar}>
            Começar a chamada
          </button>
        </>
      )}
      {/* O crachá continua abrindo, e a tela **não** diz isso. Anunciar dois
          caminhos para a mesma coisa é a decisão que se queria evitar: quem lê
          "ou encoste o crachá" para para escolher, e escolher é o custo. Quem
          precisa do atalho descobre encostando.

          "Cadastrar mais um crachá" saiu daqui: com a cerimônia unificada à
          chamada, "Começar a chamada" já abre a turma certa (pelo horário, ou
          perguntando quando ambíguo) e a fila de pendentes aparece sozinha se
          houver alguém. Manter os dois botões seria a mesma redundância que
          este app já cortou noutro lugar. */}

      {/* Terciário, e por isso quieto. Sem isto não havia como começar uma
          turma nova depois da primeira: a tela de colar só aparecia com
          `turmas === 0`. */}
      <button className="repouso__link botao--quieto" onClick={aoNovaTurma}>
        Cadastrar nova turma
      </button>
    </section>
  )
}

