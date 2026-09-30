// Os registros como arquivo: importar um log, exportar os logs por turma e a
// planilha de faltas. Ferramenta, não uso do dia a dia: com pasta, os dois
// arquivos já estão no disco.

import { abrirTexto, salvarTexto } from '../../ambiente/arquivos.ts'
import { importarEventos } from '../../ambiente/logDaPasta.ts'
import { deCsv, nomeDoArquivo, paraCsv, porTurma } from '../../nucleo/csv.ts'
import { nomeDoArquivoDeFaltas, paraCsvDeFaltas, planilhaDeFaltas } from '../../nucleo/faltas.ts'
import type { Aula, Matriculado } from '../../nucleo/tipos.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import type { Resultado } from '../componentes/Importacao.tsx'
import { Linha, Painel } from '../componentes/Painel.tsx'
import type { Tentar } from '../hooks/useTentativa.ts'

export function PainelDeRegistros({
  repositorio,
  turmas,
  aulas,
  matriculados,
  totalEventos,
  tentar,
  aoImportar,
}: {
  repositorio: Repositorio
  turmas: string[]
  aulas: Aula[]
  matriculados: Matriculado[]
  totalEventos: number
  tentar: Tentar
  aoImportar: (resultado: Resultado) => void
}) {
  // Pelo mesmo caminho da restauração: `evento_id` repetido com outro
  // conteúdo entra com id derivado, e nenhuma linha fica de fora calada.
  const importar = tentar('Importar registros', async () => {
    const arquivo = await abrirTexto()
    if (!arquivo) return 'cancelado.'
    const { itens, problemas } = deCsv(arquivo.texto)
    await importarEventos(repositorio, itens)
    aoImportar({ arquivo: arquivo.nome, aceitos: itens.length, problemas })
    return `${itens.length} linhas lidas.`
  })

  const exportar = tentar('Exportar registros', async () => {
    const eventos = await repositorio.listarEventos()
    // A matrícula de evento antigo, sem a coluna, vem do vínculo de hoje.
    const vinculos = await repositorio.listarVinculos()
    const matriculaPorHash = new Map(vinculos.map((v) => [v.uidHash, v.matricula]))
    const ordenados = [...eventos]
      .reverse()
      .map((e) => ({ ...e, matricula: e.matricula ?? matriculaPorHash.get(e.uidHash) }))
    const porTurmas = porTurma(ordenados)
    if (porTurmas.size === 0) throw new Error('nenhum registro para exportar')
    const nomes: string[] = []
    for (const [turma, linhas] of porTurmas) {
      const alvo = nomeDoArquivo(turma)
      if ((await salvarTexto(alvo, paraCsv(linhas))) === 'cancelado') break
      nomes.push(alvo)
    }
    return nomes.length > 0 ? `${nomes.join(', ')}.` : 'cancelado.'
  })

  const exportarFaltas = tentar('Exportar faltas', async () => {
    const eventos = await repositorio.listarEventos()
    const planilhas = turmas
      .map((turma) => ({ turma, planilha: planilhaDeFaltas(eventos, matriculados, aulas, turma) }))
      .filter(({ planilha }) => planilha.dias.length > 0 && planilha.linhas.length > 0)
    if (planilhas.length === 0) throw new Error('nenhuma turma com aula registrada ainda')
    const nomes: string[] = []
    for (const { turma, planilha } of planilhas) {
      const alvo = nomeDoArquivoDeFaltas(turma)
      if ((await salvarTexto(alvo, paraCsvDeFaltas(planilha))) === 'cancelado') break
      nomes.push(alvo)
    }
    return nomes.length > 0 ? `${nomes.join(', ')}.` : 'cancelado.'
  })

  return (
    <Painel
      titulo="Registros"
      recolhivel
      legenda="Quem esteve presente, e o que a planilha consome."
      acoes={
        <>
          <button onClick={importar}>Importar</button>
          <button onClick={exportar}>Exportar</button>
          <button onClick={exportarFaltas}>Exportar faltas</button>
        </>
      }
    >
      <Linha rotulo="linhas gravadas">{totalEventos}</Linha>
    </Painel>
  )
}
