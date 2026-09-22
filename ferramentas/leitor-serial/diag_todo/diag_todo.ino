// Bancada: procura o PN532 de todo jeito, em ciclos curtos.
//
// Já se sabe: o módulo está alimentado e os fios estão em GPIO 4 e 5 (os dois
// ficam em alto mesmo com pull-down interno — ver `diag_nivel`). O que falta
// achar é o modo. Cada rodada leva ~6 s e tenta, em sequência:
//
//   1. UART a 115200, nos dois cruzamentos (é o HSU);
//   2. I2C nos dois sentidos (endereço 0x24 é o PN532).
//
// Rodadas curtas de propósito: dá para trocar os switches com o sketch
// rodando e ver o resultado em poucos segundos. Três posições a testar —
// `0 0`, `1 0` e `0 1` — e o silk de placa clone às vezes mente.

#include <Arduino.h>
#include <Wire.h>

static const uint8_t ACORDAR[] = {
  0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t VERSAO[] = {0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD4, 0x02, 0x2A, 0x00};

int rodada = 0;

bool tentarUart(int rx, int tx) {
  Serial1.end();
  delay(30);
  Serial1.begin(115200, SERIAL_8N1, rx, tx);
  while (Serial1.available()) Serial1.read();
  Serial1.write(ACORDAR, sizeof ACORDAR);
  delay(20);
  Serial1.write(VERSAO, sizeof VERSAO);

  const uint32_t limite = millis() + 700;
  int recebidos = 0;
  bool achou = false;
  while (millis() < limite) {
    while (Serial1.available()) {
      uint8_t b = Serial1.read();
      recebidos++;
      Serial.printf("%02X ", b);
      if (b == 0x32) achou = true;
    }
  }
  Serial.printf("| UART RX=%d TX=%d: %d byte(s)%s\n", rx, tx, recebidos, achou ? "  <<< PN532 EM HSU >>>" : "");
  Serial1.end();
  return achou;
}

bool tentarI2c(int sda, int scl) {
  Wire.end();
  delay(30);
  Wire.begin(sda, scl, 100000);
  int achados = 0;
  bool pn532 = false;
  for (uint8_t e = 1; e < 127; e++) {
    Wire.beginTransmission(e);
    if (Wire.endTransmission() == 0) {
      achados++;
      Serial.printf("0x%02X ", e);
      if (e == 0x24) pn532 = true;
    }
  }
  Serial.printf("| I2C SDA=%d SCL=%d: %d endereço(s)%s\n", sda, scl, achados, pn532 ? "  <<< PN532 EM I2C >>>" : "");
  Wire.end();
  return pn532;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_todo — troque os switches enquanto roda (0 0, 1 0, 0 1)");
}

void loop() {
  Serial.printf("\n#DIAG rodada %d\n", ++rodada);
  bool achou = tentarUart(4, 5);
  achou |= tentarUart(5, 4);
  achou |= tentarI2c(4, 5);
  achou |= tentarI2c(5, 4);
  if (achou) Serial.println("#DIAG *** achado — anote a posição dos switches ***");
  delay(1500);
}
