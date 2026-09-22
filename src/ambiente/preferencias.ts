// Preferências desta máquina.
//
// Ficam no `localStorage` e **não** no cofre, de propósito: "já dispensei o
// aviso", "uso o dongle", "estou ensaiando" são fatos deste computador, não da
// turma. Se viajassem no `config.json`, o professor que recebe a pasta de um
// colega herdaria o modo de ensaio dele.
//
// `window.localStorage` e não o global solto: o Node tem um `localStorage`
// próprio, incompleto, que ganha do jsdom sob o vitest.

import type { EstatisticaDeIntervalos } from '../nucleo/sessao.ts'

const CHAVES = {
  modoDev: 'adsum.modoDev',
  leitor: 'adsum.leitor',
  conselhoDispensado: 'adsum.instalacao.dispensada',
  encerradas: 'adsum.encerradas',
  pastaDispensada: 'adsum.pasta.dispensada',
  cadastroDispensado: 'adsum.cadastro.dispensado',
  conviteDeApp: 'adsum.app.dispensado',
  horarioAdiado: 'adsum.horario.adiado',
  historicoDeChamadas: 'adsum.historico.chamadas',
  professorAtual: 'adsum.professor.atual',
  versaoDeNovidadeVista: 'adsum.novidade.versao',
  modoDeGrade: 'adsum.grade.modo',
  auditoriaDeUids: 'adsum.auditoria.uids',
} as const

function ler(chave: string): string | undefined {
  try {
    return window.localStorage.getItem(chave) ?? undefined
  } catch {
    return undefined
  }
}

function gravar(chave: string, valor: string | undefined): void {
  try {
    if (valor === undefined) window.localStorage.removeItem(chave)
    else window.localStorage.setItem(chave, valor)
  } catch {
    // Modo privado recusa a escrita. A preferência não gruda, e é só isso.
  }
}

/**
 * Modo de ensaio. **Desligado por padrão**, e é o que separa o app publicado do
 * banco de testes: sem ele não há leitor simulado, não há teclas de ensaio, não
 * há semear nem apagar. O que sobra é o app que o professor usa.
 *
 * A regra para o que fica atrás daqui: se existe para provar que o programa
 * funciona, é ensaio. Se existe para o professor descobrir por que não
 * funcionou — o estado do leitor, a última rajada, as capacidades — é
 * diagnóstico, e diagnóstico é de produção.
 */
export function modoDev(): boolean {
  return ler(CHAVES.modoDev) === 'sim'
}

export function definirModoDev(ligado: boolean): void {
  gravar(CHAVES.modoDev, ligado ? 'sim' : undefined)
}

/**
 * O leitor escolhido, para sobreviver ao recarregamento.
 *
 * Sem isto, escolher o dongle durava até a próxima abertura — e o professor
 * reescolhia todo dia sem entender por quê.
 */
/**
 * Guardar o código real de cada crachá (`ambiente/auditoriaDeUids.ts`).
 * **Ligado por padrão** durante a fase de testes, decisão de 22/09/2026: a
 * marca guardada é a de desligado, e sem marca vale ligado.
 */
export function auditoriaDeUidsLigada(): boolean {
  return ler(CHAVES.auditoriaDeUids) !== 'nao'
}

export function definirAuditoriaDeUids(ligada: boolean): void {
  gravar(CHAVES.auditoriaDeUids, ligada ? undefined : 'nao')
}

export function leitorEscolhido(): string | undefined {
  return ler(CHAVES.leitor)
}

export function definirLeitorEscolhido(id: string): void {
  gravar(CHAVES.leitor, id)
}

export function conselhoDispensado(): boolean {
  return ler(CHAVES.conselhoDispensado) === 'sim'
}

export function dispensarConselho(): void {
  gravar(CHAVES.conselhoDispensado, 'sim')
}

/**
 * Turma → quando o professor encerrou por último.
 *
 * Existe para a abertura automática não desfazer um encerramento: quem fecha às
 * 9h30 uma aula que vai até as 10h não quer o relógio reabrindo no segundo
 * seguinte. Não sai do log porque **o log não distingue abrir de encerrar** —
 * as duas linhas são idênticas (ver `eventoDe`) —, e mudar o formato do CSV por
 * causa disto seria caro demais para o que se ganha.
 *
 * Local e não do cofre: é sobre este navegador ter aberto esta aula hoje.
 */
export function encerradas(): Record<string, string> {
  try {
    return JSON.parse(ler(CHAVES.encerradas) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function marcarEncerrada(turma: string, quando: string): void {
  gravar(CHAVES.encerradas, JSON.stringify({ ...encerradas(), [turma]: quando }))
}

/**
 * "Sigo sem pasta."
 *
 * A tela de escolher pasta não tinha saída: cancelar o seletor — ou o navegador
 * negar a permissão — deixava o professor preso nela, e a única forma de sair
 * era fechar o app. Uma tela sem saída é pior do que a garantia que ela protege,
 * porque a garantia depende de o programa ser usado.
 *
 * Dispensar não esconde nada: o selo do canto passa a avisar, o fim da aula
 * cobra o arquivo, e os Ajustes continuam oferecendo escolher a pasta. O que
 * muda é que a decisão volta a ser do professor.
 */
export function pastaDispensada(): boolean {
  return ler(CHAVES.pastaDispensada) === 'sim'
}

export function dispensarPasta(): void {
  gravar(CHAVES.pastaDispensada, 'sim')
}

/** Escolher uma pasta desfaz a dispensa: ele mudou de ideia, e o app segue. */
export function esquecerDispensaDaPasta(): void {
  gravar(CHAVES.pastaDispensada, undefined)
}

/**
 * "Cadastro fica pra depois."
 *
 * Sem o crachá do professor a chamada não abre — isso continua verdade. O que
 * não deveria ser verdade é a tela de cadastro travar quem quer só dar uma
 * olhada no app, ou parar no meio sem ter chamado ninguém ainda. Dispensar
 * não fecha o assunto: o repouso passa a avisar que falta o crachá do
 * professor, em vez de fingir que está tudo pronto.
 *
 * Registrar o professor desfaz a dispensa sozinho — não há mais o que adiar.
 */
export function cadastroDispensado(): boolean {
  return ler(CHAVES.cadastroDispensado) === 'sim'
}

export function dispensarCadastro(): void {
  gravar(CHAVES.cadastroDispensado, 'sim')
}

export function esquecerDispensaDoCadastro(): void {
  gravar(CHAVES.cadastroDispensado, undefined)
}

export function conviteDeAppDispensado(): boolean {
  return ler(CHAVES.conviteDeApp) === 'sim'
}

export function dispensarConviteDeApp(): void {
  gravar(CHAVES.conviteDeApp, 'sim')
}

/**
 * Turmas cujo horário o professor adiou.
 *
 * Local, e por turma: adiar não é "nunca mais", é "agora não". Os Ajustes
 * continuam oferecendo a grade, e cadastrar o horário lá também tira a turma
 * desta lista, porque aí ela deixou de estar sem horário.
 */
export function horariosAdiados(): string[] {
  try {
    return JSON.parse(ler(CHAVES.horarioAdiado) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function adiarHorario(turma: string): void {
  gravar(CHAVES.horarioAdiado, JSON.stringify([...new Set([...horariosAdiados(), turma])]))
}

/** Reabrir uma chamada encerrada por engano apaga a marca junto. */
export function esquecerEncerramento(turma: string): void {
  const resto = { ...encerradas() }
  delete resto[turma]
  gravar(CHAVES.encerradas, JSON.stringify(resto))
}

export interface ChamadaEncerrada {
  turma: string
  encerradaEm: string
  duracaoMs: number
  /** Ver `estatisticaDeIntervalos`. Ausente quando menos de duas pessoas
      foram registradas em sequência — não há par para medir. */
  intervalos?: EstatisticaDeIntervalos
}

const HISTORICO_MAXIMO = 20

/**
 * As últimas chamadas encerradas neste computador — duração e o intervalo
 * entre crachás de cada uma. É o dado que troca `INTERVALO_MINIMO_MS` de
 * palpite por medição, sem depender de deixar a tela de Diagnóstico aberta
 * enquanto a fila anda: `TelaAula` mede sozinha, em segundo plano, e só o
 * Diagnóstico mostra o resultado depois — quem está dando aula não devia
 * precisar olhar um número em milissegundos no meio da chamada.
 *
 * Local, como `encerradas`: é sobre o que aconteceu neste navegador, não
 * sobre a turma — não faz sentido um professor que recebe a pasta de um
 * colega herdar o histórico de chamadas dele.
 */
export function historicoDeChamadas(): ChamadaEncerrada[] {
  try {
    return JSON.parse(ler(CHAVES.historicoDeChamadas) ?? '[]') as ChamadaEncerrada[]
  } catch {
    return []
  }
}

/** Mais recente primeiro, capado em `HISTORICO_MAXIMO` — o suficiente para
    uma semana de aulas, pouco para o `localStorage` sentir o peso. */
export function registrarChamadaEncerrada(chamada: ChamadaEncerrada): void {
  const lista = [chamada, ...historicoDeChamadas()].slice(0, HISTORICO_MAXIMO)
  gravar(CHAVES.historicoDeChamadas, JSON.stringify(lista))
}

/**
 * "Sou eu" — qual vínculo de professor, entre os da turma, é quem está
 * operando este computador. `uid_hash`, não nome: o nome pode mudar (edição
 * de cadastro), e é o crachá que a pessoa continua sendo dona.
 *
 * Existe porque `quemFalta` já prevê mais de um docente numa turma — e sem
 * isto o app não tinha como saber qual dos vínculos de professor personalizar
 * na saudação. Sem "sou eu" marcado, a saudação continua anônima, como
 * sempre foi.
 *
 * Local, como `leitorEscolhido`: é sobre quem está sentado nesta máquina
 * agora, não sobre a turma — não faz sentido herdar isso ao receber a pasta
 * de um colega.
 */
export function professorAtual(): string | undefined {
  return ler(CHAVES.professorAtual)
}

/** `undefined` desfaz — "não sou eu", de volta ao estado anônimo de sempre. */
export function definirProfessorAtual(uidHash: string | undefined): void {
  gravar(CHAVES.professorAtual, uidHash)
}

/**
 * Qual versão de `nucleo/novidades.ts` este navegador já viu.
 *
 * `undefined` é "nenhuma ainda" — `ui/Fluxo.tsx` compara com a versão do
 * topo de `NOVIDADES` e, divergindo, mostra o toast uma vez e grava a
 * versão atual aqui, para não mostrar de novo até a lista ganhar uma
 * entrada nova.
 */
export function versaoDeNovidadeVista(): string | undefined {
  return ler(CHAVES.versaoDeNovidadeVista)
}

export function marcarVersaoDeNovidadeVista(versao: string): void {
  gravar(CHAVES.versaoDeNovidadeVista, versao)
}

export type ModoDeGrade = 'simplificada' | 'completa'

/**
 * Simplificada ou completa (`nucleo/horarios.ts`) — qual grade a tela de
 * horário mostra: o cronograma do cadastro e o painel "Grade horária" de
 * Ajustes leem e gravam a mesma chave, então trocar numa reflete na outra.
 *
 * Preferência desta máquina, não da turma: qual granularidade a pessoa
 * prefere ver é sobre quem está sentado ali, não sobre o horário cadastrado
 * — o mesmo raciocínio de `leitorEscolhido`. Simplificada por padrão, que é
 * o que a tela sempre mostrou antes do toggle existir.
 */
export function modoDeGrade(): ModoDeGrade {
  return ler(CHAVES.modoDeGrade) === 'completa' ? 'completa' : 'simplificada'
}

export function definirModoDeGrade(modo: ModoDeGrade): void {
  gravar(CHAVES.modoDeGrade, modo)
}

/**
 * Apaga as preferências desta máquina.
 *
 * Vai junto com o reset de fábrica: sem isso o app voltaria "do zero" ainda
 * lembrando que você dispensou o convite de instalar, adiou o horário de uma
 * turma que não existe mais e escolheu um leitor. Meio zero é pior que nenhum,
 * porque o comportamento estranho não tem explicação na tela.
 */
export function esquecerPreferencias(): void {
  for (const chave of Object.values(CHAVES)) gravar(chave, undefined)
}
