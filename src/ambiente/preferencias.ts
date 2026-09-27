// Preferências desta máquina, no `localStorage` e não no cofre: são fatos deste
// computador, não da turma. No `config.json`, quem recebe a pasta de um colega
// herdaria o modo de ensaio dele.
//
// `window.localStorage`, não o global: o do Node, incompleto, ganha do jsdom
// sob o vitest.

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
 * Modo de ensaio, desligado por padrão: leitor simulado, teclas de ensaio,
 * semear e apagar. O que existe para provar que o programa funciona é ensaio;
 * o que ajuda a descobrir por que não funcionou é diagnóstico, e fica no
 * app publicado.
 */
export function modoDev(): boolean {
  return ler(CHAVES.modoDev) === 'sim'
}

/**
 * Lançar no SIGAA (a v2) só aparece com o modo de desenvolvimento, até passar
 * pelos portões do `docs/08`. Um lugar só para ligar de vez.
 */
export function lancarNoSigaaLigado(): boolean {
  return modoDev()
}

export function definirModoDev(ligado: boolean): void {
  gravar(CHAVES.modoDev, ligado ? 'sim' : undefined)
}

/**
 * Guardar o UID real de cada crachá (`ambiente/auditoriaDeUids.ts`). Ligado
 * por padrão na fase de testes (22/09/2026): a marca guardada é a de desligado.
 */
export function auditoriaDeUidsLigada(): boolean {
  return ler(CHAVES.auditoriaDeUids) !== 'nao'
}

export function definirAuditoriaDeUids(ligada: boolean): void {
  gravar(CHAVES.auditoriaDeUids, ligada ? undefined : 'nao')
}

/** O leitor escolhido, para não ser reescolhido a cada abertura. */
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
 * Turma → quando foi encerrada por último neste navegador. A grade não
 * sugere, como "agora", a aula que acabou de ser encerrada. Fica fora do log,
 * que não distingue abrir de encerrar.
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
 * "Sigo sem pasta": a tela de escolher pasta precisa de saída. Dispensar não
 * esconde nada: o selo do canto avisa, o fim da aula cobra, e os Ajustes
 * continuam oferecendo a pasta.
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
 * "Cadastro fica pra depois." A rota ainda lê a marca, mas nenhuma tela a
 * grava hoje: o botão abre a chamada sem crachá de professor
 * (`garantirProfessor`). Ter o crachá do professor desfaz a marca.
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

/** Turmas cujo horário o professor adiou: "agora não", não "nunca". */
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
  /** Ver `estatisticaDeIntervalos`. Ausente sem ao menos um par de crachás. */
  intervalos?: EstatisticaDeIntervalos
}

const HISTORICO_MAXIMO = 20

/**
 * As últimas chamadas encerradas neste computador, com o intervalo entre
 * crachás de cada uma: o dado que calibra `INTERVALO_MINIMO_MS`, medido em
 * segundo plano e mostrado só no Diagnóstico.
 */
export function historicoDeChamadas(): ChamadaEncerrada[] {
  try {
    return JSON.parse(ler(CHAVES.historicoDeChamadas) ?? '[]') as ChamadaEncerrada[]
  } catch {
    return []
  }
}

/** Mais recente primeiro, até `HISTORICO_MAXIMO`. */
export function registrarChamadaEncerrada(chamada: ChamadaEncerrada): void {
  const lista = [chamada, ...historicoDeChamadas()].slice(0, HISTORICO_MAXIMO)
  gravar(CHAVES.historicoDeChamadas, JSON.stringify(lista))
}

/**
 * "Sou eu": qual vínculo de professor é quem opera este computador, pelo
 * `uid_hash`. Só personaliza a saudação; sem marca, ela é anônima.
 */
export function professorAtual(): string | undefined {
  return ler(CHAVES.professorAtual)
}

/** `undefined` desfaz. */
export function definirProfessorAtual(uidHash: string | undefined): void {
  gravar(CHAVES.professorAtual, uidHash)
}

/** A versão de `nucleo/novidades.ts` que este navegador já mostrou. */
export function versaoDeNovidadeVista(): string | undefined {
  return ler(CHAVES.versaoDeNovidadeVista)
}

export function marcarVersaoDeNovidadeVista(versao: string): void {
  gravar(CHAVES.versaoDeNovidadeVista, versao)
}

export type ModoDeGrade = 'simplificada' | 'completa'

/**
 * Qual grade a tela de horário mostra (`nucleo/horarios.ts`). Simplificada
 * por padrão. O cronograma e os Ajustes usam a mesma chave.
 */
export function modoDeGrade(): ModoDeGrade {
  return ler(CHAVES.modoDeGrade) === 'completa' ? 'completa' : 'simplificada'
}

export function definirModoDeGrade(modo: ModoDeGrade): void {
  gravar(CHAVES.modoDeGrade, modo)
}

/** Apaga as preferências desta máquina, junto com o recomeçar do zero: "meio zerado" não se explica. */
export function esquecerPreferencias(): void {
  for (const chave of Object.values(CHAVES)) gravar(chave, undefined)
}
