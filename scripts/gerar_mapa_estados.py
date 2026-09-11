#!/usr/bin/env python3
"""
Não há menu: a rota decide.

`decidirRota` (`nucleo/rota.ts`) é uma cascata de perguntas, na ordem em que
elas importam — cada uma só é feita depois que a anterior já foi respondida.
O professor nunca escolhe onde está; ele abre o app e já está no lugar certo.

A primeira versão deste desenho parava nos seis primeiros "ifs" e escondia o
resto — inclusive o mais interessante: **'problema' é checado duas vezes**
(navegador quebrado, bem no topo; leitor parado, só depois de turma e
cronograma, porque preencher horário não depende de hardware nenhum), a
**'cerimônia' não é uma tela** — é o sinal para sintetizar o crachá do
professor e abrir a chamada sozinha, e some no instante seguinte — e a rota
**recua** duas vezes por conta própria: a grade confere o relógio a cada
30 s e abre a próxima aula sem clique nem crachá, e um leitor que cai no meio
de uma chamada joga a tela de volta a 'problema' sem perder a sessão, que
está esperando no banco e reaparece sozinha assim que o leitor volta.

Desenhada, e não capturada: mesma disciplina das outras figuras deste
diretório. As perguntas, a ordem e as voltas são as do código, não
ilustrativas — ver `nucleo/rota.ts` e `nucleo/rota.test.ts`.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SUPER = 3
L, A = 1500, 1120
AZUL = (0, 113, 227)
VERDE = (52, 120, 82)
TINTA = (29, 29, 31)
FRACA = (110, 110, 115)
CINZA = (245, 245, 247)
BORDA = (210, 210, 215)
BORDA_TRACEJADA = (170, 170, 178)

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
    ('problema', 'o navegador tem o essencial — IndexedDB, Web Crypto, service worker?', 'sem isso, nada mais importa'),
    ('pasta', 'a base tem uma pasta de verdade para morar?', 'senão, o professor escolhe uma agora'),
    ('navegador', 'este navegador tem seletor de pasta?', 'Safari e Firefox precisam saber o risco'),
    ('turma', 'existe gente cadastrada?', 'senão, a tela é colar a lista do SIGAA'),
    ('cronograma', 'esta turma já tem horário?', 'aponta a semana, ou fica para depois'),
    ('problema', 'checado de novo: o leitor está lendo, agora?', 'turma e horário não pedem hardware — isto pede'),
]


def caixa_arredondada(d, x, y, larg, alt, cor, contorno=None, tracejada=False, largura_contorno=1):
    if not tracejada or not contorno:
        d.rounded_rectangle(
            [x * SUPER, y * SUPER, (x + larg) * SUPER, (y + alt) * SUPER],
            radius=14 * SUPER, fill=cor,
            outline=contorno, width=largura_contorno * SUPER if contorno else 0,
        )
        return
    # Contorno tracejado: preenche sólido e desenha o traço por cima em segmentos.
    d.rounded_rectangle(
        [x * SUPER, y * SUPER, (x + larg) * SUPER, (y + alt) * SUPER],
        radius=14 * SUPER, fill=cor,
    )
    perimetro = []
    passo = 10
    for px in range(int(x), int(x + larg) + 1, passo):
        perimetro.append((px, y))
    for py in range(int(y), int(y + alt) + 1, passo):
        perimetro.append((x + larg, py))
    for px in range(int(x + larg), int(x) - 1, -passo):
        perimetro.append((px, y + alt))
    for py in range(int(y + alt), int(y) - 1, -passo):
        perimetro.append((x, py))
    for i in range(0, len(perimetro) - 1, 2):
        p1, p2 = perimetro[i], perimetro[min(i + 1, len(perimetro) - 1)]
        d.line([p1[0] * SUPER, p1[1] * SUPER, p2[0] * SUPER, p2[1] * SUPER],
               fill=contorno, width=largura_contorno * SUPER)


def seta_baixo(d, x, y1, y2, cor=FRACA, largura=2):
    d.line([x * SUPER, y1 * SUPER, x * SUPER, y2 * SUPER], fill=cor, width=largura * SUPER)
    d.polygon([
        (x * SUPER, y2 * SUPER),
        ((x - 5) * SUPER, (y2 - 9) * SUPER),
        ((x + 5) * SUPER, (y2 - 9) * SUPER),
    ], fill=cor)


def seta_cima(d, x, y1, y2, cor=FRACA, largura=2):
    d.line([x * SUPER, y1 * SUPER, x * SUPER, y2 * SUPER], fill=cor, width=largura * SUPER)
    d.polygon([
        (x * SUPER, y2 * SUPER),
        ((x - 5) * SUPER, (y2 + 9) * SUPER),
        ((x + 5) * SUPER, (y2 + 9) * SUPER),
    ], fill=cor)


def conector_L(d, pontos, cor, tracejado=False, largura=2, ponta_final=None):
    """Linha reta por segmentos ortogonais — `pontos` é a lista de vértices."""
    for (x1, y1), (x2, y2) in zip(pontos, pontos[1:]):
        if not tracejado:
            d.line([x1 * SUPER, y1 * SUPER, x2 * SUPER, y2 * SUPER], fill=cor, width=largura * SUPER)
            continue
        comprimento = max(abs(x2 - x1), abs(y2 - y1))
        passos = max(1, int(comprimento / 9))
        for i in range(0, passos, 2):
            t1, t2 = i / passos, min(1, (i + 1) / passos)
            d.line([
                (x1 + (x2 - x1) * t1) * SUPER, (y1 + (y2 - y1) * t1) * SUPER,
                (x1 + (x2 - x1) * t2) * SUPER, (y1 + (y2 - y1) * t2) * SUPER,
            ], fill=cor, width=largura * SUPER)
    if ponta_final:
        (px, py), direcao = ponta_final
        dx, dy = direcao
        d.polygon([
            (px * SUPER, py * SUPER),
            ((px - dx * 9 - dy * 5) * SUPER, (py - dy * 9 + dx * 5) * SUPER),
            ((px - dx * 9 + dy * 5) * SUPER, (py - dy * 9 - dx * 5) * SUPER),
        ], fill=cor)


def texto_centrado_multilinha(d, cx, y, linhas, font, fill, espaco=4, align='center'):
    d.multiline_text((cx * SUPER, y * SUPER), '\n'.join(linhas), font=font, fill=fill,
                      anchor='ma', align=align, spacing=espaco * SUPER)


def desenhar() -> Image.Image:
    img = Image.new('RGB', (L * SUPER, A * SUPER), 'white')
    d = ImageDraw.Draw(img)

    titulo_f = fonte('Arial Bold.ttf', 22)
    rota_f = fonte('Courier New.ttf', 18)
    pergunta_f = fonte('Arial.ttf', 15)
    apoio_f = fonte('Arial.ttf', 12)
    nota_f = fonte('Arial.ttf', 12)
    nota_f_it = fonte('Arial Italic.ttf', 12)

    d.text((L / 2 * SUPER, 38 * SUPER), 'Não há menu: a rota decide',
           font=titulo_f, fill=TINTA, anchor='mm')
    d.text((L / 2 * SUPER, 66 * SUPER),
           'nucleo/rota.ts — cada pergunta só é feita depois que a anterior já foi respondida',
           font=apoio_f, fill=FRACA, anchor='mm')

    x, larg = 110, 880
    y = 100
    alt = 84
    topo_cascata = y

    posicoes = {}

    for i, (rota, pergunta, apoio) in enumerate(CASCATA):
        caixa_arredondada(d, x, y, larg, alt, CINZA, BORDA)
        d.text(((x + 26) * SUPER, (y + 26) * SUPER), rota, font=rota_f, fill=AZUL, anchor='lm')
        d.text(((x + 26) * SUPER, (y + 58) * SUPER), pergunta, font=pergunta_f, fill=TINTA, anchor='lm')
        d.text(((x + larg - 26) * SUPER, (y + alt / 2) * SUPER), apoio,
               font=apoio_f, fill=FRACA, anchor='rm')
        posicoes[f'gate{i}'] = (x, y, larg, alt)

        if i < len(CASCATA) - 1:
            seta_baixo(d, x + larg / 2, y + alt + 4, y + alt + 26)
        y += alt + 30

    # ── Depois do sexto gate, o código não cai numa caixa só: cai numa
    # decisão de três saídas, na ordem em que `decidirRota` as escreve:
    # chamada já aberta, professor ainda sem crachá, ou tudo pronto.
    seta_baixo(d, x + larg / 2, y - 4, y + 16)
    y += 40

    d.text(((x + larg / 2) * SUPER, y * SUPER),
           'e daqui em diante o código já não é uma fila — são três saídas de uma vez',
           font=nota_f_it, fill=FRACA, anchor='mm')
    y += 50

    # ── Cerimônia: caixa tracejada, menor, à esquerda — sinal, não tela.
    cerim_larg = 330
    cerim_x = x
    cerim_y = y
    cerim_alt = 96
    caixa_arredondada(d, cerim_x, cerim_y, cerim_larg, cerim_alt, 'white', BORDA_TRACEJADA, tracejada=True, largura_contorno=2)
    d.text(((cerim_x + 20) * SUPER, (cerim_y + 22) * SUPER), 'cerimonia', font=rota_f, fill=FRACA, anchor='lm')
    texto_centrado_multilinha(
        d, cerim_x + cerim_larg / 2, cerim_y + 40,
        ['professor sem crachá ainda:', 'sintetiza um e abre a chamada', '— não é tela, dura um instante'],
        fonte('Arial.ttf', 12), TINTA, espaco=3,
    )

    # ── Par chamada/pronto, à direita da cerimônia.
    par_x = cerim_x + cerim_larg + 70
    par_larg = (x + larg) - par_x
    par_y = y
    par_alt = 96

    caixa_arredondada(d, par_x, par_y, par_larg / 2 - 14, par_alt, AZUL)
    d.text(((par_x + (par_larg / 2 - 14) / 2) * SUPER, (par_y + 30) * SUPER), 'chamada',
           font=rota_f, fill='white', anchor='mm')
    texto_centrado_multilinha(d, par_x + (par_larg / 2 - 14) / 2, par_y + 52,
                               ['há aula aberta —', 'a fila, e o contador'],
                               apoio_f, (214, 233, 255), espaco=4)

    pronto_x = par_x + par_larg / 2 + 14
    caixa_arredondada(d, pronto_x, par_y, par_larg / 2 - 14, par_alt, CINZA, BORDA)
    d.text(((pronto_x + (par_larg / 2 - 14) / 2) * SUPER, (par_y + 30) * SUPER), 'pronto',
           font=rota_f, fill=TINTA, anchor='mm')
    texto_centrado_multilinha(d, pronto_x + (par_larg / 2 - 14) / 2, par_y + 52,
                               ['tudo vinculado —', 'esperando o crachá'],
                               apoio_f, FRACA, espaco=4)

    # Seta: cerimônia → chamada (tracejada, é o auto-abrir).
    conector_L(
        d,
        [(cerim_x + cerim_larg, cerim_y + cerim_alt / 2), (par_x, cerim_y + cerim_alt / 2)],
        VERDE, tracejado=True, largura=2,
        ponta_final=((par_x, cerim_y + cerim_alt / 2), (1, 0)),
    )
    d.text((((cerim_x + cerim_larg) + par_x) / 2 * SUPER, (cerim_y + cerim_alt / 2 - 14) * SUPER),
           'abre sozinha', font=nota_f, fill=VERDE, anchor='mm')

    # Seta dupla chamada ⇄ pronto — professor encosta o crachá pra ir e voltar.
    meio_y = par_y + par_alt / 2
    seta_x1, seta_x2 = par_x + (par_larg / 2 - 14) + 6, pronto_x - 6
    d.line([seta_x1 * SUPER, (meio_y - 12) * SUPER, seta_x2 * SUPER, (meio_y - 12) * SUPER],
           fill=FRACA, width=2 * SUPER)
    d.polygon([(seta_x2 * SUPER, (meio_y - 12) * SUPER),
               ((seta_x2 - 9) * SUPER, (meio_y - 17) * SUPER),
               ((seta_x2 - 9) * SUPER, (meio_y - 7) * SUPER)], fill=FRACA)
    d.line([seta_x2 * SUPER, (meio_y + 12) * SUPER, seta_x1 * SUPER, (meio_y + 12) * SUPER],
           fill=FRACA, width=2 * SUPER)
    d.polygon([(seta_x1 * SUPER, (meio_y + 12) * SUPER),
               ((seta_x1 + 9) * SUPER, (meio_y + 7) * SUPER),
               ((seta_x1 + 9) * SUPER, (meio_y + 17) * SUPER)], fill=FRACA)

    # Arco vindo de cima, dos seis gates, direto para "pronto" — a saída mais
    # comum: sem professor pendente, sem chamada já aberta.
    topo_pronto_x = pronto_x + (par_larg / 2 - 14) / 2
    conector_L(
        d,
        [(x + larg / 2, y - 22), (x + larg / 2, y - 14), (topo_pronto_x, y - 14), (topo_pronto_x, par_y - 14)],
        FRACA, largura=2,
        ponta_final=((topo_pronto_x, par_y), (0, 1)),
    )

    y = par_y + par_alt

    # ── Margem direita: as duas voltas que o código dá sozinho.
    margem_x = x + larg + 40

    # 1) pronto → chamada, pela grade, a cada 30 s.
    chamada_centro_x = par_x + (par_larg / 2 - 14) / 2
    y_pronto_centro = par_y + par_alt / 2
    conector_L(
        d,
        [(pronto_x + (par_larg / 2 - 14), y_pronto_centro + 26), (margem_x, y_pronto_centro + 26),
         (margem_x, par_y - 110), (chamada_centro_x, par_y - 110), (chamada_centro_x, par_y)],
        AZUL, largura=2,
        ponta_final=((chamada_centro_x, par_y), (0, 1)),
    )
    d.text(((margem_x + 10) * SUPER, (y_pronto_centro) * SUPER),
           'a grade confere\no relógio a cada\n30 s e reabre\nsozinha, sem\nclique nem crachá',
           font=nota_f, fill=AZUL, anchor='lm', align='left', spacing=3 * SUPER)

    # 2) chamada → problema (gate 6), quando o leitor cai no meio da aula —
    # e a volta de problema pra chamada quando ele volta, sem perder a sessão.
    gx, gy, glarg, galt = posicoes['gate5']
    margem_x2 = margem_x + 210
    entrada_y = gy + 20
    conector_L(
        d,
        [(chamada_centro_x, par_y), (chamada_centro_x, par_y - 18),
         (margem_x2, par_y - 18), (margem_x2, entrada_y), (gx + glarg, entrada_y)],
        (196, 70, 60), tracejado=True, largura=2,
        ponta_final=((gx + glarg, entrada_y), (-1, 0)),
    )
    d.text(((margem_x2 + 10) * SUPER, ((par_y + entrada_y) / 2) * SUPER),
           'leitor cai no meio\nda aula: a rota volta\npra cá — a sessão\nespera no banco e\nreaparece sozinha',
           font=nota_f, fill=(196, 70, 60), anchor='lm', align='left', spacing=3 * SUPER)

    y += 40
    rodape1 = '"Cerimônia" e as duas voltas nunca aparecem como tela — são o que faz o app parecer'
    rodape2 = 'que decide sozinho, quando na verdade só está seguindo a mesma cascata de sempre.'
    d.text((L / 2 * SUPER, y * SUPER), rodape1, font=fonte('Arial Bold.ttf', 14), fill=TINTA, anchor='mm')
    d.text((L / 2 * SUPER, (y + 22) * SUPER), rodape2, font=fonte('Arial.ttf', 13), fill=FRACA, anchor='mm')

    return img.resize((L, A), Image.LANCZOS)


if __name__ == '__main__':
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else 'mapa-estados.png')
    desenhar().save(destino)
    print('mapa de estados em', destino)
