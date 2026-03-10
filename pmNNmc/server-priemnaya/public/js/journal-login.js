const API_URL = 'http://192.168.101.25:14000/api/journal';

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('journal_token');
  if (token) {
    window.location.href = 'journal.html';
    return;
  }

  const form = document.getElementById('journal-login-form');
  form.addEventListener('submit', handleLogin);
});

async function handleLogin(event) {
  event.preventDefault();
  const login = document.getElementById('login').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!login || !password) {
    errorEl.textContent = 'Введите логин и пароль';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка входа');

    localStorage.setItem('journal_token', data.token);
    localStorage.setItem('journal_user', JSON.stringify(data.user));
    window.location.href = 'journal.html';
  } catch (err) {
    errorEl.textContent = err.message;
  }
}