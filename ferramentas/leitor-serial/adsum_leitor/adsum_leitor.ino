// Leitor Adsum por Web Serial: ESP32-C3 SuperMini + PN532 (HSU) + 1 LED verde.
// Alternativa ao dongle que digita. Mesmo UID, canal diferente: uma linha
// por leitura pela porta serial USB nativa, sem depender de foco de janela
// nem de ritmo de digitação.
//
// Só o UID público (InListPassiveTarget). Nunca se autentica setor.
//
// Protocolo (uma linha por mensagem, terminada em \n):
//   leitor -> app   0930148883         UID, no mesmo formato do dongle
//   leitor -> app   #HB pn532=ok       sinal de vida, 1 por segundo
//   leitor -> app   #ADSUM-LEITOR 1    ao ligar
//   app -> leitor   OK                 "gravado": o LED verde pisca uma vez
// Linhas que começam com # são do leitor, nunca um UID.
//
// Compilar: arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc adsum_leitor
// (CDCOnBoot=cdc é o que põe `Serial` na porta USB nativa do C3.)

#include <Arduino.h>
#include "formato.h"
#include "pn532.h"

// Ligação. PN532 TXD -> PINO_RX, PN532 RXD -> PINO_TX (os fios se cruzam).
// 20 e 21 são a UART padrão do C3 e ficam longe dos pinos de boot (2, 8, 9).
constexpr int PINO_RX = 20;
constexpr int PINO_TX = 21;
constexpr int PINO_LED = 3;  // LED verde, com resistor de 330 ohms em série

constexpr uint32_t INTERVALO_LEITURA_MS = 60;
constexpr uint32_t INTERVALO_VIDA_MS = 1000;
constexpr uint32_t LED_ACESO_MS = 150;
// Quantas leituras seguidas sem cartão até considerar que ele saiu do campo.
// Sem isso, o mesmo crachá encostado seria lido de novo a cada 60 ms.
constexpr uint8_t FALTAS_PARA_SAIR = 3;
constexpr uint8_t FALHAS_PARA_ERRO = 5;
// Só para testar na bancada sem o app: pisca ao ler, em vez de ao gravar.
constexpr bool LED_NA_LEITURA = false;

bool pn532Ok = false;
uint8_t falhasSeguidas = 0;
uint8_t faltas = FALTAS_PARA_SAIR;
uint8_t ultimoUid[10];
uint8_t ultimoTam = 0;
uint32_t proximaLeitura = 0, proximaVida = 0, proximaTentativa = 0, ledAte = 0;
char linhaDoApp[24];
uint8_t tamLinha = 0;

// Lê um quadro inteiro (ACK ou resposta) ou devolve 0 no tempo esgotado.
size_t lerQuadro(uint8_t* buf, size_t max, uint32_t tempoMs) {
  size_t n = 0, total = 0;
  const uint32_t inicio = millis();
  while (millis() - inicio < tempoMs) {
    if (!Serial1.available()) continue;
    const uint8_t b = (uint8_t)Serial1.read();
    if (n == 0 && b != 0x00) continue;  // ruído antes do preâmbulo
    if (n >= max) return 0;
    buf[n++] = b;
    if (total == 0) total = pn532_tamanho_quadro(buf, n);
    if (total != 0 && n >= total) return n;
  }
  return 0;
}

// Manda um comando e devolve o tamanho da resposta em `resp`, ou 0 se falhou.
size_t comandoPn532(const uint8_t* dados, size_t n, uint8_t* resp, size_t max, uint32_t tempoMs) {
  uint8_t quadro[32];
  const size_t tam = pn532_montar(quadro, dados, n);
  while (Serial1.available()) Serial1.read();
  Serial1.write(quadro, tam);
  uint8_t ack[8];
  const size_t na = lerQuadro(ack, sizeof ack, 100);
  if (na == 0 || !pn532_e_ack(ack, na)) return 0;
  return lerQuadro(resp, max, tempoMs);
}

bool iniciarPn532() {
  // Acorda o módulo (HSU exige) e confere que é um PN532 de verdade.
  static const uint8_t acordar[] = {0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  Serial1.write(acordar, sizeof acordar);
  delay(50);
  uint8_t resp[32];
  static const uint8_t versao[] = {0x02};
  size_t n = comandoPn532(versao, sizeof versao, resp, sizeof resp, 200);
  if (n < 9 || resp[5] != 0xD5 || resp[6] != 0x03) return false;
  // SAMConfiguration: modo normal, é o que liga o campo de RF para ler.
  static const uint8_t sam[] = {0x14, 0x01, 0x14, 0x01};
  n = comandoPn532(sam, sizeof sam, resp, sizeof resp, 200);
  if (n == 0 || resp[6] != 0x15) return false;
  // Poucas tentativas por consulta: a leitura devolve "sem cartão" rápido em
  // vez de travar esperando, e o laço decide quando perguntar de novo.
  static const uint8_t tentativas[] = {0x32, 0x05, 0xFF, 0x01, 0x02};
  n = comandoPn532(tentativas, sizeof tentativas, resp, sizeof resp, 200);
  return n != 0;
}

// -1 falha de comunicação, 0 sem cartão, >0 tamanho do UID.
int lerUid(uint8_t* uid) {
  static const uint8_t lista[] = {0x4A, 0x01, 0x00};
  uint8_t resp[48];
  const size_t n = comandoPn532(lista, sizeof lista, resp, sizeof resp, 150);
  if (n == 0) return -1;
  return pn532_extrair_uid(resp, n, uid);
}

void piscar() { ledAte = millis() + LED_ACESO_MS; }

void enviarUid(const uint8_t* uid, uint8_t tam) {
  char linha[21];
  if (uid_para_linha(uid, tam, linha) == 0) return;  // tamanho que não existe
  Serial.println(linha);
  if (LED_NA_LEITURA) piscar();
}

void tratarLinhaDoApp() {
  linhaDoApp[tamLinha] = '\0';
  if (strcmp(linhaDoApp, "OK") == 0) piscar();
  tamLinha = 0;
}

void setup() {
  pinMode(PINO_LED, OUTPUT);
  digitalWrite(PINO_LED, LOW);
  Serial.begin(115200);
  // Sem ninguém com a porta aberta, escrever no USB nativo bloquearia o laço
  // (e a leitura do crachá junto). Melhor perder a linha do que travar.
  Serial.setTxTimeoutMs(0);
  Serial1.begin(115200, SERIAL_8N1, PINO_RX, PINO_TX);
  delay(300);  // o PN532 leva um instante para ligar
  pn532Ok = iniciarPn532();
  Serial.println("#ADSUM-LEITOR 1");
  if (pn532Ok) piscar();
}

void loop() {
  const uint32_t agora = millis();

  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n') tratarLinhaDoApp();
    else if (c != '\r' && tamLinha < sizeof linhaDoApp - 1) linhaDoApp[tamLinha++] = c;
  }

  if ((int32_t)(agora - proximaVida) >= 0) {
    proximaVida = agora + INTERVALO_VIDA_MS;
    Serial.println(pn532Ok ? "#HB pn532=ok" : "#HB pn532=erro");
  }

  if (!pn532Ok) {
    // Tenta de novo a cada 2 s: cabo solto ou módulo que demorou a ligar.
    if ((int32_t)(agora - proximaTentativa) >= 0) {
      proximaTentativa = agora + 2000;
      pn532Ok = iniciarPn532();
      falhasSeguidas = 0;
    }
  } else if ((int32_t)(agora - proximaLeitura) >= 0) {
    proximaLeitura = agora + INTERVALO_LEITURA_MS;
    uint8_t uid[10];
    const int tam = lerUid(uid);
    if (tam < 0) {
      if (++falhasSeguidas >= FALHAS_PARA_ERRO) pn532Ok = false;
    } else {
      falhasSeguidas = 0;
      if (tam == 0) {
        if (faltas < FALTAS_PARA_SAIR) faltas++;
        if (faltas >= FALTAS_PARA_SAIR) ultimoTam = 0;
      } else {
        const bool mesmo = ultimoTam == tam && memcmp(ultimoUid, uid, tam) == 0;
        faltas = 0;
        if (!mesmo) {
          memcpy(ultimoUid, uid, tam);
          ultimoTam = (uint8_t)tam;
          enviarUid(uid, (uint8_t)tam);
        }
      }
    }
  }

  digitalWrite(PINO_LED, (int32_t)(ledAte - millis()) > 0 ? HIGH : LOW);
}
