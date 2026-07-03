const API_URL = 'https://script.google.com/macros/s/AKfycbxPKEonTG51N3IoHoethr2tW6lY4j8VUzEXpumPqXIXPBT5_7JnnV36FRSLF1WLanCx/exec';
const UPDATE_MS = 5 * 60 * 1000;
const META_DIA = 22000;
const productIcons = ['🥤','☕','🍿','🧺','🥣','🧴','🧊','📦'];

function n(v){return Number(v || 0) || 0}
function txt(v, fallback='-'){return (v === null || v === undefined || String(v).trim()==='') ? fallback : String(v).trim()}
function fmt(v){return n(v).toLocaleString('pt-BR')}
function statusClass(status){const s=txt(status,'').toUpperCase();if(s.includes('LIG'))return 'ligada';if(s.includes('MANUT'))return 'manutencao';return 'parada'}
function statusLabel(status){const s=txt(status,'PARADA').toUpperCase();if(s.includes('LIG'))return 'LIGADA';if(s.includes('MANUT'))return 'MANUTENÇÃO';if(s.includes('DESL'))return 'DESLIGADA';return 'PARADA'}

function boolOn(v){
  const s = txt(v,'OFF').toUpperCase();
  return s === 'ON' || s === 'LIGADA' || s === 'LIGADO' || s === 'SIM' || s === 'TRUE';
}
function setAux(card, selector, value){
  const el = card.querySelector(selector);
  if(!el) return;
  const isOn = boolOn(value);
  el.classList.remove('on','off');
  el.classList.add(isOn ? 'on' : 'off');
  const label = el.querySelector('b');
  if(label) label.textContent = isOn ? 'ON' : 'OFF';
}

function updateClock(){const d=new Date();document.getElementById('currentDate').textContent=d.toLocaleDateString('pt-BR');document.getElementById('currentTime').textContent=d.toLocaleTimeString('pt-BR')}
setInterval(updateClock,1000);updateClock();

async function carregarDados(){
  try{
    const res = await fetch(API_URL + '?t=' + Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    render(data);
  }catch(err){
    console.error(err);
    document.getElementById('machinesGrid').innerHTML = `<div style="grid-column:1/-1;padding:24px;color:#ff6b6b;border:1px solid #88333a;border-radius:8px;background:#210d13">Erro ao carregar dados da planilha. Verifique a implantação do Apps Script.</div>`;
  }
}

function render(data){
  const injetoras = Array.isArray(data.injetoras) ? data.injetoras : [];
  renderInjetoras(injetoras);
  renderEmpacotadeira(data.empacotadeira || {});
  renderKpis(injetoras);
}

function renderKpis(injetoras){
  const producao = injetoras.reduce((s,i)=>s+n(i['Qtd. Produzida Hoje']),0);
  const ciclos = injetoras.map(i=>n(i['Ciclo (s)'])).filter(Boolean);
  const cicloMedio = ciclos.length ? Math.round(ciclos.reduce((a,b)=>a+b,0)/ciclos.length) : 0;
  const ligadas = injetoras.filter(i=>statusClass(i.Status)==='ligada').length;
  const paradas = injetoras.filter(i=>statusClass(i.Status)!=='ligada').length;
  const pctMeta = Math.min(100, Math.round((producao/META_DIA)*100));
  const produtividade = injetoras.length ? Math.round((ligadas/injetoras.length)*100) : 0;
  const alertas = injetoras.filter(i=>txt(i['Observação/Alerta'],'') !== '').length;

  document.getElementById('kpiProducaoHoje').textContent = `${fmt(producao)} un`;
  document.getElementById('metaPercent').textContent = `${pctMeta}%`;
  document.getElementById('metaBar').style.width = `${pctMeta}%`;
  document.getElementById('kpiProdutividade').textContent = `${produtividade}%`;
  document.getElementById('kpiMes').textContent = `${fmt(producao)} un`;
  document.getElementById('kpiCiclo').textContent = `${cicloMedio} s`;
  document.getElementById('qtdLigadas').textContent = `${ligadas} LIGADAS`;
  document.getElementById('qtdParadas').textContent = `${paradas} PARADAS`;
  document.getElementById('alertCount').textContent = alertas;
}

function renderEmpacotadeira(emp){
  const status = statusLabel(emp.Status || emp.status || 'DESLIGADA');
  const isOn = status.includes('LIG');
  const box = document.getElementById('empacotadeiraBox');
  const text = document.getElementById('empStatus');
  const toggle = document.getElementById('empToggle');

  text.textContent = isOn ? 'LIGADA' : 'DESLIGADA';
  text.className = isOn ? 'on-text' : 'off-text';

  box.classList.remove('on','off');
  box.classList.add(isOn ? 'on' : 'off');

  toggle.className = 'toggle ' + (isOn ? 'on' : 'off');
}

function renderInjetoras(injetoras){
  const grid = document.getElementById('machinesGrid');
  const tpl = document.getElementById('machineCardTemplate');
  grid.innerHTML = '';
  injetoras.forEach((inj,idx)=>{
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector('.machine-card');
    const st = statusClass(inj.Status);
    const label = statusLabel(inj.Status);
    card.querySelector('h3').textContent = txt(inj.Injetora, `INJETORA ${idx+1}`);
    card.querySelector('.ton').textContent = txt(inj.Tonelagem, '');
    const pill = card.querySelector('.status-pill');
    pill.className = 'status-pill ' + st;
    pill.querySelector('b').textContent = label;
    setAux(card, '.aux-indicator.esteira', inj['ESTEIRA'] || inj['Esteira'] || inj['esteira']);
    setAux(card, '.aux-indicator.robo', inj['ROBO'] || inj['Robo'] || inj['ROBÔ'] || inj['Robô'] || inj['robo']);
    card.querySelector('.produto').textContent = txt(inj['Produzindo agora']);
    const ciclo = n(inj['Ciclo (s)']);
    card.querySelector('.ciclo').textContent = ciclo ? `${ciclo} s` : '--';
    card.querySelector('.obs').textContent = txt(inj['Observação/Alerta'],'');
    const qtdHoje = n(inj['Qtd. Produzida Hoje']);
    const qtdPrev = n(inj['Qtd. Prevista']);
    const pct = qtdPrev ? Math.min(100, Math.round((qtdHoje/qtdPrev)*100)) : 0;
    card.querySelector('.progress-line i').style.width = pct + '%';
    card.querySelector('.percent').textContent = pct + '%';
    card.querySelector('.next-icon').textContent = productIcons[idx % productIcons.length];
    card.querySelector('.next strong').textContent = txt(inj['Próximo na fila']);
    card.querySelector('.qty strong').textContent = `${fmt(qtdPrev)} un`;
    grid.appendChild(node);
  });
}

carregarDados();
setInterval(carregarDados, UPDATE_MS);
