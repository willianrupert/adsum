#!/usr/bin/env python3
"""
Gera o ícone do Adsum a partir da **mesma geometria** de `ui/componentes/Simbolos.tsx`.

Versiona-se o desenho, não a captura — mesma disciplina do manual. Se as ondas
mudarem na tela, mudam aqui rodando o script, e o ícone nunca fica sendo outro
símbolo que ninguém lembra de onde veio.

    python3 scripts/gerar_icone.py

O ícone antigo era do Adsum A1: tinha a moldura da tela de 480×272 do aparelho
que não existe mais, e um "A" verde. Desenhar o hardware morto no ícone do app
era a herança mais visível que restava.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Medidos no símbolo de referência. Ver o comentário de `Ondas` em Simbolos.tsx:
# a abertura **diminui** conforme o raio cresce, e é isso que dá a leitura de
# onda em vez de leque.
ARCOS = [(58.7, 45.25), (102.9, 37.85), (149.6, 34.8), (196.3, 33.3)]
TRACO = 20.2

# Azul da ação, o mesmo de `--acao`. O gradiente é de meio tom só: ícone da
# Apple tem profundidade, não brilho.
TOPO = (10, 132, 255)
BASE = (0, 98, 200)
MARCA = (255, 255, 255)

RAIZ = Path(__file__).resolve().parent.parent / 'public'
SUPER = 4  # supersampling: o PIL não antisserrilha traço, então desenha grande.


def caixa() -> tuple[float, float, float, float]:
    """Envolvente do traço, e não dos centros — o cap redondo conta."""
    meia = TRACO / 2
    esq = min(r * math.cos(math.radians(a)) for r, a in ARCOS) - meia
    dir = max(r for r, _ in ARCOS) + meia
    alt = max(r * math.sin(math.radians(a)) for r, a in ARCOS) + meia
    return esq, dir, -alt, alt


def desenhar(tela: int, altura_da_marca: float, raio_do_canto: float | None) -> Image.Image:
    lado = tela * SUPER
    esq, dir, cima, baixo = caixa()
    escala = (altura_da_marca * lado) / (baixo - cima)

    # Fundo: gradiente vertical, uma linha de cada vez. Barato e exato.
    fundo = Image.new('RGB', (1, lado))
    pintor = ImageDraw.Draw(fundo)
    for y in range(lado):
        t = y / (lado - 1)
        pintor.point((0, y), tuple(round(TOPO[i] + (BASE[i] - TOPO[i]) * t) for i in range(3)))
    img = fundo.resize((lado, lado)).convert('RGBA')

    # A marca é mais alta que larga; centralizar pela envolvente, não pelo
    # centro dos arcos, senão ela encosta na borda direita.
    cx = lado / 2 - ((esq + dir) / 2) * escala
    cy = lado / 2
    traco = TRACO * escala

    tinta = ImageDraw.Draw(img)
    for raio, meia_abertura in ARCOS:
        r = raio * escala
        # O PIL cresce a espessura **para dentro** da envolvente. Sem somar meia
        # espessura ao raio, a linha de centro fica em r − traco/2 e os caps
        # redondos aparecem deslocados — o desenho ganha dentes nas pontas.
        fora = r + traco / 2
        tinta.arc(
            [cx - fora, cy - fora, cx + fora, cy + fora],
            -meia_abertura,
            meia_abertura,
            fill=MARCA,
            width=round(traco),
        )
        # O PIL não tem cap redondo. As pontas são dois círculos, e sem eles o
        # arco termina em corte reto — que é justamente o que distingue este
        # símbolo do de wi-fi.
        px = cx + r * math.cos(math.radians(meia_abertura))
        for py in (cy - r * math.sin(math.radians(meia_abertura)),
                   cy + r * math.sin(math.radians(meia_abertura))):
            tinta.ellipse(
                [px - traco / 2, py - traco / 2, px + traco / 2, py + traco / 2], fill=MARCA
            )

    if raio_do_canto is not None:
        mascara = Image.new('L', (lado, lado), 0)
        ImageDraw.Draw(mascara).rounded_rectangle(
            [0, 0, lado - 1, lado - 1], radius=round(raio_do_canto * lado), fill=255
        )
        img.putalpha(mascara)

    return img.resize((tela, tela), Image.LANCZOS)


def svg(altura_da_marca: float, raio_do_canto: float) -> str:
    lado = 512
    esq, dir, cima, baixo = caixa()
    escala = (altura_da_marca * lado) / (baixo - cima)
    cx = lado / 2 - ((esq + dir) / 2) * escala
    traco = TRACO * escala

    caminhos = []
    for raio, meia_abertura in ARCOS:
        r = raio * escala
        x = r * math.cos(math.radians(meia_abertura))
        y = r * math.sin(math.radians(meia_abertura))
        caminhos.append(
            f'    <path d="M {x:.1f} {-y:.1f} A {r:.1f} {r:.1f} 0 0 1 {x:.1f} {y:.1f}"/>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado} {lado}" width="{lado}" height="{lado}">
  <!-- Gerado por scripts/gerar_icone.py — a geometria é a de Ondas, medida. -->
  <defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb{TOPO}"/>
      <stop offset="1" stop-color="rgb{BASE}"/>
    </linearGradient>
  </defs>
  <rect width="{lado}" height="{lado}" rx="{raio_do_canto * lado:.0f}" fill="url(#ceu)"/>
  <g transform="translate({cx:.1f} {lado / 2:.1f})" fill="none" stroke="rgb{MARCA}"
     stroke-width="{traco:.1f}" stroke-linecap="round">
{chr(10).join(caminhos)}
  </g>
</svg>
'''


# Quanto da altura a marca ocupa. Generoso de propósito: com 0,45 os quatro
# arcos viram quatro fios cinzentos numa aba de 16 px. O maskable é menor
# porque o Android corta os cantos e pode recortar em círculo.
CHEIA = 0.62
MASCARAVEL = 0.50
CANTO = 0.2246  # proporção do ícone da Apple: 115,2 de 512.

if __name__ == '__main__':
    (RAIZ / 'icone.svg').write_text(svg(CHEIA, CANTO), encoding='utf-8')
    desenhar(192, CHEIA, CANTO).save(RAIZ / 'icone-192.png')
    desenhar(512, CHEIA, CANTO).save(RAIZ / 'icone-512.png')
    desenhar(512, MASCARAVEL, None).save(RAIZ / 'icone-512-maskable.png')
    # Sem canto arredondado: o iOS e o macOS aplicam a máscara deles. Arredondar
    # aqui daria o canto duas vezes, e o ícone ficaria com sobra branca em volta.
    desenhar(180, CHEIA, None).save(RAIZ / 'apple-touch-icon.png')
    print('ícones gerados em', RAIZ)

    # `--provas` amplia os tamanhos de aba para olhar de perto. Medido em
    # 19/08/2026: a 32 px (retina, que é o caso real num Mac) os quatro arcos se
    # separam e a marca se lê; a 16 px físicos eles se fundem num borrão, e
    # nenhuma contagem de arcos salva — dois arcos leem, mas aí já é outro
    # símbolo. Fica o SVG, que o navegador desenha no tamanho que tiver.
    if '--provas' in sys.argv:
        for lado in (16, 32):
            desenhar(lado, CHEIA, CANTO).resize((320, 320), Image.NEAREST).save(
                RAIZ.parent / f'prova-{lado}.png'
            )
        print('provas em', RAIZ.parent)
