// Bancada: o PN532 fingindo ser um crachá, para o dongle ler.
//
// Se der certo, é o gerador de turma que falta: uma fila de "alunos"
// chegando no dongle de verdade, com o ritmo que se quiser — inclusive os
// casos que a mão humana não reproduz (dois crachás em 50 ms, o mesmo crachá
// dez vezes, 300 pessoas em sequência).
//
// **O limite conhecido, dito antes do teste:** o firmware do PN532 mascara o
// primeiro byte do UID com `0x08` no modo alvo, como contramedida contra
// clonagem. Então dá para emular *um* crachá, nunca *aquele* crachá. Para o
// Adsum tanto faz, que aceita qualquer UID de 4 bytes; para dizer "reproduzi
// o crachá do CIn", não serve.
//
// O comando é o `TgInitAsTarget` (D4 8C), que fica **bloqueado** até um leitor
// selecionar o alvo — é por isso que o laço aqui tem espera longa e o
// resultado interessante é justamente ele voltar. Voltou: algum leitor
// encostou e nos selecionou.
//
// Protocolo de SPI igual ao do `diag_spi` (ver o README): rajada de 0x55 para
// acordar, bits invertidos à mão, ACK e resposta em separado.

#include <Arduino.h>
#include <SPI.h>

static const int PINO_SCK = 4, PINO_MISO = 5, PINO_MOSI = 6, PINO_CS = 7;
/** LED verde: aceso enquanto o alvo está no ar, pisca rápido quando um leitor
    seleciona o alvo — dá para acompanhar a bancada sem olhar o monitor. */
static const int PINO_LED = 3;
static const uint8_t ESCREVER = 0x01, LER_ESTADO = 0x02, LER_DADOS = 0x03;

SPISettings ajustes(1000000, MSBFIRST, SPI_MODE0);

/** Os três bytes configuráveis do UID. O primeiro, `0x08`, é do firmware. */
uint8_t uidDoAluno[3] = {0x01, 0x02, 0x03};
int aluno = 0;

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
  delay(300);
}

/** Monta `00 00 FF LEN LCS <dados> DCS 00` e manda. */
void enviarComando(const uint8_t* dados, size_t n) {
  uint8_t soma = 0;
  for (size_t i = 0; i < n; i++) soma += dados[i];
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(ESCREVER));
  const uint8_t cabecalho[] = {0x00, 0x00, 0xFF, (uint8_t)n, (uint8_t)(~n + 1)};
  for (uint8_t b : cabecalho) SPI.transfer(inverter(b));
  for (size_t i = 0; i < n; i++) SPI.transfer(inverter(dados[i]));
  SPI.transfer(inverter((uint8_t)(~soma + 1)));
  SPI.transfer(inverter(0x00));
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
}

bool pronto() {
  delay(20);
  SPI.beginTransaction(ajustes);
  digitalWrite(PINO_CS, LOW);
  delay(2);
  SPI.transfer(inverter(LER_ESTADO));
  const uint8_t cru = SPI.transfer(0x00);
  delay(2);
  digitalWrite(PINO_CS, HIGH);
  SPI.endTransaction();
  return inverter(cru) == 0x01;
}

bool esperar(int tentativas) {
  for (int i = 0; i < tentativas; i++) if (pronto()) return true;
  return false;
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

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("#DIAG diag_emular — o PN532 vira crachá; encoste o dongle nele");
  pinMode(PINO_LED, OUTPUT);
  digitalWrite(PINO_LED, LOW);
  pinMode(PINO_CS, OUTPUT);
  digitalWrite(PINO_CS, HIGH);
  SPI.begin(PINO_SCK, PINO_MISO, PINO_MOSI, PINO_CS);
  acordar();

  // Versão, só para confirmar que o módulo está conversando.
  const uint8_t versao[] = {0xD4, 0x02};
  uint8_t r[32];
  enviarComando(versao, sizeof versao);
  if (esperar(25)) {
    lerQuadro(r, 6);
    if (esperar(25)) {
      lerQuadro(r, 14);
      Serial.printf("#DIAG PN532 firmware %d.%d\n", r[8], r[9]);
    }
  }
}

void loop() {
  // Um "aluno" por rodada: três bytes de UID que mudam a cada tentativa.
  uidDoAluno[2] = (uint8_t)(++aluno);

  const uint8_t comando[] = {
    0xD4, 0x8C,
    0x05,                                        // passivo, só PICC
    0x04, 0x00,                                  // SENS_RES (ATQA) de Mifare
    uidDoAluno[0], uidDoAluno[1], uidDoAluno[2], // NFCID1t: 3 bytes (o 1º sai 0x08)
    0x08,                                        // SEL_RES (SAK) de Mifare Classic 1K
    // FeliCaParams: 18 bytes, sem uso aqui
    0x01, 0xFE, 0x0F, 0xBB, 0xBA, 0xA6, 0xC9, 0x89, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0xFF,
    // NFCID3t: 10 bytes
    0x01, 0xFE, 0x0F, 0xBB, 0xBA, 0xA6, 0xC9, 0x89, 0x00, 0x00,
    0x00,  // LENGb: sem general bytes
    0x00,  // LENk: sem historical bytes
  };

  Serial.printf("\n#DIAG alvo %d: UID 08 %02X %02X %02X — aproxime o dongle (15 s)\n", aluno,
                uidDoAluno[0], uidDoAluno[1], uidDoAluno[2]);
  enviarComando(comando, sizeof comando);
  digitalWrite(PINO_LED, HIGH); // alvo no ar, esperando leitor

  if (!esperar(25)) {
    digitalWrite(PINO_LED, LOW);
    Serial.println("#DIAG nem o ACK voltou — o comando não foi aceito");
    acordar();
    return;
  }
  uint8_t ack[6];
  lerQuadro(ack, 6);

  // Daqui em diante o PN532 fica esperando um leitor. Cada `pronto()` custa
  // ~25 ms, então 600 tentativas dão uns 15 s de espera.
  if (!esperar(600)) {
    digitalWrite(PINO_LED, LOW);
    Serial.println("#DIAG ninguém selecionou o alvo nesta rodada");
    // Sai do modo alvo para a próxima rodada começar limpa.
    acordar();
    return;
  }

  uint8_t r[32] = {0};
  lerQuadro(r, 20);
  Serial.print("#DIAG >>> UM LEITOR SELECIONOU O ALVO <<< resposta: ");
  for (int i = 0; i < 12; i++) Serial.printf("%02X ", r[i]);
  Serial.println();
  for (int i = 0; i < 6; i++) { // pisca: fomos selecionados
    digitalWrite(PINO_LED, LOW);
    delay(60);
    digitalWrite(PINO_LED, HIGH);
    delay(60);
  }
  digitalWrite(PINO_LED, LOW);
  // r[7] é o modo em que fomos ativados; r[8] em diante, o primeiro comando
  // que o leitor mandou, se mandou algum.
  delay(500);
  acordar();
}
