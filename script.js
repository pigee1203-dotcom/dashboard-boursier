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

// ---- final autosave periodic ----
setInterval(saveState, 5000);

// ---- kickstart small: render UI initial ----
renderWatchlist();
renderTableList?.(); // if exists in older html
renderAlertsUI?.();
renderNewsPlaceholder();
updateScannerAndHeatmap();
