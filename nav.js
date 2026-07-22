document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('navMenu').classList.toggle('open');
});

if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}

// ---- Show login/signup or logout depending on auth state ----
function renderAuthLink() {
  const slot = document.getElementById('authSlot');
  if (!slot) return;

  const userId = localStorage.getItem('userId');
  const username = localStorage.getItem('username');

  if (userId) {
    slot.innerHTML = `
      <a href="wallet.html">Wallet</a>
      <a href="#" id="logoutLink">Log Out (${username})</a>
    `;
    document.getElementById('logoutLink').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      window.location.href = 'login.html';
    });
  } else {
    slot.innerHTML = `<a href="login.html">Log In / Sign Up</a>`;
  }
}

renderAuthLink();