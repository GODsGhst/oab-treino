"""Junta o que os agentes devolveram em um ou mais runs de workflow (journal.jsonl) num arquivo só.

Rodar a partir de D:\\App pai:
    uv run --no-project python -I dados/coletar.py <saida.json> <journal1> [journal2 …] [--ineditas]

Sem --ineditas: {qid: {chave: item}}, chave = prefixo do label (classificar, haiku, sonnet, opus, auditoria).
Com --ineditas: lista de questões inéditas (formato da spec 4.5), tiradas dos agentes "verif:<materia>".
Para o mesmo (qid, chave), o journal posterior vence.
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CHAVES = {"classificar", "haiku", "sonnet", "opus", "auditoria"}
LETRAS = "ABCD"


def _resultados(journal):
    """(prefixo, sufixo, resultado) de cada agente que devolveu algo, na ordem do journal."""
    labels = {}
    for linha in Path(journal).read_text(encoding="utf-8").splitlines():
        if not linha.strip():
            continue
        ev = json.loads(linha)
        if ev.get("type") == "started":
            labels[ev["agentId"]] = ev.get("label") or ""
        elif ev.get("type") == "result" and isinstance(ev.get("result"), dict):
            prefixo, _, sufixo = labels.get(ev["agentId"], "").partition(":")
            yield prefixo, sufixo, ev["result"]


def coletar(journais):
    out = {}
    for journal in journais:
        for prefixo, _, res in _resultados(journal):
            if prefixo in CHAVES:
                for item in res.get("itens") or []:
                    out.setdefault(item["id"], {})[prefixo] = item
    return out


def coletar_ineditas(journais):
    por_materia = {}
    for journal in journais:
        for prefixo, materia, res in _resultados(journal):
            if prefixo == "verif":
                por_materia[materia] = res.get("questoes") or []
    out = []
    for materia, qs in sorted(por_materia.items()):
        for n, x in enumerate(qs, 1):
            out.append({"id": f"in-{materia}-{n:02d}", "origem": "inedita", "exame": None, "reaplicacao": False,
                        "ano": None, "num": None, "materia": materia, "enunciado": x["enunciado"],
                        "alt": x["alternativas"], "certa": LETRAS.index(x["certa"]), "expl": x["explicacoes"],
                        "comentario": None, "base_legal": x.get("base_legal") or None,
                        "pegadinha": x.get("pegadinha") or None, "desatualizada": None})
    return out


def main(argv):
    ineditas = "--ineditas" in argv
    resto = [a for a in argv if a != "--ineditas"]
    saida, journais = Path(resto[0]), resto[1:]
    dados = coletar_ineditas(journais) if ineditas else coletar(journais)
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{saida}: {len(dados)} {'inéditas' if ineditas else 'questões'}")


if __name__ == "__main__":
    main(sys.argv[1:])
