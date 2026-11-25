/**
 * The Game of Life V2 — animated celebration banner (M4).
 *
 * One full-screen, dismissible RPG banner for missions, goals and level-ups.
 * The markup is built with the same tiny DOM helper as the rest of the shell.
 * Confetti is skipped entirely when the user prefers reduced motion.
 */

import { el } from './dom.js';
import {
  CHARACTER_BASE,
  formatNumber,
  levelFromXP,
} from '../core/formulas.js';
import { characterTitleName } from '../core/titles.js';

/** Mission/Goal completions always celebrate; other actions only on level-up. */
export function shouldCelebrate({ kind = 'level', leveledUp = false } = {}, settings = {}) {
  if (settings?.celebrationBanner === false) return false;
  return kind === 'mission' || kind === 'goal' || Boolean(leveledUp);
}

/**
 * Pure presentation model, also used by the parity suite.
 * `profile` must be the post-action profile snapshot.
 */
export function buildCelebrationModel({
  kind = 'mission',
  name = '',
  profile = null,
  result = {},
} = {}) {
  const level = Number.isFinite(Number(result?.levelAfter))
    ? Number(result.levelAfter)
    : levelFromXP(profile?.character?.xp, CHARACTER_BASE);
  const rank = characterTitleName(level, profile?.titles);
  const xp = Math.max(0, Math.floor(Number(result?.xp) || 0));
  const coins = Math.max(0, Math.floor(Number(result?.coins) || 0));
  const rewards = [];

  if (kind === 'mission' || kind === 'goal') {
    rewards.push(`+${formatNumber(xp)} Character XP`);
    rewards.push(`+${formatNumber(coins)} Gold Coins`);
  } else {
    if (xp) rewards.push(`+${formatNumber(xp)} Character XP`);
    if (coins) rewards.push(`+${formatNumber(coins)} Gold Coins`);
  }

  const eyebrow = kind === 'goal'
    ? 'Goal achieved'
    : kind === 'level'
      ? 'Level up'
      : 'Mission complete';
  const title = kind === 'level'
    ? `Level ${level} reached`
    : String(name || (kind === 'goal' ? 'Goal achieved' : 'Mission complete'));

  let note = 'Your real-life effort moved the story forward.';
  if (kind === 'mission') {
    note = result?.goal
      ? `${result.goal.name} is now ${Math.round((Number(result.goalProgress) || 0) * 100)}% complete.`
      : 'Mission added to your roadmap. Goal progress updated automatically.';
  } else if (kind === 'goal') {
    note = 'Every linked mission is complete. This milestone is secured.';
  } else if (result?.leveledUp) {
    note = 'Your lifetime XP crossed the next threshold.';
  }

  return {
    kind,
    eyebrow,
    title,
    rank,
    level,
    rewards,
    note,
    isLevelUp: Boolean(result?.leveledUp),
  };
}

function reducedMotion(profile) {
  if (profile?.settings?.reducedMotion === true) return true;
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function confettiLayer() {
  const layer = el('div', { class: 'celebration__confetti', 'aria-hidden': 'true' });
  const colors = ['#e6c27a', '#ffe6ad', '#9fe7bd', '#8db9ff', '#f0a196', '#d6a94f'];

  for (let index = 0; index < 36; index += 1) {
    const piece = el('span', {
      class: `celebration__piece${index % 3 === 0 ? ' celebration__piece--round' : ''}`,
    });
    piece.style.setProperty('--x', `${(index * 37 + 11) % 100}%`);
    piece.style.setProperty('--delay', `${(index % 9) * 0.11}s`);
    piece.style.setProperty('--duration', `${2.1 + (index % 5) * 0.32}s`);
    piece.style.setProperty('--drift', `${index % 2 === 0 ? 40 : -40}px`);
    piece.style.setProperty('--spin', `${index % 2 === 0 ? 1 : -1}${420 + (index % 6) * 55}deg`);
    piece.style.background = colors[index % colors.length];
    layer.append(piece);
  }

  return layer;
}

/**
 * Open the banner. Returns the root element, or null when suppressed.
 * Dismissal: Continue button, backdrop click, or Escape.
 */
export function showCelebration({
  kind = 'mission',
  name = '',
  profile = null,
  result = {},
  onDismiss = null,
} = {}) {
  if (!shouldCelebrate({ kind, leveledUp: result?.leveledUp }, profile?.settings)) return null;

  document.querySelector('[data-celebration]')?.remove();

  const model = buildCelebrationModel({ kind, name, profile, result });
  const previousFocus = document.activeElement;
  const reduced = reducedMotion(profile);

  const backdrop = el('div', { class: 'celebration__backdrop', dataset: { celebrationDismiss: '' } });
  const closeButton = el(
    'button',
    { class: 'btn btn--gold celebration__close', type: 'button', dataset: { celebrationDismiss: '' } },
    'Continue',
  );

  const root = el(
    'div',
    {
      class: `celebration${reduced ? ' celebration--reduced' : ''}`,
      dataset: { celebration: '', kind },
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'celebration-title',
      'aria-describedby': 'celebration-note',
    },
    backdrop,
    reduced ? null : confettiLayer(),
    el(
      'div',
      { class: 'celebration__card' },
      el('p', { class: 'celebration__eyebrow', text: model.eyebrow }),
      el('div', { class: 'celebration__seal', text: kind === 'goal' ? '🏔️' : kind === 'level' ? '🌟' : '⚔️', 'aria-hidden': 'true' }),
      el('h2', { class: 'celebration__title', id: 'celebration-title', text: model.title }),
      el(
        'p',
        { class: 'celebration__rank' },
        el('span', { class: 'celebration__rank-title', text: model.rank }),
        el('span', { class: 'celebration__rank-dot', text: '·', 'aria-hidden': 'true' }),
        el('span', { text: `Level ${model.level}` }),
      ),
      model.rewards.length
        ? el(
            'div',
            { class: 'celebration__rewards' },
            model.rewards.map((reward) => el('span', { class: 'celebration__reward', text: reward })),
          )
        : null,
      el('p', { class: 'celebration__note', id: 'celebration-note', text: model.note }),
      closeButton,
    ),
  );

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    root.classList.add('is-closing');
    window.setTimeout(() => root.remove(), 200);
    try {
      if (typeof onDismiss === 'function') onDismiss();
      previousFocus?.focus?.({ preventScroll: true });
    } catch {
      // Focus restoration is best-effort.
    }
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-celebration-dismiss]')) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.append(root);
  requestAnimationFrame(() => {
    root.classList.add('is-in');
    closeButton.focus({ preventScroll: true });
  });

  return root;
}
