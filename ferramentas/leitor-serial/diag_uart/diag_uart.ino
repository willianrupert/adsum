// Só para bancada: manda o "acordar" do PN532 e ecoa em hex tudo que chegar
// pela UART1 (pinos 20/21). Prova se há QUALQUER resposta, mesmo garbage —
// separa "nada volta" (fiação/switch) de "volta algo errado" (baud/soma).
#include <Arduino.h>
void setup() {
  Serial.begin(115200);
  Serial1.begin(115200, SERIAL_8N1, 20, 21);
  delay(1500);
  Serial.println("#DIAG pronto");
}
uint32_t proximoEnvio = 0;
void loop() {
  if (millis() > proximoEnvio) {
    proximoEnvio = millis() + 2000;
    static const uint8_t acordar[] = {0x55,0x55,0x00,0x00,0x00,0x00,0x00,0x00};
    Serial1.write(acordar, sizeof acordar);
    Serial.println("#DIAG enviei acordar+GetFirmwareVersion");
    delay(20);
    static const uint8_t versao[] = {0x00,0x00,0xFF,0x02,0xFE,0xD4,0x02,0x2A,0x00};
    Serial1.write(versao, sizeof versao);
  }
  while (Serial1.available()) {
    uint8_t b = Serial1.read();
    if (b < 0x10) Serial.print('0');
    Serial.print(b, HEX);
    Serial.print(' ');
  }
}
