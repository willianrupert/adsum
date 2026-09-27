import { describe, expect, it } from 'vitest'
import { gerarCenario } from '../../testes/planilhaSigaa.ts'
import { planilhaDeFaltas } from '../faltas.ts'
import type { Aula, Evento, Matriculado } from '../tipos.ts'
import { listaParaLancarAMao, textoParaLancarAMao } from './aMao.ts'

const TURMA = 'CIN0144 · T01'
const aluno = (matricula: string, nomeCompleto: string): Matriculado => ({
  turma: TURMA, chave: matricula, matricula, nome: nomeCompleto.split(' ').slice(0, 2).join(' '), nomeCompleto, papel: 'aluno',
})
const ALUNOS = [aluno('1', 'ANA CLARA INVENTADA'), aluno('2', 'BRENO LIMA INVENTADO'), aluno('3', 'CAIO DIAS INVENTADO')]
let k = 0
const ev = (dia: string, parcial: Partial<Evento> & Pick<Evento, 'origem' | 'resultado'>): Evento => ({
  eventoId: `web-t-${dia.replaceAll('-', '')}-${++k}`,
  quando: new Date(`${dia}T10:${String(k % 60).padStart(2, '0')}:00`).toISOString(),
  turma: TURMA, uidHash: 'x', nome: '', ...parcial,
})
const abriu = (dia: string) => ev(dia, { origem: 'professor', resultado: 'ok' })
const veio = (dia: string, m: string) => ev(dia, { origem: 'cracha', resultado: 'ok', matricula: m })
/** Terça, 10h às 11h40: dois períodos de 50 minutos. */
const GRADE: Aula[] = [{ uidHashProfessor: 'p', dia: 2, inicio: '10:00', fim: '11:40', turma: TURMA }]

describe('a lista para lançar à mão', () => {
  it('uma aula por dia de chamada, com quem faltou e quantas faltas o dia vale', () => {
    const eventos = [abriu('2026-10-13'), veio('2026-10-13', '1'), veio('2026-10-13', '3'), abriu('2026-10-15'), veio('2026-10-15', '1'), veio('2026-10-15', '2'), veio('2026-10-15', '3')].reverse()
    expect(listaParaLancarAMao(planilhaDeFaltas(eventos, ALUNOS, GRADE, TURMA))).toEqual([
      { dia: '2026-10-13', presentes: 2, ausentes: [{ matricula: '2', nomeCompleto: 'BRENO LIMA INVENTADO', faltas: 2 }] },
      { dia: '2026-10-15', presentes: 3, ausentes: [] },
    ])
  })

  it('o texto se lança lendo de cima para baixo', () => {
    const aulas = [
      { dia: '2026-10-13', presentes: 2, ausentes: [{ matricula: '2', nomeCompleto: 'BRENO LIMA INVENTADO', faltas: 2 }] },
      { dia: '2026-10-15', presentes: 3, ausentes: [] },
    ]
    expect(textoParaLancarAMao(TURMA, aulas)).toBe(
      [
        'CIN0144 · T01',
        '',
        '13/10: todos presentes, exceto:',
        '  BRENO LIMA INVENTADO (2), matrícula 2',
        '',
        '15/10: todos presentes.',
        '',
      ].join('\n'),
    )
  })

  it('sem chamada registrada, diz isso em vez de uma lista vazia', () => {
    expect(textoParaLancarAMao(TURMA, [])).toBe('CIN0144 · T01\n\nNenhuma chamada registrada.\n')
  })

  it('concorda com a planilha de faltas da pasta em qualquer cenário', () => {
    for (let s = 1; s <= 200; s++) {
      const c = gerarCenario(s)
      const planilha = planilhaDeFaltas(c.eventos, c.matriculados, [], c.turma)
      for (const aula of listaParaLancarAMao(planilha)) {
        const faltaram = planilha.linhas.filter((l) => (l.porDia.get(aula.dia)?.faltas ?? 0) > 0).map((l) => l.matriculado.matricula)
        expect(aula.ausentes.map((a) => a.matricula), `semente ${s}, ${aula.dia}`).toEqual(faltaram)
        expect(aula.presentes + aula.ausentes.length).toBe(planilha.linhas.length)
      }
    }
  })
})
