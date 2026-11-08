// Regras do OAB Treino, sem DOM: testáveis no Node (testes/logica.test.js) e usadas pelo app.js.
(function (raiz) {
  'use strict'

  const MATERIAS = [
    { chave: 'etica', nome: 'Ética Profissional' },
    { chave: 'filosofia', nome: 'Filosofia do Direito' },
    { chave: 'constitucional', nome: 'Direito Constitucional' },
    { chave: 'direitos_humanos', nome: 'Direitos Humanos' },
    { chave: 'eleitoral', nome: 'Direito Eleitoral' },
    { chave: 'internacional', nome: 'Direito Internacional' },
    { chave: 'financeiro', nome: 'Direito Financeiro' },
    { chave: 'tributario', nome: 'Direito Tributário' },
    { chave: 'administrativo', nome: 'Direito Administrativo' },
    { chave: 'ambiental', nome: 'Direito Ambiental' },
    { chave: 'civil', nome: 'Direito Civil' },
    { chave: 'eca', nome: 'ECA' },
    { chave: 'consumidor', nome: 'Direito do Consumidor' },
    { chave: 'empresarial', nome: 'Direito Empresarial' },
    { chave: 'processo_civil', nome: 'Processo Civil' },
    { chave: 'penal', nome: 'Direito Penal' },
    { chave: 'processo_penal', nome: 'Processo Penal' },
    { chave: 'previdenciario', nome: 'Direito Previdenciário' },
    { chave: 'trabalho', nome: 'Direito do Trabalho' },
    { chave: 'processo_trabalho', nome: 'Processo do Trabalho' },
  ]
  const LETRAS = ['A', 'B', 'C', 'D']
  const CINCO_HORAS = 5 * 60 * 60 * 1000

  function criarRng(semente) { // mulberry32
    let a = semente >>> 0
    return function () {
      a = (a + 0x6D2B79F5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function embaralhar(lista, rng) {
    const a = lista.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = a[i]; a[i] = a[j]; a[j] = t
    }
    return a
  }

  const temExplicacao = (q) => !!((q.expl && q.expl.length) || q.comentario)

  function indexar(questoes) {
    const m = {}
    for (const q of questoes) m[q.id] = q
    return m
  }

  function romano(n) {
    let out = ''
    for (const [v, r] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
      while (n >= v) { out += r; n -= v }
    }
    return out
  }

  function contagemTreino(questoes) {
    const porMateria = {}
    let todas = 0, pegadinhas = 0
    for (const q of questoes) {
      if (!temExplicacao(q)) continue
      todas++
      if (q.armadilha) pegadinhas++
      porMateria[q.materia] = (porMateria[q.materia] || 0) + 1
    }
    return { todas, pegadinhas, porMateria }
  }

  // "pegadinhas" = armadilhas confirmadas (inéditas de pegadinha e oficiais que derrubaram dois modelos);
  // o aviso de pegadinha aparece em muito mais questões e por isso não serve de filtro.
  function filtrarTreino(questoes, filtro, estado, rng) {
    const ok = questoes.filter(q => temExplicacao(q) &&
      (filtro === 'todas' || (filtro === 'pegadinhas' ? !!q.armadilha : q.materia === filtro)))
    const vista = (q) => !!estado.hist[q.id]
    return embaralhar(ok.filter(q => !vista(q)), rng).concat(embaralhar(ok.filter(vista), rng)).map(q => q.id)
  }

  function registrarResposta(estado, id, acertou, quando) {
    const h = estado.hist[id] || { n: 0, ok: 0, ultima: 0, ts: 0 }
    h.n++
    if (acertou) h.ok++
    h.ultima = acertou ? 1 : 0
    h.ts = quando
    estado.hist[id] = h
  }

  function novaSessao(ids) { return { fila: ids.slice(), pos: 0, confirmada: false, ultimo: null } }

  function confirmar(estado, sessao, questoes, letra, quando) {
    if (sessao.confirmada) return sessao.ultimo
    const id = sessao.fila[sessao.pos]
    const q = questoes.find(x => x.id === id)
    const acertou = LETRAS.indexOf(letra) === q.certa
    registrarResposta(estado, id, acertou, quando)
    sessao.confirmada = true
    sessao.ultimo = { acertou, certa: LETRAS[q.certa] }
    return sessao.ultimo
  }

  function proxima(sessao) {
    sessao.pos++
    sessao.confirmada = false
    sessao.ultimo = null
    return sessao.pos < sessao.fila.length ? sessao.fila[sessao.pos] : null
  }

  function errosPendentes(estado, questoes) {
    const comExpl = new Set(questoes.filter(temExplicacao).map(q => q.id))
    return Object.keys(estado.hist).filter(id => estado.hist[id].ultima === 0 && comExpl.has(id))
  }

  function provasDisponiveis(questoes) {
    const m = new Map()
    for (const q of questoes) {
      if (q.origem !== 'oficial' || q.desatualizada) continue
      const k = q.exame + (q.reaplicacao ? 'r' : '')
      const p = m.get(k) || { exame: q.exame, reaplicacao: !!q.reaplicacao, ano: q.ano, total: 0 }
      p.total++
      m.set(k, p)
    }
    return [...m.values()].sort((a, b) => b.exame - a.exame || (a.reaplicacao - b.reaplicacao))
  }

  function montarSimulado(questoes, opcoes, distribuicao, estado, rng) {
    const validas = questoes.filter(q => !q.desatualizada)
    if (opcoes.tipo === 'prova') {
      const ids = validas
        .filter(q => q.origem === 'oficial' && q.exame === opcoes.exame && !!q.reaplicacao === !!opcoes.reaplicacao)
        .sort((a, b) => a.num - b.num).map(q => q.id)
      return { ids, faltaram: 0 }
    }
    // menor nota primeiro: não vista e de 2018+ (o sort é estável, então o embaralhamento decide os empates)
    const nota = (q) => (estado.hist[q.id] ? 2 : 0) + ((q.ano || 0) >= 2018 ? 0 : 1)
    const escolher = (materia, n) => embaralhar(validas.filter(q => q.materia === materia), rng)
      .sort((a, b) => nota(a) - nota(b)).slice(0, n).map(q => q.id)
    if (opcoes.tipo === 'mini') {
      const ids = escolher(opcoes.materia, opcoes.n)
      return { ids, faltaram: Math.max(0, opcoes.n - ids.length) }
    }
    let ids = [], faltaram = 0
    for (const { chave } of MATERIAS) {
      const n = distribuicao[chave] || 0
      const sel = escolher(chave, n)
      faltaram += n - sel.length
      ids = ids.concat(sel)
    }
    return { ids, faltaram }
  }

  function novoSimulado(opcoes, ids) {
    return { opcoes, ids: ids.slice(), respostas: {}, atual: 0, decorridoMs: 0, entregue: false }
  }

  function responderSimulado(sim, id, letra) { sim.respostas[id] = letra }

  function contarTempo(sim, ms) { sim.decorridoMs += Math.max(0, ms) }

  function tempoRestanteMs(sim) {
    return sim.opcoes.tipo === 'mini' ? null : Math.max(0, CINCO_HORAS - sim.decorridoMs)
  }

  function corrigir(questoes, sim) {
    const porId = indexar(questoes)
    const porMateria = {}
    let acertos = 0
    for (const id of sim.ids) {
      const q = porId[id]
      if (!q) continue
      const pm = porMateria[q.materia] || (porMateria[q.materia] = { acertos: 0, total: 0 })
      pm.total++
      if (sim.respostas[id] && LETRAS.indexOf(sim.respostas[id]) === q.certa) { acertos++; pm.acertos++ }
    }
    const total = sim.ids.length
    return {
      acertos,
      total,
      pct: total ? Math.round((acertos / total) * 1000) / 10 : 0,
      porMateria,
      aprovado: sim.opcoes.tipo === 'mini' ? null : acertos * 2 >= total,
    }
  }

  function registrarSimulado(estado, questoes, sim, quando) {
    const porId = indexar(questoes)
    for (const id of sim.ids) {
      const letra = sim.respostas[id]
      const q = porId[id]
      if (letra && q) registrarResposta(estado, id, LETRAS.indexOf(letra) === q.certa, quando)
    }
    sim.entregue = true
  }

  function desempenho(estado, questoes) {
    const porId = indexar(questoes)
    const acc = {}
    for (const [id, h] of Object.entries(estado.hist)) {
      const q = porId[id]
      if (!q) continue
      const a = acc[q.materia] || (acc[q.materia] = { respondidas: 0, acertos: 0 })
      a.respondidas++
      a.acertos += h.ultima
    }
    return MATERIAS.filter(m => acc[m.chave]).map(m => ({
      chave: m.chave, nome: m.nome, respondidas: acc[m.chave].respondidas, acertos: acc[m.chave].acertos,
      pct: Math.round((100 * acc[m.chave].acertos) / acc[m.chave].respondidas),
    }))
  }

  function resumoDoDia(estado, inicioDoDia) {
    let respondidas = 0, acertos = 0
    for (const h of Object.values(estado.hist)) {
      if (h.ts >= inicioDoDia) { respondidas++; acertos += h.ultima }
    }
    return { respondidas, acertos }
  }

  const estadoVazio = () => ({ versao: 1, hist: {}, simulado: null, fonte: 20 })

  function carregarEstado(texto) {
    try {
      const e = JSON.parse(texto)
      if (!e || e.versao !== 1 || typeof e.hist !== 'object' || e.hist === null) return estadoVazio()
      return Object.assign(estadoVazio(), e)
    } catch (_) {
      return estadoVazio()
    }
  }

  const Logica = {
    MATERIAS, LETRAS, CINCO_HORAS, criarRng, embaralhar, temExplicacao, indexar, romano, contagemTreino,
    filtrarTreino, registrarResposta, novaSessao, confirmar, proxima, errosPendentes, provasDisponiveis,
    montarSimulado, novoSimulado, responderSimulado, contarTempo, tempoRestanteMs, corrigir,
    registrarSimulado, desempenho, resumoDoDia, estadoVazio, carregarEstado,
  }
  if (typeof module === 'object' && module.exports) module.exports = Logica
  else raiz.Logica = Logica
})(typeof self !== 'undefined' ? self : this)
