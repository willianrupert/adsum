#!/usr/bin/env python3
"""
Um cofre real vira caso de teste, sem levar dado real nenhum.

Por que isto existe: a suíte inteira começava de uma base limpa — uma turma,
um sal, instalação nova — e foi por isso que a aula de 22/09/2026 falhou
sem que nenhum teste tivesse falhado antes. Os defeitos só aparecem com
histórico: duas turmas cunhando ids no mesmo dia, uma reinstalação no meio
da semana, linhas repetidas no log. Uma base real de segunda semana é o
teste que faltava.

O que sai idêntico ao original, porque é a forma do problema:
  - `evento_id`, `quando`, origem, resultado, a ordem das linhas em cada
    arquivo (inclusive as repetidas) e o `instalacaoId` — ids sorteados, que
    não identificam ninguém;
  - datas de criação dos vínculos, a grade (dia e horário), papéis;
  - a igualdade entre hashes: o mesmo `uid_hash` original vira sempre o
    mesmo hash inventado, em todos os arquivos.

O que é trocado, e não volta:
  - nome, nome completo e matrícula → "Aluno 001", "2026000001"…;
  - todo `uid_hash` → 16 hexadecimais sorteados;
  - o nome da turma → "2026.2 - TESTE01 - TURMA A";
  - o sal → sorteado. O sal real nunca entra aqui: é o segredo do cofre.

No fim o script procura, no texto gerado, cada nome, matrícula, hash e sal
do original, e recusa gravar se achar um só. Mesma disciplina do
`gerar_mockups.py`: versiona-se o desenho, nunca a captura.

Uso:
    python3 scripts/anonimizar_cofre.py PASTA_DO_COFRE SAIDA.json
"""

import csv
import io
import json
import re
import secrets
import sys
from pathlib import Path

HASH = re.compile(r"^[0-9a-f]{16}$")


def ler_json(caminho: Path):
    return json.loads(caminho.read_text(encoding="utf-8"))["conteudo"]


def ler_csv(caminho: Path) -> list[dict]:
    texto = caminho.read_text(encoding="utf-8-sig")
    return list(csv.DictReader(io.StringIO(texto), delimiter=";"))


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    pasta, saida = Path(sys.argv[1]), Path(sys.argv[2])

    config = ler_json(pasta / "config.json")
    vinculos = ler_json(pasta / "vinculos.json")
    grade = ler_json(pasta / "grade.json")
    turmas = {}
    for arquivo in sorted((pasta / "turmas").glob("*.json")):
        pessoas = ler_json(arquivo)
        if pessoas:
            turmas[pessoas[0]["turma"]] = pessoas
    registros = {}
    for arquivo in sorted((pasta / "registros").glob("*.csv")):
        linhas = ler_csv(arquivo)
        if linhas:
            registros[linhas[0]["turma"]] = linhas

    # --- os mapas: cada valor original vira sempre o mesmo inventado ---------
    nomes_de_turma: dict[str, str] = {}
    for i, turma in enumerate(sorted(set(turmas) | set(registros) | {a["turma"] for a in grade})):
        nomes_de_turma[turma] = f"2026.2 - TESTE{i + 1:02d} - TURMA {chr(65 + i)}"

    hashes: dict[str, str] = {}

    def hash_novo(original: str) -> str:
        if not original:
            return original
        if original not in hashes:
            hashes[original] = secrets.token_hex(8)
        return hashes[original]

    matriculas: dict[str, str] = {}
    nomes: dict[str, str] = {}
    pessoas_por_matricula: dict[str, int] = {}

    def pessoa(matricula: str, *nomes_originais: str, papel: str = "aluno") -> int:
        chave = matricula or nomes_originais[0]
        if chave not in pessoas_por_matricula:
            pessoas_por_matricula[chave] = len(pessoas_por_matricula) + 1
        n = pessoas_por_matricula[chave]
        base = f"Professor {n:03d}" if papel == "professor" else f"Aluno {n:03d}"
        for original in nomes_originais:
            if original:
                nomes.setdefault(original, base)
        if matricula:
            matriculas.setdefault(matricula, f"2026{n:06d}")
        return n

    for lista in turmas.values():
        for p in lista:
            pessoa(p.get("matricula", ""), p.get("nome", ""), p.get("nomeCompleto", ""), papel=p.get("papel", "aluno"))
    for v in vinculos:
        pessoa(v.get("matricula", ""), v.get("nome", ""), papel=v.get("papel", "aluno"))
    for linhas in registros.values():
        for r in linhas:
            if r["nome"]:
                pessoa(r["matricula"], r["nome"], papel="professor" if r["origem"] == "professor" else "aluno")

    def chave(original: str) -> str:
        # Normalmente a matrícula; às vezes o nome, para quem não tem uma. Se não
        # for nenhum dos dois conhecidos, ganha um valor inventado próprio.
        if original in matriculas:
            return matriculas[original]
        if original in nomes:
            return nomes[original]
        matriculas[original] = f"9999{len(matriculas):06d}"
        return matriculas[original]

    def nome(original: str, completo: bool = False) -> str:
        if not original:
            return original
        curto = nomes[original]
        return f"{curto.upper()} TESTE" if completo else curto

    # --- a saída ---------------------------------------------------------------
    anonimo = {
        "origem": "Gerado por scripts/anonimizar_cofre.py a partir de um cofre real. Nenhum nome, matrícula, hash ou sal é o original.",
        "config": {
            "salHex": secrets.token_hex(16),
            "instalacaoId": config["instalacaoId"],
            "criadoEm": config["criadoEm"],
        },
        "vinculos": [
            {
                **{k: v[k] for k in ("papel", "criadoEm") if k in v},
                "uidHash": hash_novo(v["uidHash"]),
                "nome": nome(v["nome"]),
                **({"matricula": matriculas[v["matricula"]]} if v.get("matricula") else {}),
                **({"sintetico": True} if v.get("sintetico") else {}),
            }
            for v in vinculos
        ],
        "grade": [
            {**a, "turma": nomes_de_turma[a["turma"]], "uidHashProfessor": hash_novo(a["uidHashProfessor"])}
            for a in grade
        ],
        "turmas": {
            nomes_de_turma[t]: [
                {
                    "turma": nomes_de_turma[t],
                    "chave": chave(p.get("chave", "")),
                    "matricula": matriculas.get(p.get("matricula", ""), ""),
                    "nome": nome(p["nome"]),
                    "nomeCompleto": nome(p.get("nomeCompleto") or p["nome"], completo=True),
                    "papel": p.get("papel", "aluno"),
                }
                for p in lista
            ]
            for t, lista in turmas.items()
        },
        "registros": {
            nomes_de_turma[t]: [
                {
                    "eventoId": r["evento_id"],
                    "quando": r["quando"],
                    "turma": nomes_de_turma[t],
                    **({"matricula": matriculas[r["matricula"]]} if r["matricula"] else {}),
                    "nome": nome(r["nome"]),
                    "origem": r["origem"],
                    "resultado": r["resultado"],
                    "uidHash": hash_novo(r["uid_hash"]),
                }
                for r in linhas
            ]
            for t, linhas in registros.items()
        },
    }
    texto = json.dumps(anonimo, ensure_ascii=False, indent=1) + "\n"

    # --- a conferência: nada do original pode ter sobrado ---------------------
    proibidos = {config["salHex"], *config.get("saisAnteriores", []), *hashes, *matriculas, *nomes, *nomes_de_turma}
    for original in list(nomes):
        proibidos.update(parte for parte in original.split() if len(parte) >= 4)
    vazou = sorted(p for p in proibidos if p and p in texto)
    if vazou:
        print(f"Recusado: {len(vazou)} valor(es) do cofre original apareceriam no arquivo.", file=sys.stderr)
        return 1

    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(texto, encoding="utf-8")
    total = sum(len(l) for l in registros.values())
    print(f"{saida}: {len(turmas)} turmas, {len(vinculos)} vínculos, {total} linhas de registro.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
