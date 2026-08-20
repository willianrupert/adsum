// Preferências desta máquina.
//
// Ficam no `localStorage` e **não** no cofre, de propósito: "já dispensei o
// aviso", "uso o dongle", "estou ensaiando" são fatos deste computador, não da
// turma. Se viajassem no `config.json`, o professor que recebe a pasta de um
// colega herdaria o modo de ensaio dele.
//
// `window.localStorage` e não o global solto: o Node tem um `localStorage`
// próprio, incompleto, que ganha do jsdom sob o vitest.

const CHAVES = {
  modoDev: 'adsum.modoDev',
  leitor: 'adsum.leitor',
  conselhoDispensado: 'adsum.instalacao.dispensada',
  encerradas: 'adsum.encerradas',
  pastaDispensada: 'adsum.pasta.dispensada',
  cadastroDispensado: 'adsum.cadastro.dispensado',
  conviteDeApp: 'adsum.app.dispensado',
  horarioAdiado: 'adsum.horario.adiado',
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
