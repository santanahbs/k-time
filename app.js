
const API_URL = "https://script.google.com/macros/s/AKfycbzPGm6SJyo3Ne8SMJA0zmgkVqZxjgo9exYERM4fdlVKLEN9xGnn7euK5VkCK6lZDCYt0A/exec";
const REFRESH_MS = 5 * 60 * 1000;

let previousState = {};

const $ = (id) => document.getElementById(id);

function norm(v){ return String(v ?? "").trim().toUpperCase(); }

function fmtNumber(n){
  const num = Number(n || 0);
  return num.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtDecimal(n){
  const num = Number(n || 0);
  return num.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function statusClass(status){
  const s = norm(status);

  // Importante: checar DESLIGADA/PARADO/OFF antes de LIGADA,
  // porque "DESLIGADA" contém a palavra "LIGADA".
  if(!s || s.includes("DESL") || s.includes("PARAD") || s.includes("OFF")) return "off";
  if(s.includes("MANUT")) return "maintenance";
  if(s.includes("SETUP")) return "setup";
  if(s === "LIGADA" || s === "LIGADO" || s === "ON" || s.includes("PRODUZ")) return "on";

  return "off";
}

function statusLabel(status){
  const s = norm(status);

  // Importante: checar DESLIGADA/PARADO/OFF antes de LIGADA.
  if(!s || s.includes("DESL") || s.includes("PARAD") || s.includes("OFF")) return "DESLIGADA";
  if(s.includes("MANUT")) return "MANUTENÇÃO";
  if(s.includes("SETUP")) return "SETUP";
  if(s === "LIGADA" || s === "LIGADO" || s === "ON" || s.includes("PRODUZ")) return "LIGADA";

  return "DESLIGADA";
}

function onOffClass(v){
  return norm(v) === "ON" ? "on" : "off";
}

function updateClock(){
  const d = new Date();
  $("dateNow").textContent = d.toLocaleDateString("pt-BR");
  $("timeNow").textContent = d.toLocaleTimeString("pt-BR");
}
setInterval(updateClock, 1000);
updateClock();

async function loadData(){
  try {
    setApiStatus("loading");
    const url = API_URL + "?t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    if(data.erro) throw new Error(data.mensagem || "Erro na API");

    renderDashboard(data.dashboard || {});
    renderPack(data.empacotadeira || {});
    renderMachines(data.injetoras || []);
    renderAlerts(data.alertas || []);

    $("footerStatus").textContent = "Última atualização: " + new Date().toLocaleTimeString("pt-BR");
    setApiStatus("online");
  } catch (err) {
    console.error(err);
    setApiStatus("offline");
    $("footerStatus").textContent = "Erro ao atualizar: " + err.message;
  }
}

function setApiStatus(mode){
  const el = $("apiStatus");
  el.className = "api-status " + mode;
  el.innerHTML = `<span></span> ${mode === "online" ? "API ONLINE" : mode === "loading" ? "ATUALIZANDO" : "API OFFLINE"}`;
}

function renderDashboard(d){
  const prod = Number(d.producaoHoje || 0);
  const meta = Number(d.metaHoje || 0);
  const pctMeta = Number(d.percentualMeta || 0);
  const prodPct = Number(d.produtividade || 0);
  const esperado = Number(d.producaoEsperada || 0);
  const delta = Number(d.deltaPecas || 0);

  $("kProducao").textContent = `${fmtNumber(prod)} un`;
  $("kMeta").textContent = `Meta: ${fmtNumber(meta)} un ${pctMeta}%`;
  $("barMeta").style.width = Math.max(0, Math.min(100, pctMeta)) + "%";

  $("kProdutividade").textContent = prodPct + "%";
  $("kProdDetalhe").textContent = `Esperado: ${fmtNumber(esperado)}   Produzido: ${fmtNumber(prod)}`;
  $("kDelta").textContent = `${delta >= 0 ? "+" : ""}${fmtNumber(delta)} peças`;

  const prodCard = $("produtividadeCard");
  prodCard.classList.remove("otimo","bom","atencao","critico");
  prodCard.classList.add(d.statusProdutividade || (prodPct >= 100 ? "otimo" : prodPct >= 95 ? "bom" : prodPct >= 80 ? "atencao" : "critico"));

  $("kPrevisao").textContent = `${fmtNumber(d.previsaoFechamento || 0)} un`;
  $("kRitmo").textContent = `${fmtNumber(d.ritmoHora || 0)} un/h`;
  $("kCiclo").textContent = `${fmtDecimal(d.tempoMedioCiclo || 0)} s`;
  const horaParadaFormatada = formatHoraPlanilha(d.proximaParada);
  $("kParada").textContent = horaParadaFormatada;
  $("kMotivo").textContent = d.motivoParada || "-";
  $("kCountdown").textContent = countdownTo(horaParadaFormatada);

  $("kLigadas").textContent = d.ligadas || 0;
  $("kParadas").textContent = d.paradas || 0;
  $("kEsteiras").textContent = d.esteirasOn || 0;
  $("kRobos").textContent = d.robosOn || 0;
}


function formatHoraPlanilha(value){
  if(value === null || value === undefined || value === "") return "--:--";

  const raw = String(value).trim();

  // Google Sheets pode enviar horário como data base:
  // 1899-12-30T15:06:28.000Z
  // Neste caso, usamos diretamente HH:mm do texto ISO para não deslocar fuso.
  const isoTime = raw.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if(isoTime){
    return `${isoTime[1]}:${isoTime[2]}`;
  }

  // Já vem HH:mm ou HH:mm:ss
  const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if(m){
    return `${String(m[1]).padStart(2,"0")}:${m[2]}`;
  }

  // Pode vir como número decimal do Sheets: 0.5 = 12:00
  const n = Number(raw.replace(",", "."));
  if(!isNaN(n) && n >= 0 && n < 1){
    const totalMin = Math.round(n * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
  }

  return raw;
}


function countdownTo(hhmm){
  if(!hhmm) return "-";
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  if(!m) return "-";

  const now = new Date();
  const target = new Date();
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let diff = target - now;
  if(diff < 0) return "Hoje já passou";

  const h = Math.floor(diff / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  return `Faltam ${String(h).padStart(2,"0")}h${String(min).padStart(2,"0")}`;
}

function renderPack(emp){
  const status = statusLabel(emp.Status_Display || emp.Status);
  $("packStatus").textContent = status;

  const box = $("packBox");
  box.classList.remove("on","off");
  box.classList.add(status === "LIGADA" ? "on" : "off");
}

function renderMachines(list){
  const root = $("machines");
  root.innerHTML = "";

  list.forEach((m, idx) => {
    const nome = m.Injetora || m.Máquina || `INJETORA ${idx+1}`;
    const ton = m.Tonelagem || "";
    const status = statusLabel(m.Status_Display || m.Status);
    const cls = statusClass(status);
    const key = nome;
    const changed = previousState[key] && previousState[key] !== status;

    previousState[key] = status;

    const esteira = m.Esteira_Status || m.ESTEIRA || "OFF";
    const robo = m.Robo_Status || m.ROBO || m["ROBÔ"] || "OFF";
    const emProd = m["Em Produção"] || "-";
    const produto = m["Produzindo agora"] || "-";
    const ciclo = m["Ciclo (s)"] || m.Ciclo || "-";
    const prox = m["Próximo na fila"] || "-";
    const qtd = m["Qtd. Prevista"] || 0;
    const obs = m["Observação/Alerta"] || "";
    const pct = calcCardPercent(emProd, qtd);

    const card = document.createElement("article");
    card.className = `machine ${cls} ${changed ? "changed" : ""}`;

    card.innerHTML = `
      <header>
        <div>
          <h3>${nome}</h3>
          <span>${ton}</span>
        </div>
        <b class="badge ${cls}">● ${status}</b>
      </header>

      <div class="automation">
        <div class="auto ${onOffClass(esteira)}">▰ ESTEIRA <strong>${norm(esteira)==="ON" ? "ON" : "OFF"}</strong></div>
        <div class="auto ${onOffClass(robo)}">⚙ ROBÔ <strong>${norm(robo)==="ON" ? "ON" : "OFF"}</strong></div>
      </div>

      <img class="machine-img" src="injetora.png" alt="Injetora Chen Hsong">

      <div class="info-row">
        <div>
          <small>STATUS</small>
          <strong>${produto}</strong>
          <em>${obs}</em>
        </div>
        <div>
          <small>EM PRODUÇÃO</small>
          <strong>${fmtNumber(emProd)} un</strong>
        </div>
        <div>
          <small>CICLO:</small>
          <strong>${ciclo} s</strong>
        </div>
      </div>

      <div class="progress">
        <i style="width:${pct}%"></i>
        <strong>${pct}%</strong>
      </div>

      <footer>
        <div class="next">🥤 <span><small>PRÓXIMO NA FILA</small><strong>${prox}</strong></span></div>
        <div class="qtd"><small>Qtd. Prevista</small><strong>${fmtNumber(qtd)} un</strong></div>
      </footer>
    `;

    root.appendChild(card);
  });
}

function calcCardPercent(done, target){
  const d = Number(String(done || 0).replace(/\./g,"").replace(",", "."));
  const t = Number(String(target || 0).replace(/\./g,"").replace(",", "."));
  if(!t) return d > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((d / t) * 100)));
}

function renderAlerts(alerts){
  $("alertCount").textContent = alerts.length || 0;
  const box = $("alertsList");
  if(!alerts.length){
    box.innerHTML = `<p class="empty">Nenhum alerta ativo.</p>`;
    return;
  }

  box.innerHTML = alerts.slice(0,8).map(a => `
    <div class="alert ${a.nivel || "atencao"}">
      <strong>${a.titulo}</strong>
      <span>${a.mensagem || ""}</span>
    </div>
  `).join("");
}

loadData();
setInterval(loadData, REFRESH_MS);
