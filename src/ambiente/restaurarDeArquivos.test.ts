// A pasta inteira escolhida no Safari ou no Firefox (`webkitdirectory`): cada
// arquivo chega solto, com o nome sem a pasta. `registros/X.csv` e
// `faltas/X.csv` têm o mesmo nome, e a planilha de faltas não é log.

import { describe, expect, it } from 'vitest'
import { RepositorioDexie } from '../adaptadores/repositorio/RepositorioDexie.ts'
import { AULA_2209, pastaDoCofre } from '../testes/cofreDeTeste.ts'
import { escrever } from './pasta.ts'
import { gravarFaltas, restaurar, restaurarDeArquivos } from './sincronia.ts'

interface No {
  arquivos: Map<string, string>
  pastas: Map<string, No>
}

/** Os arquivos como o seletor os entrega: nome solto e caminho relativo à pasta escolhida. */
function comoOSeletorEntrega(no: No, caminho = 'Adsum'): File[] {
  const aqui = [...no.arquivos].map(
    ([name, texto]) => ({ name, webkitRelativePath: `${caminho}/${name}`, text: async () => texto }) as File,
  )
  return [...aqui, ...[...no.pastas].flatMap(([nome, filho]) => comoOSeletorEntrega(filho, `${caminho}/${nome}`))]
}

let n = 0
async function pastaCompleta() {
  const pasta = await pastaDoCofre(AULA_2209)
  const origem = new RepositorioDexie(`adsum-origem-${n++}`)
  await origem.abrir()
  await restaurar(origem, pasta.handle)
  await gravarFaltas(origem, pasta.handle)
  await escrever(pasta.handle, 'auditoria/uids.csv', '\uFEFFuid_hex;uid_hash;primeira_leitura;leitor\n0102;abcd;2026-09-22T10:00:00Z;Dongle\n')
  await escrever(pasta.handle, 'diagnostico/2026-09-22.log', '10:00:00.000 | cracha | n=1\n')
  return { pasta, eventos: await origem.contarEventos() }
}

async function restaurarNoSafari(arquivos: File[]) {
  const safari = new RepositorioDexie(`adsum-safari-${n++}`)
  await safari.abrir()
  const resumo = await restaurarDeArquivos(safari, arquivos)
  return { safari, resumo }
}

describe('a pasta inteira, escolhida onde não há seletor de diretório', () => {
  it('a chamada volta inteira, qualquer que seja a ordem dos arquivos', async () => {
    const { pasta, eventos } = await pastaCompleta()
    const arquivos = comoOSeletorEntrega(pasta.raiz as unknown as No)
    for (const ordem of [arquivos, [...arquivos].reverse()]) {
      const { safari } = await restaurarNoSafari(ordem)
      expect(await safari.contarEventos()).toBe(eventos)
    }
  })

  it('a planilha de faltas, o diário e a auditoria não viram "problema" nem "arquivo lido"', async () => {
    const { pasta } = await pastaCompleta()
    const { resumo } = await restaurarNoSafari(comoOSeletorEntrega(pasta.raiz as unknown as No))
    expect(resumo.problemas).toEqual([])
    expect(resumo.arquivos.some((a) => /faltas|uids|\.log/.test(a))).toBe(false)
  })

  it('arquivos soltos, sem caminho: o log é reconhecido pelo cabeçalho, e o de mesmo nome não o apaga', async () => {
    const { pasta, eventos } = await pastaCompleta()
    const soltos = comoOSeletorEntrega(pasta.raiz as unknown as No).map(
      (f) => ({ name: f.name, webkitRelativePath: '', text: f.text }) as File,
    )
    for (const ordem of [soltos, [...soltos].reverse()]) {
      const { safari, resumo } = await restaurarNoSafari(ordem)
      expect(await safari.contarEventos()).toBe(eventos)
      expect(resumo.problemas).toEqual([])
    }
  })
})
