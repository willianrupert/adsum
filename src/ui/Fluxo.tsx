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
import { calcularUidHash, saisConhecidos, uidHashSintetico } from '../nucleo/hash.ts'
import { uidInedito, hexParaUid } from '../nucleo/uid.ts'
import { ehQueRecusa, ehSimulavel, type Recusa } from '../portas/LeitorDeCracha.ts'
import { IndicadorDoLeitor } from './IndicadorDoLeitor.tsx'
import { gravarEventoNovo, gravarMarcasPendentes, identificarCracha, podeApagar } from '../portas/Repositorio.ts'
import { curto, ligarDiario, registrar } from '../ambiente/diario.ts'
import { anotarUid } from '../ambiente/auditoriaDeUids.ts'
import { eventoDe, quemFalta, type Sessao } from '../nucleo/sessao.ts'
import { diaLocal } from '../nucleo/faltas.ts'
import {
  abrirSozinhoEntreProfessores,
  aulasAgora,
  proximaAulaDeQualquer,
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
  marcarVersaoDeNovidadeVista,
  modoDev,
  professorAtual,
  registrarChamadaEncerrada,
  versaoDeNovidadeVista,
  auditoriaDeUidsLigada,
} from '../ambiente/preferencias.ts'
import { NOVIDADES } from '../nucleo/novidades.ts'
import {
  acrescentarNoLog,
  caminhoDosRegistros,
  conferirLog,
  gravarFaltas,
  repararLog,
  lembrarSaisDaPasta,
  restaurar,
  sincronizar,
} from '../ambiente/sincronia.ts'
import { nomeDoArquivo, paraCsv, porTurma } from '../nucleo/csv.ts'
import { salvarBinario, salvarTexto } from '../ambiente/arquivos.ts'
import { MANUAL_URL, REPOSITORIO_URL } from '../nucleo/cofre.ts'
import type { EstadoDaPasta } from '../nucleo/rota.ts'
import { TelaAula } from './TelaAula.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { TelaNavegador } from './TelaNavegador.tsx'
import { TelaResumo } from './TelaResumo.tsx'
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

/** Duas frases curtas e sem travessão, que é a voz de tela deste app. */
function mensagemDeRecusa(recusa: Recusa): string {
  return recusa.motivo === 'ritmo'
    ? 'Uma leitura chegou devagar demais e foi recusada. Encoste o crachá de novo.'
    : 'Uma leitura chegou, mas não parece um crachá. Encoste o crachá de novo.'
}

export function Fluxo() {
  const { leitor, repositorio, config, recarregarConfig } = useAdsum()

  const [lendo, setLendo] = useState(leitor.estado() === 'lendo')
  const [turmas, setTurmas] = useState(0)
  /** Nomes de verdade, não só a contagem — precisa pra andar entre elas
      com seta na tela de repouso. Ver `turmaSugerida`/`turmaSelecionada`,
      abaixo. */
  const [listaDeTurmas, setListaDeTurmas] = useState<string[]>([])
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
  /** Retorno de "o leitor leu" no repouso: o teste que o professor faz antes
      de a aula começar, encostando um crachá só para ver. */
  const [leituraOk, setLeituraOk] = useState<string>()
  /** Resumo da versão mais nova de `nucleo/novidades.ts`, quando ainda não
      vista neste navegador. Some sozinho, mesma forma de `dicaDeEnsaio`. */
  const [novidade, setNovidade] = useState<string>()
  const [convidarApp, setConvidarApp] = useState(podeInstalarApp)
  const [falhaNaPasta, setFalhaNaPasta] = useState<string>()
  // Sem pasta, isto é a única memória de que existe trabalho fora do disco.
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  /**
   * O relógio da tela de repouso, de minuto em minuto. A grade (`proxima`,
   * `comecarEm`) é conta sobre **agora**, e era feita só quando a base
   * mudava: com o app aberto desde antes da aula, o ponto azul de "é agora"
   * nunca acendia, porque nada relia a grade quando a hora chegava
   * (22/09/2026).
   */
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(relogio)
  }, [])
  /** A grade e os professores dela, como `recontar` os leu da base. */
  const [grade, setGrade] = useState<{ aulas: Aula[]; hashes: string[] }>({ aulas: [], hashes: [] })
  const proxima = useMemo(() => {
    if (grade.hashes.length === 0) return undefined
    const vem = proximaAulaDeQualquer(grade.aulas, grade.hashes, agora)
    return vem && { turma: vem.aula.turma, quando: vem.quando }
  }, [grade, agora])
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
  // A mesma conta de `abrirSozinhoEntreProfessores`. Nada de fallback de "só
  // existe uma turma" (isso é só para o clique deliberado, em
  // `abrirComProfessor`): a tela só anuncia uma turma se o relógio de fato a
  // identificou, e duas turmas batendo "agora" entre professores diferentes é
  // ambiguidade, não escolha. `encerradas()` importa tanto quanto o horário —
  // sem checá-la, encerrar uma aula e voltar ao repouso mostrava "Começar
  // chamada em X" de novo, a mesma turma que acabou de ser fechada.
  const comecarEm = useMemo(
    () =>
      grade.hashes.length > 0
        ? abrirSozinhoEntreProfessores(grade.aulas, grade.hashes, agora, encerradas())
        : undefined,
    [grade, agora],
  )
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

  /**
   * Turma e hora que a tela de repouso mostra — a mesma lógica de seta de
   * "Chamar nomes" (`TelaAula`), só que pra escolher a turma em vez de um
   * aluno. Substitui a tela "Qual turma?" (`EscolherTurma`): não existe
   * mais pergunta separada, a resposta já está na tela, navegável, e Enter
   * (ou o crachá do professor) abre a chamada na turma e hora que estiverem
   * ali — nunca uma coisa dita e outra aberta.
   *
   * A grade continua como recomendação, não porta de entrada: `comecarEm`
   * (bate agora) e `proxima` (a próxima do dia) só decidem a **sugestão**
   * inicial, abaixo — o professor pode trocar com a seta a qualquer momento,
   * pra qualquer turma cadastrada, sem a grade interferir.
   */
  const [turmaSelecionada, setTurmaSelecionada] = useState<string>()
  const turmaSugerida = useMemo(() => {
    if (comecarEm) return comecarEm
    if (proxima) return proxima.turma
    // Sem sugestão da grade: a turma fechada mais recentemente — o
    // professor provavelmente vai voltar a ela — e, sem nenhuma fechada
    // ainda, a primeira em ordem alfabética.
    const fechamentos = Object.entries(encerradas()).sort((a, b) => b[1].localeCompare(a[1]))
    const maisRecente = fechamentos.find(([turma]) => listaDeTurmas.includes(turma))?.[0]
    if (maisRecente) return maisRecente
    return [...listaDeTurmas].sort((a, b) => a.localeCompare(b, 'pt-BR'))[0]
  }, [comecarEm, proxima, listaDeTurmas])

  // Sozinha na sugestão até o professor mexer na seta — e volta a seguir a
  // sugestão se a turma escolhida deixar de existir (turma excluída).
  useEffect(() => {
    if (turmaSelecionada && listaDeTurmas.includes(turmaSelecionada)) return
    setTurmaSelecionada(turmaSugerida)
  }, [turmaSugerida, listaDeTurmas, turmaSelecionada])

  /**
   * O dia da chamada — editável, para lançar a aula de um dia em que ela não
   * foi feita. Só o dia, sem hora: no SIGAA é uma chamada por turma por dia,
   * e é assim que `TelaAula` conta (22/09/2026). A hora escolhida à mão não
   * mudava nada que alguém fosse ler, e era um campo a mais para errar.
   * `undefined` é hoje, e continua sendo hoje se a tela ficar aberta além
   * da meia-noite.
   */
  const [diaEscolhido, setDiaEscolhido] = useState<string>()
  const hoje = diaLocal(agora.toISOString())
  const diaSelecionado = diaEscolhido ?? hoje
  /** Quando a chamada abre: agora, ou a esta mesma hora do dia escolhido. */
  const momentoDaChamada = useCallback(() => {
    const instante = new Date()
    if (!diaEscolhido || diaEscolhido === diaLocal(instante.toISOString())) return instante
    const [ano, mes, dia] = diaEscolhido.split('-').map(Number)
    instante.setFullYear(ano, mes - 1, dia)
    return instante
  }, [diaEscolhido])

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

  useEffect(() => {
    if (!leituraOk) return
    const relogio = setTimeout(() => setLeituraOk(undefined), 6000)
    return () => clearTimeout(relogio)
  }, [leituraOk])

  // O diário grava na pasta quando ela existe; sem ela, fica só na memória,
  // visível no Diagnóstico. Ver `ambiente/diario.ts`.
  useEffect(() => ligarDiario(pasta), [pasta])

  // Uma vez por abertura: com que versão e leitor a aula aconteceu é a
  // primeira pergunta de qualquer diagnóstico, e era a que não tinha resposta.
  useEffect(() => {
    registrar('app_aberto', { versao: __CARIMBO__, leitor: leitor.nome, instalacao: config.instalacaoId })
    // Só na montagem: `leitor` e `config` mudam depois, e isso não é
    // "abrir o app" de novo.
  }, [])

  // Erro que ninguém pegou, e a janela perdendo o foco — as duas coisas que
  // até hoje só se descobriam pela ausência de presença no fim da aula.
  useEffect(() => {
    const aoErrar = (e: ErrorEvent) => registrar('erro', { mensagem: e.message, onde: e.filename?.split('/').pop() })
    const aoRejeitar = (e: PromiseRejectionEvent) =>
      registrar('erro', { mensagem: (e.reason as Error)?.message ?? String(e.reason) })
    const aoPerderFoco = () => registrar('foco', { janela: 'perdeu' })
    const aoGanharFoco = () => registrar('foco', { janela: 'voltou' })
    window.addEventListener('error', aoErrar)
    window.addEventListener('unhandledrejection', aoRejeitar)
    window.addEventListener('blur', aoPerderFoco)
    window.addEventListener('focus', aoGanharFoco)
    return () => {
      window.removeEventListener('error', aoErrar)
      window.removeEventListener('unhandledrejection', aoRejeitar)
      window.removeEventListener('blur', aoPerderFoco)
      window.removeEventListener('focus', aoGanharFoco)
    }
  }, [])

  // O código real de cada crachá, na primeira vez que ele aparece — ver
  // `ambiente/auditoriaDeUids.ts`, e a decisão de 22/09/2026 por trás.
  // Em qualquer tela, não só na chamada: o crachá encostado no repouso para
  // testar o leitor também é de alguém.
  useEffect(() => {
    if (!pasta) return
    return leitor.aoLer((leitura) => {
      if (!auditoriaDeUidsLigada()) return
      anotarUid(pasta, config.salHex, leitura.uid, leitura.em, leitura.origem).then(
        (novo) => novo && registrar('uid_anotado'),
        (erro: Error) => registrar('erro_auditoria', { mensagem: erro.message }),
      )
    })
  }, [leitor, pasta, config.salHex])

  // Uma leitura que chegou e **não virou crachá** nunca mais fica muda: era
  // o "apitou e nada aconteceu" (15 e 17/09/2026). Vale em qualquer tela,
  // inclusive durante a chamada, que é onde ele custa presença.
  useEffect(() => {
    if (!ehQueRecusa(leitor)) return
    return leitor.aoRecusar((recusa) => {
      // O tamanho, não o texto: o texto cru é o UID.
      registrar('recusa', { motivo: recusa.motivo, caracteres: recusa.cru.length })
      tocar('desconhecido')
      setLeituraOk(undefined)
      setAvisoLeitura(mensagemDeRecusa(recusa))
    })
  }, [leitor])

  // Uma vez por versão nova: marca como vista já ao mostrar, não só ao
  // sumir — senão fechar a aba no meio dos 12 segundos faria o toast voltar
  // na próxima abertura.
  useEffect(() => {
    const atual = NOVIDADES[0]
    if (!atual || atual.versao === versaoDeNovidadeVista()) return
    setNovidade(atual.resumo)
    marcarVersaoDeNovidadeVista(atual.versao)
  }, [])

  // 12s, não 6: o resumo cresceu de uma frase para vários tópicos, e sumir
  // sozinho no meio da leitura era pior do que o "Fechar" existir — ver
  // esse botão logo abaixo, no JSX do toast.
  useEffect(() => {
    if (!novidade) return
    const relogio = setTimeout(() => setNovidade(undefined), 12000)
    return () => clearTimeout(relogio)
  }, [novidade])

  const recontar = useCallback(async () => {
    const [listaDeTurmas, matriculados, vinculos, aberta, atual] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
      repositorio.sessaoAberta(),
      repositorio.lerConfig(),
    ])
    setSessao(aberta)
    // "Só faz sentido onde não há pasta: com pasta, cada evento é gravado no
    // ato e nada fica pendente" (comentário de `Config.exportado`, em
    // `nucleo/tipos.ts`) — e de fato, todo consumidor de `pendencias` já
    // reduz pra `pasta ? [] : pendencias` / `pasta ? 0 : totalNaoSalvo(...)`.
    // Ler o log inteiro (cresce com o histórico do professor) só pra um
    // valor que a tela descarta em seguida era achado extra da Fase 4
    // (`docs/05_plano_execucao.md`) — sem mudança de comportamento, porque
    // o valor final já era sempre `[]` neste caso.
    setPendencias(pasta ? [] : naoSalvos(await repositorio.listarEventos(), atual.exportado))

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

    // `proxima` e `comecarEm` são contas sobre esta grade e o relógio — ver
    // `agora`, lá em cima.
    setGrade({ aulas: todasAsAulas, hashes: vinculosDeProfessor.map((v) => v.uidHash) })
    const faltando = quemFalta(matriculados, vinculos)
    setTurmas(listaDeTurmas.length)
    setListaDeTurmas(listaDeTurmas)
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
  }, [repositorio, pasta])

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

  /** Planilha contra base, com o resultado no diário. Ver `conferirLog`. */
  const conferir = useCallback(
    async (turma?: string) => {
      if (!pasta) return
      try {
        for (const c of await conferirLog(repositorio, pasta, turma)) {
          const divergiu = c.acrescentados > 0 || c.soNoArquivo > 0 || c.repetidos > 0
          registrar(divergiu ? 'conferencia_divergiu' : 'conferencia_ok', {
            turma: c.turma,
            base: c.naBase,
            arquivo: c.noArquivo,
            acrescentados: c.acrescentados,
            so_no_arquivo: c.soNoArquivo,
            repetidos: c.repetidos,
          })
        }
      } catch (erro) {
        registrar('erro_conferencia', { mensagem: (erro as Error).message })
      }
    },
    [pasta, repositorio],
  )

  // A pasta é a dona: se o cache está vazio e ela tem conteúdo, quem manda é
  // ela. É este caminho que transforma "perdi tudo" em "cliquei de novo".
  //
  // `recarregarConfig` depois de restaurar, sempre: a restauração adota o sal
  // do cofre **na base**, e a config que as telas usam para calcular o hash é
  // uma cópia em memória lida quando o app abriu. Sem reler, a base guardava
  // um sal e o crachá era calculado com outro — foi o 17/09/2026: reinstalado
  // o app, a pasta devolveu o sal antigo, a tela seguiu com o recém-sorteado,
  // e a turma inteira foi recadastrada num sal que sumiu ao reabrir. No dia
  // 22 ninguém daquela manhã era reconhecido.
  //
  // Com base já cheia não se restaura, mas os sais do cofre vêm sempre: um
  // crachá cadastrado em outro navegador, noutro sal, tem que ser reconhecido
  // aqui também (ver `adotarSal`, em `ambiente/sincronia.ts`).
  useEffect(() => {
    if (!pasta) return
    void (async () => {
      const antes = saisConhecidos(await repositorio.lerConfig()).join()
      const vazia = (await repositorio.listarVinculos()).length === 0
      if (vazia) await restaurar(repositorio, pasta)
      else await lembrarSaisDaPasta(repositorio, pasta)
      registrar('pasta_ligada', {
        restaurou: vazia,
        sais: saisConhecidos(await repositorio.lerConfig()).length,
      })
      await conferir()
      // Só quando o chaveiro mudou: reler troca a identidade de
      // `recarregarConfig`, que reroda este efeito — reler sempre seria laço.
      if (saisConhecidos(await repositorio.lerConfig()).join() !== antes) await recarregarConfig()
      await recontar()
    })()
  }, [pasta, repositorio, recontar, recarregarConfig, conferir])

  // Gravação que falha em silêncio é o pior defeito possível aqui: a aula segue
  // parecendo salva e só se descobre depois. O erro vira estado visível, e o
  // dado continua no cache até o conserto — nada se perde, mas ninguém fica
  // sabendo por acaso.
  // `turma`, quando o chamador sabe qual mudou (um crachá aceito numa aula
  // aberta), escopa `sincronizar`/`gravarFaltas` pra só ela — Fase 4, item C
  // (`docs/05_plano_execucao.md`). Sem `turma` (colar turma nova, cronograma
  // salvo, vínculo de professor criado), continua recalculando tudo, que é
  // o certo quando não dá pra saber só uma turma foi afetada.
  const gravarNaPasta = useCallback(
    async (turma?: string) => {
      if (!pasta) return
      const inicio = performance.now()
      try {
        await sincronizar(repositorio, pasta, turma)
        const sincronizadoEm = performance.now()
        // A planilha organizada (nome completo, faltas por dia) recalculada e
        // reescrita a cada mudança — a mesma regra de "sem botão de exportar"
        // que já vale para `registros/`. Ver o comentário em `gravarFaltas`.
        await gravarFaltas(repositorio, pasta, turma)
        setFalhaNaPasta(undefined)
        // Roda a cada crachá aceito, e reescreve vários arquivos: é o candidato
        // natural a pesar numa turma grande. Medido, não suposto.
        registrar('pasta', {
          cadastro_ms: Math.round(sincronizadoEm - inicio),
          faltas_ms: Math.round(performance.now() - sincronizadoEm),
        })
      } catch (erro) {
        setFalhaNaPasta((erro as Error).message)
        registrar('erro_pasta', { mensagem: (erro as Error).message })
      }
    },
    [pasta, repositorio],
  )

  const gravarLinha = useCallback(
    async (evento: Parameters<typeof acrescentarNoLog>[1]) => {
      if (!pasta) return
      try {
        await acrescentarNoLog(pasta, evento)
        setFalhaNaPasta(undefined)
      } catch (erro) {
        setFalhaNaPasta((erro as Error).message)
        registrar('erro_log', { evento: evento.eventoId, mensagem: (erro as Error).message })
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

  const mudou = useCallback(
    async (turma?: string) => {
      await recontar()
      await gravarNaPasta(turma)
    },
    [recontar, gravarNaPasta],
  )

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
    async (turma: string, uidHash: string, em: Date) => {
      const vinculo = await repositorio.vinculoPorHash(uidHash)
      const rascunho = eventoDe(
        { tipo: 'abrir', turma, vinculo },
        { eventoId: '', quando: em, turma, uidHash },
      )
      if (rascunho) {
        const evento = await gravarEventoNovo(repositorio, config.instalacaoId, em, (eventoId) => ({
          ...rascunho,
          eventoId,
        }))
        await gravarLinha(evento)
        registrar('abrir', { evento: evento.eventoId, dia: diaLocal(em.toISOString()) })
      }
      await repositorio.abrirSessao({ turma, abertaEm: em.toISOString(), uidHashProfessor: uidHash })
      tocar('abertura')
      await mudou(turma)
    },
    [repositorio, config.instalacaoId, gravarLinha, mudou],
  )

  /**
   * O crachá do professor e o botão "Começar a chamada" fazem a mesma
   * coisa: abrem a turma e a hora que a tela de repouso está mostrando —
   * nunca uma turma calculada por baixo dos panos, nunca uma pergunta à
   * parte. A seta escolhe a turma, o campo de data/hora escolhe quando;
   * este gesto só confirma o que já está na tela.
   *
   * Compartilhado entre os dois jeitos de abrir — o botão e o crachá —
   * porque a regra é a mesma e duplicá-la seria a forma de os dois
   * divergirem sem ninguém notar.
   */
  const abrirComProfessor = useCallback(
    async (uidHash: string) => {
      if (!turmaSelecionada) return
      await abrirChamada(turmaSelecionada, uidHash, momentoDaChamada())
      // Depois de abrir, a próxima chamada volta a ser de hoje — sem isto,
      // um dia editado ficaria preso, congelado, pra sempre.
      setDiaEscolhido(undefined)
    },
    [turmaSelecionada, momentoDaChamada, abrirChamada],
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
   *
   * **Nasce genérico — `nome: 'Professor'`, sem matrícula — nunca com nome de
   * gente real.** Antes ele copiava `listarMatriculados().find(papel ===
   * 'professor')`: o primeiro docente encontrado **em toda a base, de
   * qualquer turma**, não necessariamente desta. Ao vivo, isso vinculou o
   * docente Mauricio Sightman sem ele nunca ter encostado crachá — `quemFalta`
   * e `vinculoDe` casam por nome/matrícula sem filtrar turma, e o sintético
   * "com nome de gente real" marcava ele como vinculado em qualquer lugar
   * que aparecesse. Identidade real só entra quando o professor se cadastra
   * de propósito — crachá de verdade, pela seção de professores em
   * `TelaAula` — e `vincularCracha`, lá, substitui este sintético pelo
   * vínculo real assim que isso acontece.
   */
  const garantirProfessor = useCallback(async (): Promise<Vinculo> => {
    const existente = (await repositorio.listarVinculos()).find((v) => v.papel === 'professor')
    if (existente) return existente

    const vinculo: Vinculo = {
      uidHash: uidHashSintetico(),
      papel: 'professor',
      nome: 'Professor',
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
   *
   * Com mais de um professor cadastrado, `garantirProfessor()` sozinha
   * devolveria sempre o mesmo (o primeiro por ordem alfabética de nome) —
   * mesmo bug que já foi corrigido uma vez pro indicador do repouso
   * (`docs/04_historico.md`, 21/08/2026): a turma sugerida pode ser de
   * **outro** professor, cuja grade bate agora. Aqui se procura, antes, se
   * algum vínculo de professor tem aula agora justamente na turma
   * selecionada — se tiver, é o dele que abre; senão, cai no de sempre.
   */
  const iniciarChamada = useCallback(async () => {
    if (!turmaSelecionada) return
    const [professor, aulas] = await Promise.all([garantirProfessor(), repositorio.listarAulas()])
    const aulaDaTurmaAgora = aulas.find(
      (a) => a.turma === turmaSelecionada && aulasAgora([a], a.uidHashProfessor, momentoDaChamada()).length > 0,
    )
    await abrirComProfessor(aulaDaTurmaAgora?.uidHashProfessor ?? professor.uidHash)
  }, [turmaSelecionada, momentoDaChamada, garantirProfessor, repositorio, abrirComProfessor])

  /** -1 volta, 1 avança — circular: da última turma o → cai na primeira, e
      da primeira o ← cai na última. Com duas ou três turmas, chegar na ponta
      e ter de voltar tudo de volta é o gesto que mais se repete. */
  const mudarTurma = useCallback(
    (direcao: -1 | 1) => {
      setTurmaSelecionada((atual) => {
        if (!atual) return atual
        const indice = listaDeTurmas.indexOf(atual)
        if (indice < 0) return atual
        const total = listaDeTurmas.length
        return listaDeTurmas[(indice + direcao + total) % total]
      })
    },
    [listaDeTurmas],
  )

  const editarDia = useCallback((valor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return
    setDiaEscolhido(valor)
  }, [])

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
        const { uidHash, vinculo } = await identificarCracha(repositorio, config, leitura.uid)
        registrar('cracha_no_repouso', { hash: curto(uidHash), vinculo: vinculo?.papel ?? 'nenhum' })
        // Abre a turma e a hora que a tela de repouso está mostrando — não
        // a hora real deste toque. Ver o comentário em `abrirComProfessor`.
        if (vinculo?.papel === 'professor') return await abrirComProfessor(uidHash)
        // Um crachá que não é do professor, encostado sem aula aberta, não
        // tem o que fazer — mas ficar mudo sobre isso é indistinguível de um
        // leitor quebrado. Dizer o que aconteceu é mais barato que a dúvida.
        tocar('desconhecido')
        // O professor encosta um crachá aqui para ver se o leitor está lendo.
        // Dizer **quem** foi lido responde isso sem mostrar o UID, que numa
        // tela de projetor é o dado que permite clonar o crachá.
        setAvisoLeitura(undefined)
        setLeituraOk(
          vinculo
            ? `${vinculo.nome} foi lido. O leitor está funcionando. Nenhuma aula aberta agora.`
            : 'Crachá lido, mas ainda sem dono. O leitor está funcionando.',
        )
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

  /**
   * ← → trocam de turma, Enter confirma "Começar a chamada" — a mesma
   * promessa da seta em "Chamar nomes" (`TelaAula`): a mão fica no
   * teclado, sem precisar alcançar o mouse pra nenhum dos dois gestos.
   * Pedido de 17/09/2026 ("ao pressionar enter a chamada comeca").
   *
   * Só ativo com o repouso de fato na tela — nas outras rotas o
   * professor pode estar digitando em qualquer lugar, e nada aqui devia
   * interferir. As setas, além disso, ficam de fora sempre que o foco
   * estiver num controle de forma: o campo de data/hora já usa ← → para
   * andar entre os segmentos da data, e roubar isso quebraria o campo.
   */
  useEffect(() => {
    const emRepouso = !resumo && rota === 'pronto' && !colandoNova
    if (!emRepouso) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Enter') {
        // `defaultPrevented`: é o Enter do dongle fechando um crachá (ver
        // `LeitorTeclado`). Crachá no repouso só diz quem foi lido.
        if (evento.defaultPrevented) return
        if (turmaSelecionada) void iniciarChamada()
        return
      }
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const foco = document.activeElement
      if (foco instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(foco.tagName)) return
      mudarTurma(evento.key === 'ArrowRight' ? 1 : -1)
      evento.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [resumo, rota, colandoNova, turmaSelecionada, iniciarChamada, mudarTurma])

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
   * `rota` sozinha não basta: `resumo`, `colandoNova` e `folha` são
   * sobreposições que vivem fora de `decidirRota`, em estado local daqui.
   * É possível estar em `rota === 'pronto'` com `TelaResumo` na tela, e uma
   * etiqueta que mostrasse só a rota mentiria nesse caso. A ordem aqui segue
   * a ordem em que o JSX abaixo de fato decide o que aparece.
   */
  const camadas = [
    rota,
    colandoNova && 'colando turma nova',
    resumo && 'resumo aberto',
    folha && `folha: ${folha}`,
  ]
    .filter(Boolean)
    .join(' · ')

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
          // Só a turma da aula aberta — Fase 4, item C. Um crachá aqui não
          // tem como mudar outra turma.
          aoMudarBase={() => mudou(sessao.turma)}
          aoRegistrar={gravarLinha}
          aoEncerrar={(presentes, duracaoMs, intervalos) => {
            // Sem esta marca o relógio reabriria a aula que acabou de fechar.
            marcarEncerrada(sessao.turma, new Date().toISOString())
            // A fila acabou: é a hora de gravar o que foi adiado para não
            // pesar nela. Ver `gravarMarcasPendentes`.
            void gravarMarcasPendentes()
            void conferir(sessao.turma)
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
          pendencias={pasta ? [] : pendencias}
          nomeDoProfessor={nomeDoProfessorAtual}
          listaDeTurmas={listaDeTurmas}
          turmaSelecionada={turmaSelecionada}
          agoraNaGrade={comecarEm}
          diaSelecionado={diaSelecionado}
          aoMudarTurma={mudarTurma}
          aoEditarDia={editarDia}
          aoIniciar={() => void iniciarChamada()}
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
      {leituraOk && <p className="aviso-leitura aviso-leitura--ok">{leituraOk}</p>}
      {novidade && (
        <p className="toast-novidade">
          {novidade}
          <button
            className="toast-novidade__fechar"
            onClick={() => setNovidade(undefined)}
            aria-label="Fechar aviso"
            title="Fechar"
          >
            ×
          </button>
        </p>
      )}

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

        <IndicadorDoLeitor leitor={leitor} />

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
                  await recarregarConfig()
                  await recontar()
                  return resumo
                }}
                aoVerPresencas={() => setFolha('presencas')}
                aoNovaTurma={
                  rota === 'pronto'
                    ? () => {
                        setFolha(undefined)
                        setTurmasAntesDaNova(turmas)
                        setColandoNova(true)
                      }
                    : undefined
                }
              />
              {/* Rodapé dos Ajustes: links quietos, separados do resto por
                  não serem uso do dia a dia. Diagnóstico virou folha própria
                  — ver o comentário no topo do arquivo —, o manual mora
                  aqui pelo mesmo motivo, e o GitHub é o repositório do
                  projeto: nenhum dos três compete por atenção com trocar a
                  pasta ou corrigir a grade. */}
              <div className="ajustes__rodape">
                <button className="botao--quieto" onClick={() => setFolha('diagnostico')}>
                  Diagnóstico
                </button>
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
                  Manual
                </button>
                <a
                  className="botao--quieto"
                  href={REPOSITORIO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </div>
              {recadoManual && <p className="ferramentas__nota">{recadoManual}</p>}
              <p className="ajustes__creditos">© 2026 Adsum</p>
            </>
          )}
          {folha === 'presencas' && (
            <ConteudoDePresencas
              nomeDaPasta={pasta?.name}
              aoRegistrar={gravarLinha}
              aoMudarBase={(turma) => mudou(turma)}
            />
          )}
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
  pendencias,
  nomeDoProfessor,
  listaDeTurmas,
  turmaSelecionada,
  agoraNaGrade,
  diaSelecionado,
  aoMudarTurma,
  aoEditarDia,
  aoIniciar,
  aoSalvar,
  aoVerPresencas,
  aoNovaTurma,
}: {
  pendencias: Pendencia[]
  /** De "Sou eu", na chamada — ver `professorAtual`, em `preferencias.ts`.
      Vazio sem marcação: a saudação continua anônima, como sempre foi. */
  nomeDoProfessor?: string
  listaDeTurmas: string[]
  /** A turma que "Começar a chamada" abriria agora — sempre a que está na
      tela, nunca uma calculada por baixo dos panos. Ver o comentário em
      `Fluxo`, onde a sugestão inicial é decidida (grade, se souber; senão a
      última usada; senão a primeira). */
  turmaSelecionada?: string
  /** A turma que a grade diz que tem aula agora — `comecarEm`, em `Fluxo`.
      Pedido do autor (22/09/2026): quando `turmaSelecionada` é esta,
      o ponto ao lado do nome fica azul — é a diferença entre "é a próxima
      recomendação" (sempre) e "é agora, de verdade, pela grade" (às vezes).
      Some ao trocar de turma pela seta; volta ao voltar pra ela. */
  agoraNaGrade?: string
  /** O dia da chamada, `AAAA-MM-DD` local — editável. Sem edição, é hoje. */
  diaSelecionado: string
  /** -1 volta, 1 avança — mesma lógica de seta de "Chamar nomes"
      (`TelaAula`): não dá volta nas pontas. */
  aoMudarTurma: (direcao: -1 | 1) => void
  aoEditarDia: (valor: string) => void
  aoIniciar: () => void
  aoSalvar: (turma: string) => void
  aoVerPresencas: () => void
  aoNovaTurma: () => void
}) {
  const dia = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const indice = turmaSelecionada ? listaDeTurmas.indexOf(turmaSelecionada) : -1

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

      {/* Só o primeiro nome — "Bom dia, Paulo", não o nome de tela inteiro.
          Sem "Sou eu" marcado, continua anônima: ninguém pediu, ninguém
          decide por ele. Sempre aparece agora — a grade deixou de decidir
          se esta linha existe, ela é só a saudação, sempre. */}
      <p className="repouso__turma">
        {nomeDoProfessor ? `${saudacao(new Date())}, ${nomeDoProfessor.split(' ')[0]}` : saudacao(new Date())}
      </p>

      {/* A turma por seta — o que era a tela "Qual turma?" virou isto: a
          resposta já está aqui, navegável, nunca uma pergunta à parte. A
          grade só decide qual aparece primeiro (`turmaSugerida`, em
          `Fluxo`) — a partir daí, quem escolhe é o professor. */}
      <div className="repouso__turma-nav">
        <button
          aria-label="turma anterior"
          onClick={() => aoMudarTurma(-1)}
          disabled={indice < 0 || listaDeTurmas.length < 2}
        >
          ←
        </button>
        <p className="repouso__acao">
          {turmaSelecionada ?? 'Nenhuma turma'}
          {turmaSelecionada && turmaSelecionada === agoraNaGrade && (
            <span className="repouso__agora" title="A grade diz que esta turma tem aula agora" aria-hidden="true" />
          )}
        </p>
        <button
          aria-label="próxima turma"
          onClick={() => aoMudarTurma(1)}
          disabled={indice < 0 || listaDeTurmas.length < 2}
        >
          →
        </button>
      </div>
      {listaDeTurmas.length > 1 && <p className="chamado__atalho">← e → trocam de turma</p>}

      {/* Editável de propósito — dá ao professor o controle de lançar a
          chamada de outro dia (esqueceu de fazer na aula, por exemplo). Isto
          muda o registro de verdade: o dia daqui é o dia da chamada. Só a
          data: é uma chamada por turma por dia. Nativo (`date`), não um
          calendário customizado — o navegador já desenha um seletor
          decente. */}
      <input
        type="date"
        className="repouso__hora"
        value={diaSelecionado}
        onChange={(e) => aoEditarDia(e.target.value)}
        aria-label="dia da chamada"
      />

      <button
        className="botao--acento pasta__botao"
        onClick={aoIniciar}
        disabled={!turmaSelecionada}
      >
        Começar a chamada
      </button>
      {/* O crachá continua abrindo, e a tela **não** diz isso. Anunciar dois
          caminhos para a mesma coisa é a decisão que se queria evitar: quem lê
          "ou encoste o crachá" para para escolher, e escolher é o custo. Quem
          precisa do atalho descobre encostando. O crachá abre exatamente a
          turma e a hora que estiverem na tela — mesma regra do clique. */}
      <button className="repouso__link botao--quieto" onClick={aoVerPresencas}>
        Ver presenças
      </button>

      {/* Terciário, e por isso quieto. Sem isto não havia como começar uma
          turma nova depois da primeira: a tela de colar só aparecia com
          `turmas === 0`. */}
      <button className="repouso__link botao--quieto" onClick={aoNovaTurma}>
        Cadastrar nova turma
      </button>
    </section>
  )
}

