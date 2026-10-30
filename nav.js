const NAV_API = 'https://crypto-global-trade-backend.onrender.com';

// ---- Attach the login token to requests that need it ----
(function () {
  const originalFetch = window.fetch;
  const protectedPath = /\/api\/(data|wallet|transactions|toggle-public|copy-trade)\//;

  window.fetch = async function (url, options) {
    options = options || {};
    const needsAuth = typeof url === 'string' && url.startsWith(NAV_API) && protectedPath.test(url);

    if (needsAuth) {
      const token = localStorage.getItem('authToken');
      options.headers = Object.assign({}, options.headers, token ? { Authorization: 'Bearer ' + token } : {});
    }

    const res = await originalFetch(url, options);

    if (needsAuth && res.status === 401) {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('authToken');
      window.location.href = 'login.html';
    }
    return res;
  };
})();

function badgeSvgNav(color) {
  return `<svg viewBox="0 0 100 100" style="width:16px;height:16px;vertical-align:middle;margin-left:6px;">
    <polygon points="50,2 61,12 76,8 82,22 97,28 93,44 100,58 88,68 89,84 73,85 65,98 50,91 35,98 27,85 11,84 12,68 0,58 7,44 3,28 18,22 24,8 39,12" fill="${color}"/>
    <path d="M32 50 L44 62 L70 36" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function initNav() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  const userId = localStorage.getItem('userId');
  const username = localStorage.getItem('username');
  const token = localStorage.getItem('authToken');

  if ((!userId || !token) && !isLoginPage) {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
    return;
  }
  if (isLoginPage) return;

  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navMenu = document.getElementById('navMenu');
  if (!hamburgerBtn || !navMenu) return;

  hamburgerBtn.addEventListener('click', () => {
    navMenu.classList.toggle('open');
  });

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  renderNavMenu(navMenu, username, userId);
  startNotificationWatcher();
}

async function renderNavMenu(navMenu, username, userId) {
  let badgeHtml = '';
  try {
    const res = await fetch(`${NAV_API}/api/data/${userId}`);
    const data = await res.json();
    if (data.verification_tier === 'gold') badgeHtml = badgeSvgNav('#d4af37');
    else if (data.verification_tier === 'blue') badgeHtml = badgeSvgNav('#3b82f6');
  } catch (err) {}

  navMenu.innerHTML = `
    <div style="padding: 16px 20px; border-bottom: 1px solid rgba(212,175,55,0.15); font-weight:700; color:#f0ead6; display:flex; align-items:center;">
      ${username || ''}${badgeHtml}
    </div>
    <a href="index.html" data-i18n="nav_home">Home</a>
    <a href="dashboard.html">Dashboard</a>
    <a href="trading.html" data-i18n="nav_trading">Trading</a>
    <a href="orders.html">Limit Orders</a>
    <a href="wallet.html">Wallet</a>
    <a href="traders.html">Traders</a>
    <a href="alerts.html">Watchlist &amp; Alerts</a>
    <a href="leaderboard.html" data-i18n="nav_leaderboard">Leaderboard</a>
    <a href="about.html" data-i18n="nav_about">About</a>
    <a href="support.html">Support</a>
    <a href="#" id="logoutNavLink">Log Out</a>
    <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.1);">
      <select id="langSelect" style="width: 100%; padding: 6px; border-radius: 6px;"></select>
    </div>
  `;

  document.getElementById('logoutNavLink').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  });

  if (typeof initLanguageSwitcher === 'function') {
    initLanguageSwitcher();
  }
  if (typeof applyTranslations === 'function' && localStorage.getItem('siteLang')) {
    applyTranslations(localStorage.getItem('siteLang'));
  }
}

// ---- Pop-ups shown on every page (price alerts and limit orders) ----
function escHtmlNav(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function navFmtPrice(n) {
  const v = Number(n) || 0;
  if (v >= 1) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + v.toFixed(5);
}

function navFmtQty(q) {
  const v = Number(q) || 0;
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

function injectToastStyles() {
  if (document.getElementById('alertToastStyles')) return;
  const style = document.createElement('style');
  style.id = 'alertToastStyles';
  style.textContent = `
    #alertToastWrap { position: fixed; top: 14px; right: 14px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; max-width: min(360px, calc(100vw - 28px)); }
    .alert-toast { background: #0f1626; color: #eae6d9; border: 1px solid #d4af37; border-radius: 12px; padding: 14px 40px 14px 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.45); font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; position: relative; }
    .alert-toast b { color: #d4af37; }
    .alert-toast a { color: #d4af37; font-weight: 700; text-decoration: underline; }
    .alert-toast .x { position: absolute; top: 8px; right: 10px; background: none; border: none; color: #8f9ab3; font-size: 20px; cursor: pointer; line-height: 1; padding: 0; }
  `;
  document.head.appendChild(style);
}

function showToastHtml(html) {
  injectToastStyles();
  let wrap = document.getElementById('alertToastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'alertToastWrap';
    document.body.appendChild(wrap);
  }
  const toast = document.createElement('div');
  toast.className = 'alert-toast';
  toast.innerHTML = html + '<button class="x" aria-label="Dismiss">×</button>';
  toast.querySelector('.x').addEventListener('click', () => toast.remove());
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 25000);
}

function showAlertToast(a) {
  const sym = escHtmlNav(String(a.coin || '').toUpperCase());
  const verb = a.direction === 'above' ? 'rose above' : 'fell below';
  showToastHtml(`<b>🔔 Price alert</b><br>${sym} ${verb} ${navFmtPrice(a.target)} (now ${navFmtPrice(a.triggered_price)}). <a href="alerts.html">View alerts</a>`);
}

function showOrderToast(o) {
  const sym = escHtmlNav(String(o.coin || '').toUpperCase());
  if (o.status === 'filled') {
    const verb = o.side === 'buy' ? 'Bought' : 'Sold';
    showToastHtml(`<b>✅ Limit order filled</b><br>${verb} ${navFmtQty(o.fill_qty)} ${sym} at ${navFmtPrice(o.fill_price)}. <a href="orders.html">View orders</a>`);
  } else {
    showToastHtml(`<b>⚠️ Limit order cancelled</b><br>Your ${escHtmlNav(o.side)} ${sym} order at ${navFmtPrice(o.limit_price)} could not be filled: ${escHtmlNav(o.note || 'unknown reason')}. <a href="orders.html">View orders</a>`);
  }
}

// kind is "alerts" or "orders": fetch what hasn't been shown yet, show it, then mark it as seen
async function pullUnseen(kind, show) {
  const userId = localStorage.getItem('userId');
  if (!userId || !localStorage.getItem('authToken') || document.hidden) return;

  try {
    const res = await fetch(`${NAV_API}/api/data/${userId}/${kind}/unseen`);
    if (!res.ok) return;
    const data = await res.json();
    const list = data[kind] || [];
    if (!list.length) return;

    list.forEach(show);
    await fetch(`${NAV_API}/api/data/${userId}/${kind}/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: list.map(x => x.id) })
    });
  } catch (err) {}
}

function checkNotifications() {
  pullUnseen('alerts', showAlertToast);
  pullUnseen('orders', showOrderToast);
}

let notificationWatcherStarted = false;
function startNotificationWatcher() {
  if (notificationWatcherStarted) return;
  notificationWatcherStarted = true;
  checkNotifications();
  setInterval(checkNotifications, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkNotifications();
  });
}

document.addEventListener('DOMContentLoaded', initNav);

// ---- Floating support widget (WhatsApp + live chat) ----
function injectSupportWidget() {
  if (document.getElementById('supportFloat')) return;

  const WHATSAPP_NUMBER = '15550001234'; // TODO: replace with your real WhatsApp business number (country code + number, no spaces or +)

  const wrap = document.createElement('div');
  wrap.className = 'support-float';
  wrap.id = 'supportFloat';
  wrap.innerHTML = `
    <a class="support-btn whatsapp-btn" href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" title="Chat on WhatsApp">
      <svg viewBox="0 0 32 32" width="26" height="26" fill="white">
        <path d="M16 3C9.373 3 4 8.373 4 15c0 2.485.755 4.79 2.05 6.708L4 29l7.47-1.96A11.93 11.93 0 0 0 16 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 21.8c-1.93 0-3.72-.56-5.24-1.53l-.376-.235-4.43 1.163 1.18-4.32-.246-.394A9.77 9.77 0 0 1 5.8 15c0-5.632 4.568-10.2 10.2-10.2S26.2 9.368 26.2 15 21.632 24.8 16 24.8zm5.62-7.64c-.31-.155-1.828-.902-2.11-1.005-.283-.103-.489-.155-.695.155-.206.31-.797 1.005-.978 1.212-.18.206-.36.232-.67.077-.31-.155-1.31-.483-2.494-1.538-.922-.822-1.544-1.838-1.725-2.148-.18-.31-.02-.478.136-.632.14-.14.31-.36.464-.54.155-.18.206-.31.31-.516.103-.206.052-.387-.026-.542-.077-.155-.695-1.674-.953-2.293-.251-.603-.506-.522-.695-.532-.18-.008-.387-.01-.593-.01a1.14 1.14 0 0 0-.824.387c-.283.31-1.08 1.056-1.08 2.575s1.106 2.988 1.26 3.194c.155.206 2.177 3.325 5.276 4.663.737.318 1.312.508 1.76.65.74.235 1.412.202 1.944.123.593-.089 1.828-.747 2.086-1.468.258-.72.258-1.34.18-1.468-.077-.13-.283-.206-.593-.36z"/>
      </svg>
    </a>
    <button class="support-btn chat-btn" id="tidioOpenBtn" title="Live Chat">💬</button>
  `;
  document.body.appendChild(wrap);

  document.getElementById('tidioOpenBtn').addEventListener('click', () => {
    if (window.tidioChatApi) {
      window.tidioChatApi.open();
    } else {
      alert('Live chat isn\'t connected yet — add your Tidio project code to enable it.');
    }
  });
}

document.addEventListener('DOMContentLoaded', injectSupportWidget);