// Telas, rotas e armazenamento do OAB Treino. As regras ficam em logica.js (testadas no Node).
(function () {
  'use strict'

  const L = window.Logica
  const NOME = 'Pádua' // também aparece na tela de carregamento do index.html
  const CHAVE = 'oab-treino:v1'
  const FONTES = [18, 20, 22, 24, 26]
  const FRASES = [
    'Uma questão de cada vez. É assim que se chega à carteira da OAB.',
    'Hoje é um bom dia para treinar um pouco.',
    'Cada erro de hoje é um acerto no dia da prova.',
    'Constância vale mais que pressa.',
    'O seu esforço de hoje aparece no dia da prova.',
  ]
  const ICONES = {
    livro: '<path d="M3 5.5c2.6-1 5.6-1 9 1 3.4-2 6.4-2 9-1V19c-2.6-1-5.6-1-9 1-3.4-2-6.4-2-9-1z"/><path d="M12 6.5V20"/>',
    relogio: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.4 6.6l1.4-1.4"/>',
    revisar: '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15"/><path d="M4.5 19.5V15H9"/>',
    grafico: '<path d="M5 20v-8M12 20V5M19 20v-6"/>',
    voltar: '<path d="M15 5l-7 7 7 7"/>',
    aviso: '<path d="M12 3.8l9 15.7H3z"/><path d="M12 10v4.2M12 17.2v.3"/>',
    certo: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    errado: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    mapa: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  }

  const app = document.getElementById('app')
  const rng = L.criarRng((Date.now() ^ 0x5bd1e995) >>> 0)
  let Q = []
  let POR_ID = {}
  let DIST = {}
  let estado = L.estadoVazio()
  let treino = null // { rota, titulo, sessao, escolhida, acertos, revelar }
  let ultimaRota = null
  let saudacaoAnimada = false
  let relogio = null
  let ultimoTick = 0
  let tiques = 0

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const paragrafos = (t) => String(t || '').split('\n').filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('')
  const quebras = (t) => esc(t).replace(/\n/g, '<br>')
  const icone = (nome) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</svg>`
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
  const nomeMateria = (k) => { const m = L.MATERIAS.find((x) => x.chave === k); return m ? m.nome : k }
  const nomeExame = (exame, reap) => `Exame ${L.romano(exame)}${reap ? ' (reaplicação)' : ''}`
  const origemDa = (q) => (q.origem === 'inedita' ? 'Questão inédita, no estilo da FGV' : `Questão ${q.num} do ${nomeExame(q.exame, q.reaplicacao)}, de ${q.ano}`)
  const reduzido = () => document.documentElement.classList.contains('sem-animacao') ||
    (!!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const simEmAndamento = () => (estado.simulado && !estado.simulado.entregue ? estado.simulado : null)
  const respondidas = (sim) => sim.ids.filter((id) => sim.respostas[id]).length

  function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch (e) { /* sem espaço: o app segue funcionando */ } }
  function carregarEstado() {
    let texto = null
    try { texto = localStorage.getItem(CHAVE) } catch (e) { texto = null }
    estado = L.carregarEstado(texto)
    if (FONTES.indexOf(estado.fonte) < 0) estado.fonte = 20
  }
  function aplicarFonte() { document.documentElement.style.fontSize = estado.fonte + 'px' }
  // ir/trocar = navegação para frente: a tela nova abre no topo. O Voltar (history.back) mantém a rolagem.
  let rolarTopo = false
  function ir(hash) { rolarTopo = true; if (location.hash === hash) render(); else location.hash = hash }
  function trocar(hash) { rolarTopo = true; history.replaceState(null, '', hash); render() }
  let depoisDeVoltar = null // tela que substitui a entrada do histórico em que um history.back() vai cair

  function descreverSimulado(sim) {
    const o = sim.opcoes
    if (o.tipo === 'completo') return 'Simulado completo'
    if (o.tipo === 'mini') return `Mini-simulado de ${nomeMateria(o.materia)}`
    return `Prova do ${nomeExame(o.exame, o.reaplicacao)}`
  }
  function formatarTempo(ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(ss).padStart(2, '0')
  }
  function textoRelogio(sim) {
    const r = L.tempoRestanteMs(sim)
    if (r === null) return formatarTempo(sim.decorridoMs)
    return r === 0 ? 'Tempo esgotado — pode continuar' : `${formatarTempo(r)} restantes`
  }

  // ---------- pedaços de tela ----------
  const topo = (direita) => `<div class="topo"><button class="voltar" data-acao="voltar">${icone('voltar')}Voltar</button>${direita || ''}</div>`
  const cabecalho = (q) => `<h1 class="materia">${esc(nomeMateria(q.materia))}</h1><p class="origem">${esc(origemDa(q))}</p>`
  const faixaDesatualizada = (q) => `<p class="faixa-aviso"><strong>Atenção:</strong> esta questão é de ${q.ano} e a lei mudou depois. ${esc(q.desatualizada)}</p>`
  const itemMenu = (para, ic, titulo, desc, contador) => `
    <button class="menu-item" data-acao="ir" data-para="${para}">
      <span class="icone">${icone(ic)}</span>
      <span class="menu-texto"><span class="menu-titulo">${titulo}</span><span class="menu-desc">${desc}</span></span>
      ${contador ? `<span class="contador" aria-hidden="true">${contador}</span>` : ''}
    </button>`
  const cartaoContinuar = (sim) => `
    <button class="continuar" data-acao="ir" data-para="#/simulado/fazendo">
      <span class="continuar-titulo">Continuar simulado</span>
      <span class="continuar-desc">${esc(descreverSimulado(sim))}, ${respondidas(sim)} de ${sim.ids.length} respondidas</span>
    </button>`
  const telaVazia = (titulo, msg) => `
    <div class="tela">${topo()}
      <h1 class="titulo">${esc(titulo)}</h1>
      <p class="vazio">${esc(msg)}</p>
      <div class="barra"><button class="btn btn-linha" data-acao="voltar">Voltar</button></div>
    </div>`
  const barra = (nome, acertos, total) => `
    <li><div class="barra-rotulo"><span>${esc(nome)}</span><span>${acertos} de ${total}</span></div>
      <div class="barra-trilho"><div class="barra-cheia" style="width:${total ? Math.round((100 * acertos) / total) : 0}%"></div></div></li>`

  function textoExplicacao(t) {
    const m = /^(Certa|Errada)\.\s*/.exec(t || '')
    if (!m) return esc(t)
    return `<b class="${m[1] === 'Certa' ? 'v-certa' : 'v-errada'}">${m[1]}.</b> ${esc(t.slice(m[0].length))}`
  }

  // revelado: null (respondendo) | 'revelando' (abre as explicações com animação) | 'aberta' (já abertas)
  function alternativas(q, escolhida, revelado, acao) {
    const certa = L.LETRAS[q.certa]
    const itens = q.alt.map((texto, i) => {
      const letra = L.LETRAS[i]
      const cls = ['alt']
      if (revelado) {
        if (letra === certa) cls.push('certa')
        else if (letra === escolhida) cls.push('errada')
      } else if (letra === escolhida) cls.push('escolhida')
      const leitor = revelado ? (letra === certa ? ' (alternativa correta)' : letra === escolhida ? ' (sua resposta)' : '') : ''
      const explicacao = revelado && q.expl
        ? `<span class="explica"><span><span class="explica-texto">${textoExplicacao(q.expl[i])}</span></span></span>` : ''
      return `<li><button class="${cls.join(' ')}" style="--i:${i}" data-acao="${acao}" data-letra="${letra}"${revelado ? ' disabled' : ` aria-pressed="${letra === escolhida}"`}>` +
        `<span class="letra" aria-hidden="true">${letra}</span>` +
        `<span class="alt-texto"><span class="sr">Alternativa ${letra}${leitor}: </span>${quebras(texto)}</span>${explicacao}</button></li>`
    })
    return `<ol class="alternativas${revelado ? ' ' + revelado : ''}">${itens.join('')}</ol>`
  }

  const veredito = (acertou, texto) =>
    `<p class="veredito ${acertou ? 'ok' : 'nao'}" role="status">${icone(acertou ? 'certo' : 'errado')}<span>${texto}</span></p>`

  function extras(q) {
    return (!q.expl && q.comentario ? `<section class="comentario"><h2>Comentário</h2>${paragrafos(q.comentario)}</section>` : '') +
      (q.pegadinha ? `<aside class="pegadinha"><strong>${icone('aviso')}Pegadinha</strong><p>${esc(q.pegadinha)}</p></aside>` : '') +
      (q.base_legal ? `<details class="base"><summary>Base legal</summary><p>${esc(q.base_legal)}</p></details>` : '') +
      (q.expl || q.comentario ? '<p class="aviso-ia">Explicação gerada por IA — na dúvida, confira na lei.</p>' : '')
  }

  // ---------- telas ----------
  function telaInicio() {
    const hoje = L.resumoDoDia(estado, inicioDoDia())
    const erros = L.errosPendentes(estado, Q).length
    const sim = simEmAndamento()
    const diaDoAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 864e5)
    const animar = !saudacaoAnimada && !reduzido()
    saudacaoAnimada = true
    const descErros = erros === 0 ? 'Nenhum erro pendente por enquanto'
      : erros === 1 ? 'Refaça a questão que você errou' : `Refaça as ${erros} questões que você errou`
    return `
      <div class="tela inicio${animar ? ' animar' : ''}">
        <h1 class="saudacao">Olá, ${esc(NOME)}</h1>
        <div class="fio" aria-hidden="true"></div>
        <div class="depois">
          <p class="frase">${esc(FRASES[diaDoAno % FRASES.length])}</p>
          ${hoje.respondidas ? `<p class="hoje">Hoje você respondeu ${plural(hoje.respondidas, 'questão', 'questões')} e acertou ${hoje.acertos}.</p>` : ''}
          ${sim ? cartaoContinuar(sim) : ''}
          <nav class="menu" aria-label="O que você quer fazer">
            ${itemMenu('#/treino', 'livro', 'Treinar questões', 'Escolha a matéria e veja a explicação na hora')}
            ${itemMenu('#/simulado', 'relogio', 'Fazer simulado', 'Como na prova: a correção vem no final')}
            ${itemMenu('#/erros', 'revisar', 'Revisar meus erros', descErros, erros)}
            ${itemMenu('#/desempenho', 'grafico', 'Meu desempenho', 'Veja como você está em cada matéria')}
          </nav>
          <div class="fonte">
            <span>Tamanho da letra</span>
            <span class="fonte-botoes"><button class="fonte-menor" data-acao="fonte" data-delta="-1" aria-label="Diminuir a letra"${estado.fonte <= FONTES[0] ? ' disabled' : ''}>A−</button><button class="fonte-maior" data-acao="fonte" data-delta="1" aria-label="Aumentar a letra"${estado.fonte >= FONTES[FONTES.length - 1] ? ' disabled' : ''}>A+</button></span>
          </div>
          <footer class="rodape">
            <p class="para">Feito para o Pádua</p>
            <p>by Otávio · © 2026 Otávio. Todos os direitos reservados.</p>
          </footer>
        </div>
      </div>`
  }

  function telaEscolhaTreino() {
    const c = L.contagemTreino(Q)
    const linha = (para, nome, n) => `<li><button class="linha" data-acao="ir" data-para="${para}"${n ? '' : ' disabled'}>` +
      `<span>${esc(nome)}</span><span class="qtd">${n ? plural(n, 'questão', 'questões') : 'ainda sem questões'}</span></button></li>`
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Treinar questões</h1>
        <p class="sub">Você escolhe a resposta, confirma e já vê por que cada alternativa está certa ou errada.</p>
        <ul class="lista">${linha('#/treino/todas', 'Todas as matérias', c.todas)}${linha('#/treino/pegadinhas', 'Só pegadinhas', c.pegadinhas)}</ul>
        <h2 class="grupo-titulo">Por matéria</h2>
        <ul class="lista">${L.MATERIAS.map((m) => linha('#/treino/' + m.chave, m.nome, c.porMateria[m.chave] || 0)).join('')}</ul>
      </div>`
  }

  const tituloFiltro = (f) => (f === 'todas' ? 'Todas as matérias' : f === 'pegadinhas' ? 'Só pegadinhas' : nomeMateria(f))

  function telaTreino(rota, titulo, gerar) {
    if (!treino || treino.rota !== rota) {
      treino = { rota, titulo, sessao: L.novaSessao(gerar()), escolhida: null, acertos: 0, revelar: false }
    }
    const s = treino.sessao
    if (!s.fila.length) {
      return telaVazia(titulo, rota === '#/erros'
        ? 'Nenhum erro pendente. Quando você errar uma questão, ela aparece aqui para você revisar.'
        : 'Ainda não há questões explicadas desta matéria. Tente outra ou volte mais tarde.')
    }
    const id = s.fila[s.pos]
    if (!id) return telaFimLista()
    const q = POR_ID[id]
    const conf = s.confirmada ? s.ultimo : null
    const texto = conf && (conf.acertou ? 'Você acertou!' : `Não foi dessa vez. A certa é a ${conf.certa}.`)
    return `
      <div class="tela">
        ${topo(`<span class="progresso">${s.pos + 1} de ${s.fila.length}</span>`)}
        ${cabecalho(q)}
        ${q.desatualizada ? faixaDesatualizada(q) : ''}
        <div class="enunciado">${paragrafos(q.enunciado)}</div>
        ${conf ? veredito(conf.acertou, texto) : ''}
        ${alternativas(q, treino.escolhida, conf ? (treino.revelar ? 'revelando' : 'aberta') : null, 'treino-alt')}
        ${conf ? extras(q) : ''}
        <div class="barra">
          ${conf
            ? `<button class="btn btn-ouro" data-acao="proxima">${s.pos + 1 < s.fila.length ? 'Próxima questão' : 'Ver resumo'}</button>`
            : `<button class="btn btn-ouro" data-acao="confirmar"${treino.escolhida ? '' : ' disabled'}>Confirmar resposta</button>`}
        </div>
      </div>`
  }

  function telaFimLista() {
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Você terminou esta lista</h1>
        <p class="sub">${esc(treino.titulo)}: você acertou ${treino.acertos} de ${plural(treino.sessao.fila.length, 'questão', 'questões')}.</p>
        <div class="barra">
          <button class="btn btn-ouro" data-acao="recomecar">Treinar de novo</button>
          <button class="btn btn-linha" data-acao="ir" data-para="#/">Voltar ao início</button>
        </div>
      </div>`
  }

  function telaEscolhaSimulado() {
    const sim = simEmAndamento()
    const opcao = (atributos, titulo, desc) => `<button class="menu-item" ${atributos}><span class="menu-texto">` +
      `<span class="menu-titulo">${titulo}</span><span class="menu-desc">${desc}</span></span></button>`
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Fazer simulado</h1>
        <p class="sub">Você responde tudo e só vê a correção no final, como na prova.</p>
        ${sim ? cartaoContinuar(sim) : ''}
        <nav class="menu" aria-label="Tipos de simulado">
          ${opcao('data-acao="sim-iniciar" data-tipo="completo"', 'Simulado completo', '80 questões em 5 horas, com a mesma divisão de matérias da prova')}
          ${opcao('data-acao="ir" data-para="#/simulado/mini"', 'Mini-simulado', 'Uma matéria, com 10, 20 ou 30 questões')}
          ${opcao('data-acao="ir" data-para="#/simulado/prova"', 'Prova oficial', 'Refaça um Exame de Ordem inteiro, do jeito que ele caiu')}
        </nav>
      </div>`
  }

  function disponiveisPorMateria() {
    const n = {}
    for (const q of Q) if (!q.desatualizada) n[q.materia] = (n[q.materia] || 0) + 1
    return n
  }

  function telaMiniMaterias() {
    const n = disponiveisPorMateria()
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Mini-simulado</h1>
        <p class="sub">Escolha a matéria.</p>
        <ul class="lista">${L.MATERIAS.map((m) => `<li><button class="linha" data-acao="ir" data-para="#/simulado/mini/${m.chave}"${n[m.chave] ? '' : ' disabled'}>` +
          `<span>${esc(m.nome)}</span><span class="qtd">${plural(n[m.chave] || 0, 'questão', 'questões')}</span></button></li>`).join('')}</ul>
      </div>`
  }

  function telaMiniQtd(chave) {
    if (!L.MATERIAS.some((m) => m.chave === chave)) return null
    const disp = disponiveisPorMateria()[chave] || 0
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">${esc(nomeMateria(chave))}</h1>
        <p class="sub">Quantas questões? Existem ${plural(disp, 'questão', 'questões')} desta matéria no app.</p>
        ${[10, 20, 30].map((n) => `<button class="btn btn-linha opcao-qtd" data-acao="sim-iniciar" data-tipo="mini" data-materia="${chave}" data-n="${n}">${n} questões</button>`).join('')}
      </div>`
  }

  function telaProvas() {
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Prova oficial</h1>
        <p class="sub">Escolha o exame. As questões vêm na ordem da prova.</p>
        <ul class="lista">${L.provasDisponiveis(Q).map((p) => `<li><button class="linha" data-acao="sim-iniciar" data-tipo="prova" data-exame="${p.exame}" data-reap="${p.reaplicacao ? 1 : 0}">` +
          `<span>${esc(nomeExame(p.exame, p.reaplicacao))}</span><span class="qtd">${p.ano}, ${plural(p.total, 'questão', 'questões')}</span></button></li>`).join('')}</ul>
      </div>`
  }

  function telaFazendo() {
    const sim = simEmAndamento()
    if (!sim) return trocar('#/simulado')
    const i = sim.atual
    const q = POR_ID[sim.ids[i]]
    const ultima = i + 1 >= sim.ids.length
    return `
      <div class="tela">
        <div class="topo">
          <button class="voltar" data-acao="voltar">${icone('voltar')}Pausar</button>
          <span class="relogio" id="relogio">${textoRelogio(sim)}</span>
          <button class="btn-mapa" data-acao="ir" data-para="#/simulado/mapa">${icone('mapa')}Mapa</button>
        </div>
        <p class="progresso-sim">Questão ${i + 1} de ${sim.ids.length}</p>
        ${cabecalho(q)}
        <div class="enunciado">${paragrafos(q.enunciado)}</div>
        ${alternativas(q, sim.respostas[q.id] || null, null, 'sim-alt')}
        <div class="barra barra-sim">
          <button class="btn btn-linha" data-acao="sim-mover" data-delta="-1"${i === 0 ? ' disabled' : ''}>Anterior</button>
          ${ultima ? '<button class="btn btn-ouro" data-acao="sim-entregar">Entregar</button>' : '<button class="btn btn-ouro" data-acao="sim-mover" data-delta="1">Próxima</button>'}
        </div>
      </div>`
  }

  function telaMapa() {
    const sim = simEmAndamento()
    if (!sim) return trocar('#/simulado')
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Mapa do simulado</h1>
        <p class="sub">${respondidas(sim)} de ${sim.ids.length} respondidas. Toque num número para ir até a questão.</p>
        <div class="mapa">${sim.ids.map((id, i) => `<button data-acao="sim-ir" data-i="${i}" class="${sim.respostas[id] ? 'feita' : ''}${i === sim.atual ? ' atual' : ''}" ` +
          `aria-label="Questão ${i + 1}${sim.respostas[id] ? ', respondida' : ''}">${i + 1}</button>`).join('')}</div>
        <div class="barra"><button class="btn btn-ouro" data-acao="sim-entregar">Entregar simulado</button></div>
      </div>`
  }

  function linhaRevisao(sim, id, i) {
    const q = POR_ID[id], resp = sim.respostas[id]
    const marca = !resp ? '<span class="marca branco">Em branco</span>'
      : L.LETRAS.indexOf(resp) === q.certa ? '<span class="marca ok">Acertou</span>' : '<span class="marca nao">Errou</span>'
    return `<li><button class="linha" data-acao="ir" data-para="#/simulado/revisar/${i}"><span>${i + 1}. ${esc(nomeMateria(q.materia))}</span>${marca}</button></li>`
  }

  function telaResultado() {
    const sim = estado.simulado
    if (!sim || !sim.entregue) return trocar('#/simulado')
    const r = L.corrigir(Q, sim)
    const faltam = Math.ceil(r.total / 2) - r.acertos
    const selo = r.aprovado === null ? ''
      : r.aprovado ? `<p class="selo ok">${icone('certo')}Aprovado</p>`
        : `<p class="selo nao">Ainda não. Faltaram ${plural(faltam, 'acerto', 'acertos')} para passar.</p>`
    const materias = L.MATERIAS.filter((m) => r.porMateria[m.chave])
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">${esc(descreverSimulado(sim))}</h1>
        <p class="nota"><span data-contar="${r.acertos}">${r.acertos}</span><small> de ${r.total}</small></p>
        <p class="sub">Você acertou ${String(r.pct).replace('.', ',')}% das questões.</p>
        ${selo}
        ${materias.length > 1 ? `<h2 class="grupo-titulo">Por matéria</h2><ul class="barras">${materias.map((m) => barra(m.nome, r.porMateria[m.chave].acertos, r.porMateria[m.chave].total)).join('')}</ul>` : ''}
        <h2 class="grupo-titulo">Questão por questão</h2>
        <ul class="lista">${sim.ids.map((id, i) => linhaRevisao(sim, id, i)).join('')}</ul>
        <div class="barra"><button class="btn btn-ouro" data-acao="ir" data-para="#/simulado">Fazer outro simulado</button></div>
      </div>`
  }

  function telaRevisar(i) {
    const sim = estado.simulado
    if (!sim || !sim.entregue || !(i >= 0 && i < sim.ids.length)) return trocar('#/simulado')
    const q = POR_ID[sim.ids[i]], resp = sim.respostas[q.id] || null
    const certa = L.LETRAS[q.certa]
    const msg = !resp ? `Você deixou em branco. A certa é a ${certa}.` : resp === certa ? 'Você acertou.' : `Você marcou ${resp}. A certa é a ${certa}.`
    return `
      <div class="tela">${topo(`<span class="progresso">${i + 1} de ${sim.ids.length}</span>`)}
        ${cabecalho(q)}
        <div class="enunciado">${paragrafos(q.enunciado)}</div>
        ${veredito(resp === certa, msg)}
        ${alternativas(q, resp, 'aberta', 'nada')}
        ${q.expl || q.comentario ? extras(q) : '<p class="aviso-ia">Esta questão ainda não tem explicação.</p>'}
        <div class="barra barra-sim">
          <button class="btn btn-linha" data-acao="rev-ir" data-i="${i - 1}"${i === 0 ? ' disabled' : ''}>Anterior</button>
          <button class="btn btn-ouro" data-acao="rev-ir" data-i="${i + 1}"${i + 1 >= sim.ids.length ? ' disabled' : ''}>Próxima</button>
        </div>
      </div>`
  }

  function telaDesempenho() {
    const hist = Object.values(estado.hist)
    if (!hist.length) {
      return telaVazia('Meu desempenho', 'Você ainda não respondeu nenhuma questão. Comece pelo treino e volte aqui para ver como está indo.')
    }
    const acertos = hist.reduce((a, h) => a + h.ultima, 0)
    return `
      <div class="tela">${topo()}
        <h1 class="titulo">Meu desempenho</h1>
        <p class="sub">Você já respondeu ${plural(hist.length, 'questão', 'questões')} e está acertando ${Math.round((100 * acertos) / hist.length)}%, contando a última resposta de cada uma.</p>
        <ul class="barras">${L.desempenho(estado, Q).map((d) => barra(d.nome, d.acertos, d.respondidas)).join('')}</ul>
      </div>`
  }

  // ---------- ações ----------
  function confirmarTreino() {
    if (!treino || !treino.escolhida || treino.sessao.confirmada) return
    const r = L.confirmar(estado, treino.sessao, Q, treino.escolhida, Date.now())
    if (r.acertou) treino.acertos++
    // "Próxima questão" nasce no mesmo lugar do "Confirmar": um toque duplo não pode pular a explicação
    treino.travaAte = Date.now() + 700
    salvar()
    treino.revelar = !reduzido()
    render()
    treino.revelar = false
    const lista = app.querySelector('.alternativas.revelando')
    if (lista) setTimeout(() => lista.classList.add('aberta'), 40)
    const v = app.querySelector('.veredito')
    if (v && v.scrollIntoView) v.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth', block: 'start' })
  }

  function proximaTreino() {
    L.proxima(treino.sessao)
    treino.escolhida = null
    render({ animar: true })
    window.scrollTo(0, 0)
  }

  function mudarFonte(delta) {
    const i = Math.max(0, Math.min(FONTES.length - 1, FONTES.indexOf(estado.fonte) + delta))
    estado.fonte = FONTES[i]
    aplicarFonte()
    salvar()
    render()
  }

  function opcoesDe(d) {
    if (d.tipo === 'mini') return { tipo: 'mini', materia: d.materia, n: +d.n }
    if (d.tipo === 'prova') return { tipo: 'prova', exame: +d.exame, reaplicacao: d.reap === '1' }
    return { tipo: 'completo' }
  }

  function iniciarSimulado(opcoes) {
    const comecar = () => {
      const r = L.montarSimulado(Q, opcoes, DIST, estado, rng)
      if (!r.ids.length) return aviso('Ainda não há questões para esse simulado.')
      // o simulado só é criado quando começa de fato: fechar o aviso abaixo sem "Entendi" não deixa simulado pela metade
      const abrir = () => {
        estado.simulado = L.novoSimulado(opcoes, r.ids)
        salvar()
        // a tela anterior ao simulado passa a ser o menu do simulado: Pausar e o Voltar do resultado caem lá
        if (location.hash !== '#/simulado') history.replaceState(null, '', '#/simulado')
        ir('#/simulado/fazendo')
      }
      if (opcoes.tipo === 'mini' && r.faltaram > 0) {
        aviso(`Só existem ${plural(r.ids.length, 'questão', 'questões')} desta matéria — o simulado vai ter ${r.ids.length}.`, abrir)
      } else abrir()
    }
    const atual = simEmAndamento()
    if (!atual) return comecar()
    perguntar(`Você tem um simulado em andamento (respondeu ${respondidas(atual)} de ${atual.ids.length}). Descartar e começar outro?`, [
      { texto: 'Continuar o simulado', estilo: 'btn-ouro', acao: () => ir('#/simulado/fazendo') },
      { texto: 'Descartar e começar outro', estilo: 'btn-perigo', acao: comecar },
    ])
  }

  function responderSim(letra) {
    const sim = simEmAndamento()
    if (!sim) return
    L.responderSimulado(sim, sim.ids[sim.atual], letra)
    salvar()
    render()
  }

  function moverSim(delta) {
    const sim = simEmAndamento()
    if (!sim) return
    sim.atual = Math.max(0, Math.min(sim.ids.length - 1, sim.atual + delta))
    salvar()
    render({ animar: true })
    window.scrollTo(0, 0)
  }

  function pedirEntrega() {
    const sim = simEmAndamento()
    if (!sim) return
    const feitas = respondidas(sim)
    perguntar(feitas < sim.ids.length ? `Você respondeu ${feitas} de ${sim.ids.length}. Entregar mesmo assim?` : 'Entregar o simulado e ver a correção?', [
      { texto: 'Entregar', estilo: 'btn-ouro', acao: entregar },
      { texto: 'Continuar respondendo', estilo: 'btn-linha' },
    ])
  }

  function entregar() {
    const sim = simEmAndamento()
    if (!sim) return
    pararRelogio()
    L.registrarSimulado(estado, Q, sim, Date.now())
    salvar()
    if (location.hash === '#/simulado/mapa') {
      // o Mapa é uma entrada a mais no histórico: volta para a da questão e troca essa pelo resultado,
      // senão o Voltar do resultado cairia numa questão que não existe mais e depois num menu repetido
      depoisDeVoltar = '#/simulado/resultado'
      history.back()
    } else trocar('#/simulado/resultado')
  }

  // ---------- diálogos ----------
  const fecharDialogos = () => document.querySelectorAll('dialog').forEach((d) => d.remove())
  function perguntar(texto, botoes) {
    fecharDialogos()
    const d = document.createElement('dialog')
    d.setAttribute('role', 'alertdialog')
    d.setAttribute('aria-modal', 'true')
    d.setAttribute('aria-labelledby', 'dialogo-texto')
    d.innerHTML = `<p id="dialogo-texto">${esc(texto)}</p>${botoes.map((b, i) => `<button class="btn ${b.estilo}" data-i="${i}">${esc(b.texto)}</button>`).join('')}`
    d.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]')
      if (!b) return
      const escolha = botoes[+b.dataset.i]
      d.remove()
      if (escolha.acao) escolha.acao()
    })
    d.addEventListener('cancel', () => setTimeout(() => d.remove(), 0))
    document.body.appendChild(d)
    if (d.showModal) d.showModal(); else d.setAttribute('open', '')
    const primeiro = d.querySelector('button')
    if (primeiro) primeiro.focus()
  }
  const aviso = (texto, depois) => perguntar(texto, [{ texto: 'Entendi', estilo: 'btn-ouro', acao: depois }])
  // chamado pelo Voltar do Android (MainActivity): com um diálogo aberto, o Voltar só fecha o diálogo
  window.voltarAndroid = () => {
    const d = document.querySelector('dialog')
    if (!d) return false
    d.remove()
    return true
  }

  // ---------- cronômetro do simulado (só conta com o app aberto e visível) ----------
  function contar() {
    const sim = simEmAndamento()
    const agora = performance.now()
    if (sim) L.contarTempo(sim, agora - ultimoTick)
    ultimoTick = agora
  }
  function iniciarRelogio() {
    ultimoTick = performance.now()
    relogio = setInterval(() => {
      if (document.hidden) { ultimoTick = performance.now(); return }
      contar()
      const sim = simEmAndamento()
      const el = document.getElementById('relogio')
      if (el && sim) {
        el.textContent = textoRelogio(sim)
        el.classList.toggle('esgotado', L.tempoRestanteMs(sim) === 0)
      }
      if (++tiques >= 10) { tiques = 0; salvar() }
    }, 1000)
  }
  function pararRelogio() {
    if (relogio === null) return
    contar()
    clearInterval(relogio)
    relogio = null
    salvar()
  }
  document.addEventListener('visibilitychange', () => {
    if (relogio === null) return
    if (document.hidden) { contar(); salvar() } else ultimoTick = performance.now()
  })
  window.addEventListener('pagehide', () => { if (relogio !== null) contar(); salvar() })

  function contarAte(el) {
    const alvo = +el.dataset.contar
    if (reduzido() || !alvo) { el.textContent = String(alvo); return }
    // o valor final já está no HTML; se a tela não estiver sendo desenhada, ele simplesmente fica lá
    let t0 = null
    const passo = (t) => {
      if (t0 === null) t0 = t
      const k = Math.min(1, (t - t0) / 600)
      el.textContent = String(Math.round(alvo * (1 - Math.pow(1 - k, 3))))
      if (k < 1) requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }

  // ---------- rotas ----------
  function render(op) {
    if (depoisDeVoltar) { const destino = depoisDeVoltar; depoisDeVoltar = null; return trocar(destino) }
    fecharDialogos()
    pararRelogio()
    const rota = location.hash || '#/'
    const p = rota.replace(/^#\/?/, '').split('/').filter(Boolean)
    let html = null
    if (!p.length) html = telaInicio()
    else if (p[0] === 'treino') html = p[1] ? telaTreino(rota, tituloFiltro(p[1]), () => L.filtrarTreino(Q, p[1], estado, rng)) : telaEscolhaTreino()
    else if (p[0] === 'erros') html = telaTreino(rota, 'Revisar meus erros', () => L.embaralhar(L.errosPendentes(estado, Q), rng))
    else if (p[0] === 'simulado') {
      if (!p[1]) html = telaEscolhaSimulado()
      else if (p[1] === 'mini') html = p[2] ? telaMiniQtd(p[2]) : telaMiniMaterias()
      else if (p[1] === 'prova') html = telaProvas()
      else if (p[1] === 'fazendo') html = telaFazendo()
      else if (p[1] === 'mapa') html = telaMapa()
      else if (p[1] === 'resultado') html = telaResultado()
      else if (p[1] === 'revisar') html = telaRevisar(parseInt(p[2], 10))
    } else if (p[0] === 'desempenho') html = telaDesempenho()
    if (html === undefined) return // a tela redirecionou (trocar) e já se desenhou
    if (html === null) return trocar('#/')
    app.innerHTML = html
    if (rolarTopo) { window.scrollTo(0, 0); rolarTopo = false }
    const novaTela = ultimaRota !== null && (rota !== ultimaRota || (op && op.animar))
    if (novaTela && app.firstElementChild && !reduzido()) app.firstElementChild.classList.add('entrar')
    if (novaTela) {
      // leitor de tela e teclado começam a tela nova (ou a questão nova) pelo título
      const titulo = app.querySelector('h1')
      if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }) }
    }
    ultimaRota = rota
    if (p[0] === 'simulado' && (p[1] === 'fazendo' || p[1] === 'mapa')) iniciarRelogio()
    const nota = app.querySelector('[data-contar]')
    if (nota) contarAte(nota)
  }

  app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]')
    if (!b || b.disabled) return
    const d = b.dataset
    switch (d.acao) {
      case 'ir':
        if (d.para.indexOf('#/treino/') === 0 || d.para === '#/erros') treino = null // entrar pelo menu = sessão nova
        return ir(d.para)
      case 'voltar': return history.back()
      case 'fonte': return mudarFonte(+d.delta)
      case 'treino-alt':
        if (treino && !treino.sessao.confirmada) { treino.escolhida = d.letra; render() }
        return
      case 'confirmar': return confirmarTreino()
      case 'proxima':
        if (treino && Date.now() < (treino.travaAte || 0)) return
        return proximaTreino()
      case 'recomecar': treino = null; return render({ animar: true })
      case 'sim-iniciar': return iniciarSimulado(opcoesDe(d))
      case 'sim-alt': return responderSim(d.letra)
      case 'sim-mover': return moverSim(+d.delta)
      case 'sim-ir': {
        const sim = simEmAndamento()
        if (sim) { sim.atual = +d.i; salvar() }
        return history.back()
      }
      case 'sim-entregar': return pedirEntrega()
      case 'rev-ir': return trocar('#/simulado/revisar/' + d.i)
    }
  })

  // ---------- início: desenha a tela de carregamento primeiro e só então lê as questões (arquivo grande) ----------
  function limparSimuladoAntigo() {
    const sim = estado.simulado
    if (!sim) return
    sim.ids = sim.ids.filter((id) => POR_ID[id])
    if (!sim.ids.length) estado.simulado = null
    else sim.atual = Math.min(sim.atual, sim.ids.length - 1)
  }

  function comecar() {
    carregarEstado()
    aplicarFonte()
    const s = document.createElement('script')
    s.src = 'questoes.js'
    s.onload = () => {
      Q = window.QUESTOES || []
      DIST = window.DISTRIBUICAO || {}
      POR_ID = L.indexar(Q)
      limparSimuladoAntigo()
      if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/')
      window.addEventListener('hashchange', () => render())
      render()
    }
    s.onerror = () => {
      app.innerHTML = `<div class="tela inicio"><h1 class="saudacao">Olá, ${esc(NOME)}</h1><p class="frase">Não consegui abrir as questões. Feche o app e abra de novo.</p></div>`
    }
    // setTimeout (e não requestAnimationFrame): não depende da tela estar sendo desenhada para carregar
    setTimeout(() => document.body.appendChild(s), 50)
  }

  comecar()
})()
