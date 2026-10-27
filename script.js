// ================== Trading Floor ==================
const API_BASE = 'https://crypto-global-trade-backend.onrender.com';
const FEE_RATE = 0.005;
const POLL_MS = 10000;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const MAX_POINTS = 360;

const COINS = [
  { id: 'bitcoin',  sym: 'btc',  name: 'Bitcoin',  color: '#f7931a' },
  { id: 'ethereum', sym: 'eth',  name: 'Ethereum', color: '#627eea' },
  { id: 'solana',   sym: 'sol',  name: 'Solana',   color: '#00ffa3' },
  { id: 'dogecoin', sym: 'doge', name: 'Dogecoin', color: '#c2a633' }
];

const userId = localStorage.getItem('userId');
const authToken = localStorage.getItem('authToken');
const TRADES_KEY = 'cgt_trades_' + userId;
const PRICE_KEY = 'cgt_price_hist';

let cash = 0;
let startingCash = 0;
let bestScore = 0;
let holdings = {};
let invested = {};
let prices = {};
let change24h = {};
const priceHistory = {};
let tradeHistory = [];

let loaded = false;
let needsSave = false;
let saving = false;
let saveAgain = false;
let failedPolls = 0;
let selected = 'btc';
let mode = 'buy';
let pendingSellAll = null;
let chart = null;
let lastChartW = 0;
let toastTimer = null;
let resizeTimer = null;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');
const coinBySym = (sym) => COINS.find((c) => c.sym === sym);
const emptyMap = () => ({ btc: 0, eth: 0, sol: 0, doge: 0 });

function fmtUSD(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n) {
  const v = Number(n) || 0;
  return (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + p.toFixed(5);
}
function fmtTick(v) {
  if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-US');
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
}
function fmtQty(q) {
  const v = Number(q) || 0;
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}
function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }
function timeStr(t) {
  const d = new Date(t);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function dateStr(t) {
  return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function row(label, value) { return '<div class="row"><span>' + label + '</span><b>' + value + '</b></div>'; }

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

function toast(msg, isErr) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'tp-toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function setPill(ok) {
  const pill = $('livePill');
  pill.className = 'tp-pill ' + (ok ? 'ok' : 'warn');
  pill.textContent = ok ? '● Live' : '● Reconnecting…';
}
function showBanner(text) { const b = $('banner'); b.textContent = text; b.style.display = 'block'; }
function hideBanner() { $('banner').style.display = 'none'; }

// ---------- price history (kept on this device for the chart) ----------
function loadPriceHistory() {
  const saved = lsGet(PRICE_KEY, {});
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  COINS.forEach((c) => {
    const arr = Array.isArray(saved[c.sym]) ? saved[c.sym] : [];
    priceHistory[c.sym] = arr.filter((pt) => pt && pt.t > cutoff && pt.p > 0).slice(-MAX_POINTS);
  });
}
function savePriceHistory() { lsSet(PRICE_KEY, priceHistory); }

// ---------- server ----------
async function loadFromServer() {
  const res = await fetch(API_BASE + '/api/data/' + userId);
  if (!res.ok) throw new Error('load failed ' + res.status);
  const data = await res.json();
  cash = Number(data.cash) || 0;
  holdings = Object.assign(emptyMap(), data.holdings || {});
  invested = Object.assign(emptyMap(), data.invested || {});
  bestScore = Number(data.best_score) || 0;
  startingCash = Number(data.starting_cash) || 0;
  loaded = true;
}

async function saveToServer() {
  if (!loaded) return;
  if (saving) { saveAgain = true; return; }
  saving = true;
  try {
    const res = await fetch(API_BASE + '/api/data/' + userId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash: cash, holdings: holdings, invested: invested, bestScore: bestScore })
    });
    if (!res.ok) throw new Error('save failed');
    needsSave = false;
  } catch (err) {
    needsSave = true;
  }
  saving = false;
  if (saveAgain) { saveAgain = false; saveToServer(); }
}

async function logTransaction(action, coin, amountUsd, fee) {
  try {
    await fetch(API_BASE + '/api/transactions/' + userId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, coin: coin, amountUsd: amountUsd, fee: fee })
    });
  } catch (err) {}
}

async function connect() {
  for (let attempt = 0; attempt < 8 && !loaded; attempt++) {
    try { await loadFromServer(); }
    catch (e) { await new Promise((r) => setTimeout(r, 4000)); }
  }
  if (!loaded) {
    showBanner('We could not reach the trading server. Please refresh the page in a moment.');
    return;
  }
  const empty = cash <= 0 && COINS.every((c) => holdings[c.sym] <= 0);
  if (empty) {
    showBanner('Your trading cash is $0. Ask an admin to credit your account. Your balance will appear here as soon as it is added.');
  } else {
    hideBanner();
  }
  updateAll();
}

async function fetchPrices() {
  try {
    const res = await fetch(API_BASE + '/api/prices');
    const data = await res.json();
    if (!data || !data.bitcoin) throw new Error('bad price data');
    const now = Date.now();
    COINS.forEach((c) => {
      const d = data[c.id];
      if (!d || !d.usd) return;
      prices[c.sym] = d.usd;
      change24h[c.sym] = typeof d.usd_24h_change === 'number' ? d.usd_24h_change : null;
      priceHistory[c.sym].push({ t: now, p: d.usd });
      if (priceHistory[c.sym].length > MAX_POINTS) priceHistory[c.sym].shift();
    });
    savePriceHistory();
    failedPolls = 0;
    setPill(true);
    updateAll();
    renderChart();
    if (needsSave && loaded) saveToServer();
  } catch (err) {
    failedPolls++;
    if (failedPolls >= 2) setPill(false);
  }
}

// ---------- chart ----------
function createChart() {
  const box = $('chartBox');
  const canvas = $('priceChart');
  const w = box.clientWidth || 600;
  const h = box.clientHeight || 320;
  canvas.width = w;
  canvas.height = h;
  lastChartW = w;

  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: coinBySym(selected).color,
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        backgroundColor: function (ctx) {
          const area = ctx.chart.chartArea;
          if (!area) return 'transparent';
          const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          const color = coinBySym(selected).color;
          g.addColorStop(0, hexToRgba(color, 0.3));
          g.addColorStop(1, hexToRgba(color, 0));
          return g;
        }
      }]
    },
    options: {
      animation: false,
      responsive: false,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: '#0b1120',
          borderColor: 'rgba(212,175,55,0.4)',
          borderWidth: 1,
          titleColor: '#8f9ab3',
          bodyColor: '#ffffff',
          padding: 10,
          callbacks: { label: function (c) { return fmtPrice(c.parsed.y); } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#8f9ab3',
            maxTicksLimit: 6,
            maxRotation: 0,
            callback: function (value) {
              const label = this.getLabelForValue(value);
              return label ? label.slice(0, 5) : '';
            }
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#8f9ab3', callback: function (v) { return fmtTick(v); } },
          grace: '6%'
        }
      }
    }
  });
}

function renderChart() {
  if (!chart) return;
  const pts = priceHistory[selected];
  chart.data.labels = pts.map((pt) => timeStr(pt.t));
  chart.data.datasets[0].data = pts.map((pt) => pt.p);
  chart.data.datasets[0].borderColor = coinBySym(selected).color;
  chart.update('none');
  $('chartEmpty').style.display = pts.length < 2 ? 'flex' : 'none';
}

// ---------- calculations ----------
function portfolioValue() {
  let v = cash;
  COINS.forEach((c) => { v += holdings[c.sym] * prices[c.sym]; });
  return v;
}

function getAmount() {
  const v = parseFloat($('amountInput').value);
  return isFinite(v) && v > 0 ? v : 0;
}

function sellAllActive() {
  return !!pendingSellAll && pendingSellAll.sym === selected && $('amountInput').value === pendingSellAll.value;
}

function computeOrder() {
  const sym = selected;
  const price = prices[sym];
  let amount = getAmount();
  if (!(price > 0) || amount <= 0) return null;
  let qty = amount / price;
  let sellAll = false;
  if (mode === 'sell' && sellAllActive()) {
    qty = holdings[sym];
    amount = qty * price;
    sellAll = true;
  }
  return { sym: sym, price: price, amount: amount, qty: qty, fee: amount * FEE_RATE, sellAll: sellAll };
}

function validateOrder(o) {
  if (!o) return '';
  if (!o.sellAll && o.amount < 1) return 'Minimum trade is $1.';
  if (mode === 'buy') {
    if (o.amount + o.fee > cash + 1e-9) return 'Not enough cash for this amount (including fee).';
  } else if (o.qty > holdings[o.sym] * (1 + 1e-9)) {
    return 'Not enough ' + o.sym.toUpperCase() + ' to sell.';
  }
  return '';
}

// ---------- rendering ----------
function updateAll() {
  const pricesReady = COINS.every((c) => prices[c.sym] > 0);
  const noCoins = COINS.every((c) => holdings[c.sym] <= 0);
  const showPortfolio = loaded && (pricesReady || noCoins);
  const pv = portfolioValue();
  const pl = pv - startingCash;

  if (showPortfolio && startingCash > 0 && pl > bestScore + 0.005) {
    bestScore = pl;
    needsSave = true;
  }

  $('sumCash').textContent = loaded ? fmtUSD(cash) : '…';
  $('sumValue').textContent = showPortfolio ? fmtUSD(pv) : '…';
  const plEl = $('sumPL');
  if (showPortfolio) {
    const cls = Math.abs(pl) < 0.005 ? '' : (pl > 0 ? 'tp-up' : 'tp-down');
    plEl.textContent = fmtSigned(pl);
    plEl.className = 'val ' + cls;
    $('sumPLsub').textContent = startingCash > 0
      ? fmtPct((pl / startingCash) * 100) + ' on your starting balance'
      : 'Starts once your account is credited';
  } else {
    plEl.textContent = '…';
    plEl.className = 'val';
  }
  $('sumBest').textContent = loaded ? fmtUSD(bestScore) : '…';

  COINS.forEach((c) => {
    $('tabPx-' + c.sym).textContent = fmtPrice(prices[c.sym]);
    const ch = change24h[c.sym];
    const chEl = $('tabCh-' + c.sym);
    chEl.textContent = (ch === null || ch === undefined) ? '—' : fmtPct(ch) + ' (24h)';
    chEl.className = 'ch ' + ((ch === null || ch === undefined) ? '' : (ch >= 0 ? 'tp-up' : 'tp-down'));
  });

  const c = coinBySym(selected);
  $('coinTitle').innerHTML = c.name + '<span class="sym">' + c.sym.toUpperCase() + '</span>';
  $('bigPrice').textContent = fmtPrice(prices[selected]);
  const bc = change24h[selected];
  const bcEl = $('bigChange');
  bcEl.textContent = (bc === null || bc === undefined) ? '24h —' : '24h ' + fmtPct(bc);
  bcEl.className = 'tp-bigchg ' + ((bc === null || bc === undefined) ? '' : (bc >= 0 ? 'tp-up' : 'tp-down'));

  renderAlloc();
  renderPosition();
  updateTradePanel();
}

function renderAlloc() {
  const bar = $('allocBar');
  const legend = $('allocLegend');
  const segs = [{ name: 'Cash', color: '#64748b', value: cash }];
  COINS.forEach((c) => segs.push({ name: c.sym.toUpperCase(), color: c.color, value: holdings[c.sym] * prices[c.sym] }));
  const total = segs.reduce((s, x) => s + Math.max(0, x.value || 0), 0);
  if (!loaded || total <= 0) {
    bar.innerHTML = '';
    legend.innerHTML = '<span>No funds in your account yet</span>';
    return;
  }
  const visible = segs.filter((s) => s.value > 0);
  bar.innerHTML = visible.map((s) => '<div style="width:' + ((s.value / total) * 100).toFixed(2) + '%;background:' + s.color + '"></div>').join('');
  legend.innerHTML = visible.map((s) =>
    '<span><span class="tp-dot" style="background:' + s.color + '"></span>' + s.name + ' ' + ((s.value / total) * 100).toFixed(0) + '%</span>'
  ).join('');
}

function renderPosition() {
  const sym = selected;
  const c = coinBySym(sym);
  const qty = holdings[sym];
  const price = prices[sym];
  const value = qty * price;
  const inv = invested[sym];
  let gainHtml = '—';
  if (inv > 0 && price > 0) {
    const g = ((value - inv) / inv) * 100;
    gainHtml = '<span class="' + (g >= 0 ? 'tp-up' : 'tp-down') + '">' + fmtPct(g) + '</span>';
  }
  $('positionBox').innerHTML =
    '<h4>Your ' + c.name + ' position</h4>' +
    row('Holding', fmtQty(qty) + ' ' + sym.toUpperCase()) +
    row('Current value', fmtUSD(value)) +
    row('Amount invested', fmtUSD(inv)) +
    row('Since bought', gainHtml);
}

function updateTradePanel() {
  const sym = selected;
  const SYM = sym.toUpperCase();
  const price = prices[sym];

  $('buyTab').classList.toggle('active', mode === 'buy');
  $('sellTab').classList.toggle('active', mode === 'sell');

  const submit = $('submitBtn');
  submit.className = 'tp-submit ' + mode;
  submit.textContent = (mode === 'buy' ? 'Buy ' : 'Sell ') + SYM;

  if (!loaded) {
    $('availLine').textContent = 'Loading your balance…';
  } else if (mode === 'buy') {
    $('availLine').textContent = 'Available cash: ' + fmtUSD(cash);
  } else {
    $('availLine').textContent = 'Available: ' + fmtQty(holdings[sym]) + ' ' + SYM +
      (price > 0 ? ' (≈ ' + fmtUSD(holdings[sym] * price) + ')' : '');
  }

  const order = computeOrder();
  const err = validateOrder(order);
  let html = '';
  if (!order) {
    html = '<div class="row"><span>Enter an amount to see your order summary</span></div>';
  } else if (mode === 'buy') {
    html = row('You receive', '≈ ' + fmtQty(order.qty) + ' ' + SYM) +
           row('Fee (0.5%)', fmtUSD(order.fee)) +
           row('Total cost', fmtUSD(order.amount + order.fee));
  } else {
    html = row('You sell', fmtQty(order.qty) + ' ' + SYM) +
           row('Fee (0.5%)', fmtUSD(order.fee)) +
           row('You receive', fmtUSD(order.amount - order.fee));
  }
  if (err) html += '<div class="err">' + err + '</div>';
  $('estBox').innerHTML = html;
  submit.disabled = !(loaded && order && !err);
}

function renderHistory() {
  const el = $('historyList');
  if (!tradeHistory.length) {
    el.innerHTML = '<div class="tp-empty">No trades yet. Your trades will appear here.</div>';
    return;
  }
  el.innerHTML = tradeHistory.map((t) =>
    '<div class="tp-row">' +
      '<span class="tp-badge ' + (t.action === 'buy' ? 'buy' : 'sell') + '">' + (t.action === 'buy' ? 'BUY' : 'SELL') + '</span>' +
      '<span class="mid">' + fmtQty(t.qty) + ' ' + String(t.sym).toUpperCase() + '<small>@ ' + fmtPrice(t.price) + '</small></span>' +
      '<span class="end">' + fmtUSD(t.amount) + '<small>' + dateStr(t.t) + '</small></span>' +
    '</div>'
  ).join('');
}

function addHistory(entry) {
  tradeHistory.unshift(entry);
  tradeHistory = tradeHistory.slice(0, 40);
  lsSet(TRADES_KEY, tradeHistory);
  renderHistory();
}

// ---------- actions ----------
function setSelected(sym) {
  selected = sym;
  pendingSellAll = null;
  document.querySelectorAll('.tp-tab').forEach((b) => b.classList.toggle('active', b.dataset.sym === sym));
  renderChart();
  updateAll();
}

function setMode(m) {
  mode = m;
  pendingSellAll = null;
  $('amountInput').value = '';
  updateTradePanel();
}

function applyQuick(pct) {
  const sym = selected;
  const price = prices[sym];
  if (!(price > 0)) { toast('Prices are still loading…', true); return; }
  let amt = 0;
  if (mode === 'buy') {
    amt = Math.floor((cash / (1 + FEE_RATE)) * (pct / 100) * 100) / 100;
  } else {
    amt = Math.round(holdings[sym] * price * (pct / 100) * 100) / 100;
  }
  if (amt <= 0) {
    toast(mode === 'buy' ? 'No cash available' : 'You have no ' + sym.toUpperCase() + ' to sell', true);
    return;
  }
  $('amountInput').value = amt.toFixed(2);
  pendingSellAll = (mode === 'sell' && pct === 100) ? { sym: sym, value: $('amountInput').value } : null;
  updateTradePanel();
}

function executeTrade() {
  if (!loaded) { toast('Still connecting to your account…', true); return; }
  const o = computeOrder();
  if (!o) { toast('Enter an amount first', true); return; }
  const err = validateOrder(o);
  if (err) { toast(err, true); return; }

  const sym = o.sym;
  if (mode === 'buy') {
    cash -= o.amount + o.fee;
    holdings[sym] += o.qty;
    invested[sym] += o.amount;
  } else {
    const before = holdings[sym];
    const qty = Math.min(o.qty, before);
    holdings[sym] = before - qty;
    cash += o.amount - o.fee;
    invested[sym] = before > 0 ? invested[sym] * (holdings[sym] / before) : 0;
    if (holdings[sym] < 1e-12) { holdings[sym] = 0; invested[sym] = 0; }
  }
  if (cash < 0 && cash > -1e-9) cash = 0;

  addHistory({ t: Date.now(), action: mode, sym: sym, amount: o.amount, qty: o.qty, price: o.price });
  logTransaction(mode, sym, o.amount, o.fee);
  needsSave = true;
  saveToServer();

  $('amountInput').value = '';
  pendingSellAll = null;
  updateAll();
  toast((mode === 'buy' ? 'Bought ' : 'Sold ') + fmtQty(o.qty) + ' ' + sym.toUpperCase() + ' for ' + fmtUSD(o.amount));
}

function resetAccount() {
  if (!loaded) return;
  if (!confirm('Reset your trading account? All coins will be removed and your cash will return to your starting balance.')) return;
  cash = startingCash;
  COINS.forEach((c) => { holdings[c.sym] = 0; invested[c.sym] = 0; });
  tradeHistory = [];
  lsSet(TRADES_KEY, []);
  needsSave = true;
  saveToServer();
  renderHistory();
  updateAll();
  toast('Trading account reset');
}

// ---------- setup ----------
function buildTabs() {
  const wrap = $('coinTabs');
  wrap.innerHTML = COINS.map((c) =>
    '<button class="tp-tab ' + (c.sym === selected ? 'active' : '') + '" data-sym="' + c.sym + '">' +
      '<span class="top"><span class="tp-dot" style="background:' + c.color + '"></span>' + c.sym.toUpperCase() + '</span>' +
      '<span class="px" id="tabPx-' + c.sym + '">—</span>' +
      '<span class="ch" id="tabCh-' + c.sym + '">—</span>' +
    '</button>'
  ).join('');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.tp-tab');
    if (b) setSelected(b.dataset.sym);
  });
}

function bindEvents() {
  $('buyTab').addEventListener('click', () => setMode('buy'));
  $('sellTab').addEventListener('click', () => setMode('sell'));
  $('amountInput').addEventListener('input', updateTradePanel);
  $('amountInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') executeTrade(); });
  $('quickBtns').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) applyQuick(Number(b.dataset.pct));
  });
  $('submitBtn').addEventListener('click', executeTrade);
  $('resetBtn').addEventListener('click', resetAccount);

  // Only resize the chart when the WIDTH changes (not when a phone keyboard opens)
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!chart) return;
      const box = $('chartBox');
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w > 0 && Math.abs(w - lastChartW) > 1) {
        lastChartW = w;
        chart.resize(w, h);
      }
    }, 150);
  });
}

function init() {
  COINS.forEach((c) => {
    holdings[c.sym] = 0;
    invested[c.sym] = 0;
    prices[c.sym] = 0;
    change24h[c.sym] = null;
    priceHistory[c.sym] = [];
  });
  loadPriceHistory();
  tradeHistory = lsGet(TRADES_KEY, []);
  if (!Array.isArray(tradeHistory)) tradeHistory = [];

  buildTabs();
  createChart();
  bindEvents();
  renderHistory();
  renderChart();
  updateAll();

  connect();
  fetchPrices();
  setInterval(fetchPrices, POLL_MS);
}

if (userId && authToken) {
  init();
} else {
  window.location.href = 'login.html';
}