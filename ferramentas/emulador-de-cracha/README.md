# Emulador de crachá — ESP32-C3 SuperMini + PN532

O rig de HID (`ferramentas/rig-de-cracha`) entra no meio do caminho: digita o
que o dongle digitaria. Este entra no começo — vira um crachá no campo de
rádio, e o dongle faz o trabalho dele inteiro. É o último pedaço do caminho
real que nenhum teste cobre.

Fala **o mesmo protocolo serial do rig de HID**, de propósito: a suíte de
testes físicos (`ambiente/rigDeCracha.ts`) comanda os dois sem saber a
diferença. `PING`, `SET <indice> <uid> <matiz>`, `CARD <indice> [ms]`,
`LED`, `HUMAN` (aceito e ignorado — não existe "aproximar devagar").

## Ligação (a mesma do leitor serial, em SPI)

| PN532 (conector de 8 pinos, switches em SPI) | ESP32-C3 SuperMini |
| --- | --- |
| SCK | GPIO 4 |
| MISO | GPIO 5 |
| MOSI | GPIO 6 |
| SS | GPIO 7 |
| VCC | 3V3 |
| GND | GND |

LED verde no GPIO 3 com 330 Ω para o GND: pulsa devagar quando ocioso, fica
aceso com crachá no ar, pisca três vezes se o alvo for selecionado.

## Estado em 22/09/2026, com honestidade

**Funcionou duas vezes e depois parou de reproduzir.** O `diag_emular`
(`../leitor-serial/diag_emular`) pôs dois alvos no ar e o dongle leu os dois:
`08 01 02 01` saiu como `0016908552` e `08 01 02 02` como `0033685768` —
os mesmos bytes na ordem inversa, como acontece com crachá de verdade. Depois
disso, nem o firmware novo nem o próprio `diag_emular` conseguiram repetir,
com a antena na mesma posição.

Então o caminho **existe** (está provado que o dongle lê alvo emulado), mas
ainda não é confiável. O que ficou por investigar, em ordem:

1. **Estado do PN532** depois de muitas rodadas de modo alvo: desligar e
   religar tudo antes de concluir qualquer coisa.
2. **Alimentação**: emitir resposta de rádio puxa mais corrente que responder
   comando. Vale testar com 5 V no VCC.
3. **Ritmo da consulta de estado**: perguntar a cada poucos ms mantém o chip
   ocupado no SPI enquanto ele deveria cuidar do rádio. O firmware já espaça
   em ~50 ms, mas isso não foi validado com leitura de verdade.
4. **Descanso do dongle**: se ele tem modo de economia depois de tempo parado,
   o teste precisa acordá-lo antes.

## Limites que não são bug

- **O primeiro byte do UID é sempre `0x08`.** O firmware do PN532 mascara,
  como contramedida contra clonagem. Dá para emular *um* crachá, nunca
  *aquele* crachá. Para o Adsum tanto faz: ele aceita qualquer UID de 4 bytes.
- **A ordem dos bytes sai invertida no dongle**, medido com crachá real e com
  emulado. O `SET` recebe na ordem do dongle e inverte aqui.
- **`TgInitAsTarget` não retorna quando o dongle lê**: ele faz só a
  anticolisão e vai embora, sem completar a seleção. Por isso `CARD` responde
  `OK no ar` mesmo quando a leitura acontece — quem confirma é o dongle
  digitando, não o PN532.

## Compilar e gravar

```bash
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc adsum_emulador
arduino-cli upload  --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc -p /dev/cu.usbmodem* adsum_emulador
```
