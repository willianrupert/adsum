// O log da turma na pasta (`registros/<turma>.csv`): só acrescenta, e é
// conferido contra a base nos dois sentidos. Reescrever é só conserto.

import { cabecalhoCsv, deCsv, linhaCsv, paraCsv, porTurma } from '../nucleo/csv.ts'
import type { Evento } from '../nucleo/tipos.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { acrescentar, escrever, ler, listarArquivos } from './pasta.ts'
import { caminhoDosRegistros, type Resumo } from './sincronia.ts'

/**
 * Uma linha nova no log da turma. **Nunca reescreve o arquivo:** com a pasta
 * sincronizada, reescrever apagaria o que outra máquina gravou.
 */
export async function acrescentarNoLog(
  pasta: FileSystemDirectoryHandle,
  evento: Evento,
): Promise<void> {
  await acrescentar(
    pasta,
    caminhoDosRegistros(evento.turma),
    linhaCsv(evento) + '\n',
    cabecalhoCsv(),
  )
}

/** Mesmo acontecimento, e não só o mesmo `evento_id`. */
function mesmoEvento(a: Evento, b: Evento): boolean {
  return (
    a.quando === b.quando &&
    a.uidHash === b.uidHash &&
    a.turma === b.turma &&
    a.origem === b.origem &&
    a.resultado === b.resultado
  )
}

/** `web-8c56-20260922-0098.2` → `web-8c56-20260922-0098`. Ver `importarEventos`. */
export const idDeOrigem = (eventoId: string) => eventoId.replace(/\.\d+$/, '')

/**
 * Traz linhas de um log para a base. **Nenhuma fica de fora em silêncio.**
 *
 * `evento_id` repetido com o mesmo conteúdo é releitura (idempotência).
 * Repetido com outro conteúdo é outro acontecimento (o defeito de 22/09/2026
 * deixou isso nos arquivos): entra com id derivado, `<id>.2`, só na base.
 */
export async function importarEventos(
  repositorio: Repositorio,
  itens: Evento[],
): Promise<{ novos: number; renumerados: number }> {
  const existentes = new Map((await repositorio.listarEventos()).map((e) => [e.eventoId, e]))
  // O contador não pode ficar atrás de um id desta instalação que veio no
  // arquivo: seria cunhar de novo um número já gasto.
  const { instalacaoId } = await repositorio.lerConfig()
  let maiorDaCasa = 0
  for (const e of itens) {
    if (!e.eventoId.startsWith(`${instalacaoId}-`)) continue
    const numero = Number.parseInt(e.eventoId.split('-').pop() ?? '', 10)
    if (Number.isFinite(numero) && numero > maiorDaCasa) maiorDaCasa = numero
  }
  if (maiorDaCasa > 0) await repositorio.garantirSequenciaAcimaDe(maiorDaCasa)
  let novos = 0
  let renumerados = 0
  for (const evento of itens) {
    const ja = existentes.get(evento.eventoId)
    if (!ja) {
      if (await repositorio.acrescentarEvento(evento)) {
        existentes.set(evento.eventoId, evento)
        novos++
      }
      continue
    }
    if (mesmoEvento(ja, evento)) continue

    // Já trazido antes com id derivado? Então é releitura, não linha nova.
    let derivado: string | undefined
    for (let n = 2; ; n++) {
      const candidato = `${evento.eventoId}.${n}`
      const outro = existentes.get(candidato)
      if (!outro) {
        derivado = candidato
        break
      }
      if (mesmoEvento(outro, evento)) break
    }
    if (!derivado) continue
    const copia = { ...evento, eventoId: derivado }
    if (await repositorio.acrescentarEvento(copia)) {
      existentes.set(derivado, copia)
      renumerados++
    }
  }
  return { novos, renumerados }
}

export interface Conferencia {
  turma: string
  naBase: number
  noArquivo: number
  /** Estavam só no arquivo e entraram na base agora. */
  trazidos: number
  /** Dos trazidos, os que tinham `evento_id` repetido e ganharam id derivado. */
  renumerados: number
  /** Estavam só na base e foram acrescentados ao fim do arquivo agora. */
  acrescentados: number
  /** `evento_id` que aparece mais de uma vez no arquivo. */
  repetidos: number
}

/**
 * Confere o log da pasta contra a base, turma a turma, nos dois sentidos, e
 * os deixa iguais sem reescrever nada: linha só no arquivo entra na base;
 * evento só na base vai para o fim do arquivo. Evento de id derivado não
 * volta ao arquivo, onde já está com o id original.
 */
export async function conferirLog(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
  turma?: string,
): Promise<Conferencia[]> {
  const turmas = new Set<string>()
  if (turma) turmas.add(turma)
  else {
    for (const e of await repositorio.listarEventos()) turmas.add(e.turma)
    for (const nome of await listarArquivos(pasta, ['registros'])) {
      const cru = await ler(pasta, `registros/${nome}`)
      const primeira = cru ? deCsv(cru).itens[0] : undefined
      if (primeira) turmas.add(primeira.turma)
    }
  }

  const resultado: Conferencia[] = []
  for (const t of turmas) {
    const texto = await ler(pasta, caminhoDosRegistros(t))
    const doArquivo = texto ? deCsv(texto).itens.filter((e) => e.turma === t) : []
    const { novos, renumerados } = await importarEventos(repositorio, doArquivo)

    const idsNoArquivo = new Set(doArquivo.map((e) => e.eventoId))
    const daBase = [...(await repositorio.listarEventos({ turma: t }))].reverse()
    const faltando = daBase.filter((e) => !idsNoArquivo.has(idDeOrigem(e.eventoId)))
    for (const evento of faltando) await acrescentarNoLog(pasta, evento)

    resultado.push({
      turma: t,
      naBase: daBase.length,
      noArquivo: doArquivo.length,
      trazidos: novos + renumerados,
      renumerados,
      acrescentados: faltando.length,
      repetidos: doArquivo.length - idsNoArquivo.size,
    })
  }
  return resultado
}

/**
 * Reescreve os logs a partir da base. **Só para conserto**, depois de uma
 * gravação que falhou: a base tem tudo o que a pasta tem. No caminho normal,
 * apagaria o que outra máquina escreveu.
 */
export async function repararLog(
  repositorio: Repositorio,
  pasta: FileSystemDirectoryHandle,
): Promise<Resumo> {
  const eventos = await repositorio.listarEventos()
  const arquivos: string[] = []
  for (const [turma, linhas] of porTurma([...eventos].reverse())) {
    const caminho = caminhoDosRegistros(turma)
    await escrever(pasta, caminho, paraCsv(linhas))
    arquivos.push(caminho)
  }
  return { arquivos, problemas: [] }
}
