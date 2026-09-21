# Leitor serial — ESP32-C3 SuperMini + PN532

Alternativa ao dongle que digita, pelo Web Serial. Mesmo UID, canal diferente:
sem depender de foco de janela nem do ritmo das teclas. **Ainda não foi
testado em hardware**: compila, e a lógica pura (quadros do PN532 e formato da
linha) passa nos testes de `teste/`. O adaptador do app (`LeitorSerial`) ainda
não existe.

## Ligação

| PN532 (modo HSU, switches `0 0`) | ESP32-C3 SuperMini |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| TXD | GPIO 20 |
| RXD | GPIO 21 |

Os fios TXD/RXD **se cruzam**. O LED verde vai no GPIO 3, com resistor de
330 Ω em série, para o GND.

## Protocolo

Uma linha por mensagem, terminada em `\n`, a 115200.

- `0930148883`: um UID, no formato que o dongle digita (decimal de 10 dígitos
  para 4 bytes; hexadecimal de 14 ou 20 caracteres para 7 e 10 bytes).
- `#HB pn532=ok`: sinal de vida, 1 por segundo. `pn532=erro` se o módulo não
  responde. Linhas com `#` são do leitor, nunca um UID.
- `#ADSUM-LEITOR 1`: ao ligar.
- O app responde `OK` depois de gravar, e o LED pisca uma vez.

## Compilar, gravar e testar

```bash
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc adsum_leitor
arduino-cli upload  --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc -p /dev/cu.usbmodem* adsum_leitor
g++ -std=c++17 -Wall -I adsum_leitor teste/teste.cpp -o /tmp/teste_leitor && /tmp/teste_leitor
```

`CDCOnBoot=cdc` é o que põe o `Serial` na porta USB nativa. Se a gravação não
conseguir entrar, segure BOOT, aperte e solte RESET, e tente de novo.

## O que conferir na primeira bancada

1. Abrir o monitor serial: deve aparecer `#ADSUM-LEITOR 1` e depois
   `#HB pn532=ok` a cada segundo. `pn532=erro` é fio trocado ou switches fora
   de `0 0`.
2. Encostar os crachás conhecidos: `37 70 f2 13` deve sair como `0930148883`
   e `8d 1b 9b c4` como `2367396804`. Se sair outro número, a ordem dos bytes
   não bate com o dongle e o `uid_hash` mudaria.
3. Digitar `OK` e Enter no monitor: o LED deve piscar.
4. Abrir a porta e ver se a placa **não reinicia** (risco conhecido do C3 com
   DTR/RTS; o Web Serial abre a porta do mesmo jeito).
