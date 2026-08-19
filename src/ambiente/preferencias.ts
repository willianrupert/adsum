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
