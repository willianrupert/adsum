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
import { calcularUidHash, uidHashSintetico } from '../nucleo/hash.ts'
import {
  contaPresenca,
  decidir,
  estatisticaDeIntervalos,
  eventoDe,
  leitorSuspeito,
  proximoEventoId,
  type Decisao,
  type EstatisticaDeIntervalos,
  type Sessao,
} from '../nucleo/sessao.ts'
import { chaveDeIdentidade, diaLocal, presencasDoDia } from '../nucleo/faltas.ts'
import type { Evento, Matriculado, Papel, Vinculo } from '../nucleo/tipos.ts'
import { tocar } from '../ambiente/som.ts'
import { ehConfirmavel, ehSimulavel } from '../portas/LeitorDeCracha.ts'
import { useAdsum } from './adsum.ts'
import { definirProfessorAtual, modoDev, professorAtual } from '../ambiente/preferencias.ts'
import { Busca } from './componentes/Busca.tsx'
import { Ondas } from './componentes/Simbolos.tsx'
import { Contador } from './componentes/Contador.tsx'
import { Painel, Selo } from './componentes/Painel.tsx'

interface Linha {
  chave: string
  nome: string
  hora: string
  tom: 'ok' | 'repetido' | 'desconhecido' | 'removido'
}

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
}) {
  const { leitor, repositorio, config } = useAdsum()

  const ensaio = modoDev()

  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  /**
   * A mesma informação, atualizada na hora.
   *
   * O estado do React só chega no render seguinte, e entre um crachá e o
   * próximo pode não haver render nenhum: numa fila rápida, duas leituras do
   * mesmo crachá liam `presentes` desatualizado e a segunda virava presença
   * nova em vez de duplicata. O contador não mudava — é um conjunto —, mas o
   * log ganhava duas linhas `ok` para a mesma pessoa.
   */
  /** A última leitura aceita de crachá de aluno. Ver `INTERVALO_MINIMO_MS`. */
  const ultima = useRef<{ uidHash: string; em: Date }>(undefined)

  /** Intervalo, em ms, de cada crachá aceito até o anterior — matéria-prima
      de `estatisticaDeIntervalos`, ao encerrar. Ver o comentário lá. */
  const intervalos = useRef<number[]>([])

  /**
   * Conta as leituras para o recado de uma não apagar o de outra.
   *
   * `mostrar` roda antes dos `await` e `confirmar` depois deles, então com dois
   * crachás quase juntos a gravação do primeiro terminava **depois** de o
   * segundo já ter escrito o aviso na tela — e o limpava. Justamente o caso que
   * a regra do intervalo existe para tornar visível.
   *
   * Achado pelo teste de tela, não a olho: em jsdom as duas leituras se
   * sobrepõem do mesmo jeito que numa mão com dois cartões.
   */
  const geracao = useRef(0)
  const jaPresentes = useRef<Set<string>>(new Set())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [recado, setRecado] = useState<string>()
  const [procurando, setProcurando] = useState<string>()
  /** Para "Remover crachá" na tabela — o vínculo de cada linha já ligada. */
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const sequencia = useRef(0)
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
  const vinculoDe = useCallback(
    (p: Matriculado): Vinculo | undefined =>
      vinculos.find((v) => (p.matricula ? v.matricula === p.matricula : v.nome === p.nome)),
    [vinculos],
  )

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
  const professoresDaTurma = useMemo(() => daTurma.filter((p) => p.papel === 'professor'), [daTurma])
  /** Só para a legenda do painel fechado — sem isto, "Professores" sozinho
      não diz se falta alguém, e o professor teria que abrir pra saber. */
  const professoresVinculados = useMemo(
    () => professoresDaTurma.filter((p) => vinculoDe(p)).length,
    [professoresDaTurma, vinculoDe],
  )

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
  const recarregar = useCallback(async () => {
    const [eventos, vinculosAtuais] = await Promise.all([
      // Só a turma desta aula: o índice já existe, e ler a base inteira do
      // professor a cada crachá não tinha por que acontecer aqui. Ver
      // `docs/05_plano_execucao.md`, Fase 4, item B.
      repositorio.listarEventos({ turma: sessao.turma }),
      repositorio.listarVinculos(),
    ])
    setVinculos(vinculosAtuais)
    const daAula = eventos.filter(
      (e) => e.turma === sessao.turma && e.quando >= sessao.abertaEm,
    )
    sequencia.current = eventos.length
    // Crachá de professor nunca conta presença — nem o próprio cadastro dele
    // (ver `contaPresenca`, em `nucleo/sessao.ts`). O evento no log não
    // carrega `papel` — não é dado da chamada, é dado da pessoa —, então quem
    // desempata aqui é o vínculo atual: hash de professor sai da contagem,
    // mesmo reconstruindo do zero depois de um recarregamento.
    const hashesDeProfessor = new Set(
      vinculosAtuais.filter((v) => v.papel === 'professor').map((v) => v.uidHash),
    )
    const conjunto = new Set(
      daAula
        .filter((e) => e.origem === 'cracha' && e.resultado === 'ok' && !hashesDeProfessor.has(e.uidHash))
        .map((e) => e.uidHash),
    )
    jaPresentes.current = conjunto
    setPresentes(conjunto)
    setPresencasHoje(presencasDoDia(daAula, sessao.turma, dia))
    setLinhas(
      daAula
        // Correção manual entra na mesma lista — é a mesma área da tela que
        // mostra "o que está acontecendo agora", e uma remoção é parte disso
        // tanto quanto um crachá aceito.
        .filter((e) => e.origem === 'cracha' || e.origem === 'manual')
        .slice(0, 6)
        .map((e) => ({
          chave: e.eventoId,
          // A recusa por dois crachás não tem nome — e "Crachá não cadastrado"
          // ali seria mentira, além de mandar o professor procurar a pessoa numa
          // lista onde ela pode muito bem estar.
          nome:
            e.resultado === 'rapido_demais'
              ? 'Dois crachás de uma vez'
              : e.nome || 'Crachá não cadastrado',
          hora: hhmm(new Date(e.quando)),
          // `rapido_demais` cai no tom de 'desconhecido' de propósito: os dois
          // são recusa, e a lista não precisa de um terceiro vermelho.
          // Remoção manual (`'removido'`) ganha o tom próprio — vermelho, como
          // qualquer recusa — pra a lista continuar mostrando o estado atual,
          // não só chegadas.
          tom:
            e.origem === 'manual'
              ? e.resultado === 'removido'
                ? 'removido'
                : 'ok'
              : e.resultado === 'ok'
                ? 'ok'
                : e.resultado === 'duplicado'
                  ? 'repetido'
                  : 'desconhecido',
        })),
    )
  }, [repositorio, sessao, dia])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

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
            (v.sintetico || (pessoa.matricula ? v.matricula === pessoa.matricula : v.nome === pessoa.nome)),
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
      const vinculo = vinculoDe(p)
      if (!vinculo) return
      if (!confirm(`Desvincular o crachá de ${p.nomeCompleto}?`)) return
      void (async () => {
        await repositorio.removerVinculo(vinculo.uidHash)
        await recarregar()
        aoMudarBase()
      })()
    },
    [vinculoDe, repositorio, recarregar, aoMudarBase],
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
   * Não mexe no contador do topo (`presentes.size`) — esse é o dedup em
   * tempo real da fila de leitura, com garantia própria contra crachá
   * duplo; misturar os dois aqui trocaria uma contagem defendida por
   * comentário por uma nova, sem a mesma garantia. `presencasHoje` é a
   * fonte certa pra "esta linha está presente agora".
   */
  const alterarPresenca = useCallback(
    async (p: Matriculado, presente: boolean) => {
      const evento: Evento = {
        eventoId: proximoEventoId(config.instalacaoId, new Date(), ++sequencia.current),
        quando: new Date().toISOString(),
        turma: p.turma,
        matricula: p.matricula || undefined,
        nome: efetivo(p).nome,
        origem: 'manual',
        resultado: presente ? 'ok' : 'removido',
        uidHash: uidHashSintetico(),
      }
      await repositorio.acrescentarEvento(evento)
      await aoRegistrar?.(evento)
      await recarregar()
      aoMudarBase()
    },
    [config.instalacaoId, efetivo, repositorio, aoRegistrar, recarregar, aoMudarBase],
  )

  useEffect(() => {
    return leitor.aoLer((leitura) => {
      setUltimaAtividadeEm(leitura.em)
      void (async () => {
        const minha = ++geracao.current
        const uidHash = await calcularUidHash(config.salHex, leitura.uid)
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        const decisao = decidir(uidHash, {
          sessao,
          vinculo,
          chamado: aCadastrar,
          jaPresentes: jaPresentes.current,
          ultima: ultima.current,
          agora: leitura.em,
        })

        // Antes de qualquer `await`, como `jaPresentes`: dois crachás de uma mão
        // chegam em centenas de milissegundos, e o segundo não pode encontrar
        // este valor desatualizado — seria a fraude passando pela porta que a
        // regra existe para fechar.
        //
        // A recusa **não** conta como leitura: assim a janela segue medida a
        // partir do último crachá aceito, e insistir depressa não a reinicia.
        //
        // Só `presenca`/`cadastro` vira amostra: `repetido` é o mesmo crachá
        // relido (outro ritmo, não interessa aqui), e sem `ultima.current`
        // ainda não há par para medir — é o primeiro crachá da fila.
        if (ultima.current && (decisao.tipo === 'presenca' || decisao.tipo === 'cadastro')) {
          intervalos.current.push(leitura.em.getTime() - ultima.current.em.getTime())
        }
        if (decisao.tipo !== 'rapido_demais' && vinculo?.papel !== 'professor') {
          ultima.current = { uidHash, em: leitura.em }
        }

        // Entra no conjunto antes de qualquer `await`: é isso que faz a leitura
        // seguinte já saber que esta pessoa passou. Cadastro de professor
        // (o "Cadastrar" explícito da seção de professores) não entra — ver
        // `contaPresenca`: é o professor gravando o próprio crachá, não
        // alguém chegando como aluno.
        if (contaPresenca(decisao)) {
          jaPresentes.current.add(uidHash)
        }

        // Crachá que ninguém reconhece, sem ninguém chamado (modo comum):
        // pergunta de quem é, ali, na hora, com a pessoa na frente. Nada é
        // gravado enquanto ela não responder. Com alguém chamado, ver o
        // `cadastro` logo abaixo — não passa por aqui.
        //
        // Desistir continua sendo um clique fora: quem não quiser vincular
        // agora fecha, e o registro fica como crachá não cadastrado.
        if (decisao.tipo === 'desconhecido') {
          setProcurando(uidHash)
          tocar('desconhecido')
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

        const evento = eventoDe(decisao, {
          eventoId: proximoEventoId(config.instalacaoId, leitura.em, ++sequencia.current),
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
        mostrar(decisao)

        if (evento) {
          await repositorio.acrescentarEvento(evento)
          await aoRegistrar?.(evento)
          // O LED do leitor serial significa "está salvo", como o bipe: só
          // depois da gravação. Leitor de teclado não tem como confirmar.
          if (ehConfirmavel(leitor)) void leitor.confirmarGravacao()
        }
        if (decisao.tipo === 'encerrar') {
          await repositorio.encerrarSessao()
          aoEncerrar?.(
            jaPresentes.current.size,
            leitura.em.getTime() - Date.parse(sessao.abertaEm),
            estatisticaDeIntervalos(intervalos.current),
          )
        }

        confirmar(decisao, evento, minha)
        await recarregar()
        aoMudarBase()
      })()
    })
  }, [
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
    void (async () => {
      const agora = new Date()
      const vinculo = vinculos.find((v) => v.uidHash === sessao.uidHashProfessor)
      const evento = eventoDe(
        { tipo: 'encerrar', vinculo },
        {
          eventoId: proximoEventoId(config.instalacaoId, agora, ++sequencia.current),
          quando: agora,
          turma: sessao.turma,
          uidHash: sessao.uidHashProfessor,
        },
      )
      if (evento) {
        await repositorio.acrescentarEvento(evento)
        await aoRegistrar?.(evento)
      }
      await repositorio.encerrarSessao()
      tocar('encerramento')
      aoEncerrar?.(
        jaPresentes.current.size,
        agora.getTime() - Date.parse(sessao.abertaEm),
        estatisticaDeIntervalos(intervalos.current),
      )
      aoMudarBase()
    })()
  }, [config.instalacaoId, sessao, repositorio, aoRegistrar, aoEncerrar, aoMudarBase, vinculos])

  /**
   * Antes de gravar: só pixels, para a fila nunca esperar o disco.
   *
   * O nome **não** pisca no lugar do contador. Celebrar cada leitura cansa
   * depois da quinta, e com um crachá a cada 1,5 s vira ruído — o feedback é a
   * linha que chega no topo da lista e o número que sobe. Calmo aguenta a aula
   * inteira; festivo não.
   */
  function mostrar(decisao: Decisao) {
    if (decisao.tipo === 'cedo_demais') {
      setRecado(`Para encerrar, encoste de novo em ${Math.ceil(decisao.faltamMs / 1000)} s.`)
    }
    // Este é o único recado da tela que serve ao **professor** e não a quem
    // encostou: o app não sabe distinguir fraude de fila apressada, mas sabe
    // dizer que o padrão é fisicamente implausível. Quem julga está na sala.
    if (decisao.tipo === 'rapido_demais') {
      setRecado('Dois crachás quase juntos. O segundo não foi contado. Passe um de cada vez.')
    }
  }

  /** Depois de gravar: o som. Bipe significa "está salvo". */
  function confirmar(decisao: Decisao, evento?: Evento, minha = geracao.current) {
    // Só limpa o que era **desta** leitura: se outra chegou no meio, o recado na
    // tela é dela, e apagá-lo escondia a recusa de dois crachás juntos.
    const limpar = () => minha === geracao.current && setRecado(undefined)

    switch (decisao.tipo) {
      case 'presenca':
      case 'cadastro':
        limpar()
        return tocar('ok')
      case 'repetido':
        limpar()
        return tocar('repetido')
      case 'desconhecido':
        return tocar('desconhecido')
      case 'rapido_demais':
        return tocar('desconhecido')
      case 'cedo_demais':
        return tocar('desconhecido')
      case 'encerrar':
        return tocar('encerramento')
      default:
        if (evento) tocar('ok')
    }
  }

  const chamadoAtual = aCadastrar
  // A fila de "Chamar nomes" (interruptor, setas, "Pular") é só dos alunos —
  // professor tem seção própria, com "Cadastrar" em vez de fila. Ver
  // `Professores`, abaixo.
  const chamadoAluno = chamadoAtual?.papel === 'aluno' ? chamadoAtual : undefined
  const suspeito = leitorSuspeito(agora, ultimaAtividadeEm, pendentesAlunos.length)

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

      <div className="coleta__corpo">
        <div className="coleta__contador">
          <p className="coleta__numero">
            <Contador valor={presentes.size} />
          </p>
          <p className="coleta__rotulo">{presentes.size === 1 ? 'presente' : 'presentes'}</p>
        </div>

        <ol className="coleta__lista">
          {linhas.length === 0 && <li className="coleta__vazio">Aproxime o crachá</li>}
          {linhas.map((l) => (
            <li key={l.chave} className={`coleta__linha coleta__linha--${l.tom}`}>
              <span>{l.nome}</span>
              <time>{l.hora}</time>
            </li>
          ))}
        </ol>
      </div>

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

      {/* Um interruptor só, sempre no mesmo lugar, alterna entre os dois
          modos — não dois botões em dois lugares diferentes. Desligado é o
          modo comum: o app não sabe (nem deveria adivinhar) se quem vai
          encostar o próximo crachá é alguém específico, só sabe quantos já
          têm crachá. Ligado, o professor está de propósito observando o
          próximo da fila — mesmo gesto de clicar "Chamar" numa linha da
          tabela abaixo, só que pelo topo. */}
      {pendentesAlunos.length > 0 && (
        <section className="chamado">
          <div className="chamado__interruptor">
            <span className="chamado__interruptor-textos">
              <span className="chamado__interruptor-rotulo">Chamar nomes</span>
              {/* Muda com o estado, de propósito: o toggle sozinho diz "ligado
                  ou desligado", não "ligado ou desligado **do quê**". Sem
                  isto, "Chamar nomes" lido frio não diz o que o interruptor
                  faz — só que existe. */}
              <span className="chamado__interruptor-estado">
                {chamadoAluno
                  ? 'Ligado: o próximo crachá vira desta pessoa'
                  : 'Desligado: crachá desconhecido abre a busca'}
              </span>
            </span>
            <button
              role="switch"
              aria-checked={!!chamadoAluno}
              aria-label="Chamar nomes"
              className="interruptor"
              onClick={() =>
                setChamadoChave(chamadoAluno ? undefined : proximoPendente(0))
              }
            >
              <span className="interruptor__bolinha" aria-hidden="true" />
            </button>
          </div>

          {chamadoAluno ? (
            <>
              <Ondas tamanho={54} animado />
              <p className="chamado__rotulo">Encoste o crachá de</p>
              <p className="chamado__nome">{chamadoAluno.nome}</p>
              <p className="chamado__completo">
                {chamadoAluno.nomeCompleto} · {chamadoAluno.papel}
              </p>
              <div className="chamado__acoes">
                <button
                  onClick={() => {
                    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
                    setChamadoChave(pendentesAlunos[Math.max(0, indice - 1)]?.chave)
                  }}
                  aria-label="anterior"
                  disabled={pendentesAlunos.findIndex((p) => p.chave === chamadoChave) <= 0}
                >
                  ←
                </button>
                <button
                  onClick={() => {
                    setPulados((antes) => new Set(antes).add(chamadoAluno.chave))
                    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
                    setChamadoChave(proximoPendente(indice + 1))
                  }}
                >
                  Pular
                </button>
                <button
                  onClick={() => {
                    const indice = pendentesAlunos.findIndex((p) => p.chave === chamadoChave)
                    setChamadoChave(pendentesAlunos[Math.min(pendentesAlunos.length - 1, indice + 1)]?.chave)
                  }}
                  aria-label="próximo"
                  disabled={
                    pendentesAlunos.findIndex((p) => p.chave === chamadoChave) >= pendentesAlunos.length - 1
                  }
                >
                  →
                </button>
              </div>
              <p className="chamado__atalho">← e → andam pela fila</p>

              {ensaio && ehSimulavel(leitor) && (
                <div className="chamado__acoes">
                  <button
                    onClick={() => {
                      try {
                        leitor.encostarProximo()
                      } catch (erro) {
                        setRecado((erro as Error).message)
                      }
                    }}
                  >
                    Simular um crachá
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Animado nos dois estados do interruptor, de propósito: o
                  leitor está ligado o tempo todo, ligado ou desligado o
                  "chamar nomes" — o pulsar é o único sinal de "o sistema está
                  lendo" que a tela dá, e parar de pulsar aqui leria como o
                  leitor tendo caído. Era o único símbolo da tela antes de
                  "Aproxime o crachá", ali em cima, sair por redundância. */}
              <Ondas tamanho={54} animado />
              {/* Quantos já têm crachá, não quantos faltam — o mesmo número
                  visto de progresso, não de pendência. Numa turma de 56, "56
                  sem crachá" no início da aula é só o tamanho da turma dito
                  de propósito assustador; "3 de 56 com crachá" é o mesmo
                  dado contando o que já aconteceu. */}
              <p className="chamado__rotulo">
                {alunosDaTurma.length - pendentesAlunos.length} de {alunosDaTurma.length} com crachá
              </p>
            </>
          )}
        </section>
      )}

      {/* Professores ganham seção própria, acima da lista de alunos: o
          cadastro deles é sempre um clique explícito em "Cadastrar", nunca a
          fila automática de "Chamar nomes" — que é só dos alunos, logo
          abaixo. Some enquanto essa fila está com alguém chamado: a atenção
          é dela nesse momento, e um professor pendente volta a aparecer
          assim que ela esvazia ou termina. */}
      {professoresDaTurma.length > 0 && !chamadoAluno && (
        <Painel
          titulo="Professores"
          recolhivel
          legenda={`${professoresVinculados} de ${professoresDaTurma.length} com crachá`}
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome exibido</th>
                <th>Papel</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {professoresDaTurma.map((p) => {
                const vinculo = vinculoDe(p)
                const vinculado = !!vinculo
                const e = efetivo(p)
                const chamando = p.chave === chamadoChave
                return (
                  <tr key={p.chave} className={chamando ? 'linha--chamada' : ''}>
                    <td>
                      {/* Mesma assimetria que a tabela de alunos já resolvia:
                          antes do crachá, o apelido nasceu do SIGAA e pode
                          estar errado — depois, corrigir é em Ajustes →
                          Vínculos, não aqui. Só faltava replicar pro
                          professor quando a seção dele ganhou tabela própria
                          (Fase 1). */}
                      {vinculado ? (
                        <>
                          {e.nome}
                          <span className="tabela__apoio">{p.nomeCompleto}</span>
                        </>
                      ) : (
                        <>
                          <input
                            className="entrada--celula"
                            value={e.nome}
                            onChange={(evento) =>
                              setEdicoes((antes) => {
                                const novo = new Map(antes)
                                novo.set(p.chave, { nome: evento.target.value, papel: e.papel })
                                return novo
                              })
                            }
                            aria-label={`nome de ${p.nomeCompleto}`}
                          />
                          <span className="tabela__apoio">{p.nomeCompleto}</span>
                        </>
                      )}
                    </td>
                    <td className="celula--estado">{e.papel}</td>
                    <td className="celula--estado">
                      {chamando ? (
                        <>
                          <Selo tom="ok">Cadastrando</Selo>
                          {/* Sem isto, clicar "Cadastrar" de novo em alguém
                              não tinha volta — a única saída era encostar um
                              crachá de verdade ou recarregar a página. */}
                          <button
                            className="botao--quieto"
                            onClick={() => setChamadoChave(undefined)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {vinculado && <Selo tom="ok">Vinculado</Selo>}
                          {!vinculado && (
                            <button onClick={() => setChamadoChave(p.chave)}>Cadastrar</button>
                          )}
                          {/* Mesma correção de crachá trocado que "Quem
                              falta" já tem — ver `removerCracha`, acima. */}
                          {vinculado && (
                            <button className="botao--grave" onClick={() => removerCracha(p)}>
                              Remover crachá
                            </button>
                          )}
                          {/* "Sou eu": personaliza a saudação do repouso sem
                              mexer no vínculo — ver `professorAtual`, em
                              `preferencias.ts`. */}
                          {vinculo &&
                            (professorAtualHash === vinculo.uidHash ? (
                              <>
                                <Selo tom="ok">Você</Selo>
                                <button
                                  className="botao--quieto"
                                  onClick={() => {
                                    definirProfessorAtual(undefined)
                                    setProfessorAtualHash(undefined)
                                  }}
                                >
                                  Não sou eu
                                </button>
                              </>
                            ) : (
                              <button
                                className="botao--quieto"
                                onClick={() => {
                                  definirProfessorAtual(vinculo.uidHash)
                                  setProfessorAtualHash(vinculo.uidHash)
                                }}
                              >
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
      )}

      {alunosDaTurma.length > 0 && (
        <Painel
          titulo="Lista de alunos"
          legenda={`${pendentesAlunos.length} de ${alunosDaTurma.length} sem crachá`}
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome exibido</th>
                <th>Papel</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alunosDaTurma.map((p) => {
                const vinculado = !pendentesAlunos.some((x) => x.chave === p.chave)
                const e = efetivo(p)
                const repetido = alunosDaTurma.filter((x) => efetivo(x).nome === e.nome).length > 1
                // Presente hoje, com ou sem crachá — a mesma regra de
                // `planilhaDeFaltas`, ver `presencasHoje` acima.
                const presente = presencasHoje.get(chaveDeIdentidade(p))?.presente ?? false
                return (
                  <tr key={p.chave} className={p.chave === chamadoChave ? 'linha--chamada' : ''}>
                    <td>
                      {/* O nome curto continua sendo o que se chama em voz
                          alta. Editável sempre — vinculado ou não —, porque um
                          apelido puxado errado do SIGAA continuava errado pra
                          sempre depois do crachá chegar, a não ser que o
                          professor soubesse ir em Ajustes → Vínculos corrigir
                          lá. O completo entra como apoio, pra achar quem é na
                          lista sem depender de decorar o apelido de tela. */}
                      <input
                        className="entrada--celula entrada--recuada"
                        value={e.nome}
                        onChange={(evento) => {
                          const novoNome = evento.target.value
                          // `vinculoDe(p)` pode não achar nada mesmo com
                          // `vinculado === true`: `vinculos` só carrega depois
                          // de `recarregar()` (assíncrono, roda ao montar), e
                          // `vinculado` vem de `pendentes` (prop, já pronta) —
                          // as duas fontes não chegam juntas. Editar bem nesse
                          // instante caía num `return` mudo, e a tecla digitada
                          // sumia sem gravar nada. `edicoes` (o mesmo caminho
                          // de quem ainda não tem crachá) segura o texto até o
                          // vínculo aparecer — `efetivo()` sempre prioriza a
                          // edição sobre o `vinculo.nome` cru.
                          const vinculo = vinculado ? vinculoDe(p) : undefined
                          if (vinculo) {
                            // Só o estado local muda a cada tecla — igual a
                            // `TelaRepositorio.tsx` (Ajustes → Vínculos).
                            // Gravar no Dexie é o `onBlur`, abaixo: uma
                            // escrita por edição, não uma por tecla.
                            setVinculos((antes) =>
                              antes.map((v) =>
                                v.uidHash === vinculo.uidHash ? { ...v, nome: novoNome } : v,
                              ),
                            )
                            // Uma tecla anterior pode ter caído no fallback
                            // acima (vínculo ainda não carregado naquele
                            // instante) — essa entrada precisa sumir agora,
                            // senão `efetivo()` fica presa nela pra sempre
                            // (prioriza `edicoes`), ignorando as teclas que
                            // `vinculos` já está recebendo certinho a partir
                            // daqui. Sem isto: digitar rápido o bastante para
                            // pegar essa janela travava o campo eternamente
                            // no que foi digitado no primeiro instante.
                            setEdicoes((antes) => {
                              if (!antes.has(p.chave)) return antes
                              const novo = new Map(antes)
                              novo.delete(p.chave)
                              return novo
                            })
                          } else {
                            setEdicoes((antes) => {
                              const novo = new Map(antes)
                              novo.set(p.chave, { nome: novoNome, papel: e.papel })
                              return novo
                            })
                          }
                        }}
                        onBlur={() => {
                          if (!vinculado) return
                          const vinculo = vinculoDe(p)
                          // `efetivo(p).nome`, não `vinculo.nome`: se a
                          // digitação caiu em `edicoes` (vínculo ainda não
                          // carregado durante o `onChange`, acima), é lá que
                          // o texto mais novo está — `vinculo.nome` sozinho
                          // gravaria o nome antigo de volta. `efetivo()` já
                          // decide qual dos dois vale.
                          if (vinculo) void repositorio.gravarVinculo({ ...vinculo, nome: efetivo(p).nome })
                        }}
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
                          onChange={(evento) =>
                            setEdicoes((antes) => {
                              const novo = new Map(antes)
                              novo.set(p.chave, { nome: e.nome, papel: evento.target.value as Papel })
                              return novo
                            })
                          }
                          aria-label={`papel de ${p.nomeCompleto}`}
                        >
                          <option value="aluno">Aluno</option>
                          <option value="professor">Professor</option>
                        </select>
                      )}
                      {repetido && <Selo tom="grave">Nome repetido</Selo>}
                    </td>
                    {/* "Chamar" some depois de vinculado, de propósito — até
                        11/09/2026 continuava disponível como "Mais um
                        crachá", pra permitir segunda via sem sair da tabela.
                        Tirado: nem aluno nem professor deveria acumular mais
                        de um crachá vinculado ao mesmo tempo. Perdeu o
                        cartão? "Remover crachá" desfaz o vínculo — sem
                        apagar presença já gravada, eventos não se apagam —,
                        e a pessoa volta a "quem falta", pronta pro crachá
                        novo entrar pelo caminho comum. */}
                    <td className="celula--estado">
                      {p.chave === chamadoChave ? (
                        <Selo tom="ok">Chamando</Selo>
                      ) : (
                        <>
                          {vinculado && <Selo tom="ok">Vinculado</Selo>}
                          {!vinculado && pulados.has(p.chave) && <Selo tom="neutro">Pulado</Selo>}
                          {!vinculado && (
                            <button onClick={() => setChamadoChave(p.chave)}>Chamar</button>
                          )}
                          {/* Presente/Não presente: com crachá ou sem, a
                              mesma correção manual que "Ver presenças" já
                              fazia — só que sem sair da chamada. Não mexe no
                              vínculo, só no registro do dia. */}
                          {presente ? (
                            <button
                              className="botao--quieto"
                              onClick={() => void alterarPresenca(p, false)}
                            >
                              Não presente
                            </button>
                          ) : (
                            <button onClick={() => void alterarPresenca(p, true)}>Presente</button>
                          )}
                          {/* Corrige um crachá vinculado à pessoa errada sem
                              sair da chamada — ver o comentário de
                              `removerCracha`, acima. Não apaga presença já
                              gravada: eventos não se apagam. */}
                          {vinculado && (
                            <button className="botao--grave" onClick={() => removerCracha(p)}>
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
      )}

      {procurando && (
        <Busca
          pessoas={ordemDaBusca}
          aoDesistir={() => {
            void (async () => {
              const uidHash = procurando
              setProcurando(undefined)
              const evento = eventoDe(
                { tipo: 'desconhecido' },
                {
                  eventoId: proximoEventoId(config.instalacaoId, new Date(), ++sequencia.current),
                  quando: new Date(),
                  turma: sessao.turma,
                  uidHash,
                },
              )
              if (evento) {
                await repositorio.acrescentarEvento(evento)
                await aoRegistrar?.(evento)
              }
              await recarregar()
              aoMudarBase()
            })()
          }}
          aoEscolher={(pessoa) => {
            void (async () => {
              const uidHash = procurando
              const quando = new Date()
              setProcurando(undefined)
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
              const evento = eventoDe(
                { tipo: 'cadastro', pessoa },
                {
                  eventoId: proximoEventoId(config.instalacaoId, quando, ++sequencia.current),
                  quando,
                  turma: sessao.turma,
                  uidHash,
                },
              )
              if (evento) {
                await repositorio.acrescentarEvento(evento)
                await aoRegistrar?.(evento)
              }
              tocar('ok')
              await recarregar()
              aoMudarBase()
            })()
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
        {ensaio && ehSimulavel(leitor) && (
          <button
            className="coleta__simular"
            onClick={() => {
              try {
                leitor.encostarProximo()
              } catch (erro) {
                setRecado((erro as Error).message)
              }
            }}
          >
            Simular
          </button>
        )}
      </footer>
    </section>
  )
}
