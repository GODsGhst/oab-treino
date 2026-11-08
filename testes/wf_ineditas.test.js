// Testa a lógica do workflow de inéditas com agentes simulados.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MODELO = fs.readFileSync(path.join(__dirname, '..', 'dados', 'wf_ineditas.js'), 'utf8')

async function rodar(args, responder) {
  const chamadas = []
  const src = MODELO.replace('export const meta', 'const meta')
  const agent = async (prompt, opts) => { chamadas.push({ prompt, ...opts }); return responder(opts.label, prompt) }
  const pipeline = (itens, ...etapas) => Promise.all(itens.map(async (item, i) => {
    let v = item
    for (const etapa of etapas) {
      try { v = await etapa(v, item, i) } catch { return null }
    }
    return v
  }))
  const fn = new Function('args', 'pipeline', 'agent', 'log', `return (async () => {${src}})()`)
  return { resultado: await fn(args, pipeline, agent, () => {}), chamadas }
}

const questao = (n) => ({ tema: 't', enunciado: `Q${n}`, alternativas: ['a', 'b', 'c', 'd'], certa: 'A',
  explicacoes: ['1', '2', '3', '4'], base_legal: 'CF', pegadinha: null })
const dez = { questoes: Array.from({ length: 10 }, (_, i) => questao(i)) }

test('roda as 20 matérias: Haiku escreve e Sonnet confere com o JSON do autor no prompt', async () => {
  const { resultado, chamadas } = await rodar(undefined, (label) =>
    label.startsWith('autor') ? dez : { questoes: dez.questoes.slice(0, 7).map(q => ({ ...q, status: 'aprovada' })) })
  const autores = chamadas.filter(c => c.label.startsWith('autor:'))
  const verifs = chamadas.filter(c => c.label.startsWith('verif:'))
  assert.equal(autores.length, 20)
  assert.equal(verifs.length, 20)
  assert.ok(autores.every(c => c.model === 'haiku'))
  assert.ok(verifs.every(c => c.model === 'sonnet' && c.effort === 'high'))
  assert.match(verifs[0].prompt, /"enunciado":"Q0"/)
  assert.deepEqual(resultado.materias_falhas, [])
  assert.equal(resultado.aprovadas.civil, 7)
})

test('autor nulo pula o verificador e entra em materias_falhas', async () => {
  const { resultado, chamadas } = await rodar({ materias: ['civil', 'penal'] }, (label) =>
    label === 'autor:civil' ? null : label.startsWith('autor') ? dez : { questoes: [] })
  assert.deepEqual(chamadas.map(c => c.label).sort(), ['autor:civil', 'autor:penal', 'verif:penal'])
  assert.deepEqual(resultado.materias_falhas, ['civil'])
})

test('verificador nulo também entra em materias_falhas', async () => {
  const { resultado } = await rodar({ materias: ['eca'] }, (label) => (label.startsWith('autor') ? dez : null))
  assert.deepEqual(resultado.materias_falhas, ['eca'])
})
