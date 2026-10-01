// Os Ajustes da base: o resumo, a grade, os vínculos, a pasta, passar os
// crachás e recomeçar. Cada painel mora em `ui/ajustes/`; aqui ficam os
// dados que eles compartilham e a ordem em que aparecem. Os arquivos são os
// mesmos do cofre em pasta (`docs/01_cofre.md`).

import { CartaoDoLeitor } from './componentes/CartaoDoLeitor.tsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { abrirTexto, salvarTexto } from '../ambiente/arquivos.ts'
import { semDono } from '../ambiente/diario.ts'
import { deJsonGrade, NOMES, paraJsonGrade } from '../nucleo/cofre.ts'
import { quemFalta } from '../nucleo/sessao.ts'
import type { Aula, Matriculado, Vinculo } from '../nucleo/tipos.ts'
import { useAdsum } from './adsum.ts'
import { GradeDeAjustes } from './ajustes/GradeDeAjustes.tsx'
import { PainelDaPasta } from './ajustes/PainelDaPasta.tsx'
import { PainelDeCompartilhar } from './ajustes/PainelDeCompartilhar.tsx'
import { PainelDeVinculos } from './ajustes/PainelDeVinculos.tsx'
import { PainelLancarNoSigaa } from './ajustes/PainelLancarNoSigaa.tsx'
import { PainelRecomecar } from './ajustes/PainelRecomecar.tsx'
import { ResumoDaBase, type TurmaNoResumo } from './ajustes/ResumoDaBase.tsx'
import { comoFoi, confirmarOuCancelar, useTentativa } from './hooks/useTentativa.ts'
import { Importacao, type Resultado } from './componentes/Importacao.tsx'
import { Painel, Secao } from './componentes/Painel.tsx'

export function TelaRepositorio({
  pasta,
  aoTrocarPasta,
  aoRelerPasta,
  aoDesconectarPasta,
  aoResetar,
  aoVerPresencas,
  aoNovaTurma,
}: {
  pasta?: FileSystemDirectoryHandle
  aoTrocarPasta?: () => void
  /** Puxa da pasta para a base, sem apagar nada. */
  aoRelerPasta?: () => Promise<{ arquivos: string[]; problemas: string[] }>
  /** Solta o vínculo com a pasta. Não apaga arquivo nem base. */
  aoDesconectarPasta?: () => Promise<void>
  /** Apaga a base deste navegador. Os arquivos da pasta ficam. */
  aoResetar?: () => Promise<void>
  /** A planilha de presenças, a mesma folha do repouso. */
  aoVerPresencas?: () => void
  /** Ausente com uma chamada em andamento: não há onde montar a colagem. */
  aoNovaTurma?: () => void
} = {}) {
  const { repositorio, config, recarregarConfig } = useAdsum()

  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [turmas, setTurmas] = useState<string[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [matriculados, setMatriculados] = useState<Matriculado[]>([])
  const [importacao, setImportacao] = useState<Resultado>()

  const carregar = useCallback(async () => {
    const [v, a, e, t, m] = await Promise.all([
      repositorio.listarVinculos(),
      repositorio.listarAulas(),
      repositorio.contarEventos(),
      repositorio.listarTurmas(),
      repositorio.listarMatriculados(),
    ])
    setVinculos(v)
    setAulas(a)
    setTotalEventos(e)
    setTurmas(t)
    setMatriculados(m)
  }, [repositorio])

  useEffect(() => {
    semDono('carregar ajustes', carregar)
  }, [carregar])

  const { recado, tentar } = useTentativa(carregar)

  const professores = useMemo(() => vinculos.filter((v) => v.papel === 'professor'), [vinculos])
  const sinteticos = useMemo(() => vinculos.filter((v) => v.sintetico).length, [vinculos])

  const faltamPorTurma = useMemo<TurmaNoResumo[]>(
    () =>
      turmas.map((turma) => {
        const daTurma = matriculados.filter((m) => m.turma === turma)
        return {
          turma,
          total: daTurma.length,
          faltam: quemFalta(daTurma, vinculos).length,
          naGrade: aulas.filter((a) => a.turma === turma).length,
        }
      }),
    [turmas, matriculados, vinculos, aulas],
  )

  /**
   * Excluir uma turma tira a lista e o horário dela. Vínculos ficam (o crachá
   * continua sendo de quem é) e o registro de presença também: é append-only.
   */
  const excluirTurma = ({ turma, total, naGrade }: TurmaNoResumo) =>
    tentar(`Excluir ${turma}`, async () => {
      const partes = [`os ${total} ${total === 1 ? 'nome' : 'nomes'} cadastrados`]
      if (naGrade > 0) partes.push(`${naGrade} ${naGrade === 1 ? 'horário' : 'horários'} na grade`)
      confirmarOuCancelar(
        `Excluir a turma ${turma}? Saem ${partes.join(' e ')}. O histórico de presença já gravado continua intacto — não se apaga.`,
      )
      await repositorio.zerarTurma(turma)
      await repositorio.definirHorarioDaTurma(turma, [])
    })

  const importarGrade = tentar(`Importar ${NOMES.grade}`, async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { conteudo, problemas } = deJsonGrade(arquivo.texto)
    for (const aula of conteudo ?? []) await repositorio.gravarAula({ ...aula, id: undefined })
    setImportacao({
      arquivo: arquivo.nome,
      aceitos: conteudo?.length ?? 0,
      problemas: problemas.map((p, i) => ({ linha: i + 1, texto: arquivo.nome, motivo: p.motivo })),
    })
    return `${conteudo?.length ?? 0} aulas.`
  })

  return (
    <div className="diagnostico">
      <Secao titulo="Seus dados" />

      <ResumoDaBase
        comCracha={vinculos.length - sinteticos}
        professores={professores.length}
        sinteticos={sinteticos}
        aulas={aulas.length}
        registros={totalEventos}
        turmas={faltamPorTurma}
        aoExcluirTurma={excluirTurma}
        aoNovaTurma={aoNovaTurma}
      />

      {recado && <div className={`aviso aviso--${recado.tom}`}>{recado.texto}</div>}
      {importacao && <Importacao resultado={importacao} />}

      {aoVerPresencas && (
        <Painel titulo="Ver presenças" legenda="A planilha do curso, por turma." aoAbrir={aoVerPresencas} />
      )}

      <PainelLancarNoSigaa turmas={turmas} />

      <Painel
        titulo="Grade horária"
        recolhivel
        legenda="Quando cada turma tem aula."
        acoes={
          <>
            <button onClick={importarGrade}>Importar</button>
            <button
              onClick={tentar(`Exportar ${NOMES.grade}`, async () =>
                comoFoi(await salvarTexto(NOMES.grade, paraJsonGrade(aulas)), NOMES.grade),
              )}
            >
              Exportar
            </button>
          </>
        }
      >
        <GradeDeAjustes
          turmas={turmas}
          aulas={aulas}
          professorPadrao={professores[0]?.uidHash ?? ''}
          aoMudar={async (turma, novas) => {
            await repositorio.definirHorarioDaTurma(turma, novas)
            await carregar()
          }}
        />
      </Painel>

      <PainelDeVinculos
        vinculos={vinculos}
        matriculados={matriculados}
        repositorio={repositorio}
        tentar={tentar}
        aoEditarLocal={(uidHash, nome) =>
          setVinculos((antes) => antes.map((x) => (x.uidHash === uidHash ? { ...x, nome } : x)))
        }
        aoImportar={setImportacao}
      />

      {/* Sem pasta, os dados existem num navegador, não no computador: o mesmo
          Mac com Chrome e Safari tem duas bases. */}
      <Secao titulo="Este computador" />

      <Painel titulo="O leitor de crachá" legenda="USB, de 13,56 MHz, sem driver." recolhivel>
        <CartaoDoLeitor />
        <p className="ferramentas__nota">
          Durante a chamada, deixe a janela do Adsum na frente: o leitor digita onde estiver
          o cursor. Se um crachá não for lido, o Diagnóstico mostra o que chegou.
        </p>
      </Painel>

      <PainelDaPasta
        pasta={pasta}
        tentar={tentar}
        aoTrocarPasta={aoTrocarPasta}
        aoRelerPasta={aoRelerPasta}
        aoDesconectarPasta={aoDesconectarPasta}
      />

      <PainelDeCompartilhar
        vinculos={vinculos}
        config={config}
        repositorio={repositorio}
        tentar={tentar}
        recarregarConfig={recarregarConfig}
      />

      {aoResetar && <PainelRecomecar tentar={tentar} aoResetar={aoResetar} />}
    </div>
  )
}
