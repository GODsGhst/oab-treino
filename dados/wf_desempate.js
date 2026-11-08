export const meta = {
  name: 'oab-desempate',
  description: 'Opus 5.5 decide as questões em que a revisão contrariou o gabarito oficial da FGV',
  whenToUse: 'Depois de uma revisão do app OAB Treino: questões cuja explicação corrigida inverteu o gabarito',
  phases: [{ title: 'Desempate', detail: 'um Opus por arquivo', model: 'opus' }],
}

const T_TEXTO = { type: 'string' }
const T_NULO = { type: ['string', 'null'] }
const QUATRO = { type: 'array', items: T_TEXTO, minItems: 4, maxItems: 4 }
const CAMPOS = { id: T_TEXTO, veredito: { enum: ['gabarito_ok', 'desatualizada', 'gabarito_errado'] },
  explicacoes: QUATRO, base_legal: T_TEXTO, pegadinha: T_NULO, motivo: T_NULO }
const S_OPUS = {
  type: 'object', required: ['itens'],
  properties: { itens: { type: 'array', minItems: 1, items: { type: 'object', properties: CAMPOS, required: Object.keys(CAMPOS) } } },
}

const prompt = (a) => `Você é professor de cursinho para a 1ª fase da OAB. O arquivo ${a.arquivo} traz questões com o gabarito oficial da FGV e as explicações atuais. Em cada uma, um revisor contrariou o gabarito oficial; a objeção dele vem abaixo. Decida o \`veredito\` de cada id: \`gabarito_ok\` (o gabarito oficial está certo e a objeção não procede; \`motivo\` null); \`desatualizada\` (o gabarito estava certo na data da prova, mas a lei ou a jurisprudência mudou depois — diga em \`motivo\`, em 1 ou 2 frases simples, o que mudou e qual seria a resposta hoje); \`gabarito_errado\` (o gabarito já estava errado na data da prova, ou a questão foi anulada — diga por quê em \`motivo\`). Escreva \`explicacoes\` pela lei da data da prova: para A, B, C e D, nesta ordem, comece com "Certa." (só na alternativa do gabarito oficial) ou "Errada.", sem repetir a letra, e depois 1 a 3 frases simples dizendo por quê, citando artigo, súmula ou tema — confira o número de cada lei citada. \`base_legal\`: os dispositivos principais. \`pegadinha\`: a armadilha clássica da FGV numa alternativa errada, em 1 frase, ou null.
Objeções:
${a.ids.map(id => `- ${id}: ${(a.objecoes || {})[id] || 'o revisor marcou outra alternativa como certa'}`).join('\n')}
O \`id\` de cada questão é o código logo depois de "###" (ex.: e38q47).
Leia apenas o arquivo indicado; não abra nenhum outro arquivo.`

const arquivos = (args && args.arquivos) || []
const res = await pipeline(arquivos, (a) =>
  agent(prompt(a), { label: `opus:${a.id}`, phase: 'Desempate', schema: S_OPUS, model: 'opus', effort: 'high' }))
const vereditos = {}
res.forEach(r => (r ? r.itens : []).forEach(i => { vereditos[i.id] = i.veredito }))
return {
  vereditos,
  falhos: arquivos.filter((a, k) => !res[k]).map(a => a.id),
  faltando: arquivos.flatMap(a => a.ids.filter(id => !(id in vereditos))),
}
