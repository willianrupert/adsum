// Só para bancada: pisca o LED do GPIO 3, meio segundo aceso e meio apagado.
#include <Arduino.h>
void setup() {
  pinMode(3, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  digitalWrite(3, HIGH);
  Serial.println("#DIAG led aceso");
  delay(500);
  digitalWrite(3, LOW);
  Serial.println("#DIAG led apagado");
  delay(500);
}
