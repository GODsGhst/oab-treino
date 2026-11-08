// Testes das regras do app (sem DOM). Rodar: node --test "testes/*.test.js"
const { test } = require('node:test')
const assert = require('node:assert/strict')
const L = require('../web/logica.js')

const DIST = { etica: 8, filosofia: 2, constitucional: 6, direitos_humanos: 2, eleitoral: 2, internacional: 2,
  financeiro: 2, tributario: 5, administrativo: 5, ambiental: 2, civil: 6, eca: 2, consumidor: 2, empresarial: 4,
  processo_civil: 6, penal: 6, processo_penal: 6, previdenciario: 2, trabalho: 5, processo_trabalho: 5 }
const HORA = 3600 * 1000

function questao(id, materia, extra = {}) {
  return { id, origem: 'oficial', exame: 40, reaplicacao: false, ano: 2024, num: 1, materia, enunciado: 'E',
    alt: ['a', 'b', 'c', 'd'], certa: 0, expl: ['1', '2', '3', '4'], comentario: null, base_legal: null,
    pegadinha: null, desatualizada: null, ...extra }
}

// ~140 questões: cada matéria com DIST+3; 3 desatualizadas, 10 sem explicação (todas de eleitoral e algumas de penal),
// 15 com pegadinha, metade de 2015; mais uma prova 20 regular (5) e sua reaplicação (4).
function banco() {
  const qs = []
  let n = 0
  for (const { chave } of L.MATERIAS) {
    for (let i = 0; i < DIST[chave] + 3; i++) {
      n++
      qs.push(questao(`q${n}`, chave, { ano: i % 2 ? 2024 : 2015, num: n, certa: n % 4 }))
    }
  }
  qs.filter(q => q.materia === 'eleitoral').forEach(q => { q.expl = null })
  qs.filter(q => q.materia === 'penal').slice(0, 5).forEach(q => { q.expl = null })
  qs.filter(q => q.materia === 'civil').slice(0, 3).forEach(q => { q.desatualizada = 'mudou' })
  qs.filter(q => q.expl).slice(0, 15).forEach(q => { q.pegadinha = 'cuidado' })
  qs.filter(q => q.pegadinha).slice(0, 6).forEach(q => { q.armadilha = true }) // pegadinha confirmada (inédita ou Opus)
  qs.find(q => q.materia === 'trabalho').expl = null
  const comentada = qs.find(q => q.materia === 'trabalho' && q.expl)
  comentada.expl = null
  comentada.comentario = 'coment'
  ;[3, 1, 2, 5, 4].forEach(num => qs.push(questao(`e20q${num}`, 'civil', { exame: 20, ano: 2016, num, desatualizada: num === 5 ? 'x' : null })))
  ;[2, 1, 4, 3].forEach(num => qs.push(questao(`e20rq${num}`, 'civil', { exame: 20, reaplicacao: true, ano: 2016, num })))
  return qs
}

const contar = (ids, qs) => ids.reduce((acc, id) => {
  const m = qs.find(q => q.id === id).materia
  acc[m] = (acc[m] || 0) + 1
  return acc
}, {})

test('simulado completo tem 80 e respeita a distribuição', () => {
  const qs = banco()
  const { ids, faltaram } = L.montarSimulado(qs, { tipo: 'completo' }, DIST, L.estadoVazio(), L.criarRng(1))
  assert.equal(ids.length, 80)
  assert.equal(faltaram, 0)
  assert.deepEqual(contar(ids, qs), DIST)
  assert.ok(ids.every(id => !qs.find(q => q.id === id).desatualizada))
})

test('simulado é determinístico com a mesma semente', () => {
  const qs = banco()
  const a = L.montarSimulado(qs, { tipo: 'completo' }, DIST, L.estadoVazio(), L.criarRng(7)).ids
  const b = L.montarSimulado(qs, { tipo: 'completo' }, DIST, L.estadoVazio(), L.criarRng(7)).ids
  assert.deepEqual(a, b)
})

test('simulado completo prioriza questões não vistas e de 2018 em diante', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  qs.filter(q => q.materia === 'etica').slice(0, 3).forEach(q => L.registrarResposta(estado, q.id, true, 1))
  const etica = L.montarSimulado(qs, { tipo: 'completo' }, DIST, estado, L.criarRng(3)).ids
    .map(id => qs.find(q => q.id === id)).filter(q => q.materia === 'etica')
  assert.equal(etica.filter(q => estado.hist[q.id]).length, 0)
})

test('simulado completo: não vistas de 2018+ primeiro, depois não vistas antigas, por último as já vistas', () => {
  // ética tem 8 vagas; nn = não vista nova, na = não vista antiga (2015), vn/va = já vistas
  const montar = (quantos, semente) => {
    const qs = banco().filter(q => q.materia !== 'etica')
    const estado = L.estadoVazio()
    for (const [tipo, n] of Object.entries(quantos)) {
      for (let i = 0; i < n; i++) {
        const q = questao(`${tipo}${i}`, 'etica', { ano: tipo[1] === 'n' ? 2024 : 2015 })
        qs.push(q)
        if (tipo[0] === 'v') L.registrarResposta(estado, q.id, true, 1)
      }
    }
    return L.montarSimulado(qs, { tipo: 'completo' }, DIST, estado, L.criarRng(semente)).ids
      .filter(id => /^(nn|na|vn|va)\d$/.test(id))
      .reduce((acc, id) => { acc[id.slice(0, 2)] = (acc[id.slice(0, 2)] || 0) + 1; return acc }, {})
  }
  for (const semente of [1, 2, 3, 4, 5]) {
    assert.deepEqual(montar({ nn: 5, na: 5, vn: 3, va: 3 }, semente), { nn: 5, na: 3 }, `ano decide entre as não vistas (semente ${semente})`)
    assert.deepEqual(montar({ nn: 2, na: 3, vn: 5, va: 3 }, semente), { nn: 2, na: 3, vn: 3 }, `não vista antiga vem antes da vista nova (semente ${semente})`)
  }
})

test('mini com n maior que o disponível usa o que existe e informa faltaram', () => {
  const qs = banco()
  const { ids, faltaram } = L.montarSimulado(qs, { tipo: 'mini', materia: 'filosofia', n: 10 }, DIST, L.estadoVazio(), L.criarRng(1))
  assert.equal(ids.length, 5)
  assert.equal(faltaram, 5)
})

test('prova oficial traz o exame inteiro em ordem e sem desatualizadas', () => {
  const { ids } = L.montarSimulado(banco(), { tipo: 'prova', exame: 20, reaplicacao: false }, DIST, L.estadoVazio(), L.criarRng(1))
  assert.deepEqual(ids, ['e20q1', 'e20q2', 'e20q3', 'e20q4'])
})

test('prova oficial não mistura exame regular e reaplicação', () => {
  const { ids } = L.montarSimulado(banco(), { tipo: 'prova', exame: 20, reaplicacao: true }, DIST, L.estadoVazio(), L.criarRng(1))
  assert.deepEqual(ids, ['e20rq1', 'e20rq2', 'e20rq3', 'e20rq4'])
})

test('provasDisponiveis lista regular e reaplicação separadas, da mais nova para a mais antiga', () => {
  const p = L.provasDisponiveis(banco())
  assert.deepEqual(p.map(x => [x.exame, x.reaplicacao, x.total]), [[40, false, 137], [20, false, 4], [20, true, 4]])
  assert.equal(p[1].ano, 2016)
})

test('treino ignora questões sem explicação e mostra não vistas primeiro', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  const vistas = qs.filter(q => q.materia === 'civil' && L.temExplicacao(q)).slice(0, 4).map(q => q.id)
  vistas.forEach(id => L.registrarResposta(estado, id, true, 1))
  const ids = L.filtrarTreino(qs, 'civil', estado, L.criarRng(2))
  assert.ok(ids.every(id => L.temExplicacao(qs.find(q => q.id === id))))
  assert.deepEqual(ids.slice(-4).sort(), vistas.slice().sort())
})

test('questão com comentário corrido conta como explicada', () => {
  const qs = banco()
  const comentada = qs.find(q => q.comentario)
  assert.ok(L.filtrarTreino(qs, 'trabalho', L.estadoVazio(), L.criarRng(1)).includes(comentada.id))
})

test('filtro pegadinhas só traz as armadilhas confirmadas, não toda questão com aviso de pegadinha', () => {
  const qs = banco()
  const ids = L.filtrarTreino(qs, 'pegadinhas', L.estadoVazio(), L.criarRng(1))
  assert.equal(ids.length, 6)
  assert.ok(ids.every(id => qs.find(q => q.id === id).armadilha))
})

test('matéria sem questões explicadas devolve lista vazia', () => {
  assert.deepEqual(L.filtrarTreino(banco(), 'eleitoral', L.estadoVazio(), L.criarRng(1)), [])
})

test('contagemTreino conta só questões com explicação', () => {
  const c = L.contagemTreino(banco())
  assert.equal(c.porMateria.eleitoral, undefined)
  assert.equal(c.porMateria.etica, 11)
  assert.equal(c.pegadinhas, 6)
})

test('confirmar duas vezes a mesma questão registra uma vez', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  const sessao = L.novaSessao(['q5', 'q6'])
  const r1 = L.confirmar(estado, sessao, qs, 'B', 10)
  const r2 = L.confirmar(estado, sessao, qs, 'A', 11)
  assert.deepEqual(r1, { acertou: true, certa: 'B' })
  assert.deepEqual(r2, r1)
  assert.equal(estado.hist.q5.n, 1)
  assert.equal(L.proxima(sessao), 'q6')
  assert.equal(L.proxima(sessao), null)
})

test('responder de novo no simulado substitui a resposta', () => {
  const sim = L.novoSimulado({ tipo: 'mini', materia: 'civil', n: 10 }, ['q1', 'q2'])
  L.responderSimulado(sim, 'q1', 'A')
  L.responderSimulado(sim, 'q1', 'C')
  assert.deepEqual(sim.respostas, { q1: 'C' })
})

test('erro e depois acerto sai dos erros pendentes', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  L.registrarResposta(estado, 'q5', false, 1)
  assert.deepEqual(L.errosPendentes(estado, qs), ['q5'])
  L.registrarResposta(estado, 'q5', true, 2)
  assert.deepEqual(L.errosPendentes(estado, qs), [])
})

test('erro no simulado entra nos erros pendentes só se tiver explicação; em branco não conta', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  const semExpl = qs.find(q => q.materia === 'eleitoral').id
  const sim = L.novoSimulado({ tipo: 'completo' }, ['q1', semExpl, 'q2'])
  L.responderSimulado(sim, 'q1', 'D') // q1 tem certa = 1 (B): errou
  L.responderSimulado(sim, semExpl, 'A') // a certa dela é D: errou
  L.registrarSimulado(estado, qs, sim, 5)
  assert.equal(sim.entregue, true)
  assert.deepEqual(L.errosPendentes(estado, qs), ['q1'])
  assert.equal(estado.hist.q2, undefined)
  assert.equal(estado.hist[semExpl].ultima, 0)
})

test('aprovado com exatamente 50% no completo; null no mini', () => {
  const qs = Array.from({ length: 80 }, (_, i) => questao(`x${i}`, 'civil'))
  const ids = qs.map(q => q.id)
  const sim = L.novoSimulado({ tipo: 'completo' }, ids)
  ids.slice(0, 40).forEach(id => L.responderSimulado(sim, id, 'A'))
  const r = L.corrigir(qs, sim)
  assert.equal(r.acertos, 40)
  assert.equal(r.pct, 50)
  assert.equal(r.aprovado, true)
  assert.deepEqual(r.porMateria, { civil: { acertos: 40, total: 80 } })
  assert.equal(L.corrigir(qs, L.novoSimulado({ tipo: 'mini', materia: 'civil', n: 10 }, ids.slice(0, 10))).aprovado, null)
  ids.slice(0, 1).forEach(id => L.responderSimulado(sim, id, 'B'))
  assert.equal(L.corrigir(qs, sim).aprovado, false)
})

test('estado inválido vira estado vazio', () => {
  assert.deepEqual(L.carregarEstado('{oops'), { versao: 1, hist: {}, simulado: null, fonte: 20 })
  assert.deepEqual(L.carregarEstado(null), L.estadoVazio())
  assert.deepEqual(L.carregarEstado('{"versao":99}'), L.estadoVazio())
})

test('simulado em andamento sobrevive a JSON.stringify + carregarEstado', () => {
  const estado = L.estadoVazio()
  estado.simulado = L.novoSimulado({ tipo: 'completo' }, ['q1', 'q2'])
  L.responderSimulado(estado.simulado, 'q2', 'B')
  L.contarTempo(estado.simulado, 1500)
  const volta = L.carregarEstado(JSON.stringify(estado))
  assert.deepEqual(volta, estado)
})

test('cronômetro só anda com contarTempo e o restante nunca fica negativo', () => {
  const sim = L.novoSimulado({ tipo: 'completo' }, ['q1'])
  assert.equal(sim.decorridoMs, 0)
  L.contarTempo(sim, 1000)
  L.contarTempo(sim, -500)
  assert.equal(sim.decorridoMs, 1000)
  assert.equal(L.tempoRestanteMs(sim), 5 * HORA - 1000)
  L.contarTempo(sim, 6 * HORA)
  assert.equal(L.tempoRestanteMs(sim), 0)
  assert.equal(L.tempoRestanteMs(L.novoSimulado({ tipo: 'mini', materia: 'civil', n: 10 }, [])), null)
})

test('resumo do dia conta só respostas de hoje', () => {
  const estado = L.estadoVazio()
  L.registrarResposta(estado, 'a', true, 100)
  L.registrarResposta(estado, 'b', false, 500)
  L.registrarResposta(estado, 'c', true, 600)
  assert.deepEqual(L.resumoDoDia(estado, 400), { respondidas: 2, acertos: 1 })
})

test('desempenho por matéria usa a última resposta e só lista matérias treinadas', () => {
  const qs = banco()
  const estado = L.estadoVazio()
  const civis = qs.filter(q => q.materia === 'civil').slice(3, 7).map(q => q.id)
  civis.forEach((id, i) => L.registrarResposta(estado, id, i < 3, 1))
  assert.deepEqual(L.desempenho(estado, qs), [{ chave: 'civil', nome: 'Direito Civil', respondidas: 4, acertos: 3, pct: 75 }])
})

test('romano escreve o número do exame', () => {
  assert.deepEqual([1, 4, 9, 14, 40, 43, 45].map(L.romano), ['I', 'IV', 'IX', 'XIV', 'XL', 'XLIII', 'XLV'])
})
