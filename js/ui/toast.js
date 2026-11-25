/**
 * Non-blocking toast stack. Used for quest actions, profile switches and
 * storage warnings. Optional action button powers Undo.
 */

import { el } from './dom.js';

function region() {
  let node = document.getElementById('toast-region');
  if (!node) {
    node = el('div', { id: 'toast-region', class: 'toast-region', 'aria-live': 'polite' });
    document.body.append(node);
  }
  return node;
}

export function showToast(message, {
  tone = 'info',
  duration,
  actionLabel = '',
  onAction = null,
} = {}) {
  const host = region();
  const action = actionLabel
    ? el('button', { class: 'toast__action', type: 'button', text: String(actionLabel) })
    : null;

  const toast = el(
    'div',
    { class: `toast toast--${tone}`, role: 'status' },
    el('span', { class: 'toast__dot', 'aria-hidden': 'true' }),
    el('span', { class: 'toast__text', text: String(message) }),
    action,
  );

  const remove = () => {
    toast.classList.remove('is-in');
    window.setTimeout(() => toast.remove(), 240);
  };

  host.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-in'));

  const life = Number.isFinite(duration) ? duration : action ? 6500 : 3400;
  const timer = window.setTimeout(remove, Math.max(1200, life));

  toast.addEventListener('click', () => {
    window.clearTimeout(timer);
    remove();
  });

  if (action) {
    action.addEventListener('click', (event) => {
      event.stopPropagation();
      window.clearTimeout(timer);
      try {
        if (typeof onAction === 'function') onAction();
      } finally {
        remove();
      }
    });
  }

  return toast;
}
