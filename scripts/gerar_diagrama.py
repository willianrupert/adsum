#!/usr/bin/env python3
"""
O caminho do crachá até o registro — a figura que carrega o argumento inteiro.

Desenhada, e não capturada: a regra do repositório público vale aqui também.
Os números são os do código (`nucleo/hash.ts`), não ilustrativos.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SUPER = 3
L, A = 1400, 348
AZUL = (0, 113, 227)
TINTA = (29, 29, 31)
FRACA = (110, 110, 115)
CAIXA = (245, 245, 247)

FONTES = '/System/Library/Fonts/Supplemental/'


def fonte(nome: str, tamanho: int):
    for caminho in (FONTES + nome, '/Library/Fonts/' + nome):
        try:
            return ImageFont.truetype(caminho, tamanho * SUPER)
        except OSError:
            continue
    return ImageFont.load_default()


def desenhar() -> Image.Image:
    img = Image.new('RGB', (L * SUPER, A * SUPER), 'white')
    d = ImageDraw.Draw(img)

    negrito = fonte('Arial Bold.ttf', 17)
    normal = fonte('Arial.ttf', 14)
    mono = fonte('Courier New.ttf', 15)
    nota = fonte('Arial.ttf', 12)

    passos = [
        ('O crachá', ['04 a2 3b 91'], 'UID público, lido na\nanticolisão. 4, 7 ou 10 bytes.'),
        ('+ o sal', ['16 bytes'], 'Sorteado uma vez, nesta\ninstalação. Nunca aparece.'),
        ('SHA-256', ['resumo'], 'Função de mão única:\nnão se volta dela.'),
        ('uid_hash', ['309940e1', '45b847cf'], 'Os 8 primeiros bytes.\nÉ isto que fica gravado.'),
    ]

    larg, alt = 260, 132
    espaco = (L - larg * len(passos)) // (len(passos) + 1)
    topo = 96

    for i, (titulo, linhas, apoio) in enumerate(passos):
        x = espaco + i * (larg + espaco)
        cor = AZUL if i == len(passos) - 1 else CAIXA
        tinta_cx = 'white' if i == len(passos) - 1 else TINTA

        d.rounded_rectangle(
            [x * SUPER, topo * SUPER, (x + larg) * SUPER, (topo + alt) * SUPER],
            radius=16 * SUPER,
            fill=cor,
        )
        d.text(((x + larg / 2) * SUPER, (topo + 26) * SUPER), titulo,
               font=negrito, fill=tinta_cx, anchor='mm')
        for j, linha in enumerate(linhas):
            d.text(((x + larg / 2) * SUPER, (topo + 62 + j * 24) * SUPER), linha,
                   font=mono, fill=tinta_cx, anchor='mm')

        d.multiline_text(((x + larg / 2) * SUPER, (topo + alt + 22) * SUPER), apoio,
                         font=nota, fill=FRACA, anchor='ma', align='center', spacing=6 * SUPER)

        if i < len(passos) - 1:
            meio = topo + alt / 2
            ini, fim = x + larg + 16, x + larg + espaco - 16
            d.line([ini * SUPER, meio * SUPER, fim * SUPER, meio * SUPER],
                   fill=FRACA, width=2 * SUPER)
            d.polygon([
                (fim * SUPER, meio * SUPER),
                ((fim - 9) * SUPER, (meio - 5) * SUPER),
                ((fim - 9) * SUPER, (meio + 5) * SUPER),
            ], fill=FRACA)

    d.text((L / 2 * SUPER, 40 * SUPER),
           'O que acontece quando um crachá encosta',
           font=fonte('Arial Bold.ttf', 21), fill=TINTA, anchor='mm')

    # Tinta cheia, e não vermelho: isto é a garantia do desenho, não um erro.
    # Vermelho aqui faria o leitor procurar o que deu errado.
    aviso = 'O UID não é guardado em lugar nenhum. Sem o sal, o uid_hash não volta a ser um crachá.'
    d.text((L / 2 * SUPER, (A - 30) * SUPER), aviso, font=fonte('Arial Bold.ttf', 14),
           fill=TINTA, anchor='mm')

    return img.resize((L, A), Image.LANCZOS)


if __name__ == '__main__':
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else 'diagrama-cracha.png')
    desenhar().save(destino)
    print('diagrama em', destino)
