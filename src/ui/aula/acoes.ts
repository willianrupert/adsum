// O que a tela da chamada grava na base, sem React: vincular um crachá,
// marcar presença à mão, e gravar a decisão tomada pela busca.

import { ehDaPessoa } from '../../nucleo/chamada.ts'
import { idDoSal, uidHashSintetico } from '../../nucleo/hash.ts'
import { eventoDe, type Decisao } from '../../nucleo/sessao.ts'
import type { Evento, Matriculado, Vinculo } from '../../nucleo/tipos.ts'
import { gravarEventoNovo, type Repositorio } from '../../portas/Repositorio.ts'

/**
 * Grava o vínculo de um crachá recém-identificado.
 *
 * Para professor, substitui o vínculo anterior dele (o sintético do botão, ou
 * o crachá perdido) e migra a grade que apontava para o hash antigo: com os
 * dois convivendo, a grade presa ao velho nunca mais bateria.
 */
export async function vincularCracha(
  repositorio: Repositorio,
  vinculos: readonly Vinculo[],
  pessoa: Matriculado,
  uidHash: string,
  quando: Date,
): Promise<void> {
  if (pessoa.papel === 'professor') {
    const antigo = vinculos.find(
      (v) => v.papel === 'professor' && v.uidHash !== uidHash && (v.sintetico || ehDaPessoa(v, pessoa)),
    )
    if (antigo) {
      await repositorio.removerVinculo(antigo.uidHash)
      for (const aula of (await repositorio.listarAulas()).filter((a) => a.uidHashProfessor === antigo.uidHash)) {
        await repositorio.gravarAula({ ...aula, uidHashProfessor: uidHash })
      }
    }
  }
  await repositorio.gravarVinculo({
    uidHash,
    papel: pessoa.papel,
    nome: pessoa.nome,
    matricula: pessoa.matricula || undefined,
    criadoEm: quando.toISOString(),
    // Crachá sem dono é calculado no sal atual da base, lido dela.
    salId: await idDoSal((await repositorio.lerConfig()).salHex),
  })
}

/**
 * Presente ou "Não presente" à mão, com ou sem crachá: evento `manual`,
 * identificado pela matrícula (ou nome), na hora real do clique.
 */
export function gravarPresencaManual(
  repositorio: Repositorio,
  instalacaoId: string,
  pessoa: Matriculado,
  nomeExibido: string,
  presente: boolean,
): Promise<Evento> {
  const agora = new Date()
  return gravarEventoNovo(repositorio, instalacaoId, agora, (eventoId) => ({
    eventoId,
    quando: agora.toISOString(),
    turma: pessoa.turma,
    matricula: pessoa.matricula || undefined,
    nome: nomeExibido,
    origem: 'manual',
    resultado: presente ? 'ok' : 'removido',
    // Quem não tem crachá não tem hash: um sorteado, que não conta como crachá.
    uidHash: uidHashSintetico(),
  }))
}

/** Grava o evento de uma decisão, se ela gera um. O número sai de `gravarEventoNovo`. */
export async function gravarDecisao(
  repositorio: Repositorio,
  instalacaoId: string,
  decisao: Decisao,
  dados: { quando: Date; turma: string; uidHash: string },
  aoIdOcupado?: (eventoId: string) => void,
): Promise<Evento | undefined> {
  const rascunho = eventoDe(decisao, { eventoId: '', ...dados })
  if (!rascunho) return undefined
  return gravarEventoNovo(repositorio, instalacaoId, dados.quando, (eventoId) => ({ ...rascunho, eventoId }), aoIdOcupado)
}
