// Abrir a chamada: pelo botão, pelo Enter ou pelo crachá do professor, sempre
// a turma e o dia que o repouso está mostrando.
//
// Enquanto não há chamada, é aqui que o leitor é ouvido: o crachá do
// professor abre, e qualquer outro diz quem foi lido (é assim que o professor
// testa o leitor). Leituras que chegam durante a abertura ficam na antessala
// até a tela da chamada assumir.

import { useCallback, useEffect, useRef } from 'react'
import { curto, registrar, semDono } from '../../ambiente/diario.ts'
import { tocar } from '../../ambiente/som.ts'
import { diaLocal } from '../../nucleo/faltas.ts'
import { aulasAgora } from '../../nucleo/grade.ts'
import { uidHashSintetico } from '../../nucleo/hash.ts'
import { eventoDe, type Sessao } from '../../nucleo/sessao.ts'
import type { Evento, Vinculo } from '../../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../../portas/LeitorDeCracha.ts'
import { gravarEventoNovo, identificarCracha, type Repositorio } from '../../portas/Repositorio.ts'
import { Antessala } from '../antessala.ts'

export function useAbertura({
  leitor,
  repositorio,
  instalacaoId,
  sessao,
  turmaSelecionada,
  momentoDaChamada,
  voltarParaHoje,
  gravarLinha,
  mudou,
  aoLido,
  aoAviso,
}: {
  leitor: LeitorDeCracha
  repositorio: Repositorio
  instalacaoId: string
  sessao?: Sessao
  turmaSelecionada?: string
  momentoDaChamada: () => Date
  voltarParaHoje: () => void
  gravarLinha: (evento: Evento) => Promise<void>
  mudou: (turma?: string) => Promise<void>
  /** Um crachá lido sem chamada aberta: quem foi, sem mostrar o UID. */
  aoLido: (texto: string) => void
  aoAviso: (texto: string) => void
}) {
  const antessala = useRef(new Antessala())

  const abrirChamada = useCallback(
    async (turma: string, uidHash: string, em: Date) => {
      antessala.current.abrir()
      try {
        const vinculo = await repositorio.vinculoPorHash(uidHash)
        const rascunho = eventoDe({ tipo: 'abrir', turma, vinculo }, { eventoId: '', quando: em, turma, uidHash })
        if (rascunho) {
          const evento = await gravarEventoNovo(repositorio, instalacaoId, em, (eventoId) => ({ ...rascunho, eventoId }))
          await gravarLinha(evento)
          registrar('abrir', { evento: evento.eventoId, dia: diaLocal(em.toISOString()) })
        }
        await repositorio.abrirSessao({ turma, abertaEm: em.toISOString(), uidHashProfessor: uidHash })
      } catch (erro) {
        // Não abriu: o que esperava na antessala fica dito no diário.
        const perdidas = antessala.current.entregar()
        if (perdidas.length > 0) registrar('leituras_sem_chamada', { quantas: perdidas.length })
        throw erro
      }
      tocar('abertura')
      await mudou(turma)
    },
    [repositorio, instalacaoId, gravarLinha, mudou],
  )

  /** O botão e o crachá do professor abrem a mesma coisa: o que está na tela. */
  const abrirComProfessor = useCallback(
    async (uidHash: string) => {
      if (!turmaSelecionada) return
      await abrirChamada(turmaSelecionada, uidHash, momentoDaChamada())
      voltarParaHoje()
    },
    [turmaSelecionada, momentoDaChamada, abrirChamada, voltarParaHoje],
  )

  /**
   * Um vínculo de professor, criado sem crachá se ainda não houver: o botão
   * não pode depender de alguém ter encostado um crachá antes. Nasce genérico
   * ("Professor", sem matrícula) e marcado `sintetico`; nunca com o nome de
   * uma pessoa real, que ele passaria a representar sem ter encostado nada.
   */
  const garantirProfessor = useCallback(async (): Promise<Vinculo> => {
    const existente = (await repositorio.listarVinculos()).find((v) => v.papel === 'professor')
    if (existente) return existente
    const vinculo: Vinculo = {
      uidHash: uidHashSintetico(),
      papel: 'professor',
      nome: 'Professor',
      criadoEm: new Date().toISOString(),
      sintetico: true,
    }
    await repositorio.gravarVinculo(vinculo)
    await mudou()
    return vinculo
  }, [repositorio, mudou])

  /**
   * Abrir sem crachá. Com mais de um professor, abre pelo que tem aula agora
   * nesta turma, se houver; senão, pelo de sempre.
   */
  const iniciarChamada = useCallback(async () => {
    if (!turmaSelecionada) return
    const [professor, aulas] = await Promise.all([garantirProfessor(), repositorio.listarAulas()])
    const daTurmaAgora = aulas.find(
      (a) => a.turma === turmaSelecionada && aulasAgora([a], a.uidHashProfessor, momentoDaChamada()).length > 0,
    )
    await abrirComProfessor(daTurmaAgora?.uidHashProfessor ?? professor.uidHash)
  }, [turmaSelecionada, momentoDaChamada, garantirProfessor, repositorio, abrirComProfessor])

  /**
   * A sessão é uma só no app. Encerrar a turma errada deixaria a certa
   * esperando em silêncio; se a grade diz que outra devia estar rodando, avisa.
   */
  const avisarSeOutraTurmaEsperava = useCallback(
    async (encerrada: Sessao) => {
      const aulas = await repositorio.listarAulas()
      const outra = aulasAgora(aulas, encerrada.uidHashProfessor, new Date()).find((a) => a.turma !== encerrada.turma)
      if (outra) {
        aoAviso(`A grade diz que ${outra.turma} deveria estar rodando agora. Encoste o crachá de novo para abri-la.`)
      }
    },
    [repositorio, aoAviso],
  )

  // Sem chamada aberta, o leitor é ouvido aqui.
  useEffect(() => {
    if (sessao) return
    return leitor.aoLer((leitura) => {
      if (antessala.current.reter(leitura)) return
      semDono('crachá no repouso', async () => {
        const { uidHash, vinculo } = await identificarCracha(repositorio, leitura.uid)
        registrar('cracha_no_repouso', { hash: curto(uidHash), vinculo: vinculo?.papel ?? 'nenhum' })
        if (vinculo?.papel === 'professor') return await abrirComProfessor(uidHash)
        tocar('desconhecido')
        aoLido(
          vinculo
            ? `${vinculo.nome} foi lido. O leitor está funcionando. Nenhuma aula aberta agora.`
            : 'Crachá lido, mas ainda sem dono. O leitor está funcionando.',
        )
      })
    })
  }, [leitor, repositorio, sessao, abrirComProfessor, aoLido])

  /** Para a tela da chamada: as leituras que esperavam, uma vez. */
  const entregarRetidas = useCallback(() => antessala.current.entregar(), [])

  return { abrirChamada, iniciarChamada, garantirProfessor, avisarSeOutraTurmaEsperava, entregarRetidas }
}
