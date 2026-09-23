// Fala com o rig de teste (ESP32-S3, `ferramentas/rig-de-cracha/`) pela porta
// ponte/JTAG, em Web Serial — o mesmo protocolo de linha que `rig.py` fala
// (ver `adsum_rig.ino`: uma linha por comando, resposta OK/ERR/PONG depois de
// cada um). Só existe no modo de ensaio: fala com hardware que finge ser o
// dongle, nunca aparece pra quem dá aula.
//
// A porta que esta classe abre é só o canal de COMANDO. Quem digita o UID de
// verdade é a **outra** porta do rig (a nativa, HID) — essa não passa por
// aqui: cai onde estiver o foco do sistema operacional, exatamente como o
// dongle real. É isso que prova o caminho inteiro, não um dublê.

const VELOCIDADE = 115200
const TEMPO_LIMITE_PADRAO_MS = 4000

export interface OpcoesDoRig {
  /** Para teste. Em produção é `navigator.serial`. */
  serial?: ServicoSerial
}

export class RigDeCracha {
  #serial?: ServicoSerial
  #porta?: PortaSerial
  #leitorDeBytes?: ReadableStreamDefaultReader<Uint8Array>
  #escritor?: WritableStreamDefaultWriter<Uint8Array>
  #pendente?: { comando: string; resolver: (linha: string) => void; rejeitar: (erro: Error) => void }
  #conectado = false

  constructor(opcoes: OpcoesDoRig = {}) {
    this.#serial = opcoes.serial ?? (typeof navigator !== 'undefined' ? navigator.serial : undefined)
  }

  get conectado(): boolean {
    return this.#conectado
  }

  async estaDisponivel(): Promise<boolean> {
    return this.#serial !== undefined
  }

  /** Só de dentro de um clique: é o Chrome que exige. Sem filtro de
      fabricante — não dá pra saber de antemão qual chip ponte cada devkit
      S3 usa, e é melhor mostrar todas as portas do que esconder a certa. */
  async conectar(): Promise<void> {
    if (!this.#serial) throw new Error('Este navegador não tem Web Serial. Use o Chrome ou o Edge.')
    const porta = await this.#serial.requestPort()
    await this.#abrir(porta)
  }

  /**
   * Reencontra uma porta já autorizada antes, sem diálogo nenhum — o mesmo
   * padrão do `LeitorSerial`. Existe para o fluxo da turma de teste: ele
   * recarrega a página (`turmaDeTeste.ts`), e sem isto o professor teria
   * que clicar em "Conectar" de novo toda vez, só porque a aba reabriu.
   * Silencioso quando não há porta nenhuma — quem chama decide se isso é
   * problema (normalmente não é: a primeira conexão sempre passa por
   * `conectar()`, com o clique).
   */
  async iniciar(): Promise<void> {
    if (!this.#serial) return
    const portas = await this.#serial.getPorts()
    if (portas.length === 0) return
    await this.#abrir(portas[0])
  }

  /**
   * Se qualquer passo daqui pra frente falhar — a porta não ser legível, o
   * PING não voltar a tempo —, a conexão inteira desfaz sozinha antes de
   * propagar o erro. Sem isto, um `iniciar()` automático (ao montar a
   * tela, depois do recarregamento de `turmaDeTeste.ts`) que falhasse no
   * meio deixava a porta aberta pro navegador mas "desconectada" pro app —
   * e o próximo clique em "Conectar" esbarrava num "the port is already
   * open" sem conserto nenhum ao alcance do professor, a não ser recarregar
   * a página nas mãos. Achado em 22/09/2026, na primeira bancada real.
   */
  async #abrir(porta: PortaSerial): Promise<void> {
    try {
      await porta.open({ baudRate: VELOCIDADE })
      // Guardada assim que `open()` funciona, antes de qualquer outra
      // checagem — é o que garante que `desconectar()`, no `catch` abaixo,
      // sempre encontra a porta pra fechar, mesmo quando a falha é a
      // checagem seguinte (`readable`/`writable` ausentes).
      this.#porta = porta
      if (!porta.readable || !porta.writable) {
        throw new Error('A porta abriu, mas não é legível.')
      }
      this.#leitorDeBytes = porta.readable.getReader()
      this.#escritor = porta.writable.getWriter()
      this.#conectado = true
      void this.#ler(this.#leitorDeBytes)
      // A placa manda "PRONTO adsum-rig-de-crachas" ao ligar, mas se a porta
      // já estava aberta antes (a placa não resetou agora), a saudação pode
      // não vir — um PING resolve os dois casos e confirma que é o rig de
      // verdade.
      await this.enviar('PING', 2000)
    } catch (erro) {
      await this.desconectar()
      throw erro
    }
  }

  async desconectar(): Promise<void> {
    this.#conectado = false
    const leitor = this.#leitorDeBytes
    const escritor = this.#escritor
    const porta = this.#porta
    this.#leitorDeBytes = this.#escritor = this.#porta = undefined
    try {
      await leitor?.cancel()
    } catch {
      /* já fechado */
    }
    leitor?.releaseLock()
    try {
      escritor?.releaseLock()
    } catch {
      /* já solto */
    }
    try {
      await porta?.close()
    } catch {
      /* já fechada */
    }
  }

  /**
   * Manda um comando e espera a resposta — `OK`/`PONG` resolve, `ERR ...`
   * ou tempo esgotado rejeita. Uma pergunta de cada vez: o firmware só lê a
   * próxima linha depois de terminar a rajada da atual (`digitarRajada` usa
   * `delay()`, é síncrono lá dentro), então mandar dois comandos em paralelo
   * não tem o que significar.
   */
  async enviar(comando: string, tempoLimiteMs = TEMPO_LIMITE_PADRAO_MS): Promise<string> {
    if (!this.#escritor) throw new Error('O rig não está conectado.')
    if (this.#pendente) throw new Error(`Já existe um comando em andamento ("${this.#pendente.comando}").`)
    return new Promise((resolver, rejeitar) => {
      const relogio = setTimeout(() => {
        this.#pendente = undefined
        rejeitar(new Error(`Sem resposta do rig para "${comando}" em ${tempoLimiteMs} ms.`))
      }, tempoLimiteMs)
      this.#pendente = {
        comando,
        resolver: (linha) => {
          clearTimeout(relogio)
          resolver(linha)
        },
        rejeitar: (erro) => {
          clearTimeout(relogio)
          rejeitar(erro)
        },
      }
      this.#escritor!.write(new TextEncoder().encode(comando + '\n')).catch((erro: unknown) => {
        clearTimeout(relogio)
        this.#pendente = undefined
        rejeitar(erro as Error)
      })
    })
  }

  async ping(): Promise<void> {
    await this.enviar('PING', 2000)
  }

  async definir(indice: number, uid: string, matiz = 200): Promise<void> {
    await this.enviar(`SET ${indice} ${uid} ${matiz}`)
  }

  /** O tempo limite cresce com o tamanho do UID: cada caractere custa
      16-32 ms de ritmo real, e um UID de 20 dígitos passa de 600 ms. */
  async disparar(indice: number): Promise<void> {
    await this.enviar(`CARD ${indice}`, 3000)
  }

  /**
   * Uma fila inteira de uma vez, quando do outro lado está o emulador de
   * rádio (`ferramentas/emulador-de-cracha`) e não o rig de HID. O rig de HID
   * responde `ERR comando desconhecido`, que é a resposta certa: quem chama
   * decide o que fazer com isso.
   *
   * O tempo limite acompanha a fila: cada aluno custa o tempo no ar mais o
   * intervalo, e o reset entre eles custa mais uns 150 ms.
   */
  async fila(quantos: number, msNoAr: number, msEntre: number, msAntes = 0): Promise<string> {
    const limite = quantos * (msNoAr + msEntre + 400) + msAntes + 5000
    return await this.enviar(`FILA ${quantos} ${msNoAr} ${msEntre} ${msAntes}`, limite)
  }

  /**
   * Interrompe uma fila em andamento. Fura a regra de uma pergunta por vez
   * de propósito: quem responde é o `FILA` pendente, com `OK parado`, e é
   * essa resposta que libera quem esperava por ele. Sem fila rodando, o
   * emulador responde `ERR comando desconhecido` e ninguém está esperando.
   */
  async pararFila(): Promise<void> {
    if (!this.#escritor) throw new Error('O rig não está conectado.')
    await this.#escritor.write(new TextEncoder().encode('PARAR\n'))
  }

  async digitacaoHumana(texto: string, msPorCaractere: number): Promise<void> {
    await this.enviar(`HUMAN ${texto} ${msPorCaractere}`, texto.length * msPorCaractere + 2000)
  }

  async #ler(leitor: ReadableStreamDefaultReader<Uint8Array>) {
    const decodificador = new TextDecoder()
    let pendente = ''
    try {
      while (true) {
        const { value, done } = await leitor.read()
        if (done) break
        pendente += decodificador.decode(value, { stream: true })
        let corte: number
        while ((corte = pendente.indexOf('\n')) >= 0) {
          this.#tratarLinha(pendente.slice(0, corte).trim())
          pendente = pendente.slice(corte + 1)
        }
      }
    } catch {
      // Cabo puxado: o próximo `enviar()` encontra a porta fechada e reclama.
    }
    this.#conectado = false
  }

  #tratarLinha(linha: string) {
    if (linha === '' || linha.startsWith('PRONTO')) return
    const pendente = this.#pendente
    this.#pendente = undefined
    if (!pendente) return // eco sem ninguém esperando — ignora
    if (linha.startsWith('ERR')) pendente.rejeitar(new Error(linha))
    else pendente.resolver(linha)
  }
}
