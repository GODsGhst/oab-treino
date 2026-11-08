// Testa a lógica do workflow de auditoria com agentes simulados.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MODELO = fs.readFileSync(path.join(__dirname, '..', 'dados', 'wf_auditoria.js'), 'utf8')

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

const item = (id, ok) => ({ id, ok, problema: ok ? null : 'decreto errado', explicacoes: ['a', 'b', 'c', 'd'], base_legal: 'x', pegadinha: null })

test('um agente Sonnet por arquivo, com o caminho no prompt, e o total de erros', async () => {
  const args = { arquivos: [{ id: 'A01', arquivo: 'C:/a/A01.txt', ids: ['e1q1', 'e1q2'] }, { id: 'A02', arquivo: 'C:/a/A02.txt', ids: ['e2q1'] }] }
  const { resultado, chamadas } = await rodar(args, (label) =>
    label === 'auditoria:A01' ? { itens: [item('e1q1', true), item('e1q2', false)] } : { itens: [item('e2q1', true)] })
  assert.deepEqual(chamadas.map(c => [c.label, c.model, c.effort]), [['auditoria:A01', 'sonnet', 'high'], ['auditoria:A02', 'sonnet', 'high']])
  assert.match(chamadas[0].prompt, /C:\/a\/A01\.txt/)
  assert.deepEqual(resultado, { arquivos: 2, revisadas: 3, com_erro: 1, falhos: [], faltando: [] })
})

test('o modelo do revisor vem de cada arquivo (padrão sonnet)', async () => {
  const args = { arquivos: [{ id: 'Y01', arquivo: 'y', ids: ['e1q1'], modelo: 'opus' }, { id: 'W01', arquivo: 'w', ids: ['e2q1'] }] }
  const { chamadas } = await rodar(args, (label) => ({ itens: [item(label === 'auditoria:Y01' ? 'e1q1' : 'e2q1', true)] }))
  assert.deepEqual(chamadas.map(c => [c.label, c.model]), [['auditoria:Y01', 'opus'], ['auditoria:W01', 'sonnet']])
})

test('agente nulo vai para falhos e id omitido vai para faltando', async () => {
  const args = { arquivos: [{ id: 'A01', arquivo: 'x', ids: ['e1q1', 'e1q2'] }, { id: 'A02', arquivo: 'y', ids: ['e2q1'] }] }
  const { resultado } = await rodar(args, (label) => (label === 'auditoria:A01' ? { itens: [item('e1q1', true)] } : null))
  assert.deepEqual(resultado.falhos, ['A02'])
  assert.deepEqual(resultado.faltando, ['e1q2'])
})
