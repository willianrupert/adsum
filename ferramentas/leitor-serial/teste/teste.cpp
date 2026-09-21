// g++ -std=c++17 -I../adsum_leitor teste.cpp -o /tmp/teste_leitor && /tmp/teste_leitor
#include <cstdio>
#include <cstring>
#include <initializer_list>
#include "formato.h"
#include "pn532.h"

static int falhas = 0;
#define CONFERE(cond, msg) do { if (!(cond)) { std::printf("FALHOU: %s\n", msg); falhas++; } } while (0)

static void linha_de(std::initializer_list<uint8_t> uid, const char* esperado) {
  uint8_t b[10]; size_t n = 0;
  for (auto x : uid) b[n++] = x;
  char saida[21];
  uid_para_linha(b, n, saida);
  if (std::strcmp(saida, esperado) != 0) {
    std::printf("FALHOU: esperado %s, saiu %s\n", esperado, saida);
    falhas++;
  }
}

// Resposta de InListPassiveTarget com 1 alvo, montada à mão com a soma certa.
static size_t resposta(uint8_t* q, const uint8_t* uid, uint8_t tam, bool dcs_certo) {
  uint8_t d[20]; size_t n = 0;
  d[n++] = 0xD5; d[n++] = 0x4B; d[n++] = 0x01; d[n++] = 0x01;
  d[n++] = 0x00; d[n++] = 0x04; d[n++] = 0x08; d[n++] = tam;
  for (uint8_t i = 0; i < tam; i++) d[n++] = uid[i];
  uint8_t soma = 0; for (size_t i = 0; i < n; i++) soma += d[i];
  size_t i = 0;
  q[i++] = 0; q[i++] = 0; q[i++] = 0xFF;
  q[i++] = (uint8_t)n; q[i++] = (uint8_t)(0x100 - n);
  for (size_t k = 0; k < n; k++) q[i++] = d[k];
  q[i++] = (uint8_t)((0x100 - soma) + (dcs_certo ? 0 : 1)); q[i++] = 0;
  return i;
}

int main() {
  // Os dois UIDs medidos com o dongle de verdade em 10/09/2026.
  linha_de({0x37, 0x70, 0xf2, 0x13}, "0930148883");
  linha_de({0x8d, 0x1b, 0x9b, 0xc4}, "2367396804");
  linha_de({0x00, 0x00, 0x00, 0x2a}, "0000000042");  // zeros à esquerda
  linha_de({0x04, 0xa2, 0x24, 0x8a, 0x12, 0x34, 0x56}, "04a2248a123456");
  char s[21];
  uint8_t cinco[5] = {1, 2, 3, 4, 5};
  CONFERE(uid_para_linha(cinco, 5, s) == 0 && s[0] == '\0', "tamanho 5 não existe");

  // Quadro conhecido da SAMConfiguration (constante clássica do Adafruit).
  const uint8_t sam[] = {0x14, 0x01, 0x14, 0x01};
  const uint8_t esperado[] = {0x00, 0x00, 0xFF, 0x05, 0xFB, 0xD4, 0x14, 0x01, 0x14, 0x01, 0x02, 0x00};
  uint8_t q[40];
  size_t m = pn532_montar(q, sam, sizeof sam);
  CONFERE(m == sizeof esperado && std::memcmp(q, esperado, m) == 0, "quadro SAMConfiguration");

  const uint8_t ack[] = {0, 0, 0xFF, 0, 0xFF, 0};
  CONFERE(pn532_e_ack(ack, 6) && pn532_tamanho_quadro(ack, 6) == 6, "ACK");

  const uint8_t uid[4] = {0x37, 0x70, 0xf2, 0x13};
  uint8_t r[40], saida[10];
  size_t nr = resposta(r, uid, 4, true);
  CONFERE(pn532_tamanho_quadro(r, 5) == nr, "tamanho anunciado do quadro");
  CONFERE(pn532_extrair_uid(r, nr, saida) == 4 && std::memcmp(saida, uid, 4) == 0, "extrai UID de 4 bytes");
  CONFERE(pn532_extrair_uid(r, nr - 1, saida) == -1, "quadro truncado");
  nr = resposta(r, uid, 4, false);
  CONFERE(pn532_extrair_uid(r, nr, saida) == -1, "soma errada é recusada");

  const uint8_t uid7[7] = {0x04, 0xa2, 0x24, 0x8a, 0x12, 0x34, 0x56};
  nr = resposta(r, uid7, 7, true);
  CONFERE(pn532_extrair_uid(r, nr, saida) == 7 && std::memcmp(saida, uid7, 7) == 0, "extrai UID de 7 bytes");

  // Nenhum alvo no campo: D5 4B 00.
  const uint8_t vazio[] = {0, 0, 0xFF, 0x03, 0xFD, 0xD5, 0x4B, 0x00, 0xE0, 0x00};
  CONFERE(pn532_extrair_uid(vazio, sizeof vazio, saida) == 0, "sem cartão devolve 0");

  std::printf(falhas ? "%d falha(s)\n" : "tudo certo\n", falhas);
  return falhas ? 1 : 0;
}
