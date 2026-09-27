import { describe, expect, it } from 'vitest'
import { comoDia, type Celula, type ColunaDia, type Conciliada } from './tipos.ts'

describe('o dia de uma coluna', () => {
  it('aceita só AAAA-MM-DD que existe no calendário', () => {
    expect(comoDia('2026-10-14')).toBe('2026-10-14')
    expect(comoDia('2028-02-29')).toBe('2028-02-29')
    expect(comoDia('2026-02-29')).toBeUndefined()
    expect(comoDia('2026-13-01')).toBeUndefined()
    expect(comoDia('14/10/2026')).toBeUndefined()
    expect(comoDia('2026-10-14T00:00')).toBeUndefined()
    expect(comoDia('')).toBeUndefined()
  })
})

describe('estado impossível não é representável', () => {
  it('o compilador recusa o que o domínio proíbe', () => {
    // @ts-expect-error célula bloqueada não tem valor
    const bloqueadaComValor: Celula = { tipo: 'bloqueada', motivo: 'feriado', faltas: 2 }
    // @ts-expect-error célula lançada sempre tem valor
    const lancadaSemValor: Celula = { tipo: 'lancada' }
    // @ts-expect-error coluna sem data
    const semData: ColunaDia = { indice: 0 }
    // @ts-expect-error data que não passou por comoDia
    const dataCrua: ColunaDia = { indice: 0, dia: '2026-10-14' }
    // @ts-expect-error "a lançar" sem o valor esperado
    const aLancarSemValor: Conciliada = { categoria: 'aLancar', linha: 0, coluna: 0, matricula: '1', dia: comoDia('2026-10-14')! }
    expect([bloqueadaComValor, lancadaSemValor, semData, dataCrua, aLancarSemValor]).toHaveLength(5)
  })
})
