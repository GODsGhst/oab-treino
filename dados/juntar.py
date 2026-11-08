"""Junta base + resultados dos agentes + inéditas e gera web/questoes.js.

Rodar a partir de D:\\App pai:
    uv run --no-project python -I dados/juntar.py
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from montar_banco import LETRAS, MATERIAS, validar  # noqa: E402

PRIVADO, TRABALHO = AQUI / "privado", AQUI / "trabalho"
SAIDA = AQUI.parent / "web" / "questoes.js"

# spec 4.4 — usada quando os dados das provas 38–45 não fecham 80
ESPERADA = {"etica": 8, "filosofia": 2, "constitucional": 6, "direitos_humanos": 2, "eleitoral": 2,
            "internacional": 2, "financeiro": 2, "tributario": 5, "administrativo": 5, "ambiental": 2,
            "civil": 6, "eca": 2, "consumidor": 2, "empresarial": 4, "processo_civil": 6, "penal": 6,
            "processo_penal": 6, "previdenciario": 2, "trabalho": 5, "processo_trabalho": 5}
PRECEDENCIA = ("auditoria", "opus", "sonnet", "haiku", "classificar")


def _ordem_arquivo(p):
    """piloto < swarm < swarm-r2 < swarm-r3 … < relote_* < auditoria (o posterior vence)."""
    n = p.name
    if n == "piloto.json":
        return 0, 0, n
    if n.startswith("swarm"):
        m = re.match(r"swarm-r(\d+)\.json$", n)
        return 1, int(m[1]) if m else 0, n
    return (2 if n.startswith("relote_") else 3), 0, n


def mesclar_resultados(pasta):
    out = {}
    for arq in sorted(Path(pasta).glob("*.json"), key=_ordem_arquivo):
        for qid, chaves in json.loads(arq.read_text(encoding="utf-8")).items():
            out.setdefault(qid, {}).update(chaves)
    return out


_PREFIXO_LETRA = re.compile(r"^\s*\(?[A-D]\)?\s*[).:\-–]\s*")
_VEREDITO = re.compile(r"^(?:(CORRETA|Correta|CERTA|Certa)|(INCORRETA|Incorreta|ERRADA|Errada|FALSA|Falsa))\s*[.:]\s*")


def limpar_explicacao(e):
    """Tira a letra repetida do começo ("A) ") e padroniza o veredito em "Certa." / "Errada."."""
    e = _PREFIXO_LETRA.sub("", e, count=1)
    m = _VEREDITO.match(e)
    if m:
        e = ("Certa. " if m.group(1) else "Errada. ") + e[m.end():]
    return e.strip()


_MUDOU = re.compile(r"desatualiz|gabarito (da época|original)", re.I)
_NEGATIVO = re.compile(r"incorret|exceto|salvo|errad|fals[ao]|não\s+(é|está|corresponde|se\s+aplica|constitui|pode)", re.I)


def coerente(expl, certa, enunciado=""):
    """A alternativa do gabarito vem marcada "Certa." e nenhuma outra? (comando negativo não é conferido)"""
    if _NEGATIVO.search((enunciado or "")[-250:]):
        return True
    vereditos = [(re.match(r"\s*(Certa|Errada)\b", limpar_explicacao(e or "")) or [None, None])[1] for e in expl]
    return vereditos[certa] != "Errada" and all(v != "Certa" for i, v in enumerate(vereditos) if i != certa)


def _bateu(item, certa):
    return bool(item) and item.get("resposta") in LETRAS and LETRAS.index(item["resposta"]) == certa


def aplicar_resultados(base, res):
    out = []
    for original in base:
        q, r = dict(original), res.get(original["id"], {})
        opus = r.get("opus")
        if opus and opus.get("veredito") == "gabarito_errado":
            continue
        q["materia"] = next((r[c]["materia"] for c in PRECEDENCIA if (r.get(c) or {}).get("materia")), q.get("materia"))
        candidatas = [r.get("auditoria"), opus,
                      r["sonnet"] if _bateu(r.get("sonnet"), q["certa"]) else None,
                      r["haiku"] if _bateu(r.get("haiku"), q["certa"]) else None]
        # a primeira fonte cuja explicação concorda com o gabarito oficial (nunca uma que o inverta)
        fonte = next((c for c in candidatas if c and coerente(c["explicacoes"], q["certa"], q["enunciado"])), None)
        if fonte is None:
            # incoerente porque o próprio modelo diz que, com a lei nova, outra alternativa também ficou certa
            fonte = next((c for c in candidatas if c and any("desatualiz" in (e or "").lower() for e in c["explicacoes"])), None)
            if fonte:
                q["desatualizada"] = "Hoje outra alternativa também estaria certa. Veja as explicações."
        # o comentário da fonte julia (sem licença) não é publicado: a explicação revisada pelo Opus toma o lugar dele
        q["comentario"] = None
        if fonte:
            q["expl"] = [limpar_explicacao(e) for e in fonte["explicacoes"]]
            q["base_legal"] = fonte.get("base_legal") or None
            q["pegadinha"] = fonte.get("pegadinha") or None
            # a explicação publicada diz que a lei mudou depois da prova: faixa no treino e fora dos simulados
            if not q.get("desatualizada") and any(_MUDOU.search(e or "") for e in fonte["explicacoes"]):
                q["desatualizada"] = "Veja nas explicações o que mudou."
        if opus and opus.get("veredito") == "desatualizada":
            q["desatualizada"] = opus.get("motivo") or "Veja nas explicações o que mudou."
        if opus and opus.get("veredito") == "gabarito_ok":
            q["armadilha"] = True  # derrubou modelos e o gabarito estava certo: pegadinha de verdade
        out.append(q)
    return out


def aplicar_ineditas(extra, res):
    """Inéditas não têm gabarito oficial: a revisão corrige a explicação; se ela discorda da resposta, a inédita sai."""
    out = []
    for q in extra:
        q = dict(q, expl=[limpar_explicacao(e) for e in q["expl"]])
        rev = res.get(q["id"], {}).get("auditoria")
        if rev:
            if not coerente(rev["explicacoes"], q["certa"], q["enunciado"]):
                continue
            q.update(expl=[limpar_explicacao(e) for e in rev["explicacoes"]],
                     base_legal=rev.get("base_legal") or None, pegadinha=rev.get("pegadinha") or None)
        if q.get("pegadinha"):
            q["armadilha"] = True  # inédita escrita para treinar pegadinha
        out.append(q)
    return out


def _consenso(votos):
    """Matéria mais votada em cada posição (só onde ela tem pelo menos metade dos votos)."""
    out = {}
    for n, c in votos.items():
        materia, k = c.most_common(1)[0]
        if k / sum(c.values()) >= 0.5:
            out[n] = materia
    return out


def _concordancia(seq, cons):
    comuns = [n for n in seq if n in cons]
    return (sum(seq[n] == cons[n] for n in comuns) / len(comuns) if comuns else 0.0), len(comuns)


def alinhar_por_consenso(qs, juntar_se=0.82, alinhar_se=0.8, minimo=3):
    # juntar_se = 0.82: nos dados reais, provas da mesma época concordam 90–97% com o consenso e de épocas diferentes 62–74%
    """Agrupa provas de mesma estrutura e corrige a matéria de cada posição pela maioria do grupo.

    Só mexe numa prova se ela concordar ≥ alinhar_se com o consenso de um grupo de ≥ minimo provas;
    devolve as chaves (exame, reaplicacao) alinhadas. As outras ficam para a suavização local.
    """
    provas = defaultdict(dict)
    for q in qs:
        if q.get("origem") == "oficial" and q.get("num") is not None and q.get("materia"):
            provas[(q["exame"], q["reaplicacao"])][q["num"]] = q
    grupos = []
    for chave in sorted(provas):
        seq = {n: q["materia"] for n, q in provas[chave].items()}
        tamanho = max(seq)
        melhor, nota = None, juntar_se
        for g in grupos:
            if g["tamanho"] != tamanho:
                continue
            c, comuns = _concordancia(seq, _consenso(g["votos"]))
            if comuns >= 0.5 * len(seq) and c >= nota:
                melhor, nota = g, c
        if melhor is None:
            melhor = {"membros": [], "votos": defaultdict(Counter), "tamanho": tamanho}
            grupos.append(melhor)
        melhor["membros"].append(chave)
        for n, m in seq.items():
            melhor["votos"][n][m] += 1

    alinhadas, trocas = set(), 0
    for g in grupos:
        if len(g["membros"]) < minimo:
            continue
        cons = _consenso(g["votos"])
        for chave in g["membros"]:
            seq = {n: q["materia"] for n, q in provas[chave].items()}
            if _concordancia(seq, cons)[0] < alinhar_se:
                continue
            for n, q in provas[chave].items():
                if n in cons and q["materia"] != cons[n]:
                    q["materia"] = cons[n]
                    trocas += 1
            alinhadas.add(chave)
    grandes = [g["membros"] for g in grupos if len(g["membros"]) >= minimo]
    print(f"consenso: {len(alinhadas)} provas alinhadas em {len(grandes)} grupos, {trocas} matérias corrigidas")
    return alinhadas


def suavizar_materias(qs):
    """Corrige questão isolada no meio de um bloco de outra matéria (a prova vem em blocos por matéria)."""
    grupos = defaultdict(list)
    for q in qs:
        if q.get("origem") == "oficial" and q.get("num") is not None and q.get("materia"):
            grupos[(q["exame"], q["reaplicacao"])].append(q)
    trocas, pulados = 0, []
    for chave_grupo, g in sorted(grupos.items()):
        por_num = {q["num"]: q["materia"] for q in g}  # cópia: decide sem efeito cascata
        com_vizinha = sum(1 for n, m in por_num.items() if m in (por_num.get(n - 1), por_num.get(n + 1)))
        if com_vizinha < 0.8 * len(por_num):
            pulados.append(chave_grupo)
            continue
        for q in g:
            n = q["num"]
            viz = [por_num[v] for v in (n - 2, n - 1, n + 1, n + 2) if v in por_num]
            if len(viz) == 4 and len(set(viz)) == 1 and viz[0] != por_num[n]:
                q["materia"] = viz[0]
                trocas += 1
    print(f"suavização: {trocas} matérias corrigidas" + (f"; provas sem blocos (puladas): {pulados}" if pulados else ""))


def distribuicao(qs):
    por_exame = defaultdict(Counter)
    for q in qs:
        if q.get("origem") == "oficial" and 38 <= (q.get("exame") or 0) <= 45 and not q["reaplicacao"] and q.get("materia"):
            por_exame[q["exame"]][q["materia"]] += 1
    usados = {e: c for e, c in por_exame.items() if sum(c.values()) >= 78}
    if not usados:
        print("aviso: nenhuma prova 38–45 com ≥ 78 questões classificadas; usando a tabela da spec")
        return dict(ESPERADA)
    dist = {}
    for m in MATERIAS:
        freq = Counter(c.get(m, 0) for c in usados.values())
        topo = max(freq.values())
        dist[m] = max(v for v, f in freq.items() if f == topo)
    if sum(dist.values()) != 80:
        print(f"aviso: a distribuição dos dados soma {sum(dist.values())}; usando a tabela da spec. Contagens:")
        for e, c in sorted(usados.items()):
            print(f"   exame {e}: {dict(c)}")
        return dict(ESPERADA)
    return dist


def pendentes(base, res):
    """Questões oficiais que ainda não têm explicação utilizável (nem foram removidas)."""
    aplicadas = {q["id"]: q for q in aplicar_resultados(base, res)}
    return [q for q in base if q["id"] in aplicadas and not aplicadas[q["id"]].get("expl")]


def relotear(qs, pasta, prefixo, tamanho=10):
    """Grava lotes de texto (sem gabarito) só com estas questões e devolve as entradas do manifesto."""
    from montar_banco import formatar
    pasta.mkdir(parents=True, exist_ok=True)
    man = []
    for i in range(0, len(qs), tamanho):
        grupo = qs[i:i + tamanho]
        lid = f"{prefixo}{len(man) + 1:03d}"
        arq = (pasta / f"{lid}.txt").resolve()
        arq.write_text("\n\n".join(formatar(q) for q in grupo) + "\n", encoding="utf-8")
        man.append({"id": lid, "arquivo": str(arq), "modo": "explicar", "gabarito": {q["id"]: LETRAS[q["certa"]] for q in grupo}})
    return man


def amostra(qs, res, por_materia, semente=7):
    """Sorteia, por matéria, questões cuja explicação final veio só do Haiku (sem Sonnet, Opus ou auditoria)."""
    import random
    so_haiku = []
    for q in qs:
        r = res.get(q["id"], {})
        if q.get("comentario") or not q.get("expl") or r.get("auditoria") or r.get("opus"):
            continue
        if not _bateu(r.get("sonnet"), q["certa"]) and _bateu(r.get("haiku"), q["certa"]):
            so_haiku.append(q)
    rng, out = random.Random(semente), []
    for m in MATERIAS:
        grupo = sorted((q for q in so_haiku if q["materia"] == m), key=lambda q: q["id"])
        out += rng.sample(grupo, min(por_materia, len(grupo)))
    return out


def escrever_auditoria(qs, pasta, por_arquivo=10, prefixo="A"):
    """Arquivos de texto para a auditoria: questão, gabarito oficial e as explicações atuais."""
    from montar_banco import _quebrar, formatar
    pasta.mkdir(parents=True, exist_ok=True)
    man = []
    for i in range(0, len(qs), por_arquivo):
        grupo = qs[i:i + por_arquivo]
        aid = f"{prefixo}{len(man) + 1:03d}"
        blocos = []
        for q in grupo:
            extra = [f"Gabarito oficial: {LETRAS[q['certa']]}", "Explicações atuais:"]
            extra += [_quebrar(f"{L}) {e}") for L, e in zip(LETRAS, q["expl"])]
            extra += [_quebrar(f"Base legal: {q.get('base_legal') or '-'}"), _quebrar(f"Pegadinha: {q.get('pegadinha') or '-'}")]
            blocos.append(formatar(q) + "\n" + "\n".join(extra))
        arq = (pasta / f"{aid}.txt").resolve()
        arq.write_text("\n\n".join(blocos) + "\n", encoding="utf-8")
        man.append({"id": aid, "arquivo": str(arq), "ids": [q["id"] for q in grupo]})
    return man


def escrever_js(qs, dist, caminho):
    erros = validar(qs, exigir_materia=True)
    if erros:
        raise SystemExit(f"ERRO: {len(erros)} problemas, ex.: {erros[:10]}")
    texto = ("window.QUESTOES = " + json.dumps(qs, ensure_ascii=False, separators=(",", ":"))
             + ";\nwindow.DISTRIBUICAO = " + json.dumps(dist, separators=(",", ":")) + ";\n")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, encoding="utf-8")
    print(f"{caminho}: {len(qs)} questões, {len(texto.encode('utf-8')) / 1e6:.1f} MB")


def main():
    base = json.loads((PRIVADO / "base.json").read_text(encoding="utf-8"))
    pasta_res = TRABALHO / "resultados"
    res = mesclar_resultados(pasta_res) if pasta_res.exists() else {}
    if "--relotear-pendentes" in sys.argv:
        faltam = pendentes(base, res)
        man = relotear(faltam, TRABALHO / "lotes", "R")
        (PRIVADO / "lotes_reprocessar.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(faltam)} questões pendentes em {len(man)} lotes: {man[0]['id'] if man else '-'}…{man[-1]['id'] if man else '-'}")
        return
    qs = aplicar_resultados(base, res)
    removidas = len(base) - len(qs)
    ineditas = TRABALHO / "ineditas.json"
    n_ined = 0
    if ineditas.exists():
        extra = aplicar_ineditas(json.loads(ineditas.read_text(encoding="utf-8")), res)
        n_ined = len(extra)
        qs += extra
    alinhadas = alinhar_por_consenso(qs)
    suavizar_materias([q for q in qs if (q.get("exame"), q.get("reaplicacao")) not in alinhadas])
    if "--revisar" in sys.argv:
        # matérias com 3+ erros na auditoria: todas as explicações feitas só pelo Haiku passam pela revisão do Sonnet
        por_id = {q["id"]: q for q in qs}
        erros = Counter(por_id[i]["materia"] for i, v in res.items() if "auditoria" in v and not v["auditoria"]["ok"] and i in por_id)
        materias = {m for m, n in erros.items() if n >= 3}
        cands = sorted((q for q in amostra(qs, res, 10 ** 6) if q["materia"] in materias),
                       key=lambda q: (-(q["exame"] or 0), q["reaplicacao"], q["num"] or 0))
        man = escrever_auditoria(cands, TRABALHO / "revisao", prefixo="V")
        modelo = (AQUI / "wf_auditoria.js").read_text(encoding="utf-8")
        marca = "const arquivos = (args && args.arquivos) || []"
        assert marca in modelo
        (PRIVADO / "wf_revisao.js").write_text(modelo.replace(marca, "const arquivos = (args && args.arquivos) || "
                                                              + json.dumps(man, ensure_ascii=False)), encoding="utf-8")
        print(f"revisão: {len(cands)} questões de {len(materias)} matérias em {len(man)} arquivos → dados/privado/wf_revisao.js")
        return
    if "--amostra" in sys.argv:
        am = amostra(qs, res, int(sys.argv[sys.argv.index("--amostra") + 1]))
        man = escrever_auditoria(am, TRABALHO / "auditoria")
        (PRIVADO / "auditoria.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"amostra: {len(am)} questões em {len(man)} arquivos")
        return
    sem_materia = sum(1 for q in qs if not q.get("materia"))
    qs = [q for q in qs if q.get("materia")]
    dist = distribuicao(qs)
    escrever_js(qs, dist, SAIDA)
    com_expl = sum(1 for q in qs if q.get("expl") or q.get("comentario"))
    print(f"no arquivo: {len(qs)} · com explicação: {com_expl} · inéditas: {n_ined} · "
          f"desatualizadas: {sum(1 for q in qs if q.get('desatualizada'))} · removidas (gabarito errado): {removidas} · "
          f"fora por falta de matéria: {sem_materia}")
    print("distribuição:", dist)


if __name__ == "__main__":
    main()
