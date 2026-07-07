import { db } from './supabase.js';

/**
 * Call at the top of every protected page.
 * Redirects to login if no active session; returns the session object if authenticated.
 */
export async function requireAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = './index.html';
    return null;
  }
  return session;
}

/** Render the current user's email into any element with data-user-email attribute. */
export function renderUserEmail(session) {
  for (const el of document.querySelectorAll('[data-user-email]')) {
    el.textContent = session?.user?.email ?? '';
  }
}

export async function logout() {
  await db.auth.signOut();
  window.location.href = './index.html';
}
