// Rig de teste do Adsum: crachá simulado por USB HID, controlado por
// comando serial, com um LED endereçável indicando quem "encostou" agora.
//
// As duas portas USB-C do ESP32-S3 fazem papéis diferentes de propósito:
// a da ponte serial (gravação de sempre) é o canal de comando — é por ela
// que chegam as instruções de teste, uma por linha, texto puro; a nativa
// (USB-OTG) é o teclado HID que o computador — e o Adsum, dentro do
// navegador — enxerga exatamente como o dongle de verdade. É por isso que
// dá pra testar sem dublê: nenhuma parte do app sabe que quem está do outro
// lado é uma placa, não o leitor.
//
// Configuração da placa (Arduino IDE, ou os mesmos nomes no arduino-cli):
//   USB Mode: "USB-OTG (TinyUSB)"       — sem isto, HID não existe
//   USB CDC On Boot: "Enabled"          — Serial (CDC) e o teclado (HID) saem
//                                          juntos, pela mesma porta nativa —
//                                          esta placa não tem chip ponte
//                                          separado, então não há onde mais
//                                          o Serial apareceria
//   Upload Mode: "UART0 / Hardware CDC" — grava pela outra porta (a do
//                                          periférico USB-Serial/JTAG do
//                                          próprio chip, só ativo durante a
//                                          gravação — depois que o app sobe,
//                                          essa porta some, e é esperado
//
// Protocolo, uma linha por comando, resposta OK/ERR depois de cada um:
//   PING                          -> PONG
//   SET <indice> <uid> <matiz>    -- define um crachá virtual (matiz 0-359)
//   CARD <indice>                 -- dispara a rajada daquele crachá
//   RAW <uid> [matiz]             -- rajada de um UID avulso, fora da lista
//   HUMAN <texto> <ms>            -- digita devagar, de propósito (não deve virar leitura)
//   WAIT <ms>
//
// Ritmo de digitação: o medido do dongle de verdade, documentado em
// nucleo/digitacao.ts do Adsum_web (10/09/2026, cinco rajadas do mesmo
// crachá) — 16, 32, 17, 17, 17 ms entre caracteres.

#include <Arduino.h>

#ifndef ARDUINO_USB_MODE
#error "Esta placa não tem USB nativo — precisa de um ESP32-S3 (ou S2)."
#elif ARDUINO_USB_MODE == 1
#error "USB Mode está em 'Hardware CDC and JTAG'. Troque para 'USB-OTG (TinyUSB)' antes de gravar."
#else

#include <Adafruit_NeoPixel.h>
#include "USB.h"
#include "USBHIDKeyboard.h"

USBHIDKeyboard teclado;

// A maioria dos devkits ESP32-S3 tem o LED endereçável embutido no GPIO 48.
// Se o seu for diferente, é só trocar aqui.
#define PINO_LED 48
Adafruit_NeoPixel led(1, PINO_LED, NEO_GRB + NEO_KHZ800);

const uint8_t RITMO_MS[] = {16, 32, 17, 17, 17};
const uint8_t QTD_RITMO = sizeof(RITMO_MS);

#define MAX_CRACHAS 256
#define TAM_UID 16

struct Cracha {
  char uid[TAM_UID];
  uint16_t matiz;
  bool definido;
};
Cracha crachas[MAX_CRACHAS];

uint16_t matizAtual = 0;

// --- LED: sobe rápido, segura, desce suave. Nada de strobo — é pra
// acompanhar com o olho quem encostou agora, não decifrar dígito nenhum
// (16-32ms por caractere é rápido demais pra isso).
void acender(uint16_t matiz) {
  matizAtual = matiz;
  uint32_t hue16 = (uint32_t)matiz * 65535UL / 360;
  for (int b = 0; b <= 255; b += 17) {
    led.setPixelColor(0, led.gamma32(led.ColorHSV(hue16, 255, b)));
    led.show();
    delay(2);
  }
}

void apagar() {
  uint32_t hue16 = (uint32_t)matizAtual * 65535UL / 360;
  for (int b = 255; b >= 0; b -= 10) {
    led.setPixelColor(0, led.gamma32(led.ColorHSV(hue16, 255, max(b, 0))));
    led.show();
    delay(3);
  }
  led.clear();
  led.show();
}

// --- A rajada em si: mesmo ritmo medido do dongle real, Enter no fim.
void digitarRajada(const char *uid) {
  size_t n = strlen(uid);
  for (size_t i = 0; i < n; i++) {
    teclado.write((uint8_t)uid[i]);
    if (i < n - 1) delay(RITMO_MS[i % QTD_RITMO]);
  }
  delay(20);
  teclado.write(KEY_RETURN);
}

// --- Comandos ---

void cmdSet(String resto) {
  int e1 = resto.indexOf(' ');
  int e2 = resto.indexOf(' ', e1 + 1);
  if (e1 < 0 || e2 < 0) {
    Serial.println("ERR uso: SET <indice> <uid> <matiz>");
    return;
  }
  int idx = resto.substring(0, e1).toInt();
  String uid = resto.substring(e1 + 1, e2);
  int matiz = resto.substring(e2 + 1).toInt();
  if (idx < 0 || idx >= MAX_CRACHAS) {
    Serial.println("ERR indice fora do intervalo");
    return;
  }
  if (uid.length() >= TAM_UID) {
    Serial.println("ERR uid longo demais");
    return;
  }
  uid.toCharArray(crachas[idx].uid, TAM_UID);
  crachas[idx].matiz = ((matiz % 360) + 360) % 360;
  crachas[idx].definido = true;
  Serial.println("OK");
}

void cmdCard(String resto) {
  int idx = resto.toInt();
  if (idx < 0 || idx >= MAX_CRACHAS || !crachas[idx].definido) {
    Serial.println("ERR cracha nao definido — use SET antes");
    return;
  }
  acender(crachas[idx].matiz);
  digitarRajada(crachas[idx].uid);
  apagar();
  Serial.println("OK");
}

void cmdRaw(String resto) {
  int espaco = resto.indexOf(' ');
  String uid = espaco < 0 ? resto : resto.substring(0, espaco);
  int matiz = espaco < 0 ? 200 : resto.substring(espaco + 1).toInt();
  if (uid.length() == 0 || uid.length() >= TAM_UID) {
    Serial.println("ERR uid invalido");
    return;
  }
  acender(((matiz % 360) + 360) % 360);
  digitarRajada(uid.c_str());
  apagar();
  Serial.println("OK");
}

void cmdHuman(String resto) {
  int e1 = resto.lastIndexOf(' ');
  if (e1 < 0) {
    Serial.println("ERR uso: HUMAN <texto> <ms>");
    return;
  }
  String texto = resto.substring(0, e1);
  int ms = resto.substring(e1 + 1).toInt();
  // Branco fraco e constante — sinal visual de "isto é ensaio de digitação
  // humana", diferente do aceso cheio de um crachá.
  led.setPixelColor(0, led.Color(20, 20, 20));
  led.show();
  for (size_t i = 0; i < texto.length(); i++) {
    teclado.write((uint8_t)texto[i]);
    delay(ms);
  }
  teclado.write(KEY_RETURN);
  led.clear();
  led.show();
  Serial.println("OK");
}

void cmdWait(String resto) {
  delay(resto.toInt());
  Serial.println("OK");
}

void processar(String linha) {
  linha.trim();
  if (linha.length() == 0) return;

  int espaco = linha.indexOf(' ');
  String cmd = espaco < 0 ? linha : linha.substring(0, espaco);
  String resto = espaco < 0 ? "" : linha.substring(espaco + 1);

  if (cmd == "PING") {
    Serial.println("PONG");
  } else if (cmd == "SET") {
    cmdSet(resto);
  } else if (cmd == "CARD") {
    cmdCard(resto);
  } else if (cmd == "RAW") {
    cmdRaw(resto);
  } else if (cmd == "HUMAN") {
    cmdHuman(resto);
  } else if (cmd == "WAIT") {
    cmdWait(resto);
  } else {
    Serial.println("ERR comando desconhecido: " + cmd);
  }
}

void setup() {
  Serial.begin(115200);
  led.begin();
  led.setBrightness(255);
  led.clear();
  led.show();

  teclado.begin();
  USB.begin();

  Serial.println("PRONTO adsum-rig-de-crachas");
}

void loop() {
  static String linha;
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      processar(linha);
      linha = "";
    } else if (c != '\r') {
      linha += c;
    }
  }
}

#endif /* ARDUINO_USB_MODE */
