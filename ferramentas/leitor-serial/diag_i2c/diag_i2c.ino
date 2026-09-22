// Bancada: o módulo está vivo, mas em que modo?
//
// A UART não responde em nenhuma das oito combinações. Antes de culpar fio ou
// alimentação, vale a pergunta que o teste de UART não responde: **os
// switches estão em I2C?** Nesse modo o PN532 atende no endereço 0x24
// (0x48 com o bit de leitura), e uma varredura I2C acha isso em segundos.
//
// Os mesmos dois fios servem: em I2C eles são SDA e SCL, e os rótulos da
// frente da placa são justamente esses. Varre as duas orientações.
//
// Resultado:
//   - achou 0x24  -> o módulo está vivo e em I2C. Ou mexemos nos switches
//                    para HSU, ou o firmware passa a falar I2C.
//   - achou outro -> tem algo no barramento, mas não é o PN532.
//   - nada        -> nem I2C nem UART: é alimentação, fio ou o conector
//                    errado (o de 8 pinos é SPI).

#include <Arduino.h>
#include <Wire.h>

void varrer(int sda, int scl) {
  Wire.end();
  delay(50);
  Wire.begin(sda, scl, 100000);
  Serial.printf("\n#DIAG I2C com SDA=%d SCL=%d\n", sda, scl);
  int achados = 0;
  for (uint8_t endereco = 1; endereco < 127; endereco++) {
    Wire.beginTransmission(endereco);
    if (Wire.endTransmission() == 0) {
      achados++;
      Serial.printf("#DIAG   respondeu em 0x%02X%s\n", endereco,
                    endereco == 0x24 ? "  <<< É O PN532 (modo I2C) >>>" : "");
    }
    delay(2);
  }
  if (achados == 0) Serial.println("#DIAG   nada neste sentido");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_i2c — procura o PN532 no barramento I2C");
}

void loop() {
  varrer(4, 5);
  varrer(5, 4);
  Serial.println("\n#DIAG --- fim da rodada, repetindo em 3 s (dá tempo de trocar os switches)");
  delay(3000);
}
