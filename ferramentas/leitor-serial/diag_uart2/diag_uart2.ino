// Só para bancada: alterna RX/TX entre as duas orientações possíveis a cada
// 3s, mandando o "acordar" do PN532 e ecoando em hex qualquer coisa que
// volte — testa o cruzamento sem precisar remexer o fio.
#include <Arduino.h>
bool cruzado = true; // true: RX=20,TX=21 (o que o README pede) / false: invertido
uint32_t proximaTroca = 0;
void configurar() {
  Serial1.end();
  delay(50);
  if (cruzado) Serial1.begin(115200, SERIAL_8N1, 20, 21);
  else Serial1.begin(115200, SERIAL_8N1, 21, 20);
  Serial.printf("#DIAG modo: RX=%d TX=%d\n", cruzado ? 20 : 21, cruzado ? 21 : 20);
}
void setup() {
  Serial.begin(115200);
  delay(1000);
  configurar();
}
uint32_t proximoEnvio = 0;
void loop() {
  if (millis() > proximaTroca) {
    proximaTroca = millis() + 3000;
    cruzado = !cruzado;
    configurar();
  }
  if (millis() > proximoEnvio) {
    proximoEnvio = millis() + 500;
    static const uint8_t acordar[] = {0x55,0x55,0x00,0x00,0x00,0x00,0x00,0x00,
                                       0x00,0x00,0xFF,0x02,0xFE,0xD4,0x02,0x2A,0x00};
    Serial1.write(acordar, sizeof acordar);
  }
  while (Serial1.available()) {
    uint8_t b = Serial1.read();
    Serial.printf("[%02X] ", b);
  }
}
