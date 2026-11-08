"""Monta o banco base de questões da 1ª fase da OAB.

Rodar a partir de D:\\App pai:
    uv run --no-project --with pyarrow python -I dados/montar_banco.py

Saídas:
    dados/privado/base.json    todas as questões (com gabarito)
    dados/privado/lotes.json   manifesto dos lotes (com gabarito; só o script do workflow lê)
    dados/trabalho/lotes/*.txt lotes em texto, SEM gabarito (o que os agentes leem)
"""
import json
import re
import sys
import textwrap
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

AQUI = Path(__file__).resolve().parent
FONTES = AQUI / "fontes"
PRIVADO = AQUI / "privado"
LOTES = AQUI / "trabalho" / "lotes"

MATERIAS = ["etica", "filosofia", "constitucional", "direitos_humanos", "eleitoral", "internacional",
            "financeiro", "tributario", "administrativo", "ambiental", "civil", "eca", "consumidor",
            "empresarial", "processo_civil", "penal", "processo_penal", "previdenciario", "trabalho",
            "processo_trabalho"]

URLS = {
    "russ7": "https://huggingface.co/api/datasets/russ7/oab_exams_2011_2025_combined/parquet/default/train/0.parquet",
    "julia": "https://huggingface.co/api/datasets/juliadollis/oab-comentadas-leisllmv1/parquet/default/train/0.parquet",
}
# ids "AAAA-seq" da russ7 → número do exame (2024-01, 2024-02 e 2025-01 conferidos pela sobreposição com a julia)
IDS_NOVOS = {"2018-01": 25, "2018-02": 26, "2018-03": 27, "2019-01": 28, "2019-02": 29, "2019-03": 30,
             "2020-01": 31, "2021-01": 32, "2021-02": 33, "2022-01": 34, "2022-02": 35, "2022-03": 36,
             "2023-01": 37, "2024-01": 40, "2024-02": 41, "2025-01": 43}
ANOS_JULIA = {38: 2023, 39: 2023, 40: 2024, 41: 2024, 42: 2024, 43: 2025, 44: 2025, 45: 2025}
LETRAS = "ABCD"
TAM_EXPLICAR, TAM_CLASSIFICAR, LARGURA = 15, 25, 300

# linha que começa um item (I –, II., a), – ) ou um parágrafo de comentário ("A alternativa B…")
_INICIO_ITEM = re.compile(r"^(\(?[IVXLC]+\)?\s*[–\-.)]|\(?[a-z]\)\s|[–•\-]\s|As? alternativas?\s|Alternativa\s)")


def limpar_texto(s):
    """Junta as quebras de linha que vieram do PDF, mantendo parágrafos e itens."""
    if not s:
        return ""
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"(\w)-\n(\w)", r"\1\2", s)
    paragrafos = []
    for bloco in re.split(r"\n\s*\n", s):
        linhas = [linha.strip() for linha in bloco.split("\n") if linha.strip()]
        if not linhas:
            continue
        texto = linhas[0]
        for linha in linhas[1:]:
            texto += ("\n" if _INICIO_ITEM.match(linha) else " ") + linha
        paragrafos.append(texto)
    return re.sub(r"[ \t]+", " ", "\n".join(paragrafos)).strip()


def chave(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)[:160]


def chave_texto(x):
    return chave(x["enunciado"]) + chave(" ".join(x["alt"]))[:80]


def exame_de(exam_id):
    if exam_id in IDS_NOVOS:
        return IDS_NOVOS[exam_id], False
    m = re.fullmatch(r"(\d{4})-(\d+)(a?)", exam_id)
    return int(m[2]), m[3] == "a"


def romano(n):
    out = ""
    for v, r in ((50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out, n = out + r, n - v
    return out


def _questao(id, exame, reap, ano, num, enunciado, alt, certa, prio, comentario=None, base_legal=None):
    return {"id": id, "origem": "oficial", "exame": exame, "reaplicacao": reap, "ano": ano, "num": num,
            "materia": None, "enunciado": limpar_texto(enunciado), "alt": [limpar_texto(a) for a in alt],
            "certa": certa, "expl": None, "comentario": limpar_texto(comentario) or None,
            "base_legal": limpar_texto(base_legal) or None, "pegadinha": None, "desatualizada": None,
            "_prio": prio}


def _indice(gabarito):
    g = str(gabarito).strip().upper()
    if g.isdigit():
        return int(g)
    letras = [c for c in g if c in LETRAS]
    return LETRAS.index(letras[0]) if letras else -1


def carregar_russ7(caminho):
    import pyarrow.parquet as pq
    out, descartadas = [], 0
    for r in pq.read_table(caminho).to_pylist():
        textos = list((r["choices"] or {}).get("text") or [])
        rotulos = [str(x).strip().upper() for x in ((r["choices"] or {}).get("label") or [])]
        if sorted(rotulos) == list(LETRAS):
            textos = [textos[rotulos.index(L)] for L in LETRAS]
        certa = _indice(r["answerKey"])
        if len(textos) != 4 or any(not str(t or "").strip() for t in textos) or not 0 <= certa <= 3:
            descartadas += 1
            continue
        exame, reap = exame_de(r["exam_id"])
        num = int(r["question_number"])
        out.append(_questao(f"e{exame}{'r' if reap else ''}q{num}", exame, reap, int(r["exam_id"][:4]), num,
                            r["question"], textos, certa, 2 if r["exam_id"] in IDS_NOVOS else 1))
    print(f"russ7: {len(out)} linhas lidas, {descartadas} descartadas (sem 4 alternativas preenchidas ou gabarito inválido)")
    return out


def carregar_julia(caminho):
    import pyarrow.parquet as pq
    out = []
    for r in pq.read_table(caminho).to_pylist():
        alts = json.loads(r["alternativas"]) if isinstance(r["alternativas"], str) else r["alternativas"]
        por_letra = {str(a["letra"]).strip().upper()[:1]: a["texto"] for a in alts}
        exame, num = int(r["exame"]), int(r["questao"])
        out.append(_questao(f"e{exame}q{num}", exame, False, ANOS_JULIA[exame], num, r["enunciado"],
                            [por_letra.get(L, "") for L in LETRAS], _indice(r["resposta"]), 0,
                            comentario=r["comentario"], base_legal=r.get("lei")))
    print(f"julia: {len(out)} questões comentadas lidas")
    return out


def deduplicar(qs):
    """Mantém uma cópia por texto e por (exame, reaplicação, número): comentada > id antigo > id novo."""
    por_texto, por_numero, out = set(), set(), []
    rem_texto = rem_numero = 0
    for x in sorted(qs, key=lambda x: (0 if x["comentario"] else 1, x["_prio"], x["id"])):
        kt, kn = chave_texto(x), (x["exame"], x["reaplicacao"], x["num"])
        if kt in por_texto:
            rem_texto += 1
            continue
        if kn in por_numero:
            rem_numero += 1
            continue
        por_texto.add(kt)
        por_numero.add(kn)
        out.append(x)
    print(f"deduplicação: {rem_texto} removidas por texto, {rem_numero} por número")
    return out


def duplicatas_entre_exames(qs):
    """Grupos com o mesmo texto em exames de número diferente (indica mapeamento de ids errado)."""
    grupos = defaultdict(list)
    for x in qs:
        grupos[chave_texto(x)].append(x)
    return [sorted({x["id"] for x in g}) for g in grupos.values() if len({x["exame"] for x in g}) > 1]


def validar(qs, exigir_materia=False):
    erros, vistos = [], set()
    for x in qs:
        i = x.get("id", "?")
        if i in vistos:
            erros.append(f"{i}: id repetido")
        vistos.add(i)
        if not (x.get("enunciado") or "").strip():
            erros.append(f"{i}: enunciado vazio")
        alt = x.get("alt") or []
        if len(alt) != 4 or any(not (a or "").strip() for a in alt):
            erros.append(f"{i}: precisa de 4 alternativas preenchidas")
        if x.get("certa") not in (0, 1, 2, 3) or isinstance(x.get("certa"), bool):
            erros.append(f"{i}: gabarito inválido")
        if x.get("expl") is not None and len(x["expl"]) != 4:
            erros.append(f"{i}: expl precisa de 4 itens")
        if exigir_materia and x.get("materia") not in MATERIAS:
            erros.append(f"{i}: matéria inválida ({x.get('materia')})")
    return erros


def _quebrar(texto):
    linhas = []
    for par in texto.split("\n"):
        linhas.extend(textwrap.wrap(par, LARGURA, break_long_words=True, break_on_hyphens=False) or [""])
    return "\n".join(linhas)


def formatar(x):
    cab = f"### {x['id']}"
    if x.get("exame"):
        cab += f" · Exame {romano(x['exame'])}{' (reaplicação)' if x['reaplicacao'] else ''} · {x['ano']}"
    return "\n".join([cab, _quebrar(x["enunciado"])] + [_quebrar(f"{L}) {a}") for L, a in zip(LETRAS, x["alt"])])


def escrever_lotes(qs, pasta):
    pasta.mkdir(parents=True, exist_ok=True)
    comentadas = [x for x in qs if x["comentario"]]
    outras = sorted((x for x in qs if not x["comentario"]), key=lambda x: (-x["exame"], x["reaplicacao"], x["num"]))
    man = []

    def grava(grupo, modo):
        lid = f"L{len(man) + 1:04d}"
        arq = (pasta / f"{lid}.txt").resolve()
        arq.write_text("\n\n".join(formatar(x) for x in grupo) + "\n", encoding="utf-8")
        gab = {} if modo == "classificar" else {x["id"]: LETRAS[x["certa"]] for x in grupo}
        man.append({"id": lid, "arquivo": str(arq), "modo": modo, "gabarito": gab})

    for i in range(0, len(comentadas), TAM_CLASSIFICAR):
        grava(comentadas[i:i + TAM_CLASSIFICAR], "classificar")
    for i in range(0, len(outras), TAM_EXPLICAR):
        grava(outras[i:i + TAM_EXPLICAR], "explicar")
    return man


def baixar():
    FONTES.mkdir(parents=True, exist_ok=True)
    for nome, url in URLS.items():
        destino = FONTES / f"{nome}.parquet"
        if not destino.exists():
            print("baixando", nome, "…")
            urllib.request.urlretrieve(url, destino)
    return FONTES / "russ7.parquet", FONTES / "julia.parquet"


def main():
    p_russ7, p_julia = baixar()
    julia, russ7 = carregar_julia(p_julia), carregar_russ7(p_russ7)
    grupos = duplicatas_entre_exames(julia + russ7)
    if grupos:
        print(f"ERRO: {len(grupos)} textos aparecem em exames de número diferente (IDS_NOVOS errado?):")
        for g in grupos[:20]:
            print("  ", g)
        sys.exit(1)
    # exames da julia vêm só dela: prova completa e comentada; as que faltam nela tendem a ser anuladas
    russ7 = [x for x in russ7 if x["exame"] not in ANOS_JULIA]
    base = deduplicar(julia + russ7)
    base.sort(key=lambda x: (x["exame"], x["reaplicacao"], x["num"]))
    for x in base:
        x.pop("_prio", None)
    erros = validar(base)
    if erros:
        print(f"ERRO: {len(erros)} problemas, ex.:", erros[:10])
        sys.exit(1)

    PRIVADO.mkdir(parents=True, exist_ok=True)
    (PRIVADO / "base.json").write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    for velho in LOTES.glob("L*.txt"):
        velho.unlink()
    man = escrever_lotes(base, LOTES)
    (PRIVADO / "lotes.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\nTOTAL: {len(base)} questões · {sum(1 for x in base if x['comentario'])} comentadas")
    print(f"lotes: {sum(m['modo'] == 'classificar' for m in man)} classificar · "
          f"{sum(m['modo'] == 'explicar' for m in man)} explicar")
    provas = defaultdict(list)
    for x in base:
        provas[(x["exame"], x["reaplicacao"])].append(x["num"])
    for (exame, reap), nums in sorted(provas.items()):
        faltam = sorted(set(range(1, max(nums) + 1)) - set(nums))
        print(f"  {romano(exame):>6}{'r' if reap else ' '} {len(nums):3d} (máx {max(nums)})"
              + (f" faltam {faltam}" if faltam else ""))


if __name__ == "__main__":
    main()
