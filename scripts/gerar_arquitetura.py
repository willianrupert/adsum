#!/usr/bin/env python3
"""
As camadas, desenhadas.

Portas e adaptadores existe aqui por um motivo concreto: **o leitor vai mudar**.
Começou num aparelho que morreu, hoje é um dongle USB, e o celular Android já
está adiantado. O desenho é o que permitiu trocar o mundo inteiro embaixo do
domínio sem tocar numa regra.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SUPER = 3
L, A = 1400, 604
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


CAMADAS = [
    ('ui/', 'as telas', ['Fluxo', 'TelaAula', 'TelaVinculo', 'TelaResumo', '…'], False),
    ('portas/', 'os contratos', ['LeitorDeCracha', 'Repositorio'], True),
    ('nucleo/', 'domínio puro — sem React, sem Dexie',
     ['uid', 'hash', 'sessao', 'grade', 'rota', 'csv', 'cofre', 'pendencias'], False),
    ('adaptadores/', 'o mundo, trocável',
     ['LeitorTeclado', 'LeitorWebNfc', 'LeitorSimulado', 'RepositorioDexie'], False),
]


def desenhar() -> Image.Image:
    img = Image.new('RGB', (L * SUPER, A * SUPER), 'white')
    d = ImageDraw.Draw(img)

    titulo_f = fonte('Arial Bold.ttf', 19)
    apoio_f = fonte('Arial.ttf', 13)
    peca_f = fonte('Courier New.ttf', 14)

    x, larg = 90, L - 180
    y = 88
    alt = 96

    for nome, apoio, pecas, destacada in CAMADAS:
        cor = AZUL if destacada else CINZA
        tinta = 'white' if destacada else TINTA
        apoio_cor = (200, 224, 255) if destacada else FRACA

        d.rounded_rectangle([x * SUPER, y * SUPER, (x + larg) * SUPER, (y + alt) * SUPER],
                            radius=16 * SUPER, fill=cor,
                            outline=None if destacada else BORDA, width=SUPER)
        d.text(((x + 26) * SUPER, (y + 30) * SUPER), nome, font=titulo_f, fill=tinta, anchor='lm')
        d.text(((x + 26) * SUPER, (y + 58) * SUPER), apoio, font=apoio_f, fill=apoio_cor, anchor='lm')

        px = x + 320
        for peca in pecas:
            caixa = d.textbbox((0, 0), peca, font=peca_f)
            w = (caixa[2] - caixa[0]) / SUPER + 26
            d.rounded_rectangle([px * SUPER, (y + 32) * SUPER, (px + w) * SUPER, (y + 64) * SUPER],
                                radius=9 * SUPER,
                                fill='white' if not destacada else (255, 255, 255),
                                outline=BORDA if not destacada else None, width=SUPER)
            d.text(((px + w / 2) * SUPER, (y + 48) * SUPER), peca, font=peca_f,
                   fill=AZUL if destacada else TINTA, anchor='mm')
            px += w + 10

        y += alt + 24

    d.text((L / 2 * SUPER, 40 * SUPER), 'Portas e adaptadores — porque o leitor vai mudar',
           font=fonte('Arial Bold.ttf', 21), fill=TINTA, anchor='mm')

    rodape = ('A ui conhece as portas, nunca as implementações.  '
              'O núcleo não conhece ninguém: sem React, sem banco, sem navegador.')
    d.text((L / 2 * SUPER, (A - 26) * SUPER), rodape, font=fonte('Arial.ttf', 13),
           fill=FRACA, anchor='mm')

    return img.resize((L, A), Image.LANCZOS)


if __name__ == '__main__':
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else 'arquitetura.png')
    desenhar().save(destino)
    print('arquitetura em', destino)
