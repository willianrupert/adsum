// Adaptador: a base local, em IndexedDB.
//
// "Dados 100% locais" não é slogan — é o que dispensa backend, conta, termo de
// uso e conversa com a Gerinfra. O preço é que o navegador pode apagar tudo sob
// pressão de espaço, e por isso `abrir()` pede armazenamento persistente e o
// diagnóstico mostra se foi concedido. Sem essa checagem, "local" e "perdido"
// são indistinguíveis até o dia em que somem.

import { sortearSal } from '../../nucleo/hash.ts'
import type { Aula, Config, Evento, Matriculado, UidHash, Vinculo } from '../../nucleo/tipos.ts'
import type { Sessao } from '../../nucleo/sessao.ts'
import type { DiagnosticoRepositorio, Repositorio } from '../../portas/Repositorio.ts'
import { criarBanco, ID_DA_CONFIG, NOME_DO_BANCO, type BancoAdsum } from './banco.ts'

function sortearAparelhoId(): string {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return `web-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export class RepositorioDexie implements Repositorio {
  readonly nome: string

  #banco: BancoAdsum
  #persistente = false

  constructor(nomeDoBanco: string = NOME_DO_BANCO) {
    this.nome = `IndexedDB · ${nomeDoBanco}`
    this.#banco = criarBanco(nomeDoBanco)
  }

  async abrir(): Promise<void> {
    await this.#banco.open()
    await this.#garantirConfig()
    this.#persistente = await this.#pedirPersistencia()
  }

  async fechar(): Promise<void> {
    this.#banco.close()
  }

  async lerConfig(): Promise<Config> {
    return await this.#garantirConfig()
  }

  async definirSal(salHex: string): Promise<void> {
    await this.#banco.config.update(ID_DA_CONFIG, { salHex: salHex.trim().toLowerCase() })
  }

  async definirAparelhoId(id: string): Promise<void> {
    await this.#banco.config.update(ID_DA_CONFIG, { aparelhoId: id })
  }

  async vinculoPorHash(uidHash: UidHash): Promise<Vinculo | undefined> {
    return await this.#banco.vinculos.get(uidHash)
  }

  async listarVinculos(): Promise<Vinculo[]> {
    return await this.#banco.vinculos.orderBy('nome').toArray()
  }

  async gravarVinculo(vinculo: Vinculo): Promise<void> {
    await this.#banco.vinculos.put(vinculo)
  }

  async removerVinculo(uidHash: UidHash): Promise<void> {
    await this.#banco.vinculos.delete(uidHash)
  }

  async zerarVinculos(): Promise<void> {
    await this.#banco.vinculos.clear()
  }

  async salvarTurma(turma: string, pessoas: Matriculado[]): Promise<void> {
    await this.#banco.transaction('rw', this.#banco.matriculados, async () => {
      await this.#banco.matriculados.where('turma').equals(turma).delete()
      await this.#banco.matriculados.bulkPut(pessoas)
    })
  }

  async listarMatriculados(turma?: string): Promise<Matriculado[]> {
    const tabela = this.#banco.matriculados
    const lista = turma
      ? await tabela.where('turma').equals(turma).toArray()
      : await tabela.toArray()
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async listarTurmas(): Promise<string[]> {
    const turmas = await this.#banco.matriculados.orderBy('turma').uniqueKeys()
    return turmas.map(String)
  }

  async zerarTurma(turma: string): Promise<void> {
    await this.#banco.matriculados.where('turma').equals(turma).delete()
  }

  async listarAulas(): Promise<Aula[]> {
    return await this.#banco.aulas.orderBy('dia').toArray()
  }

  async gravarAula(aula: Aula): Promise<void> {
    await this.#banco.aulas.put(aula)
  }

  async zerarAulas(): Promise<void> {
    await this.#banco.aulas.clear()
  }

  async sessaoAberta(): Promise<Sessao | undefined> {
    return await this.#banco.sessao.get(1)
  }

  async abrirSessao(sessao: Sessao): Promise<void> {
    await this.#banco.sessao.put({ ...sessao, id: 1 })
  }

  async encerrarSessao(): Promise<void> {
    await this.#banco.sessao.delete(1)
  }

  async acrescentarEvento(evento: Evento): Promise<void> {
    try {
      await this.#banco.eventos.add(evento)
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'ConstraintError') {
        // Não é falha: é a idempotência funcionando. Reenviar o mesmo lote não
        // pode duplicar linha, aqui nem na planilha.
        return
      }
      throw erro
    }
  }

  async listarEventos(limite?: number): Promise<Evento[]> {
    // Sem limite significa sem `limit()`. Passar um número enorme não é o mesmo
    // que não limitar: o cursor do IndexedDB só avança até 2³²−1, e acima disso
    // a consulta rejeita — a tela fica vazia sem nenhum erro à vista.
    const ordenados = this.#banco.eventos.orderBy('quando').reverse()
    return await (limite === undefined ? ordenados : ordenados.limit(limite)).toArray()
  }

  async contarEventos(): Promise<number> {
    return await this.#banco.eventos.count()
  }

  async lerPasta(): Promise<FileSystemDirectoryHandle | undefined> {
    return (await this.#banco.pasta.get(1))?.handle
  }

  async guardarPasta(handle: FileSystemDirectoryHandle): Promise<void> {
    await this.#banco.pasta.put({ id: 1, handle })
  }

  async esquecerPasta(): Promise<void> {
    await this.#banco.pasta.delete(1)
  }

  async esvaziarCache(): Promise<void> {
    await Promise.all([
      this.#banco.vinculos.clear(),
      this.#banco.matriculados.clear(),
      this.#banco.aulas.clear(),
      this.#banco.eventos.clear(),
      this.#banco.sessao.clear(),
    ])
  }

  async diagnostico(): Promise<DiagnosticoRepositorio> {
    const [vinculos, professores, aulas, eventos, matriculados, turmas] = await Promise.all([
      this.#banco.vinculos.count(),
      this.#banco.vinculos.where('papel').equals('professor').count(),
      this.#banco.aulas.count(),
      this.#banco.eventos.count(),
      this.#banco.matriculados.count(),
      this.listarTurmas(),
    ])
    const estimativa = await this.#estimar()
    return {
      nome: this.nome,
      aberto: this.#banco.isOpen(),
      versao: this.#banco.verno,
      vinculos,
      professores,
      aulas,
      eventos,
      matriculados,
      turmas: turmas.length,
      usoEstimado: estimativa?.usage,
      cotaEstimada: estimativa?.quota,
      persistente: this.#persistente,
    }
  }

  /** Apaga a base inteira. Só a tela de diagnóstico chama, e com confirmação. */
  async apagarTudo(): Promise<void> {
    await this.#banco.delete()
    this.#banco = criarBanco(this.nome.split(' · ')[1] ?? NOME_DO_BANCO)
    await this.abrir()
  }

  async #garantirConfig(): Promise<Config> {
    const existente = await this.#banco.config.get(ID_DA_CONFIG)
    if (existente) return existente
    const nova = {
      id: ID_DA_CONFIG,
      salHex: sortearSal(),
      aparelhoId: sortearAparelhoId(),
      criadoEm: new Date().toISOString(),
    }
    await this.#banco.config.put(nova)
    return nova
  }

  async #pedirPersistencia(): Promise<boolean> {
    if (!navigator.storage?.persist) return false
    try {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    } catch {
      return false
    }
  }

  async #estimar(): Promise<StorageEstimate | undefined> {
    if (!navigator.storage?.estimate) return undefined
    try {
      return await navigator.storage.estimate()
    } catch {
      return undefined
    }
  }
}
