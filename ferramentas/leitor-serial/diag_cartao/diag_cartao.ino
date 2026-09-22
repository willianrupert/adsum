// Bancada: ler o UID de um crachá pelo PN532 em SPI.
//
// Segue o mesmo protocolo do `diag_spi` (rajada de 0x55 para acordar, bits
// invertidos à mão, ACK e resposta lidos em separado), e acrescenta os dois
// comandos que faltam para ler cartão:
//
//   SAMConfiguration (D4 14 01 14 01) — põe o chip no modo normal de leitura;
//   InListPassiveTarget (D4 4A 01 00) — procura um alvo ISO14443A e devolve
//   ATQA, SAK e o UID.
//
// O UID sai em hexadecimal e também no decimal de 10 dígitos que o dongle
// digita, para dar para comparar os dois caminhos com o mesmo crachá:
// `37 70 f2 13` tem que virar `0930148883`.
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
// SAMConfiguration: modo normal, sem timeout, sem IRQ.
static const uint8_t SAM[] = {0x00, 0x00, 0xFF, 0x05, 0xFB, 0xD4, 0x14, 0x01, 0x14, 0x01, 0x02, 0x00};
// InListPassiveTarget: um alvo, 106 kbps tipo A.
static const uint8_t PROCURAR[] = {0x00, 0x00, 0xFF, 0x04, 0xFC, 0xD4, 0x4A, 0x01, 0x00, 0xE1, 0x00};

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


void enviar(const uint8_t* quadro, size_t tamanho) {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(ESCREVER));
  for (size_t i = 0; i < tamanho; i++) SPI.transfer(inverter(quadro[i]));
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
}

int lerQuadro(uint8_t* destino, int quantos) {
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(LER_DADOS));
  for (int i = 0; i < quantos; i++) destino[i] = inverter(SPI.transfer(0x00));
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  return quantos;
}

bool esperar() {
  for (int i = 0; i < 30; i++) if (pronto()) return true;
  return false;
}

/** Manda um comando e engole o ACK; devolve o quadro de resposta. */
int perguntar(const uint8_t* quadro, size_t tamanho, uint8_t* resposta, int quantos) {
  enviar(quadro, tamanho);
  if (!esperar()) return 0;
  uint8_t ack[6];
  lerQuadro(ack, 6);
  if (!esperar()) return 0;
  return lerQuadro(resposta, quantos);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_cartao — encoste um crachá no PN532");
  pinMode(PINO_CS, OUTPUT);
  digitalWrite(PINO_CS, HIGH);
  SPI.begin(PINO_SCK, PINO_MISO, PINO_MOSI, PINO_CS);
  acordar();

  uint8_t resposta[24];
  if (perguntar(VERSAO, sizeof VERSAO, resposta, 14) && resposta[7] == 0x32) {
    Serial.printf("#DIAG PN532 firmware %d.%d\n", resposta[8], resposta[9]);
  } else {
    Serial.println("#DIAG o módulo não respondeu à versão — confira fios e switches");
  }
  if (perguntar(SAM, sizeof SAM, resposta, 12)) Serial.println("#DIAG modo de leitura configurado");
}

void loop() {
  uint8_t r[32] = {0};
  const int lidos = perguntar(PROCURAR, sizeof PROCURAR, r, 26);
  // 00 00 FF LEN LCS D5 4B <alvos> <n> <ATQA1 ATQA2> <SAK> <tamanho do UID> <UID...>
  if (lidos && r[5] == 0xD5 && r[6] == 0x4B && r[7] >= 1) {
    const int tamanhoUid = r[12];
    Serial.printf("#CARTAO uid=");
    uint32_t valor = 0;
    for (int i = 0; i < tamanhoUid; i++) {
      Serial.printf("%02x ", r[13 + i]);
      valor = (valor << 8) | r[13 + i];
    }
    Serial.printf("| ATQA=%02X%02X SAK=%02X", r[9], r[10], r[11]);
    if (tamanhoUid == 4) Serial.printf(" | decimal do dongle: %010u", valor);
    Serial.println();
    delay(1200);
  }
  delay(200);
}
