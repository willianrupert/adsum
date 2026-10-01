// O cofre de um professor (o zip da pasta dele) como pasta do Adsum no
// navegador do teste. Fica fora do repositório: é dado real de turma.
//
// A pasta vira uma pasta do sistema de arquivos privado do navegador (OPFS).
// É a mesma interface de pasta que o app usa (`FileSystemDirectoryHandle`), e
// só o seletor é trocado: o resto é o app de verdade, nas duas versões. O que
// isto não prova é a permissão da pasta de disco, que a OPFS sempre dá.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { Page } from '@playwright/test'

/** Caminho relativo à raiz do cofre → conteúdo em base64. */
export type ArquivosDoCofre = Record<string, string>

export function lerCofre(zip: string): ArquivosDoCofre {
  const destino = mkdtempSync(join(tmpdir(), 'adsum-cofre-'))
  try {
    execFileSync('unzip', ['-q', zip, '-d', destino])
    // O zip do Finder traz a pasta dentro (`Chamadas/`) e o lixo do macOS ao lado.
    const raiz = readdirSync(destino).filter((n) => n !== '__MACOSX').map((n) => join(destino, n)).find((p) => statSync(p).isDirectory())
    if (!raiz) throw new Error(`${zip}: sem pasta dentro`)
    const arquivos: ArquivosDoCofre = {}
    const andar = (pasta: string) => {
      for (const nome of readdirSync(pasta)) {
        if (nome === '.DS_Store' || nome.startsWith('._')) continue
        const caminho = join(pasta, nome)
        if (statSync(caminho).isDirectory()) andar(caminho)
        else arquivos[relative(raiz, caminho)] = readFileSync(caminho).toString('base64')
      }
    }
    andar(raiz)
    return arquivos
  } finally {
    rmSync(destino, { recursive: true, force: true })
  }
}

/**
 * O que um professor de verdade deixa na pasta além do Adsum: a cópia da
 * planilha que ele abriu, o arquivo do Numbers ou do Excel, anotações, e o
 * lixo que o macOS espalha. Nada disso pode quebrar o Adsum, e nada disso
 * pode ser apagado ou mudado por ele.
 */
export function comArquivosDeFora(arquivos: ArquivosDoCofre): ArquivosDoCofre {
  const texto = (t: string) => Buffer.from(t, 'utf-8').toString('base64')
  const binario = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0xff, 0xfe]).toString('base64')
  const umLog = Object.keys(arquivos).find((c) => c.startsWith('registros/'))
  const umaTurma = Object.keys(arquivos).find((c) => c.startsWith('turmas/'))
  return {
    ...arquivos,
    ...(umLog ? { [umLog.replace(/\.csv$/, ' copy.csv')]: arquivos[umLog] } : {}),
    ...(umaTurma ? { [umaTurma.replace(/\.json$/, ' (1).json')]: arquivos[umaTurma] } : {}),
    'registros/anotacoes.txt': texto('lembrar de conferir a terça\n'),
    'registros/.DS_Store': binario,
    'turmas/lista antiga.xlsx': binario,
    'sigaa/o que lancei.txt': texto('lancei até 15/10\n'),
    'sigaa/._planilha.csv': binario,
    'frequencia final.xlsx': binario,
    'Icon\r': '',
    '.DS_Store': binario,
    'faltas/planilha.numbers': binario,
  }
}

/** O nome da pasta na OPFS, e o seletor de pasta do app passa a devolvê-la. */
export const PASTA = 'cofre-do-professor'

export const trocarSeletor = (page: Page) =>
  page.addInitScript((pasta) => {
    ;(window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(pasta, { create: true })
  }, PASTA)

/** Escreve o cofre na OPFS da origem da página. */
export async function semear(page: Page, arquivos: ArquivosDoCofre) {
  await page.evaluate(
    async ({ pasta, arquivos }) => {
      const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle(pasta, { create: true })
      for (const [caminho, base64] of Object.entries(arquivos)) {
        const partes = caminho.split('/')
        let dir = raiz
        for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
        const escrita = await (await dir.getFileHandle(partes.at(-1)!, { create: true })).createWritable()
        await escrita.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))
        await escrita.close()
      }
    },
    { pasta: PASTA, arquivos },
  )
}

/** O que está na pasta agora, como texto. */
export async function lerPasta(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async (pasta) => {
    const saida: Record<string, string> = {}
    const andar = async (dir: FileSystemDirectoryHandle, prefixo: string) => {
      for await (const [nome, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (h.kind === 'directory') await andar(h as FileSystemDirectoryHandle, `${prefixo}${nome}/`)
        else saida[`${prefixo}${nome}`] = await (await (h as FileSystemFileHandle).getFile()).text()
      }
    }
    await andar(await (await navigator.storage.getDirectory()).getDirectoryHandle(pasta), '')
    return saida
  }, PASTA)
}

/** Quantos registros cada tabela da base tem, sem abrir nenhum: só contar. */
export async function contarBase(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((pronto, falhou) => {
        const pedido = indexedDB.open('adsum')
        pedido.onerror = () => falhou(pedido.error)
        pedido.onsuccess = () => {
          const banco = pedido.result
          const tabelas = [...banco.objectStoreNames]
          const tx = banco.transaction(tabelas, 'readonly')
          const contas: Record<string, number> = {}
          for (const t of tabelas) {
            const c = tx.objectStore(t).count()
            c.onsuccess = () => (contas[t] = c.result)
          }
          tx.oncomplete = () => {
            banco.close()
            pronto(contas)
          }
        }
      }),
  )
}

/**
 * Cada evento da base: id, hash do crachá, resultado e quem foi. Quem foi sai
 * como um número tirado do nome, não o nome: falha de teste imprime o que
 * compara, e isto é dado real de turma.
 */
export async function eventosDaBase(page: Page): Promise<{ id: string; uidHash: string; resultado: string; quem: number }[]> {
  return page.evaluate(
    () =>
      new Promise((pronto, falhou) => {
        const pedido = indexedDB.open('adsum')
        pedido.onerror = () => falhou(pedido.error)
        pedido.onsuccess = () => {
          const banco = pedido.result
          const todos = banco.transaction('eventos', 'readonly').objectStore('eventos').getAll()
          todos.onsuccess = () => {
            banco.close()
            pronto(
              (todos.result as { eventoId: string; uidHash: string; resultado: string; nome: string }[]).map((e) => {
                let h = 2166136261
                for (const c of e.nome ?? '') h = Math.imul(h ^ c.charCodeAt(0), 16777619)
                return { id: e.eventoId, uidHash: e.uidHash, resultado: e.resultado, quem: e.nome ? h >>> 0 : 0 }
              }),
            )
          }
        }
      }),
  )
}
