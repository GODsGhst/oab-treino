// Testa a lógica do workflow de desempate com agentes simulados.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MODELO = fs.readFileSync(path.join(__dirname, '..', 'dados', 'wf_desempate.js'), 'utf8')

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

const item = (id, veredito) => ({ id, veredito, explicacoes: ['Certa. a', 'Errada. b', 'Errada. c', 'Errada. d'], base_legal: 'x', pegadinha: null, motivo: null })

test('um Opus por arquivo, com o arquivo e a objeção de cada id no prompt, e o veredito por id', async () => {
  const args = { arquivos: [{ id: 'X001', arquivo: 'C:/x/X001.txt', ids: ['e1q1', 'e2q2'], objecoes: { e1q1: 'a lei mudou em 2019' } }] }
  const { resultado, chamadas } = await rodar(args, () => ({ itens: [item('e1q1', 'desatualizada'), item('e2q2', 'gabarito_ok')] }))
  assert.deepEqual(chamadas.map(c => [c.label, c.model, c.effort, c.schema.properties.itens.items.properties.veredito.enum]),
    [['opus:X001', 'opus', 'high', ['gabarito_ok', 'desatualizada', 'gabarito_errado']]])
  assert.match(chamadas[0].prompt, /C:\/x\/X001\.txt/)
  assert.match(chamadas[0].prompt, /e1q1: a lei mudou em 2019/)
  assert.match(chamadas[0].prompt, /e2q2: /)
  assert.deepEqual(resultado, { vereditos: { e1q1: 'desatualizada', e2q2: 'gabarito_ok' }, falhos: [], faltando: [] })
})

test('agente nulo vai para falhos e id sem veredito vai para faltando', async () => {
  const args = { arquivos: [{ id: 'X001', arquivo: 'x', ids: ['e1q1', 'e1q2'] }, { id: 'X002', arquivo: 'y', ids: ['e2q1'] }] }
  const { resultado } = await rodar(args, (label) => (label === 'opus:X001' ? { itens: [item('e1q1', 'gabarito_ok')] } : null))
  assert.deepEqual(resultado.falhos, ['X002'])
  assert.deepEqual(resultado.faltando, ['e1q2', 'e2q1'])
})
