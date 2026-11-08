# OAB Treino — Especificação (1ª fase)

Data: 2026-11-07 · Status: aguardando revisão

## 1. Objetivo

App Android para o pai do usuário treinar para a **1ª fase (prova objetiva)** do Exame de Ordem.

**Sucesso:** ele abre o app sozinho, escolhe a matéria, responde e entende por que errou, sem precisar de ajuda.

**Fora do escopo agora:**
- 2ª fase (discursiva) — fica para um próximo projeto.
- Play Store — o app é de uso pessoal (as questões e os comentários vêm de bases de terceiros).

## 2. Telas e modos (aprovado)

- **Início:** Treinar questões · Fazer simulado · Revisar meus erros · Meu desempenho · Tamanho da letra (A- / A+).
- **Treinar questões (avulsas):** escolhe *Todas*, *uma matéria* ou *Só pegadinhas* → lê a questão → toca na alternativa → **[Confirmar]** → mostra ✓ certa / ✗ errada, a explicação de **cada** alternativa, a base legal e o aviso ⚠ de pegadinha → **[Próxima]**.
  - Usa só questões que têm explicação; prioriza as que ele ainda não viu.
  - Questões marcadas como desatualizadas aparecem com um aviso.
- **Fazer simulado:**
  - **Completo:** 80 questões, 5 h, distribuição oficial por matéria (seção 4.4), sorteadas do banco — prioriza não vistas e provas de 2018 em diante.
  - **Mini-simulado:** 1 matéria, 10 / 20 / 30 questões.
  - **Prova oficial:** refazer um exame inteiro (mostra quantas questões daquele exame existem no banco).
  - Simulados nunca usam questões desatualizadas.
  - **Durante:** sem correção; Anterior / Próxima; mapa das questões; pode sair e voltar depois (estado salvo). Cronômetro só informa, não encerra sozinho e pausa enquanto o app está fechado: no Completo e na Prova oficial mostra o tempo restante das 5 h; no Mini mostra o tempo decorrido.
  - Começar um simulado novo com outro em andamento pede confirmação; o botão destacado é "Continuar".
  - As respostas de um simulado entregue entram no histórico (erros e desempenho); questões em branco não contam.
  - **No fim:** nota e % de acerto, acertos por matéria e revisão questão a questão com a explicação (ou só o gabarito, quando a questão ainda não tiver explicação). No Completo e na Prova oficial aparece "Aprovado" / "Ainda não" pela regra da OAB (≥ 50%); no Mini, só o %.
- **Revisar meus erros:** questões cuja última resposta foi errada, com a mesma dinâmica das avulsas.
- **Meu desempenho:** total de questões respondidas e % de acerto por matéria.
- **Acessibilidade:** letra base grande (≥ 20 px) e ajustável; botões grandes; certo/errado indicado por cor **e** símbolo **e** texto; o botão Voltar do Android funciona; nada depende de gesto.

### 2.1 Visual e personalização

- **Feito para o Pádua**. A tela inicial abre com **"Olá, Pádua"**, uma frase curta de incentivo e o resumo do dia (ex.: "Hoje: 12 questões · 75% de acerto"). O nome fica numa constante no código.
- **Rodapé do início:** "Feito para o Pádua" e, abaixo, "by Otávio · © 2026 Otávio. Todos os direitos reservados."
- **Minimalista, tema escuro para tela AMOLED:** fundo preto puro (pixel apagado = bonito e economiza bateria), texto branco-quente (não branco puro, cansa menos a vista), dourado discreto como destaque e um leve brilho azul-marinho no topo do início. Verde e vermelho suaves para certo/errado, sempre com símbolo e texto. Barras de status e de navegação pretas.
- Títulos em fonte serifada (Noto Serif) e texto em Roboto — as duas já vêm no Android, sem baixar nada.
- Cartões com cantos arredondados, borda fina e bastante espaço; poucos elementos por tela; ícones simples sempre acompanhados de texto.
- **Animações suaves e curtas (≤ 600 ms):** troca de tela com fade e leve deslize; botão "afunda" de leve ao tocar; ao confirmar, a certa acende em verde e a errada dá uma tremidinha; as explicações aparecem em sequência; as barras de desempenho enchem; a nota do simulado conta até o valor final. Se o celular estiver com "remover animações" ligado, o app respeita.
- Abaixo de cada explicação, discreto: "Explicação gerada por IA — na dúvida, confira na lei."

## 3. Tecnologia (aprovado)

- APK Android (minSdk 24 = Android 7+). Casca mínima em Java com um WebView que carrega a interface local (HTML/CSS/JS em `assets/`). Sem internet, sem IA no celular.
- Dados em `assets/questoes.js` (`window.QUESTOES = [...]`), carregado por `<script>`.
- Progresso no `localStorage` do WebView. Teste obrigatório no emulador: fechar e reabrir o app mantém o progresso. Se não mantiver, gravar o estado também pelo Java (`addJavascriptInterface` + `SharedPreferences`), sem bibliotecas extras.
- Build com o Gradle e o Android SDK já instalados no PC. APK debug (assinado com a chave de debug) basta para instalar no celular.

## 4. Banco de questões

### 4.1 Fontes

| Base (Hugging Face) | Licença | Conteúdo |
|---|---|---|
| `russ7/oab_exams_2011_2025_combined` | MIT | Exames I–XXXVII, XL, XLI, XLIII (5.605 linhas, ~3.340 únicas) |
| `juliadollis/oab-comentadas-leisllmv1` | não declarada (uso pessoal) | Exames XXXVIII–XLV, 614 questões com comentário de cada alternativa |

Resultado esperado: **~3.700 questões únicas, exames I–XLV (2010–2025)** — no máximo 80 por prova (100 nos exames I–III), mais 2 reaplicações. Provas de 2026 ficam para depois (a partir dos PDFs da FGV).

### 4.2 Limpeza — `dados/montar_banco.py`

- Remove linhas sem alternativas (18) e deduplica por texto normalizado. Em duplicatas fica a versão comentada; se os gabaritos divergirem, vale o da base comentada.
- Número do exame: ids antigos `AAAA-NN` → exame NN. Ids novos `AAAA-seq` → mapeados pela ordem cronológica e conferidos pela sobreposição com a base comentada (2024-01 = XL, 2024-02 = XLI, 2025-01 = XLIII).
- Junta as quebras de linha que vieram do PDF, mantendo parágrafos e itens (I, II, III…).
- **Matéria:** as etiquetas das bases não servem (882 questões sem matéria, e nas provas de 2018+ a etiqueta não bate com a ordem da prova). Todas as questões são reclassificadas pelo swarm (4.3). Depois vem um "alisamento": dentro de cada exame as matérias vêm em blocos contínuos, então uma questão isolada no meio do bloco de outra matéria é corrigida para a matéria do bloco.
- **Self-check (`--check`):** toda questão com 4 alternativas, gabarito 0–3, matéria válida, ids únicos. Imprime contagem por exame e por matéria. Falha = não gera o APK.

### 4.3 Swarm de agentes (Workflow do Claude Code)

Os agentes leem lotes em `dados/trabalho/` e gravam os resultados lá. O script do workflow só coordena e compara respostas.

1. **Resolver às cegas e explicar** — Haiku 5.5, lotes de ~15 questões sem comentário: para cada questão classifica a matéria, escolhe a alternativa que acha certa **sem ver o gabarito** e já explica por que cada alternativa está certa ou errada, com base legal (artigo / súmula) e a pegadinha, se houver. As 614 comentadas só são classificadas (lotes de ~50).
2. **Comparar** (no script): resposta às cegas = gabarito → a explicação do Haiku vale.
3. **Escalar as que divergiram** — Sonnet 5.5 (effort alto) refaz às cegas e explica. Se ainda divergir do gabarito, o Opus 5.5 decide entre:
   - questão difícil → explica pelo gabarito;
   - gabarito errado na base ou questão anulada → a questão sai do banco;
   - a lei mudou → marca `desatualizada`, com o motivo.
4. **Inéditas e pegadinhas** — por matéria, Haiku 5.5 escreve ~10 questões no estilo FGV, nos temas que mais caem, com explicação e pegadinha. Sonnet 5.5 confere cada uma pela lei vigente e corrige ou descarta.
5. **Auditoria por amostragem** — Sonnet 5.5 confere 15 questões por matéria explicadas só pelo Haiku. Matéria com 3 ou mais erros em 15 é refeita pelo Sonnet.

**Matérias (20):** Ética, Filosofia, Constitucional, Direitos Humanos, Eleitoral, Internacional, Financeiro, Tributário, Administrativo, Ambiental, Civil, ECA, Consumidor, Empresarial, Processo Civil, Penal, Processo Penal, Previdenciário, Trabalho, Processo do Trabalho.

### 4.4 Distribuição do simulado completo

Calculada das provas XXXVIII–XLV depois da classificação (quantidade mais comum de cada matéria por prova). Valores esperados — se os dados mostrarem outra coisa, valem os dados:

Ética 8 · Filosofia 2 · Constitucional 6 · Direitos Humanos 2 · Eleitoral 2 · Internacional 2 · Financeiro 2 · Tributário 5 · Administrativo 5 · Ambiental 2 · Civil 6 · ECA 2 · Consumidor 2 · Empresarial 4 · Processo Civil 6 · Penal 6 · Processo Penal 6 · Previdenciário 2 · Trabalho 5 · Processo do Trabalho 5 = **80**

### 4.5 Formato de cada questão

```js
{
  id: "e43q12",              // inéditas: "in-civil-03"
  origem: "oficial",         // ou "inedita"
  exame: 43, ano: 2025, num: 12,   // null nas inéditas
  reaplicacao: false,        // true nas reaplicações dos exames VI e XX
  materia: "civil",
  enunciado: "…",
  alt: ["…", "…", "…", "…"], // A–D
  certa: 2,                  // 0–3
  expl: ["…", "…", "…", "…"],// por alternativa, ou null
  comentario: "…",           // comentário corrido (as 614), ou null
  base_legal: "…",           // ou null
  pegadinha: "…",            // ou null
  desatualizada: null        // ou "motivo"
}
```

### 4.6 Junção — `dados/juntar.py`

Base + explicações + escalonadas + inéditas → `app/src/main/assets/questoes.js`. Roda o self-check antes de escrever.

## 5. Ordem de trabalho

1. Montar o banco base (script Python).
2. Disparar o swarm de explicações (roda em segundo plano).
3. Enquanto isso, construir o app com as 614 comentadas.
4. Gerar inéditas e pegadinhas.
5. Juntar tudo e gerar o APK final. (O APK pode sair antes com o que já existir e ser regerado quando o swarm terminar.)

## 6. Testes

- Self-check do banco antes de cada APK.
- No navegador, em tamanho de celular: avulsa (acertar e errar), simulado (sair e voltar, entregar, ver nota), revisar erros, desempenho, A- / A+.
- No emulador Android: instalar o APK, repetir o fluxo principal, fechar e reabrir (progresso mantido), botão Voltar. Prints das telas.

## 7. Entrega

- `D:\App pai\OAB-Treino.apk`.
- Instruções curtas: mandar o arquivo para o celular dele (WhatsApp, Drive ou cabo) e liberar "instalar apps desconhecidos".

## 8. Riscos

- **Explicação gerada por IA pode errar.** Mitigação: resolver às cegas + escalonar para modelos maiores; aviso discreto no app ("explicações geradas por IA — na dúvida, confira na lei").
- **Questões antigas desatualizadas** (CPC/73, antes da Reforma Trabalhista, Lei 8.666 etc.). O swarm marca as que divergirem; o app mostra o ano de cada questão.
- **Uso do plano Claude:** o swarm consome bastante do limite, mesmo com Haiku na maioria dos agentes.
