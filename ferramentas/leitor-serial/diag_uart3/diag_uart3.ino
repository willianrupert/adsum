// Bancada: varre pino (RX=20/TX=21 e invertido) x velocidade (115200 e 9600),
// manda um "acordar" mais longo (14 bytes, como a nota de aplicação da NXP
// recomenda) e ecoa em hex qualquer coisa que volte.
#include <Arduino.h>
struct Combinacao { int rx, tx; long baud; };
Combinacao combos[] = {
  {20, 21, 115200}, {21, 20, 115200},
  {20, 21, 9600},    {21, 20, 9600},
};
int indice = 0;
uint32_t proximaTroca = 0, proximoEnvio = 0;

void configurar() {
  Serial1.end();
  delay(50);
  auto& c = combos[indice];
  Serial1.begin(c.baud, SERIAL_8N1, c.rx, c.tx);
  Serial.printf("#DIAG RX=%d TX=%d baud=%ld\n", c.rx, c.tx, c.baud);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  configurar();
}

void loop() {
  if (millis() > proximaTroca) {
    proximaTroca = millis() + 3000;
    indice = (indice + 1) % 4;
    configurar();
  }
  if (millis() > proximoEnvio) {
    proximoEnvio = millis() + 600;
    static const uint8_t acordar[] = {
      0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD4, 0x02, 0x2A, 0x00,
    };
    Serial1.write(acordar, sizeof acordar);
  }
  while (Serial1.available()) {
    uint8_t b = Serial1.read();
    Serial.printf("[%02X]", b);
  }
}
