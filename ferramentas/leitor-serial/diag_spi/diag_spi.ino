// Bancada: PN532 por SPI, seguindo o protocolo do Prismo.
//
// O Prismo (github.com/nu31hackerspace/prismo) roda no **mesmo par de
// hardware** desta bancada — ESP32-C3 SuperMini + PN532 por SPI — e é testado
// em placa real a cada mudança. Copiar o que ele faz é mais barato que
// descobrir de novo. Três diferenças em relação à primeira tentativa daqui:
//
//   1. **Acordar é uma rajada**, não um pulso de CS: com CS em baixo, mandar
//      dezesseis 0x55 e três 0x00, esperar, soltar o CS. O pulso sozinho (que
//      o outro projeto de referência usa) não bastou aqui.
//   2. **Cada byte vai com os bits invertidos à mão**, em SPI MSB. O PN532
//      fala LSB primeiro, e inverter no byte é mais confiável que pedir
//      LSBFIRST ao periférico — que nem todo controlador respeita.
//   3. **Esperas de 2 ms em volta de cada CS**, e 20 ms entre consultas de
//      estado. O comentário do Prismo marca esses tempos como necessários.
//
// Pinos do Prismo: SCK=1 MISO=2 MOSI=3 SS=4. Aqui ficam em 4/5/6/7, que são
// os fios já ligados; se nada responder, vale mudar para os deles, porque é a
// combinação que se sabe funcionar.

#include <Arduino.h>
#include <SPI.h>

static const int PINO_SCK = 4, PINO_MISO = 5, PINO_MOSI = 6, PINO_CS = 7;
static const uint8_t ESCREVER = 0x01, LER_ESTADO = 0x02, LER_DADOS = 0x03;
static const uint8_t VERSAO[] = {0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD4, 0x02, 0x2A, 0x00};

SPISettings ajustes(1000000, MSBFIRST, SPI_MODE0);

uint8_t inverter(uint8_t b) {
  uint8_t r = 0;
  for (int i = 0; i < 8; i++) {
    r <<= 1;
    r |= b & 1;
    b >>= 1;
  }
  return r;
}

void acordar() {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  for (int i = 0; i < 16; i++) SPI.transfer(0x55);
  for (int i = 0; i < 3; i++) SPI.transfer(0x00);
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  delay(1000);
}

void enviarVersao() {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(ESCREVER));
  for (uint8_t b : VERSAO) SPI.transfer(inverter(b));
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
}

int estadoCru = -1;

bool pronto() {
  delay(20); // o Prismo marca esta espera como necessária
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(LER_ESTADO));
  const uint8_t cru = SPI.transfer(0x00);
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  estadoCru = cru;
  return inverter(cru) == 0x01;
}

void lerResposta(int quantos) {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(LER_DADOS));
  bool achou = false;
  for (int i = 0; i < quantos; i++) {
    const uint8_t b = inverter(SPI.transfer(0x00));
    Serial.printf("%02X ", b);
    if (b == 0x32) achou = true;
  }
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  Serial.println(achou ? "  <<< 0x32: é o PN532 >>>" : "");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_spi — protocolo do Prismo (rajada 0x55, bits invertidos à mão)");
  Serial.printf("#DIAG SCK=%d MISO=%d MOSI=%d CS=%d | switches em SPI\n", PINO_SCK, PINO_MISO, PINO_MOSI, PINO_CS);
  pinMode(PINO_CS, OUTPUT);
  digitalWrite(PINO_CS, HIGH);
  SPI.begin(PINO_SCK, PINO_MISO, PINO_MOSI, PINO_CS);
  acordar();
}

// O PN532 responde em dois tempos: primeiro o ACK (00 00 FF 00 FF 00), e só
// depois o quadro com o dado. São duas leituras, cada uma esperando o próprio
// "pronto" — ler tudo de uma vez traz o ACK seguido de lixo, que foi o que
// aconteceu na primeira tentativa desta bancada.
void loop() {
  enviarVersao();

  bool veioAck = false;
  for (int i = 0; i < 25 && !veioAck; i++) veioAck = pronto();
  if (!veioAck) {
    Serial.printf("#DIAG sem ACK (estado cru 0x%02X)\n", estadoCru);
    delay(1500);
    acordar();
    return;
  }
  Serial.print("#DIAG ACK:      ");
  lerResposta(6);

  bool veioResposta = false;
  for (int i = 0; i < 25 && !veioResposta; i++) veioResposta = pronto();
  if (!veioResposta) {
    Serial.println("#DIAG ACK veio, resposta não");
    delay(1500);
    return;
  }
  Serial.print("#DIAG resposta: ");
  lerResposta(14);
  delay(2000);
}
