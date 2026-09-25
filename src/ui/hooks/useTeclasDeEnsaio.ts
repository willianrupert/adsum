// Ensaio sem hardware: espaço encosta o próximo crachá do baralho, N um crachá
// que o app nunca viu (para exercitar a busca), P o do professor.
//
// Só com modo de ensaio e leitor simulado. No app publicado, espaço é a tecla
// que mais se aperta sem querer, e marcaria alguém presente.

import { useEffect } from 'react'
import { semDono } from '../../ambiente/diario.ts'
import { calcularUidHash } from '../../nucleo/hash.ts'
import { hexParaUid, uidInedito } from '../../nucleo/uid.ts'
import { ehSimulavel, type LeitorDeCracha } from '../../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'

export function useTeclasDeEnsaio(opcoes: {
  ligado: boolean
  leitor: LeitorDeCracha
  repositorio: Repositorio
  salHex: string
  /** Para quando a tecla não tem o que fazer, e precisa dizer por quê. */
  aoDica: (dica: string) => void
}): void {
  const { ligado, leitor, repositorio, salHex, aoDica } = opcoes

  useEffect(() => {
    if (!ligado || !ehSimulavel(leitor)) return
    const simulado = leitor

    // Leitor parado: o diagnóstico já diz, a tecla não precisa repetir.
    const tentar = (gesto: () => void) => {
      try {
        gesto()
      } catch {
        /* leitor parado */
      }
    }

    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null
      const digitando = alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.isContentEditable
      if (digitando || evento.metaKey || evento.ctrlKey || evento.altKey) return

      if (evento.code === 'Space') {
        evento.preventDefault()
        return tentar(() => simulado.encostarProximo())
      }
      const tecla = evento.key.toLowerCase()
      if (tecla === 'n') {
        evento.preventDefault()
        return tentar(() => simulado.simular(uidInedito(simulado.baralho())))
      }
      if (tecla === 'p') {
        evento.preventDefault()
        semDono('tecla do professor', async () => {
          const professor = (await repositorio.listarVinculos()).find((v) => v.papel === 'professor')
          if (!professor) {
            return aoDica('Ainda não há crachá de professor. Na cerimônia, chame o nome dele e aperte espaço.')
          }
          // O vínculo guarda o hash: acha-se no baralho a carta que o gera.
          for (const hex of simulado.baralho()) {
            if ((await calcularUidHash(salHex, hexParaUid(hex))) === professor.uidHash) return simulado.simular(hex)
          }
        })
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ligado, leitor, repositorio, salHex, aoDica])
}
