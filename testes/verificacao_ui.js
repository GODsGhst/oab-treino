// Roteiro de verificação da interface — rodar no navegador, na página do app, em 320×640.
// Cobre os achados da revisão final: palavras partidas com letra 26 px, rolagem herdada, Pausar no mini,
// "Revisar meus erros" reaberto depois de terminado e a seta da "Base legal". Devolve um objeto: tudo true = ok.
(async () => {
  const espera = (ms) => new Promise(r => setTimeout(r, ms))
  const clicar = async (sel, ms = 200) => { const el = document.querySelector(sel); if (!el) throw new Error('não achei ' + sel + ' em ' + location.hash); el.click(); await espera(ms) }
  const linhas = (el) => { const t = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).pop(); if (!t) return 1; const r = document.createRange(); r.selectNodeContents(t); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size }
  for (let i = 0; i < 40 && !Array.isArray(window.QUESTOES); i++) await espera(250)
  localStorage.removeItem('oab-treino:v1')
  const r = {}
  location.hash = '#/'; await espera(300)
  for (let i = 0; i < 4; i++) { const b = document.querySelector('[data-delta="1"]'); if (b && !b.disabled) await clicar('[data-delta="1"]') }
  // (a) botões do simulado sem palavra partida, com letra 26 px
  location.hash = '#/simulado/mini/civil'; await espera(300)
  await clicar('[data-n="10"]', 400)
  if (document.querySelector('dialog')) await clicar('dialog .btn-ouro', 300)
  await clicar('[data-acao="sim-mover"][data-delta="1"]', 300)
  const partidos = [...document.querySelectorAll('.topo button, .barra-sim .btn')].filter(b => linhas(b) > 1).map(b => b.textContent.trim())
  r.a_semPalavraPartida = partidos.length === 0 || partidos
  // (c) Pausar no mini leva ao menu do simulado
  await clicar('[data-acao="voltar"]', 400)
  r.c_pausarVaiAoMenu = location.hash === '#/simulado' || location.hash
  // (b) tela nova abre no topo
  location.hash = '#/treino'; await espera(300)
  window.scrollTo(0, 5000); await espera(100)
  await clicar('.linha[data-para="#/treino/civil"]', 400)
  r.b_telaNovaNoTopo = window.scrollY === 0 || window.scrollY
  // (e) "Base legal" com seta (precisa de uma questão confirmada)
  await clicar('[data-letra="A"]'); await clicar('[data-acao="confirmar"]', 500)
  const sum = document.querySelector('details.base summary')
  r.e_baseLegalComSeta = !sum || getComputedStyle(sum, '::after').content !== 'none' || getComputedStyle(sum).display === 'list-item'
  // (d) "Revisar meus erros" terminado e reaberto começa de novo (não mostra o resumo velho)
  for (let i = 0; i < 6 && !document.querySelector('.veredito.nao'); i++) {
    await espera(750); await clicar('[data-acao="proxima"]', 300)
    await clicar('[data-letra="B"]'); await clicar('[data-acao="confirmar"]', 400)
  }
  location.hash = '#/'; await espera(300)
  await clicar('.menu-item[data-para="#/erros"]', 400)
  await clicar('[data-letra="A"]'); await clicar('[data-acao="confirmar"]', 400)
  await espera(750); await clicar('[data-acao="proxima"]', 300) // "Ver resumo"
  const viuResumo = (document.querySelector('.titulo') || {}).textContent === 'Você terminou esta lista'
  location.hash = '#/'; await espera(300)
  await clicar('.menu-item[data-para="#/erros"]', 400)
  r.d_errosAbreSessaoNova = viuResumo && (document.querySelector('.titulo') || {}).textContent !== 'Você terminou esta lista'
  return r
})()
