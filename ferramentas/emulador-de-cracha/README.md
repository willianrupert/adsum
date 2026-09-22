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
| RSTPDN (reset) | GPIO 10 |

O fio do `RSTPDN` é o que faz a fila funcionar: ver abaixo.

LED verde no GPIO 3 com 330 Ω para o GND: pulsa devagar quando ocioso, fica
aceso com crachá no ar, pisca três vezes se o alvo for selecionado.

## Estado em 22/09/2026: funciona, e o que faltava era uma linha

O dongle lê os crachás emulados. Provado com números: `SET` anuncia o número
que vai sair, e foi o que o dongle digitou (`0301101064`, `0317878280`).

**O que travou a bancada por horas foi a falta do `SAMConfiguration`.** O
PN532 precisa do modo normal configurado antes de entrar em modo alvo. As
duas primeiras emulações que funcionaram aconteceram por acidente: o sketch
anterior (`diag_cartao`) tinha mandado o `SAMConfiguration`, e **regravar o
ESP32 não reinicia o PN532** — o estado sobreviveu. Ao desligar a energia de
verdade, o estado se perdeu e nada mais funcionou, o que parecia
instabilidade de rádio e era configuração faltando.

Vale registrar o caminho errado que isso me fez seguir, para ninguém repetir:
cheguei a suspeitar de alimentação e a sugerir 5 V no VCC. Era hipótese ruim,
e o próprio dado desmentia — o módulo continuava respondendo à SPI antes e
depois de cada tentativa, e queda de alimentação derrubaria as duas coisas.

**O dongle ignora o mesmo crachá parado no campo** (observação do autor na
bancada): ele só lê de novo quando o cartão **sai** — e trocar o UID não
conta como sair. Numa fila de dez, com o dongle imóvel, ele leu sete; com
pausas maiores, leu um. O que fazia voltar a ler era o autor afastar o
dispositivo com a mão.

Três tentativas de produzir essa saída por software falharam, todas
registradas porque custaram tempo:

| Tentativa | Resultado |
| --- | --- |
| Sair do modo alvo com a rajada de acordar | dongle continua vendo cartão |
| Desligar o rádio (`RFConfiguration` 0x01 0x00) | idem |
| Dormir (`PowerDown`) | idem |

**A saída é por fio:** `RSTPDN` num GPIO (10), segurando em nível baixo por
~120 ms entre um aluno e outro. Desligado, o módulo não tem como responder ao
campo, que é o equivalente exato a tirar o crachá da mão. Depois do reset o
chip esquece a configuração, então o firmware manda `SAMConfiguration` de
novo — sem isso o modo alvo não funciona, que foi o que travou esta bancada
por horas.

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
