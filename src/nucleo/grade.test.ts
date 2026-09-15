import { describe, expect, it } from 'vitest'
import {
  abrirSozinho,
  abrirSozinhoEntreProfessores,
  proximaAula,
  proximaAulaDeQualquer,
  FOLGA_MIN,
  aulasAgora,
  emMinutos,
  escolherTurma,
  horaValida,
} from './grade.ts'

const PROF = 'aaaa000000000000'
const OUTRO = 'bbbb000000000000'

// 19/08/2026 é uma quarta-feira (dia 3).
const quarta = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`)

const aula = (turma: string, dia: number, inicio: string, fim: string, prof = PROF) => ({
  uidHashProfessor: prof,
  dia,
  inicio,
  fim,
  turma,
})

const GRADE = [
  aula('IF685 · T01', 3, '08:00', '10:00'),
  aula('IF669 · T02', 3, '10:00', '12:00'),
  aula('IF700 · T03', 5, '08:00', '10:00'),
  aula('IF999 · T09', 3, '08:00', '10:00', OUTRO),
]

describe('horários', () => {
  it('valida e mede', () => {
    expect(horaValida('08:00')).toBe(true)
    expect(horaValida('24:00')).toBe(false)
    expect(emMinutos('08:30')).toBe(510)
  })
})

describe('aulas acontecendo agora', () => {
  it('acha a do horário', () => {
    expect(aulasAgora(GRADE, PROF, quarta('09:00')).map((a) => a.turma)).toEqual(['IF685 · T01'])
  })

  // O professor chega antes e sai depois; abrir às 7h52 é o caso normal.
  it('aceita a folga antes e depois', () => {
    expect(aulasAgora(GRADE, PROF, quarta('07:45')).map((a) => a.turma)).toEqual(['IF685 · T01'])
    expect(FOLGA_MIN).toBe(20)
  })

  it('não pega aula de outro dia nem de outro professor', () => {
    expect(aulasAgora(GRADE, PROF, quarta('15:00'))).toEqual([])
    expect(aulasAgora(GRADE, OUTRO, quarta('09:00')).map((a) => a.turma)).toEqual(['IF999 · T09'])
  })

  it('na virada, as duas aulas contam — é o caso ambíguo de verdade', () => {
    expect(aulasAgora(GRADE, PROF, quarta('10:05'))).toHaveLength(2)
  })
})

describe('que turma abrir', () => {
  const TURMAS = ['IF685 · T01', 'IF669 · T02']

  // Nunca perguntar o que dá para saber.
  it('abre direto quando a grade diz uma só', () => {
    expect(escolherTurma(GRADE, TURMAS, PROF, quarta('09:00'))).toEqual({
      tipo: 'abrir',
      turma: 'IF685 · T01',
    })
  })

  it('pergunta quando duas se sobrepõem', () => {
    const escolha = escolherTurma(GRADE, TURMAS, PROF, quarta('10:05'))
    expect(escolha).toMatchObject({ tipo: 'perguntar', motivo: 'varias' })
  })

  // Feriado, reposição, grade não cadastrada: a pergunta cai sobre todas.
  it('sem aula na grade, pergunta entre as turmas', () => {
    const escolha = escolherTurma(GRADE, TURMAS, PROF, quarta('15:00'))
    expect(escolha).toEqual({ tipo: 'perguntar', opcoes: TURMAS, motivo: 'nenhuma' })
  })

  it('com uma turma só, não pergunta nada nem fora de horário', () => {
    expect(escolherTurma([], ['IF685 · T01'], PROF, quarta('15:00'))).toEqual({
      tipo: 'abrir',
      turma: 'IF685 · T01',
    })
  })

  it('sem turma nenhuma, não há o que abrir', () => {
    expect(escolherTurma([], [], PROF, quarta('09:00'))).toEqual({ tipo: 'sem_turma' })
  })

  // Era a falha silenciosa: com duas turmas e sem grade, o crachá não fazia
  // nada e a tela não dizia por quê.
  it('duas turmas sem grade não deixa o crachá sem resposta', () => {
    expect(escolherTurma([], TURMAS, PROF, quarta('09:00')).tipo).toBe('perguntar')
  })
})

describe('a aula que abre sozinha', () => {
  const AULA = {
    uidHashProfessor: 'prof',
    dia: 3,
    inicio: '08:00',
    fim: '10:00',
    turma: 'IF685 · T01',
  }
  // Quarta-feira, 19/08/2026.
  const em = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`)

  it('abre na hora da aula, sem ninguém pedir', () => {
    expect(abrirSozinho([AULA], 'prof', em('08:05'))).toBe('IF685 · T01')
  })

  it('a folga vale aqui também — o professor chega antes', () => {
    expect(abrirSozinho([AULA], 'prof', em('07:45'))).toBe('IF685 · T01')
    expect(abrirSozinho([AULA], 'prof', em('07:30'))).toBeUndefined()
  })

  // A degradação "só existe uma turma, abre essa" é boa para um gesto
  // deliberado e péssima aqui: sem grade, a chamada valeria no domingo à noite.
  it('sem aula na grade não abre nada, mesmo com uma turma só', () => {
    expect(abrirSozinho([], 'prof', em('08:05'))).toBeUndefined()
  })

  it('duas ao mesmo tempo não são adivinhadas', () => {
    const outra = { ...AULA, turma: 'IF969 · T02' }
    expect(abrirSozinho([AULA, outra], 'prof', em('08:05'))).toBeUndefined()
  })

  // Encerrar às 9h30 uma aula que vai até as 10h não pode ser desfeito pelo
  // relógio no segundo seguinte.
  it('não reabre o que o professor encerrou dentro da janela', () => {
    const encerradas = { 'IF685 · T01': '2026-08-19T09:30:00' }
    expect(abrirSozinho([AULA], 'prof', em('09:31'), encerradas)).toBeUndefined()
  })

  it('mas o encerramento da semana passada não impede a aula de hoje', () => {
    const encerradas = { 'IF685 · T01': '2026-08-12T09:30:00' }
    expect(abrirSozinho([AULA], 'prof', em('08:05'), encerradas)).toBe('IF685 · T01')
  })
})

describe('a próxima aula', () => {
  const SEG = { uidHashProfessor: 'prof', dia: 1, inicio: '10:00', fim: '12:00', turma: 'A' }
  const QUA = { uidHashProfessor: 'prof', dia: 3, inicio: '08:00', fim: '10:00', turma: 'B' }
  // Quarta-feira, 19/08/2026.
  const em = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`)

  it('acha a de hoje quando ela ainda não começou', () => {
    expect(proximaAula([SEG, QUA], 'prof', em('06:00'))?.aula.turma).toBe('B')
  })

  // Passada a hora de hoje, a próxima é a da semana que vem — e não a de hoje
  // de novo, que é o erro clássico de quem só compara o horário.
  it('depois da aula de hoje, pula para a próxima da semana', () => {
    const proxima = proximaAula([SEG, QUA], 'prof', em('11:00'))
    expect(proxima?.aula.turma).toBe('A')
    expect(proxima?.quando.getDay()).toBe(1)
  })

  // Reproduzido de verdade pelo autor: às 13:58, dentro do bloco de 13:00 às
  // 14:50 de uma turma, "Sua próxima aula" apontava outra — a de hoje, ainda
  // rolando, tinha sido descartada por comparar só o início (08:00 já
  // passou), e uma turma mais distante, mas ainda não começada, ganhava por
  // padrão. O corte certo é o fim: uma aula em andamento continua sendo a de
  // hoje, não a de semana que vem.
  it('durante a aula de hoje, continua sendo a de hoje — não pula pra semana que vem', () => {
    const proxima = proximaAula([SEG, QUA], 'prof', em('09:00'))
    expect(proxima?.aula.turma).toBe('B')
    expect(proxima?.quando.getDay()).toBe(3)
  })

  // 09:00 caiu dentro do próprio bloco (08:00–10:00) — antes do conserto
  // acima, isso já bastava pra pular pra semana que vem, mesmo com a aula
  // ainda rolando. `em('11:00')`, depois do fim, é o caso de verdade que
  // "volta em sete dias" quer testar.
  it('a aula semanal única volta em sete dias', () => {
    const proxima = proximaAula([QUA], 'prof', em('11:00'))
    expect(proxima?.quando.toISOString().slice(0, 10)).toBe('2026-08-26')
  })

  it('sem grade, não promete nada', () => {
    expect(proximaAula([], 'prof', em('09:00'))).toBeUndefined()
    expect(proximaAula([QUA], 'outro', em('09:00'))).toBeUndefined()
  })
})

// Os blocos da noite encostam: um termina 18:50 e o outro começa 18:50. Com a
// folga de 20 minutos, das 18:30 às 19:10 os dois estão acontecendo — e o app
// precisa recusar adivinhar em vez de escolher um.
describe('as duas aulas coladas da noite', () => {
  const CEDO = { uidHashProfessor: 'prof', dia: 3, inicio: '17:00', fim: '18:50', turma: 'A' }
  const TARDE = { uidHashProfessor: 'prof', dia: 3, inicio: '18:50', fim: '20:30', turma: 'B' }
  const em = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`)

  it('na virada, com duas turmas, pergunta em vez de escolher', () => {
    const escolha = escolherTurma([CEDO, TARDE], ['A', 'B'], 'prof', em('18:45'))
    expect(escolha).toEqual({ tipo: 'perguntar', opcoes: ['A', 'B'], motivo: 'varias' })
  })

  it('e não abre sozinho, porque entre duas plausíveis não se adivinha', () => {
    expect(abrirSozinho([CEDO, TARDE], 'prof', em('18:45'))).toBeUndefined()
  })

  // Longe da virada não há ambiguidade nenhuma.
  it('fora da faixa de sobreposição, abre normalmente', () => {
    expect(abrirSozinho([CEDO, TARDE], 'prof', em('17:30'))).toBe('A')
    expect(abrirSozinho([CEDO, TARDE], 'prof', em('19:40'))).toBe('B')
  })
})

// Reproduzido de verdade pelo autor: 15/09/2026, 9:40, mais de uma turma
// cadastrada, só uma com aula naquele horário — e a tela de repouso não
// anunciou "Começar chamada". `Fluxo.recontar()` escolhia só o vínculo de
// professor que vencia a ordem alfabética de `listarVinculos()`; se a aula
// que bate "agora" é de **outro** professor, ela nunca era encontrada.
describe('a grade de vários professores', () => {
  const em = (hhmm: string) => new Date(`2026-08-19T${hhmm}:00`) // quarta
  const BEA = 'bea'
  const ZECA = 'zeca'
  const AULA_DA_ZECA = { uidHashProfessor: ZECA, dia: 3, inicio: '08:00', fim: '10:00', turma: 'IF685 · T01' }

  it('acha a aula de um professor mesmo quando outro (sem aula agora) é olhado primeiro', () => {
    // Bea não tem aula nenhuma agora; Zeca tem. Um `.find` que parasse em
    // Bea nunca chegaria à aula de Zeca.
    expect(abrirSozinhoEntreProfessores([AULA_DA_ZECA], [BEA, ZECA], em('08:05'))).toBe('IF685 · T01')
    expect(abrirSozinhoEntreProfessores([AULA_DA_ZECA], [ZECA, BEA], em('08:05'))).toBe('IF685 · T01')
  })

  // Duas turmas de professores diferentes batendo "agora" é a mesma
  // ambiguidade que `escolherTurma` resolve perguntando — sozinho, o
  // relógio não escolhe uma das duas.
  it('duas turmas de professores diferentes ao mesmo tempo não são adivinhadas', () => {
    const aulaDaBea = { uidHashProfessor: BEA, dia: 3, inicio: '08:00', fim: '10:00', turma: 'IF969 · T02' }
    expect(
      abrirSozinhoEntreProfessores([AULA_DA_ZECA, aulaDaBea], [BEA, ZECA], em('08:05')),
    ).toBeUndefined()
  })

  it('sem nenhum professor com aula agora, não abre nada', () => {
    expect(abrirSozinhoEntreProfessores([AULA_DA_ZECA], [BEA], em('08:05'))).toBeUndefined()
  })

  it('continua respeitando o que já foi encerrado', () => {
    const encerradas = { 'IF685 · T01': '2026-08-19T09:30:00' }
    expect(
      abrirSozinhoEntreProfessores([AULA_DA_ZECA], [BEA, ZECA], em('09:31'), encerradas),
    ).toBeUndefined()
  })

  it('a próxima aula de qualquer um dos professores, a mais cedo entre todos', () => {
    const daBea = { uidHashProfessor: BEA, dia: 1, inicio: '10:00', fim: '12:00', turma: 'A' } // segunda
    const doZeca = { uidHashProfessor: ZECA, dia: 3, inicio: '08:00', fim: '10:00', turma: 'B' } // quarta, hoje
    // Às 06:00 de quarta, a de hoje (Zeca) ainda não começou e vence.
    expect(proximaAulaDeQualquer([daBea, doZeca], [BEA, ZECA], em('06:00'))?.aula.turma).toBe('B')
    // Passada a aula de hoje, sobra a de segunda, de Bea — mesmo que a
    // ordem dos hashes coloque Zeca primeiro.
    const proxima = proximaAulaDeQualquer([daBea, doZeca], [ZECA, BEA], em('11:00'))
    expect(proxima?.aula.turma).toBe('A')
  })

  it('sem nenhum professor com grade, não promete nada', () => {
    expect(proximaAulaDeQualquer([], [BEA, ZECA], em('09:00'))).toBeUndefined()
  })
})
