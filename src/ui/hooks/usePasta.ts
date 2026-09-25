// A pasta do professor, vista pela tela: onde está, se deu permissão, se a
// última gravação falhou, e os gestos de gravar nela.
//
// Gravação que falha nunca é silenciosa: vira `falhaNaPasta`, que a tela
// mostra, e o dado continua na base até `consertar`. Ver `docs/01_cofre.md`.

import { useCallback, useEffect, useState } from 'react'
import { registrar, semDono } from '../../ambiente/diario.ts'
import { anotarUid } from '../../ambiente/auditoriaDeUids.ts'
import { escolherPasta, pastaDisponivel, permissao } from '../../ambiente/pasta.ts'
import {
  auditoriaDeUidsLigada,
  dispensarPasta,
  esquecerDispensaDaPasta,
  pastaDispensada,
} from '../../ambiente/preferencias.ts'
import { acrescentarNoLog, conferirLog, gravarFaltas, repararLog, sincronizar } from '../../ambiente/sincronia.ts'
import type { EstadoDaPasta } from '../../nucleo/rota.ts'
import type { Evento } from '../../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../../portas/LeitorDeCracha.ts'
import { identificarCracha, type Repositorio } from '../../portas/Repositorio.ts'

export function usePasta({
  repositorio,
  leitor,
  salHex,
}: {
  repositorio: Repositorio
  leitor: LeitorDeCracha
  /** Muda quando o sal muda; a auditoria de UIDs volta a ouvir com ele. */
  salHex: string
}) {
  const [pasta, setPasta] = useState<FileSystemDirectoryHandle>()
  const [estado, setEstado] = useState<EstadoDaPasta>(pastaDisponivel() ? 'sem_pasta' : 'indisponivel')
  const [falha, setFalha] = useState<string>()
  /** O professor escolheu seguir sem pasta. */
  const [dispensada, setDispensada] = useState(pastaDispensada)

  // Ao abrir, a pasta guardada é reencontrada sozinha. A permissão, se foi
  // perdida, espera um clique: o navegador só a concede com gesto.
  useEffect(() => {
    if (!pastaDisponivel()) return
    semDono('reencontrar pasta', async () => {
      const guardada = await repositorio.lerPasta()
      if (!guardada) return setEstado('sem_pasta')
      if ((await permissao(guardada)) !== 'granted') return setEstado('sem_permissao')
      setPasta(guardada)
      setEstado('ligada')
    })
  }, [repositorio])

  // O código real de cada crachá, na primeira leitura, em qualquer tela.
  // Exceção temporária da fase de testes: ver `ambiente/auditoriaDeUids.ts`.
  useEffect(() => {
    if (!pasta) return
    return leitor.aoLer((leitura) => {
      if (!auditoriaDeUidsLigada()) return
      const hash = () => identificarCracha(repositorio, leitura.uid).then((r) => r.uidHash)
      anotarUid(pasta, hash, leitura.uid, leitura.em, leitura.origem).then(
        (novo) => novo && registrar('uid_anotado'),
        (erro: Error) => registrar('erro_auditoria', { mensagem: erro.message }),
      )
    })
  }, [leitor, pasta, repositorio, salHex])

  /** Planilha contra base, nos dois sentidos, com o resultado no diário. */
  const conferir = useCallback(
    async (turma?: string) => {
      if (!pasta) return
      try {
        for (const c of await conferirLog(repositorio, pasta, turma)) {
          const divergiu = c.acrescentados > 0 || c.trazidos > 0 || c.repetidos > 0
          registrar(divergiu ? 'conferencia_divergiu' : 'conferencia_ok', {
            turma: c.turma,
            base: c.naBase,
            arquivo: c.noArquivo,
            trazidos_para_base: c.trazidos,
            renumerados: c.renumerados,
            acrescentados_ao_arquivo: c.acrescentados,
            repetidos: c.repetidos,
          })
        }
      } catch (erro) {
        registrar('erro_conferencia', { mensagem: (erro as Error).message })
      }
    },
    [pasta, repositorio],
  )

  /**
   * Reescreve o cofre e a planilha de faltas. Com `turma`, só a dela: um
   * crachá numa aula não muda outra turma.
   */
  const gravarCofre = useCallback(
    async (turma?: string) => {
      if (!pasta) return
      const inicio = performance.now()
      try {
        await sincronizar(repositorio, pasta, turma)
        const sincronizadoEm = performance.now()
        await gravarFaltas(repositorio, pasta, turma)
        setFalha(undefined)
        registrar('pasta', {
          cadastro_ms: Math.round(sincronizadoEm - inicio),
          faltas_ms: Math.round(performance.now() - sincronizadoEm),
        })
      } catch (erro) {
        setFalha((erro as Error).message)
        registrar('erro_pasta', { mensagem: (erro as Error).message })
      }
    },
    [pasta, repositorio],
  )

  /** Acrescenta um evento ao log da turma. É o que o bipe espera. */
  const gravarLinha = useCallback(
    async (evento: Evento) => {
      if (!pasta) return
      try {
        await acrescentarNoLog(pasta, evento)
        setFalha(undefined)
      } catch (erro) {
        setFalha((erro as Error).message)
        registrar('erro_log', { evento: evento.eventoId, mensagem: (erro as Error).message })
      }
    },
    [pasta],
  )

  /**
   * Depois de uma falha: regrava tudo a partir da base. `repararLog` reescreve
   * o log, o que só é legítimo aqui, onde a base tem tudo o que a pasta tem.
   */
  const consertar = useCallback(async () => {
    if (!pasta) return
    try {
      if ((await permissao(pasta, true)) !== 'granted') return setEstado('sem_permissao')
      await sincronizar(repositorio, pasta)
      await repararLog(repositorio, pasta)
      await gravarFaltas(repositorio, pasta)
      setFalha(undefined)
    } catch (erro) {
      setFalha((erro as Error).message)
    }
  }, [pasta, repositorio])

  /** Escolhe uma pasta nova, ou devolve a permissão à guardada. */
  const ligar = useCallback(
    async (escolhendo: boolean) => {
      const handle = escolhendo ? await escolherPasta() : await repositorio.lerPasta()
      if (!handle) return
      if ((await permissao(handle, true)) !== 'granted') return setEstado('sem_permissao')
      await repositorio.guardarPasta(handle)
      // Mudou de ideia: a dispensa sai, senão o app acharia que ele não quer
      // pasta enquanto grava numa.
      esquecerDispensaDaPasta()
      setDispensada(false)
      setPasta(handle)
      setEstado('ligada')
    },
    [repositorio],
  )

  /** Solta a pasta sem apagar arquivo nem base. */
  const desconectar = useCallback(async () => {
    await repositorio.esquecerPasta()
    setPasta(undefined)
    setEstado(pastaDisponivel() ? 'sem_pasta' : 'indisponivel')
    setFalha(undefined)
    // Sem dispensar, a rota pediria a pasta de novo na hora.
    dispensarPasta()
    setDispensada(true)
  }, [repositorio])

  /** Seguir sem pasta, por decisão do professor. */
  const dispensar = useCallback(() => {
    dispensarPasta()
    setDispensada(true)
  }, [])

  return {
    pasta,
    estado,
    falha,
    dispensada,
    conferir,
    gravarCofre,
    gravarLinha,
    consertar,
    ligar,
    desconectar,
    dispensar,
  }
}
