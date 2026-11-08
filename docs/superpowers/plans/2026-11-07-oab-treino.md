# OAB Treino — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).
>
> **Revisão 2 (2026-11-07):** incorpora 38 dos 39 achados da revisão independente (3 lentes). As decisões estão no ledger `.superpowers/sdd/2026-11-07-oab-treino/progress.md`.

**Objetivo:** APK Android offline para o Pádua treinar a 1ª fase da OAB com ~3.700 questões oficiais explicadas por um swarm de agentes, mais inéditas com pegadinhas.

**Arquitetura:** Scripts Python montam o banco a partir de duas bases do Hugging Face e preparam lotes; workflows do Claude Code (Haiku 5.5 → Sonnet 5.5 → Opus 5.5) classificam, resolvem às cegas e explicam; `juntar.py` gera `web/questoes.js`. A interface é HTML/CSS/JS puro em `web/`, empacotada como assets num APK cuja única Activity (Java) é um WebView.

**Tech stack:** Python 3.14 via `uv` (+ `pyarrow` só para ler parquet) · Workflow do Claude Code · HTML/CSS/JS sem framework · Node 26 (`node --test`) · Android Gradle Plugin 8.13.0 + Gradle 8.14.3 + JDK 17 (em cache no PC) · emulador Android 15 (WHPX).

**Spec:** `docs/superpowers/specs/2026-11-07-app-oab-treino-design.md`

## Restrições globais

- Só a 1ª fase; uso pessoal (sem Play Store). 100% offline; sem IA no celular.
- Android 7+ (`minSdk 24`), `targetSdk 34`, `compileSdk 35`.
- Letra base ≥ 20 px; A- / A+ alterna entre 18, 20, 22, 24, 26 px. O app ignora a escala de fonte do sistema (`setTextZoom(100)`): o A-/A+ é o único controle.
- Início: "Olá, Pádua". Rodapé: "Feito para o Pádua" / "by Otávio · © 2026 Otávio. Todos os direitos reservados."
- Abaixo de cada explicação: "Explicação gerada por IA — na dúvida, confira na lei."
- Tema AMOLED: fundo `#000000`, superfície `#0F0F11`, borda `#24242A`, texto `#ECE8E1`, texto secundário `#A39E96`, dourado `#D4B26A`, brilho azul-marinho `#0F1E3D` (só no topo do início), certo `#5CCB8F`, errado `#F07A72`, aviso `#E8B94A`. Barras do sistema pretas.
- Fontes: títulos `"Noto Serif", Georgia, serif`; texto `Roboto, "Segoe UI", sans-serif`.
- Animações ≤ 600 ms; `prefers-reduced-motion: reduce` desliga todas.
- Simulado completo: 80 questões, 5 h. "Aprovado" ≥ 50% só no Completo e na Prova oficial. Mini: 10 / 20 / 30. O cronômetro pausa com o app fechado.
- Matérias (chaves, na ordem da prova): `etica, filosofia, constitucional, direitos_humanos, eleitoral, internacional, financeiro, tributario, administrativo, ambiental, civil, eca, consumidor, empresarial, processo_civil, penal, processo_penal, previdenciario, trabalho, processo_trabalho`.
- Swarm: Haiku 5.5 (`model: 'haiku'`) → Sonnet 5.5 (`model: 'sonnet'`, `effort: 'high'`) → Opus 5.5 (`model: 'opus'`, `effort: 'high'`).
- **Às cegas de verdade:** tudo que tem gabarito (`base.json`, `lotes.json`) fica em `dados/privado/`; os agentes recebem só `dados/trabalho/lotes/*.txt` e o prompt manda não abrir nenhum outro arquivo.
- Python sempre como `uv run --no-project --with pyarrow python -I <script>`, a partir de `D:\App pai`; todo script começa com `sys.stdout.reconfigure(encoding="utf-8")` (com `-I` o Windows ignora `PYTHONIOENCODING`).
- **Portão do APK:** antes de todo `assembleDebug`, rodar `dados/teste_banco.py` e `node --test testes/`; só gerar o APK se os dois passarem.
- A pasta não é repositório git: passos de commit omitidos.

## Foco da revisão

1. **App fechado no meio do simulado** (o Android mata apps em segundo plano) → ao reabrir aparece "Continuar simulado" com as respostas e o tempo decorrido preservados (o cronômetro não andou enquanto estava fechado). Testes: Tarefa 6 e Tarefa 8, Passo 4.
2. **Questão longa, letra no máximo, tela estreita, fonte do sistema em 130%** → nada corta, sem rolagem horizontal, botões alcançáveis. Testes: Tarefa 7, Passo 5, e Tarefa 8, Passo 6.
3. **Toque acidental ou duplo** → alternativa só conta depois do Confirmar; Confirmar duas vezes registra uma vez; no simulado, trocar a alternativa substitui a anterior; começar um simulado novo com outro em andamento pede confirmação (padrão: Continuar). Testes: Tarefa 6 e Tarefa 7, Passo 4.
4. **Matéria sem questões suficientes** (antes do swarm terminar, ou matérias pequenas) → treino mostra mensagem amigável; mini usa o que existe e avisa. Teste: Tarefa 6.
5. **Botão Voltar do Android** → volta à tela anterior sem perder estado; no início, um único Voltar fecha o app; no resultado do simulado leva ao menu do simulado (nunca à prova entregue). Teste: Tarefa 8, Passo 5.

## Estrutura de arquivos

```
dados/montar_banco.py   bases → dados/privado/{base,lotes}.json + dados/trabalho/lotes/*.txt
dados/coletar.py        journal(s) de workflow → dados/trabalho/resultados/<nome>.json
dados/juntar.py         base + resultados + inéditas → web/questoes.js (e amostra/relote)
dados/teste_banco.py    testes assert de montar_banco, coletar e juntar
dados/fontes/           parquets baixados
dados/privado/          base.json, lotes.json, manifestos (contêm gabarito)
dados/trabalho/         lotes/*.txt (sem gabarito), resultados/, ineditas.json, auditoria/
web/index.html          esqueleto + tela de carregamento estática + <script>s
web/estilo.css          tema, layout, animações
web/logica.js           regras puras (sem DOM), testáveis no Node
web/app.js              telas, rotas, localStorage
web/questoes.js         GERADO: window.QUESTOES, window.DISTRIBUICAO
testes/logica.test.js   node --test
android/                projeto Gradle; assets = ../../web
.claude/launch.json     servidor local para testar no navegador
OAB-Treino.apk          entrega
```

---

### Tarefa 1: Banco base

**Arquivos:** criar `dados/montar_banco.py`, `dados/teste_banco.py`.

**Interfaces — produz:**
- `MATERIAS: list[str]` (as 20 chaves) e `validar(qs, exigir_materia=False) -> list[str]` (erros; vazia = ok) — reusados pelas Tarefas 2, 3 e 5.
- `limpar_texto(s: str) -> str`; `chave(s: str) -> str` (NFKD → ASCII → minúsculas → só `[a-z0-9]` → 160 caracteres); `exame_de(exam_id: str) -> tuple[int, bool]` (número, reaplicação).
- `carregar_russ7(caminho) -> list[dict]`, `carregar_julia(caminho) -> list[dict]` — formato da spec 4.5 **mais `reaplicacao: bool`**, com `materia`, `expl`, `pegadinha`, `desatualizada` = `None` e o campo transitório `_prio` (0 = julia, 1 = id antigo, 2 = id novo), removido antes de gravar.
- `deduplicar(qs) -> list[dict]`; `duplicatas_entre_exames(qs) -> list[list[str]]`; `escrever_lotes(qs, pasta) -> list[dict]` (manifesto).
- `dados/privado/base.json`; `dados/trabalho/lotes/L0001.txt…` em texto, **sem gabarito**: por questão, `### <id>`, o enunciado e `A) …` a `D) …`, quebrados em linhas de até 300 caracteres (`textwrap`, preservando parágrafos); `dados/privado/lotes.json` = lista de `{id: "L0001", arquivo: "<caminho absoluto>", modo: "explicar"|"classificar", gabarito: {qid: "A".."D"}}` (no modo `classificar`, `gabarito: {}`). Entradas de manifesto podem ter `ids: [qid]` opcional (Tarefa 4).

**Valores fixos:**
- Fontes (baixar só se faltar, com `urllib.request`): `https://huggingface.co/api/datasets/russ7/oab_exams_2011_2025_combined/parquet/default/train/0.parquet` → `dados/fontes/russ7.parquet`; `https://huggingface.co/api/datasets/juliadollis/oab-comentadas-leisllmv1/parquet/default/train/0.parquet` → `dados/fontes/julia.parquet`.
- `carregar_russ7` descarta linhas sem 4 alternativas ou com gabarito fora de 0–3 e imprime quantas (esperado: 18).
- Ids novos da russ7: `{"2018-01":25, "2018-02":26, "2018-03":27, "2019-01":28, "2019-02":29, "2019-03":30, "2020-01":31, "2021-01":32, "2021-02":33, "2022-01":34, "2022-02":35, "2022-03":36, "2023-01":37, "2024-01":40, "2024-02":41, "2025-01":43}`. Demais `AAAA-NN[a]` → exame `NN`; sufixo `a` = reaplicação. Ano = `AAAA`.
- Anos da julia: `{38:2023, 39:2023, 40:2024, 41:2024, 42:2024, 43:2025, 44:2025, 45:2025}`. `alternativas` é JSON `[{letra, texto}]`; `resposta` é letra; `comentario` → `comentario`; `lei` → `base_legal`.
- Id: `e{exame}{"r" se reaplicação}q{num}` (ex.: `e43q12`, `e20rq5`).
- `deduplicar`: ordena por (`0 se comentario senão 1`, `_prio`, id) e mantém a primeira de cada grupo em **duas passadas**: por `chave(enunciado) + chave(" ".join(alt))[:80]` e depois por `(exame, reaplicacao, num)`. Imprime quantas cada passada removeu.
- `duplicatas_entre_exames`: grupos com a mesma chave de texto e números de exame diferentes. O `main()` aborta se houver algum (isso valida a tabela de ids novos).
- Lotes: `classificar` = as comentadas, **25** por lote; `explicar` = as outras, 15 por lote, do exame mais novo para o mais antigo.

- [ ] **Passo 1: testes que falham** — `dados/teste_banco.py`, funções `teste_*` com `assert`, chamadas no `__main__`:
  - `teste_limpar_texto`: `"O contrato foi\nfirmado em 2020."` → `"O contrato foi firmado em 2020."`; `"Analise:\nI – primeiro\nII – segundo"` mantém as quebras antes de `I` e `II`; `"pala-\nvra"` → `"palavra"`.
  - `teste_exame_de`: `"2013-10"`→`(10, False)`, `"2016-20a"`→`(20, True)`, `"2024-01"`→`(40, False)`, `"2018-01"`→`(25, False)`, `"2010-01"`→`(1, False)`.
  - `teste_deduplicar`: duas cópias do mesmo enunciado, uma com `comentario` e `certa=1`, outra sem e `certa=2` → sobra 1, com `certa == 1`.
  - `teste_deduplicar_por_id`: mesmo id `e25q3`, textos diferentes, `_prio` 1 e 2 → sobra a de `_prio` 1, em qualquer ordem de entrada.
  - `teste_duplicatas_entre_exames`: mesmo texto nos exames 25 e 26 → 1 grupo; mesmo texto no exame 20 e na reaplicação do 20 → nenhum.
  - `teste_validar`: questão com 3 alternativas → um erro contendo o id.
  - `teste_escrever_lotes`: 20 questões (4 comentadas) → modos `["classificar", "explicar", "explicar"]`; nenhuma linha dos .txt com mais de 300 caracteres; todo id do gabarito aparece como `### <id>`; `certa=1` → `"B"`.
  - `teste_base_real` (só se `dados/privado/base.json` existir): 3.600 ≤ total ≤ 3.820 (máximo possível: 100 nos exames I–III, 80 nos demais, mais as 2 reaplicações); exatamente 614 com `comentario`; `validar(base) == []`; ids únicos; exames 1 a 45 presentes; por `(exame, reaplicacao)`, `num` únicos e no máximo 100 (exames ≤ 3) ou 80.
- [ ] **Passo 2:** `uv run --no-project --with pyarrow python -I dados/teste_banco.py` → falha com `ModuleNotFoundError: montar_banco`.
- [ ] **Passo 3:** implementar `dados/montar_banco.py`. O `main()` baixa, carrega, deduplica, aborta se houver duplicata entre exames ou erro de `validar`, grava base, lotes e manifesto e imprime: descartadas, removidas por passada, total, comentadas, e por exame a quantidade, o maior `num` e os `num` faltando.
- [ ] **Passo 4:** rodar `montar_banco.py` → ~3.700 questões, 614 comentadas, 25 lotes `classificar`, ~205 `explicar`, nenhuma duplicata entre exames.
- [ ] **Passo 5:** rodar os testes → todos passam, inclusive `teste_base_real`.

### Tarefa 2: Piloto do swarm + coleta

**Arquivos:** criar `dados/coletar.py`. O script do workflow vai inline na chamada do Workflow; o tool salva o arquivo e devolve o caminho, que as Tarefas 4 e 9 reusam com `scriptPath`.

**Interfaces:**
- Consome: `dados/privado/lotes.json` (Tarefa 1).
- Produz: workflow `oab-explicacoes` com `args = {lotes: [entradas do manifesto], modelo_inicial: "haiku"|"sonnet"}` (padrão `"haiku"`). Devolve só um agregado: `{lotes, bateu_inicial, bateu_sonnet, opus: {gabarito_ok, desatualizada, gabarito_errado}, lotes_falhos: [lote], faltando: {lote: [qid]}}`.
- Produz: `coletar.py <saida.json> <journal1> [journal2 …] [--ineditas]` → `{qid: {chave: item}}`, chave ∈ `classificar, haiku, sonnet, opus, auditoria` (prefixo do label). Vários journals se juntam; para o mesmo (qid, chave) vence o último. Com `--ineditas`, grava a lista de inéditas (Tarefa 5).
- **Formato do journal (verificado):** linhas `{"type":"started", agentId, label, …}` e `{"type":"result", agentId, result}`; o label sai do `started` com o mesmo `agentId`.

**Schemas** (exatos):
- `explicacoes`, `alternativas`: `{type: "array", items: {type: "string"}, minItems: 4, maxItems: 4}`.
- `resposta`, `certa`: `{enum: ["A", "B", "C", "D"]}`; `materia`: `{enum: MATERIAS}`.
- `pegadinha`, `motivo`, `problema`: `{type: ["string", "null"]}`.
- `S_CLASSIFICAR = itens[{id, materia}]`, `S_EXPLICAR = itens[{id, materia, resposta, confianca: enum alta|media|baixa, explicacoes, base_legal: string, pegadinha}]`, `S_OPUS = itens[{id, veredito: enum gabarito_ok|desatualizada|gabarito_errado, explicacoes, base_legal, pegadinha, motivo}]`; todo `itens` com `minItems: 1`.

**Script do workflow:**
- `meta.phases`: `Inicial`, `Sonnet` (model sonnet), `Opus` (model opus).
- `pipeline(args.lotes, inicial, sonnet, opus)`:
  - **inicial(lote):** modo `classificar` → `S_CLASSIFICAR`, label `classificar:<lote>`, e **termina aqui**: sem comparar nem escalar; ids ausentes na saída vão para `faltando`. Modo `explicar` → `S_EXPLICAR`, model `args.modelo_inicial`, label `<modelo>:<lote>`. Agente `null` → lote em `lotes_falhos`.
  - **comparar (no script, só no modo explicar):** divergentes = ids pedidos cuja `resposta` ≠ `lote.gabarito[id]` ou que faltaram na saída.
  - **sonnet(divergentes):** só se a lista não estiver vazia e `modelo_inicial == "haiku"`. Mesmo prompt e schema de `explicar` com `{alvo}` = os ids, `effort: 'high'`, label `sonnet:<lote>`.
  - **opus(restantes):** só se a lista não estiver vazia. `S_OPUS`, label `opus:<lote>`; o prompt traz, por id, o gabarito oficial e as respostas anteriores.
  - **faltando** = todo id pedido que terminou sem resultado utilizável: ausente no `classificar`; no `explicar`, não bateu no inicial nem no sonnet e não tem item do opus (inclusive quando sonnet ou opus devolveram `null`).
  - Entrada com `ids` → o inicial usa `{alvo}` = esses ids e o comparar considera só eles.
- **Fim comum dos prompts:** "Leia apenas o arquivo indicado; não abra nenhum outro arquivo. Se o Read avisar que o arquivo é grande, leia em partes com offset/limit até o fim."
- **Prompt `explicar`** (`{arquivo}` e `{alvo}` substituídos — `{alvo}` = "do arquivo" ou "com os ids X, Y, Z"):
  > Você é professor de cursinho para a 1ª fase da OAB. Leia o arquivo {arquivo} com questões de múltipla escolha (não há gabarito). Para cada questão {alvo}: (1) classifique a matéria com uma das chaves permitidas; (2) resolva você mesmo, pela lei brasileira vigente em 2026, e dê a letra correta em `resposta`, com `confianca`; (3) em `explicacoes`, escreva para A, B, C e D, nesta ordem, 1 a 3 frases simples dizendo por que a alternativa está certa ou errada, citando artigo, súmula ou tema quando houver; (4) `base_legal`: os dispositivos principais; (5) `pegadinha`: se alguma alternativa errada é armadilha clássica da FGV (prazo trocado, "sempre/nunca", exceção virando regra, competência trocada etc.), explique em 1 frase; senão null. Devolva todas as questões pedidas.
- **Prompt `classificar`:** "Leia o arquivo {arquivo} e devolva, para todas as questões, só o `id` e a `materia` (uma das chaves permitidas)."
- **Prompt `opus`:**
  > Em cada questão abaixo (arquivo {arquivo}), os modelos discordaram do gabarito oficial da FGV. Para cada id você recebe o gabarito oficial e as respostas dos modelos. Decida o `veredito`: `gabarito_ok` (o oficial está certo e a questão é difícil — explique pelo gabarito oficial; `motivo` null); `desatualizada` (o oficial estava certo na época, mas a lei ou a jurisprudência mudou — explique pela lei da época e diga em `motivo`, em 1 ou 2 frases, o que mudou e qual seria a resposta hoje); `gabarito_errado` (erro de transcrição ou questão anulada — diga por quê em `motivo`). Escreva `explicacoes` (A–D), `base_legal` e `pegadinha` como um professor de cursinho.

- [ ] **Passo 1:** rodar o workflow com os 25 lotes `classificar` + os 2 primeiros `explicar`.
- [ ] **Passo 2: teste que falha** — `teste_coletar_piloto` (só se `dados/trabalho/resultados/piloto.json` existir): 614 ids com `classificar`; os 30 ids dos 2 lotes `explicar` com alguma chave; todo item de explicação com 4 `explicacoes`; toda `materia` em `MATERIAS`.
- [ ] **Passo 3:** implementar `coletar.py`.
- [ ] **Passo 4:** `coletar.py dados/trabalho/resultados/piloto.json <journal>` e rodar os testes → passam.
- [ ] **Passo 5:** conferir na mão 5 explicações do piloto (português simples, artigo citado, A–D na ordem) e a taxa de acerto às cegas do Haiku (perto de 100% é suspeito: indicaria que viu o gabarito). Ajustar o prompt antes da Tarefa 4, se precisar.

### Tarefa 3: Junção → `web/questoes.js`

**Arquivos:** criar `dados/juntar.py`; testes em `dados/teste_banco.py`.

**Interfaces:**
- Consome: `dados/privado/base.json`, `dados/trabalho/resultados/*.json` (Tarefa 2), `dados/trabalho/ineditas.json` se existir (Tarefa 5), `MATERIAS` e `validar` (Tarefa 1).
- Produz: `mesclar_resultados(pasta) -> dict`, `aplicar_resultados(base, res) -> list[dict]`, `suavizar_materias(qs) -> None`, `distribuicao(qs) -> dict[str, int]`, `escrever_js(qs, dist, caminho)`; arquivo `web/questoes.js` = `window.QUESTOES = [...]; window.DISTRIBUICAO = {...};`.
- Opções: `--amostra N` e `--relotear <materia>` (Tarefa 9).

**Regras:**
- `mesclar_resultados`: ordem `piloto.json`, `swarm*.json` (por nome), `relote_*.json` (por nome), `auditoria.json`; para o mesmo (qid, chave), o arquivo posterior vence.
- Precedência da explicação: `auditoria` > `opus` > `sonnet` (se `"ABCD".index(resposta) == certa`) > `haiku` (idem) > sem explicação. `gabarito_errado` → questão removida. `desatualizada` → `desatualizada = motivo`.
- Matéria: do resultado de maior precedência que tiver; `classificar` para as comentadas. Sem matéria → fica fora do arquivo (imprime quantas).
- `suavizar_materias`: ignora inéditas; agrupa por `(exame, reaplicacao)`; decide sobre uma cópia das matérias (sem efeito cascata). Vizinhas = questões do grupo com `0 < |num - n| ≤ 2`. Só troca quando há 4 vizinhas, todas da mesma matéria e diferentes da questão. Pula o grupo, com aviso, se menos de 80% das questões têm alguma vizinha a ±1 da mesma matéria (prova sem blocos).
- `distribuicao`: exames 38–45 sem reaplicação e com ≥ 78 questões classificadas; matéria ausente conta 0; por matéria, a contagem mais comum (empate → a maior). Se a soma ≠ 80, imprime as contagens por exame e usa a tabela da spec 4.4.
- `escrever_js`: `json.dumps(..., ensure_ascii=False, separators=(",", ":"))`; só grava se `validar(qs, exigir_materia=True) == []`; imprime o tamanho do arquivo.

- [ ] **Passo 1: testes que falham:**
  - `teste_suavizar`: grupo com nums 11–15 = `[C, C, A, C, C]` (C = constitucional, A = administrativo) → o A vira C; `etica×8 + [filosofia, etica] + constitucional×6` → a `filosofia` não muda; uma inédita na lista não quebra; um grupo com buraco na numeração (1, 2, 3, 5, 6) usa a distância de `num`.
  - `teste_distribuicao`: 2 exames sintéticos com a tabela da spec → devolve a tabela; com exames somando 79 → devolve a tabela esperada.
  - `teste_precedencia`: Haiku errou e Sonnet acertou → Sonnet; Opus `gabarito_errado` → questão some; Opus `desatualizada` → campo preenchido; Haiku errou e não há Sonnet → `expl is None`.
  - `teste_mescla_resultados`: o mesmo (qid, `sonnet`) em `swarm.json` e `relote_civil.json` → vence o relote.
  - `teste_questoes_js_valido` (só se `web/questoes.js` existir): carrega o arquivo (tirando o prefixo `window.QUESTOES =`) e `validar(..., exigir_materia=True) == []`.
- [ ] **Passo 2:** rodar → falha com `ModuleNotFoundError: juntar`.
- [ ] **Passo 3:** implementar `dados/juntar.py`; o `main()` imprime total no arquivo, com explicação, sem matéria, desatualizadas, removidas, distribuição e tamanho.
- [ ] **Passo 4:** rodar os testes → passam. Rodar `juntar.py` com o piloto → `web/questoes.js` com as 614 comentadas + as do piloto.

### Tarefa 4: Swarm completo (segundo plano)

- [ ] **Passo 1:** disparar o Workflow com o `scriptPath` da Tarefa 2 e `args.lotes` = todos os lotes `explicar` menos os 2 do piloto.
- [ ] **Passo 2:** seguir com as Tarefas 5–8 enquanto roda. Se parar, retomar com `resumeFromRunId`.
- [ ] **Passo 3:** ao terminar, `coletar.py dados/trabalho/resultados/swarm.json <journals de todos os runs da cadeia>`. Montar um manifesto com os lotes de `lotes_falhos` (inteiros) + os `faltando` (com `ids`) e rodar de novo, gravando `swarm-r2.json`, `swarm-r3.json`…, até `faltando` ficar vazio ou parar de diminuir.
- [ ] **Passo 4:** `juntar.py` → toda questão `explicar` da base tem alguma chave nos resultados; ≥ 95% das oficiais com explicação.

### Tarefa 5: Inéditas e pegadinhas (segundo plano)

**Interfaces:** produz `dados/trabalho/ineditas.json` (spec 4.5 + `reaplicacao: false`; `origem: "inedita"`, id `in-<materia>-NN`, `exame`/`ano`/`num` = `null`). O `coletar.py --ineditas` renomeia `alternativas`→`alt`, `explicacoes`→`expl`, converte `certa` de letra para índice e tira a matéria do label `verif:<materia>`.

Workflow `oab-ineditas` = `pipeline(MATERIAS, autor, verificador)`; devolve `{materias_falhas: [...]}`:
- **autor** — Haiku, label `autor:<materia>`, schema `S_INEDITAS` = `questoes[{tema, enunciado, alternativas, certa, explicacoes, base_legal, pegadinha}]` com `minItems = maxItems = 10`:
  > Escreva 10 questões inéditas de múltipla escolha (A–D) para a 1ª fase da OAB, matéria {nome}, no estilo da FGV, sobre os temas que mais caem. Pelo menos 4 devem ter uma pegadinha clássica (descreva em `pegadinha`). Só uma alternativa certa pela lei vigente em 2026; se não tiver certeza de alguma mudança recente, evite o tema. Explicações simples, 1 a 3 frases por alternativa.
- **verificador** — Sonnet, `effort: 'high'`, label `verif:<materia>`, schema `S_VERIF` = mesmos campos + `status: enum aprovada|corrigida`, com `minItems: 0, maxItems: 10`. Autor `null` → pula o verificador e a matéria vai para `materias_falhas`. O prompt traz o JSON do autor embutido:
  > Questões a conferir: {json}. Confira cada uma pela lei vigente em 2026: a alternativa `certa` está mesmo certa? alguma outra também poderia estar? as explicações e a base legal estão corretas? Corrija o que for preciso e devolva só as que ficarem sem ambiguidade (descarte as outras).

- [ ] **Passo 1:** disparar o workflow (pode rodar junto com a Tarefa 4).
- [ ] **Passo 2:** `coletar.py dados/trabalho/ineditas.json <journal> --ineditas`. Rodar de novo as `materias_falhas`.
- [ ] **Passo 3: teste** `teste_ineditas` (se o arquivo existir): toda inédita com 4 alternativas, `certa` 0–3, 4 explicações, matéria válida; ≥ 5 por matéria e ≥ 150 no total.
- [ ] **Passo 4:** `juntar.py` → inéditas em `web/questoes.js`.

### Tarefa 6: Lógica do app

**Arquivos:** criar `web/logica.js`, `testes/logica.test.js`.

**Interfaces — produz** (UMD: `window.Logica` no navegador, `module.exports` no Node):
- `MATERIAS: [{chave, nome}]` — nomes: Ética Profissional, Filosofia do Direito, Direito Constitucional, Direitos Humanos, Direito Eleitoral, Direito Internacional, Direito Financeiro, Direito Tributário, Direito Administrativo, Direito Ambiental, Direito Civil, ECA, Direito do Consumidor, Direito Empresarial, Processo Civil, Direito Penal, Processo Penal, Direito Previdenciário, Direito do Trabalho, Processo do Trabalho.
- `criarRng(semente: number) -> () => number` (mulberry32). `temExplicacao(q) -> boolean` (`expl` ou `comentario`).
- `contagemTreino(questoes) -> {todas, pegadinhas, porMateria: {chave: n}}` — só questões com explicação.
- `filtrarTreino(questoes, filtro: "todas"|"pegadinhas"|chave, estado, rng) -> string[]` — só com explicação; não vistas primeiro (embaralhadas), depois as já vistas (embaralhadas).
- `novaSessao(ids) -> sessao` = `{fila: ids, pos: 0, confirmada: false}`; `confirmar(estado, sessao, questoes, letra, quando) -> {acertou, certa}` — registra só se `!sessao.confirmada` e então marca `confirmada`; `proxima(sessao) -> id|null`.
- `registrarResposta(estado, id, acertou: boolean, quando: number) -> void` — `estado.hist[id] = {n, ok, ultima: 0|1, ts}`.
- `errosPendentes(estado, questoes) -> string[]` — última resposta errada **e** com explicação.
- `provasDisponiveis(questoes) -> [{exame, reaplicacao, ano, total}]` — oficiais não desatualizadas, da mais nova para a mais antiga.
- `montarSimulado(questoes, opcoes, distribuicao, estado, rng) -> {ids, faltaram}`. `opcoes` = `{tipo: "completo"}` | `{tipo: "mini", materia, n}` | `{tipo: "prova", exame, reaplicacao}`. Nunca usa `desatualizada`. Completo: `distribuicao[m]` por matéria, prioriza não vistas e `ano >= 2018`, completa com as outras, ordena pelas matérias da prova. Prova: as do `(exame, reaplicacao)`, por `num`.
- `novoSimulado(opcoes, ids) -> sim` = `{opcoes, ids, respostas: {}, atual: 0, decorridoMs: 0, entregue: false}`; `responderSimulado(sim, id, letra) -> void` (substitui a anterior); `contarTempo(sim, ms) -> void` (soma em `decorridoMs`); `tempoRestanteMs(sim) -> number|null` = `max(0, 5h − decorridoMs)` no completo/prova, `null` no mini.
- `corrigir(questoes, sim) -> {acertos, total, pct, porMateria: {chave: {acertos, total}}, aprovado: boolean|null}` — `aprovado` = `pct >= 50` no completo/prova, `null` no mini.
- `registrarSimulado(estado, questoes, sim, quando) -> void` — ao entregar: `registrarResposta` para cada questão **respondida** (as em branco não contam) e `sim.entregue = true`.
- `desempenho(estado, questoes) -> [{chave, nome, respondidas, acertos, pct}]`; `resumoDoDia(estado, inicioDoDia) -> {respondidas, acertos}`.
- `carregarEstado(texto: string|null) -> estado` — `{versao: 1, hist: {}, simulado: null, fonte: 20}` quando vazio ou inválido.

- [ ] **Passo 1: testes que falham** (`node:test` + `node:assert/strict`; fixture com ~120 questões sintéticas cobrindo as 20 matérias, com 1 exame regular e sua reaplicação, 3 desatualizadas, 10 sem explicação e 15 com pegadinha):
  - `simulado completo tem 80 e respeita a distribuição` (contagem por matéria == `DIST`; nenhuma desatualizada); `simulado é determinístico com a mesma semente`.
  - `mini com n maior que o disponível usa o que existe e informa faltaram` (Foco 4).
  - `prova oficial traz o exame inteiro em ordem e sem desatualizadas`; `prova oficial não mistura exame regular e reaplicação`; `provasDisponiveis lista regular e reaplicação separadas`.
  - `treino ignora questões sem explicação e mostra não vistas primeiro`; `filtro pegadinhas só traz quem tem pegadinha`; `matéria sem questões devolve lista vazia` (Foco 4).
  - `confirmar duas vezes a mesma questão registra uma vez` (Foco 3); `responder de novo no simulado substitui a resposta` (Foco 3).
  - `erro e depois acerto sai dos erros pendentes`; `erro no simulado entra nos erros pendentes só se tiver explicação`; `questão em branco no simulado não conta`.
  - `aprovado com exatamente 50% no completo; null no mini`.
  - `estado inválido vira estado vazio`; `simulado em andamento sobrevive a JSON.stringify + carregarEstado`; `cronômetro só anda com contarTempo` e `tempoRestanteMs nunca fica negativo` (Foco 1).
  - `resumo do dia conta só respostas de hoje`.
- [ ] **Passo 2:** `node --test testes/` → falha com `Cannot find module '../web/logica.js'`.
- [ ] **Passo 3:** implementar `web/logica.js`.
- [ ] **Passo 4:** `node --test testes/` → tudo passa.

### Tarefa 7: Interface

**Arquivos:** criar `web/index.html`, `web/estilo.css`, `web/app.js`, `.claude/launch.json`.

**Interfaces:** consome `window.QUESTOES` e `window.DISTRIBUICAO` (Tarefa 3) e `window.Logica` (Tarefa 6). Produz a constante `NOME = "Pádua"` em `app.js` e o estado em `localStorage["oab-treino:v1"]`, gravado a cada mudança dentro de `try/catch`.

**Decisões:**
- Antes do CSS, carregar a skill `frontend-design:frontend-design` e seguir as Restrições globais (tema AMOLED, fontes, animações).
- `index.html` traz uma tela estática "Olá, Pádua — carregando questões…" antes do `<script src="questoes.js">`; o `app.js` troca pelo início quando termina de carregar.
- **Rotas por hash:** `#/` início · `#/treino` escolha · `#/treino/<filtro>` questões · `#/erros` · `#/simulado` escolha · `#/simulado/fazendo` · `#/simulado/resultado` · `#/simulado/revisar/<i>` · `#/desempenho`. Trocar de tela muda `location.hash`. Usam `history.replaceState` (sem entrar no histórico): rota vazia ou inválida → `#/`; próxima questão no mesmo modo; Entregar → `#/simulado/resultado`. `#/simulado/fazendo` sem simulado em andamento → `#/simulado`.
- **Início:** "Olá, Pádua"; frase do dia (5 frases fixas, escolhidas pelo dia do ano); "Hoje: N questões · X% de acerto" (oculto se N = 0); card "Continuar simulado" quando houver um em andamento; os 4 botões; A- / A+; rodapé exato.
- **Escolha do treino:** "Todas as matérias" · "Só pegadinhas" · as 20 matérias em lista com a contagem de `contagemTreino` (com 0 aparecem apagadas). "Revisar meus erros" mostra quantos erros estão pendentes.
- **Desempenho:** total respondido e uma barra por matéria (`desempenho()`), só das matérias já treinadas.
- **Questão (treino e erros)** usa `novaSessao`/`confirmar`/`proxima`: cabeçalho "Direito Civil · Exame XL · 2024 · Questão 12" (reaplicação: "Exame XX (reaplicação)"; inéditas: "Direito Civil · Inédita"); faixa de aviso quando `desatualizada`; 4 alternativas como botões grandes com a letra num círculo; **Confirmar** desabilitado até escolher e de novo depois do 1º toque; depois: "✓ Você acertou!" ou "✗ Não foi dessa vez — a certa é a C", explicação de cada alternativa (a certa marcada ✓, a escolhida marcada), "Base legal" recolhível, caixa "⚠ Pegadinha", aviso de IA, botão **Próxima questão**. O comentário corrido (as 614) aparece num bloco só.
- **Simulado — escolha:** Completo · Mini (matéria + 10/20/30) · Prova oficial (lista de `provasDisponiveis`: "Exame XLIII · 2025 · 77 questões"). Com um simulado em andamento, começar outro pede confirmação ("Você tem um simulado em andamento (respondeu N de M). Descartar e começar outro?"), e o botão destacado é **Continuar**.
- **Simulado — fazendo:** "Questão 12 de 80"; cronômetro de `tempoRestanteMs` (completo/prova; em 0 mostra "Tempo esgotado — pode continuar") ou do decorrido (mini); `contarTempo` a cada segundo com a página visível, parando no `visibilitychange`/`pagehide`; botão Mapa (grade numerada, respondidas preenchidas); Anterior / Próxima; Entregar com confirmação ("Você respondeu 75 de 80. Entregar mesmo assim?") → `registrarSimulado`. Grava o estado a cada resposta.
- **Simulado — resultado:** nota contando até o valor, "Aprovado" / "Ainda não" quando `aprovado !== null`, barras por matéria, lista ✓/✗ que abre a revisão.
- **Mensagens:** lista vazia → "Ainda não há questões explicadas desta matéria. Tente outra ou volte mais tarde."; mini com `faltaram > 0` → "Só existem N questões desta matéria — o simulado vai ter N."
- `.claude/launch.json`: `py -3 -m http.server 8765 --directory web`, porta 8765 (o launcher `py` existe no PC — verificado).

- [ ] **Passo 1:** escrever `index.html`, `estilo.css` e `app.js` com o início e o treino.
- [ ] **Passo 2:** abrir no navegador interno (375×812); responder uma certa e uma errada; conferir cores, animações, aviso de IA, Voltar do navegador e console sem erros.
- [ ] **Passo 3:** completar simulado, resultado, revisão, erros e desempenho.
- [ ] **Passo 4:** testar um mini inteiro (entregar com questões em branco), recarregar a página no meio do simulado (Foco 1), tocar Confirmar duas vezes (Foco 3), começar outro simulado com um em andamento (Foco 3) e abrir uma matéria vazia (Foco 4).
- [ ] **Passo 5 (Foco 2):** 320×640, fonte 26 px, abrir a questão de enunciado mais longo do banco → sem rolagem horizontal e botões visíveis. Prints das telas principais.

### Tarefa 8: APK e emulador

**Arquivos:** criar em `android/`: `settings.gradle`, `build.gradle`, `gradle.properties`, `local.properties`, wrapper (`gradlew.bat`, `gradle/wrapper/*`), `app/build.gradle`, `app/src/main/AndroidManifest.xml`, `app/src/main/java/br/otavio/oabtreino/MainActivity.java`, `app/src/main/res/values/strings.xml`, `app/src/main/res/values/themes.xml`, `app/src/main/res/drawable/ic_launcher.xml`, `app/src/main/res/drawable/ic_launcher_foreground.xml`, `app/src/main/res/drawable-anydpi-v26/ic_launcher.xml`.

**Decisões:**
- AGP `8.13.0`; JDK 17 do `JAVA_HOME`; Java puro, sem Kotlin e sem AndroidX. Wrapper: `"%USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3\bin\gradle.bat" -p android wrapper --gradle-version 8.14.3 --distribution-type all`, e conferir que `gradle-wrapper.properties` aponta para `gradle-8.14.3-all.zip` (a que está em cache).
- `local.properties`: `sdk.dir=` com o caminho do SDK do Android da máquina (ex.: `C\:/Users/<usuário>/AppData/Local/Android/Sdk`); fica fora do git.
- `app/build.gradle`: `namespace "br.otavio.oabtreino"`, `applicationId "br.otavio.oabtreino"`, `versionName "1.0"`, `minSdk 24`, `targetSdk 34`, `compileSdk 35`, `sourceSets.main.assets.srcDirs = ["../../web"]`. *(ponytail: targetSdk 34 evita a borda-a-borda obrigatória do Android 15 e o "voltar preditivo" do Android 16; subir só se um dia for para a Play Store.)*
- Manifest sem atributo `package`; `<activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|screenLayout|keyboardHidden">` com intent-filter MAIN/LAUNCHER; `android:icon="@drawable/ic_launcher"`; sem permissão de internet.
- `MainActivity extends Activity`: WebView com JavaScript e DOM storage ligados, `setTextZoom(100)`, `WebViewClient` padrão, fundo preto, carrega `file:///android_asset/index.html#/`. `onBackPressed`: `canGoBack()` ? `goBack()` : `finish()`.
- Tema `@android:style/Theme.Material.NoActionBar` com `statusBarColor`, `navigationBarColor` e `windowBackground` pretos (abre sem flash branco).
- Ícone: balança dourada `#D4B26A` sobre preto. `drawable/ic_launcher.xml` = vetor 48 dp (APIs 24–25); `drawable/ic_launcher_foreground.xml` = vetor 108×108 dp com a balança dentro do círculo central de 66 dp; `drawable-anydpi-v26/ic_launcher.xml` = `<adaptive-icon>` com fundo `@android:color/black` e esse foreground.
- **Assinatura estável:** depois do 1º build, copiar `%USERPROFILE%\.android\debug.keystore` para `android/assinatura.keystore` e apontar `signingConfigs.debug` para ele (alias `androiddebugkey`, senhas `android`). Assim as versões futuras instalam por cima da antiga sem apagar o progresso, mesmo que o projeto mude de PC.
- **Emulador (Git Bash, `S=/c/Users/<usuário>/AppData/Local/Android/Sdk`):** `echo no | "$S/cmdline-tools/latest/bin/avdmanager.bat" create avd -n oab_teste -k "system-images;android-35;default;x86_64" -d pixel_6`; `"$S/emulator/emulator.exe" -avd oab_teste -no-boot-anim -no-snapshot-save` em segundo plano; `adb wait-for-device` e esperar `adb shell getprop sys.boot_completed` = 1; `adb install -r …/app-debug.apk`; `adb shell am start -n br.otavio.oabtreino/.MainActivity`. Prints: `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png <destino>`.

- [ ] **Passo 1:** portão (testes Python + `node --test testes/`), criar os arquivos e rodar `android\gradlew.bat -p android assembleDebug` → `BUILD SUCCESSFUL`.
- [ ] **Passo 2:** subir o emulador, instalar, abrir o app; print do início; medir o tempo até o início aparecer (meta ≤ 3 s com o banco completo).
- [ ] **Passo 3 (persistência):** responder 1 questão; `adb shell input keyevent KEYCODE_HOME`; esperar 15 s (o WebView grava o localStorage com atraso); `adb shell am force-stop br.otavio.oabtreino`; reabrir → "Hoje: 1 questão". Se não persistir (repetir com 70 s antes de concluir), gravar o estado também por `addJavascriptInterface` num objeto Java que salva com `SharedPreferences.edit().putString(...).commit()`, e o `app.js` lê esse valor primeiro.
- [ ] **Passo 4 (Foco 1):** começar um mini, responder 3, HOME, esperar 15 s, force-stop, reabrir → "Continuar simulado" com as 3 respostas e o cronômetro onde parou.
- [ ] **Passo 5 (Foco 5):** `adb shell input keyevent KEYCODE_BACK` em cada tela → volta à anterior; no início, um único Voltar fecha o app; no resultado, leva ao menu do simulado.
- [ ] **Passo 6 (Foco 2 e acessibilidade):** `adb shell settings put system font_scale 1.3`, reabrir e abrir a questão mais longa com A+ no máximo → nada corta; voltar com `font_scale 1.0`. `adb shell settings put global animator_duration_scale 0`, reabrir → as animações somem (`matchMedia('(prefers-reduced-motion: reduce)').matches`); se não sumirem, a Activity lê `Settings.Global.ANIMATOR_DURATION_SCALE` e injeta a classe `sem-animacao` no `<html>`. Voltar com `animator_duration_scale 1`.
- [ ] **Passo 7:** copiar `android/app/build/outputs/apk/debug/app-debug.apk` para `D:\App pai\OAB-Treino.apk`.

### Tarefa 9: Auditoria por amostragem e versão final

**Interfaces:** consome os resultados do swarm; produz `dados/trabalho/resultados/auditoria.json` (chave `auditoria`, precedência máxima na Tarefa 3).

- [ ] **Passo 1:** `juntar.py --amostra 15` sorteia 15 questões por matéria explicadas só pelo Haiku e grava `dados/trabalho/auditoria/A01.txt…` (10 por arquivo, mesmo formato de texto dos lotes, agora com gabarito e as explicações atuais) e o manifesto `dados/privado/auditoria.json` (`[{id, arquivo}]`).
- [ ] **Passo 2:** workflow `oab-auditoria`: um agente Sonnet por arquivo (`effort: 'high'`, label `auditoria:<n>`), schema `itens[{id, ok: boolean, problema, explicacoes, base_legal, pegadinha}]` (tipos como na Tarefa 2):
  > Você revisa explicações de questões da OAB. Para cada questão do arquivo {arquivo} (gabarito oficial incluso), diga se as explicações estão corretas pela lei vigente em 2026. Se houver erro, reescreva as 4 explicações, a base legal e a pegadinha corrigidas; se estiver certo, repita-as.
- [ ] **Passo 3:** `coletar.py dados/trabalho/resultados/auditoria.json <journal>`; imprimir os erros por matéria. Matéria com ≥ 3 erros em 15 → `juntar.py --relotear <materia>` (manifesto em `dados/privado/lotes_<materia>.json`) e rodar o workflow da Tarefa 2 com ele e `modelo_inicial: "sonnet"`; coletar em `resultados/relote_<materia>.json`.
- [ ] **Passo 4:** `juntar.py` final → testes Python e `node --test testes/` passam.
- [ ] **Passo 5:** portão, rebuild do APK, reinstalar no emulador, repetir o Passo 3 da Tarefa 8 e copiar para `D:\App pai\OAB-Treino.apk`.
- [ ] **Passo 6:** revisão final independente: workflow com 3 revisores (lógica e dados; acessibilidade e usabilidade para o Pádua; visual minimalista e animações) sobre `web/` e `dados/`; corrigir o que for confirmado.
- [ ] **Passo 7:** na mensagem final ao usuário, instruções curtas de instalação: mandar o APK (WhatsApp, Drive ou cabo), liberar "instalar apps desconhecidos" e, nas próximas versões, instalar por cima (mantém o progresso).
