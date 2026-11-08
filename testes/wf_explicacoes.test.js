// Testa a lógica do workflow de explicações com agentes simulados (sem gastar agentes de verdade).
// Rodar: node --test testes/
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MODELO = fs.readFileSync(path.join(__dirname, '..', 'dados', 'wf_explicacoes.js'), 'utf8')

async function rodar(manifesto, args, responder) {
  const chamadas = []
  const src = MODELO.replace('__MANIFESTO__', JSON.stringify(manifesto)).replace('export const meta', 'const meta')
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

const item = (id, resposta) => ({ id, materia: 'civil', resposta, confianca: 'alta', explicacoes: ['a', 'b', 'c', 'd'], base_legal: 'CC', pegadinha: null })
const MAN = {
  L1: { arquivo: 'C:/x/L1.txt', modo: 'classificar', gabarito: {} },
  L2: { arquivo: 'C:/x/L2.txt', modo: 'explicar', gabarito: { a: 'A', b: 'B', c: 'C' } },
}

test('classificar não compara nem escala', async () => {
  const { resultado, chamadas } = await rodar(MAN, { lotes: ['L1'] }, () => ({ itens: [{ id: 'e1q1', materia: 'etica' }] }))
  assert.deepEqual(chamadas.map(c => c.label), ['classificar:L1'])
  assert.equal(chamadas[0].model, 'haiku')
  assert.equal(chamadas[0].effort, undefined)
  assert.equal(resultado.pedidas, 0)
  assert.deepEqual(resultado.lotes_falhos, [])
})

test('quem bate não escala; quem diverge vai ao sonnet e depois ao opus', async () => {
  const { resultado, chamadas } = await rodar(MAN, { lotes: ['L2'] }, (label) => {
    if (label.startsWith('haiku')) return { itens: [item('a', 'A'), item('b', 'C')] } // c faltou
    if (label.startsWith('sonnet')) return { itens: [item('b', 'B'), item('c', 'D')] }
    return { itens: [{ id: 'c', veredito: 'desatualizada', explicacoes: ['a', 'b', 'c', 'd'], base_legal: 'x', pegadinha: null, motivo: 'mudou' }] }
  })
  assert.deepEqual(chamadas.map(c => c.label), ['haiku:L2', 'sonnet:L2', 'opus:L2'])
  assert.match(chamadas[1].prompt, /com os ids b, c/)
  assert.equal(chamadas[1].effort, 'high')
  assert.match(chamadas[2].prompt, /- c: gabarito oficial C; haiku respondeu nada; sonnet respondeu D/)
  assert.equal(resultado.pedidas, 3)
  assert.equal(resultado.bateu_inicial, 1)
  assert.equal(resultado.bateu_sonnet, 1)
  assert.deepEqual(resultado.opus, { gabarito_ok: 0, desatualizada: 1, gabarito_errado: 0 })
  assert.deepEqual(resultado.faltando, {})
})

test('sem divergência não chama sonnet nem opus', async () => {
  const { chamadas } = await rodar(MAN, { lotes: ['L2'] }, () => ({ itens: [item('a', 'A'), item('b', 'B'), item('c', 'C')] }))
  assert.deepEqual(chamadas.map(c => c.label), ['haiku:L2'])
})

test('agente inicial nulo marca o lote como falho e não escala', async () => {
  const { resultado, chamadas } = await rodar(MAN, { lotes: ['L2'] }, () => null)
  assert.equal(chamadas.length, 1)
  assert.deepEqual(resultado.lotes_falhos, ['L2'])
})

test('opus que não devolve o id deixa a questão em faltando', async () => {
  const { resultado } = await rodar(MAN, { lotes: ['L2'] }, (label) =>
    label.startsWith('opus') ? null : { itens: [item('a', 'A'), item('b', 'A'), item('c', 'A')] })
  assert.deepEqual(resultado.faltando, { L2: ['b', 'c'] })
})

test('modelo_inicial sonnet pula o estágio sonnet', async () => {
  const { chamadas } = await rodar(MAN, { lotes: ['L2'], modelo_inicial: 'sonnet' }, (label) =>
    label.startsWith('opus') ? { itens: [] } : { itens: [item('a', 'A'), item('b', 'B'), item('c', 'D')] })
  assert.deepEqual(chamadas.map(c => c.label), ['sonnet:L2', 'opus:L2'])
  assert.equal(chamadas[0].effort, 'high')
})

test('entrada com ids restringe o pedido e o prompt', async () => {
  const { resultado, chamadas } = await rodar(MAN, { lotes: [{ id: 'L2', ids: ['b'] }] }, () => ({ itens: [item('b', 'B')] }))
  assert.match(chamadas[0].prompt, /com os ids b/)
  assert.equal(resultado.pedidas, 1)
  assert.equal(resultado.bateu_inicial, 1)
})

test('lote fora do manifesto é ignorado', async () => {
  const { resultado, chamadas } = await rodar(MAN, { lotes: ['L9', 'L1'] }, () => ({ itens: [{ id: 'x', materia: 'penal' }] }))
  assert.equal(resultado.lotes, 1)
  assert.deepEqual(chamadas.map(c => c.label), ['classificar:L1'])
})
