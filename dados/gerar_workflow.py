"""Gera dados/privado/wf_explicacoes.js com o manifesto (que tem os gabaritos) embutido.

Assim os ~3.000 gabaritos não passam pela conversa: a chamada do Workflow manda só a lista de lotes.
Rodar a partir de D:\\App pai:
    uv run --no-project python -I dados/gerar_workflow.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
AQUI = Path(__file__).resolve().parent
MARCA = "__MANIFESTO__"


def gerar(pasta_manifestos, modelo, saida):
    manifesto = {}
    for arq in sorted(pasta_manifestos.glob("lotes*.json")):
        for lote in json.loads(arq.read_text(encoding="utf-8")):
            manifesto[lote["id"]] = {k: lote[k] for k in ("arquivo", "modo", "gabarito")}
    texto = modelo.read_text(encoding="utf-8")
    assert texto.count(MARCA) == 1, "o modelo precisa ter exatamente uma marca __MANIFESTO__"
    saida.write_text(texto.replace(MARCA, json.dumps(manifesto, ensure_ascii=False)), encoding="utf-8")
    return manifesto


if __name__ == "__main__":
    destino = AQUI / "privado" / "wf_explicacoes.js"
    m = gerar(AQUI / "privado", AQUI / "wf_explicacoes.js", destino)
    print(f"{destino} gerado com {len(m)} lotes")
