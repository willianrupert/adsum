// Bancada: o fio está mesmo ligado, e o módulo está mesmo ligado?
//
// "Pino em repouso alto" não prova nada: pino solto no ESP32 flutua e costuma
// ler alto. O teste honesto é puxar o pino para baixo por dentro (pull-down
// interno, ~45 kΩ) e ver quem ganha. Se algo externo continua segurando o
// pino em alto, esse algo é o TXD do PN532, alimentado e em repouso — o único
// jeito de saber isso sem osciloscópio.
//
// Leitura dos resultados, por pino:
//   ALTO mesmo com pull-down  -> fio ligado e módulo alimentado (é o TXD dele)
//   BAIXO com pull-down e ALTO com pull-up -> pino solto, ou é o RXD do módulo
//                                             (entrada, não empurra nada)
//   BAIXO nos dois            -> algo prende em terra: fio no pino errado
//
// Com os dois fios ligados, o esperado é **um** pino alto sob pull-down (TXD)
// e o outro seguindo o pull-up (RXD).

#include <Arduino.h>

int mede(int pino, int modo) {
  pinMode(pino, modo);
  delay(20);
  int alto = 0;
  for (int i = 0; i < 200; i++) alto += digitalRead(pino);
  return alto / 2; // percentagem
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_nivel — quem segura a linha");
}

void loop() {
  for (int pino : {4, 5, 20}) {
    const int comPullDown = mede(pino, INPUT_PULLDOWN);
    const int comPullUp = mede(pino, INPUT_PULLUP);
    const char* veredito = comPullDown > 80   ? "algo externo segura ALTO -> é o TXD do módulo, alimentado"
                           : comPullUp > 80   ? "segue o pull-up -> solto, ou é o RXD do módulo"
                                              : "preso em BAIXO -> fio no pino errado, ou curto";
    Serial.printf("#DIAG GPIO %2d: pull-down %3d%% | pull-up %3d%% | %s\n", pino, comPullDown, comPullUp, veredito);
  }
  Serial.println("#DIAG ---");
  delay(2500);
}
