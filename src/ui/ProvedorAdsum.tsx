import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Config } from '../nucleo/tipos.ts'
import type { LeitorDeCracha } from '../portas/LeitorDeCracha.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { abrirBase, ContextoAdsum, LEITORES, leitorPadrao } from './adsum.ts'
import { definirLeitorEscolhido, leitorEscolhido } from '../ambiente/preferencias.ts'

export function ProvedorAdsum({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<{ repositorio: Repositorio; config: Config }>()
  const [erro, setErro] = useState<Error>()
  // A escolha sobrevive ao recarregamento: sem isto, escolher o dongle durava
  // até a próxima abertura e o professor reescolhia todo dia. Se o leitor
  // guardado não existir mais — modo de ensaio desligado com o simulado
  // escolhido —, cai no padrão em vez de ficar sem leitor nenhum.
  const [leitorId, setLeitorId] = useState(() => {
    const guardado = leitorEscolhido()
    return guardado && LEITORES.some((o) => o.id === guardado) ? guardado : leitorPadrao()
  })
  const [leitor, setLeitor] = useState<LeitorDeCracha>()

  useEffect(() => {
    let vivo = true
    abrirBase().then(
      (pronto) => vivo && setBase(pronto),
      (falha: Error) => vivo && setErro(falha),
    )
    return () => {
      vivo = false
    }
  }, [])

  // O leitor padrão sobe sozinho; os outros só quando escolhidos, porque pedir
  // NFC sem o professor ter pedido nada é o tipo de surpresa que queima confiança.
  useEffect(() => {
    if (leitor) return
    const inicial = LEITORES.find((o) => o.id === leitorId)!.criar()
    void inicial.iniciar().finally(() => setLeitor(inicial))
  }, [leitor, leitorId])

  const trocarLeitor = useCallback(
    async (id: string) => {
      const opcao = LEITORES.find((o) => o.id === id)
      if (!opcao) throw new Error(`leitor desconhecido: ${id}`)
      await leitor?.parar()
      const novo = opcao.criar()
      setLeitor(novo)
      setLeitorId(id)
      definirLeitorEscolhido(id)
      // Falha ao iniciar não desfaz a troca: o estado do leitor e o motivo ficam
      // visíveis no diagnóstico, que é onde se descobre por que não leu.
      await novo.iniciar()
    },
    [leitor],
  )

  const recarregarConfig = useCallback(async () => {
    if (!base) return
    setBase({ ...base, config: await base.repositorio.lerConfig() })
  }, [base])

  const valor = useMemo(
    () =>
      base && leitor
        ? { ...base, leitor, leitorId, trocarLeitor, recarregarConfig }
        : undefined,
    [base, leitor, leitorId, trocarLeitor, recarregarConfig],
  )

  if (erro) {
    return (
      <div className="aviso aviso--grave">
        <strong>A base local não abriu.</strong>
        <p>{erro.message}</p>
        <p>
          Navegação privada e bloqueio de cookies desligam o IndexedDB em alguns
          navegadores. Sem ele o Adsum não tem onde guardar nada.
        </p>
      </div>
    )
  }

  if (!valor) return <div className="carregando">abrindo a base local…</div>

  return <ContextoAdsum.Provider value={valor}>{children}</ContextoAdsum.Provider>
}
