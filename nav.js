document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('navMenu').classList.toggle('open');
});

if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}