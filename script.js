// =========================
// script.js — TraderGlass
// =========================

// ---- CONFIG ----
const PROXY = 'https://api.allorigins.win/raw?url=';
const API_QUOTE = s => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`;
const API_CHART = (s, range='1mo') => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d`;
const NEWS_SOURCES = [
  'https://finance.yahoo.com/news/rssindex',
  'https://www.reuters.com/business/finance/rss',
  'https://www.investing.com/rss/news.rss'
];

// ---- STATE ----
let state = {
  watchlist: JSON.parse(localStorage.getItem('tg_watchlist')) || ['AAPL','TSLA','NVDA','MSFT'],
  alerts: JSON.parse(localStorage.getItem('tg_alerts')) || [],
  chartType: 'line', // 'line' ou 'candlestick'
  current: null,
  currency: localStorage.getItem('tg_currency') || 'CAD',
  liveInterval: null
};

// ---- UTIL ----
const $ = id => document.getElementById(id);
function el(tag, attrs={}, text=''){ const d = document.createElement(tag); for(const k in attrs) d.setAttribute(k, attrs[k]); if(text) d.textContent = text; return d; }
function fmt(n){ if(n==null||isNaN(n)) return '--'; return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(n){ if(n==null||isNaN(n)) return '--'; if(n>=1e12) return (n/1e12).toFixed(2)+'T'; if(n>=1e9) return (n/1e9).toFixed(2)+'B'; if(n>=1e6) return (n/1e6).toFixed(2)+'M'; if(n>=1e3) return (n/1e3).toFixed(2)+'k'; return n.toFixed(2); }
function saveState(){ localStorage.setItem('tg_watchlist', JSON.stringify(state.watchlist)); localStorage.setItem('tg_alerts', JSON.stringify(state.alerts)); localStorage.setItem('tg_currency', state.currency); }

// ---- INITIAL RENDER ----
renderWatchlist();
renderNewsPlaceholder();
renderCurrencySelect();
initChart(); // prepare chart instance variable

// ---- WATCHLIST UI ----
async function renderWatchlist(){
  const container = $('watchlist'); container.innerHTML = '';
  for(const s of state.watchlist){
    const node = el('div'); node.className = 'watch-item';
    const left = el('div', {}, s);
    const right = el('div');
    const btnView = el('button', {}, 'Voir');
    btnView.onclick = ()=> loadChartFor(s);
    const btnAlert = el('button', {}, 'Alerte');
    btnAlert.onclick = ()=> { $('alertTicker').value = s; showPopup('Ticker préparé pour alerte'); };
    right.appendChild(btnView);
    right.appendChild(btnAlert);

    // info placeholders
    const info = el('div', {style:'font-size:12px;color:var(--muted);margin-top:6px'}, 'Chargement...');
    node.appendChild(left); node.appendChild(right); node.appendChild(info);
    container.appendChild(node);

    // fetch quote to fill info
    try{
      const res = await fetch(PROXY + encodeURIComponent(API_QUOTE(s)));
      const j = await res.json();
      const q = j.quoteResponse?.result?.[0];
      if(q){
        left.textContent = `${s} • ${formatCurrency(q.regularMarketPrice)}`;
        info.textContent = `H:${fmtShort(q.regularMarketDayHigh)} L:${fmtShort(q.regularMarketDayLow)} • V:${fmtShort(q.regularMarketVolume)}`;
      } else {
        info.textContent = 'Données indisponibles';
      }
    }catch(e){
      info.textContent = 'Erreur réseau';
    }
  }
}

// ---- ADD TICKER ----
$('add-ticker-btn')?.addEventListener('click', () => {
  const v = $('new-ticker').value.trim().toUpperCase();
  if(!v) return showPopup('Écris un ticker');
  if(!state.watchlist.includes(v)) state.watchlist.push(v);
  $('new-ticker').value = '';
  saveState(); renderWatchlist(); showPopup(v + ' ajouté');
});

// ---- CHART (Chart.js) ----
let mainChart = null;
function initChart(){
  const ctx = $('chart').getContext('2d');
  mainChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: '', data: [], borderColor: '#16ff91', backgroundColor:'rgba(22,255,145,0.08)', tension:0.2 }]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:true}, y:{display:true}} }
  });
}

async function loadChartFor(symbol){
  state.current = symbol;
  $('current-title').textContent = symbol + ' • Chargement...';
  try{
    const range = $('rangeSelect')?.value || '1mo';
    const res = await fetch(PROXY + encodeURIComponent(API_CHART(symbol, range)));
    const j = await res.json();
    const r = j.chart && j.chart.result && j.chart.result[0];
    if(!r){ showPopup('Données graphiques non disponibles'); return; }

    const ts = r.timestamp || [];
    const labels = ts.map(t => new Date(t*1000).toLocaleDateString());
    const opens = r.indicators.quote[0].open;
    const highs = r.indicators.quote[0].high;
    const lows = r.indicators.quote[0].low;
    const closes = r.indicators.quote[0].close;

    // update chart
    if(state.chartType === 'line'){
      mainChart.destroy();
      mainChart = new Chart($('chart').getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: symbol, data: closes, borderColor:'#16ff91', backgroundColor:'rgba(22,255,145,0.08)', tension:0.2, pointRadius:0 }]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
      });
    } else {
      // candlestick dataset
      const ohlc = opens.map((o,i)=>({x: labels[i], o: opens[i], h: highs[i], l: lows[i], c: closes[i]}));
      mainChart.destroy();
      mainChart = new Chart($('chart').getContext('2d'), {
        type: 'candlestick',
        data: { datasets: [{ label: symbol, data: ohlc }]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
      });
    }

    // indicators
    const ma20 = movingAverage(closes,20);
    const ma50 = movingAverage(closes,50);
    const rsi = computeRSI(closes,14).slice(-1)[0] || null;
    // update info boxes
    $('price').textContent = formatCurrency(closes.slice(-1)[0] || null);
    $('rsi').textContent = rsi? Math.round(rsi) : '--';
    const trend = computeTrend(ma20, ma50);
    $('trend').textContent = trend;
    $('risk').textContent = computeRisk(rsi);

    $('current-title').textContent = symbol;

    // news + advice
    loadNewsForTicker(symbol);
    const advice = analyzeForAdvice({symbol, closes, ma20, ma50, rsi});
    $('ai-tips').textContent = advice.text;

  }catch(e){
    console.warn(e);
    showPopup('Erreur chargement graphique');
  }
}

// toggle chart type
$('toggle-chart').addEventListener('click', ()=> {
  state.chartType = state.chartType === 'line' ? 'candlestick' : 'line';
  if(state.current) loadChartFor(state.current);
});

// ---- INDICATORS ----
function movingAverage(data, period){
  const out=[];
  for(let i=0;i<data.length;i++){
    if(i < period-1){ out.push(null); continue; }
    let sum=0,count=0;
    for(let j=0;j<period;j++){ const v=data[i-j]; if(v!=null){ sum+=v; count++; } }
    out.push(count? sum/count : null);
  }
  return out;
}
function computeRSI(closes, period=14){
  if(!closes || closes.length < period+1) return Array(closes.length).fill(null);
  const deltas=[]; for(let i=1;i<closes.length;i++) deltas.push(closes[i]-closes[i-1]);
  let seed = deltas.slice(0,period); let up=0,down=0; seed.forEach(s=> s>0? up+=s : down+=Math.abs(s)); up/=period; down/=period;
  const rsis=[]; let prevUp=up, prevDown=down;
  for(let i=period;i<deltas.length;i++){ const delta=deltas[i]; const u = delta>0?delta:0; const d = delta<0?Math.abs(delta):0;
    prevUp = (prevUp*(period-1)+u)/period; prevDown = (prevDown*(period-1)+d)/period;
    const rs = prevDown===0?100:prevUp/prevDown; const rsi = 100 - (100/(1+rs)); rsis.push(rsi);
  }
  return Array(period).fill(null).concat(rsis);
}
function computeTrend(ma20, ma50){
  const a = ma20.slice(-1)[0], b = ma50.slice(-1)[0];
  if(a==null || b==null) return 'Neutre';
  if(a > b) return 'Haussier';
  if(a < b) return 'Baissier';
  return 'Neutre';
}
function computeRisk(rsi){
  if(rsi==null) return '—';
  if(rsi>80) return '⚠ Élevé';
  if(rsi>70) return '⚠ Moyen';
  if(rsi<30) return 'Faible';
  return 'Normal';
}
function analyzeForAdvice({symbol, closes, ma20, ma50, rsi}){
  let type='neutral', text='Aucune recommandation claire — vérifie indicateurs & news.';
  if(rsi && rsi < 30){ type='buy'; text = `RSI ${Math.round(rsi)} — marché survendu. Opportunité possible (start small).`; }
  else if(rsi && rsi > 80){ type='sell'; text = `RSI ${Math.round(rsi)} — suracheté. Envisage sécuriser gains.`; }
  const lastIdx = closes.length-1;
  const prevMA20 = ma20[lastIdx-1], prevMA50 = ma50[lastIdx-1], lastMA20 = ma20[lastIdx], lastMA50 = ma50[lastIdx];
  if(prevMA20!=null && prevMA50!=null && lastMA20!=null && lastMA50!=null){
    if(prevMA20 < prevMA50 && lastMA20 > lastMA50) { type='buy'; text = 'Croisement MA20/50 haussier — signal acheteur (débutant: petite taille)'; }
    if(prevMA20 > prevMA50 && lastMA20 < lastMA50) { type='sell'; text = 'Croisement MA20/50 baissier — prudence (sécurise gains)'; }
  }
  return {type,text};
}

// ---- NEWS ----
async function loadNewsForTicker(ticker){
  const out = $('news'); out.innerHTML = 'Chargement news...';
  const items = [];
  for(const url of NEWS_SOURCES){
    try{
      const r = await fetch(PROXY + encodeURIComponent(url));
      const txt = await r.text();
      const parser = new DOMParser(); const xml = parser.parseFromString(txt, "text/xml");
      const rssItems = Array.from(xml.querySelectorAll('item')).slice(0,8);
      rssItems.forEach(it=>{
        const title = it.querySelector('title')?.textContent || '';
        const link = it.querySelector('link')?.textContent || '#';
        if(title.toLowerCase().includes(ticker.toLowerCase()) || title.toLowerCase().includes(tickerNameToCompany(ticker).toLowerCase())){
          items.push({title, link});
        }
      });
    }catch(e){}
  }
  if(items.length===0){ out.innerHTML = '<div style="color:var(--muted)">Aucune news trouvée (proxy limité)</div>'; return; }
  out.innerHTML = items.slice(0,8).map(it=>`<div class="news-item"><a href="${it.link}" target="_blank" style="color:var(--accent)">${it.title}</a></div>`).join('');
}
function tickerNameToCompany(t){
  const map = {AAPL:'Apple',TSLA:'Tesla',NVDA:'Nvidia',MSFT:'Microsoft',AMZN:'Amazon',GOOGL:'Google',META:'Meta'};
  return map[t]||t;
}
function renderNewsPlaceholder(){ $('news').innerHTML = '<div style="color:var(--muted)">Sélectionne une action pour charger les news.</div>'; }

// ---- SCANNER / HEATMAP (simple) ----
async function updateScannerAndHeatmap(){
  // not heavy: just call for each watchlist and render simplified tiles
  const heat = $('heatmap');
  if(!heat) return;
  heat.innerHTML = '';
  for(const s of state.watchlist){
    try{
      const r = await fetch(PROXY + encodeURIComponent(API_QUOTE(s)));
      const j = await r.json(); const q = j.quoteResponse?.result?.[0];
      if(!q) continue;
      const pct = q.regularMarketChangePercent || 0;
      const tile = el('div'); tile.className = 'heat-tile';
      tile.style.background = pct>=0 ? 'linear-gradient(180deg,#e6fff4,#bff1de)' : 'linear-gradient(180deg,#ffecec,#ffbdbd)';
      tile.innerHTML = `<div style="font-weight:800">${s}</div><div style="font-size:12px">${pct!=null?pct.toFixed(2)+'%':'--'}</div>`;
      heat.appendChild(tile);
    }catch(e){}
  }
}

// ---- ALERTS ----
function createAlert(){
  const t = $('alertTicker')?.value?.trim().toUpperCase();
  const p = parseFloat($('alertPrice')?.value);
  const d = $('alertDir')?.value || 'above';
  if(!t || !p) return showPopup('Remplis ticker + prix');
  state.alerts.push({ticker:t, price:p, direction:d, triggered:false});
  saveState(); renderAlertsUI(); showPopup('Alerte créée: '+t);
}
function renderAlertsUI(){
  const el = $('alertsList');
  if(!el) return;
  el.innerHTML = '';
  state.alerts.forEach((a,i)=>{
    const row = el('div'); row.className='watch-item';
    row.innerHTML = `<div><strong>${a.ticker}</strong> • ${a.direction==='above' ? '>' : '<'} ${formatCurrency(a.price)}</div>`;
    const btn = el('button', {}, 'Suppr'); btn.onclick = ()=>{ state.alerts.splice(i,1); saveState(); renderAlertsUI(); };
    row.appendChild(btn); el.appendChild(row);
  });
}

// ---- CURRENCY ----
function renderCurrencySelect(){
  const sel = $('currency-selector');
  if(!sel) return;
  sel.value = state.currency;
  sel.onchange = ()=>{ state.currency = sel.value; saveState(); renderWatchlist(); if(state.current) loadChartFor(state.current); };
}

// ---- HELPERS / UI ----
function showPopup(msg){
  const c = $('popupContainer') || document.body;
  const p = el('div'); p.className = 'popup'; p.textContent = msg;
  // style inline quick if CSS not present
  p.style.position='fixed'; p.style.left='20px'; p.style.top='20px'; p.style.padding='10px 12px'; p.style.background='#16ff91'; p.style.color='#002'; p.style.borderRadius='8px'; p.style.zIndex=9999;
  document.body.appendChild(p);
  setTimeout(()=> p.remove(), 3500);
}

function formatCurrency(n){
  if(n==null || isNaN(n)) return '--';
  const cur = state.currency || 'CAD';
  const symbol = (cur==='EUR') ? '€' : '$';
  return `${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} ${symbol}`;
}

// ---- SIMPLE STORAGE / INIT ----
function initialSetup(){
  // wire buttons that exist in HTML
  document.querySelectorAll('[id="add-ticker-btn"]').forEach(b=>b.onclick = ()=>{ /* handled earlier */ });
  $('toggle-chart')?.addEventListener('click', ()=> { state.chartType = state.chartType==='line' ? 'candlestick' : 'line'; if(state.current) loadChartFor(state.current); });
  $('rangeSelect')?.addEventListener('change', ()=> { if(state.current) loadChartFor(state.current); });
  // attach add ticker if input exists
  $('add-ticker-btn')?.addEventListener('click', ()=> {
    const v = $('new-ticker').value.trim().toUpperCase();
    if(!v) return showPopup('Écris un ticker');
    if(!state.watchlist.includes(v)) state.watchlist.push(v);
    $('new-ticker').value=''; saveState(); renderWatchlist(); updateScannerAndHeatmap();
  });
  // attach create alert button if present
  document.querySelectorAll('[onclick="createAlert()"]').forEach(b => b.onclick = createAlert);
  // create alert form fallback
  const alertCreateBtn = document.querySelector('button[onclick="createAlert()"]');
  if(alertCreateBtn) alertCreateBtn.onclick = createAlert;

  // render alerts if placeholder exists
  renderAlertsUI();
  updateScannerAndHeatmap();
}
initialSetup();

// ---- REFRESH / LIVE ----
async function refreshAll(){
  await renderWatchlist();
  updateScannerAndHeatmap();
  if(state.current) loadChartFor(state.current);
}
window.refreshAll = refreshAll;

function toggleLive(){
  if(state.liveInterval){ clearInterval(state.liveInterval); state.liveInterval = null; showPopup('Live stopped'); return; }
  state.liveInterval = setInterval(refreshAll, 5000);
  showPopup('Live started (5s)');
}
window.toggleRealtime = toggleLive;

// expose some functions globally (for HTML buttons)
window.loadChartFor = loadChartFor;
window.createAlert = createAlert;
window.addTickerFromInput = ()=>{ const v = $('new-ticker').value.trim().toUpperCase(); if(!v) return; if(!state.watchlist.includes(v)) state.watchlist.push(v); $('new-ticker').value=''; saveState(); renderWatchlist(); updateScannerAndHeatmap(); };
window.downloadCSV = async function(){
  const rows = [['Ticker','Price','Change%']];
  for(const t of state.watchlist){
    try{ const r = await fetch(PROXY + encodeURIComponent(API_QUOTE(t))); const j = await r.json(); const q = j.quoteResponse.result[0]; rows.push([t, q.regularMarketPrice||'', q.regularMarketChangePercent||'']); }catch(e){ rows.push([t,'','']); }
  }
  const csv = rows.map(r => r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'watchlist.csv'; a.click(); URL.revokeObjectURL(url);
};

// ---- UTILITY: company map (for news) ----
function tickerNameToCompany(t){
  const map = {AAPL:'Apple',TSLA:'Tesla',NVDA:'Nvidia',MSFT:'Microsoft',AMZN:'Amazon',GOOGL:'Google',META:'Meta'};
  return map[t] || t;
}
/* ------------------------------
   O P P O R T U N I T E S  — Popup & détection
   Colle ce block à la fin de script.js (ou juste après updateAnalysisFor)
   ------------------------------ */

// Map pour éviter popups répétés (symbol -> timestamp)
window._lastOpportunityAt = window._lastOpportunityAt || {};

// Règles et seuils (tu peux ajuster)
const OPPORTUNITY_RULES = {
  rsiBuyThreshold: 30,        // RSI < 30 => survendu (opportunité d'achat)
  rsiStrongBuy: 20,           // RSI < 20 => opportunité forte
  maCrossoverBoost: 14,       // croisement MA20 au-dessus MA50 => boost score
  volumeSpikeMultiplier: 1.12,// prix > avg10 * 1.12 -> volume/price spike proxy
  minScoreForPopup: 60,       // score min pour popup
  cooldownMs: 1000 * 60 * 30  // 30 minutes cooldown par symbole
};

// Détecte opportunités pour un symbole en utilisant données déjà chargées
// paramètres: symbol (string), closes (array of numbers), ma20, ma50, rsi (number), lastPrice (number)
function detectOpportunitiesFor(symbol, {closes, ma20, ma50, rsi, lastPrice, avgVolume}) {
  // score début 50 neutre, on ajoute/soustrait
  let score = 50;
  const details = [];

  // RSI
  if (rsi != null) {
    if (rsi < OPPORTUNITY_RULES.rsiStrongBuy) {
      score += 22;
      details.push(`RSI très bas (${Math.round(rsi)}): fort signal d'achat`);
    } else if (rsi < OPPORTUNITY_RULES.rsiBuyThreshold) {
      score += 12;
      details.push(`RSI bas (${Math.round(rsi)}): signal d'achat`);
    } else if (rsi > 80) {
      score -= 18;
      details.push(`RSI élevé (${Math.round(rsi)}): prudence`);
    }
  }

  // MA crossover (validé si récent crossover haussier)
  const last = closes.length - 1;
  const prevMA20 = ma20[last - 1], prevMA50 = ma50[last - 1];
  const lastMA20 = ma20[last], lastMA50 = ma50[last];
  if (prevMA20 != null && prevMA50 != null && lastMA20 != null && lastMA50 != null) {
    if (prevMA20 < prevMA50 && lastMA20 > lastMA50) {
      score += OPPORTUNITY_RULES.maCrossoverBoost;
      details.push('Croisement MA20↑/MA50 (signal haussier)');
    } else if (prevMA20 > prevMA50 && lastMA20 < lastMA50) {
      score -= 10;
      details.push('Croisement MA20↓/MA50 (signal baissier)');
    }
  }

  // Volume/Price spike (naïf) — on compare lastPrice au moyenne des derniers x closes
  const avgRecent = closes.slice(-11, -1).filter(v=>v!=null).reduce((s,n)=>s+n,0) / Math.max(1, closes.slice(-11,-1).filter(v=>v!=null).length);
  if (avgRecent && lastPrice) {
    if (lastPrice > avgRecent * OPPORTUNITY_RULES.volumeSpikeMultiplier) {
      score += 8;
      details.push('Breakout (prix > moyenne récente) — momentum');
    }
  }

  // News sentiment global (variable globale définie par loadNewsForTicker)
  const newsSent = window._lastNewsSentiment || 0;
  if (newsSent > 0.3) { score += 8; details.push('News positives récentes'); }
  else if (newsSent < -0.3) { score -= 10; details.push('News négatives récentes'); }

  // normalize
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Build opportunity object (if score >= threshold)
  if (score >= OPPORTUNITY_RULES.minScoreForPopup) {
    // Suggestions de trade (entrées/stop/takeprofit basées sur règles simples)
    const entry = lastPrice;
    // stop = recent low - 1% or 2% buffer (safe)
    const recentLow = Math.min(...closes.slice(-5).filter(v=>v!=null));
    const stop = recentLow ? Math.min(recentLow * 0.995, entry * 0.98) : entry * 0.98;
    const tp1 = entry * 1.03; // TP1: +3%
    const tp2 = entry * 1.07; // TP2: +7%
    // position sizing advice (risk 1% of capital) — user must set capital manually in future
    const advice = {
      entry: entry,
      stop: stop,
      tp1, tp2,
      positionSizing: 'Risque conseillé: 1-2% du capital par trade (utilise stop pour calcul)',
      checklist: [
        'Vérifier la news la plus récente',
        'Confirmer le signal MA/RSI',
        'Placer stop-loss avant d\'entrer',
        'Ne risquer que 1-2% du capital sur ce trade'
      ]
    };

    return { symbol, score, details, advice, detectedAt: Date.now() };
  }

  return null; // pas d'opportunité suffisante
}

// Affiche le popup détaillé d'opportunité (rich UI)
function showOpportunityPopup(op) {
  // cooldown check
  const last = window._lastOpportunityAt[op.symbol] || 0;
  if (Date.now() - last < OPPORTUNITY_RULES.cooldownMs) return;
  window._lastOpportunityAt[op.symbol] = Date.now();

  // construit modal
  const modal = document.createElement('div');
  modal.style = `
    position:fixed; right:18px; bottom:18px; width:360px; max-width:90%;
    background: rgba(10,12,10,0.95); color:#eaffea; border:1px solid rgba(50,255,120,0.18);
    border-radius:12px; padding:14px; box-shadow:0 10px 30px rgba(0,0,0,0.6); z-index:99999; font-family:Inter, sans-serif;
  `;

  const title = document.createElement('div');
  title.innerHTML = `<strong style="font-size:16px;color:#baffc9">${op.symbol}</strong> — Opportunité détectée • Score: <span style="color:#16ff91">${op.score}%</span>`;
  modal.appendChild(title);

  const detail = document.createElement('div');
  detail.style = 'margin-top:8px; font-size:13px; color:#cfead1';
  detail.innerHTML = `<div><em>${op.details.slice(0,3).join(' • ')}</em></div>`;
  modal.appendChild(detail);

  const adv = document.createElement('div');
  adv.style = 'margin-top:10px; font-size:13px; color:#e8ffea';
  adv.innerHTML = `
    <div><strong>Entrée suggérée:</strong> ${op.advice.entry ? op.advice.entry.toFixed(2) : '--'}</div>
    <div><strong>Stop Loss:</strong> ${op.advice.stop ? op.advice.stop.toFixed(2) : '--'}</div>
    <div><strong>Take Profit:</strong> TP1 ${op.advice.tp1.toFixed(2)} • TP2 ${op.advice.tp2.toFixed(2)}</div>
  `;
  modal.appendChild(adv);

  // checklist
  const ch = document.createElement('ul');
  ch.style = 'margin-top:10px; margin-left:18px; color:#dfffdc; font-size:13px';
  op.advice.checklist.forEach(it=>{ const li = document.createElement('li'); li.textContent = it; ch.appendChild(li); });
  modal.appendChild(ch);

  // actions
  const actions = document.createElement('div');
  actions.style = 'display:flex; gap:8px; margin-top:12px;';

  const btnDismiss = document.createElement('button');
  btnDismiss.textContent = 'Fermer';
  btnDismiss.onclick = ()=> modal.remove();

  const btnAlert = document.createElement('button');
  btnAlert.textContent = 'Créer une alerte';
  btnAlert.style.background = '#16ff91'; btnAlert.style.color = '#001';
  btnAlert.onclick = ()=>{
    // ajoute alerte au state (above = entry + small buffer)
    const price = op.advice.entry || 0;
    const alertObj = { t: op.symbol, p: Math.round(price * 100)/100, d: 'above', triggered:false };
    state.alerts.push(alertObj); saveState(); renderAlertsList();
    showPopup('Alerte créée pour ' + op.symbol);
  };

  const btnView = document.createElement('button');
  btnView.textContent = 'Voir chart';
  btnView.onclick = ()=>{
    modal.remove();
    loadChartFor(op.symbol);
    // scroll to chart (smooth)
    const cv = document.getElementById('chart');
    if(cv) cv.scrollIntoView({behavior:'smooth', block:'center'});
  };

  actions.appendChild(btnView);
  actions.appendChild(btnAlert);
  actions.appendChild(btnDismiss);
  modal.appendChild(actions);

  document.body.appendChild(modal);

  // auto remove after 50s (safety)
  setTimeout(()=>{ try{ modal.remove(); }catch(e){} }, 50000);
}

// Fonction utilitaire : exécute détection pour symbole à partir des tableaux déjà calculés (used after loadChartFor)
function detectAndShowOpportunityFromChartData(symbol, {closes}) {
  try{
    const ma20 = movingAverage(closes,20);
    const ma50 = movingAverage(closes,50);
    const rsiArray = computeRSI(closes,14);
    const rsi = rsiArray.slice(-1)[0] || null;
    const lastPrice = closes.slice(-1)[0] || null;
    const op = detectOpportunitiesFor(symbol, {closes, ma20, ma50, rsi, lastPrice});
    if(op) showOpportunityPopup(op);
    return op;
  }catch(e){
    console.warn('detectAndShowOpportunityFromChartData error', e);
  }
  return null;
}

// Hook: après avoir chargé un chart (intègre à ton loadChartFor)
// Ajoute la ligne suivante à la fin de ta fonction loadChartFor (après updateAnalysisFor/ renderDetailedTable) :
//     detectAndShowOpportunityFromChartData(symbol, {closes});
//
// Si tu veux que je m'en occupe directement, colle ceci juste après le block où tu crées/actualises le chart :
(function attachAutoDetectHook(){
  // on monkey-patch loadChartFor si elle existe (sécurisé)
  if(typeof loadChartFor === 'function'){
    const original = loadChartFor;
    window.loadChartFor = async function(symbol){
      // call original
      await original(symbol);
      // find closes from chart instance or re-fetch quickly (safer to re-fetch)
      try{
        const res = await fetch(PROXY + encodeURIComponent(API_CHART(symbol,'1mo')));
        const j = await res.json();
        const r = j.chart?.result?.[0];
        const closes = r?.indicators?.quote?.[0]?.close || [];
        detectAndShowOpportunityFromChartData(symbol, {closes});
      }catch(e){ console.warn('hook detect error', e); }
    };
  }
})();

// Hook: run detection across watchlist periodically (non-intrusive)
// Vérifie opportunités sur les tickers de la watchlist toutes les 60s (mais respecte cooldown par symbole)
setInterval(async ()=>{
  try{
    for(const s of state.watchlist){
      // passe si cooldown récent
      const last = window._lastOpportunityAt[s] || 0;
      if(Date.now() - last < OPPORTUNITY_RULES.cooldownMs) continue;
      // quick fetch for recent closes
      try{
        const res = await fetch(PROXY + encodeURIComponent(API_CHART(s,'5d')));
        const j = await res.json();
        const r = j.chart?.result?.[0];
        const closes = r?.indicators?.quote?.[0]?.close || [];
        if(closes && closes.length > 8){
          const op = detectAndShowOpportunityFromChartData(s, {closes});
          // if op detected, we already popup inside
        }
      }catch(e){}
    }
  }catch(e){ console.warn('periodic detect error', e); }
}, 60 * 1000); // 60s

// End of opportunity module


// ---- final autosave periodic ----
setInterval(saveState, 5000);

// ---- kickstart small: render UI initial ----
renderWatchlist();
renderTableList?.(); // if exists in older html
renderAlertsUI?.();
renderNewsPlaceholder();
updateScannerAndHeatmap();
