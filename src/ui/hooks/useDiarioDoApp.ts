// O que o diário registra do app como um todo, fora de qualquer tela: com que
// versão e leitor ele abriu, erros que ninguém pegou, e a janela perdendo o
// foco (o dongle digita onde o foco estiver). Ver `ambiente/diario.ts`.

import { useEffect } from 'react'
import { ligarDiario, registrar } from '../../ambiente/diario.ts'

export function useDiarioDoApp(opcoes: {
  pasta?: FileSystemDirectoryHandle
  leitor: string
  instalacao: string
}): void {
  const { pasta } = opcoes

  // Com pasta, o diário grava nela; sem, fica na memória, visível no Diagnóstico.
  useEffect(() => ligarDiario(pasta), [pasta])

  // Uma vez por abertura, com os valores do momento em que o app abriu.
  const [leitor, instalacao] = [opcoes.leitor, opcoes.instalacao]
  useEffect(() => {
    registrar('app_aberto', { versao: __CARIMBO__, leitor, instalacao })
  }, [])

  useEffect(() => {
    const aoErrar = (e: ErrorEvent) => registrar('erro', { mensagem: e.message, onde: e.filename?.split('/').pop() })
    const aoRejeitar = (e: PromiseRejectionEvent) =>
      registrar('erro', { mensagem: (e.reason as Error)?.message ?? String(e.reason) })
    const aoPerderFoco = () => registrar('foco', { janela: 'perdeu' })
    const aoGanharFoco = () => registrar('foco', { janela: 'voltou' })
    window.addEventListener('error', aoErrar)
    window.addEventListener('unhandledrejection', aoRejeitar)
    window.addEventListener('blur', aoPerderFoco)
    window.addEventListener('focus', aoGanharFoco)
    return () => {
      window.removeEventListener('error', aoErrar)
      window.removeEventListener('unhandledrejection', aoRejeitar)
      window.removeEventListener('blur', aoPerderFoco)
      window.removeEventListener('focus', aoGanharFoco)
    }
  }, [])
}
