const PROXY = 'https://api.allorigins.win/raw?url=';
const API_QUOTE = (s) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`;
const API_CHART = (s, range='1mo', interval='1d') => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}`;
const AUTO_REFRESH_MS = 30000;

let state = {
    watchlist: JSON.parse(localStorage.getItem('watchlist_v2')) || ['AAPL','TSLA','NVDA'],
    alerts: JSON.parse(localStorage.getItem('alerts_v2')) || []
};

function saveState(){ 
    localStorage.setItem('watchlist_v2', JSON.stringify(state.watchlist));
    localStorage.setItem('alerts_v2', JSON.stringify(state.alerts));
}

function showNotification(msg, ms=4000){
    const n = document.getElementById('notify');
    n.textContent = msg; n.style.display='block';
    setTimeout(()=>{ n.style.display='none'; }, ms);
}

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
    const json = await fetchJson(API_QUOTE(ticker));
    const r = json?.quoteResponse?.result?.[0];
    if(!r) return null;
    return { symbol:r.symbol, price:r.regularMarketPrice, change:r.regularMarketChange, changePct:r.regularMarketChangePercent };
}

async function fetchChart(ticker, range='1mo', interval='1d'){
    const json = await fetchJson(API_CHART(ticker, range, interval));
    const result = json?.chart?.result?.[0];
    if(!result) return {labels:[], closes:[]};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const labels = timestamps.map(ts => new Date(ts*1000).toLocaleDateString());
    return {labels, closes};
}

function movingAverage(data, period){
    const out = [];
    for(let i=0;i<data.length;i++){
        if(i<period-1){ out.push(null); continue; }
        let sum=0; let count=0;
        for(let j=0;j<period;j++){ const v=data[i-j]; if(v!=null){ sum+=v; count++; } }
        out.push(count? sum/count:null);
    }
    return out;
}

async function updateWatchlistUI(){
    const cont = document.getElementById('watchlist');
    cont.innerHTML='';
    const promises = state.watchlist.map(t=>fetchQuote(t));
    const results = await Promise.all(promises);
    for(const r of results){
        if(!r) continue;
        const div = document.createElement('div'); div.className='ticker';
        const left = document.createElement('div'); left.className='left';
        left.innerHTML=`<div class="sym">${r.symbol}</div><div class="meta">${r.price!=null?r.price.toLocaleString():'—'}</div>`;
        const right = document.createElement('div'); right.className='right';
        const pct = r.changePct!=null ? r.changePct.toFixed(2)+'%' : '—';
        right.innerHTML=`<div>${pct}</div>
            <div style="margin-top:6px">
            <button onclick="viewChart('${r.symbol}')">Voir</button>
            <button onclick="removeTicker('${r.symbol}')">Suppr</button>
            </div>`;
        div.appendChild(left); div.appendChild(right);
        cont.appendChild(div);
    }
    saveState();
    checkAlerts(results);
}

function addTicker(){
    const input = document.getElementById('new-ticker');
    const t = (input.value||'').trim().toUpperCase();
    if(!t) return showNotification('Ticker vide');
    if(!state.watchlist.includes(t)) state.watchlist.push(t);
    input.value=''; saveState(); updateWatchlistUI();
}

function removeTicker(t){ state.watchlist = state.watchlist.filter(x=>x!==t); saveState(); updateWatchlistUI(); }

let chartInstance=null;

async function viewChart(ticker){
    const {labels, closes} = await fetchChart(ticker);
    renderChart(labels, closes, ticker);
}

function renderChart(labels, data, ticker){
    const ctx = document.getElementById('chart').getContext('2d');
    const ma20 = movingAverage(data,20);
    const ma50 = movingAverage(data,50);

    const lastPrice = data[data.length-1];
    const prevPrice = data[data.length-2] || lastPrice;
    const lineColor = lastPrice>=prevPrice?'green':'red';

    const alertPoints = [];
    state.alerts.forEach(a=>{
        if(a.ticker===ticker){
            data.forEach((price,i)=>{
                if((a.direction==='above' && price>=a.price)||(a.direction==='below' && price<=a.price)){
                    alertPoints.push({x:labels[i], y:price});
                }
            });
        }
    });

    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx,{
        type:'line',
        data:{
            labels:labels,
            datasets:[
                {label:`${ticker} (prix)`, data:data, borderColor:lineColor, backgroundColor:'transparent', tension:0.25, pointRadius:0},
                {label:'MA20', data:ma20, borderDash:[5,5], borderColor:'blue', tension:0.1, pointRadius:0},
                {label:'MA50', data:ma50, borderDash:[2,6], borderColor:'orange', tension:0.1, pointRadius:0},
                {label:'Alertes', data:alertPoints, type:'scatter', backgroundColor:'red', pointRadius:6}
            ]
        },
        options:{plugins:{legend:{position:'bottom'}}, scales:{x:{display:true},y:{display:true}}}
    });
}

function renderAlerts(){
    const el = document.getElementById('alerts');
    el.innerHTML='';
    state.alerts.forEach((a,i)=>{
        const div=document.createElement('div');
        div.className='alert-item';
        div.innerHTML=`${a.ticker} ${a.direction==='above'?'>':'<'} ${a.price} 
            <button onclick="removeAlert(${i})">Suppr</button>`;
        el.appendChild(div);
    });
}

function addAlert(){
    const t=document.getElementById('alert-ticker').value.trim().toUpperCase();
    const p=parseFloat(document.getElementById('alert-price').value);
    const d=document.getElementById('alert-direction').value;
    if(!t||!p) return showNotification('Ticker ou prix manquant');
    state.alerts.push({ticker:t, price:p, direction:d});
    saveState(); renderAlerts();
    document.getElementById('alert-ticker').value='';
    document.getElementById('alert-price').value='';
}

function removeAlert(i){ state.alerts.splice(i,1); saveState(); renderAlerts(); }

async function checkAlerts(quotes){
    state.alerts.forEach(a=>{
        const q = quotes.find(x=>x && x.symbol===a.ticker);
        if(!q || q.price==null) return;
        if((a.direction==='above' && q.price>=a.price)||(a.direction==='below' && q.price<=a.price)){
            showNotification(`ALERTE: ${a.ticker} ${a.direction==='above'?'au-dessus':'en-dessous'} de ${a.price} (actuel: ${q.price})`);
        }
    });
}

async function init(){
    window.addTicker = addTicker;
    window.addAlert = addAlert;
    window.removeAlert = removeAlert;
    window.viewChart = viewChart;

    await updateWatchlistUI();
    renderAlerts();
    setInterval(async()=>{
        await updateWatchlistUI();
    }, AUTO_REFRESH_MS);
}

init();
