// Adaptador: o crachá lido direto pelo celular.
//
// **Ainda não verificado com o crachá do CIn, e a dúvida é legítima.** O Web NFC
// é especificado para tags NFC Forum tipo 1–5; o crachá é Mifare Classic 1K, que
// é proprietário da NXP e não é nenhum desses tipos. O Chromium *pode* disparar
// `reading` com o `serialNumber` preenchido e a mensagem vazia para tags que ele
// não sabe interpretar como NDEF — mas isso é comportamento de implementação, não
// promessa de especificação, e varia com a versão e com o chip NFC do aparelho.
//
// Por isso este adaptador conta `readingerror` separado das leituras: "encostou
// e não veio nada" é resultado de medição, não silêncio. É o número que responde
// se um professor com Android consegue registrar presença sem aparelho nenhum.
//
// Só o `serialNumber` é usado. A mensagem NDEF é ignorada de propósito — a regra
// de ler apenas o UID público vale aqui igual.

import { hexParaUid } from '../../nucleo/uid.ts'
import type {
  Cancelar,
  DiagnosticoLeitor,
  EstadoLeitor,
  LeitorDeCracha,
  Leitura,
} from '../../portas/LeitorDeCracha.ts'
import { criarEmissor } from './emissor.ts'

export class LeitorWebNfc implements LeitorDeCracha {
  readonly nome = 'Celular Android · WebNFC'

  #estado: EstadoLeitor = 'parado'
  #cancelador?: AbortController
  #lidos = 0
  #semUid = 0
  #ultimoErro?: string
  #leituras = criarEmissor<Leitura>()
  #estados = criarEmissor<EstadoLeitor>()

  async estaDisponivel(): Promise<boolean> {
    return typeof window !== 'undefined' && 'NDEFReader' in window
  }

  estado(): EstadoLeitor {
    return this.#estado
  }

  async iniciar(): Promise<void> {
    if (this.#estado === 'lendo') return
    if (!(await this.estaDisponivel())) {
      this.#ultimoErro = 'este navegador não tem Web NFC — só o Chrome no Android tem'
      this.#mudarPara('erro')
      throw new Error(this.#ultimoErro)
    }

    this.#mudarPara('iniciando')
    const cancelador = new AbortController()
    const leitor = new NDEFReader()

    leitor.onreading = (evento) => {
      try {
        // `serialNumber` vem como `04:a2:3b:91`; `hexParaUid` já tolera separador.
        const uid = hexParaUid(evento.serialNumber)
        this.#lidos++
        this.#leituras.emitir({ uid, em: new Date(), origem: this.nome })
      } catch (erro) {
        // UID de comprimento inesperado é dado de diagnóstico, não motivo para
        // derrubar a leitura seguinte.
        this.#semUid++
        this.#ultimoErro = `UID recusado: ${(erro as Error).message}`
      }
    }

    leitor.onreadingerror = () => {
      this.#semUid++
      this.#ultimoErro = 'tag detectada, sem UID legível — é o sintoma esperado se o Chrome recusar Mifare Classic'
    }

    try {
      await leitor.scan({ signal: cancelador.signal })
    } catch (erro) {
      this.#ultimoErro = this.#traduzir(erro as Error)
      this.#mudarPara('erro')
      throw new Error(this.#ultimoErro)
    }

    this.#cancelador = cancelador
    this.#mudarPara('lendo')
  }

  async parar(): Promise<void> {
    this.#cancelador?.abort()
    this.#cancelador = undefined
    this.#mudarPara('parado')
  }

  aoLer(escuta: (leitura: Leitura) => void): Cancelar {
    return this.#leituras.inscrever(escuta)
  }

  aoMudarEstado(escuta: (estado: EstadoLeitor) => void): Cancelar {
    return this.#estados.inscrever(escuta)
  }

  async diagnostico(): Promise<DiagnosticoLeitor> {
    const disponivel = await this.estaDisponivel()
    return {
      nome: this.nome,
      estado: this.#estado,
      disponivel,
      motivo: disponivel ? undefined : 'Web NFC só existe no Chrome para Android',
      detalhes: {
        permissão: await this.#permissao(),
        'leituras com UID': String(this.#lidos),
        'tags sem UID legível': String(this.#semUid),
        'último erro': this.#ultimoErro ?? '—',
      },
    }
  }

  #traduzir(erro: Error): string {
    switch (erro.name) {
      case 'NotAllowedError':
        return 'permissão de NFC negada — o navegador precisa do sim do usuário, num toque'
      case 'NotSupportedError':
        return 'sem hardware de NFC, ou desligado nas configurações do aparelho'
      case 'NotReadableError':
        return 'o NFC está ocupado por outro aplicativo'
      default:
        return `${erro.name}: ${erro.message}`
    }
  }

  async #permissao(): Promise<string> {
    if (!navigator.permissions) return 'não consultável'
    try {
      const estado = await navigator.permissions.query({ name: 'nfc' as PermissionName })
      return estado.state
    } catch {
      return 'não consultável'
    }
  }

  #mudarPara(estado: EstadoLeitor): void {
    if (this.#estado === estado) return
    this.#estado = estado
    this.#estados.emitir(estado)
  }
}
