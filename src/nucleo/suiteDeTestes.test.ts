import { describe, expect, it } from 'vitest'
import { avaliarCenario, avaliarPerdaDeFoco, uidDeTeste, type EventoObservado } from './suiteDeTestes.ts'

const aceita = (em = 0): EventoObservado => ({ tipo: 'aceita', em })
const recusa = (motivo: EventoObservado['motivo'], em = 0): EventoObservado => ({ tipo: 'recusa', motivo, em })

describe('uidDeTeste', () => {
  it('nunca colide com os UIDs medidos do dongle real', () => {
    for (let i = 0; i < 50; i++) {
      expect(uidDeTeste(i)).not.toBe('0930148883')
      expect(uidDeTeste(i)).not.toBe('2367396804')
    }
  })

  it('é estável e sem repetição para os índices usados pela suíte', () => {
    const uids = new Set(Array.from({ length: 20 }, (_, i) => uidDeTeste(i)))
    expect(uids.size).toBe(20)
  })
})

describe('avaliarCenario', () => {
  it('aprova quando a contagem de aceitas e recusas bate exatamente', () => {
    const r = avaliarCenario({ nome: 'Ritmo normal', aceitas: 3, recusas: 0 }, [aceita(), aceita(), aceita()])
    expect(r.aprovado).toBe(true)
    expect(r.detalhe).toContain('3 aceito(s) (esperado 3)')
  })

  it('reprova se faltou aceita — a rajada de 15/09/2026: aceitas contadas, mas menos que o disparado', () => {
    const r = avaliarCenario({ nome: 'Fila apressada', aceitas: 5, recusas: 0 }, [aceita(), aceita(), aceita()])
    expect(r.aprovado).toBe(false)
  })

  it('reprova se sobrou recusa não esperada', () => {
    const r = avaliarCenario({ nome: 'Ritmo normal', aceitas: 2, recusas: 0 }, [aceita(), aceita(), recusa('ritmo')])
    expect(r.aprovado).toBe(false)
  })

  it('contagem certa mas motivo errado não é aprovação', () => {
    const r = avaliarCenario(
      { nome: 'Digitação humana', aceitas: 0, recusas: 1, motivoRecusa: 'ritmo' },
      [recusa('formato')],
    )
    expect(r.aprovado).toBe(false)
    expect(r.detalhe).toContain('motivo: formato')
  })

  it('digitação humana aprovada: zero aceitas, uma recusa por ritmo', () => {
    const r = avaliarCenario(
      { nome: 'Digitação humana', aceitas: 0, recusas: 1, motivoRecusa: 'ritmo' },
      [recusa('ritmo')],
    )
    expect(r.aprovado).toBe(true)
  })
})

describe('avaliarPerdaDeFoco', () => {
  it('aprova: nada chegou sem foco, e voltou a funcionar com o foco de volta', () => {
    const r = avaliarPerdaDeFoco([], [aceita()])
    expect(r.aprovado).toBe(true)
  })

  it('reprova se algo chegou mesmo sem foco — o teclado não deveria alcançar a janela', () => {
    const r = avaliarPerdaDeFoco([aceita()], [aceita()])
    expect(r.aprovado).toBe(false)
    expect(r.detalhe).toContain('mesmo assim')
  })

  it('reprova se a leitura ficou travada mesmo com o foco de volta — a regressão que mais importa', () => {
    const r = avaliarPerdaDeFoco([], [])
    expect(r.aprovado).toBe(false)
    expect(r.detalhe).toContain('travada')
  })
})
