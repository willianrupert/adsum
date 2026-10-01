// O rig S3 (`ferramentas/rig-de-cracha`) como o dongle do teste: um ESP32-S3
// que se apresenta ao computador como teclado USB e digita o UID no ritmo
// medido do dongle. Do conector USB para cima, é o mesmo caminho do dongle:
// sistema operacional, foco da janela, Chrome e app.
//
// O teclado do rig digita onde estiver o foco do sistema. Antes de cada
// crachá, quem chama confere que a janela do teste está em foco: uma rajada
// fora do lugar é texto e Enter na janela de outra pessoa.

import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

export interface Rig {
  /** Digita o UID (como o dongle imprime) e Enter; resolve quando o rig termina. */
  digitar(uid: string): Promise<void>
  fechar(): Promise<void>
}

/** A primeira porta da Espressif: o rig, quando `ADSUM_RIG` é "auto". */
export async function acharRig(): Promise<string | undefined> {
  const portas = await SerialPort.list()
  return portas.find((p) => /espressif/i.test(p.manufacturer ?? ''))?.path
}

/**
 * A placa em modo de gravação aparece como a porta de fábrica do chip, e não
 * responde. Acontece ao ligar com o BOOT apertado, ou depois de um reinício
 * pela USB; reiniciar pelo watchdog volta ao firmware do rig.
 */
const EM_GRAVACAO =
  'o rig não respondeu. Se o Mac o mostra como "USB JTAG/serial debug unit", a placa está em modo de gravação: ' +
  'esptool --port <porta> --after watchdog-reset read-mac (ou desconecte e reconecte sem apertar BOOT)'

export async function abrirRig(caminho: string): Promise<Rig> {
  const porta = new SerialPort({ path: caminho, baudRate: 115200 })
  await new Promise<void>((pronto, falhou) => porta.once('open', pronto).once('error', falhou))
  const linhas = porta.pipe(new ReadlineParser({ delimiter: '\n' }))
  const fila: ((linha: string) => void)[] = []
  linhas.on('data', (l: string) => fila.shift()?.(l.trim()))

  const comando = (texto: string, ateMs = 5000) =>
    new Promise<string>((pronto, falhou) => {
      const limite = setTimeout(() => falhou(new Error(`rig sem resposta a "${texto.split(' ')[0]}"`)), ateMs)
      fila.push((l) => {
        clearTimeout(limite)
        pronto(l)
      })
      porta.write(`${texto}\n`)
    })

  const resposta = await comando('PING').catch(() => {
    throw new Error(EM_GRAVACAO)
  })
  if (resposta !== 'PONG') throw new Error(`o rig respondeu "${resposta}" ao PING`)

  return {
    async digitar(uid) {
      const r = await comando(`RAW ${uid}`)
      if (!r.startsWith('OK')) throw new Error(`o rig recusou o crachá: ${r}`)
    },
    fechar: () => new Promise((fim) => porta.close(() => fim())),
  }
}
