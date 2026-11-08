export const meta = {
  name: 'oab-auditoria',
  description: 'Sonnet 5.5 confere uma amostra das explicações que foram feitas só pelo Haiku 5.5',
  whenToUse: 'Medir a taxa de erro das explicações do Haiku no app OAB Treino',
  phases: [{ title: 'Auditoria', detail: 'um revisor por arquivo de 10 questões (Sonnet, ou o modelo do arquivo)', model: 'sonnet' }],
}

const T_TEXTO = { type: 'string' }
const T_NULO = { type: ['string', 'null'] }
const QUATRO = { type: 'array', items: T_TEXTO, minItems: 4, maxItems: 4 }
const CAMPOS = { id: T_TEXTO, ok: { type: 'boolean' }, problema: T_NULO, explicacoes: QUATRO, base_legal: T_TEXTO, pegadinha: T_NULO }
const S_AUDITORIA = {
  type: 'object', required: ['itens'],
  properties: { itens: { type: 'array', minItems: 1, items: { type: 'object', properties: CAMPOS, required: Object.keys(CAMPOS) } } },
}

const prompt = (a) => `Você revisa explicações de questões da 1ª fase da OAB. Para cada questão do arquivo ${a.arquivo} (o gabarito oficial e as explicações atuais estão no arquivo), diga em \`ok\` se as explicações, a base legal e a pegadinha estão corretas pela lei brasileira vigente em 2026 — confira inclusive números de lei, decreto, artigo e súmula. Se houver erro, reescreva as 4 explicações (A–D, cada uma começando com "Certa." ou "Errada."), a base legal e a pegadinha corrigidas e descreva o erro em \`problema\` em 1 frase; se estiver tudo certo, repita-as e deixe \`problema\` null.
O \`id\` de cada questão é o código logo depois de "###" (ex.: e38q47).
Leia apenas o arquivo indicado; não abra nenhum outro arquivo. Se o Read avisar que o arquivo é grande, leia em partes com offset/limit até o fim.`

const arquivos = (args && args.arquivos) || []
const resultados = await pipeline(arquivos, async (a) => {
  const r = await agent(prompt(a), { label: `auditoria:${a.id}`, phase: 'Auditoria', schema: S_AUDITORIA, model: a.modelo || 'sonnet', effort: 'high' })
  if (!r) return { a, falhou: true }
  const vistos = new Set(r.itens.map(i => i.id))
  return { a, falhou: false, n: r.itens.length, erros: r.itens.filter(i => !i.ok).length, faltando: a.ids.filter(id => !vistos.has(id)) }
})

const ok = resultados.map((s, i) => s || { a: arquivos[i], falhou: true })
return {
  arquivos: arquivos.length,
  revisadas: ok.reduce((t, s) => t + (s.n || 0), 0),
  com_erro: ok.reduce((t, s) => t + (s.erros || 0), 0),
  falhos: ok.filter(s => s.falhou).map(s => s.a.id),
  faltando: ok.flatMap(s => s.faltando || []),
}
