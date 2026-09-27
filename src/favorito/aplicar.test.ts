import { describe, expect, it } from 'vitest'
import { brutoDaLeitura, gerarCenario, sorteador } from '../testes/planilhaSigaa.ts'
import { PaginaSigaaFalsa } from '../testes/paginaSigaaFalsa.ts'
import { conciliar } from '../nucleo/lancar/conciliar.ts'
import { planejar } from '../nucleo/lancar/plano.ts'
import type { Instrucao } from '../nucleo/lancar/tipos.ts'
import { aplicar, conferirContraBruto, desfazer, dicaDaCelula } from './aplicar.ts'

const SEMENTES = Array.from({ length: 300 }, (_, i) => i + 1)

function preparado(semente: number) {
  const c = gerarCenario(semente)
  const bruto = brutoDaLeitura(c.leitura)
  const r = conciliar({ leitura: c.leitura, turma: c.turma, matriculados: c.matriculados, eventos: c.eventos, ajustes: c.ajustes })
  return { bruto, plano: planejar(r, []), pagina: new PaginaSigaaFalsa(bruto) }
}

describe('o favorito confere o plano contra o que ele mesmo leu', () => {
  it('aceita todo plano que o Adsum faz de uma conciliação', () => {
    for (const s of SEMENTES) {
      const { bruto, plano } = preparado(s)
      expect(conferirContraBruto(plano, bruto), `semente ${s}`).toMatchObject({ ok: true })
    }
  })

  it('recusa o plano inteiro se uma instrução aponta para célula lançada, bloqueada, fora da faixa ou sem máximo', () => {
    for (const s of SEMENTES) {
      const { bruto, plano } = preparado(s)
      const sorte = sorteador(s)
      const ruins: Instrucao[] = []
      bruto.linhas.forEach((l, i) =>
        l.celulas.forEach((c, j) => {
          if (c.valor.trim() !== '' || c.desabilitada) ruins.push({ linha: i, coluna: j, antes: 'vazia', valor: 0 })
        }),
      )
      bruto.dias.forEach((d, j) => {
        const maximo = Number(d.maximoTexto)
        const vazia = bruto.linhas.findIndex((l) => l.celulas[j].valor === '' && !l.celulas[j].desabilitada)
        if (vazia < 0) return
        if (d.maximoTexto === undefined) ruins.push({ linha: vazia, coluna: j, antes: 'vazia', valor: 0 })
        else ruins.push({ linha: vazia, coluna: j, antes: 'vazia', valor: maximo + 1 })
      })
      if (ruins.length === 0) continue
      const ruim = ruins[sorte.entre(0, ruins.length - 1)]
      expect(conferirContraBruto([...plano, ruim], bruto), `semente ${s}`).toMatchObject({ ok: false })
    }
  })
})

describe('aplicar: comparar e trocar', () => {
  it('escreve cada instrução, e só onde a célula ainda está como foi lida', () => {
    for (const s of SEMENTES) {
      const { plano, pagina } = preparado(s)
      const sorte = sorteador(s * 31)
      const mexidas = new Set<string>()
      for (const i of plano) {
        if (sorte.chance(0.1)) {
          pagina.digitar(i.linha, i.coluna, '1')
          mexidas.add(`${i.linha}|${i.coluna}`)
        }
      }
      const feito = aplicar(pagina, plano)
      expect(feito.puladas.map((p) => `${p.linha}|${p.coluna}`).sort()).toEqual([...mexidas].sort())
      expect(feito.escritas).toHaveLength(plano.length - mexidas.size)
      for (const i of plano) {
        const esperado = mexidas.has(`${i.linha}|${i.coluna}`) ? '1' : String(i.valor)
        expect(pagina.valor(i.linha, i.coluna)).toBe(esperado)
      }
      expect(pagina.escritas).toBe(feito.escritas.length)
    }
  })

  it('pinta o que mudou, com a dica de antes e depois', () => {
    const { plano, pagina } = preparado(3)
    const feito = aplicar(pagina, plano)
    for (const e of feito.escritas) expect(pagina.pinturas.get(`${e.linha}|${e.coluna}`)?.marca).toBe('mudou')
  })
})

describe('desfazer', () => {
  it('devolve cada célula ao valor lido, idêntico', () => {
    for (const s of SEMENTES) {
      const { plano, pagina } = preparado(s)
      const antes = structuredClone(pagina.valores)
      desfazer(pagina, aplicar(pagina, plano).escritas)
      expect(pagina.valores, `semente ${s}`).toEqual(antes)
      for (const p of pagina.pinturas.values()) expect(p.marca).toBeUndefined()
    }
  })

  it('não desfaz o que o professor mudou depois do preenchimento', () => {
    const { plano, pagina } = preparado(5)
    const feito = aplicar(pagina, plano)
    if (feito.escritas.length === 0) throw new Error('cenário sem escrita')
    const [primeira] = feito.escritas
    pagina.digitar(primeira.linha, primeira.coluna, '9')
    expect(desfazer(pagina, feito.escritas)).toEqual({ desfeitas: feito.escritas.length - 1, mantidas: 1 })
    expect(pagina.valor(primeira.linha, primeira.coluna)).toBe('9')
  })
})

describe('a dica sobre a célula', () => {
  it('diz o que o Adsum escreveu e o que havia antes, sem travessão', () => {
    expect(dicaDaCelula('0', '')).toBe('Adsum: presente. Antes: vazia.')
    expect(dicaDaCelula('2', '')).toBe('Adsum: ausente, 2 faltas. Antes: vazia.')
    expect(dicaDaCelula('1', '')).toBe('Adsum: ausente, 1 falta. Antes: vazia.')
  })
})
