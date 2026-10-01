// Semear (modo de ensaio): vínculos para o baralho do leitor simulado, uma
// aula agora na grade e quatro presenças. Os eventos passam por
// `gravarEventoNovo`, como qualquer outro: número inventado à mão colidia com
// a numeração reservada, e o evento sumia calado.

import { calcularUidHash, idDoSal } from '../../nucleo/hash.ts'
import type { Config } from '../../nucleo/tipos.ts'
import { gravarEventoNovo, type Repositorio } from '../../portas/Repositorio.ts'
import { hhmm } from './formatos.ts'

const NOMES_SEMEADOS = [
  { papel: 'professor' as const, nome: 'Helena Duarte Lima' },
  { papel: 'aluno' as const, nome: 'Willian Neves' },
  { papel: 'aluno' as const, nome: 'Maria Vitória' },
  { papel: 'aluno' as const, nome: 'João Pedro' },
  { papel: 'aluno' as const, nome: 'Luiz Felipe' },
  { papel: 'aluno' as const, nome: 'Rafael Moura' },
]

const TURMA = 'IF685 · T01'

export async function semear(
  repositorio: Repositorio,
  config: Pick<Config, 'salHex' | 'instalacaoId'>,
  baralho: readonly string[],
): Promise<void> {
  const agora = new Date()
  const salId = await idDoSal(config.salHex)

  const pessoas = await Promise.all(
    baralho.map(async (hex, i) => {
      const uidHash = await calcularUidHash(
        config.salHex,
        Uint8Array.from(hex.match(/../g)!.map((b) => Number.parseInt(b, 16))),
      )
      const { papel, nome } = NOMES_SEMEADOS[i % NOMES_SEMEADOS.length]
      await repositorio.gravarVinculo({ uidHash, papel, nome, criadoEm: agora.toISOString(), salId })
      return { uidHash, papel, nome }
    }),
  )

  const professor = pessoas.find((p) => p.papel === 'professor')!
  // Semear duas vezes não vira duas aulas iguais: a aula não tem chave natural.
  const jaTem = (await repositorio.listarAulas()).some(
    (a) => a.uidHashProfessor === professor.uidHash && a.dia === agora.getDay() && a.turma === TURMA,
  )
  if (!jaTem) {
    await repositorio.gravarAula({
      uidHashProfessor: professor.uidHash,
      dia: agora.getDay(),
      inicio: hhmm(agora),
      fim: hhmm(new Date(agora.getTime() + 90 * 60_000)),
      turma: TURMA,
    })
  }

  const presentes = [professor, ...pessoas.filter((p) => p.papel === 'aluno').slice(0, 3)]
  for (const [i, quem] of presentes.entries()) {
    const quando = new Date(agora.getTime() + i * 60_000)
    await gravarEventoNovo(repositorio, config.instalacaoId, quando, (eventoId) => ({
      eventoId,
      quando: quando.toISOString(),
      turma: TURMA,
      uidHash: quem.uidHash,
      nome: quem.nome,
      origem: quem.papel === 'professor' ? 'professor' : 'cracha',
      resultado: 'ok',
    }))
  }
}
