/**
 * Sticky Top RPG HUD: avatar + level ring, identity, XP, real-life HP, gold.
 * Rebuilt from a profile snapshot on every store change.
 */

import { el, img, progressBar } from './dom.js';
import { profileView } from '../core/profile.js';
import { formatNumber } from '../core/formulas.js';

const SHIELD_BUFFER_PILL_MS = 5000;
let shieldBufferSignature = null;
let shieldBufferHideAt = 0;

function avatar(view) {
  const inner = view.avatar
    ? img(view.avatar, '', 'avatar__img')
    : el('span', { class: 'avatar__initials', text: view.initials, 'aria-hidden': 'true' });

  return el(
    'span',
    {
      class: 'avatar',
      style: { '--ring': `${view.percent}%` },
      'aria-hidden': 'true',
    },
    el('span', { class: 'avatar__disc' }, inner),
    el('span', { class: 'avatar__level', text: `Lv ${view.level}` }),
  );
}

function statusBadge(hp) {
  return el(
    'span',
    {
      class: 'status',
      dataset: { state: hp.key },
      title: `${hp.label} · ${hp.current} / ${hp.max} Lifespan HP`,
    },
    el('span', { class: 'status__emoji', text: hp.emoji, 'aria-hidden': 'true' }),
    el('span', { text: hp.label }),
  );
}

function shieldSublabel(hp) {
  const text = hp.negVitalityBuffer > 0
    ? `−${hp.negVitalityBuffer}/${hp.shieldLossXP} XP`
    : hp.posVitalityBuffer > 0
      ? `+${hp.posVitalityBuffer}/${hp.shieldGainXP} XP`
      : '';

  if (!text) {
    shieldBufferSignature = 'idle';
    return el('span', { class: 'bar-head__right', text: 'Ready' });
  }

  const signature = `${hp.posVitalityBuffer}:${hp.negVitalityBuffer}:${hp.shieldGainXP}:${hp.shieldLossXP}`;
  const now = Date.now();
  if (signature !== shieldBufferSignature) {
    shieldBufferSignature = signature;
    shieldBufferHideAt = now + SHIELD_BUFFER_PILL_MS;
  }

  const pill = el('span', {
    class: 'bar-head__right shield-buffer-pill',
    text,
    'aria-live': 'polite',
  });
  const remaining = shieldBufferHideAt - now;
  if (remaining <= 0) {
    pill.classList.add('is-hidden');
  } else {
    globalThis.setTimeout(() => pill.classList.add('is-hidden'), remaining);
  }
  return pill;
}

function shieldTitle(hp) {
  return [
    `Vitality Shield ${hp.shield} / ${hp.shieldMax}.`,
    `+1 Shield per ${hp.shieldGainXP} Vitality XP gained, −1 per ${hp.shieldLossXP} lost.`,
    `A full Shield converts into +1 Lifespan HP.`,
    `Lifespan bonus: ${hp.bonus >= 0 ? '+' : ''}${hp.bonus} HP.`,
  ].join(' ');
}

export function renderHUD(profile) {
  const view = profileView(profile);

  return el(
    'div',
    { class: 'hud__inner' },
    el(
      'div',
      { class: 'hud__top' },
        el(
          'button',
          {
            class: 'hud__profile',
            type: 'button',
            'data-action': 'open-profiles',
            'aria-label': `Switch profile. Current: ${view.name}, level ${view.level}.`,
          },
          avatar(view),
          el(
            'span',
            { class: 'hud__identity' },
            el('span', { class: 'hud__name', text: view.name }),
            el(
              'span',
              { class: 'hud__title' },
              el('span', { class: 'hud__title-text', text: view.title }),
              el('span', { class: 'hud__chevron', text: '⌄', 'aria-hidden': 'true' }),
            ),
          ),
        ),
        el(
          'button',
          {
            class: 'gold-pill',
            type: 'button',
            'data-action': 'go-shop',
            'aria-label': `${formatNumber(view.gold)} Gold Coins. Open the rewards shop.`,
          },
          el('span', { class: 'gold-pill__coin coin-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'gold-pill__value', text: formatNumber(view.gold) }),
        ),
      ),
      el(
        'div',
        { class: 'hud__bars' },
        el(
          'div',
          { class: 'bar-block' },
          el(
            'div',
            { class: 'bar-head' },
            el('span', { class: 'bar-head__label', text: 'XP' }),
            el('span', {
              class: 'bar-head__value',
              text: `${formatNumber(view.xp)} / ${formatNumber(view.nextLevelXP)}`,
            }),
            el('span', { class: 'bar-head__right', text: `${view.percent}%` }),
          ),
          progressBar(view.percent, { tone: 'xp', label: `${view.percent}% to level ${view.level + 1}` }),
        ),
        el(
          'div',
          { class: 'bar-block bar-block--shield', title: shieldTitle(view.hp) },
          el(
            'div',
            { class: 'bar-head' },
            el('span', { class: 'bar-head__label', text: 'Shield' }),
            el('span', {
              class: 'bar-head__value',
              text: `${formatNumber(view.hp.shield)} / ${formatNumber(view.hp.shieldMax)}`,
            }),
            shieldSublabel(view.hp),
          ),
          progressBar(view.hp.shieldPercent, {
            tone: 'shield',
            label: `Vitality Shield ${view.hp.shield} of ${view.hp.shieldMax}`,
          }),
        ),
        el(
          'div',
          { class: 'bar-block bar-block--hp', dataset: { state: view.hp.key } },
          el(
            'div',
            { class: 'bar-head' },
            el('span', { class: 'bar-head__label', text: 'Lifespan' }),
            el('span', {
              class: 'bar-head__value',
              text: `${formatNumber(view.hp.current)} / ${formatNumber(view.hp.max)} · ${view.hp.percentLabel} Left`,
            }),
            statusBadge(view.hp),
          ),
          progressBar(view.hp.percent, {
            tone: `hp-${view.hp.key}`,
            label: `${view.hp.label}: ${view.hp.current} of ${view.hp.max} Lifespan HP (${view.hp.percentLabel})`,
          }),
        ),
      ),
    );
}
