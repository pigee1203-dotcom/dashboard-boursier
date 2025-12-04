/* script.js - Dashboard Boursier Complet */
// Création de l’alerte sonore
const alertSound = new Audio('alert.mp3');

// --- CONFIG ---
const PROXY = 'https://api.allorigins.win/raw?url='; // proxy pour contourner CORS
const API_QUOTE = (s) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`;
const API_CHART = (s, range='1mo', interval='1d') => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}`;
const AUTO_REFRESH_MS = 30000; // 30s

// --- STATE (localStorage) ---
let state = {
  watchlist: JSON.parse(localStorage.getItem('watchlist_v2')) || ['AAPL','TSLA','NVDA'],
  alerts: JSON.parse(localStorage.getItem('alerts_v2')) || []
};
function saveState(){ localStorage.setItem('watchlist_v2', JSON.stringify(state.watchlist)); localStorage.setItem('alerts_v2', JSON.stringify(state.alerts)); }

// --- UI helpers ---
function showNotification(msg, ms=4000){
  const n = document.getElementById('notify');
  n.textContent = msg; n.style.display = 'block';
  setTimeout(()=>{ n.style.display='none'; }, ms);
}

// --- FETCH helpers (via proxy to avoid CORS) ---
async function fetchJson(url){
  try{
    const res = await fetch(PROXY + encodeURIComponent(url));
    return await res.json();
  }catch(e){
    console.warn('fetchJson error', e);
    return null;
  }
}

async function fetchQuote(ticker){
  const url = API_QUOTE(ticker);
  const json = await fetchJson(url);
  const r = json?.quoteResponse?.result?.[0];
  if(!r) return null;
  return {
    symbol: r.symbol,
    price: r.regularMarketPrice,
    change: r.regularMarketChange,
    changePct: r.regularMarketChangePercent
  };
}

async function fetchChart(ticker, range='1mo', interval='1d'){
  const url = API_CHART(ticker, range, interval);
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if(!result) return {labels:[], closes:[]};
  const timestamps = result.timestamp || [];
  const indicators = result.indicators?.quote?.[0];
  const closes = indicators?.close || [];
  const labels = timestamps.map(ts => new Date(ts*1000).toLocaleDateString());
  return {labels, closes};
}

// --- Moving averages ---
function movingAverage(data, period){
  const out = [];
  for(let i=0;i<data.length;i++){
    if(i < period-1){ out.push(null); continue; }
    let sum=0; let count=0;
    for(let j=0;j<period;j++){ const v = data[i-j]; if(v!=null){ sum+=v; count++; } }
    out.push(count? sum/count : null);
  }
  return out;
}

// --- WATCHLIST UI ---
async function updateWatchlistUI(){
  const cont = document.getElementById('watchlist');
  cont.innerHTML = '';
  const promises = state.watchlist.map(t => fetchQuote(t));
  const results = await Promise.all(promises);
  for(const r of results){
    if(!r) continue;
    const div = document.createElement('div'); div.className='ticker';
    const left = document.createElement('div'); left.className='left';
    left.innerHTML = `<div class="sym">${r.symbol}</div><div class="meta">${r.price!=null ? r.price.toLocaleString() : '—'}</div>`;
    const right = document.createElement('div');
    const pct = r.changePct!=null ? r.changePct.toFixed(2)+'%' : '—';
    right.innerHTML = `<div style="text-align:right">${pct}</div>
      <div style="margin-top:6px">
        <button class="btn small" onclick="viewChart('${r.symbol}')">Voir</button>
        <button class="btn ghost small" onclick="removeTicker('${r.symbol}')">Suppr</button>
      </div>`;
    div.appendChild(left); div.appendChild(right);
    cont.appendChild(div);
  }
  document.getElementById('chartTicker')?.remove?.(); // cleanup if present
  saveState();
  checkAlerts(results);
}

// helper to add/remove
function addTicker(){
  const input = document.getElementById('new-ticker');
  const t = (input.value || '').trim().toUpperCase(); if(!t) return showNotification('Ticker vide');
  if(!state.watchlist.includes(t)) state.watchlist.push(t);
  input.value=''; saveState(); updateWatchlistUI();
}
function removeTicker(t){ state.watchlist = state.watchlist.filter(x=> x!==t); saveState(); updateWatchlistUI(); }

// --- CHARTS ---
let chartInstance = null;
async function viewChart(ticker){
  const range = '1mo'; // par défaut
  const {labels, closes} = await fetchChart(ticker, range, '1d');
  renderChart(labels, closes, ticker);
}

function renderChart(labels, data, ticker){
  const ctx = document.getElementById('chart').getContext('2d');
  const ma20 = movingAverage(data, 20);
  const ma50 = movingAverage(data, 50);
  // format last values for MA display
  const lastMA20 = ma20.filter(x=>x!=null).slice(-1)[0] || '—';
  const lastMA50 = ma50.filter(x=>x!=null).slice(-1)[0] || '—';
  // show in footer or notification
  showNotification(`${ticker} • MA20: ${typeof lastMA20==='number'? lastMA20.toFixed(2): '—'} • MA50: ${typeof lastMA50==='number'? lastMA50.toFixed(2): '—'}`, 3500);

  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {label: `${ticker} (prix)`, data: data, tension:0.25, pointRadius:0},
        {label: 'MA20', data: ma20, borderDash:[5,5], tension:0.1, pointRadius:0},
        {label: 'MA50', data: ma50, borderDash:[2,6], tension:0.1, pointRadius:0}
      ]
    },
    options: {
      plugins:{legend:{position:'bottom'}},
      scales:{x:{display:true}, y:{display:true}}
    }
  });
}

// --- ALERTS ---
function renderAlerts(){
  const el = document.getElementById('alerts');
  el.innerHTML = '';
  state.alerts.forEach((a, idx) => {
    const div = document.createElement('div'); div.className='alert-item';
    div.innerHTML = `<div>${a.ticker} ${a.direction==='above' ? '>' : '<'} ${a.price}</div>
      <div><button class="btn small" onclick="removeAlert(${idx})">Suppr</button></div>`;
    el.appendChild(div);
  });
}
function addAlert(){
  const t = (document.getElementById('alert-ticker').value||'').trim().toUpperCase();
  const p = parseFloat(document.getElementById('alert-price').value);
  if(!t || !p) return showNotification('Ticker ou prix manquant');
  state.alerts.push({ticker:t, price:p, direction:'above'}); // default above; can be improved
  saveState(); renderAlerts();
  document.getElementById('alert-ticker').value=''; document.getElementById('alert-price').value='';
}
function removeAlert(i){ state.alerts.splice(i,1); saveState(); renderAlerts(); }

function checkAlerts(quotes){
  state.alerts.forEach(a => {
    const q = quotes.find(x => x && x.symbol === a.ticker);
    if(!q || q.price==null) return;
    if(a.direction==='above' && q.price >= a.price) showNotification(`ALERTE: ${a.ticker} au dessus de ${a.price} (actuel ${q.price})`);
    if(a.direction==='below' && q.price <= a.price) showNotification(`ALERTE: ${a.ticker} en dessous de ${a.price} (actuel ${q.price})`);
  });
}

// --- NEWS (simple) ---
async function loadNews(){
  const el = document.getElementById('news');
  el.innerHTML = '<div class="news-item">Chargement des news...</div>';
  const tick = state.watchlist[0] || 'AAPL';
  // Yahoo news endpoint (via proxy) - structure varie; fallback simple
  try{
    const url = `https://query1.finance.yahoo.com/v2/finance/news?symbols=${encodeURIComponent(tick)}`;
    const json = await fetchJson(url);
    const items = json?.data || json?.News || [];
    const list = items.slice(0,6).map(it => {
      const title = it.title || it.headline || it.summary || 'Article';
      const link = it.link || it.url || '#';
      return {title, link};
    });
    if(list.length===0) { el.innerHTML = '<div class="news-item">Aucune news (CORS ou format inattendu)</div>'; return; }
    el.innerHTML = list.map(i=> `<div class="news-item"><a href="${i.link}" target="_blank">${i.title}</a></div>`).join('');
  }catch(e){
    el.innerHTML = '<div class="news-item">Erreur chargement news</div>';
  }
}

// --- INIT ---
async function init(){
  // bind global UI (some elements might not exist if layout changed)
  window.addTicker = addTicker;
  window.addAlert = addAlert;
  window.removeAlert = removeAlert;
  window.viewChart = viewChart;
  // set watchers
  await updateWatchlistUI();
  renderAlerts();
  await loadNews();
  // auto refresh
  setInterval(async ()=>{
    await updateWatchlistUI();
    await loadNews();
  }, AUTO_REFRESH_MS);
}

init();
// --- ALERTES ---
let alerts = JSON.parse(localStorage.getItem('alerts')) || [];

function saveAlerts() {
    localStorage.setItem('alerts', JSON.stringify(alerts));
}

function renderAlerts() {
    const el = document.getElementById('alerts');
    el.innerHTML = '';
    alerts.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = 'alert-item';
        div.innerHTML = `${a.ticker} ${a.direction==='above' ? '>' : '<'} ${a.price} 
            <button onclick="removeAlert(${i})">Suppr</button>`;
        el.appendChild(div);
    });
}

function addAlert() {
    const ticker = document.getElementById('alert-ticker').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('alert-price').value);
    const direction = document.getElementById('alert-direction').value;

    if (!ticker || !price) { alert('Ticker ou prix manquant'); return; }

    alerts.push({ticker, price, direction});
    saveAlerts();
    renderAlerts();

    document.getElementById('alert-ticker').value = '';
    document.getElementById('alert-price').value = '';
}

function removeAlert(i) {
    alerts.splice(i,1);
    saveAlerts();
    renderAlerts();
}

// Vérification automatique
async function checkAlerts() {
    for (let a of alerts) {
        const data = await fetch(`https://api.allorigins.win/raw?url=https://query1.finance.yahoo.com/v8/finance/chart/${a.ticker}`)
            .then(r => r.json());
        const price = data.chart.result[0].meta.regularMarketPrice;
        if ((a.direction==='above' && price >= a.price) || (a.direction==='below' && price <= a.price)) {
            alert(`ALERTE: ${a.ticker} est ${a.direction==='above'?'au-dessus':'en-dessous'} de ${a.price} (actuel: ${price})`);
        }
    }
}

// Auto check toutes les 30 secondes
setInterval(checkAlerts, 30000);

// Initialisation
renderAlerts();

