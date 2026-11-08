export const meta = {
  name: 'oab-explicacoes',
  description: 'Resolve às cegas e explica questões da OAB com Haiku 5.5, escalando divergências para Sonnet 5.5 e Opus 5.5',
  whenToUse: 'Gerar explicações e matérias do banco de questões do app OAB Treino',
  phases: [
    { title: 'Inicial', detail: 'classifica, resolve às cegas e explica' },
    { title: 'Sonnet', detail: 'refaz às cegas as que divergiram do gabarito', model: 'sonnet' },
    { title: 'Opus', detail: 'decide as que continuam divergentes', model: 'opus' },
  ],
}

// Gerado por dados/gerar_workflow.py: {lote: {arquivo, modo, gabarito: {qid: letra}}}
const MANIFESTO = __MANIFESTO__

const MATERIAS = ['etica', 'filosofia', 'constitucional', 'direitos_humanos', 'eleitoral', 'internacional',
  'financeiro', 'tributario', 'administrativo', 'ambiental', 'civil', 'eca', 'consumidor', 'empresarial',
  'processo_civil', 'penal', 'processo_penal', 'previdenciario', 'trabalho', 'processo_trabalho']

const T_TEXTO = { type: 'string' }
const T_NULO = { type: ['string', 'null'] }
const QUATRO = { type: 'array', items: T_TEXTO, minItems: 4, maxItems: 4 }
const LETRA = { enum: ['A', 'B', 'C', 'D'] }
const MATERIA = { enum: MATERIAS }
const lista = (props) => ({
  type: 'object',
  properties: { itens: { type: 'array', minItems: 1, items: { type: 'object', properties: props, required: Object.keys(props) } } },
  required: ['itens'],
})
const S_CLASSIFICAR = lista({ id: T_TEXTO, materia: MATERIA })
const S_EXPLICAR = lista({ id: T_TEXTO, materia: MATERIA, resposta: LETRA, confianca: { enum: ['alta', 'media', 'baixa'] },
  explicacoes: QUATRO, base_legal: T_TEXTO, pegadinha: T_NULO })
const S_OPUS = lista({ id: T_TEXTO, veredito: { enum: ['gabarito_ok', 'desatualizada', 'gabarito_errado'] },
  explicacoes: QUATRO, base_legal: T_TEXTO, pegadinha: T_NULO, motivo: T_NULO })

const ID = 'O `id` de cada questão é o código logo depois de "###" (ex.: e38q47).'
const CHAVES = `Chaves de matéria permitidas: ${MATERIAS.join(', ')}.`
const FIM = 'Leia apenas o arquivo indicado; não abra nenhum outro arquivo. Se o Read avisar que o arquivo é grande, leia em partes com offset/limit até o fim.'

function promptExplicar(arquivo, ids) {
  const alvo = ids ? `com os ids ${ids.join(', ')}` : 'do arquivo'
  return `Você é professor de cursinho para a 1ª fase da OAB. Leia o arquivo ${arquivo} com questões de múltipla escolha (não há gabarito). Para cada questão ${alvo}: (1) classifique a matéria com uma das chaves permitidas; (2) resolva você mesmo, pela lei brasileira vigente em 2026, e dê a letra correta em \`resposta\`, com \`confianca\`; (3) em \`explicacoes\`, escreva para A, B, C e D, nesta ordem, começando com "Certa." ou "Errada." (sem repetir a letra) e depois 1 a 3 frases simples dizendo por quê, citando artigo, súmula ou tema quando houver — confira se o número da lei ou do decreto citado está certo; (4) \`base_legal\`: os dispositivos principais; (5) \`pegadinha\`: se alguma alternativa errada é armadilha clássica da FGV (prazo trocado, "sempre/nunca", exceção virando regra, competência trocada etc.), explique em 1 frase; senão null. Devolva todas as questões pedidas.\n${ID}\n${CHAVES}\n${FIM}`
}

function promptClassificar(arquivo) {
  return `Leia o arquivo ${arquivo} e devolva, para todas as questões, só o \`id\` e a \`materia\` (uma das chaves permitidas).\n${ID}\n${CHAVES}\n${FIM}`
}

function promptOpus(arquivo, casos) {
  const linhas = casos.map(c => `- ${c.id}: gabarito oficial ${c.oficial}; ` +
    Object.entries(c.respostas).map(([m, r]) => `${m} respondeu ${r || 'nada'}`).join('; ')).join('\n')
  return `Em cada questão abaixo (arquivo ${arquivo}), os modelos discordaram do gabarito oficial da FGV. Para cada id você recebe o gabarito oficial e as respostas dos modelos. Decida o \`veredito\`: \`gabarito_ok\` (o oficial está certo e a questão é difícil — explique pelo gabarito oficial; \`motivo\` null); \`desatualizada\` (o oficial estava certo na época, mas a lei ou a jurisprudência mudou — explique pela lei da época e diga em \`motivo\`, em 1 ou 2 frases, o que mudou e qual seria a resposta hoje); \`gabarito_errado\` (erro de transcrição ou questão anulada — diga por quê em \`motivo\`). Escreva \`explicacoes\` (A–D), \`base_legal\` e \`pegadinha\` como um professor de cursinho.\n${linhas}\n${ID}\n${FIM}`
}

const MODELO = (args && args.modelo_inicial) || 'haiku'
const pedidosArgs = (args && args.lotes) || []
const desconhecidos = pedidosArgs.map(e => (typeof e === 'string' ? e : e.id)).filter(id => !MANIFESTO[id])
if (desconhecidos.length) log(`Ignorando lotes que não existem no manifesto: ${desconhecidos.join(', ')}`)
const LOTES = pedidosArgs
  .map(e => (typeof e === 'string' ? { id: e } : e))
  .filter(e => MANIFESTO[e.id])
  .map(e => ({ ...MANIFESTO[e.id], id: e.id, ids: e.ids || null }))

const porId = (r) => Object.fromEntries((r ? r.itens : []).map(i => [i.id, i]))
const opcoes = (label, fase, schema, model) =>
  ({ label, phase: fase, schema, model, ...(model === 'haiku' ? {} : { effort: 'high' }) })

const resultados = await pipeline(LOTES,
  async (lote) => {
    if (lote.modo === 'classificar') {
      const r = await agent(promptClassificar(lote.arquivo), opcoes(`classificar:${lote.id}`, 'Inicial', S_CLASSIFICAR, 'haiku'))
      return { lote, falhou: !r }
    }
    const pedidos = lote.ids || Object.keys(lote.gabarito)
    const r = await agent(promptExplicar(lote.arquivo, lote.ids), opcoes(`${MODELO}:${lote.id}`, 'Inicial', S_EXPLICAR, MODELO))
    if (!r) return { lote, falhou: true }
    const itens = porId(r)
    const div = pedidos.filter(id => !itens[id] || itens[id].resposta !== lote.gabarito[id])
    const resp = Object.fromEntries(pedidos.map(id => [id, { [MODELO]: itens[id] ? itens[id].resposta : null }]))
    return { lote, falhou: false, pedidos, bateuInicial: pedidos.length - div.length, div, resp }
  },
  async (s) => {
    if (s.lote.modo !== 'explicar' || s.falhou || !s.div.length || MODELO !== 'haiku') return { ...s, restantes: s.div || [] }
    const itens = porId(await agent(promptExplicar(s.lote.arquivo, s.div), opcoes(`sonnet:${s.lote.id}`, 'Sonnet', S_EXPLICAR, 'sonnet')))
    for (const id of s.div) s.resp[id].sonnet = itens[id] ? itens[id].resposta : null
    const restantes = s.div.filter(id => !itens[id] || itens[id].resposta !== s.lote.gabarito[id])
    return { ...s, bateuSonnet: s.div.length - restantes.length, restantes }
  },
  async (s) => {
    if (s.lote.modo !== 'explicar' || s.falhou || !s.restantes.length) return { ...s, opus: [], faltando: [] }
    const casos = s.restantes.map(id => ({ id, oficial: s.lote.gabarito[id], respostas: s.resp[id] }))
    const itens = porId(await agent(promptOpus(s.lote.arquivo, casos), opcoes(`opus:${s.lote.id}`, 'Opus', S_OPUS, 'opus')))
    return {
      ...s,
      opus: s.restantes.filter(id => itens[id]).map(id => ({ id, veredito: itens[id].veredito })),
      faltando: s.restantes.filter(id => !itens[id]),
    }
  },
)

const ok = resultados.map((s, i) => s || { lote: LOTES[i], falhou: true })
const exp = ok.filter(s => s.lote.modo === 'explicar' && !s.falhou)
const opus = { gabarito_ok: 0, desatualizada: 0, gabarito_errado: 0 }
exp.forEach(s => s.opus.forEach(o => { opus[o.veredito]++ }))
const faltando = {}
exp.forEach(s => { if (s.faltando.length) faltando[s.lote.id] = s.faltando })
return {
  lotes: LOTES.length,
  pedidas: exp.reduce((a, s) => a + s.pedidos.length, 0),
  bateu_inicial: exp.reduce((a, s) => a + s.bateuInicial, 0),
  bateu_sonnet: exp.reduce((a, s) => a + (s.bateuSonnet || 0), 0),
  opus,
  lotes_falhos: ok.filter(s => s.falhou).map(s => s.lote.id),
  faltando,
}
