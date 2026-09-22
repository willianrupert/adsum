// Bancada: acha o PN532 sem saber em que pinos ele está.
//
// Varre os dois pares plausíveis — GPIO 4/5 (livres) e GPIO 20/21 (os do
// README, que no C3 também são a UART0 do log de boot) —, nas duas
// orientações e nas duas velocidades de fábrica. Oito combinações, ~4 s cada.
//
// Antes disso mede o repouso dos quatro pinos, com uma ressalva que o
// `diag_uart4` não tinha: **o GPIO 21 aparece alto mesmo sem módulo nenhum**,
// porque a ROM do C3 o usa como console. Só o repouso de 4 e 5 é informativo.
//
// A resposta esperada do PN532 ao GetFirmwareVersion é um ACK
// (00 00 FF 00 FF 00) e depois um quadro com D5 03 32 01 06 07: o `32` é a
// assinatura dele.

#include <Arduino.h>

struct Combinacao {
  int rx, tx;
  long baud;
};

static const Combinacao COMBOS[] = {
  {4, 5, 115200},  {5, 4, 115200},  {4, 5, 9600},    {5, 4, 9600},
  {20, 21, 115200}, {21, 20, 115200}, {20, 21, 9600}, {21, 20, 9600},
};
static const int QUANTAS = sizeof COMBOS / sizeof COMBOS[0];

static const uint8_t ACORDAR[] = {
  0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t VERSAO[] = {0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD4, 0x02, 0x2A, 0x00};

int combo = 0;
uint32_t proximaTroca = 0, proximoEnvio = 0;
int recebidosNoCombo = 0;
bool achou = false;

void medirRepouso() {
  Serial.println("#DIAG repouso (TX de UART parado fica ALTO):");
  for (int pino : {4, 5, 20, 21}) {
    pinMode(pino, INPUT);
    delay(5);
    int alto = 0;
    for (int i = 0; i < 100; i++) alto += digitalRead(pino);
    const char* nota = "";
    if (pino == 21) nota = "  (a ROM do C3 segura este alto; não conclui nada)";
    else if (alto < 50) nota = "  <-- BAIXO";
    Serial.printf("#DIAG   GPIO %2d: %3d%% alto%s\n", pino, alto, nota);
  }
}

void configurar() {
  Serial1.end();
  delay(50);
  const Combinacao& c = COMBOS[combo];
  Serial1.begin(c.baud, SERIAL_8N1, c.rx, c.tx);
  Serial.printf("\n#DIAG [%d/%d] RX=%d TX=%d baud=%ld\n", combo + 1, QUANTAS, c.rx, c.tx, c.baud);
  recebidosNoCombo = 0;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_uart6 — procura o PN532 nos dois pares de pinos");
  medirRepouso();
  configurar();
}

void loop() {
  if (millis() > proximaTroca) {
    proximaTroca = millis() + 4000;
    if (recebidosNoCombo == 0) Serial.println("#DIAG   (nada)");
    combo = (combo + 1) % QUANTAS;
    if (combo == 0 && !achou) {
      Serial.println("\n#DIAG ===== nenhuma combinação respondeu =====");
      Serial.println("#DIAG  1. switches: HSU costuma ser 0 0 — teste as outras duas posições");
      Serial.println("#DIAG  2. VCC: passe de 3V3 para 5V (a placa tem regulador próprio)");
      Serial.println("#DIAG  3. conector de 4 pinos (GND VCC SDA SCL), nunca o de 8 do SPI");
      Serial.println("#DIAG  4. RSTPDN preso em nível baixo mantém o módulo dormindo");
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
    uint8_t b = Serial1.read();
    recebidosNoCombo++;
    Serial.printf("%02X ", b);
    if (b == 0x32) {
      achou = true;
      const Combinacao& c = COMBOS[combo];
      Serial.printf("\n#DIAG >>> PN532 ACHADO: RX=%d TX=%d baud=%ld <<<\n", c.rx, c.tx, c.baud);
    }
  }
}
