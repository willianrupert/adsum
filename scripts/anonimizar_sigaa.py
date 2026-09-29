#!/usr/bin/env python3
"""
A planilha de frequência do SIGAA vira caso de teste, sem dado real nenhum.

Entra a página salva ("Página da Web, completa") da "Lançar Freq. em
Planilha"; sai o modelo de dados dela, no formato do Adsum
(`src/testes/sigaa/*.json`). A página e os scripts do SIGAA não saem: além dos
dados de alunos, o software é da UFRN. Ver `docs/12_planilha_sigaa.md`.

O que sai idêntico, porque é a forma do problema:
  - `auxAulas` inteiro: datas, máximo de cada dia, lançada, feriado,
    cancelada, extra, suspensa. Não identifica ninguém;
  - em cada registro de aluno: a aula, as faltas (`null`, `0`, `2`…), as
    marcas (trancado, matriculado depois, bloqueado) e a ordem dos registros;
  - o período letivo, o código da disciplina, a turma e o semestre.

O que é trocado, e não volta:
  - nome → "ALUNO 001 INVENTADO"; matrícula → "20269000001"…;
  - os ids internos (`ID_MAT`, `ID_DISCENTE`, `ID_FREQ`) → números sorteados
    em faixas próprias, o mesmo original sempre para o mesmo inventado;
  - o nome da disciplina → "DISCIPLINA ANONIMIZADA".

No fim o script procura, no texto gerado, cada nome (e cada parte de nome com
4 letras ou mais), matrícula e id do original, e recusa gravar se achar um só.

Uso:
    python3 scripts/anonimizar_sigaa.py PLANILHA_SALVA.html SAIDA.json
    python3 scripts/anonimizar_sigaa.py PLANILHA_SALVA.html SAIDA.json --pagina PAGINA.html

Com `--pagina`, grava também a página inteira com as mesmas trocas, para a
bancada local (`scripts/bancada_sigaa.mjs`). Ela nunca entra no repositório:
tem os scripts do SIGAA. A mesma conferência roda sobre ela.
"""

import html as html_lib
import json
import re
import sys
from pathlib import Path

ID_MAT, MAT, NOME, ID_FREQ, ID_DISCENTE = 0, 1, 2, 6, 9
CAMPOS_DO_ALUNO = 16
# Fronteira de palavra sem o `_`: o id do aluno aparece colado em `aluno_<id>`,
# nas classes das células, e também tem de ser trocado e conferido ali.
LETRA = r"[0-9A-Za-zÀ-ÿ]"
CAMPOS_DA_AULA = 10


def ler_pagina(caminho: Path) -> str:
    bruto = caminho.read_bytes()
    try:
        return bruto.decode("utf-8")
    except UnicodeDecodeError:
        return bruto.decode("cp1252")


def variavel(pagina: str, nome: str) -> str:
    achado = re.search(rf'var {nome} = "([^"]*)"', pagina)
    if not achado:
        raise SystemExit(f"Recusado: a página não tem `{nome}`. É a planilha de frequência?")
    return achado.group(1)


def data(pagina: str, nome: str) -> str:
    achado = re.search(rf'{nome} = new Date\("([^"]*)"\)', pagina)
    if not achado:
        raise SystemExit(f"Recusado: a página não tem `{nome}`.")
    return achado.group(1)


def main() -> int:
    argumentos = sys.argv[1:]
    pagina_saida = None
    if "--pagina" in argumentos:
        i = argumentos.index("--pagina")
        if i + 1 >= len(argumentos):
            print(__doc__)
            return 2
        pagina_saida = Path(argumentos[i + 1])
        del argumentos[i : i + 2]
    if len(argumentos) != 2:
        print(__doc__)
        return 2
    entrada, saida = Path(argumentos[0]), Path(argumentos[1])
    pagina = ler_pagina(entrada)

    aulas = [a.split(",") for a in variavel(pagina, "auxAulas").split(";") if a]
    alunos = [a.split(",") for a in variavel(pagina, "auxAlunos").split(";") if a]
    if any(len(a) != CAMPOS_DA_AULA for a in aulas) or any(len(a) != CAMPOS_DO_ALUNO for a in alunos):
        print("Recusado: o formato dos registros mudou; confira docs/12 antes.", file=sys.stderr)
        return 1

    legenda = re.search(r"<legend>([^<]*)</legend>", pagina)
    if not legenda:
        print("Recusado: sem o cabeçalho da turma (<legend>).", file=sys.stderr)
        return 1
    partes = re.match(r"\s*([A-Z]{2,6}\d{2,5})\s*-\s*(.*?)\s*(\(\d+h\))?\s*-\s*(Turma:.*)$", legenda.group(1).strip())
    if not partes:
        print("Recusado: o cabeçalho da turma mudou de formato.", file=sys.stderr)
        return 1
    codigo, disciplina, carga, turma = partes.group(1), partes.group(2), partes.group(3) or "", partes.group(4)

    def mapa(valores: list[str], inicio: int) -> dict[str, str]:
        unicos = list(dict.fromkeys(v for v in valores if v not in ("0", "null", "")))
        return {v: str(inicio + i) for i, v in enumerate(unicos)}

    id_mat = mapa([a[ID_MAT] for a in alunos], 900001)
    id_discente = mapa([a[ID_DISCENTE] for a in alunos], 800001)
    id_freq = mapa([a[ID_FREQ] for a in alunos], 700001)
    ordem = list(dict.fromkeys(a[ID_MAT] for a in alunos))
    numero = {original: i + 1 for i, original in enumerate(ordem)}

    anonimos = []
    for a in alunos:
        b = list(a)
        n = numero[a[ID_MAT]]
        b[ID_MAT] = id_mat[a[ID_MAT]]
        b[MAT] = f"20269{n:06d}"
        b[NOME] = f"ALUNO {n:03d} INVENTADO"
        b[ID_FREQ] = id_freq.get(a[ID_FREQ], a[ID_FREQ])
        b[ID_DISCENTE] = id_discente.get(a[ID_DISCENTE], a[ID_DISCENTE])
        anonimos.append(",".join(b))

    anonimo = {
        "fonte": f"Planilha de {codigo} do SIGAA da UFPE, capturada em 29/09/2026 e anonimizada por scripts/anonimizar_sigaa.py.",
        "legenda": f"{codigo} - DISCIPLINA ANONIMIZADA {carga} - {turma}".replace("  ", " "),
        "periodo": {
            "inicio": data(pagina, "dataInicioPeriodoLetivo"),
            "fim": data(pagina, "dataFimPeriodoLetivo"),
        },
        "auxAulas": ";".join(",".join(a) for a in aulas),
        "auxAlunos": ";".join(anonimos),
    }
    texto = json.dumps(anonimo, ensure_ascii=False, indent=1) + "\n"

    # --- a conferência: nada do original pode ter sobrado ---------------------
    nomes = {a[NOME] for a in alunos}
    proibidos = {*nomes, *(a[MAT] for a in alunos), *id_mat, *id_discente, *id_freq, disciplina}
    for nome in nomes:
        proibidos.update(parte for parte in nome.split() if len(parte) >= 4)
    def vazamentos(conteudo: str) -> list[str]:
        alvos = [conteudo, html_lib.unescape(conteudo)]
        return sorted(p for p in proibidos if p and any(re.search(rf"(?<!{LETRA}){re.escape(p)}(?!{LETRA})", a) for a in alvos))

    vazou = vazamentos(texto)
    if vazou:
        print(f"Recusado: {len(vazou)} valor(es) do original apareceriam no arquivo.", file=sys.stderr)
        return 1

    if pagina_saida:
        # As mesmas trocas na página inteira: dados, tabela já desenhada, classes e campo escondido.
        trocas: dict[str, str] = {disciplina: "DISCIPLINA ANONIMIZADA"}
        for a in alunos:
            n = numero[a[ID_MAT]]
            trocas[a[NOME]] = f"ALUNO {n:03d} INVENTADO"
            trocas[a[MAT]] = f"20269{n:06d}"
        trocas.update(id_mat)
        trocas.update(id_discente)
        trocas.update(id_freq)
        anonima = pagina
        for original in sorted(trocas, key=len, reverse=True):
            anonima = re.sub(rf"(?<!{LETRA}){re.escape(original)}(?!{LETRA})", trocas[original], anonima)
        vazou = vazamentos(anonima)
        if vazou:
            print(f"Recusado: {len(vazou)} valor(es) do original sobrariam na página.", file=sys.stderr)
            return 1
        pagina_saida.parent.mkdir(parents=True, exist_ok=True)
        pagina_saida.write_text(anonima, encoding="utf-8")
        print(f"{pagina_saida}: página anonimizada, só para a bancada local.")

    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(texto, encoding="utf-8")
    print(f"{saida}: {len(ordem)} alunos, {len(aulas)} aulas, {len(alunos)} registros.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
