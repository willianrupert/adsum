// Bancada: os dois fios são sinais independentes?
//
// Empurra o GPIO 5 para baixo e para cima e observa o 4, e depois o inverso.
// Se um segue o outro, os dois fios estão no mesmo sinal (ou num par curto
// -circuitado), e nenhum protocolo ia funcionar mesmo. Se não seguem, são
// sinais distintos, e o problema é qual sinal é.
//
// Também mede quanto o pino cede quando empurrado: um pino ligado a uma
// entrada do módulo (RXD) cede fácil; um ligado à saída dele (TXD, em
// repouso alto) resiste.

#include <Arduino.h>

int observa(int pino) {
  pinMode(pino, INPUT);
  delay(5);
  int alto = 0;
  for (int i = 0; i < 100; i++) alto += digitalRead(pino);
  return alto;
}

void empurra(int alvo, int nivel, int observado, const char* rotulo) {
  pinMode(alvo, OUTPUT);
  digitalWrite(alvo, nivel);
  delay(20);
  Serial.printf("#DIAG %s: GPIO %d em %s -> GPIO %d lê %3d%% alto\n", rotulo, alvo,
                nivel ? "ALTO " : "BAIXO", observado, observa(observado));
  pinMode(alvo, INPUT);
  delay(5);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_par — os dois fios são sinais independentes?");
}

void loop() {
  empurra(5, LOW, 4, "a");
  empurra(5, HIGH, 4, "b");
  empurra(4, LOW, 5, "c");
  empurra(4, HIGH, 5, "d");
  Serial.println("#DIAG (se o observado acompanha o empurrado, os dois fios estão no mesmo sinal)");
  Serial.println("#DIAG ---");
  delay(3000);
}
