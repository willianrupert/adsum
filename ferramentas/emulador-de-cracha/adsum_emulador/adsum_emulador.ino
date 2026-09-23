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
//                                 10 dígitos (como o dongle digita) ou em hex.
//                                 Responde `OK <numero>`: o que o dongle vai
//                                 digitar de verdade, já com o 0x08 imposto
//                                 pelo firmware e a ordem invertida
//   CARD <indice> [ms]         -- põe aquele crachá no ar por [ms] (2500 por
//                                 padrão). O dongle varre o campo em
//                                 intervalos: com pouco tempo no ar, ele
//                                 simplesmente não passa por lá — medido em
//                                 22/09/2026, 350 ms não bastava
//   FILA <quantos> <ar> <gap> [atraso]
//                              -- uma turma inteira: `quantos` crachás
//                                 diferentes, cada um `ar` ms no campo, com
//                                 `gap` ms entre eles. Responde
//                                 `OK <primeiro> <ultimo>` com os números que
//                                 o dongle digita. Crachás **diferentes** a
//                                 cada rodada de propósito: o dongle ignora o
//                                 mesmo crachá parado no campo, e só lê de
//                                 novo quando ele sai e outro entra.
//                                 `atraso` (ms) espera antes do primeiro
//                                 aluno: é o tempo de fechar o Diagnóstico e
//                                 ir ver os nomes aparecendo na chamada, que
//                                 é onde o professor olha de verdade
//   RESET <ON|OFF>             -- liga ou desliga o reset por fio entre um
//                                 aluno e outro. Com a antena na distância
//                                 certa, trocar de UID pode bastar — e sem o
//                                 reset a fila anda bem mais rápido
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
/**
 * `RSTPDN` do PN532 (pino de reset), no GPIO 10.
 *
 * É o que faz o crachá **sair da mão de verdade**. Três tentativas por
 * software falharam em produzir essa saída — sair do modo alvo, desligar o
 * rádio por `RFConfiguration`, e dormir por `PowerDown`: em todas, o dongle
 * continuou enxergando "cartão presente" e só voltou a ler quando o autor
 * afastava o dispositivo com a mão. Segurar o reset em nível baixo desliga o
 * módulo inteiro, e aí não há o que responder ao campo.
 *
 * Sem o fio ligado, o pino fica solto e o resto do firmware funciona igual —
 * só o `FILA` volta a ler menos crachás.
 */
static const int PINO_RESET = 10;
/** Quanto tempo o módulo fica desligado entre um crachá e outro. */
static const int MS_DESLIGADO = 120;
/** Ligado por padrão; o comando `RESET OFF` desliga para medir sem ele. */
bool usarReset = true;
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

/**
 * Tira o crachá do ar de verdade: manda o PN532 **dormir**.
 *
 * O dongle não relê um crachá que continua no campo — ele espera o cartão
 * sair. Duas tentativas não bastaram para produzir essa saída: sair do modo
 * alvo com a rajada de acordar, e desligar o rádio com `RFConfiguration`. Nas
 * duas, o dongle só voltava a ler quando o autor afastava o dispositivo com a
 * mão, ou seja, quando o acoplamento se quebrava de verdade.
 *
 * `PowerDown` (D4 16) desliga o analógico do chip: dormindo, ele não responde
 * ao campo, que é o mesmo que o crachá ter saído da mão. A rajada de 0x55
 * acorda de volta. Se nem isso bastar, sobra o caminho por fio: `RSTPDN` num
 * GPIO, resetando o módulo entre um aluno e outro.
 */
void configurarSam();

void tirarDoAr() {
  if (!usarReset) {
    // Sem reset: só sai do modo alvo. A configuração do chip sobrevive, então
    // não precisa reenviar o SAM — e a fila anda muito mais rápido.
    acordar();
    return;
  }
  digitalWrite(PINO_RESET, LOW);
  delay(MS_DESLIGADO);
  digitalWrite(PINO_RESET, HIGH);
  delay(30);
  acordar();
  // O reset apaga a configuração do chip, e o modo alvo não funciona sem ela
  // — foi o que travou esta bancada por horas. Reconfigura sempre.
  configurarSam();
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
    // Devolve o número que o dongle vai digitar, que **não** é o que se
    // pediu: o primeiro byte do ar é sempre 0x08, e o dongle imprime os
    // bytes ao contrário. Quem testa precisa saber o que esperar, e
    // calcular isso do lado de fora seria repetir esta regra em dois
    // lugares. O app aceita qualquer resposta que não comece por ERR.
    const uint8_t* u = crachas[indice].uid;
    const uint32_t comoSai = ((uint32_t)u[2] << 24) | ((uint32_t)u[1] << 16) | ((uint32_t)u[0] << 8) | 0x08;
    Serial.printf("OK %010u\n", comoSai);
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

  if (comando == "FILA") {
    const int quantos = proximaPalavra(linha).toInt();
    const String arTexto = proximaPalavra(linha);
    const String gapTexto = proximaPalavra(linha);
    const int ar = arTexto.length() ? arTexto.toInt() : 1200;
    const int gap = gapTexto.length() ? gapTexto.toInt() : 300;
    const String atrasoTexto = proximaPalavra(linha);
    const int atraso = atrasoTexto.length() ? atrasoTexto.toInt() : 0;
    if (quantos <= 0 || quantos > 1000) {
      Serial.println("ERR uso: FILA <quantos> <ms no ar> <ms entre>");
      return;
    }
    // Faixa própria, longe dos UIDs medidos do dongle real e dos crachás de
    // teste do rig de HID: uma fila nunca deve colidir com crachá de gente.
    if (atraso > 0) {
      // Piscar depressa enquanto espera: quem está com o dongle na mão sabe
      // que a fila vai começar, sem precisar olhar o monitor.
      const uint32_t fim = millis() + (uint32_t)atraso;
      while (millis() < fim) {
        digitalWrite(PINO_LED, HIGH);
        delay(120);
        digitalWrite(PINO_LED, LOW);
        delay(120);
      }
    }

    uint32_t primeiro = 0, ultimo = 0;
    for (int i = 0; i < quantos; i++) {
      // PARAR interrompe entre um aluno e outro. Sem isto, a única saída de
      // uma fila de 300 era puxar o cabo (bancada de 23/09/2026). Qualquer
      // outra coisa que chegue aqui é descartada: no meio de uma fila não há
      // outro comando que faça sentido.
      if (Serial.available()) {
        const String pedido = Serial.readStringUntil('\n');
        if (pedido.startsWith("PARAR")) {
          tirarDoAr();
          digitalWrite(PINO_LED, LOW);
          Serial.printf("OK parado %d de %d\n", i, quantos);
          return;
        }
      }
      Cracha c;
      c.definido = true;
      c.uid[0] = 0xAD;
      c.uid[1] = (uint8_t)(i >> 8);
      c.uid[2] = (uint8_t)i;
      const uint32_t comoSai = ((uint32_t)c.uid[2] << 24) | ((uint32_t)c.uid[1] << 16) | ((uint32_t)c.uid[0] << 8) | 0x08;
      if (i == 0) primeiro = comoSai;
      ultimo = comoSai;

      digitalWrite(PINO_LED, HIGH);
      porNoAr(c);
      const uint32_t limite = millis() + (uint32_t)max(ar, 100);
      while (millis() < limite) {
        delay(45);
        if (pronto()) break;
      }
      tirarDoAr();
      digitalWrite(PINO_LED, LOW);
      delay((uint32_t)max(gap, 0));
    }
    Serial.printf("OK %010u %010u\n", primeiro, ultimo);
    return;
  }

  if (comando == "RESET") {
    const String valor = proximaPalavra(linha);
    if (valor == "ON") usarReset = true;
    else if (valor == "OFF") usarReset = false;
    else {
      Serial.println("ERR uso: RESET <ON|OFF>");
      return;
    }
    Serial.printf("OK reset=%s\n", usarReset ? "on" : "off");
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

  pinMode(PINO_RESET, OUTPUT);
  digitalWrite(PINO_RESET, HIGH);
  delay(50);

  // SAMConfiguration antes de qualquer coisa. Descoberto por eliminação em
  // 22/09/2026: as duas únicas emulações que o dongle leu aconteceram com o
  // PN532 ainda configurado pelo sketch anterior — regravar o ESP32 não
  // reinicia o PN532, e o estado sobreviveu. Depois de desligar a energia de
  // verdade, nenhuma leitura mais. O chip parece precisar do modo normal
  // configurado antes de entrar em modo alvo.
  const uint8_t sam[] = {0xD4, 0x14, 0x01, 0x14, 0x01};
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
  const bool samOk = true;
  configurarSam();
  Serial.printf("#ADSUM-EMULADOR 1 pn532=%s sam=%s\n", ok ? "ok" : "erro", samOk ? "ok" : "erro");
}

/** O modo normal do chip, exigido antes de entrar em modo alvo. */
void configurarSam() {
  const uint8_t sam[] = {0xD4, 0x14, 0x01, 0x14, 0x01};
  uint8_t r[12];
  enviarComando(sam, sizeof sam);
  if (esperar(40)) {
    lerQuadro(r, 6);
    if (esperar(40)) lerQuadro(r, 9);
  }
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
