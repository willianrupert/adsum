// A aula acontecendo.
//
// Tudo aqui é função pura: dado o estado da sessão e um crachá, o que fazer.
// A tela só desenha o que estas funções decidem — assim a regra que importa
// (quem conta presença, quem não conta, quando a aula pode fechar) fica onde
// dá para testar, e não dentro de um manipulador de clique.

import type { Evento, Matriculado, Papel, Vinculo } from './tipos.ts'

/**
 * Quem, de uma lista de matriculados, ainda não tem crachá.
 *
 * A pessoa é reconhecida pela matrícula — e, para quem não tem matrícula na
 * página do SIGAA (docente), pelo nome. Sem esta segunda via o professor
 * contaria como pendente para sempre: `!m.matricula` seria verdade toda vez.
 * Sem filtrar por papel: uma turma pode ter mais de um docente, e só o
 * primeiro ganha vínculo sintético (`garantirProfessor`, em `Fluxo.tsx`) — o
 * segundo continua pendente de verdade, e precisa aparecer como qualquer
 * outra pessoa sem crachá, não sumir por ser professor.
 */
export function quemFalta(matriculados: Matriculado[], vinculos: Vinculo[]): Matriculado[] {
  const porMatricula = new Set(vinculos.map((v) => v.matricula).filter(Boolean))
  const porNome = new Set(vinculos.map((v) => v.nome))
  return matriculados.filter((m) => (m.matricula ? !porMatricula.has(m.matricula) : !porNome.has(m.nome)))
}

/**
 * Janela mínima antes de aceitar o fechamento.
 *
 * O professor encosta duas vezes sem querer com facilidade — e sem esta janela
 * a segunda leitura encerra a aula que a primeira acabou de abrir, na frente da
 * turma.
 *
 * Dez segundos: o suficiente para separar dois toques do mesmo gesto, e pouco
 * o bastante para não atrapalhar quem precisa reabrir a aula por engano de
 * verdade. Sessenta era proteção contra um problema que dura dois.
 */
export const JANELA_MINIMA_MS = 10_000

/**
 * Intervalo mínimo entre **crachás diferentes**.
 *
 * Pedido pelo Prof. Paulo: impedir que alguém encoste dois crachás de uma vez —
 * o seu e o de um colega ausente — passando os dois como se fossem duas
 * pessoas.
 *
 * **Este número ainda não foi medido, e é preciso dizer isso.** Começou em um
 * segundo, por estimativa minha de que "duas pessoas numa fila levam segundos".
 * O autor, que já viu a fila, corrigiu: no fim da aula todo mundo quer sair, as
 * pessoas se encavalam no leitor, e um segundo trava justamente o momento de
 * maior pressa. Estimativa contra observação, a observação ganha.
 *
 * 400 ms é o novo palpite, e a escolha é assimétrica de propósito:
 *
 * - **Errar bloqueando** custa um toque a mais. O cartão ainda está na mão, a
 *   tela diz o motivo, a pessoa encosta de novo. Segundos de vida.
 * - **Errar deixando passar** grava presença de quem não estava.
 *
 * Como o custo de bloquear é pequeno, vale bloquear cedo — mas não tão cedo que
 * a fila sinta. Dois cartões na mesma mão dependem do ciclo de varredura do
 * leitor, tipicamente 200 a 500 ms; uma pessoa trocando de lugar com outra
 * precisa mover o braço.
 *
 * **O jeito certo de acertar isto é medir**, e a tela de diagnóstico passou a
 * mostrar o intervalo entre leituras justamente para isso: com o dongle na mão e
 * uma fila de verdade, dá para ler os números e trocar o palpite por dado.
 *
 * **O que a regra não faz, e precisa estar dito:** ela não distingue fraude de
 * fila apressada, e não pega o caso mais comum — alguém encostar o crachá de um
 * colega ausente sozinho, com calma. Nenhuma regra de tempo pega isso. O que ela
 * faz é recusar o padrão fisicamente implausível e **dizer em voz alta**, para o
 * professor, que está na sala, olhar. Julgar é dele.
 *
 * Recusar em silêncio seria pior que não ter regra: a presença sumiria sem
 * ninguém saber por quê.
 */
export const INTERVALO_MINIMO_MS = 400

export interface EstatisticaDeIntervalos {
  minimoMs: number
  maximoMs: number
  medioMs: number
  amostras: number
}

/**
 * Mínimo, máximo e média dos intervalos entre crachás diferentes numa
 * chamada — o dado que troca `INTERVALO_MINIMO_MS` de palpite por medição,
 * de uma aula de verdade, sem precisar da tela de diagnóstico aberta ao
 * mesmo tempo que a fila anda. Cada item de `intervalos` já é a diferença em
 * ms entre um crachá aceito e o anterior (`TelaAula` só empilha aqui a mesma
 * régua que `decidir` usa para `rapido_demais` — leituras aceitas, de gente
 * diferente, nunca o mesmo crachá relido nem o crachá do professor).
 */
export function estatisticaDeIntervalos(intervalos: number[]): EstatisticaDeIntervalos | undefined {
  if (intervalos.length === 0) return undefined
  return {
    minimoMs: Math.min(...intervalos),
    maximoMs: Math.max(...intervalos),
    medioMs: Math.round(intervalos.reduce((soma, ms) => soma + ms, 0) / intervalos.length),
    amostras: intervalos.length,
  }
}

export interface Sessao {
  turma: string
  abertaEm: string
  /** Quem abriu. Só o crachá dele encerra. */
  uidHashProfessor: string
}

export type Decisao =
  /** `vinculo` é de quem abriu — sem ele, o evento de abertura no log fica
      sem nome, mesmo tendo o `uid_hash` de sobra pra achar de quem era. */
  | { tipo: 'abrir'; turma: string; vinculo?: Vinculo }
  /** Crachá novo com um nome chamado: cadastra **e** conta presença. */
  | { tipo: 'cadastro'; pessoa: Matriculado }
  | { tipo: 'encerrar'; vinculo?: Vinculo }
  | { tipo: 'cedo_demais'; faltamMs: number }
  | { tipo: 'presenca'; vinculo: Vinculo }
  | { tipo: 'repetido'; vinculo: Vinculo }
  | { tipo: 'desconhecido' }
  /** Dois crachás diferentes quase juntos. Ver `INTERVALO_MINIMO_MS`. */
  | { tipo: 'rapido_demais'; faltamMs: number }
  | { tipo: 'sem_turma' }

export interface Contexto {
  sessao?: Sessao
  vinculo?: Vinculo
  /**
   * Quem está chamado, se houver — ver o comentário em `decidir()`, abaixo.
   *
   * Só existe quando o professor **escolheu explicitamente** chamar essa
   * pessoa (botão "Chamar", ou as setas): nunca é preenchido sozinho pela
   * tela ao abrir a chamada. É essa explicitude que torna seguro confiar
   * nele aqui — ver `TelaAula`.
   */
  chamado?: Matriculado
  /** `uid_hash` de quem já foi registrado nesta sessão. */
  jaPresentes: ReadonlySet<string>
  /** A última leitura aceita, para separar dois crachás de um gesto só. */
  ultima?: { uidHash: string; em: Date }
  turmaSugerida?: string
  agora: Date
}

/**
 * O que fazer com um crachá encostado.
 *
 * Crachá de professor abre e encerra, e **nunca conta presença** — sem isso ele
 * marcaria presença para si mesmo e a aula nunca abriria. Crachá desconhecido
 * não interrompe nada: vira linha vermelha e a fila continua.
 */
export function decidir(uidHash: string, ctx: Contexto): Decisao {
  const { sessao, vinculo, jaPresentes, agora } = ctx

  if (vinculo?.papel === ('professor' satisfies Papel)) {
    if (!sessao) {
      if (!ctx.turmaSugerida) return { tipo: 'sem_turma' }
      return { tipo: 'abrir', turma: ctx.turmaSugerida, vinculo }
    }
    const decorrido = agora.getTime() - Date.parse(sessao.abertaEm)
    if (decorrido < JANELA_MINIMA_MS) {
      return { tipo: 'cedo_demais', faltamMs: JANELA_MINIMA_MS - decorrido }
    }
    return { tipo: 'encerrar', vinculo }
  }

  // Dois crachás diferentes quase juntos não são duas pessoas — é uma mão com
  // dois cartões. Vem depois do professor de propósito: bloquear quem abre e
  // encerra a aula seria atrapalhar sem proteger nada, porque o crachá dele não
  // é o vetor da fraude.
  //
  // Encostar **o mesmo** crachá duas vezes segue sendo `repetido`, que é outro
  // assunto e já tem resposta.
  if (ctx.ultima && ctx.ultima.uidHash !== uidHash) {
    const desde = agora.getTime() - ctx.ultima.em.getTime()
    if (desde < INTERVALO_MINIMO_MS) {
      return { tipo: 'rapido_demais', faltamMs: INTERVALO_MINIMO_MS - desde }
    }
  }

  // Crachá desconhecido com nome chamado é cadastro. Chegou a virar sempre
  // busca, por um dia (11/09/2026): a ideia era que "um só nome chamado por
  // vez" não bastava, porque a fila física podia não bater com a ordem da
  // tela. Isso é verdade quando o chamado é automático — a tela escolhendo
  // sozinha o primeiro pendente assim que a chamada abre, sem o professor ter
  // pedido nada. Nesse caso o nome na tela não significa "alguém está sendo
  // chamado agora", só "existe gente sem crachá" — e aí confiar nele é
  // adivinhação, não confirmação.
  //
  // A correção não foi tirar a confiança do chamado — foi parar de setá-lo
  // sozinho. `TelaAula` só chama alguém por ação explícita do professor
  // (botão "Chamar", as setas): o modo comum, padrão, não
  // chama ninguém, e crachá desconhecido nesse modo cai em `desconhecido`
  // de qualquer jeito — a busca ainda existe, só que para o caso real que
  // ela resolve (quem chegou sem aviso), não como substituto de uma garantia
  // que já existia. Quando o professor entra no modo de chamar nomes de
  // propósito, ele está olhando aquela pessoa encostar — é aí que confiar no
  // chamado volta a ser seguro, e cadastrar direto sem perguntar de novo é o
  // gesto certo, não um atalho perigoso.
  if (!vinculo) return ctx.chamado ? { tipo: 'cadastro', pessoa: ctx.chamado } : { tipo: 'desconhecido' }
  if (jaPresentes.has(uidHash)) return { tipo: 'repetido', vinculo }
  return { tipo: 'presenca', vinculo }
}

/**
 * Se a decisão soma à contagem de presença.
 *
 * Professor já vinculado nunca chega a `presenca`/`cadastro` — o branch do
 * topo de `decidir()` intercepta antes. Mas o **primeiro** cadastro dele
 * (chamado explícito, via "Cadastrar" em `TelaAula`) passa por aqui como
 * `cadastro` igual ao de qualquer aluno, porque `decidir()` não sabe — nem
 * devia saber — que `ctx.chamado` é professor: quem cadastra o vínculo é o
 * mesmo caminho para os dois papéis. O que muda é só a contagem: o professor
 * está gravando o próprio crachá, não chegando como aluno, e contar
 * presença dele infla o número sem ninguém ter faltado a menos.
 */
export function contaPresenca(decisao: Decisao): boolean {
  if (decisao.tipo === 'presenca') return true
  if (decisao.tipo === 'cadastro') return decisao.pessoa.papel !== 'professor'
  return false
}

/**
 * Quanto tempo de silêncio do leitor soa suspeito, em `TelaAula`.
 *
 * `LeitorTeclado` não é WebHID — é um ouvinte de teclado, e puxar o cabo do
 * dongle não dispara evento nenhum. O app não tem como saber que ele caiu; o
 * máximo que dá para fazer é notar que está quieto demais para o contexto e
 * perguntar, não afirmar.
 */
export const SILENCIO_SUSPEITO_MS = 3 * 60_000

/**
 * Se o silêncio do leitor já é suspeito.
 *
 * Só incomoda quando ainda falta gente: com todo mundo vinculado, silêncio é
 * o esperado, não um sintoma. Função pura para não depender de relógio de
 * verdade correndo dentro de um teste — ver `SILENCIO_SUSPEITO_MS`.
 */
export function leitorSuspeito(agora: Date, ultimaAtividadeEm: Date, pendentes: number): boolean {
  return pendentes > 0 && agora.getTime() - ultimaAtividadeEm.getTime() > SILENCIO_SUSPEITO_MS
}

/** `<origem>-<AAAAMMDD>-<sequência>` — ver `docs/02_formato.md`. */
export function proximoEventoId(instalacaoId: string, quando: Date, sequencia: number): string {
  const dia = quando.toISOString().slice(0, 10).replace(/-/g, '')
  return `${instalacaoId}-${dia}-${String(sequencia).padStart(4, '0')}`
}

export function eventoDe(
  decisao: Decisao,
  dados: { eventoId: string; quando: Date; turma: string; uidHash: string },
): Evento | undefined {
  const base = {
    eventoId: dados.eventoId,
    quando: dados.quando.toISOString(),
    turma: dados.turma,
    uidHash: dados.uidHash,
  }

  switch (decisao.tipo) {
    // Nome do professor, quando se sabe quem é — o mesmo dado que a linha
    // de presença de um aluno já carrega, aqui para quem abriu e fechou.
    // Sem vínculo achado (não devia acontecer, mas `eventoDe` não assume),
    // cai no vazio de sempre, nunca quebra o evento.
    case 'abrir':
    case 'encerrar':
      return {
        ...base,
        nome: decisao.vinculo?.nome ?? '',
        matricula: decisao.vinculo?.matricula,
        origem: 'professor',
        resultado: 'ok',
      }
    // Fica no log: o professor pode ter olhado para a turma na hora em que a
    // tela avisou, e no fim da aula ele merece poder conferir que houve
    // tentativa — com o hash do crachá recusado, que é o que permite descobrir
    // de quem era.
    case 'rapido_demais':
      return { ...base, nome: '', origem: 'cracha', resultado: 'rapido_demais' }
    case 'presenca':
      return {
        ...base,
        nome: decisao.vinculo.nome,
        matricula: decisao.vinculo.matricula,
        origem: 'cracha',
        resultado: 'ok',
      }
    case 'cadastro':
      return {
        ...base,
        nome: decisao.pessoa.nome,
        matricula: decisao.pessoa.matricula,
        origem: 'cracha',
        resultado: 'ok',
      }
    case 'repetido':
      return {
        ...base,
        nome: decisao.vinculo.nome,
        matricula: decisao.vinculo.matricula,
        origem: 'cracha',
        resultado: 'duplicado',
      }
    case 'desconhecido':
      return { ...base, nome: '', origem: 'cracha', resultado: 'desconhecido' }
    // Recusa não vira linha: nada aconteceu, e o log não registra intenção.
    default:
      return undefined
  }
}
