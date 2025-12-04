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

// Initialisation
updateWatchlistUI();
