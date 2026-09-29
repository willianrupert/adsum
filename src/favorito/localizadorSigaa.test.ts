// O favorito lendo e escrevendo na planilha do SIGAA com a estrutura do
// `docs/12`, montada a partir da planilha real anonimizada de CIN0114.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lerPlanilha } from '../nucleo/lancar/leitura.ts'
import { PLANILHA_CIN0114 } from '../testes/planilhaReal.ts'
import { coletarComoOSigaa, montarPaginaDaPlanilha } from '../testes/paginaDaPlanilha.ts'
import { LOCALIZADOR_SIGAA } from './localizadorSigaa.ts'
import { criarPaginaSigaa } from './paginaSigaa.ts'

const FIM_DO_SEMESTRE = new Date('2026-12-20T12:00:00')
const registro = (coleta: string, i: number) => coleta.split(';')[i].split(',')

beforeEach(() => montarPaginaDaPlanilha(document, PLANILHA_CIN0114))

describe('ler a planilha do SIGAA', () => {
  it('extrai da página o mesmo modelo que o servidor escreveu, e a leitura dá 45 alunos em 38 aulas', () => {
    const bruto = LOCALIZADOR_SIGAA.extrair(document)!
    expect(bruto).toMatchObject({
      legenda: PLANILHA_CIN0114.legenda,
      periodo: PLANILHA_CIN0114.periodo,
      auxAulas: PLANILHA_CIN0114.auxAulas,
      auxAlunos: PLANILHA_CIN0114.auxAlunos,
    })
    const { leitura, problemas } = lerPlanilha(bruto, 'l', FIM_DO_SEMESTRE)
    expect(problemas).toEqual([])
    expect(leitura!.linhas).toHaveLength(45)
    expect(leitura!.colunas).toHaveLength(38)
  })

  it('o que o professor clicou antes vale: a célula lida é o texto de agora', () => {
    const td = document.querySelector('td.aluno_900001.aula_0')!
    expect(td.textContent).toBe('')
    td.textContent = '2'
    const { leitura } = lerPlanilha(LOCALIZADOR_SIGAA.extrair(document)!, 'l', FIM_DO_SEMESTRE)
    expect(leitura!.linhas[0].celulas[0]).toEqual({ tipo: 'lancada', faltas: 2 })
  })

  it('fora da planilha, não reconhece nada', () => {
    document.body.innerHTML = '<p>Turma virtual</p>'
    expect(LOCALIZADOR_SIGAA.extrair(document)).toBeUndefined()
    montarPaginaDaPlanilha(document, PLANILHA_CIN0114)
    document.querySelector('script')!.remove()
    expect(LOCALIZADOR_SIGAA.extrair(document)).toBeUndefined()
  })
})

describe('escrever como a coleta do SIGAA lê', () => {
  it('a célula ganha o número como texto, e a coleta leva só ele, no registro certo', () => {
    const pagina = criarPaginaSigaa(document, LOCALIZADOR_SIGAA)
    const antes = coletarComoOSigaa(document)
    // Aluno 8 (linha 7), aula de 29/09 (coluna 14): ainda vazia na captura.
    expect(pagina.valor(7, 14)).toBe('')
    pagina.escrever(7, 14, '2')
    expect(document.querySelector('td.aluno_900008.aula_14')!.textContent).toBe('2')
    const depois = coletarComoOSigaa(document)
    const i = 7 * 38 + 14
    expect(registro(depois, i)[5]).toBe('2')
    expect(depois.split(';').filter((r, k) => r !== antes.split(';')[k])).toEqual([depois.split(';')[i]])
  })

  it('refaz os totais da linha pela própria página, quando ela sabe', () => {
    const calcular = vi.fn()
    Object.assign(window, { calcularFaltas: calcular, J: (x: unknown) => x })
    try {
      criarPaginaSigaa(document, LOCALIZADOR_SIGAA).escrever(0, 14, '0')
      expect(calcular).toHaveBeenCalledWith(document.querySelector('td.aluno_900001.aula_14')!.parentElement)
    } finally {
      delete (window as unknown as Record<string, unknown>).calcularFaltas
      delete (window as unknown as Record<string, unknown>).J
    }
  })

  it('célula aberta em edição pelo professor não é vazia: o favorito não escreve nela', () => {
    const td = document.querySelector('td.aluno_900001.aula_14')!
    td.innerHTML = '<input value="">'
    expect(criarPaginaSigaa(document, LOCALIZADOR_SIGAA).valor(0, 14)).not.toBe('')
  })

  it('desfazer antes da coleta devolve o vazio que o servidor tinha', () => {
    const pagina = criarPaginaSigaa(document, LOCALIZADOR_SIGAA)
    pagina.escrever(7, 14, '2')
    pagina.escrever(7, 14, '')
    expect(registro(coletarComoOSigaa(document), 7 * 38 + 14)[5]).toBe('null')
  })

  it('pinta a célula de azul com a dica, e despinta devolvendo o fundo da página', () => {
    const pagina = criarPaginaSigaa(document, LOCALIZADOR_SIGAA)
    const td = document.querySelector<HTMLElement>('td.aluno_900008.aula_14')!
    td.style.background = 'rgb(255, 238, 238)'
    pagina.pintar(7, 14, 'mudou', 'Adsum: ausente, 2 faltas. Antes: vazia.')
    expect(td.style.background).not.toBe('rgb(255, 238, 238)')
    expect(td.title).toBe('Adsum: ausente, 2 faltas. Antes: vazia.')
    pagina.pintar(7, 14)
    expect(td.style.background).toBe('rgb(255, 238, 238)')
  })

  it('linha ou coluna que não existe não é achada', () => {
    const pagina = criarPaginaSigaa(document, LOCALIZADOR_SIGAA)
    expect(pagina.valor(45, 0)).toBeUndefined()
    expect(pagina.valor(0, 38)).toBeUndefined()
  })
})
