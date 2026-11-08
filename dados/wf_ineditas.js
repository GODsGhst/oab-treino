export const meta = {
  name: 'oab-ineditas',
  description: 'Escreve 10 questões inéditas por matéria no estilo FGV com Haiku 5.5 e confere cada uma com Sonnet 5.5',
  whenToUse: 'Gerar questões inéditas e pegadinhas do app OAB Treino',
  phases: [
    { title: 'Autor', detail: 'Haiku escreve 10 questões por matéria' },
    { title: 'Verificação', detail: 'Sonnet confere pela lei vigente, corrige ou descarta', model: 'sonnet' },
  ],
}

const MATERIAS = [
  { chave: 'etica', nome: 'Ética Profissional (Estatuto da Advocacia e da OAB, Regulamento Geral e Código de Ética e Disciplina)' },
  { chave: 'filosofia', nome: 'Filosofia do Direito' },
  { chave: 'constitucional', nome: 'Direito Constitucional' },
  { chave: 'direitos_humanos', nome: 'Direitos Humanos' },
  { chave: 'eleitoral', nome: 'Direito Eleitoral' },
  { chave: 'internacional', nome: 'Direito Internacional (público e privado)' },
  { chave: 'financeiro', nome: 'Direito Financeiro' },
  { chave: 'tributario', nome: 'Direito Tributário' },
  { chave: 'administrativo', nome: 'Direito Administrativo' },
  { chave: 'ambiental', nome: 'Direito Ambiental' },
  { chave: 'civil', nome: 'Direito Civil' },
  { chave: 'eca', nome: 'Estatuto da Criança e do Adolescente (ECA)' },
  { chave: 'consumidor', nome: 'Direito do Consumidor' },
  { chave: 'empresarial', nome: 'Direito Empresarial' },
  { chave: 'processo_civil', nome: 'Direito Processual Civil' },
  { chave: 'penal', nome: 'Direito Penal' },
  { chave: 'processo_penal', nome: 'Direito Processual Penal' },
  { chave: 'previdenciario', nome: 'Direito Previdenciário' },
  { chave: 'trabalho', nome: 'Direito do Trabalho' },
  { chave: 'processo_trabalho', nome: 'Direito Processual do Trabalho' },
]

const T_TEXTO = { type: 'string' }
const QUATRO = { type: 'array', items: T_TEXTO, minItems: 4, maxItems: 4 }
const CAMPOS = { tema: T_TEXTO, enunciado: T_TEXTO, alternativas: QUATRO, certa: { enum: ['A', 'B', 'C', 'D'] },
  explicacoes: QUATRO, base_legal: T_TEXTO, pegadinha: { type: ['string', 'null'] } }
const objeto = (props) => ({ type: 'object', properties: props, required: Object.keys(props) })
const S_INEDITAS = { type: 'object', required: ['questoes'],
  properties: { questoes: { type: 'array', items: objeto(CAMPOS), minItems: 10, maxItems: 10 } } }
const S_VERIF = { type: 'object', required: ['questoes'],
  properties: { questoes: { type: 'array', items: objeto({ ...CAMPOS, status: { enum: ['aprovada', 'corrigida'] } }), minItems: 0, maxItems: 10 } } }

const promptAutor = (nome) => `Escreva 10 questões inéditas de múltipla escolha (A–D) para a 1ª fase da OAB, matéria ${nome}, no estilo da FGV (caso concreto curto e um comando como "Assinale a opção que..."), sobre os temas que mais caem nessa matéria. Varie os temas. Pelo menos 4 devem ter uma pegadinha clássica — prazo trocado, "sempre/nunca", exceção virando regra, competência trocada etc. — descrita em \`pegadinha\` (nas outras, null). Só uma alternativa certa pela lei vigente em 2026; se não tiver certeza de alguma mudança recente, evite o tema. Distribua a alternativa certa entre A, B, C e D e não escreva a letra no começo das alternativas. Em \`explicacoes\`, para A, B, C e D, comece com "Certa." ou "Errada." e explique em 1 a 3 frases simples, citando artigo ou súmula. \`certa\` é a letra da alternativa correta. Não use ferramentas.`

const promptVerif = (nome, questoes) => `Questões a conferir (matéria ${nome}): ${JSON.stringify(questoes)}

Confira cada uma pela lei vigente em 2026: a alternativa \`certa\` está mesmo certa? alguma outra também poderia estar? as explicações e a base legal estão corretas? Corrija o que for preciso e devolva só as que ficarem sem ambiguidade (descarte as outras). Mantenha os mesmos campos; em \`status\`, "aprovada" se não mudou nada ou "corrigida" se corrigiu. Não use ferramentas.`

const alvo = args && args.materias ? MATERIAS.filter(m => args.materias.includes(m.chave)) : MATERIAS
const falhas = []
const resultados = await pipeline(alvo,
  async (m) => {
    const r = await agent(promptAutor(m.nome), { label: `autor:${m.chave}`, phase: 'Autor', schema: S_INEDITAS, model: 'haiku' })
    if (!r) falhas.push(m.chave)
    return r ? { m, questoes: r.questoes } : null
  },
  async (s) => {
    if (!s) return null
    const r = await agent(promptVerif(s.m.nome, s.questoes),
      { label: `verif:${s.m.chave}`, phase: 'Verificação', schema: S_VERIF, model: 'sonnet', effort: 'high' })
    if (!r) {
      falhas.push(s.m.chave)
      return null
    }
    return { chave: s.m.chave, aprovadas: r.questoes.length }
  },
)
return { materias_falhas: falhas, aprovadas: Object.fromEntries(resultados.filter(Boolean).map(x => [x.chave, x.aprovadas])) }
