// O manual não vem embutido: é baixado da `main` na hora (`MANUAL_URL`). É o
// único gesto do Adsum que usa a rede, e só quando o professor pede.

import { MANUAL_URL } from '../nucleo/cofre.ts'
import { salvarBinario } from './arquivos.ts'

/** Baixa e salva o manual. Devolve o que dizer na tela, ou nada se cancelado. */
export async function baixarManual(): Promise<string | undefined> {
  try {
    const resposta = await fetch(MANUAL_URL)
    if (!resposta.ok) {
      throw new Error(
        `sem internet ou o arquivo mudou de lugar (HTTP ${resposta.status}). Baixe direto em ${MANUAL_URL}`,
      )
    }
    const salvou = await salvarBinario('Adsum-manual-e-LGPD.docx', await resposta.blob())
    if (salvou === 'cancelado') return undefined
    return salvou === 'gravado'
      ? 'Manual gravado.'
      : 'Manual foi para a pasta de downloads. Este navegador não tem File System Access.'
  } catch (erro) {
    return (erro as Error).message
  }
}
