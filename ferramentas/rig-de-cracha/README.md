# Rig de teste — crachás simulados por USB HID

Nasceu de um pedido do autor depois do incidente de 15/09/2026 (ver
`docs/05_plano_execucao.md`): testar o Adsum sob carga real de teclado USB,
não só com `LeitorSimulado` (que nunca passa pelo caminho que quebrou).

## O que é

Um ESP32-S3 (a placa precisa ter o jumper "USB OTG" soldado — sem isso a
porta nativa não fala USB nenhum, só a de gravação) programado pra:

- Se apresentar como teclado USB de verdade (`USBHIDKeyboard`), digitando
  UIDs no mesmo formato e ritmo medidos do dongle real (16-32ms entre
  caracteres, documentado em `src/nucleo/digitacao.ts`).
- Acender um LED endereçável numa cor por "pessoa" (matiz 0-359), com rampa
  de subida/descida — nada de piscar por dígito, que a essa velocidade o
  olho não acompanha mesmo.
- Ser controlado por comando de texto pela porta serial (a de
  gravação/JTAG, separada da nativa) — uma linha, uma instrução.

## As duas portas USB-C

- **Nativa (USB-OTG, precisa do jumper soldado)**: o "teclado" — pluga na
  mesma máquina onde o Adsum está aberto.
- **Ponte/JTAG (a de sempre)**: canal de comando — é por ela que `rig.py`
  fala com a placa.

## Gravar o firmware

Arduino IDE ou `arduino-cli`, board `ESP32S3 Dev Module`, com:

- USB Mode: **USB-OTG (TinyUSB)**
- USB CDC On Boot: **Enabled**
- Upload Mode: **UART0 / Hardware CDC**

Grava pela porta de gravação/JTOG. Depois de rodar, o `Serial` (canal de
comando) e o teclado HID saem pela porta **nativa** — a de gravação só serve
pra isso, ROM bootloader.

```bash
arduino-cli compile --fqbn "esp32:esp32:esp32s3:USBMode=default,CDCOnBoot=cdc,UploadMode=default" adsum_rig
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn "esp32:esp32:esp32s3:USBMode=default,CDCOnBoot=cdc,UploadMode=default" adsum_rig
```

## Usar

```bash
pip install pyserial   # se ainda não tiver

# 1. Gerar uma turma fictícia e colar manualmente em "Cole sua turma" no Adsum
python3 rig.py gerar-turma --n 200 --seed 1 > turma.txt
# copie o conteúdo de turma.txt, cole no Adsum, dê Continuar

# 2. Abrir a chamada dessa turma, ligar "Chamar nomes" — manual, no navegador

# 3. Confirmar que a placa responde
python3 rig.py ping

# 4. Configurar N crachás virtuais (uma vez só, sobrevive a vários disparos)
python3 rig.py set --n 200

# 5. Disparar em sequência, com o intervalo que quiser
python3 rig.py disparar --n 200 --min-ms 500 --max-ms 500

# Extra: prova que digitação humana continua sendo ignorada
python3 rig.py humano --texto "04a23b91" --ms 150
```

## O que o script NÃO faz

Não toca no navegador — colar a turma, ligar "Chamar nomes", conferir o
resultado na tela, tudo isso é manual (ou feito por quem tiver acesso às
ferramentas de automação de navegador). O script cobre só o lado do ESP32.

## Cuidado com o foco

O rig é hardware de verdade: manda tecla pra **onde estiver em foco no
sistema operacional** no momento do disparo, sem saber nada sobre qual
janela é "a certa". Confirmação verbal não basta — já aconteceu de o foco
continuar numa janela errada mesmo com a tela dividida e a confirmação dada
(disparo de 15/09/2026: uma sequência de crachás foi digitada dentro do
Claude Code em vez do Chrome, porque o foco do sistema nunca tinha saído de
lá).

Por isso `rig.py disparar` **checa sozinho**, via `osascript`, qual app está
em primeiro plano — antes do primeiro crachá e de novo antes de cada um
seguinte — e para na hora se não for `Google Chrome` (`--app` muda o nome
esperado). Isso limita o estrago a no máximo um crachá digitado no lugar
errado, não a rajada inteira. Ainda assim, clique na janela do Chrome com o
Adsum antes de rodar — a checagem é uma rede de segurança, não substitui
isso.

## UIDs de teste

`rig.py set` usa `1700000000 + índice*3` — bem longe dos dois UIDs medidos
do dongle real (`0930148883`, `2367396804`, em `nucleo/digitacao.ts`), pra
nunca colidir por acidente com um crachá físico já vinculado numa base real.
