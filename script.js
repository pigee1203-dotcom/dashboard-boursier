const PROXY = 'https://api.allorigins.win/raw?url=';
const API_QUOTE = ticker => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;

let state = {
    watchlist: ['AAPL','TSLA','NVDA']
};

// Afficher les tickers et leurs prix
async function updateWatchlistUI() {
    const cont = document.getElementById('watchlist');
    cont.innerHTML = '';
    for (const t of state.watchlist) {
        let price = '--';
        try {
            const res = await fetch(PROXY + encodeURIComponent(API_QUOTE(t)));
            const data = await res.json();
            const quote = data.quoteResponse.result[0];
            if (quote && quote.regularMarketPrice != null) price = quote.regularMarketPrice.toFixed(2) + ' €';
        } catch(e) {
            console.warn('Erreur fetch price', e);
        }
        const div = document.createElement('div');
        div.className = 'ticker';
        div.textContent = `${t}: ${price}`;
        cont.appendChild(div);
    }
}

// Ajouter un ticker
function addTicker() {
    const input = document.getElementById('new-ticker');
    const t = input.value.trim().toUpperCase();
    if (!t) return alert('Ticker vide');
    if (!state.watchlist.includes(t)) state.watchlist.push(t);
    input.value = '';
    updateWatchlistUI();
}

let chartInstance = null;

// Affiche le graphique pour un ticker
async function viewChart(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    try {
        const res = await fetch(PROXY + encodeURIComponent(url));
        const data = await res.json();
        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        const labels = timestamps.map(ts => new Date(ts*1000).toLocaleDateString());

        const ctx = document.getElementById('chart').getContext('2d');
        if(chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: ticker,
                    data: closes,
                    borderColor: 'green',
                    backgroundColor: 'transparent',
                    tension: 0.25,
                    pointRadius: 0
                }]
            },
            options: {
                plugins: { legend: { position: 'bottom' } },
                scales: { x: { display: true }, y: { display: true } }
            }
        });
    } catch(e) {
        console.warn('Erreur graphique', e);
        alert('Impossible de charger le graphique pour ' + ticker);
    }
}


// Initialisation
updateWatchlistUI();
