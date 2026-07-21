const COINS = [
  { id: 'bitcoin',  symbol: 'btc', name: 'Bitcoin',  color: '#f7931a' },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', color: '#627eea' },
  { id: 'solana',   symbol: 'sol', name: 'Solana',   color: '#00ffa3' },
  { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', color: '#c2a633' }
];

let cash = 10000;
const startingCash = 10000;
const FEE_RATE = 0.005;

let bestScore = Number(localStorage.getItem('bestScore')) || 0;

let holdings = {};
let invested = {};
let prices = {};

COINS.forEach(c => {
  holdings[c.symbol] = 0;
  invested[c.symbol] = 0;
  prices[c.symbol] = 0;
});

const userId = localStorage.getItem('userId');
if (!userId) {
  window.location.href = 'login.html';
}

async function loadFromServer() {
  try {
    const res = await fetch(`http://localhost:3000/api/data/${userId}`);
    const data = await res.json();
    cash = data.cash;
    holdings = data.holdings;
    invested = data.invested || invested;
  } catch (err) {
    console.log('Could not reach backend, using defaults.');
  }
}

const cardsContainer = document.getElementById('coinCards');
COINS.forEach(coin => {
  cardsContainer.innerHTML += `
    <div class="card">
      <div class="coin-name">${coin.name} (${coin.symbol.toUpperCase()})</div>
      <div class="price">$<span id="${coin.symbol}Price">loading...</span></div>
      <div class="gain" id="${coin.symbol}Gain"></div>
      <canvas id="${coin.symbol}Chart" width="500" height="150"></canvas>
      <div class="holdings">${coin.symbol.toUpperCase()} held: <span id="${coin.symbol}Held">0</span></div>
      <div class="controls">
        <input type="number" id="${coin.symbol}Amount" value="100" min="1">
        <button class="buy-btn" data-coin="${coin.symbol}">Buy</button>
        <button class="sell-btn" data-coin="${coin.symbol}">Sell</button>
      </div>
    </div>
  `;
});

const cashEl = document.getElementById('cash');
const profitLossEl = document.getElementById('profitLoss');
const historyList = document.getElementById('historyList');

const priceHistory = {};
const timeLabels = {};
const charts = {};

COINS.forEach(coin => {
  priceHistory[coin.symbol] = [];
  timeLabels[coin.symbol] = [];
  const ctx = document.getElementById(coin.symbol + 'Chart').getContext('2d');
  charts[coin.symbol] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels[coin.symbol],
      datasets: [{
        label: coin.symbol.toUpperCase(),
        data: priceHistory[coin.symbol],
        borderColor: coin.color,
        fill: false,
        tension: 0.2
      }]
    },
    options: {
      animation: false,
      responsive: false,
      scales: { y: { beginAtZero: false } }
    }
  });
});

async function fetchPrices() {
  try {
    const ids = COINS.map(c => c.id).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await res.json();

    const now = new Date();
    const label = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

    COINS.forEach(coin => {
      const price = data[coin.id].usd;
      prices[coin.symbol] = price;
      document.getElementById(coin.symbol + 'Price').textContent = price.toLocaleString();

      timeLabels[coin.symbol].push(label);
      priceHistory[coin.symbol].push(price);
      if (timeLabels[coin.symbol].length > 20) {
        timeLabels[coin.symbol].shift();
        priceHistory[coin.symbol].shift();
      }
      charts[coin.symbol].update();
    });

    updateDisplay();
  } catch (err) {
    COINS.forEach(coin => {
      document.getElementById(coin.symbol + 'Price').textContent = 'error loading';
    });
  }
}

function updateDisplay() {
  cashEl.textContent = cash.toFixed(2);

  let portfolioValue = cash;

  COINS.forEach(coin => {
    const sym = coin.symbol;
    document.getElementById(sym + 'Held').textContent = holdings[sym].toFixed(6);

    const currentValue = holdings[sym] * prices[sym];
    portfolioValue += currentValue;

    const gainEl = document.getElementById(sym + 'Gain');
    if (invested[sym] > 0) {
      const gainPct = ((currentValue - invested[sym]) / invested[sym]) * 100;
      gainEl.textContent = (gainPct >= 0 ? '+' : '') + gainPct.toFixed(2) + '% since bought';
      gainEl.style.color = gainPct >= 0 ? '#2ecc71' : '#e74c3c';
    } else {
      gainEl.textContent = 'No position yet';
      gainEl.style.color = '#888';
    }
  });

  const profitLoss = portfolioValue - startingCash;
  profitLossEl.textContent = profitLoss.toFixed(2);
  profitLossEl.style.color = profitLoss >= 0 ? '#2ecc71' : '#e74c3c';

  if (profitLoss > bestScore) {
    bestScore = profitLoss;
    localStorage.setItem('bestScore', bestScore);
  }
  document.getElementById('bestScore').textContent = bestScore.toFixed(2);

  saveToServer();
}

async function saveToServer() {
  try {
    await fetch(`http://localhost:3000/api/data/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash, holdings, invested })
    });
  } catch (err) {
    console.log('Could not save to backend.');
  }
}

function addHistory(text) {
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
  const li = document.createElement('li');
  li.textContent = `[${time}] ${text}`;
  historyList.prepend(li);
}

function buyCoin(sym) {
  const amount = Number(document.getElementById(sym + 'Amount').value);
  if (amount <= 0 || isNaN(amount)) {
    alert('Enter a valid amount');
    return;
  }
  const fee = amount * FEE_RATE;
  const totalCost = amount + fee;
  if (cash < totalCost) {
    alert('Not enough cash (including fee)');
    return;
  }
  const bought = amount / prices[sym];
  cash -= totalCost;
  holdings[sym] += bought;
  invested[sym] += amount;
  addHistory(`Bought ${bought.toFixed(6)} ${sym.toUpperCase()} for $${amount} (fee: $${fee.toFixed(2)})`);
  updateDisplay();
}

function sellCoin(sym) {
  const amount = Number(document.getElementById(sym + 'Amount').value);
  if (amount <= 0 || isNaN(amount)) {
    alert('Enter a valid amount');
    return;
  }
  const toSell = amount / prices[sym];
  if (holdings[sym] < toSell) {
    alert(`Not enough ${sym.toUpperCase()}`);
    return;
  }
  const fee = amount * FEE_RATE;
  const proceeds = amount - fee;
  holdings[sym] -= toSell;
  cash += proceeds;
  const proportionSold = toSell / (holdings[sym] + toSell);
  invested[sym] -= invested[sym] * proportionSold;
  addHistory(`Sold ${toSell.toFixed(6)} ${sym.toUpperCase()} for $${amount} (fee: $${fee.toFixed(2)})`);
  updateDisplay();
}

function resetGame() {
  cash = 10000;
  COINS.forEach(coin => {
    holdings[coin.symbol] = 0;
    invested[coin.symbol] = 0;
  });
  historyList.innerHTML = '';
  updateDisplay();
}

cardsContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('buy-btn')) {
    buyCoin(e.target.dataset.coin);
  } else if (e.target.classList.contains('sell-btn')) {
    sellCoin(e.target.dataset.coin);
  }
});

document.getElementById('resetBtn').addEventListener('click', resetGame);

loadFromServer().then(() => {
  fetchPrices();
  updateDisplay();
  setInterval(fetchPrices, 10000);
});