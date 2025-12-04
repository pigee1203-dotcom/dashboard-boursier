const PROXY = 'https://api.allorigins.win/raw?url=';
const API_QUOTE = ticker => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;

let state = {
    watchlist: ['AAPL','TSLA','NVDA'],
    alerts: []
};

function saveState(){ localStorage.setItem('watchlist', JSON.stringify(state.watchlist)); }

function showNotification(msg){ alert(msg); }

async function fetchPrice(ticker){
    try {
        const res = await fetch(PROXY + encodeURIComponent(API_QUOTE(ticker)));
        const data = await res.json();
        const quote = data.quoteResponse.result[0];
        return quote?.regularMarketPrice || null;
    } catch(e) {
        console.warn(e);
        return null;
    }
}

async function updateWatchlistUI(){
    const cont = document.getElementById('watchlist');
    cont.innerHTML = '';
    for(const t of state.watchlist){
        const price = await fetchPrice(t);
        const div = document.createElement('div');
        div.className = 'ticker';
        div.innerHTML = `${t}: ${price!=null ? price.toFixed(2)+' €' : '--'} 
            <button onclick="viewChart('${t}')">Voir</button>`;
        cont.appendChild(div);
    }
}

function addTicker(){
    const input = document.getElementById('new-ticker');
    const t = input.value.trim().toUpperCase();
    if(!t) return showNotification('Ticker vide');
    if(!state.watchlist.includes(t)) state.watchlist.push(t);
    input.value=''; saveState(); updateWatchlistUI();
}

// --- Graphique ---
let chartInstance = null;
async function viewChart(ticker){
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    const res = await fetch(PROXY + encodeURIComponent(url));
    const data = await res.json();
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    const labels = timestamps.map(ts => new Date(ts*1000).toLocaleDateString());

    const ctx = document.getElementById('chart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type:'line',
        data:{
            labels: labels,
            datasets: [{label: ticker, data: closes, borderColor:'green', backgroundColor:'transparent'}]
        },
        options:{plugins:{legend:{position:'bottom'}}}
    });
}

updateWatchlistUI();
