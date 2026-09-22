// Bancada: por que o PN532 não responde.
//
// Os diagnósticos anteriores (diag_uart, 2 e 3) mandavam o "acordar" e
// esperavam. Quando não volta nada, eles não distinguem três mundos bem
// diferentes: o módulo está sem alimentação, está alimentado mas mudo (switch
// no modo errado), ou está falando e nós lendo no pino errado.
//
// Este separa os três, na ordem, antes de mandar qualquer coisa:
//
//   1. **Nível de repouso da linha.** Um TX de UART em repouso fica em nível
//      alto. Se o pino que deveria receber está em nível baixo, ou o módulo
//      está sem 3,3 V, ou o fio não está nesse pino, ou aquele pino do módulo
//      não é o TXD. Isso se mede sem trocar um byte sequer.
//   2. **A varredura**: os dois cruzamentos possíveis, nas duas velocidades
//      que o PN532 usa de fábrica.
//   3. **Eco cru**, em hexadecimal: mesmo lixo é informação — quer dizer que
//      há sinal, e o problema é velocidade ou quadro.
//
// O que o módulo deve responder ao GetFirmwareVersion é um ACK
// (00 00 FF 00 FF 00) seguido de um quadro com D5 03 32 01 06 07 — o `32` é
// o PN532. Qualquer coisa parecida com isso já resolve a bancada.

#include <Arduino.h>

static const int PINOS[] = {20, 21};
static const long BAUDS[] = {115200, 9600};

// Acordar mais longo, como a nota de aplicação da NXP recomenda para HSU,
// seguido de GetFirmwareVersion (D4 02).
static const uint8_t ACORDAR[] = {
  0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t VERSAO[] = {0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD4, 0x02, 0x2A, 0x00};

void medirRepouso() {
  Serial.println("#DIAG 1) nível de repouso dos pinos (esperado: ALTO nos dois)");
  for (int pino : PINOS) {
    pinMode(pino, INPUT);
    delay(5);
    int alto = 0;
    for (int i = 0; i < 100; i++) alto += digitalRead(pino);
    Serial.printf("#DIAG   GPIO %d: %d%% do tempo em nível alto%s\n", pino, alto,
                  alto < 50 ? "  <-- BAIXO: sem alimentação, fio solto, ou não é o TXD" : "");
  }
  Serial.println("#DIAG   (se os dois estiverem baixos, é alimentação ou fiação — não adianta varrer)");
}

int combo = 0;
uint32_t proximaTroca = 0, proximoEnvio = 0;
bool algoChegou = false;

void configurar() {
  Serial1.end();
  delay(50);
  const int rx = PINOS[combo % 2 == 0 ? 0 : 1];
  const int tx = PINOS[combo % 2 == 0 ? 1 : 0];
  const long baud = BAUDS[combo / 2];
  Serial1.begin(baud, SERIAL_8N1, rx, tx);
  Serial.printf("#DIAG 2) RX=%d TX=%d baud=%ld\n", rx, tx, baud);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_uart4 — PN532 mudo, por quê");
  medirRepouso();
  configurar();
}

void loop() {
  if (millis() > proximaTroca) {
    proximaTroca = millis() + 4000;
    if (!algoChegou && millis() > 5000) {
      Serial.println("#DIAG   nada nesta combinação");
    }
    algoChegou = false;
    combo = (combo + 1) % 4;
    if (combo == 0) {
      Serial.println("#DIAG --- volta pro começo. Se nada respondeu em nenhuma:");
      Serial.println("#DIAG     a) troque os switches (HSU costuma ser 0 0; experimente as outras);");
      Serial.println("#DIAG     b) alimente o módulo com 5 V em vez de 3,3 V (ele tem regulador);");
      Serial.println("#DIAG     c) confira que os fios estão no conector de 4 pinos (GND VCC SDA SCL),");
      Serial.println("#DIAG        cujos rótulos TXD/RXD estão no verso da placa — não no conector SPI.");
    }
    configurar();
  }

  if (millis() > proximoEnvio) {
    proximoEnvio = millis() + 1000;
    Serial1.write(ACORDAR, sizeof ACORDAR);
    delay(20);
    Serial1.write(VERSAO, sizeof VERSAO);
  }

  while (Serial1.available()) {
    algoChegou = true;
    uint8_t b = Serial1.read();
    Serial.printf("%02X ", b);
    if (b == 0x32) Serial.println("\n#DIAG   <-- 0x32: é o PN532 respondendo. Achamos.");
  }
}
