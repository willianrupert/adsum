// O que a casca do app precisa saber da base para decidir a rota: turmas,
// quem ainda não tem crachá, a sessão aberta, a grade e o que falta salvar.
// `recontar` relê tudo; quem muda a base pede uma recontagem.

import { useCallback, useEffect, useState } from 'react'
import { semDono } from '../../ambiente/diario.ts'
import {
  cadastroDispensado,
  esquecerDispensaDoCadastro,
  horariosAdiados,
  professorAtual,
} from '../../ambiente/preferencias.ts'
import type { Aula } from '../../nucleo/grade.ts'
import { naoSalvos, type Pendencia } from '../../nucleo/pendencias.ts'
import { quemFalta, type Sessao } from '../../nucleo/sessao.ts'
import type { Matriculado } from '../../nucleo/tipos.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'

export interface GradeLida {
  aulas: Aula[]
  /** Os hashes de todos os vínculos de professor, não só o primeiro. */
  hashes: string[]
}

export function useBase({ repositorio, pasta }: { repositorio: Repositorio; pasta?: FileSystemDirectoryHandle }) {
  const [sessao, setSessao] = useState<Sessao>()
  const [listaDeTurmas, setListaDeTurmas] = useState<string[]>([])
  const [pendentesDaTurma, setPendentesDaTurma] = useState<Matriculado[]>([])
  const [matriculadosTodos, setMatriculadosTodos] = useState<Matriculado[]>([])
  const [professorSemCracha, setProfessorSemCracha] = useState(false)
  const [semCadastro, setSemCadastro] = useState(cadastroDispensado)
  /** Aulas que existem só no navegador. Com pasta, sempre vazio. */
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [grade, setGrade] = useState<GradeLida>({ aulas: [], hashes: [] })
  /** A primeira turma sem horário que o professor ainda não adiou. */
  const [semHorario, setSemHorario] = useState<{ turma: string; aulas: Aula[] }>()
  const [uidDoProfessor, setUidDoProfessor] = useState('')
  /** De "Sou eu": personaliza a saudação do repouso. */
  const [nomeDoProfessorAtual, setNomeDoProfessorAtual] = useState('')

  const recontar = useCallback(async () => {
    const [turmas, matriculados, vinculos, aberta, config] = await Promise.all([
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
      repositorio.listarVinculos(),
      repositorio.sessaoAberta(),
      repositorio.lerConfig(),
    ])
    setSessao(aberta)
    // Com pasta nada fica pendente, e o log inteiro não precisa ser lido.
    setPendencias(pasta ? [] : naoSalvos(await repositorio.listarEventos(), config.exportado))

    // Todos os vínculos de professor contam para a grade: escolher um só
    // escondia a turma de outro docente (15/09/2026).
    const deProfessor = vinculos.filter((v) => v.papel === 'professor')
    const professor = deProfessor[0]
    setUidDoProfessor(professor?.uidHash ?? '')
    const hashAtual = professorAtual()
    setNomeDoProfessorAtual(hashAtual ? (vinculos.find((v) => v.uidHash === hashAtual)?.nome ?? '') : '')

    // Aula presa a um hash de professor que não existe mais (vazio, ou de um
    // vínculo sintético já substituído) nunca bateria com a grade: passa a
    // ser do professor atual.
    let aulas = await repositorio.listarAulas()
    if (professor) {
      const validos = new Set(deProfessor.map((v) => v.uidHash))
      const quebradas = aulas.filter((a) => !validos.has(a.uidHashProfessor))
      if (quebradas.length > 0) {
        for (const aula of quebradas) await repositorio.gravarAula({ ...aula, uidHashProfessor: professor.uidHash })
        aulas = await repositorio.listarAulas()
      }
    }

    const adiadas = new Set(horariosAdiados())
    const semGrade = turmas.find((t) => !adiadas.has(t) && !aulas.some((a) => a.turma === t))
    setSemHorario(semGrade ? { turma: semGrade, aulas: [] } : undefined)
    setGrade({ aulas, hashes: deProfessor.map((v) => v.uidHash) })

    const faltando = quemFalta(matriculados, vinculos)
    setListaDeTurmas(turmas)
    setPendentesDaTurma(faltando)
    setMatriculadosTodos(matriculados)
    setProfessorSemCracha(!professor)
    // A dispensa é "por agora": com o crachá do professor, não há o que adiar.
    if (professor) {
      esquecerDispensaDoCadastro()
      setSemCadastro(false)
    }
  }, [repositorio, pasta])

  useEffect(() => {
    semDono('recontar', recontar)
  }, [recontar])

  /**
   * A sessão acabou de ser fechada na base. Esquecê-la na hora, sem esperar a
   * recontagem, evita um instante com a tela da chamada ainda montada por
   * baixo do resumo.
   */
  const esquecerSessao = useCallback(() => setSessao(undefined), [])

  return {
    esquecerSessao,
    sessao,
    listaDeTurmas,
    turmas: listaDeTurmas.length,
    pendentes: pendentesDaTurma.length,
    pendentesDaTurma,
    matriculadosTodos,
    professorSemCracha,
    semCadastro,
    pendencias,
    grade,
    semHorario,
    uidDoProfessor,
    nomeDoProfessorAtual,
    recontar,
  }
}
