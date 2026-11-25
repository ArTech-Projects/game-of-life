/**
 * Rewards Shop — M5 interactive catalogue.
 *
 * All 13 seed rewards, Gold prices, purchase counters, a purchase ledger and
 * undo. Two rewards grant special tokens: a no-penalty daily-quest skip and a
 * rest-day protection flag for the current local day.
 */

import { el, img } from '../ui/dom.js';
import { currencySymbol, formatNumber, localDateKey, normalizeCurrency } from '../core/formulas.js';
import { isRestDayReward, isSkipTokenReward } from '../core/economy.js';
import { screenShell, panel, statTile, crudMenu, crudAddButton, panelToolbar, goldAmount } from './shared.js';

function rewardTag(reward) {
  if (isSkipTokenReward(reward)) return 'Skip token';
  if (isRestDayReward(reward)) return 'Rest day';
  return '';
}

function rewardCard(reward, gold) {
  const affordable = gold >= reward.price;
  const tag = rewardTag(reward);
  const redeemed = Math.max(0, Math.floor(Number(reward.purchaseCount) || 0));
  return el(
    'div',
    { class: 'reward-card', 'data-reward-id': reward.id },
    el('span', { class: 'reward-card__emblem' }, img(reward.icon, 'reward-card__img')),
    el(
      'span',
      { class: 'reward-card__body' },
      el(
        'span',
        { class: 'reward-card__title-row' },
        el('span', { class: 'reward-card__name', text: reward.name }),
        el('span', {
          class: `reward-card__badge${redeemed > 0 ? ' is-redeemed' : ''}`.trim(),
          text: `Redeemed ${formatNumber(redeemed)}x`,
        }),
      ),
      tag ? el('span', { class: 'reward-card__tag', text: tag }) : null,
    ),
    el(
      'span',
      { class: 'reward-card__buy' },
      el('span', {
        class: `reward-card__price${affordable ? ' is-affordable' : ''}`.trim(),
      }, goldAmount(reward.price, { className: 'gold-amount--price' })),
      el('button', {
        class: `btn btn--sm reward-card__redeem ${affordable ? 'btn--primary' : 'btn--ghost'}`,
        type: 'button',
        'data-action': 'purchase-reward',
        disabled: !affordable,
        title: affordable ? `Redeem ${reward.name}` : `Needs ${formatNumber(reward.price - gold)} more Gold`,
        text: 'Redeem',
      }),
    ),
    crudMenu('reward', reward.id, reward.name, { className: 'crud-menu--card' }),
  );
}

function passChip({ icon, label, value, hint, active = false }) {
  return el(
    'div',
    { class: `pass-chip${active ? ' is-active' : ''}` },
    el('span', { class: 'pass-chip__icon', 'aria-hidden': 'true', text: icon }),
    el(
      'span',
      { class: 'pass-chip__body' },
      el('span', { class: 'pass-chip__label', text: label }),
      el('strong', { class: 'pass-chip__value', text: value }),
      hint ? el('span', { class: 'pass-chip__hint', text: hint }) : null,
    ),
  );
}

function ledgerRow(entry) {
  return el(
    'div',
    { class: 'row purchase-row', 'data-purchase-id': entry.id },
    el(
      'span',
      { class: 'row__body' },
      el('span', { class: 'row__name', text: entry.rewardName }),
      el('span', {
        class: 'row__meta',
        text: new Date(entry.timestamp).toLocaleString('en-PH'),
      }),
    ),
    el('span', { class: 'price' }, goldAmount(entry.price, { sign: '−' })),
    el('button', {
      class: 'btn btn--sm',
      type: 'button',
      'data-action': 'undo-purchase',
      'data-purchase-id': entry.id,
      text: 'Undo',
    }),
  );
}

export function renderShop({ profile }) {
  const currency = normalizeCurrency(profile.finance?.currency);
  const symbol = currencySymbol(currency);
  const rewards = (profile.rewards ?? [])
    .filter((reward) => reward.active !== false)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const gold = Math.max(0, Math.floor(Number(profile.character?.gold) || 0));
  const totalPrice = rewards.reduce((sum, reward) => sum + Number(reward.price || 0), 0);
  const affordable = rewards.filter((reward) => reward.price <= gold).length;
  const ledger = (profile.ledger ?? []).filter((entry) => entry.type === 'purchase');
  const purchased = rewards.reduce((sum, reward) => sum + Number(reward.purchaseCount || 0), 0);
  const tokens = profile.tokens ?? {};
  const today = localDateKey(new Date());
  const restDayActive = tokens.restDay === today;
  const skipPasses = Math.max(0, Math.floor(Number(tokens.skipQuest) || 0));

  return screenShell({
    id: 'shop',
    eyebrow: 'Spend your Gold',
    title: 'Rewards Shop',
    description:
      'Turn effort into real-life rewards. Buy with Gold, undo any purchase, and redeem skip tokens or a protected rest day.',
    children: [
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          iconContent: el('span', { class: 'coin-emblem' }),
          label: 'Gold available',
          value: formatNumber(gold),
          hint: 'Base Gold + Wealth Coins',
        }),
        statTile({
          icon: '🛍️',
          label: 'Rewards',
          value: String(rewards.length),
          hint: `Vault total ${formatNumber(totalPrice)} Gold`,
        }),
        statTile({
          icon: '✨',
          label: 'Affordable now',
          value: String(affordable),
          hint: `${formatNumber(purchased)} lifetime purchases`,
          tone: 'muted',
        }),
      ),
      panel({
        title: 'Active Passes & Buffs',
        meta: 'Pass inventory',
        className: 'panel--passes',
        children: [
          el(
            'div',
            { class: 'passes-bar' },
            passChip({
              icon: '🎟️',
              label: 'Skip Passes',
              value: `${formatNumber(skipPasses)} ready`,
              hint: 'No-penalty quest skips',
              active: skipPasses > 0,
            }),
            passChip({
              icon: '🛌',
              label: 'Rest Day',
              value: restDayActive ? 'Active today' : 'Inactive',
              hint: restDayActive ? 'No penalties today' : 'Buy Reset Day to activate',
              active: restDayActive,
            }),
          ),
        ],
      }),
      panel({
        title: 'Reward Vault',
        meta: `${rewards.length} active rewards`,
        children: [
          panelToolbar(crudAddButton('reward', 'Forge Reward')),
          ...(rewards.length
            ? rewards.map((reward) => rewardCard(reward, gold))
            : [el('p', { class: 'panel__copy', text: 'The vault is empty. Forge a reward with the button above.' })]),
        ],
      }),
      panel({
        title: 'Purchase history',
        meta: `${ledger.length} ledger ${ledger.length === 1 ? 'entry' : 'entries'}`,
        children: ledger.length
          ? [...ledger].reverse().map(ledgerRow)
          : [el('p', { class: 'panel__copy', text: 'No purchases yet. Your first reward will appear here with an Undo button.' })],
      }),
      panel({
        title: 'How Gold works',
        meta: 'Permanent rule',
        children: [
          el('p', {
            class: 'panel__copy',
            text: 'Gold = earned Gold + Wealth Coins. Completing quests, missions, and goals awards their configured Gold rewards, and the wealth share is never counted twice.',
          }),
          el('div', { class: 'chip-row' }, [
            el('span', { class: 'chip chip--muted', text: `Wealth coins +1 / ${symbol}500` }),
          ]),
        ],
      }),
    ],
  });
}
