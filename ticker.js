const TICKER_COINS = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'dogecoin', symbol: 'DOGE' }
];

let lastPrices = {};

async function updateTicker() {
  try {
    const ids = TICKER_COINS.map(c => c.id).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await res.json();

    const items = TICKER_COINS.map(coin => {
      const price = data[coin.id].usd;
      const prev = lastPrices[coin.id];
      let direction = '';
      if (prev !== undefined) {
        direction = price > prev ? 'up' : price < prev ? 'down' : '';
      }
      lastPrices[coin.id] = price;
      const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '';
      return `<div class="ticker-item ${direction}"><span class="sym">${coin.symbol}</span> $${price.toLocaleString()} ${arrow}</div>`;
    }).join('');

    const track = document.getElementById('tickerTrack');
    if (track) track.innerHTML = items + items;
  } catch (err) {
    const track = document.getElementById('tickerTrack');
    if (track) track.innerHTML = '<div class="ticker-item">Price data unavailable</div>';
  }
}

updateTicker();
setInterval(updateTicker, 15000);