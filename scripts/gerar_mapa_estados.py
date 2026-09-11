#!/usr/bin/env python3
"""
Não há menu: a rota decide.

`decidirRota` (`nucleo/rota.ts`) é uma cascata de perguntas, na ordem em que
elas importam — cada uma só é feita depois que a anterior já foi respondida.
O professor nunca escolhe onde está; ele abre o app e já está no lugar certo.

Desenhada, e não capturada: mesma disciplina das outras figuras deste
diretório. As perguntas e a ordem são as do código, não ilustrativas.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SUPER = 3
L, A = 1400, 900
AZUL = (0, 113, 227)
TINTA = (29, 29, 31)
FRACA = (110, 110, 115)
CINZA = (245, 245, 247)
BORDA = (210, 210, 215)

FONTES = '/System/Library/Fonts/Supplemental/'


def fonte(nome: str, tamanho: int):
    for caminho in (FONTES + nome, '/Library/Fonts/' + nome):
        try:
            return ImageFont.truetype(caminho, tamanho * SUPER)
        except OSError:
            continue
    return ImageFont.load_default()


# (rota, pergunta, o que acontece se não passa)
CASCATA = [
    ('problema', 'o essencial existe, e o leitor está lendo?', 'sem isso, nada mais importa'),
    ('pasta', 'a base tem uma pasta de verdade para morar?', 'senão, o professor escolhe uma agora'),
    ('navegador', 'este navegador tem seletor de pasta?', 'Safari e Firefox precisam saber o risco'),
    ('turma', 'existe gente cadastrada?', 'senão, a tela é colar a lista do SIGAA'),
    ('cronograma', 'esta turma já tem horário?', 'aponta a semana, ou fica para depois'),
]


def caixa_arredondada(d, x, y, larg, alt, cor, contorno=None):
    d.rounded_rectangle(
        [x * SUPER, y * SUPER, (x + larg) * SUPER, (y + alt) * SUPER],
        radius=14 * SUPER, fill=cor, outline=contorno, width=SUPER if contorno else 0,
    )


def seta_baixo(d, x, y1, y2):
    d.line([x * SUPER, y1 * SUPER, x * SUPER, y2 * SUPER], fill=FRACA, width=2 * SUPER)
    d.polygon([
        (x * SUPER, y2 * SUPER),
        ((x - 5) * SUPER, (y2 - 9) * SUPER),
        ((x + 5) * SUPER, (y2 - 9) * SUPER),
    ], fill=FRACA)


def desenhar() -> Image.Image:
    img = Image.new('RGB', (L * SUPER, A * SUPER), 'white')
    d = ImageDraw.Draw(img)

    titulo_f = fonte('Arial Bold.ttf', 21)
    rota_f = fonte('Courier New.ttf', 18)
    pergunta_f = fonte('Arial.ttf', 15)
    apoio_f = fonte('Arial.ttf', 12)

    d.text((L / 2 * SUPER, 42 * SUPER), 'Não há menu: a rota decide',
           font=titulo_f, fill=TINTA, anchor='mm')
    d.text((L / 2 * SUPER, 70 * SUPER),
           'nucleo/rota.ts — cada pergunta só é feita depois que a anterior já foi respondida',
           font=apoio_f, fill=FRACA, anchor='mm')

    x, larg = 130, L - 260
    y = 104
    alt = 92

    for i, (rota, pergunta, apoio) in enumerate(CASCATA):
        caixa_arredondada(d, x, y, larg, alt, CINZA, BORDA)
        d.text(((x + 28) * SUPER, (y + 30) * SUPER), rota, font=rota_f, fill=AZUL, anchor='lm')
        d.text(((x + 28) * SUPER, (y + 62) * SUPER), pergunta, font=pergunta_f, fill=TINTA, anchor='lm')
        bbox = d.textbbox((0, 0), apoio, font=apoio_f)
        d.text(((x + larg - 28) * SUPER, (y + alt / 2) * SUPER), apoio,
               font=apoio_f, fill=FRACA, anchor='rm')

        if i < len(CASCATA) - 1:
            seta_baixo(d, x + larg / 2, y + alt + 4, y + alt + 26)
        y += alt + 30

    # A cascata termina num par, não numa caixa só: aula aberta e repouso são
    # o mesmo lugar, olhado de dois jeitos — por isso a seta vai e volta.
    seta_baixo(d, x + larg / 2, y - 4, y + 18)
    y += 26

    par_larg = (larg - 40) / 2
    caixa_arredondada(d, x, y, par_larg, 108, AZUL)
    d.text(((x + par_larg / 2) * SUPER, (y + 34) * SUPER), 'chamada',
           font=rota_f, fill='white', anchor='mm')
    d.multiline_text(((x + par_larg / 2) * SUPER, (y + 68) * SUPER),
                     'há aula aberta —\na fila, e o contador',
                     font=apoio_f, fill=(214, 233, 255), anchor='ma', align='center', spacing=5 * SUPER)

    x2 = x + par_larg + 40
    caixa_arredondada(d, x2, y, par_larg, 108, CINZA, BORDA)
    d.text(((x2 + par_larg / 2) * SUPER, (y + 34) * SUPER), 'pronto',
           font=rota_f, fill=TINTA, anchor='mm')
    d.multiline_text(((x2 + par_larg / 2) * SUPER, (y + 68) * SUPER),
                     'tudo vinculado —\nesperando o crachá',
                     font=apoio_f, fill=FRACA, anchor='ma', align='center', spacing=5 * SUPER)

    meio_y = y + 54
    seta_x1, seta_x2 = x + par_larg + 6, x2 - 6
    d.line([seta_x1 * SUPER, (meio_y - 10) * SUPER, seta_x2 * SUPER, (meio_y - 10) * SUPER],
           fill=FRACA, width=2 * SUPER)
    d.polygon([(seta_x2 * SUPER, (meio_y - 10) * SUPER),
               ((seta_x2 - 9) * SUPER, (meio_y - 15) * SUPER),
               ((seta_x2 - 9) * SUPER, (meio_y - 5) * SUPER)], fill=FRACA)
    d.line([seta_x2 * SUPER, (meio_y + 10) * SUPER, seta_x1 * SUPER, (meio_y + 10) * SUPER],
           fill=FRACA, width=2 * SUPER)
    d.polygon([(seta_x1 * SUPER, (meio_y + 10) * SUPER),
               ((seta_x1 + 9) * SUPER, (meio_y + 5) * SUPER),
               ((seta_x1 + 9) * SUPER, (meio_y + 15) * SUPER)], fill=FRACA)

    y += 108 + 36
    rodape = 'Com a grade preenchida, "pronto" vira "chamada" sozinho — nem clique, nem crachá.'
    d.text((L / 2 * SUPER, y * SUPER), rodape, font=fonte('Arial Bold.ttf', 14),
           fill=TINTA, anchor='mm')

    return img.resize((L, A), Image.LANCZOS)


if __name__ == '__main__':
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else 'mapa-estados.png')
    desenhar().save(destino)
    print('mapa de estados em', destino)
