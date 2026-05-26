import { getAllUsers } from '../db/users.js'
import { hashPin }     from '../../shared/auth-utils.js'

export async function renderLogin(container, state, navigate) {
  const users = getAllUsers().filter(u => u.active !== 0);

  container.innerHTML = `
    <div class="screen screen-login" style="display:flex; align-items:center; justify-content:center; height:100vh; background:#f3f4f6;">
      <div class="form-card" style="width:100%; max-width:400px; padding:40px; text-align:center;">
        <h1 style="color:#76B214; margin-bottom:10px;">MasterDB</h1>
        <p style="color:#666; margin-bottom:30px;">Office Administration Portal</p>

        <div class="form-group" style="text-align:left;">
          <label>Select User</label>
          <select id="user-select" class="search-input" style="width:100%; margin-bottom:20px;">
            <option value="">-- Select --</option>
            ${users.map(u => `<option value="${u.user_id}">${esc(u.name)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="text-align:left;">
          <label>PIN</label>
          <input id="user-pin" type="password" maxlength="4" placeholder="0 0 0 0" 
                 style="width:100%; text-align:center; letter-spacing:10px; font-size:20px;" />
        </div>

        <button class="btn btn-primary btn-block" id="btn-login" style="margin-top:20px;">Login</button>
        <div id="login-error" class="alert alert-error hidden" style="margin-top:20px;"></div>
      </div>
    </div>
  `;

  const errorEl = container.querySelector('#login-error');

  container.querySelector('#btn-login').onclick = async () => {
    const userId = container.querySelector('#user-select').value;
    const pin = container.querySelector('#user-pin').value;

    if (!userId || pin.length < 4) {
      errorEl.textContent = "Selection and 4-digit PIN required.";
      errorEl.classList.remove('hidden');
      return;
    }

    const user = users.find(u => u.user_id === userId);
    const inputHash = await hashPin(pin, userId);

    if (user && user.pin_hash === inputHash) {
      state.user = user;
      localStorage.setItem('masterdb_user_id', userId); // Persist session
      navigate('dashboard');
    } else {
      errorEl.textContent = "Invalid PIN.";
      errorEl.classList.remove('hidden');
    }
  };
}

function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }