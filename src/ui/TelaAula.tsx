// A aula acontecendo — e o cadastro junto.
//
// **Uma tela só durante a coleta**, e agora também a única que chama nomes.
// Cerimônia e chamada eram duas telas para uma coisa só: chamar um nome e
// esperar um crachá. A cerimônia não passava por `decidir()` — nenhuma
// proteção contra dois crachás rápidos demais, nenhuma busca em spotlight
// para crachá desconhecido — e cada regra vivia em dois lugares que podiam
// divergir sem ninguém notar.
//
// **Dois modos, a mesma tela.** O padrão é o modo comum: ninguém está
// chamado, o leitor aceita o que vier, e crachá desconhecido pergunta de quem
// é (a busca). O professor entra no modo de chamar nomes de propósito — botão
// "Chamar", as setas — e só aí a tela mostra um nome grande
// e confia nele: crachá desconhecido com alguém chamado cadastra **e** conta
// presença no mesmo gesto, sem perguntar de novo, porque quem está com o
// crachá na mão está sendo observado, não só uma sugestão adivinhada. Existia
// chamado automático — a tela escolhia o primeiro pendente sozinha assim que
// a chamada abria — e foi tirado por isso: com a turma inteira ainda sem
// crachá (o caso comum), aquele nome nunca significou "alguém está sendo
// chamado agora", e confiar nele vinculava o crachá de uma pessoa ao nome de
// outra sem ninguém ter pedido nada. Sair do modo de chamar nomes ("Voltar à
// chamada comum") é tão explícito quanto entrar — e nada impede voltar a ele
// depois, mesmo dias mais tarde, para quem faltou.
//
// O contador não tem denominador. `41/60` cria moldura de expectativa e exige
// saber quantos deveriam vir, que é justamente o que ninguém deve precisar
// declarar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { criarAgendador } from '../ambiente/agendador.ts'
import { idDoSal, uidHashSintetico } from '../nucleo/hash.ts'
import { eventoDe, leitorSuspeito, type EstatisticaDeIntervalos, type Sessao } from '../nucleo/sessao.ts'
import { diaLocal } from '../nucleo/faltas.ts'
import {
  depoisDeGravar,
  ehDaPessoa,
  estadoDaChamada,
  indiceDeVinculos,
  MemoriaDaFila,
  recadoAntesDeGravar,
  type LinhaDaChamada,
} from '../nucleo/chamada.ts'
import type { Evento, Matriculado, Papel, Vinculo } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { ehConfirmavel, ehSimulavel, type Leitura } from '../portas/LeitorDeCracha.ts'
import { gravarEventoNovo, identificarCracha } from '../portas/Repositorio.ts'
import { curto, registrar, semDono } from '../ambiente/diario.ts'
import { useAdsum } from './adsum.ts'
import { definirProfessorAtual, modoDev, professorAtual } from '../ambiente/preferencias.ts'
import { Busca } from './componentes/Busca.tsx'
import { CartaoDoChamado } from './aula/CartaoDoChamado.tsx'
import { ContadorDaChamada } from './aula/ContadorDaChamada.tsx'
import { ListaDeAlunos } from './aula/ListaDeAlunos.tsx'
import { PainelDeProfessores } from './aula/PainelDeProfessores.tsx'

function hhmm(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TelaAula({
  sessao,
  pendentes,
  daTurma,
  aoMudarBase,
  aoRegistrar,
  aoEncerrar,
  retidas,
}: {
  sessao: Sessao
  /** Quem está na turma e ainda não tem crachá. Vira a fila de chamada. */
  pendentes: Matriculado[]
  /**
   * A turma inteira, para a tabela e para a busca do crachá desconhecido.
   *
   * Não são só os pendentes, e a diferença importa: quem perdeu o crachá e
   * trouxe outro **já tem** vínculo, logo não está na fila — e antes disto não
   * havia como encontrá-lo, nem no dia em que ele aparecia com o cartão novo.
   * É também quem já tem crachá e pode receber uma segunda via.
   */
  daTurma: Matriculado[]
  aoMudarBase: () => void
  /** Grava a linha na pasta. Acontece antes do bipe: som é "está salvo". */
  aoRegistrar?: (evento: Evento) => Promise<void>
  /** Chamado quando o crachá do professor encerra, com o que houve na aula. */
  aoEncerrar?: (presentes: number, duracaoMs: number, intervalos?: EstatisticaDeIntervalos) => void
  /** Leituras que chegaram enquanto a chamada abria. Ver `antessala.ts`. */
  retidas?: () => Leitura[]
}) {
  const { leitor, repositorio, config } = useAdsum()

  const ensaio = modoDev()

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  /**
   * Quem já passou, a última leitura aceita e os intervalos — atualizados na
   * hora da decisão, fora do estado do React. Ver `MemoriaDaFila`, em
   * `nucleo/chamada.ts`.
   */
  const fila = useRef(new MemoriaDaFila())

  /**
   * Conta as leituras para o recado de uma não apagar o de outra.
   *
   * O recado de antes de gravar sai antes dos `await`, e o de depois só depois deles; com dois
   * crachás quase juntos a gravação do primeiro terminava **depois** de o
   * segundo já ter escrito o aviso na tela — e o limpava. Justamente o caso que
   * a regra do intervalo existe para tornar visível.
   *
   * Achado pelo teste de tela, não a olho: em jsdom as duas leituras se
   * sobrepõem do mesmo jeito que numa mão com dois cartões.
   */
  const geracao = useRef(0)
  const encerrando = useRef(false)
  /** A fila de identificar e decidir. Ver o comentário em `aoLer`, abaixo. */
  const ordemDasLeituras = useRef<Promise<unknown>>(Promise.resolve())
  /**
   * Espelha `presentes` (estado), pra `aoEncerrar` poder ler a contagem sem
   * cair no mesmo closure desatualizado que `fila` já existe para
   * evitar (ver o comentário dela, acima) — os dois `aoEncerrar?.(...)`
   * abaixo rodam dentro de handlers assíncronos que não recebem `presentes`
   * como dependência fresca. Achado em 22/09/2026: sem isto, "Fim da aula"
   * mostrava 0 presentes depois de uma chamada só com presença manual — a
   * mesma tela ao vivo já contava certo, só o resumo do encerramento ainda
   * lia o conjunto errado (só crachá).
   */
  const presentesRef = useRef<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<LinhaDaChamada[]>([])
  const [recado, setRecado] = useState<string>()
  const [procurando, setProcurando] = useState<string>()
  /**
   * O mesmo crachá, na hora. O estado só chega no render seguinte, e o
   * crachá que encosta com a busca aberta precisa saber disso já — ver o
   * desconhecido em `aoLer`.
   */
  const procurandoRef = useRef<string>(undefined)
  const [leiturasDuranteABusca, setLeiturasDuranteABusca] = useState(0)
  const [avisoDaBusca, setAvisoDaBusca] = useState<string>()
  const fecharBusca = useCallback(() => {
    procurandoRef.current = undefined
    setProcurando(undefined)
    setAvisoDaBusca(undefined)
    setLeiturasDuranteABusca(0)
  }, [])
  /** Para "Remover crachá" na tabela — o vínculo de cada linha já ligada. */
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  /** Quem já foi marcado presente **hoje** (crachá ou correção manual) — a
      mesma regra de `planilhaDeFaltas`, consultada por matrícula/nome, não
      por crachá. Alimenta o botão Presente/Não presente na lista de alunos,
      que existe pra quem tem crachá e pra quem não tem. */
  const [presencasHoje, setPresencasHoje] = useState<
    Map<string, { presente: boolean; manual: boolean }>
  >(new Map())
  /** O dia que esta sessão representa — não necessariamente "hoje" de
      calendário, se a abertura foi editada. Mesma chave que
      `planilhaDeFaltas` usa pra agrupar por dia. */
  const dia = useMemo(() => diaLocal(sessao.abertaEm), [sessao.abertaEm])

  /**
   * Quem está chamado agora, por `chave` — não por índice: a ordem de
   * `pendentes` muda a cada crachá vinculado, e um índice apontaria para a
   * pessoa errada no render seguinte.
   */
  const [chamadoChave, setChamadoChave] = useState<string>()
  /** Edição de nome/papel antes do crachá chegar. Só local — vira o que é
      gravado no vínculo quando o crachá encosta, e não sobrevive a um
      recarregamento se ninguém chamou essa pessoa. Mesmo comportamento de
      sempre: edição não é decisão de guardar sozinha. */
  const [edicoes, setEdicoes] = useState<Map<string, { nome: string; papel: Papel }>>(new Map())
  /** Pulado é "não agora", não "nunca" — por isso é local e não persiste. */
  const [pulados, setPulados] = useState<Set<string>>(new Set())
  /** "Sou eu" — ver o comentário em `professorAtual`, em `preferencias.ts`. */
  const [professorAtualHash, setProfessorAtualHash] = useState(professorAtual)
  /** Última vez que o leitor entregou alguma coisa — leitura aceita, recusa,
      qualquer uma. Ver `leitorSuspeito` em `nucleo/sessao.ts`. */
  const [ultimaAtividadeEm, setUltimaAtividadeEm] = useState(() => new Date())
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 15_000)
    return () => clearInterval(relogio)
  }, [])

  /**
   * A janela do sistema operacional perdeu o foco — outro app na frente,
   * outra aba. O dongle "digita" pra onde o foco do SO estiver, não para
   * esta aba especificamente: se outro programa estiver na frente, um
   * crachá encostado não chega aqui, sem erro nenhum, sem toast, sem bipe
   * — o mesmo susto de 17/09/2026 (buzzer do leitor soando, nada
   * acontecendo no Adsum, causa provável era o foco em outra janela).
   *
   * Atraso de 2,5s antes de avisar: trocar de janela por um instante é
   * gesto normal (checar outra aba, responder uma notificação) — avisar na
   * hora piscaria à toa. Falta de foco que persiste é que é o problema.
   */
  const [semFoco, setSemFoco] = useState(false)

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    const aoPerder = () => {
      espera = setTimeout(() => setSemFoco(true), 2500)
    }
    const aoGanhar = () => {
      clearTimeout(espera)
      setSemFoco(false)
    }
    window.addEventListener('blur', aoPerder)
    window.addEventListener('focus', aoGanhar)
    return () => {
      clearTimeout(espera)
      window.removeEventListener('blur', aoPerder)
      window.removeEventListener('focus', aoGanhar)
    }
  }, [])

  /**
   * O vínculo de uma linha da turma — mesmo critério de sempre: matrícula
   * quando existe, nome de docente quando não. É por aqui que "Remover
   * crachá" acha o `uid_hash` a apagar, e por aqui que `efetivo` acha o
   * apelido editado em Ajustes.
   */
  const vinculoDe = useMemo(() => indiceDeVinculos(vinculos), [vinculos])

  const efetivo = useCallback(
    (p: Matriculado): Matriculado => {
      const edicao = edicoes.get(p.chave)
      if (edicao) return { ...p, nome: edicao.nome, papel: edicao.papel }
      // `Vinculo.nome` (editado em Ajustes → Vínculos) e `Matriculado.nome`
      // (vindo do SIGAA) são campos de tabelas diferentes — sem isto, um
      // apelido trocado em Ajustes nunca aparecia na chamada, só ali.
      const vinculo = vinculoDe(p)
      return vinculo ? { ...p, nome: vinculo.nome } : p
    },
    [edicoes, vinculoDe],
  )

  /**
   * Professor não entra na fila de "Chamar nomes" dos alunos — ganhou seção
   * própria (ver `Professores`, abaixo), e o cadastro dele é sempre um clique
   * explícito ali, nunca um nome que a seta ou o interruptor alcança sozinho.
   */
  const pendentesAlunos = useMemo(() => pendentes.filter((p) => p.papel === 'aluno'), [pendentes])
  const alunosDaTurma = useMemo(() => daTurma.filter((p) => p.papel === 'aluno'), [daTurma])
  // Calculados uma vez por render, não uma vez por linha: a lista da turma
  // olhava a turma inteira para cada linha, e com 300 alunos cada crachá
  // custava mais de meio segundo só de desenho.
  const chavesPendentes = useMemo(() => new Set(pendentesAlunos.map((p) => p.chave)), [pendentesAlunos])
  const vezesDoNome = useMemo(() => {
    const vezes = new Map<string, number>()
    for (const p of alunosDaTurma) {
      const nome = efetivo(p).nome
      vezes.set(nome, (vezes.get(nome) ?? 0) + 1)
    }
    return vezes
  }, [alunosDaTurma, efetivo])
  const professoresDaTurma = useMemo(() => daTurma.filter((p) => p.papel === 'professor'), [daTurma])

  /** A pessoa chamada, com a edição local aplicada — é isto que `decidir()`
      recebe como `ctx.chamado`, e é isto que vira o vínculo gravado.
      `pendentes` inteiro, aluno ou professor: o cadastro explícito de um
      professor (botão "Cadastrar") também passa por `chamadoChave`. */
  const aCadastrar = useMemo(() => {
    const p = pendentes.find((x) => x.chave === chamadoChave)
    return p ? efetivo(p) : undefined
  }, [pendentes, chamadoChave, efetivo])

  const proximoPendente = useCallback(
    (apartirDe: number) => {
      for (let i = apartirDe; i < pendentesAlunos.length; i++) {
        if (!pulados.has(pendentesAlunos[i].chave)) return pendentesAlunos[i].chave
      }
      return undefined
    },
    [pendentesAlunos, pulados],
  )

  // Setas andam pela fila de alunos pendentes. Quem opera está com a mão no
  // teclado e um aluno na frente — e é gesto explícito o bastante para entrar
  // no modo de chamar nomes, igual a um clique em "Chamar": sem ninguém
  // chamado ainda, `indice` é `-1`, e a primeira seta pousa no início da fila
  // (índice `0`), não pula ele.
  useEffect(() => {
    if (pendentesAlunos.length === 0) return
    const andar = (evento: KeyboardEvent) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return
      const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
      const proximo = Math.min(
        pendentesAlunos.length - 1,
        Math.max(0, indice + (evento.key === 'ArrowRight' ? 1 : -1)),
      )
      setChamadoChave(pendentesAlunos[proximo]?.chave)
      evento.preventDefault()
    }
    window.addEventListener('keydown', andar)
    return () => window.removeEventListener('keydown', andar)
  }, [pendentesAlunos, chamadoChave])

  /**
   * Pendentes primeiro, o resto depois — com as edições locais aplicadas.
   *
   * A pessoa mais provável num crachá desconhecido é quem ainda não cadastrou,
   * e ela deve estar a zero tecla de distância. Quem já tem crachá continua
   * alcançável logo abaixo — é a segunda via, e o app aceita mais de um crachá
   * por aluno de propósito.
   *
   * A busca só abre no modo comum, com ninguém chamado (ver `decidir()`), mas
   * uma edição de nome feita na tabela antes de qualquer crachá encostar
   * precisa continuar valendo mesmo assim — daí `efetivo`, não `pendentes` cru.
   */
  const ordemDaBusca = useMemo(() => {
    const naFila = new Set(pendentes.map((p) => p.chave))
    // Turma inteira, não só quem falta — inclusive quem já tem crachá,
    // professor ou aluno. Sem isto, quem perdeu o crachá e trouxe outro não
    // tinha como ser encontrado: já tem vínculo, logo não está na fila.
    return [...pendentes.map(efetivo), ...daTurma.filter((p) => !naFila.has(p.chave))]
  }, [pendentes, daTurma, efetivo])

  // Reabrir o app no meio da aula tem que reencontrar quem já passou. A fonte
  // é o log, não a memória da tela — fechar o notebook não pode zerar a chamada.
  // A regra (uma chamada por turma por dia, quem conta, o que aparece na
  // lista) mora em `estadoDaChamada`, em `nucleo/chamada.ts`.
  const recarregar = useCallback(async () => {
    const marca = fila.current.marca()
    const [eventos, vinculosAtuais] = await Promise.all([
      // Só a turma desta aula: o índice já existe, e ler a base inteira do
      // professor a cada crachá não tinha por que acontecer aqui. Ver
      // `docs/05_plano_execucao.md`, Fase 4, item B.
      repositorio.listarEventos({ turma: sessao.turma }),
      repositorio.listarVinculos(),
    ])
    setVinculos(vinculosAtuais)
    const estado = estadoDaChamada(eventos, vinculosAtuais, sessao.turma, dia)
    fila.current.recomecar(estado.porCracha, marca)
    presentesRef.current = estado.presentes
    setPresentes(estado.presentes)
    setPresencasHoje(estado.presencasHoje)
    setLinhas(estado.linhas)
  }, [repositorio, sessao, dia])

  // Uma releitura por rajada, não uma por crachá: ver `ambiente/agendador.ts`.
  const recarregarAtual = useRef(recarregar)
  useEffect(() => {
    recarregarAtual.current = recarregar
  }, [recarregar])
  const recarregarJa = useMemo(() => criarAgendador(() => recarregarAtual.current()), [])

  useEffect(() => {
    semDono('recarregar a aula', recarregarJa)
  }, [recarregar, recarregarJa])

  /**
   * Grava o vínculo de um crachá recém-identificado — cadastro do modo de
   * chamar nomes, ou confirmação pela busca de "de quem é esse crachá".
   *
   * Quando é a identificação **real** do professor, substitui um vínculo
   * antigo que já existisse pra ele — sintético (`garantirProfessor`, em
   * `Fluxo.tsx`, nasce genérico, mas não desaparece sozinho) ou real (o
   * professor perdeu o crachá e a busca achou o vínculo antigo, agora
   * encontrável graças a `ordemDaBusca` não excluir mais quem já tem
   * crachá). Sem isto os dois conviveriam, e qualquer `Aula.uidHashProfessor`
   * que ainda apontasse pro hash velho nunca mais bateria com hash nenhum
   * depois da troca — o mesmo bug do vínculo duplicado que quebrava a grade
   * (`nucleo/grade.ts`), só que reaberto pela troca de crachá em vez de
   * nascer sozinho.
   */
  const vincularCracha = useCallback(
    async (pessoa: Matriculado, uidHash: string, quando: Date) => {
      if (pessoa.papel === 'professor') {
        const antigo = vinculos.find(
          (v) =>
            v.papel === 'professor' &&
            v.uidHash !== uidHash &&
            (v.sintetico || ehDaPessoa(v, pessoa)),
        )
        if (antigo) {
          await repositorio.removerVinculo(antigo.uidHash)
          const aulas = await repositorio.listarAulas()
          for (const aula of aulas.filter((a) => a.uidHashProfessor === antigo.uidHash)) {
            await repositorio.gravarAula({ ...aula, uidHashProfessor: uidHash })
          }
        }
      }
      await repositorio.gravarVinculo({
        uidHash,
        papel: pessoa.papel,
        nome: pessoa.nome,
        matricula: pessoa.matricula || undefined,
        criadoEm: quando.toISOString(),
        // Crachá sem dono é sempre calculado no sal atual da base
        // (`identificarCracha`) — e é dela, não da cópia da tela, que se lê.
        salId: await idDoSal((await repositorio.lerConfig()).salHex),
      })
    },
    [repositorio, vinculos],
  )

  /**
   * Desfaz um vínculo errado sem sair da chamada.
   *
   * Existia só em Ajustes → Vínculos, longe de onde o erro acontece: crachá
   * desconhecido confirmado para a pessoa errada, ou crachá de outra pessoa
   * que encostou por engano na hora certa. Corrigir aqui, com a turma ainda
   * na tela, é o mesmo gesto de sempre — a correção mora perto do erro.
   *
   * Não apaga a presença já gravada: eventos não se apagam. O crachá volta a
   * ser desconhecido, e a linha volta para "Quem falta" — pronta para o
   * crachá certo.
   */
  const removerCracha = useCallback(
    (p: Matriculado) => {
      // **Todos** os vínculos da pessoa, não o primeiro. Com o chaveiro de
      // sais, quem foi cadastrado de novo depois de 17/09 tem um vínculo em
      // cada sal (32 alunos na base do Paulo): apagar só o primeiro podia
      // apagar o morto, e a tela não mudava — "nada aconteceu", no ensaio de
      // 23/09/2026. O botão promete que o crachá deixa de valer.
      const daPessoa = vinculos.filter((v) => ehDaPessoa(v, p))
      if (daPessoa.length === 0) return
      if (!confirm(`Desvincular o crachá de ${p.nomeCompleto}?`)) return
      semDono('remover crachá', async () => {
        for (const vinculo of daPessoa) await repositorio.removerVinculo(vinculo.uidHash)
        registrar('cracha_removido', { vinculos: daPessoa.length })
        await recarregarJa()
        aoMudarBase()
      })
    },
    [vinculos, repositorio, recarregar, aoMudarBase],
  )

  /**
   * Presente/Não presente à mão — pra quem já tem crachá **e** pra quem
   * ainda não tem. Mesmo caminho de `TelaPresencas.tsx` (`gravar`): evento
   * `origem: 'manual'`, identificado por matrícula/nome — não por crachá,
   * porque quem não tem crachá não tem `uidHash` de verdade.
   *
   * `quando` é a hora real do clique, não o meio-dia fixo que
   * `TelaPresencas.tsx` usa. Lá faz sentido — é correção de um dia
   * qualquer, sem sessão aberta, sem hora real nenhuma pra registrar. Aqui
   * a sessão está aberta de verdade: usar meio-dia UTC fixo podia cair
   * **antes** de `sessao.abertaEm` dependendo do fuso (uma sessão aberta às
   * 13h local, em fuso UTC-3, abre com `abertaEm` = 16h UTC — depois do
   * meio-dia UTC) — e `recarregar()` só considera eventos com `quando >=
   * sessao.abertaEm` como desta sessão. O evento existia no banco, mas a
   * própria tela que acabou de gravá-lo nunca o via. Achado pelo teste, não
   * a olho.
   *
   * O contador do topo (`presentes.size`) conta este evento também, desde
   * 22/09/2026 — achado numa sessão de testes: o professor sem dongle (ou
   * com o dongle quebrado, o caminho que este arquivo inteiro discute)
   * segue pela via manual, e o contador travado em zero a aula inteira era
   * o oposto do que ele precisa ver bem na hora. A contagem em si não
   * acontece aqui — é `recarregar()`, abaixo, relendo o log — este
   * `useCallback` só grava o evento.
   */
  const alterarPresenca = useCallback(
    async (p: Matriculado, presente: boolean) => {
      const agora = new Date()
      const evento = await gravarEventoNovo(repositorio, config.instalacaoId, agora, (eventoId) => ({
        eventoId,
        quando: agora.toISOString(),
        turma: p.turma,
        matricula: p.matricula || undefined,
        nome: efetivo(p).nome,
        origem: 'manual',
        resultado: presente ? 'ok' : 'removido',
        uidHash: uidHashSintetico(),
      }))
      registrar('manual', { resultado: evento.resultado, evento: evento.eventoId })
      await aoRegistrar?.(evento)
      await recarregarJa()
      aoMudarBase()
    },
    [config.instalacaoId, efetivo, repositorio, aoRegistrar, recarregar, aoMudarBase],
  )

  useEffect(() => {
    const aoLer = (leitura: Leitura) => {
      setUltimaAtividadeEm(leitura.em)
      if (procurandoRef.current) setLeiturasDuranteABusca((n) => n + 1)
      void (async () => {
        const minha = ++geracao.current
        // Uma linha no diário por crachá, com o tempo de cada etapa: é o que
        // mostra, sem reconstruir nada à mão, se uma aula ficou lenta e onde.
        const inicio = performance.now()
        // Identificar e decidir andam em fila, na ordem em que os crachás
        // chegaram. Soltos, a identificação de um podia terminar depois da do
        // seguinte, e ele era comparado com um crachá que chegou **depois**
        // dele: intervalo negativo, "dois crachás quase juntos", aluno presente
        // recusado. Visto na fila de 300 pelo emulador, 23/09/2026, com a aba
        // ocupada redesenhando a turma. Só esta parte espera a anterior: gravar
        // e redesenhar continuam soltos, como antes.
        const passo = ordemDasLeituras.current.then(async () => {
          const identificado = await identificarCracha(repositorio, leitura.uid)
          // Decidir e marcar antes de qualquer `await`: dois crachás de uma
          // mão chegam em centenas de milissegundos, e o segundo não pode
          // encontrar a memória desatualizada — seria a fraude passando pela
          // porta que a regra do intervalo existe para fechar.
          const decisao = fila.current.decidir(identificado.uidHash, {
            sessao,
            vinculo: identificado.vinculo,
            chamado: aCadastrar,
            em: leitura.em,
          })
          return { ...identificado, identificadoEm: performance.now(), decisao }
        })
        ordemDasLeituras.current = passo.catch(() => undefined)
        const { uidHash, vinculo, sal, identificadoEm, decisao } = await passo
        // Aceito na memória da fila até a gravação terminar, bem ou mal: ver
        // `MemoriaDaFila.recomecar`.
        try {

          // Crachá que ninguém reconhece, sem ninguém chamado (modo comum):
          // pergunta de quem é, ali, na hora, com a pessoa na frente. Nada é
          // gravado enquanto ela não responder. Com alguém chamado, ver o
          // `cadastro` logo abaixo — não passa por aqui.
          //
          // Desistir continua sendo um clique fora: quem não quiser vincular
          // agora fecha, e o registro fica como crachá não cadastrado.
          //
          // **Uma busca por vez.** Com a busca aberta, outro crachá desconhecido
          // não toma o lugar do primeiro: trocar em silêncio fazia o nome
          // escolhido para quem está na frente ir para o crachá de quem veio
          // atrás (bancada de 23/09/2026). O segundo é recusado em voz alta e
          // encosta de novo depois. Crachá conhecido segue contando normalmente.
          if (decisao.tipo === 'desconhecido') {
            tocar('desconhecido')
            if (procurandoRef.current === uidHash) return
            if (procurandoRef.current) {
              registrar('desconhecido_durante_busca', { hash: curto(uidHash) })
              setAvisoDaBusca('Outro crachá novo chegou e não foi contado. Termine esta busca e peça para encostar de novo.')
              return
            }
            registrar('desconhecido', { hash: curto(uidHash) })
            procurandoRef.current = uidHash
            setProcurando(uidHash)
            return
          }

          // Cadastro grava o vínculo antes do evento: se algo falhar no meio,
          // sobra um crachá vinculado sem presença — que se resolve encostando de
          // novo — e não uma presença de alguém que o sistema não reconhece.
          if (decisao.tipo === 'cadastro') {
            await vincularCracha(decisao.pessoa, uidHash, leitura.em)
            if (decisao.pessoa.papel === 'aluno') {
              // Avança sozinho para o próximo pendente, pulando quem já foi
              // marcado como pulado — mesmo gesto de sempre: chamar um nome não
              // deveria custar um clique a mais para "próximo". Continua no
              // modo de chamar nomes; sai dele só quando a fila de alunos
              // acaba ou o professor volta explicitamente.
              setChamadoChave((atual) => {
                const indice = pendentesAlunos.findIndex((p) => p.chave === atual)
                return proximoPendente(indice + 1)
              })
            } else {
              // Cadastro de professor não é fila — foi um clique explícito em
              // "Cadastrar", para uma pessoa só. Feito, volta a nada chamado.
              setChamadoChave(undefined)
            }
          }

          // Sem id ainda: quem cunha é `gravarEventoNovo`, na hora de gravar.
          const rascunho = eventoDe(decisao, {
            eventoId: '',
            quando: leitura.em,
            turma: sessao.turma,
            uidHash,
          })

          // A tela responde na hora; o som espera a gravação.
          //
          // São duas promessas diferentes e vale separá-las: o olho precisa de
          // resposta imediata para a fila não parecer travada, e o bipe significa
          // **está salvo** — não "eu ouvi". Gravar antes de mostrar somava a
          // latência do disco a cada crachá, e numa fila isso se sente.
          const recado = recadoAntesDeGravar(decisao)
          if (recado) setRecado(recado)

          const evento =
            rascunho &&
            (await gravarEventoNovo(
              repositorio,
              config.instalacaoId,
              leitura.em,
              (eventoId) => ({ ...rascunho, eventoId }),
              (ocupado) => registrar('id_ocupado', { evento: ocupado }),
            ))
          const gravadoEm = performance.now()
          if (evento) {
            await aoRegistrar?.(evento)
            // O LED do leitor serial significa "está salvo", como o bipe: só
            // depois da gravação. Leitor de teclado não tem como confirmar.
            if (ehConfirmavel(leitor)) void leitor.confirmarGravacao()
          }
          if (decisao.tipo === 'encerrar') {
            await repositorio.encerrarSessao()
            aoEncerrar?.(
              presentesRef.current.size,
              leitura.em.getTime() - Date.parse(sessao.abertaEm),
              fila.current.estatistica(),
            )
          }

          // Só limpa o recado **desta** leitura: se outra chegou no meio, o
          // recado na tela é dela, e apagá-lo escondia a recusa de dois
          // crachás juntos.
          const { som, limpaRecado } = depoisDeGravar(decisao, Boolean(evento))
          if (limpaRecado && minha === geracao.current) setRecado(undefined)
          if (som) tocar(som)
          await recarregarJa()
          aoMudarBase()
          const fim = performance.now()
          registrar('cracha', {
            hash: curto(uidHash),
            sal: vinculo ? sal : undefined,
            vinculo: vinculo ? vinculo.papel : 'nenhum',
            decisao: decisao.tipo,
            evento: evento?.eventoId,
            identificar_ms: Math.round(identificadoEm - inicio),
            gravar_ms: Math.round(gravadoEm - identificadoEm),
            tela_ms: Math.round(fim - gravadoEm),
          })
        } finally {
          fila.current.concluir(uidHash)
        }
      })().catch((erro: Error) => {
        // Antes a falha aqui era uma promessa rejeitada sem dono: nada na tela,
        // nada em lugar nenhum. O crachá não contou, e ninguém soube por quê.
        registrar('erro_na_leitura', { mensagem: erro?.message })
        setRecado('A leitura falhou e não foi gravada. Encoste o crachá de novo.')
        tocar('desconhecido')
      })
    }
    const cancelar = leitor.aoLer(aoLer)
    // Na ordem em que chegaram, antes de qualquer leitura nova.
    for (const leitura of retidas?.() ?? []) aoLer(leitura)
    return cancelar
  }, [
    retidas,
    leitor,
    repositorio,
    config,
    sessao,
    recarregar,
    aoMudarBase,
    aoRegistrar,
    aoEncerrar,
    aCadastrar,
    pendentesAlunos,
    proximoPendente,
    vincularCracha,
  ])

  /**
   * Encerrar sem crachá.
   *
   * Mesma gravação do caminho do crachá — evento `encerrar` no log, sessão
   * fechada, resumo na tela —, e por isso o `uidHash` é o do professor que
   * abriu: a linha do log continua dizendo quem encerrou, mesmo sem toque.
   *
   * Sem janela de 10 s: ela existe porque abrir e fechar são o mesmo gesto de
   * crachá, e um clique não tem esse problema.
   */
  const aoEncerrarAgora = useCallback(() => {
    // Um clique encerra. Com a aba ocupada, a tela demorava a responder, e
    // cada clique a mais gravava outro encerramento (cinco em 2,5 s na fila
    // de 300, 23/09/2026).
    if (encerrando.current) return
    encerrando.current = true
    semDono('encerrar pelo botão', async () => {
      const agora = new Date()
      const vinculo = vinculos.find((v) => v.uidHash === sessao.uidHashProfessor)
      const rascunho = eventoDe(
        { tipo: 'encerrar', vinculo },
        { eventoId: '', quando: agora, turma: sessao.turma, uidHash: sessao.uidHashProfessor },
      )
      if (rascunho) {
        const evento = await gravarEventoNovo(repositorio, config.instalacaoId, agora, (eventoId) => ({
          ...rascunho,
          eventoId,
        }))
        registrar('encerrar', { como: 'botao', evento: evento.eventoId, presentes: presentesRef.current.size })
        await aoRegistrar?.(evento)
      }
      await repositorio.encerrarSessao()
      tocar('encerramento')
      aoEncerrar?.(
        presentesRef.current.size,
        agora.getTime() - Date.parse(sessao.abertaEm),
        fila.current.estatistica(),
      )
      aoMudarBase()
    })
  }, [config.instalacaoId, sessao, repositorio, aoRegistrar, aoEncerrar, aoMudarBase, vinculos])

  const chamadoAtual = aCadastrar
  // A fila de "Chamar nomes" (interruptor, setas, "Pular") é só dos alunos —
  // professor tem seção própria, com "Cadastrar" em vez de fila. Ver
  // `Professores`, abaixo.
  const chamadoAluno = chamadoAtual?.papel === 'aluno' ? chamadoAtual : undefined
  const suspeito = leitorSuspeito(agora, ultimaAtividadeEm, pendentesAlunos.length)

  const andarNaFila = (direcao: -1 | 1) => {
    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
    const alvo = Math.min(pendentesAlunos.length - 1, Math.max(0, indice + direcao))
    setChamadoChave(pendentesAlunos[alvo]?.chave)
  }

  const pularChamado = () => {
    if (!chamadoAluno) return
    setPulados((antes) => new Set(antes).add(chamadoAluno.chave))
    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
    setChamadoChave(proximoPendente(indice + 1))
  }

  const simular =
    ensaio && ehSimulavel(leitor)
      ? () => {
          try {
            leitor.encostarProximo()
          } catch (erro) {
            setRecado((erro as Error).message)
          }
        }
      : undefined

  const marcarComoEu = (uidHash: string | undefined) => {
    definirProfessorAtual(uidHash)
    setProfessorAtualHash(uidHash)
  }

  /** Nome ou papel de quem ainda não tem crachá: só local, até o crachá chegar. */
  const editarAntesDoCracha = (p: Matriculado, mudanca: { nome?: string; papel?: Papel }) => {
    const atual = efetivo(p)
    setEdicoes((antes) =>
      new Map(antes).set(p.chave, { nome: mudanca.nome ?? atual.nome, papel: mudanca.papel ?? atual.papel }),
    )
  }

  /**
   * Apelido de uma linha da lista. Com vínculo carregado, muda o vínculo na
   * tela (e grava ao sair do campo). Sem ele (ainda não carregou, ou não tem
   * crachá), a edição fica em `edicoes` até ele chegar.
   */
  const editarNome = (p: Matriculado, nome: string, vinculado: boolean) => {
    const vinculo = vinculado ? vinculoDe(p) : undefined
    if (!vinculo) return editarAntesDoCracha(p, { nome })
    setVinculos((antes) => antes.map((v) => (v.uidHash === vinculo.uidHash ? { ...v, nome } : v)))
    // Uma tecla anterior pode ter caído em `edicoes`; ela sai, senão
    // `efetivo` ficaria presa nela.
    setEdicoes((antes) => {
      if (!antes.has(p.chave)) return antes
      const novo = new Map(antes)
      novo.delete(p.chave)
      return novo
    })
  }

  /** Grava o apelido ao sair do campo: uma escrita por edição, não por tecla. */
  const gravarNome = (p: Matriculado) => {
    const vinculo = vinculoDe(p)
    if (vinculo) semDono('renomear vínculo', () => repositorio.gravarVinculo({ ...vinculo, nome: efetivo(p).nome }))
  }

  return (
    <section className="coleta">
      <header className="coleta__topo">
        <span>{hhmm(new Date())}</span>
        <strong>{sessao.turma}</strong>
        <span>desde {hhmm(new Date(sessao.abertaEm))}</span>
        {/* Mesmo motivo do "Concluir" da cerimônia: com "Quem falta" mostrando
            a turma inteira, o rodapé fica longe — numa turma de 49, é rolar a
            tela toda pra encontrar o único jeito de encerrar. Este não troca
            de lugar quando o recado aparece embaixo; o de baixo continua ali,
            porque terminar no fim do gesto também faz sentido. */}
        <button className="botao--acento coleta__encerrar-topo" onClick={() => aoEncerrarAgora()}>
          Encerrar
        </button>
      </header>

      <ContadorDaChamada presentes={presentes.size} linhas={linhas} />

      {/* Diferente do aviso de `suspeito`, abaixo: este é detecção de
          verdade, não palpite — o navegador sabe com certeza que a janela
          não está em foco. Vem primeiro porque é a causa mais provável de
          "nada acontece": sem foco, nenhum crachá chega aqui, ponto. */}
      {semFoco && (
        // `--forte`, não uma cor de alerta: em `--t-menor` uma cor de aviso
        // não bate o contraste mínimo (ver o comentário na própria regra) —
        // tinta cheia é o destaque que sobra sem esse risco.
        <p className="ferramentas__nota ferramentas__nota--espacada ferramentas__nota--forte">
          Esta janela perdeu o foco — o crachá não chega aqui enquanto outro
          programa estiver na frente. Clique nesta janela para voltar a ler.
        </p>
      )}

      {/* Palpite, não detecção — ver `leitorSuspeito` em `nucleo/sessao.ts`. O app não sabe
          se o dongle caiu; só sabe que faz tempo que ninguém foi lido com
          gente ainda esperando, e é a melhor pista que existe para isso. */}
      {suspeito && (
        <p className="ferramentas__nota ferramentas__nota--espacada">
          Nenhuma leitura há alguns minutos. Se alguém tentou encostar o crachá e nada
          aconteceu, confira se o leitor está conectado.
        </p>
      )}

      {pendentesAlunos.length > 0 && (
        <CartaoDoChamado
          pendentes={pendentesAlunos}
          totalDeAlunos={alunosDaTurma.length}
          chamado={chamadoAluno}
          aoLigar={() => setChamadoChave(proximoPendente(0))}
          aoDesligar={() => setChamadoChave(undefined)}
          aoAndar={andarNaFila}
          aoPular={pularChamado}
          aoSimular={simular}
        />
      )}

      {/* Some enquanto alguém está chamado: a atenção é da fila. */}
      {professoresDaTurma.length > 0 && !chamadoAluno && (
        <PainelDeProfessores
          professores={professoresDaTurma}
          vinculoDe={vinculoDe}
          efetivo={efetivo}
          chamadoChave={chamadoChave}
          professorAtual={professorAtualHash}
          aoChamar={setChamadoChave}
          aoEditarNome={(p, nome) => editarAntesDoCracha(p, { nome })}
          aoRemover={removerCracha}
          aoMarcarComoEu={marcarComoEu}
        />
      )}

      {alunosDaTurma.length > 0 && (
        <ListaDeAlunos
          alunos={alunosDaTurma}
          chavesPendentes={chavesPendentes}
          efetivo={efetivo}
          vezesDoNome={vezesDoNome}
          presencasHoje={presencasHoje}
          chamadoChave={chamadoChave}
          pulados={pulados}
          aoChamar={setChamadoChave}
          aoEditarNome={editarNome}
          aoGravarNome={gravarNome}
          aoEditarPapel={(p, papel) => editarAntesDoCracha(p, { papel })}
          aoAlterarPresenca={(p, presente) =>
            semDono(presente ? 'marcar presença' : 'tirar presença', () => alterarPresenca(p, presente))
          }
          aoRemover={removerCracha}
        />
      )}

      {procurando && (
        <Busca
          pessoas={ordemDaBusca}
          leiturasDuranteABusca={leiturasDuranteABusca}
          aviso={avisoDaBusca}
          aoDesistir={() => {
            semDono('efeito', async () => {
              const uidHash = procurando
              fecharBusca()
              const agora = new Date()
              const rascunho = eventoDe(
                { tipo: 'desconhecido' },
                { eventoId: '', quando: agora, turma: sessao.turma, uidHash },
              )
              if (rascunho) {
                const evento = await gravarEventoNovo(repositorio, config.instalacaoId, agora, (eventoId) => ({
                  ...rascunho,
                  eventoId,
                }))
                registrar('busca_desistiu', { hash: curto(uidHash), evento: evento.eventoId })
                await aoRegistrar?.(evento)
              }
              await recarregarJa()
              aoMudarBase()
            })
          }}
          aoEscolher={(pessoa) => {
            semDono('efeito', async () => {
              const uidHash = procurando
              const quando = new Date()
              fecharBusca()
              // É por aqui que o crachá real do professor costuma ser
              // identificado: crachá desconhecido, busca, "é ele" — e
              // `vincularCracha` substitui o sintético que `garantirProfessor`
              // já tenha criado, migrando a grade que apontava pro hash velho.
              await vincularCracha(pessoa, uidHash, quando)
              // A busca só abre no modo comum, com ninguém chamado (ver
              // `decidir()`) — então confirmar aqui nunca entra no modo de
              // chamar nomes sozinho. É a diferença de propósito entre os
              // dois: aqui alguém chegou sem aviso e o app perguntou quem é;
              // chamar nomes é o professor decidindo, de propósito, ir atrás
              // de quem falta.
              const rascunho = eventoDe(
                { tipo: 'cadastro', pessoa },
                { eventoId: '', quando, turma: sessao.turma, uidHash },
              )
              if (rascunho) {
                const evento = await gravarEventoNovo(repositorio, config.instalacaoId, quando, (eventoId) => ({
                  ...rascunho,
                  eventoId,
                }))
                registrar('busca_escolheu', { hash: curto(uidHash), papel: pessoa.papel, evento: evento.eventoId })
                await aoRegistrar?.(evento)
              }
              tocar('ok')
              await recarregarJa()
              aoMudarBase()
            })
          }}
        />
      )}

      {/* Uma ação, e o rodapé é dela. O crachá do professor continua encerrando
          — e a tela não diz isso, pelo mesmo motivo do repouso: anunciar dois
          caminhos para a mesma coisa faz parar para escolher. O recado, quando
          existe, fala mais alto que o botão porque é resposta a um toque. */}
      <footer className="coleta__rodape">
        {recado ? (
          <span className="coleta__recado">{recado}</span>
        ) : (
          <button className="botao--acento coleta__encerrar" onClick={() => aoEncerrarAgora()}>
            Encerrar a chamada
          </button>
        )}
        {simular && (
          <button className="coleta__simular" onClick={simular}>
            Simular
          </button>
        )}
      </footer>
    </section>
  )
}
