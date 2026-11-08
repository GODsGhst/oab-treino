# OAB Treino

App Android para estudar para a 1ª fase do Exame de Ordem, feito para o meu pai, o Pádua. Funciona sem internet.

- **3.869 questões:** as provas oficiais do Exame de Ordem (exames I a XLV, de 2010 a 2025) e 199 questões inéditas no estilo da FGV.
- **Treino por matéria** com correção na hora: cada alternativa explica por que está certa ou errada, com a base legal e o aviso de pegadinha.
- **Simulados:** completo (80 questões em 5 horas, com a divisão oficial das matérias), mini por matéria e prova oficial inteira, com cronômetro, mapa e correção no final.
- **Revisar meus erros** e **Meu desempenho** por matéria.
- Tema escuro para tela AMOLED, letra grande e ajustável, botões grandes.

## Como as explicações foram feitas

As explicações foram geradas por IA (Claude) em etapas:

1. Um enxame de agentes Haiku resolveu cada questão sem ver o gabarito. Quando a resposta não batia, a questão subia para o Sonnet e depois para o Opus, que decidia se o gabarito estava certo, desatualizado ou errado.
2. Depois, toda explicação foi conferida com o gabarito oficial na mão: primeiro pelo Sonnet e depois pelo Opus. Quando uma revisão contrariava o gabarito, o Opus dava a palavra final.
3. Uma conferência automática garante que nenhuma explicação contradiz o gabarito. 18 questões ficaram marcadas como "a lei mudou depois desta prova" e 23 saíram do banco por gabarito errado na fonte.

## Estrutura

- `web/`: o app (HTML, CSS e JavaScript, sem framework). `questoes.js` é o banco de questões.
- `android/`: o projeto Android, uma Activity com WebView que abre `web/`.
- `dados/`: o pipeline em Python que monta o banco e os scripts dos workflows de agentes.
- `testes/`: testes da lógica (`node --test "testes/*.test.js"` e `python dados/teste_banco.py`) e roteiros de verificação da interface.
- `docs/`: especificação e plano.

## Como gerar o APK

1. Instale o Android SDK e o JDK 17, e crie `android/local.properties` com `sdk.dir=<caminho do SDK>`.
2. Coloque a chave de assinatura em `android/assinatura.keystore`. Ela não fica no repositório; quem não tiver a original pode copiar o próprio `debug.keystore` para lá, mas aí o APK não instala por cima do app já instalado.
3. No Windows, rode `android\gradlew.bat -p android assembleDebug`. O APK sai em `android/app/build/outputs/apk/debug/`.

O APK pronto fica nas [Releases](../../releases).

## Dados

- Questões dos exames I a XXXVII: dataset [russ7/oab_exams_2011_2025_combined](https://huggingface.co/datasets/russ7/oab_exams_2011_2025_combined) (licença MIT).
- Questões dos exames XXXVIII a XLV: texto das provas oficiais, tirado do dataset [juliadollis/oab-comentadas-leisllmv1](https://huggingface.co/datasets/juliadollis/oab-comentadas-leisllmv1). Os comentários desse dataset não são redistribuídos.
- As questões são das provas do Exame de Ordem (OAB/FGV), reproduzidas para estudo. As explicações são geradas por IA: na dúvida, confira na lei.

---

by Otávio · © 2026 Otávio. Todos os direitos reservados.
