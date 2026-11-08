"""Testes do banco de questões (assert puro, sem framework).

Rodar a partir de D:\\App pai:
    uv run --no-project --with pyarrow python -I dados/teste_banco.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
PRIVADO = AQUI / "privado"

import montar_banco as mb  # noqa: E402


def q(id, enunciado, certa=0, comentario=None, exame=1, num=1, prio=1, alt=None, reap=False):
    return {"id": id, "origem": "oficial", "exame": exame, "reaplicacao": reap, "ano": 2010, "num": num,
            "materia": None, "enunciado": enunciado, "alt": alt or ["a", "b", "c", "d"], "certa": certa,
            "expl": None, "comentario": comentario, "base_legal": None, "pegadinha": None,
            "desatualizada": None, "_prio": prio}


# ---------- Tarefa 1 ----------

def teste_limpar_texto():
    assert mb.limpar_texto("O contrato foi\nfirmado em 2020.") == "O contrato foi firmado em 2020."
    assert mb.limpar_texto("Analise:\nI – primeiro\nII – segundo") == "Analise:\nI – primeiro\nII – segundo"
    assert mb.limpar_texto("pala-\nvra") == "palavra"


def teste_exame_de():
    assert mb.exame_de("2013-10") == (10, False)
    assert mb.exame_de("2016-20a") == (20, True)
    assert mb.exame_de("2024-01") == (40, False)
    assert mb.exame_de("2018-01") == (25, False)
    assert mb.exame_de("2010-01") == (1, False)


def teste_deduplicar():
    comentada = q("e40q1", "Mesmo enunciado aqui.", certa=1, comentario="coment", exame=40, prio=0)
    outra = q("e40q1", "Mesmo enunciado aqui.", certa=2, exame=40, prio=2)
    r = mb.deduplicar([outra, comentada])
    assert len(r) == 1 and r[0]["certa"] == 1


def teste_deduplicar_por_id():
    antiga = q("e25q3", "Texto da versão antiga", exame=25, num=3, prio=1)
    nova = q("e25q3", "Texto da versão nova, extraída de outro jeito", exame=25, num=3, prio=2)
    for entrada in ([nova, antiga], [antiga, nova]):
        r = mb.deduplicar(entrada)
        assert [x["enunciado"] for x in r] == ["Texto da versão antiga"]


def teste_duplicatas_entre_exames():
    a = q("e25q3", "Mesmo texto em duas provas", exame=25, num=3)
    b = q("e26q9", "Mesmo texto em duas provas", exame=26, num=9)
    assert len(mb.duplicatas_entre_exames([a, b])) == 1
    regular = q("e20q4", "Texto repetido na reaplicação", exame=20, num=4)
    reap = q("e20rq4", "Texto repetido na reaplicação", exame=20, num=4, reap=True)
    assert mb.duplicatas_entre_exames([regular, reap]) == []


def teste_carregar_russ7_descarta_quebradas():
    import pyarrow as pa
    import pyarrow.parquet as pq

    def linha(num, textos, chave_gab=0):
        return {"exam_id": "2013-10", "question_number": str(num), "question": f"Enunciado {num}",
                "answerKey": str(chave_gab), "choices": {"label": list("ABCD")[:len(textos)], "text": textos}}
    linhas = [linha(1, ["a", "b", "c", "d"], 2), linha(2, ["a", "b", "c"]),
              linha(3, ["a", "", "c", "d"]), linha(4, ["a", "b", "c", "d"], 7)]
    with tempfile.TemporaryDirectory() as d:
        caminho = Path(d) / "r.parquet"
        pq.write_table(pa.Table.from_pylist(linhas), caminho)
        qs = mb.carregar_russ7(caminho)
    assert [(x["id"], x["certa"], x["exame"]) for x in qs] == [("e10q1", 2, 10)]


def teste_validar():
    ruim = q("e1q1", "x", alt=["a", "b", "c"])
    erros = mb.validar([ruim])
    assert erros and "e1q1" in erros[0]


def teste_escrever_lotes():
    qs = [q(f"e40q{i}", "Enunciado longo " * 40, certa=i % 4, exame=40, num=i,
            comentario=("c" if i < 5 else None)) for i in range(1, 21)]
    with tempfile.TemporaryDirectory() as d:
        man = mb.escrever_lotes(qs, Path(d))
        assert sorted(m["modo"] for m in man) == ["classificar", "explicar", "explicar"]
        for m in man:
            txt = Path(m["arquivo"]).read_text(encoding="utf-8")
            assert all(len(linha) <= 300 for linha in txt.splitlines())
            ids = m["gabarito"] if m["modo"] == "explicar" else [x["id"] for x in qs if x["comentario"]]
            for qid in ids:
                assert f"### {qid}" in txt
            assert all(letra in "ABCD" for letra in m["gabarito"].values())
        assert [m for m in man if m["modo"] == "classificar"][0]["gabarito"] == {}
        explicar = {k: v for m in man if m["modo"] == "explicar" for k, v in m["gabarito"].items()}
        assert explicar["e40q5"] == "B"  # certa=1 → B


# ---------- Tarefa 2 ----------

def teste_gerar_workflow():
    import gerar_workflow as gw
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "lotes.json").write_text(json.dumps([{"id": "L1", "arquivo": "a", "modo": "classificar", "gabarito": {}}]), encoding="utf-8")
        (d / "lotes_civil.json").write_text(json.dumps([{"id": "R1", "arquivo": "b", "modo": "explicar", "gabarito": {"e1q1": "C"}}]), encoding="utf-8")
        modelo = d / "modelo.js"
        modelo.write_text("const MANIFESTO = __MANIFESTO__\nreturn 1\n", encoding="utf-8")
        gw.gerar(d, modelo, d / "saida.js")
        saida = (d / "saida.js").read_text(encoding="utf-8")
        assert "__MANIFESTO__" not in saida
        embutido = json.loads(saida.split("const MANIFESTO = ", 1)[1].split("\n", 1)[0])
        assert embutido == {"L1": {"arquivo": "a", "modo": "classificar", "gabarito": {}},
                            "R1": {"arquivo": "b", "modo": "explicar", "gabarito": {"e1q1": "C"}}}
        modelo.write_text("__MANIFESTO__ __MANIFESTO__", encoding="utf-8")
        try:
            gw.gerar(d, modelo, d / "saida.js")
            raise RuntimeError("deveria recusar modelo com duas marcas")
        except AssertionError:
            pass


def _journal(pasta, nome, agentes):
    """agentes: lista de (label, resultado) → journal.jsonl no formato do Workflow."""
    linhas = [{"type": "launched"}]
    linhas += [{"type": "started", "key": f"k{i}", "agentId": f"a{i}", "label": lab, "phase": "x"} for i, (lab, _) in enumerate(agentes)]
    linhas += [{"type": "result", "key": f"k{i}", "agentId": f"a{i}", "result": res, "toolsUsed": "[]"} for i, (_, res) in enumerate(agentes)]
    caminho = Path(pasta) / nome
    caminho.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in linhas) + "\n", encoding="utf-8")
    return caminho


def _exp(id, resposta):
    return {"id": id, "materia": "civil", "resposta": resposta, "confianca": "alta",
            "explicacoes": ["a", "b", "c", "d"], "base_legal": "CC", "pegadinha": None}


def teste_coletar_journal():
    import coletar as co
    with tempfile.TemporaryDirectory() as d:
        j1 = _journal(d, "j1.jsonl", [
            ("classificar:L1", {"itens": [{"id": "e1q1", "materia": "etica"}]}),
            ("haiku:L2", {"itens": [_exp("e2q1", "A")]}),
            ("sonnet:L2", {"itens": [_exp("e2q1", "B")]}),
            ("opus:L2", {"itens": [{"id": "e2q1", "veredito": "gabarito_ok", "explicacoes": ["a", "b", "c", "d"],
                                    "base_legal": "x", "pegadinha": None, "motivo": None}]}),
            ("haiku:L3", None),
            ("revisor:x", {"itens": [{"id": "zz"}]}),
        ])
        r = co.coletar([j1])
        assert set(r) == {"e1q1", "e2q1"}
        assert r["e1q1"] == {"classificar": {"id": "e1q1", "materia": "etica"}}
        assert set(r["e2q1"]) == {"haiku", "sonnet", "opus"}
        j2 = _journal(d, "j2.jsonl", [("haiku:L2", {"itens": [_exp("e2q1", "C")]})])
        assert co.coletar([j1, j2])["e2q1"]["haiku"]["resposta"] == "C"


def teste_coletar_ineditas():
    import coletar as co
    q1 = {"tema": "t", "enunciado": "E1", "alternativas": ["a", "b", "c", "d"], "certa": "C",
          "explicacoes": ["1", "2", "3", "4"], "base_legal": "CF", "pegadinha": None, "status": "aprovada"}
    with tempfile.TemporaryDirectory() as d:
        j = _journal(d, "j.jsonl", [("autor:civil", {"questoes": [dict(q1, enunciado="RASCUNHO")]}),
                                    ("verif:civil", {"questoes": [q1, dict(q1, enunciado="E2", certa="A")]})])
        r = co.coletar_ineditas([j])
    assert [(x["id"], x["enunciado"], x["certa"]) for x in r] == [("in-civil-01", "E1", 2), ("in-civil-02", "E2", 0)]
    x = r[0]
    assert (x["origem"], x["materia"], x["exame"], x["reaplicacao"], x["alt"], x["expl"]) == \
        ("inedita", "civil", None, False, ["a", "b", "c", "d"], ["1", "2", "3", "4"])
    assert mb.validar(r, exigir_materia=True) == []


def teste_coletar_piloto():
    p = AQUI / "trabalho" / "resultados" / "piloto.json"
    if not p.exists():
        print("  (pulado: piloto.json ainda não existe)")
        return
    res = json.loads(p.read_text(encoding="utf-8"))
    base = json.loads((PRIVADO / "base.json").read_text(encoding="utf-8"))
    comentadas = {x["id"] for x in base if x["comentario"]}
    faltam = sorted(comentadas - {qid for qid, v in res.items() if "classificar" in v})
    assert not faltam, f"{len(faltam)} comentadas sem matéria: {faltam[:10]}"
    lotes = {m["id"]: m for m in json.loads((PRIVADO / "lotes.json").read_text(encoding="utf-8"))}
    for lid in ("L0026", "L0027"):
        for qid in lotes[lid]["gabarito"]:
            assert qid in res, f"{qid} sem resultado"
    for qid, v in res.items():
        for chave, item in v.items():
            if "materia" in item:
                assert item["materia"] in mb.MATERIAS, (qid, chave)
            if "explicacoes" in item:
                assert len(item["explicacoes"]) == 4, (qid, chave)


# ---------- Tarefa 3 ----------

def _of(num, materia, exame=40, reap=False, **extra):
    x = q(f"e{exame}{'r' if reap else ''}q{num}", f"Enunciado {exame}-{num}", exame=exame, num=num, reap=reap)
    x.pop("_prio")
    x["materia"] = materia
    x.update(extra)
    return x


def teste_suavizar():
    import juntar as ju
    C, A = "constitucional", "administrativo"
    g = [_of(n, m) for n, m in zip(range(11, 16), [C, C, A, C, C])]
    ju.suavizar_materias(g)
    assert [x["materia"] for x in g] == [C] * 5

    blocos = ["etica"] * 8 + ["filosofia", "etica"] + [C] * 6
    g = [_of(n, m, exame=41) for n, m in enumerate(blocos, 1)]
    ined = dict(_of(1, "civil"), id="in-civil-01", origem="inedita", exame=None, num=None)
    ju.suavizar_materias(g + [ined])
    assert [x["materia"] for x in g] == blocos

    g = [_of(n, m, exame=42) for n, m in zip([1, 2, 3, 5, 6], [C, C, A, C, C])]
    ju.suavizar_materias(g)
    assert g[2]["materia"] == A  # só 3 vizinhas pela numeração (falta a 4): não troca


def teste_alinhar_por_consenso():
    import juntar as ju
    Et, Fi, Co, PP = "etica", "filosofia", "constitucional", "processo_penal"
    # 40 posições com ~5% de erro por prova (o ruído real do classificador)
    layout = [Et] * 12 + [Fi] * 2 + [Co] * 13 + [PP] * 13
    deslocado = [Et] * 8 + [Fi] * 2 + [Co] * 13 + [PP] * 17      # outra época: 75% parecida, blocos deslocados
    erros = {41: {13: Et, 30: Co}, 42: {2: Co, 38: Et}, 43: {20: PP}, 44: {14: Co, 39: Fi}}

    def prova(exame, base, trocas=None):
        return [_of(n, (trocas or {}).get(n, m), exame=exame) for n, m in enumerate(base, 1)]

    provas = {e: prova(e, layout, t) for e, t in erros.items()}
    estranha = prova(45, deslocado)
    curta = prova(46, layout[:15], {3: Co})
    todas = [q for g in provas.values() for q in g] + estranha + curta
    alinhadas = ju.alinhar_por_consenso(todas)
    for e, g in provas.items():
        assert [x["materia"] for x in g] == layout, e   # inclusive o par de Filosofia (pos. 13–14) da prova 41
    assert [x["materia"] for x in estranha] == deslocado  # não é forçada no formato dos outros
    assert curta[2]["materia"] == Co                     # tamanho diferente: fica de fora
    assert alinhadas == {(41, False), (42, False), (43, False), (44, False)}

    # duas épocas seguidas com formatos 70% parecidos não podem se misturar (nos dados: 90–97% dentro, 62–74% entre épocas)
    DH = "direitos_humanos"
    epoca_b = [Et] * 8 + [Fi] * 2 + [Co] * 11 + [DH] * 2 + [PP] * 17   # 70% parecida com layout
    a = {e: prova(e, layout, {(e % 5) + 1: Co}) for e in (61, 62, 63)}
    b = {e: prova(e, epoca_b, {(e % 5) + 9: PP}) for e in (64, 65, 66)}
    ju.alinhar_por_consenso([q for g in list(a.values()) + list(b.values()) for q in g])
    assert all([x["materia"] for x in g] == layout for g in a.values())
    assert all([x["materia"] for x in g] == epoca_b for g in b.values())

    duas = [q for e in (51, 52) for q in prova(e, layout, {5: Co})]
    assert ju.alinhar_por_consenso(duas) == set()          # menos de 3 provas: não há consenso confiável


def teste_distribuicao():
    import juntar as ju
    def prova(exame, tabela):
        nums = iter(range(1, 200))
        return [_of(next(nums), m, exame=exame) for m, n in tabela.items() for _ in range(n)]
    assert ju.distribuicao(prova(40, ju.ESPERADA) + prova(41, ju.ESPERADA)) == ju.ESPERADA
    menor = dict(ju.ESPERADA, etica=7)  # 79 questões: soma ≠ 80 → volta para a tabela da spec
    assert ju.distribuicao(prova(40, menor) + prova(41, menor)) == ju.ESPERADA


def teste_precedencia():
    import juntar as ju
    base = [_of(1, None, certa=1), _of(2, None, certa=0), _of(3, None, certa=2), _of(4, None, certa=3)]
    opus = lambda id, v: {"id": id, "veredito": v, "explicacoes": ["o"] * 4, "base_legal": "x", "pegadinha": None, "motivo": "mudou a lei"}
    res = {
        "e40q1": {"haiku": _exp("e40q1", "A"), "sonnet": dict(_exp("e40q1", "B"), explicacoes=["s"] * 4)},
        "e40q2": {"haiku": _exp("e40q2", "C"), "opus": opus("e40q2", "gabarito_errado")},
        "e40q3": {"haiku": _exp("e40q3", "A"), "opus": opus("e40q3", "desatualizada")},
        "e40q4": {"haiku": _exp("e40q4", "A")},
    }
    r = {x["id"]: x for x in ju.aplicar_resultados(base, res)}
    assert r["e40q1"]["expl"] == ["s"] * 4 and r["e40q1"]["materia"] == "civil"
    assert "e40q2" not in r
    assert r["e40q3"]["desatualizada"] == "mudou a lei" and r["e40q3"]["expl"] == ["o"] * 4
    assert r["e40q4"]["expl"] is None and r["e40q4"]["materia"] == "civil"
    # questão que derrubou Haiku e Sonnet e o Opus confirmou o gabarito = armadilha de verdade (filtro "Só pegadinhas")
    res["e40q4"]["opus"] = opus("e40q4", "gabarito_ok")
    r = {x["id"]: x for x in ju.aplicar_resultados(base, res)}
    assert r["e40q4"]["armadilha"] is True and not r["e40q1"].get("armadilha")


def teste_explicacao_que_contradiz_o_gabarito_nao_entra():
    import juntar as ju
    boa = ["Certa. sim", "Errada. não", "Errada. não", "Errada. não"]
    invertida = ["Errada. não", "Certa. sim", "Errada. não", "Errada. não"]
    base = [_of(1, None, certa=0), _of(2, None, certa=0),
            dict(_of(3, None, certa=0), enunciado="Assinale a afirmativa incorreta.")]
    res = {
        # auditoria discordou da FGV e inverteu: volta para a explicação do Haiku, que está coerente
        "e40q1": {"haiku": dict(_exp("e40q1", "A"), explicacoes=boa),
                  "auditoria": {"id": "e40q1", "ok": False, "problema": "x", "explicacoes": invertida, "base_legal": "b", "pegadinha": None}},
        # nenhuma fonte coerente: fica sem explicação (vai para o reprocessamento)
        "e40q2": {"haiku": dict(_exp("e40q2", "A"), explicacoes=invertida)},
        # comando negativo: "Errada." na alternativa do gabarito é esperado
        "e40q3": {"haiku": dict(_exp("e40q3", "A"), explicacoes=invertida)},
    }
    r = {x["id"]: x for x in ju.aplicar_resultados(base, res)}
    assert r["e40q1"]["expl"] == boa
    assert r["e40q2"]["expl"] is None
    assert r["e40q3"]["expl"] == invertida
    # os próprios modelos dizem que outra alternativa ficou certa com a lei nova: entra, marcada como desatualizada
    dupla = ["Certa. na época", "Certa em 2026, mas a questão está desatualizada.", "Errada. x", "Errada. y"]
    r = ju.aplicar_resultados([_of(4, None, certa=0)], {"e40q4": {"haiku": dict(_exp("e40q4", "A"), explicacoes=dupla)}})
    assert r[0]["expl"] == dupla and r[0]["desatualizada"]


def teste_explicacao_que_diz_que_a_lei_mudou_marca_desatualizada():
    import juntar as ju
    base = [_of(n, None, certa=0) for n in range(1, 5)]
    expl = lambda fim: ["Certa. Pelo gabarito." + fim, "Errada. não", "Errada. não", "Errada. não"]
    rev = lambda id, fim: {"id": id, "ok": False, "problema": "x", "explicacoes": expl(fim), "base_legal": "b", "pegadinha": None}
    res = {
        "e40q1": {"auditoria": rev("e40q1", " Hoje a B também seria correta, então a questão está desatualizada.")},
        "e40q2": {"auditoria": rev("e40q2", " Certa pelo gabarito da época, antes da Lei 13.467/2017.")},
        "e40q3": {"auditoria": rev("e40q3", " Nada mudou.")},
        "e40q4": {"auditoria": rev("e40q4", " A questão está desatualizada."),
                  "opus": {"id": "e40q4", "veredito": "desatualizada", "explicacoes": expl(""), "base_legal": "x", "pegadinha": None,
                           "motivo": "A Lei X mudou o art. Y."}},
    }
    r = {x["id"]: x for x in ju.aplicar_resultados(base, res)}
    # a explicação publicada diz que a lei mudou: a questão leva a faixa e sai dos simulados
    assert r["e40q1"]["desatualizada"] and r["e40q2"]["desatualizada"]
    assert not r["e40q3"].get("desatualizada")
    assert r["e40q4"]["desatualizada"] == "A Lei X mudou o art. Y."  # o motivo do Opus tem prioridade


def teste_comentario_da_julia_nunca_e_publicado():
    import juntar as ju
    boa = ["Certa. sim", "Errada. não", "Errada. não", "Errada. não"]
    invertida = ["Errada. não", "Certa. sim", "Errada. não", "Errada. não"]
    rev = lambda id, ok, ex: {"id": id, "ok": ok, "problema": None if ok else "artigo errado", "explicacoes": ex, "base_legal": "b", "pegadinha": "p"}
    base = [_of(n, None, certa=0, comentario="A alternativa correta é a letra A.") for n in range(1, 5)]
    res = {
        "e40q1": {"auditoria": rev("e40q1", False, boa)},        # erro achado: vale a explicação revisada
        "e40q2": {"auditoria": rev("e40q2", True, boa)},         # comentário aprovado: também vale a explicação revisada
        "e40q3": {"auditoria": rev("e40q3", False, invertida)},  # revisor contrariou o gabarito e não houve desempate
        "e40q4": {"auditoria": rev("e40q4", False, invertida),   # desempate: lei nova → explicação do Opus com o aviso
                  "opus": {"id": "e40q4", "veredito": "desatualizada", "explicacoes": boa, "base_legal": "x", "pegadinha": None, "motivo": "mudou"}},
    }
    r = {x["id"]: x for x in ju.aplicar_resultados(base, res)}
    assert all(x["comentario"] is None for x in r.values())  # o texto da fonte julia (sem licença) não vai para o app
    assert r["e40q1"]["expl"] == boa and r["e40q1"]["base_legal"] == "b" and r["e40q1"]["pegadinha"] == "p"
    assert r["e40q2"]["expl"] == boa
    assert not r["e40q3"].get("expl")
    assert r["e40q4"]["expl"] == boa and r["e40q4"]["desatualizada"] == "mudou"
    assert [q["id"] for q in ju.pendentes(base, res)] == ["e40q3"]  # sem explicação utilizável: volta para o reprocessamento


def teste_revisao_das_ineditas():
    import juntar as ju
    boa = ["Certa. sim", "Errada. não", "Errada. não", "Errada. não"]
    invertida = ["Errada. não", "Certa. sim", "Errada. não", "Errada. não"]
    ined = lambda n: {"id": f"in-civil-{n:02d}", "origem": "inedita", "materia": "civil", "enunciado": "Assinale a correta.",
                      "alt": ["a", "b", "c", "d"], "certa": 0, "expl": ["A) CORRETA. velha", "Errada. b", "Errada. c", "Errada. d"],
                      "base_legal": "x", "pegadinha": "p", "comentario": None}
    rev = lambda id, ex: {"auditoria": {"id": id, "ok": False, "problema": "x", "explicacoes": ex, "base_legal": "nova", "pegadinha": None}}
    res = {"in-civil-01": rev("in-civil-01", boa), "in-civil-02": rev("in-civil-02", invertida)}
    r = {q["id"]: q for q in ju.aplicar_ineditas([ined(1), ined(2), ined(3)], res)}
    assert set(r) == {"in-civil-01", "in-civil-03"}  # inédita não tem gabarito oficial: se a revisão discorda da resposta, sai
    assert r["in-civil-01"]["expl"] == boa and r["in-civil-01"]["base_legal"] == "nova" and not r["in-civil-01"].get("armadilha")
    assert r["in-civil-03"]["expl"][0] == "Certa. velha" and r["in-civil-03"]["armadilha"] is True


def teste_explicacao_sem_letra_e_veredito_padronizado():
    import juntar as ju
    item = dict(_exp("e40q1", "A"), explicacoes=["A) CORRETA. Pelo art. 1º.", "B) Errada. Não.", "C - Incorreta: falso.", "D. ERRADA. ok"])
    r = ju.aplicar_resultados([_of(1, None, certa=0)], {"e40q1": {"haiku": item}})
    assert r[0]["expl"] == ["Certa. Pelo art. 1º.", "Errada. Não.", "Errada. falso.", "Errada. ok"]


def teste_pendentes_e_relote():
    import juntar as ju
    base = [_of(1, None, certa=0), _of(2, None, certa=1), dict(_of(3, None), comentario="c")]
    res = {"e40q1": {"haiku": _exp("e40q1", "A")}, "e40q2": {"haiku": _exp("e40q2", "C")}}
    p = ju.pendentes(base, res)
    assert [x["id"] for x in p] == ["e40q2", "e40q3"]  # comentada sem revisão também: o comentário não é publicado
    with tempfile.TemporaryDirectory() as d:
        man = ju.relotear(p, Path(d), "R", tamanho=10)
        assert [(m["id"], m["modo"], m["gabarito"]) for m in man] == [("R001", "explicar", {"e40q2": "B", "e40q3": "A"})]
        assert "### e40q2" in Path(man[0]["arquivo"]).read_text(encoding="utf-8")


def teste_amostra_auditoria():
    import juntar as ju
    base = [_of(n, None, certa=0) for n in range(1, 9)]
    res = {f"e40q{n}": {"haiku": dict(_exp(f"e40q{n}", "A"), materia="civil" if n <= 4 else "penal")} for n in range(1, 9)}
    res["e40q2"]["sonnet"] = _exp("e40q2", "A")  # explicada pelo Sonnet: fora da amostra
    res["e40q6"]["haiku"]["resposta"] = "B"       # Haiku errou: fora da amostra
    qs = ju.aplicar_resultados(base, res)
    am = ju.amostra(qs, res, por_materia=2, semente=1)
    ids = {q["id"] for q in am}
    assert len(am) == 4 and not ids & {"e40q2", "e40q6"}
    assert sorted(q["materia"] for q in am) == ["civil", "civil", "penal", "penal"]
    assert [q["id"] for q in ju.amostra(qs, res, por_materia=2, semente=1)] == [q["id"] for q in am]  # determinística
    with tempfile.TemporaryDirectory() as d:
        man = ju.escrever_auditoria(am, Path(d), por_arquivo=3)
        assert [len(m["ids"]) for m in man] == [3, 1]
        txt = Path(man[0]["arquivo"]).read_text(encoding="utf-8")
        assert "Gabarito oficial: A" in txt and "Explicações atuais:" in txt
        assert all(len(linha) <= 300 for linha in txt.splitlines())


def teste_mescla_resultados():
    import juntar as ju
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "swarm.json").write_text(json.dumps({"e1q1": {"sonnet": {"id": "e1q1", "resposta": "A"}, "haiku": {"id": "e1q1", "resposta": "B"}}}), encoding="utf-8")
        (d / "relote_civil.json").write_text(json.dumps({"e1q1": {"sonnet": {"id": "e1q1", "resposta": "C"}}}), encoding="utf-8")
        (d / "piloto.json").write_text(json.dumps({"e1q1": {"sonnet": {"id": "e1q1", "resposta": "D"}}}), encoding="utf-8")
        r = ju.mesclar_resultados(d)
        assert r["e1q1"]["sonnet"]["resposta"] == "C" and r["e1q1"]["haiku"]["resposta"] == "B"
        # reprocessamento (swarm-r2) vence o swarm original, apesar de "-" vir antes de "." na ordem alfabética
        (d / "relote_civil.json").unlink()
        (d / "swarm-r2.json").write_text(json.dumps({"e1q1": {"sonnet": {"id": "e1q1", "resposta": "A2"}}}), encoding="utf-8")
        assert ju.mesclar_resultados(d)["e1q1"]["sonnet"]["resposta"] == "A2"


def teste_questoes_js_valido():
    p = AQUI.parent / "web" / "questoes.js"
    if not p.exists():
        print("  (pulado: web/questoes.js ainda não existe)")
        return
    texto = p.read_text(encoding="utf-8")
    qs = json.loads(texto.split("window.QUESTOES = ", 1)[1].split(";\nwindow.DISTRIBUICAO", 1)[0])
    assert mb.validar(qs, exigir_materia=True) == []


# ---------- Tarefa 5 ----------

def teste_ineditas():
    p = AQUI / "trabalho" / "ineditas.json"
    if not p.exists():
        print("  (pulado: ineditas.json ainda não existe)")
        return
    ined = json.loads(p.read_text(encoding="utf-8"))
    assert mb.validar(ined, exigir_materia=True) == []
    assert all(len(x["expl"]) == 4 and x["origem"] == "inedita" for x in ined)
    por_materia = {m: sum(1 for x in ined if x["materia"] == m) for m in mb.MATERIAS}
    assert all(n >= 5 for n in por_materia.values()), por_materia
    assert len(ined) >= 150, len(ined)


def teste_base_real():
    p = PRIVADO / "base.json"
    if not p.exists():
        print("  (pulado: base.json ainda não existe)")
        return
    base = json.loads(p.read_text(encoding="utf-8"))
    assert 3600 <= len(base) <= 3820, len(base)
    # 614 da julia, menos as 4 que já vêm com comentário vazio na fonte (exame 38, q47–50) → vão para o swarm
    assert sum(1 for x in base if x["comentario"]) == 610
    assert mb.validar(base) == []
    assert len({x["id"] for x in base}) == len(base)
    assert {x["exame"] for x in base} >= set(range(1, 46))
    por_prova = {}
    for x in base:
        por_prova.setdefault((x["exame"], x["reaplicacao"]), []).append(x["num"])
    for (exame, _), nums in por_prova.items():
        assert len(nums) == len(set(nums)), (exame, "num repetido")
        assert len(nums) <= (100 if exame <= 3 else 80), (exame, len(nums))


if __name__ == "__main__":
    testes = [v for k, v in list(globals().items()) if k.startswith("teste_")]
    for t in testes:
        t()
        print("ok", t.__name__)
    print(f"{len(testes)} testes passaram")
