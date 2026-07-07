import { requireAuth, renderUserEmail, logout } from './auth.js';

const session = await requireAuth();
if (!session) throw new Error('unauthenticated');
renderUserEmail(session);
document.getElementById('logout-btn').addEventListener('click', logout);
