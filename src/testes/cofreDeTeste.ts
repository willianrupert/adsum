// Um cofre de verdade, na forma, para os testes — ver `scripts/anonimizar_cofre.py`.
//
// A suíte começava sempre de base limpa, e os defeitos de 22/09/2026 só existem
// com histórico. Os cofres em `cofres/` vieram de pastas reais de professor,
// anonimizados: ids, horários, instalações e repetições são os originais;
// nomes, matrículas, hashes e o sal são inventados.
//
// A pasta é escrita com as mesmas funções que o app usa para gravar, e o log
// linha a linha na ordem original — inclusive as linhas de `evento_id`
// repetido, que são a parte que importa.

import aula2209 from './cofres/aula-2209.json'
import { NOMES, paraJsonConfig, paraJsonGrade, paraJsonTurma, paraJsonVinculos } from '../nucleo/cofre.ts'
import { cabecalhoCsv, linhaCsv } from '../nucleo/csv.ts'
import { caminhoDosRegistros } from '../ambiente/sincronia.ts'
import { escrever } from '../ambiente/pasta.ts'
import type { Aula, Config, Evento, Matriculado, Vinculo } from '../nucleo/tipos.ts'
import { criarPastaFalsa } from './pastaFalsa.ts'

export interface CofreDeTeste {
  config: Pick<Config, 'salHex' | 'instalacaoId' | 'criadoEm'>
  vinculos: Vinculo[]
  grade: Aula[]
  turmas: Record<string, Matriculado[]>
  registros: Record<string, Evento[]>
}

/** A pasta de CIN0144 e CIN0114 no fim da aula de 22/09/2026. */
export const AULA_2209 = aula2209 as unknown as CofreDeTeste

export async function pastaDoCofre(cofre: CofreDeTeste) {
  const pasta = criarPastaFalsa()
  const { handle } = pasta
  await escrever(handle, NOMES.config, paraJsonConfig({ id: 1, ...cofre.config } as Config))
  await escrever(handle, NOMES.vinculos, paraJsonVinculos(cofre.vinculos))
  await escrever(handle, NOMES.grade, paraJsonGrade(cofre.grade))
  for (const [turma, pessoas] of Object.entries(cofre.turmas)) {
    await escrever(handle, NOMES.turma(turma), paraJsonTurma(pessoas))
  }
  for (const [turma, eventos] of Object.entries(cofre.registros)) {
    await escrever(handle, caminhoDosRegistros(turma), cabecalhoCsv() + eventos.map((e) => linhaCsv(e) + '\n').join(''))
  }
  return pasta
}
