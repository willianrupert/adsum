// Como o UID vira texto na porta serial. Sem Arduino aqui: roda no Mac nos
// testes (`teste/teste.cpp`), que é onde se confere que sai o MESMO texto que
// o dongle digita.
#pragma once
#include <stddef.h>
#include <stdint.h>

/**
 * 4 bytes: decimal de 10 dígitos com zeros à esquerda, big-endian — o que o
 * dongle imprime (medido em 10/09/2026: `37 70 f2 13` → `0930148883`).
 * Os zeros importam: `src/nucleo/digitacao.ts` decide hexadecimal por
 * comprimento (8, 14, 20), e um decimal de 8 dígitos seria lido como hex.
 *
 * 7 e 10 bytes: hexadecimal minúsculo, sem separador (14 e 20 caracteres).
 * Não se sabe o que o dongle imprime para esses; o decodificador do app
 * aceita este formato, e é isso que importa.
 *
 * `saida` precisa de 21 bytes. Devolve o comprimento, ou 0 para um tamanho
 * de UID que não existe (e a linha fica vazia — nunca se adivinha).
 */
inline size_t uid_para_linha(const uint8_t* uid, size_t n, char* saida) {
  if (n == 4) {
    uint32_t v = ((uint32_t)uid[0] << 24) | ((uint32_t)uid[1] << 16) |
                 ((uint32_t)uid[2] << 8) | (uint32_t)uid[3];
    for (int i = 9; i >= 0; i--) {
      saida[i] = (char)('0' + v % 10);
      v /= 10;
    }
    saida[10] = '\0';
    return 10;
  }
  if (n == 7 || n == 10) {
    static const char digitos[] = "0123456789abcdef";
    for (size_t i = 0; i < n; i++) {
      saida[i * 2] = digitos[uid[i] >> 4];
      saida[i * 2 + 1] = digitos[uid[i] & 0x0f];
    }
    saida[n * 2] = '\0';
    return n * 2;
  }
  saida[0] = '\0';
  return 0;
}
