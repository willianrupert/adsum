// A planilha, direto — sem sessão, sem leitor, sem relógio nenhum.
//
// A cobertura de "mais de um dia" morava em `JornadaCompleta.test.tsx`, com
// um relógio falso avançado artificialmente pra separar as datas. Cortada de
// lá porque o relógio falso ligado o teste inteiro travava no GitHub Actions
// sem nunca resolver. Aqui não precisa de relógio nenhum: os eventos já
// nascem com a data que se quer testar, como texto ISO comum — é só isso que
// `GradeDePresencas` lê.

import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GradeDePresencas } from './GradeDePresencas.tsx'
import type { Aula } from '../../nucleo/grade.ts'
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

    // O nome de tela mostra o completo — o mesmo que vai na exportação para
    // a instituição, não a forma curta usada na chamada.
    const linhaAna = screen.getByText('ANA PAULA DA SILVA').closest('tr')!
    expect(within(linhaAna).getByText('2/2')).toBeInTheDocument()
    // Presente é 0, com destaque de cor — não célula vazia.
    expect(within(linhaAna).getAllByText('0')).toHaveLength(2)

    const linhaBreno = screen.getByText('BRENO OLIVEIRA FILHO').closest('tr')!
    expect(within(linhaBreno).getByText('1/2')).toBeInTheDocument()
    // Faltou o segundo dia: a célula mostra "1" (um período), não um símbolo.
    expect(within(linhaBreno).getByText('1')).toBeInTheDocument()
  })

  // Presente é presente — uma cor à parte só para "leitura repetida" era
  // categoria que ninguém usava para decidir nada (pedido do autor).
  it('leitura repetida no mesmo dia continua contando como presença — mesma cor, mesmo número', () => {
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
    expect(document.querySelector('.quadrado--repetido')).not.toBeInTheDocument()
    expect(document.querySelector('.quadrado--presente')).toBeInTheDocument()
  })

  it('duas aulas seguidas na grade: faltar o bloco inteiro vale duas faltas', () => {
    const aulas: Aula[] = [
      // 2026-03-02 é uma segunda-feira.
      { uidHashProfessor: 'prof', dia: 1, inicio: '08:00', fim: '09:50', turma: TURMA },
    ]
    const eventos: Evento[] = [evento({ quando: '2026-03-02T08:00:00.000Z', origem: 'professor' })]

    render(<GradeDePresencas turmas={[TURMA]} eventos={eventos} matriculados={[ANA]} aulas={aulas} />)

    const celula = document.querySelector('.quadrado--ausente-grave')
    expect(celula).toBeInTheDocument()
    expect(celula).toHaveTextContent('2')
  })
})

describe('corrigir à mão', () => {
  const eventosComUmaFalta: Evento[] = [
    evento({ quando: '2026-03-02T13:00:00.000Z', origem: 'professor' }),
  ]

  it('sem aoCorrigir, não existe botão Editar', () => {
    render(<GradeDePresencas turmas={[TURMA]} eventos={eventosComUmaFalta} matriculados={[ANA]} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('em modo Editar, tocar numa falta chama aoCorrigir com o aluno e o dia certos', async () => {
    const usuario = userEvent.setup()
    const aoCorrigir = vi.fn().mockResolvedValue(undefined)

    render(
      <GradeDePresencas
        turmas={[TURMA]}
        eventos={eventosComUmaFalta}
        matriculados={[ANA]}
        aoCorrigir={aoCorrigir}
      />,
    )

    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    await usuario.click(screen.getByRole('button', { name: /marcar presença/ }))

    expect(aoCorrigir).toHaveBeenCalledWith(ANA, '2026-03-02')
  })

  // Ausência não se corrige aqui — só falta (>0) vira botão em modo Editar.
  it('uma célula já presente não vira botão, mesmo em modo Editar', async () => {
    const usuario = userEvent.setup()
    const eventos: Evento[] = [
      evento({ quando: '2026-03-02T13:00:00.000Z', origem: 'professor' }),
      evento({ quando: '2026-03-02T13:05:00.000Z', origem: 'cracha', matricula: '1', nome: 'Ana Paula' }),
    ]

    render(
      <GradeDePresencas turmas={[TURMA]} eventos={eventos} matriculados={[ANA]} aoCorrigir={vi.fn()} />,
    )

    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByRole('button', { name: /marcar presença/ })).not.toBeInTheDocument()
  })

  it('uma correção manual fica identificável na célula', () => {
    const eventos: Evento[] = [
      evento({ quando: '2026-03-02T13:00:00.000Z', origem: 'professor' }),
      evento({ quando: '2026-03-02T12:00:00.000Z', origem: 'manual', matricula: '1', nome: 'Ana Paula' }),
    ]

    render(<GradeDePresencas turmas={[TURMA]} eventos={eventos} matriculados={[ANA]} />)

    expect(document.querySelector('.quadrado__manual')).toBeInTheDocument()
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
