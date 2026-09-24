#!/usr/bin/env python3
"""
As telas da janela do favorito, a partir do desenho — nunca de captura.

O desenho é `docs/esboco_sigaa/esboco.html`: um estado por `#`, com os
tokens do `estilo.css` e gente inventada. Este script abre cada estado no
Chrome sem janela, tira a foto em 2x e corta a sobra de fundo. Mudar uma tela
é mudar o HTML e rodar isto de novo; a imagem nunca é editada à mão.

Uso: python3 scripts/gerar_esboco_sigaa.py
"""

import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / 'docs' / 'esboco_sigaa'
DESENHO = PASTA / 'esboco.html'

# estado → largura da janela do Chrome sem janela. A altura sobra de
# propósito e é cortada depois: medir a altura de cada tela à mão é o tipo de
# número que envelhece sem ninguém ver.
ESTADOS = {
    'instalar': 680,
    'lancar': 500,
    'escolher': 500,
    'barra': 840,
    'confere': 500,
    'recusa': 500,
}

CHROME_CANDIDATOS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    shutil.which('google-chrome') or '',
    shutil.which('chromium') or '',
]


def chrome() -> str:
    for c in CHROME_CANDIDATOS:
        if c and Path(c).exists():
            return c
    sys.exit('Chrome não encontrado. Instale o Google Chrome ou o Chromium.')


def cortar_sobra(caminho: Path, margem: int = 24) -> None:
    """Corta o fundo liso em volta do desenho, deixando `margem` px (em 2x)."""
    img = Image.open(caminho).convert('RGB')
    fundo = Image.new('RGB', img.size, img.getpixel((0, 0)))
    caixa = ImageChops.difference(img, fundo).getbbox()
    if not caixa:
        sys.exit(f'{caminho.name}: imagem vazia — o estado existe no HTML?')
    x0, y0, x1, y1 = caixa
    img.crop((
        max(0, x0 - margem), max(0, y0 - margem),
        min(img.width, x1 + margem), min(img.height, y1 + margem),
    )).save(caminho, optimize=True)


def fotografar(exe: str, estado: str, largura: int, destino: Path) -> None:
    """Uma foto do estado. No macOS o Chrome sem janela escreve a imagem e às
    vezes não sai sozinho; por isso espera-se o arquivo, e não o processo."""
    destino.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as perfil:
        processo = subprocess.Popen(
            [
                exe, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--no-first-run', f'--user-data-dir={perfil}',
                '--force-device-scale-factor=2', '--force-color-profile=srgb',
                f'--window-size={largura},1100',
                f'--screenshot={destino}',
                f'{DESENHO.as_uri()}#{estado}',
            ],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(120):
                if destino.exists() and destino.stat().st_size > 0:
                    time.sleep(0.5)  # a escrita termina antes do processo
                    break
                if processo.poll() is not None:
                    break
                time.sleep(0.5)
        finally:
            processo.kill()
            processo.wait()
    if not destino.exists():
        sys.exit(f'{estado}: o Chrome não gerou a imagem.')


def main() -> None:
    exe = chrome()
    for estado, largura in ESTADOS.items():
        destino = PASTA / f'{estado}.png'
        fotografar(exe, estado, largura, destino)
        cortar_sobra(destino)
        print(f'{destino.relative_to(RAIZ)}')


if __name__ == '__main__':
    main()
