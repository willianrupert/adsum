// As partes da bancada que decidem algo, sem servidor: comparar o que a página
// enviaria, reescrever a página para não falar com a UFPE, e o cenário do Adsum.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cenarioDaBancada, diferencas, reescreverPagina, RESPOSTA_AJAX } from './bancada_sigaa.mjs'

const fixture = JSON.parse(readFileSync('src/testes/sigaa/planilha-cin0114.json', 'utf-8'))

describe('a bancada do SIGAA', () => {
  it('compara o que a página enviaria: só as células que mudaram, com o antes e o depois', () => {
    const registros = fixture.auxAlunos.split(';').map((r) => r.split(','))
    const i = 7 * 38 + 14
    registros[i][5] = '2'
    expect(diferencas(fixture.auxAlunos, registros.map((r) => r.join(',')).join(';'))).toEqual({
      mudaram: [{ aluno: '900008', matricula: '20269000008', dia: '29/09', antes: 'null', depois: '2' }],
    })
    expect(diferencas(fixture.auxAlunos, fixture.auxAlunos)).toEqual({ mudaram: [] })
    expect(diferencas(fixture.auxAlunos, 'a,b')).toMatchObject({ erro: expect.stringContaining('registros') })
  })

  it('a página servida não aponta para a UFPE, leva o estado atual e o botão do favorito de ensaio', () => {
    const pagina = `<html><body><form action="https://sigaa.ufpe.br/sigaa/ava/FrequenciaAluno/formPlanilha.jsf">
      <input id="form:frequencias" type="hidden" name="form:frequencias" value="velho"></form>
      <script>var auxAlunos = "velho";</script>
      <div id="basePlanilha"><table id="planilha"><tr><td>salva</td></tr></table></div></body></html>`
    const servida = reescreverPagina(pagina, { auxAlunos: 'novo', aviso: '' })
    expect(servida).not.toContain('sigaa.ufpe.br')
    expect(servida).toContain('var auxAlunos = "novo"')
    expect(servida).toContain('name="form:frequencias" value="novo"')
    expect(servida).not.toContain('salva')
    expect(servida).toContain('bancada-favorito')
  })

  it('responde ao salvamento automático como o Ajax4jsf espera', () => {
    expect(RESPOSTA_AJAX).toContain('<meta name="Ajax-Response" content="true" />')
  })

  it('o cenário do Adsum tem a mesma turma, e presentes nos dias lançados são os que têm 0 no SIGAA', () => {
    const c = cenarioDaBancada(fixture, new Date('2026-09-29T12:00:00'))
    expect(c.turma).toBe('2026.2 - CIN0114 - TURMA DA BANCADA')
    expect(c.matriculados).toHaveLength(45)
    expect(c.matriculados[0]).toMatchObject({ matricula: '20269000001', nome: 'Aluno 001', papel: 'aluno' })
    const presencas = c.eventos.filter((e) => e.origem === 'cracha' && e.quando.startsWith('2026-08-1'))
    // 11/08, 13/08 e 18/08 são lançados: 24 + 26 + 22 presentes na captura (docs/12).
    expect(presencas).toHaveLength(24 + 26 + 22)
    expect(c.eventos.filter((e) => e.origem === 'professor')).toHaveLength(15)
  })
})
