// Quadros do PN532 em HSU (UART). Puro, sem Arduino: os testes rodam no Mac.
// Só se lê o UID público (InListPassiveTarget). Nunca se autentica setor.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

/** Quadro do host para o PN532: 00 00 FF LEN LCS D4 <dados> DCS 00. */
inline size_t pn532_montar(uint8_t* saida, const uint8_t* dados, size_t n) {
  const uint8_t len = (uint8_t)(n + 1);  // TFI + dados
  uint8_t soma = 0xD4;
  size_t i = 0;
  saida[i++] = 0x00;
  saida[i++] = 0x00;
  saida[i++] = 0xFF;
  saida[i++] = len;
  saida[i++] = (uint8_t)(0x100 - len);
  saida[i++] = 0xD4;
  for (size_t k = 0; k < n; k++) {
    saida[i++] = dados[k];
    soma = (uint8_t)(soma + dados[k]);
  }
  saida[i++] = (uint8_t)(0x100 - soma);
  saida[i++] = 0x00;
  return i;
}

/**
 * Tamanho total do quadro que começa em `b`, ou 0 se ainda não dá para saber
 * (menos de 5 bytes) ou se não começa como quadro. ACK tem 6 bytes; os demais,
 * LEN + 7.
 */
inline size_t pn532_tamanho_quadro(const uint8_t* b, size_t n) {
  if (n < 5) return 0;
  if (b[0] != 0x00 || b[1] != 0x00 || b[2] != 0xFF) return 0;
  if (b[3] == 0x00 && b[4] == 0xFF) return 6;
  return (size_t)b[3] + 7;
}

inline bool pn532_e_ack(const uint8_t* b, size_t n) {
  static const uint8_t ack[6] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
  return n >= 6 && memcmp(b, ack, 6) == 0;
}

/**
 * Lê a resposta de InListPassiveTarget (D5 4B). Devolve o tamanho do UID
 * copiado para `uid` (até 10 bytes), 0 se não há cartão no campo, ou -1 se o
 * quadro é inválido (soma errada, comando errado, truncado).
 */
inline int pn532_extrair_uid(const uint8_t* b, size_t n, uint8_t* uid) {
  const size_t total = pn532_tamanho_quadro(b, n);
  if (total == 0 || n < total) return -1;
  const uint8_t len = b[3];
  if ((uint8_t)(b[3] + b[4]) != 0) return -1;  // LEN + LCS
  const uint8_t* d = b + 5;
  uint8_t soma = 0;
  for (size_t i = 0; i < len; i++) soma = (uint8_t)(soma + d[i]);
  if ((uint8_t)(soma + d[len]) != 0) return -1;  // dados + DCS
  if (len < 3 || d[0] != 0xD5 || d[1] != 0x4B) return -1;
  if (d[2] == 0) return 0;                        // nenhum alvo
  if (len < 8) return -1;                         // Tg, ATQA(2), SAK, NFCIDLen
  const uint8_t tam = d[7];
  if (tam == 0 || tam > 10 || (size_t)(8 + tam) > len) return -1;
  memcpy(uid, d + 8, tam);
  return tam;
}
