// A planilha, direto — sem sessão, sem leitor, sem relógio nenhum.
//
// A cobertura de "mais de um dia" morava em `JornadaCompleta.test.tsx`, com
// um relógio falso avançado artificialmente pra separar as datas. Cortada de
// lá porque o relógio falso ligado o teste inteiro travava no GitHub Actions
// sem nunca resolver. Aqui não precisa de relógio nenhum: os eventos já
// nascem com a data que se quer testar, como texto ISO comum — é só isso que
// `GradeDePresencas` lê.

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GradeDePresencas } from './GradeDePresencas.tsx'
import type { Evento, Matriculado } from '../../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'

const ANA: Matriculado = {
  turma: TURMA,
  chave: '1',
  matricula: '1',
  nomeCompleto: 'ANA PAULA DA SILVA',
  nome: 'Ana Paula',
  papel: 'aluno',
}
const BRENO: Matriculado = {
  turma: TURMA,
  chave: '2',
  matricula: '2',
  nomeCompleto: 'BRENO OLIVEIRA FILHO',
  nome: 'Breno Oliveira',
  papel: 'aluno',
}

let seq = 0
function evento(parcial: Partial<Evento> & Pick<Evento, 'quando' | 'origem'>): Evento {
  return {
    eventoId: `teste-${seq++}`,
    turma: TURMA,
    uidHash: 'x',
    matricula: undefined,
    nome: '',
    resultado: 'ok',
    ...parcial,
  }
}

describe('a planilha com dois dias de aula', () => {
  it('mostra uma coluna por dia, presença e ausência corretas', () => {
    const eventos: Evento[] = [
      // Dia 1 — os dois compareceram.
      evento({ quando: '2026-03-02T13:00:00.000Z', origem: 'professor' }),
      evento({ quando: '2026-03-02T13:05:00.000Z', origem: 'cracha', matricula: '1', nome: 'Ana Paula' }),
      evento({ quando: '2026-03-02T13:06:00.000Z', origem: 'cracha', matricula: '2', nome: 'Breno Oliveira' }),
      // Dia 2 — só Ana Paula.
      evento({ quando: '2026-03-04T13:00:00.000Z', origem: 'professor' }),
      evento({ quando: '2026-03-04T13:05:00.000Z', origem: 'cracha', matricula: '1', nome: 'Ana Paula' }),
    ]

    render(<GradeDePresencas turmas={[TURMA]} eventos={eventos} matriculados={[ANA, BRENO]} />)

    const dias = screen.getAllByRole('columnheader').filter((th) => th.className.includes('planilha__dia'))
    expect(dias).toHaveLength(2)

    const linhaAna = screen.getByText('Ana Paula').closest('tr')!
    expect(within(linhaAna).getByText('2/2')).toBeInTheDocument()

    const linhaBreno = screen.getByText('Breno Oliveira').closest('tr')!
    expect(within(linhaBreno).getByText('1/2')).toBeInTheDocument()
  })

  it('leitura repetida no mesmo dia continua contando como presença, uma vez só', () => {
    const eventos: Evento[] = [
      evento({ quando: '2026-03-02T13:00:00.000Z', origem: 'professor' }),
      evento({ quando: '2026-03-02T13:05:00.000Z', origem: 'cracha', matricula: '1', nome: 'Ana Paula' }),
      evento({
        quando: '2026-03-02T13:06:00.000Z',
        origem: 'cracha',
        matricula: '1',
        nome: 'Ana Paula',
        resultado: 'duplicado',
      }),
    ]

    render(<GradeDePresencas turmas={[TURMA]} eventos={eventos} matriculados={[ANA]} />)

    expect(screen.getByText('1/1')).toBeInTheDocument()
    expect(document.querySelector('.quadrado--repetido')).toBeInTheDocument()
  })
})

describe('estados vazios', () => {
  it('sem turma nenhuma', () => {
    render(<GradeDePresencas turmas={[]} eventos={[]} matriculados={[]} />)
    expect(screen.getByText('Nenhuma turma cadastrada ainda.')).toBeInTheDocument()
  })

  it('turma sem aluno nenhum', () => {
    render(<GradeDePresencas turmas={[TURMA]} eventos={[]} matriculados={[]} />)
    expect(screen.getByText(`Nenhum aluno cadastrado ainda em ${TURMA}.`)).toBeInTheDocument()
  })

  it('turma com aluno mas sem aula registrada ainda', () => {
    render(<GradeDePresencas turmas={[TURMA]} eventos={[]} matriculados={[ANA]} />)
    expect(screen.getByText(`Nenhuma aula registrada ainda em ${TURMA}.`)).toBeInTheDocument()
  })
})
