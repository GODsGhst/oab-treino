// Roteiro de verificação dos 6 detalhes deixados para depois na revisão final — rodar no navegador, na página do app,
// abrindo a página com o localStorage limpo. Cobre: aviso do mini fechado sem "Entendi", Voltar do Android com diálogo
// aberto, diálogo legível pelo leitor de tela, entregar pelo Mapa e foco no título (um <h1> por tela).
// Devolve um objeto: tudo true = ok.
(async () => {
  const espera = (ms) => new Promise(r => setTimeout(r, ms))
  const clicar = async (sel, ms = 300) => { const el = document.querySelector(sel); if (!el) throw new Error('não achei ' + sel + ' em ' + location.hash); el.click(); await espera(ms) }
  const ir = async (hash, ms = 400) => { location.hash = hash; await espera(ms) }
  const voltar = async (ms = 450) => { history.back(); await espera(ms) }
  const salvo = () => JSON.parse(localStorage.getItem('oab-treino:v1') || '{}')
  const focoNoH1 = () => !!document.activeElement && document.activeElement.tagName === 'H1'
  const nH1 = () => document.querySelectorAll('h1').length
  const comecarMini = async (materia, n) => { // pelo caminho de verdade: início → Fazer simulado → Mini → matéria
    await ir('#/'); await clicar('.menu-item[data-para="#/simulado"]', 450)
    await clicar('[data-para="#/simulado/mini"]', 450); await clicar(`[data-para="#/simulado/mini/${materia}"]`, 450)
    await clicar(`[data-n="${n}"]`, 450)
    if (document.querySelector('dialog .btn-perigo')) await clicar('dialog .btn-perigo', 450) // simulado anterior
    if (document.querySelector('dialog')) await clicar('dialog .btn-ouro', 450) // aviso "só existem N"
  }
  for (let i = 0; i < 40 && !Array.isArray(window.QUESTOES); i++) await espera(250)
  if (salvo().simulado) return { erro: 'abra a página com o localStorage limpo' }
  const r = {}

  // (1) mini com aviso "só existem N": fechar o aviso sem tocar em "Entendi" não deixa simulado criado
  await ir('#/simulado/mini/eleitoral')
  await clicar('[data-n="30"]', 450)
  const avisou = !!document.querySelector('dialog')
  if (avisou) document.querySelector('dialog').dispatchEvent(new Event('cancel'))
  await espera(250)
  r.d1_avisoFechadoNaoCriaSimulado = (avisou && !document.querySelector('dialog') && !salvo().simulado) || { avisou, simulado: !!salvo().simulado }

  // (5) foco vai para o título ao trocar de tela; telas de questão têm um <h1>; nova questão no treino também leva o foco
  await ir('#/treino')
  const focoMenu = focoNoH1()
  await ir('#/treino/civil')
  const h1Treino = nH1() === 1 && focoNoH1()
  await clicar('[data-letra="A"]'); await clicar('[data-acao="confirmar"]', 900)
  await clicar('[data-acao="proxima"]', 450)
  const focoProxima = focoNoH1()
  r.d5_focoNoTituloEUmH1 = (focoMenu && h1Treino && focoProxima) || { focoMenu, h1Treino, focoProxima }

  // (6) Voltar do Android com diálogo aberto: fecha o diálogo e fica na mesma tela; sem diálogo, devolve false
  await ir('#/')
  await comecarMini('civil', 10)
  const h1Fazendo = nH1() === 1
  await ir('#/simulado/mapa')
  await clicar('[data-acao="sim-entregar"]')
  const fechou = typeof window.voltarAndroid === 'function' && window.voltarAndroid() === true
  await espera(200)
  const semDialogo = !document.querySelector('dialog') && location.hash === '#/simulado/mapa'
  const semNada = typeof window.voltarAndroid === 'function' && window.voltarAndroid() === false
  r.d6_voltarFechaDialogo = (fechou && semDialogo && semNada) || { fechou, semDialogo, semNada }
  if (document.querySelector('dialog')) document.querySelector('dialog').remove() // (6) falhou: fecha para seguir

  // (4) diálogo com papel e nome para o leitor de tela
  await clicar('[data-acao="sim-entregar"]')
  const d = document.querySelector('dialog')
  const rotulo = d && document.getElementById(d.getAttribute('aria-labelledby') || '')
  r.d4_dialogoAcessivel = (!!d && d.getAttribute('role') === 'alertdialog' && d.getAttribute('aria-modal') === 'true' &&
    !!rotulo && d.contains(rotulo) && /Entregar/.test(rotulo.textContent)) || { role: d && d.getAttribute('role'), rotulo: !!rotulo }

  // (3) entregar pelo Mapa: no resultado, Voltar vai ao menu do simulado e o Voltar seguinte sai dele (sem Voltar "morto")
  await clicar('dialog .btn-ouro', 500)
  const noResultado = location.hash === '#/simulado/resultado'
  await clicar('.lista .linha', 450)
  const h1Revisar = location.hash.indexOf('#/simulado/revisar/') === 0 && nH1() === 1
  await voltar()
  await voltar()
  const noMenu = location.hash === '#/simulado' && (document.querySelector('h1') || {}).textContent === 'Fazer simulado'
  await voltar()
  const saiu = location.hash !== '#/simulado'
  r.d3_entregarPeloMapaSemVoltarMorto = (noResultado && noMenu && saiu) || { noResultado, noMenu, saiu, hash: location.hash }
  r.d5b_h1NoSimuladoENaRevisao = (h1Fazendo && h1Revisar) || { h1Fazendo, h1Revisar }

  // (7) por qualquer caminho, o menu do simulado fica logo antes da questão: Pausar cai nele e o Voltar seguinte sai dele
  const descartarSePerguntar = async () => { if (document.querySelector('dialog .btn-perigo')) await clicar('dialog .btn-perigo', 550) }
  const pausarEVoltar = async () => {
    await clicar('[data-acao="voltar"]', 450) // Pausar
    const menu = location.hash === '#/simulado'
    await voltar()
    return { menu, depois: location.hash }
  }
  const abrirMenu = async () => { await ir('#/'); await clicar('.menu-item[data-para="#/simulado"]', 450) }
  await abrirMenu(); await clicar('[data-para="#/simulado/prova"]', 450)
  await clicar('[data-acao="sim-iniciar"][data-tipo="prova"]', 550); await descartarSePerguntar()
  const prova = await pausarEVoltar()
  await abrirMenu(); await clicar('[data-para="#/simulado/mini"]', 450); await clicar('[data-para="#/simulado/mini/civil"]', 450)
  await clicar('[data-n="10"]', 550); await descartarSePerguntar()
  const mini = await pausarEVoltar()
  await ir('#/'); await clicar('.continuar', 550) // cartão "Continuar simulado" do início
  const continuarInicio = await pausarEVoltar()
  await abrirMenu(); await clicar('[data-para="#/simulado/mini"]', 450); await clicar('[data-para="#/simulado/mini/civil"]', 450)
  await clicar('[data-n="10"]', 550); await clicar('dialog .btn-ouro', 550) // "Continuar o simulado"
  const continuarDialogo = await pausarEVoltar()
  const casos7 = { prova, mini, continuarInicio, continuarDialogo }
  r.d7_menuLogoAntesDaQuestao = Object.values(casos7).every(x => x.menu && x.depois === '#/') || casos7

  // (8) "Fazer outro simulado" volta ao menu sem empilhar outro: o Voltar seguinte sai dele
  await abrirMenu()
  await clicar('[data-acao="sim-iniciar"][data-tipo="completo"]', 650); await descartarSePerguntar()
  await clicar('.btn-mapa', 450); await clicar('[data-acao="sim-entregar"]'); await clicar('dialog .btn-ouro', 650)
  const outro = [...document.querySelectorAll('.barra .btn')].find(b => /Fazer outro simulado/.test(b.textContent))
  if (outro) { outro.click(); await espera(450) }
  const noMenu8 = location.hash === '#/simulado'
  await voltar()
  r.d8_fazerOutroSemEmpilhar = (!!outro && noMenu8 && location.hash === '#/') || { botao: !!outro, noMenu8, depois: location.hash }
  return r
})()
