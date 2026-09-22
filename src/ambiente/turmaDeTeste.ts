// A turma sintética que o painel de testes físicos precisa: cria (ou
// reencontra) a turma, os vínculos e a sessão, sem nunca arriscar fechar ou
// interferir numa aula de verdade que o professor esteja dando.
//
// Idempotente de propósito: rodar de novo não duplica ninguém. `salvarTurma`
// já substitui a turma inteira, e os UIDs de teste são determinísticos —
// gravar o mesmo vínculo duas vezes é o mesmo vínculo.

import { adiarHorario } from './preferencias.ts'
import { calcularUidHash, uidHashSintetico } from '../nucleo/hash.ts'
import { decimalParaBytes } from '../nucleo/digitacao.ts'
import { matriculadosDeTeste, TURMA_DE_TESTE, uidCurtoDeTeste } from '../nucleo/suiteDeTestes.ts'
import type { Config } from '../nucleo/tipos.ts'
import type { Repositorio } from '../portas/Repositorio.ts'

const QUANTIDADE = 12
const NOME_PROFESSOR_DE_TESTE = 'Professor de teste (Diagnóstico)'

export type SituacaoDaTurmaDeTeste =
  /** A sessão aberta agora é a da turma de teste — o cenário avançado pode rodar. */
  | 'pronta'
  /** Sem sessão nenhuma aberta: preparar não arrisca nada. */
  | 'precisa_preparar'
  /** Há uma sessão aberta, mas de outra turma — não se mexe nela. */
  | 'outra_sessao_aberta'

export async function situacaoDaTurmaDeTeste(repositorio: Repositorio): Promise<SituacaoDaTurmaDeTeste> {
  const sessao = await repositorio.sessaoAberta()
  if (!sessao) return 'precisa_preparar'
  return sessao.turma === TURMA_DE_TESTE ? 'pronta' : 'outra_sessao_aberta'
}

async function garantirProfessorDeTeste(repositorio: Repositorio): Promise<string> {
  const existente = (await repositorio.listarVinculos()).find(
    (v) => v.papel === 'professor' && v.sintetico && v.nome === NOME_PROFESSOR_DE_TESTE,
  )
  if (existente) return existente.uidHash
  const uidHash = uidHashSintetico()
  await repositorio.gravarVinculo({
    uidHash,
    papel: 'professor',
    nome: NOME_PROFESSOR_DE_TESTE,
    criadoEm: new Date().toISOString(),
    sintetico: true,
  })
  return uidHash
}

/**
 * Cria a turma de teste e abre a chamada nela. Confere `sessaoAberta()` de
 * novo aqui dentro — quem chama já checou `situacaoDaTurmaDeTeste`, mas
 * "recusar em vez de arriscar" vale a segunda conferência: entre checar e
 * chamar, o professor pode ter começado a aula dele.
 */
export async function prepararTurmaDeTeste(repositorio: Repositorio, config: Config): Promise<void> {
  const sessao = await repositorio.sessaoAberta()
  if (sessao && sessao.turma !== TURMA_DE_TESTE) {
    throw new Error(
      `Há uma chamada aberta em "${sessao.turma}". Encerre-a antes de preparar a turma de teste.`,
    )
  }

  const matriculados = matriculadosDeTeste(QUANTIDADE)
  await repositorio.salvarTurma(TURMA_DE_TESTE, matriculados)
  // Sem isto, `decidirRota` (`nucleo/rota.ts`) manda pro cronograma antes de
  // deixar ver a chamada — turma sem grade nenhuma vem antes de sessão
  // aberta, na ordem de perguntas. Achado ao vivo em 22/09/2026: a primeira
  // vez que este fluxo rodou de verdade, o autor teve que preencher um
  // horário à toa só pra passar por essa tela. O mesmo "Depois" que o
  // cronograma de verdade oferece, aplicado sozinho.
  adiarHorario(TURMA_DE_TESTE)

  for (let i = 0; i < QUANTIDADE; i++) {
    const uid = decimalParaBytes(uidCurtoDeTeste(i))
    if (!uid) continue // não deveria acontecer — uidCurtoDeTeste é sempre numérico
    const uidHash = await calcularUidHash(config.salHex, uid)
    await repositorio.gravarVinculo({
      uidHash,
      papel: 'aluno',
      nome: matriculados[i].nome,
      matricula: matriculados[i].matricula,
      criadoEm: new Date().toISOString(),
    })
  }

  if (!sessao) {
    const uidHashProfessor = await garantirProfessorDeTeste(repositorio)
    await repositorio.abrirSessao({
      turma: TURMA_DE_TESTE,
      abertaEm: new Date().toISOString(),
      uidHashProfessor,
    })
  }
}
