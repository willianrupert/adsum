# Leitor serial — ESP32-C3 SuperMini + PN532

Alternativa ao dongle que digita, pelo Web Serial. Mesmo UID, canal diferente:
sem depender de foco de janela nem do ritmo das teclas. **Ainda não foi
testado em hardware**: compila, e a lógica pura (quadros do PN532 e formato da
linha) passa nos testes de `teste/`. O adaptador do app (`LeitorSerial`) ainda
não existe.

## O que a bancada de 22/09/2026 estabeleceu

**O módulo só fala por SPI aqui, e com o protocolo do
[Prismo](https://github.com/nu31hackerspace/prismo)** — mesmo par de hardware
(C3 SuperMini + PN532), testado em placa real. HSU e I2C ficaram mudos em
todas as posições de switch, com o módulo comprovadamente alimentado. O que
destrava, e o que faltava em cada tentativa anterior:

1. **acordar com rajada**: CS em baixo, dezesseis `0x55` e três `0x00`, 2 ms
   de cada lado do CS — o pulso de CS sozinho não basta;
2. **inverter os bits de cada byte à mão**, em SPI MSB: o PN532 fala LSB
   primeiro, e pedir `LSBFIRST` ao periférico não produziu resposta;
3. **ler ACK e resposta em separado**, cada um esperando o próprio estado
   "pronto" (`0x01` depois de invertido) — ler os dois de uma vez traz o ACK
   seguido de lixo.

Ligação que funcionou: SCK=GPIO 4, MISO=5, MOSI=6, SS=7, VCC=3V3, no conector
de 8 pinos, com os switches em SPI. O `diag_spi` confirma o firmware (1.6) e o
`diag_cartao` lê o UID.

**A ordem dos bytes do PN532 é o inverso da do dongle.** Medido com o mesmo
crachá: o dongle digita `2367396804` (`8d 1b 9b c4`) e o PN532 devolve
`c4 9b 1b 8d`. Um leitor serial que entregasse o UID na ordem do PN532 geraria
outro `uid_hash` para o mesmo crachá, e a pessoa apareceria como desconhecida.
Quem for escrever o firmware definitivo inverte antes de mandar.

## Ligação

| PN532 (modo HSU, switches `0 0`) | ESP32-C3 SuperMini |
| --- | --- |
| VCC | 3V3 (se não responder, tente 5V — a placa tem regulador próprio) |
| GND | GND |
| TXD | GPIO 20 |
| RXD | GPIO 21 |

Os fios TXD/RXD **se cruzam**. O LED verde vai no GPIO 3, com resistor de
330 Ω em série, para o GND.

**O conector é o de 4 pinos** (GND, VCC, SDA, SCL na frente). Em HSU esses
dois últimos são TXD e RXD, e os rótulos estão **no verso da placa** — o
conector de 8 pinos ao lado é o do SPI e não serve aqui. Qual dos dois é o TXD
varia com a fabricação da placa: o `diag_uart4` testa os dois cruzamentos
sozinho.

## Quando o módulo não responde

Foi onde esta bancada parou. `diag_uart4` separa as causas na ordem certa,
começando pela que não precisa de nenhum byte: **um TX de UART em repouso fica
em nível alto**. Se os dois pinos estiverem em nível baixo, não é velocidade
nem cruzamento — é alimentação ou fio. Depois disso ele varre os dois
cruzamentos nas duas velocidades de fábrica (115200 e 9600) e ecoa em
hexadecimal o que chegar; `32` na resposta é a assinatura do PN532.

Se nada responder em nenhuma combinação, na ordem:

1. **Switches.** HSU costuma ser `0 0`, mas o silk de placa clone às vezes
   está invertido. São três combinações a testar, e é barato.
2. **5 V no VCC.** O módulo tem regulador e conversor de nível pensados para
   5 V; parte das placas clone não acorda com 3,3 V.
3. **Conector errado.** Ver acima: o de 4 pinos, nunca o do SPI.
4. **Pino de reset.** Em algumas placas o `RSTPDN` precisa estar em nível
   alto para o módulo sair do repouso.

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
