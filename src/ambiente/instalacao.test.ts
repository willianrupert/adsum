import { describe, expect, it } from 'vitest'
import { comoInstalar, conselho, ehWebKit, plataforma } from './instalacao.ts'

// Strings reais, e não inventadas: é a única forma de o teste falhar quando um
// navegador muda de identidade. `Safari/` aparece em quase todas — o Chrome
// carrega o token por compatibilidade — e é justamente por isso que a regra é
// de exclusão, não de inclusão.
const UA = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
}

describe('plataforma', () => {
  it('separa o iPad do Mac pelo toque, não pela string', () => {
    expect(plataforma(UA.safariMac, 0)).toBe('mac')
    // O iPadOS se apresenta como Macintosh. Sem o toque, os dois são idênticos.
    expect(plataforma(UA.safariMac, 5)).toBe('ios')
  })

  it('reconhece iPhone e ignora o resto', () => {
    expect(plataforma(UA.safariIphone, 5)).toBe('ios')
    expect(plataforma(UA.firefoxWindows, 0)).toBe('outra')
    expect(plataforma(UA.chromeAndroid, 5)).toBe('outra')
  })
})

describe('ehWebKit', () => {
  it('pega o Safari e todo navegador do iOS', () => {
    expect(ehWebKit(UA.safariMac, 0)).toBe(true)
    expect(ehWebKit(UA.safariIphone, 5)).toBe(true)
    // No iOS o WebKit é obrigatório: o Chrome de lá tem a mesma regra de 7 dias.
    expect(ehWebKit(UA.chromeIphone, 5)).toBe(true)
  })

  it('não confunde quem só carrega o token Safari', () => {
    expect(ehWebKit(UA.chromeMac, 0)).toBe(false)
    expect(ehWebKit(UA.edgeMac, 0)).toBe(false)
    expect(ehWebKit(UA.chromeAndroid, 5)).toBe(false)
  })

  it('deixa o Firefox de fora — ele não tem pasta, mas também não apaga', () => {
    expect(ehWebKit(UA.firefoxWindows, 0)).toBe(false)
  })
})

describe('comoInstalar', () => {
  it('dá o caminho do menu de cada plataforma', () => {
    expect(comoInstalar('mac')?.passos).toEqual(['Arquivo', 'Adicionar ao Dock'])
    expect(comoInstalar('ios')?.passos).toEqual(['Compartilhar', 'Adicionar à Tela de Início'])
  })

  it('não inventa caminho onde não sabe qual é', () => {
    expect(comoInstalar('outra')).toBeUndefined()
  })
})

// O conselho é por navegador porque o que cada um pode fazer é diferente.
// `conselho` lê o ambiente para saber se é WebKit; aqui só se prova a regra que
// não depende dele — quem tem pasta não é aconselhado a nada.
describe('conselho de navegador', () => {
  it('quem tem seletor de pasta não recebe conselho nenhum', () => {
    expect(conselho(true)).toBeUndefined()
  })

  it('sem pasta, sempre há o que dizer', () => {
    expect(conselho(false)).toBeDefined()
  })
})
