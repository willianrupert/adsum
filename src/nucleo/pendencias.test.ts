import { describe, expect, it } from 'vitest'
import { marcarAte, naoSalvos, totalNaoSalvo } from './pendencias.ts'
import type { Evento } from './tipos.ts'

const evento = (turma: string, quando: string): Evento => ({
  eventoId: `web-aaaa-${quando}`,
  quando,
  turma,
  matricula: '1',
  nome: 'Ana Paula',
  origem: 'cracha',
  resultado: 'ok',
  uidHash: 'aaaa000000000000',
})

const A = 'IF685 · T01'
const B = 'IF969 · T02'

describe('o que ainda não saiu deste navegador', () => {
  it('sem marca nenhuma, tudo está por salvar', () => {
    const tudo = [evento(A, '2026-08-19T10:00:00.000Z'), evento(A, '2026-08-19T10:01:00.000Z')]
    expect(naoSalvos(tudo)).toEqual([{ turma: A, quantos: 2, desde: '2026-08-19T10:00:00.000Z' }])
  })

  it('a marca é por turma: salvar uma não limpa a outra', () => {
    const tudo = [evento(A, '2026-08-19T10:00:00.000Z'), evento(B, '2026-08-19T11:00:00.000Z')]
    const pendentes = naoSalvos(tudo, { [A]: '2026-08-19T10:00:00.000Z' })
    expect(pendentes).toEqual([{ turma: B, quantos: 1, desde: '2026-08-19T11:00:00.000Z' }])
  })

  // O evento exatamente na marca entrou no arquivo — a marca é o `quando` dele.
  it('o evento na marca conta como salvo, o seguinte não', () => {
    const tudo = [evento(A, '2026-08-19T10:00:00.000Z'), evento(A, '2026-08-19T10:00:01.000Z')]
    expect(totalNaoSalvo(naoSalvos(tudo, { [A]: '2026-08-19T10:00:00.000Z' }))).toBe(1)
  })

  it('nada pendente é lista vazia, e não uma turma com zero', () => {
    const tudo = [evento(A, '2026-08-19T10:00:00.000Z')]
    expect(naoSalvos(tudo, { [A]: '2026-08-19T10:00:00.000Z' })).toEqual([])
  })

  // Sai do conteúdo do arquivo, não do relógio: com `Date.now()` uma leitura
  // que chegasse durante a gravação ficaria marcada como salva sem estar.
  it('a marca é o evento mais recente do que foi escrito', () => {
    const escritos = [evento(A, '2026-08-19T10:05:00.000Z'), evento(A, '2026-08-19T10:02:00.000Z')]
    expect(marcarAte(escritos)).toBe('2026-08-19T10:05:00.000Z')
    expect(marcarAte([])).toBeUndefined()
  })

  it('a aula mais antiga vem primeiro — é a que corre mais risco', () => {
    const tudo = [evento(B, '2026-08-19T11:00:00.000Z'), evento(A, '2026-08-18T09:00:00.000Z')]
    expect(naoSalvos(tudo).map((p) => p.turma)).toEqual([A, B])
  })
})
