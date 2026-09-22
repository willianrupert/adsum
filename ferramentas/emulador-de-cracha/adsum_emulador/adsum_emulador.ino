// Emulador de crachá: ESP32-C3 SuperMini + PN532, para o dongle de verdade ler.
//
// O rig de HID (`ferramentas/rig-de-cracha`) entra no meio do caminho: ele
// digita o que o dongle digitaria. Este entra no começo — vira um crachá no
// campo de rádio, e o dongle faz o trabalho dele inteiro: anticolisão, leitura
// do UID, digitação. É o último pedaço do caminho real que nenhum teste
// cobria, e foi por isso que a chamada de 22/09/2026 quebrou em lugares que
// os testes não olhavam.
//
// **Fala o mesmo protocolo do rig de HID de propósito**, para a suíte de
// testes físicos (`ambiente/rigDeCracha.ts`) comandar os dois sem saber a
// diferença. Uma linha por comando, resposta `OK` ou `ERR` em cada uma:
//
//   PING                       -> PONG
//   SET <indice> <uid> <matiz> -- define um crachá virtual; uid em decimal de
//                                 10 dígitos (como o dongle digita) ou em hex
//   CARD <indice> [ms]         -- põe aquele crachá no ar por [ms] (2500 por
//                                 padrão). O dongle varre o campo em
//                                 intervalos: com pouco tempo no ar, ele
//                                 simplesmente não passa por lá — medido em
//                                 22/09/2026, 350 ms não bastava
//   LED                        -- pisca cinco vezes, para conferir a ligação
//   HUMAN <texto> <ms>         -- aceito e ignorado: não há como "digitar
//                                 devagar" por rádio, e o comando existe só
//                                 para a suíte poder tratar os dois rigs igual
//
// **O primeiro byte do UID emulado é sempre `0x08`.** O firmware do PN532
// mascara isso como contramedida contra clonagem, e não há como contornar:
// dá para emular *um* crachá, nunca *aquele* crachá. Os três bytes restantes
// são livres, o que basta para uma turma inteira de gente inventada.
//
// **A ordem dos bytes é invertida na saída do dongle**, medido duas vezes em
// 22/09/2026 — com o crachá real e com o emulado. `SET` recebe o UID na ordem
// que o dongle digita e inverte aqui, então o número que entra é o número que
// sai.

#include <Arduino.h>
#include <SPI.h>

static const int PINO_SCK = 4, PINO_MISO = 5, PINO_MOSI = 6, PINO_CS = 7;
/** LED verde no GPIO 3, com 330 Ω para o GND (perna longa no GPIO).
    Pulsa devagar quando ocioso — assim a ligação se confere sem comando —,
    fica aceso enquanto um crachá está no ar, e dá três piscadas rápidas
    quando o alvo chega a ser selecionado. */
static const int PINO_LED = 3;
static const uint8_t ESCREVER = 0x01, LER_ESTADO = 0x02, LER_DADOS = 0x03;
static const int CRACHAS = 16;

SPISettings ajustes(1000000, MSBFIRST, SPI_MODE0);

struct Cracha {
  bool definido = false;
  uint8_t uid[3] = {0, 0, 0}; // os três bytes livres; o quarto é 0x08
};
Cracha crachas[CRACHAS];

uint8_t inverter(uint8_t b) {
  uint8_t r = 0;
  for (int i = 0; i < 8; i++) {
    r <<= 1;
    r |= b & 1;
    b >>= 1;
  }
  return r;
}

void acordar() {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  for (int i = 0; i < 16; i++) SPI.transfer(0x55);
  for (int i = 0; i < 3; i++) SPI.transfer(0x00);
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  delay(50);
}

void enviarComando(const uint8_t* dados, size_t n) {
  uint8_t soma = 0;
  for (size_t i = 0; i < n; i++) soma += dados[i];
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(ESCREVER));
  const uint8_t cabecalho[] = {0x00, 0x00, 0xFF, (uint8_t)n, (uint8_t)(~n + 1)};
  for (uint8_t b : cabecalho) SPI.transfer(inverter(b));
  for (size_t i = 0; i < n; i++) SPI.transfer(inverter(dados[i]));
  SPI.transfer(inverter((uint8_t)(~soma + 1)));
  SPI.transfer(inverter(0x00));
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
}

bool pronto() {
  delay(5);
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(1);
  SPI.transfer(inverter(LER_ESTADO));
  const uint8_t cru = SPI.transfer(0x00);
  delay(1);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  return inverter(cru) == 0x01;
}

bool esperar(int tentativas) {
  for (int i = 0; i < tentativas; i++)
    if (pronto()) return true;
  return false;
}

void lerQuadro(uint8_t* destino, int quantos) {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(1);
  SPI.transfer(inverter(LER_DADOS));
  for (int i = 0; i < quantos; i++) destino[i] = inverter(SPI.transfer(0x00));
  delay(1);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
}

/**
 * Põe o crachá no ar. Volta assim que o comando é aceito — **não** espera ser
 * lido: o dongle faz só a anticolisão e vai embora, sem completar a seleção
 * que faria o `TgInitAsTarget` retornar. Medido em 22/09/2026: o dongle
 * digitou o UID e o PN532 continuou esperando. Quem espera é o chamador, pelo
 * tempo que quiser deixar o crachá encostado.
 */
bool porNoAr(const Cracha& cracha) {
  const uint8_t comando[] = {
    0xD4, 0x8C,
    0x05,                                           // passivo, só PICC
    0x04, 0x00,                                     // SENS_RES (ATQA) de Mifare
    cracha.uid[0], cracha.uid[1], cracha.uid[2],    // NFCID1t (o 1º byte sai 0x08)
    0x08,                                           // SEL_RES (SAK) de Mifare Classic 1K
    0x01, 0xFE, 0x0F, 0xBB, 0xBA, 0xA6, 0xC9, 0x89, // FeliCaParams, sem uso
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF,
    0x01, 0xFE, 0x0F, 0xBB, 0xBA, 0xA6, 0xC9, 0x89, 0x00, 0x00, // NFCID3t
    0x00, 0x00,                                     // sem general nem historical bytes
  };
  enviarComando(comando, sizeof comando);
  if (!esperar(40)) return false;
  uint8_t ack[6];
  lerQuadro(ack, 6);
  return true;
}

/** Tira o crachá do ar: o próximo `CARD` começa limpo. */
void tirarDoAr() {
  acordar();
}

/**
 * O UID na ordem em que o dongle o digita, guardado na ordem em que o PN532
 * precisa dele. Aceita decimal de 10 dígitos (`0930148883`) ou hexadecimal
 * (`3770f213`), que são os dois formatos que `nucleo/digitacao.ts` reconhece.
 */
bool interpretarUid(const String& texto, uint8_t* destino) {
  uint32_t valor = 0;
  if (texto.length() == 8 && texto.indexOf('x') < 0) {
    for (char c : texto) {
      const int digito = isdigit(c) ? c - '0' : (tolower(c) >= 'a' && tolower(c) <= 'f' ? tolower(c) - 'a' + 10 : -1);
      if (digito < 0) return false;
      valor = (valor << 4) | (uint32_t)digito;
    }
  } else {
    for (char c : texto) {
      if (!isdigit(c)) return false;
      valor = valor * 10 + (uint32_t)(c - '0');
    }
  }
  // O dongle digita os bytes ao contrário do que o PN532 emite: o byte menos
  // significativo do número é o primeiro do ar. O quarto byte é o 0x08 que o
  // firmware impõe, e por isso não cabe aqui.
  destino[0] = (uint8_t)(valor >> 16);
  destino[1] = (uint8_t)(valor >> 8);
  destino[2] = (uint8_t)valor;
  return true;
}

String proximaPalavra(String& linha) {
  const int espaco = linha.indexOf(' ');
  if (espaco < 0) {
    const String palavra = linha;
    linha = "";
    return palavra;
  }
  const String palavra = linha.substring(0, espaco);
  linha = linha.substring(espaco + 1);
  linha.trim();
  return palavra;
}

void tratar(String linha) {
  linha.trim();
  if (linha.length() == 0) return;
  const String comando = proximaPalavra(linha);

  if (comando == "PING") {
    Serial.println("PONG");
    return;
  }

  if (comando == "SET") {
    const int indice = proximaPalavra(linha).toInt();
    const String uid = proximaPalavra(linha);
    if (indice < 0 || indice >= CRACHAS || uid.length() == 0) {
      Serial.println("ERR uso: SET <indice> <uid> <matiz>");
      return;
    }
    if (!interpretarUid(uid, crachas[indice].uid)) {
      Serial.println("ERR uid nao reconhecido — decimal de 10 digitos ou hex de 8");
      return;
    }
    crachas[indice].definido = true;
    Serial.println("OK");
    return;
  }

  if (comando == "CARD") {
    const int indice = proximaPalavra(linha).toInt();
    if (indice < 0 || indice >= CRACHAS || !crachas[indice].definido) {
      Serial.println("ERR cracha nao definido — use SET antes");
      return;
    }
    const String tempo = proximaPalavra(linha);
    const int ms = tempo.length() ? tempo.toInt() : 2500;
    digitalWrite(PINO_LED, HIGH);
    const bool foi = porNoAr(crachas[indice]);
    // Fica no ar o tempo pedido, mas sai antes se alguém selecionar o alvo —
    // assim uma fila de 300 não paga o tempo cheio por aluno.
    //
    // **Consulta espaçada de propósito.** Perguntar o estado a cada poucos
    // milissegundos mantém o PN532 ocupado no SPI enquanto ele deveria estar
    // cuidando do rádio: com consulta apertada o dongle não leu nada, e com
    // ~50 ms entre consultas leu. Medido na bancada de 22/09/2026.
    const uint32_t limite = millis() + (uint32_t)max(ms, 100);
    bool lido = false;
    while (millis() < limite) {
      delay(45);
      if (pronto()) {
        lido = true;
        break;
      }
    }
    tirarDoAr();
    digitalWrite(PINO_LED, LOW);
    if (lido) {
      for (int i = 0; i < 3; i++) { // selecionado: três piscadas rápidas
        digitalWrite(PINO_LED, HIGH);
        delay(70);
        digitalWrite(PINO_LED, LOW);
        delay(70);
      }
    }
    if (!foi) Serial.println("ERR o PN532 nao aceitou o comando de alvo");
    else Serial.println(lido ? "OK lido" : "OK no ar");
    return;
  }

  if (comando == "LED") {
    for (int i = 0; i < 5; i++) {
      digitalWrite(PINO_LED, HIGH);
      delay(150);
      digitalWrite(PINO_LED, LOW);
      delay(150);
    }
    Serial.println("OK");
    return;
  }

  if (comando == "HUMAN") {
    // Sem equivalente por rádio: não existe "aproximar devagar" que vire
    // digitação lenta. Responde OK para a suíte tratar os dois rigs igual.
    Serial.println("OK");
    return;
  }

  Serial.println("ERR comando desconhecido");
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_LED, OUTPUT);
  digitalWrite(PINO_LED, LOW);
  pinMode(PINO_CS, OUTPUT);
  digitalWrite(PINO_CS, HIGH);
  SPI.begin(PINO_SCK, PINO_MISO, PINO_MOSI, PINO_CS);
  delay(500);
  acordar();

  const uint8_t versao[] = {0xD4, 0x02};
  uint8_t r[16];
  enviarComando(versao, sizeof versao);
  bool ok = false;
  if (esperar(40)) {
    lerQuadro(r, 6);
    if (esperar(40)) {
      lerQuadro(r, 14);
      ok = r[7] == 0x32;
    }
  }
  Serial.printf("#ADSUM-EMULADOR 1 pn532=%s\n", ok ? "ok" : "erro");
}

void loop() {
  // Pulso lento de ocioso: sem isto, LED apagado é ambíguo — pode ser fio
  // errado, polaridade invertida, ou simplesmente nada acontecendo.
  static uint32_t proximoPulso = 0;
  static bool aceso = false;
  if (millis() > proximoPulso) {
    proximoPulso = millis() + (aceso ? 1400 : 120);
    aceso = !aceso;
    digitalWrite(PINO_LED, aceso ? HIGH : LOW);
  }

  static String linha;
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n') {
      tratar(linha);
      linha = "";
    } else if (c != '\r') {
      linha += c;
    }
  }
}
