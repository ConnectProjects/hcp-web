let container;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a brief notification toast.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration  ms before auto-dismiss
 */
export function showToast(message, type = 'success', duration = 3000) {
  const c = getContainer();
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = message;
  c.appendChild(t);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => t.classList.add('toast--visible'));

  setTimeout(() => {
    t.classList.remove('toast--visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, duration);
}
