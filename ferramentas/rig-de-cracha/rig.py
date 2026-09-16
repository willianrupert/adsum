#!/usr/bin/env python3
# Rig de teste do Adsum — controla o ESP32-S3 gravado com adsum_rig.ino pela
# porta serial. Não toca no navegador: colar a turma no Adsum e ligar
# "Chamar nomes" continua manual, porque isso depende do navegador, que este
# script sozinho não controla.
#
# Uso:
#   python3 rig.py gerar-turma --n 200 --seed 1 > turma.txt
#       Gera texto no formato que o Adsum espera colar em "Cole sua turma".
#       Cole esse texto manualmente e ligue "Chamar nomes" antes de disparar.
#
#   python3 rig.py ping
#       Confere que a placa responde.
#
#   python3 rig.py set --n 200
#       Configura N crachás virtuais (índices 0..N-1) com UIDs e matizes
#       distintos, dentro do formato de 4 bytes que o Adsum aceita.
#
#   python3 rig.py disparar --n 200 --min-ms 500 --max-ms 500
#       Dispara os crachás 0..N-1 em sequência, com intervalo aleatório
#       entre min-ms e max-ms entre cada um (mesmo valor nos dois = fixo).
#
# O UID de cada crachá configurado por --n é 1700000000 + índice*3 — bem
# longe dos dois UIDs medidos do dongle real (0930148883, 2367396804,
# documentados em nucleo/digitacao.ts do Adsum_web), pra nunca colidir com
# um crachá físico de verdade que já esteja vinculado na base.

import argparse
import glob
import random
import subprocess
import sys
import time

import serial

BASE_UID = 1700000000


def app_em_primeiro_plano() -> str:
    """Pergunta ao macOS qual app está em foco AGORA — não dá pra confiar em
    confirmação verbal nem em qual janela o operador está "olhando": o rig
    manda tecla pro que o sistema operacional considera frontmost, e isso já
    discordou da percepção humana pelo menos uma vez (disparo de 15/09/2026,
    ~20:00, foco ficou no Claude Code mesmo com confirmação e tela dividida)."""
    try:
        r = subprocess.run(
            ["osascript", "-e",
             'tell application "System Events" to get name of first application process whose frontmost is true'],
            capture_output=True, text=True, timeout=2,
        )
        return r.stdout.strip()
    except Exception:
        return "?"


def exigir_foco(app_esperado: str):
    atual = app_em_primeiro_plano()
    if atual != app_esperado:
        sys.exit(
            f"Foco errado: em primeiro plano está '{atual}', esperava '{app_esperado}'. "
            "Clique na janela do Chrome com o Adsum e rode de novo."
        )

PRIMEIROS = [
    "Ana", "Bruno", "Carla", "Daniel", "Elisa", "Fabio", "Gabriela", "Hugo",
    "Iara", "Joao", "Karina", "Lucas", "Marcia", "Nelson", "Olivia", "Pedro",
    "Quezia", "Rafael", "Sandra", "Tiago", "Ursula", "Vitor", "Wanda",
    "Xavier", "Yasmin", "Zeca", "Alice", "Breno", "Camila", "Diego",
    "Eduarda", "Felipe", "Giovana", "Heitor", "Ines", "Julio", "Kelly",
    "Leandro", "Melissa", "Nicolas", "Otavio", "Paula", "Renato", "Silvia",
    "Thiago", "Ubirajara", "Valeria", "Wagner", "Ximena", "Yago", "Adriana",
    "Bento", "Cecilia", "Douglas", "Elena", "Flavio", "Gustavo", "Helena",
    "Igor", "Julia",
]

SOBRENOMES = [
    "Almeida", "Barros", "Cardoso", "Duarte", "Escobar", "Fagundes",
    "Guimaraes", "Henriques", "Itaborai", "Junqueira", "Klein", "Lacerda",
    "Macedo", "Nogueira", "Oliveira", "Pontes", "Quintela", "Ramalho",
    "Siqueira", "Tenorio", "Uchoa", "Vilanova", "Wanderley", "Xavier",
    "Yamada", "Zambon", "Aragao", "Brandao", "Cavalcanti", "Delgado",
    "Escorcio", "Ferraz", "Goulart", "Holanda", "Ibiapina", "Jatoba",
    "Krause", "Leitao", "Madureira", "Nascimento", "Osorio",
]


def porta_serial() -> str:
    candidatas = glob.glob("/dev/cu.usbmodem*")
    if not candidatas:
        sys.exit("Nenhuma porta /dev/cu.usbmodem* encontrada. A placa está conectada?")
    if len(candidatas) == 1:
        return candidatas[0]
    # Duas portas: a de gravação/JTAG também fala serial (é ela quem
    # responde ao esptool), mas não roda o firmware — só a nativa entende
    # PING. Em vez de adivinhar pelo nome (que muda de formato conforme o
    # macOS enumera), testa cada uma de verdade.
    for candidata in candidatas:
        try:
            s = serial.Serial(candidata, 115200, timeout=0.5)
            time.sleep(0.2)
            s.reset_input_buffer()
            s.write(b"PING\n")
            time.sleep(0.2)
            resp = s.read(50)
            s.close()
            if b"PONG" in resp:
                return candidata
        except Exception:
            continue
    sys.exit(f"Nenhuma das portas respondeu PONG: {candidatas} — confira se o firmware está rodando.")


def abrir(porta: str) -> serial.Serial:
    s = serial.Serial(porta, 115200, timeout=1)
    time.sleep(0.3)
    return s


def comando(s: serial.Serial, linha: str) -> bytes:
    s.reset_input_buffer()
    s.write((linha + "\n").encode())
    fim = time.time() + 1
    buf = b""
    while time.time() < fim:
        n = s.in_waiting
        if n:
            buf += s.read(n)
            if b"\n" in buf:
                break
        time.sleep(0.01)
    return buf


def cmd_ping(args):
    s = abrir(args.porta or porta_serial())
    resp = comando(s, "PING")
    print("PONG recebido" if b"PONG" in resp else f"sem resposta: {resp!r}")
    s.close()


def cmd_set(args):
    s = abrir(args.porta or porta_serial())
    ok, erro = 0, 0
    for i in range(args.n):
        uid = BASE_UID + i * 3
        matiz = int(i * 360 / args.n) % 360
        resp = comando(s, f"SET {i} {uid} {matiz}")
        if b"OK" in resp:
            ok += 1
        else:
            erro += 1
            print(f"falhou indice {i}: {resp!r}", flush=True)
    print(f"configurados: {ok} ok, {erro} erro", flush=True)
    s.close()


def cmd_disparar(args):
    exigir_foco(args.app)
    s = abrir(args.porta or porta_serial())
    ok, erro = 0, 0
    inicio = time.time()
    for i in range(args.n):
        atual = app_em_primeiro_plano()
        if atual != args.app:
            print(
                f"PARANDO no crachá {i}: foco saiu de '{args.app}' para '{atual}'. "
                f"{ok} disparados até aqui, resto abortado.",
                flush=True,
            )
            break
        resp = comando(s, f"CARD {i}")
        if b"OK" in resp:
            ok += 1
        else:
            erro += 1
            print(f"falhou indice {i}: {resp!r}", flush=True)
        if (i + 1) % 20 == 0:
            print(f"{i + 1}/{args.n} disparados ({ok} ok, {erro} erro) em {time.time() - inicio:.0f}s", flush=True)
        if i < args.n - 1:
            time.sleep(random.uniform(args.min_ms, args.max_ms) / 1000)
    print(f"FIM: {ok} ok, {erro} erro, {time.time() - inicio:.0f}s total", flush=True)
    s.close()


def cmd_humano(args):
    """Digita devagar, de propósito — prova que digitação humana continua
    sendo ignorada mesmo com o rig de verdade."""
    s = abrir(args.porta or porta_serial())
    resp = comando(s, f"HUMAN {args.texto} {args.ms}")
    print("OK" if b"OK" in resp else f"falhou: {resp!r}")
    s.close()


def gerar_pessoas(n: int, seed: int):
    random.seed(seed)
    usados = set()
    pessoas = []
    while len(pessoas) < n:
        p = random.choice(PRIMEIROS)
        m = random.choice(SOBRENOMES)
        sn = random.choice(SOBRENOMES)
        while sn == m:
            sn = random.choice(SOBRENOMES)
        nome = f"{p} {m} {sn}"
        if nome in usados:
            continue
        usados.add(nome)
        pessoas.append((p, m, sn))
    return pessoas


def cmd_gerar_turma(args):
    pessoas = gerar_pessoas(args.n, args.seed)
    blocos = []
    for i, (p, m, sn) in enumerate(pessoas):
        nome_completo = f"{p} {m} {sn}".upper()
        matricula = 20990000000 + args.seed * 10000 + i
        usuario = f"{p.lower()}.{sn.lower()}{i}"
        blocos.append(
            f"\tUsuário Off-Line no SIGAA {nome_completo}  (Perfil)\n"
            f"Curso: CIÊNCIA DA COMPUTAÇÃO/CIN\n"
            f"Matrícula: {matricula}\n"
            f"Usuário: {usuario}\n"
            f"E-mail: {usuario}@exemplo.edu\tEnviar Mensagem"
        )
    pares = []
    for i in range(0, len(blocos), 2):
        if i + 1 < len(blocos):
            pares.append(blocos[i] + "\t\t" + blocos[i + 1])
        else:
            pares.append(blocos[i])

    texto = (
        "Docentes (1)\n"
        "\tUsuário Off-Line no SIGAA HELENA MOURA BARROS QUINTELA\n"
        "Departamento: CENTRO DE INFORMÁTICA - CIN\n"
        "Formação: DOUTORADO\n"
        "Usuário: helena.quintela\n"
        "E-Mail: helena.quintela@exemplo.edu\n"
        "Enviar Mensagem\n\n"
        f"Discentes ({args.n})\n" + "\n".join(pares)
    )
    print(texto)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--porta", help="Porta serial (ex: /dev/cu.usbmodem14...). Detecta sozinho se omitido.")
    sub = p.add_subparsers(dest="comando", required=True)

    sub.add_parser("ping").set_defaults(func=cmd_ping)

    sp = sub.add_parser("set", help="Configura N crachás virtuais no rig.")
    sp.add_argument("--n", type=int, default=200)
    sp.set_defaults(func=cmd_set)

    sp = sub.add_parser("disparar", help="Dispara os crachás 0..N-1 em sequência.")
    sp.add_argument("--n", type=int, default=200)
    sp.add_argument("--min-ms", type=float, default=800)
    sp.add_argument("--max-ms", type=float, default=1200)
    sp.add_argument("--app", default="Google Chrome",
                     help="Nome do app que precisa estar em primeiro plano (checado antes de cada crachá).")
    sp.set_defaults(func=cmd_disparar)

    sp = sub.add_parser("humano", help="Digita devagar (não deve virar leitura).")
    sp.add_argument("--texto", required=True)
    sp.add_argument("--ms", type=float, default=150, help="ms entre teclas")
    sp.set_defaults(func=cmd_humano)

    sp = sub.add_parser("gerar-turma", help="Gera texto fictício pra colar em 'Cole sua turma'.")
    sp.add_argument("--n", type=int, default=200)
    sp.add_argument("--seed", type=int, default=1, help="Muda o seed pra gerar gente diferente a cada leva.")
    sp.set_defaults(func=cmd_gerar_turma)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
