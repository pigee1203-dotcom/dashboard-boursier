const PROXY = 'https://api.allorigins.win/raw?url=';
const API_QUOTE = ticker => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;

const alertSound = new Audio('beep.mp3'); // Son pour les alertes

let state = {
    watchlist: ['AAPL','TSLA','NVDA'],
    alerts: []  // stockage des alertes
};

let chartInstance = null;

// --- WATCHLIST ---
async function updateWatchlistUI() {
    const cont = document.getElementById('watchlist');
    cont.innerHTML = '';
    for (const t of state.watchlist) {
        let price = null;
        try {
            const res = await fetch(PROXY + encodeURIComponent(API_QUOTE(t)));
            const data = await res.json();
            const quote = data.quoteResponse.result[0];
            if (quote && quote.regularMarketPrice != null) price = quote.regularMarketPrice;
        } catch(e) {
            console.warn('Erreur fetch price', e);
        }

        const prevPrice = document.getElementById(`price-${t}`)?.dataset.value;
        const div = document.createElement('div');
        div.className = 'ticker';

        // Comparaison prix précédent
        let color = 'black';
        if(prevPrice && price) {
            if(price > parseFloat(prevPrice)) color = 'green';
            else if(price < parseFloat(prevPrice)) color = 'red';
        }

        div.innerHTML = `${t}: <span id="price-${t}" data-value="${price}" style="color:${color}">${price != null ? price.toFixed(2)+' €' : '--'}</span> 
            <button onclick="viewChart('${t}')">Voir</button>`;
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

// --- GRAPHIQUE ---
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

// --- ALERTES ---
function renderAlerts() {
    const el = document.getElementById('alerts');
    el.innerHTML = '';
    state.alerts.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = 'alert-item';
        div.innerHTML = `${a.ticker} ${a.direction==='above'?'>' : '<'} ${a.price} 
            <button onclick="removeAlert(${i})">Supprimer</button>`;
        el.appendChild(div);
    });
}

function addAlert() {
    const t = document.getElementById('alert-ticker').value.trim().toUpperCase();
    const p = parseFloat(document.getElementById('alert-price').value);
    const d = document.getElementById('alert-direction').value;
    if(!t || !p) return alert('Ticker ou prix manquant');

    state.alerts.push({ticker: t, price: p, direction: d});
    document.getElementById('alert-ticker').value = '';
    document.getElementById('alert-price').value = '';
    renderAlerts();
}

function removeAlert(i) {
    state.alerts.splice(i,1);
    renderAlerts();
}

// --- VÉRIFICATION AUTOMATIQUE ---
async function checkAlerts() {
    for (let a of state.alerts) {
        try {
            const res = await fetch(PROXY + encodeURIComponent(API_QUOTE(a.ticker)));
            const data = await res.json();
            const quote = data.quoteResponse.result[0];
            const price = quote?.regularMarketPrice;
            if(!price) continue;

            if(a.direction==='above' && price >= a.price) {
                alert(`ALERTE: ${a.ticker} est au-dessus de ${a.price} (actuel: ${price})`);
                alertSound.play();
            }
            if(a.direction==='below' && price <= a.price) {
                alert(`ALERTE: ${a.ticker} est en-dessous de ${a.price} (actuel: ${price})`);
                alertSound.play();
            }
        } catch(e) {
            console.warn('Erreur check alert', e);
        }
    }
}

// Vérifie toutes les 30 secondes
setInterval(checkAlerts, 30000);

// --- INITIALISATION ---
updateWatchlistUI();
renderAlerts();

// --- MODE DÉBUTANT ---
function updateDebutantView(ticker, price, rsiValue) {
    document.getElementById("prix-debutant").textContent =
        ticker + " : " + price + " €";

    let rsiText = "RSI : " + rsiValue;

    if (rsiValue > 70) rsiText += " (suracheté)";
    else if (rsiValue < 30) rsiText += " (survendu)";
    else rsiText += " (zone neutre)";

    document.getElementById("rsi-simplifie").textContent = rsiText;

    let conseil = "Analyse en cours...";
    if (rsiValue > 70) conseil = "Attention : le prix est peut-être trop haut.";
    if (rsiValue < 30) conseil = "Peut-être une opportunité pour entrer.";
    if (rsiValue >= 30 && rsiValue <= 70) conseil = "Marché stable.";

    document.getElementById("conseil-debutant").textContent = conseil;

    let risque = "Aucun danger immédiat.";
    if (rsiValue > 80) risque = "⚠ Risque élevé : chute possible.";
    if (rsiValue < 20) risque = "⚠ Risque : marché très incertain.";

    document.getElementById("risque-simple").textContent = risque;
}
