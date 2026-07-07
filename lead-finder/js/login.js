import { db } from './supabase.js';

const form   = document.getElementById('login-form');
const errEl  = document.getElementById('login-error');
const btn    = document.getElementById('login-btn');

// If already signed in, go straight to dashboard
db.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = './dashboard.html';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = error.message;
    btn.disabled = false;
    btn.textContent = 'Sign In';
    return;
  }

  window.location.href = './dashboard.html';
});
