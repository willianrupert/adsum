import { describe, expect, it } from 'vitest'
import { desenhoDosToques, type Toque } from './som.ts'

const toques = Object.entries(desenhoDosToques) as [Toque, (typeof desenhoDosToques)['ok']][]

describe('o som aguenta cinquenta repetições', () => {
  // Com um crachá por segundo, qualquer coisa que passe de meio segundo se
  // sobrepõe à leitura seguinte.
  it('nenhum toque passa de meio segundo', () => {
    for (const [nome, notas] of toques) {
      const fim = Math.max(...notas.map((n) => n.atraso + n.duracao))
      expect(fim, nome).toBeLessThan(0.5)
    }
  })

  it('nenhum toque tem mais de duas notas', () => {
    for (const [nome, notas] of toques) expect(notas.length, nome).toBeLessThanOrEqual(2)
  })

  // Agudo cansa. Abaixo de 300 Hz some em sala com conversa; acima de 900 fura.
  it('todas as notas ficam na faixa que não fere', () => {
    for (const [nome, notas] of toques) {
      for (const nota of notas) {
        expect(nota.hz, nome).toBeGreaterThanOrEqual(300)
        expect(nota.hz, nome).toBeLessThanOrEqual(900)
      }
    }
  })

  it('volume baixo e parecido entre os toques', () => {
    for (const [nome, notas] of toques) {
      for (const nota of notas) {
        expect(nota.volume, nome).toBeGreaterThan(0.05)
        expect(nota.volume, nome).toBeLessThanOrEqual(0.14)
      }
    }
  })

  // É o que toca o tempo inteiro: o caso normal não se anuncia.
  it('presença registrada é o toque mais discreto', () => {
    const volumeDe = (t: Toque) => Math.max(...desenhoDosToques[t].map((n) => n.volume))
    expect(volumeDe('ok')).toBeLessThanOrEqual(volumeDe('desconhecido'))
    expect(desenhoDosToques.ok).toHaveLength(1)
  })

  // Subir é bom, descer é problema — a diferença é de altura, nunca de
  // repetição, que é o recurso que mais irrita quando acontece cinquenta vezes.
  it('abertura sobe e encerramento desce', () => {
    const [a1, a2] = desenhoDosToques.abertura
    const [e1, e2] = desenhoDosToques.encerramento
    expect(a2.hz).toBeGreaterThan(a1.hz)
    expect(e2.hz).toBeLessThan(e1.hz)
  })

  it('o aviso de crachá desconhecido desce', () => {
    const [d1, d2] = desenhoDosToques.desconhecido
    expect(d2.hz).toBeLessThan(d1.hz)
  })

  it('repetido é mais grave e mais baixo que presença', () => {
    expect(desenhoDosToques.repetido[0].hz).toBeLessThan(desenhoDosToques.ok[0].hz)
    expect(desenhoDosToques.repetido[0].volume).toBeLessThanOrEqual(desenhoDosToques.ok[0].volume)
  })
})
