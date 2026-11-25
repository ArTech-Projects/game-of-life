/**
 * Shared screen building blocks for the M2 shell.
 * These are presentation-only; gameplay lands in M3–M6.
 */

import { el, img, progressBar } from '../ui/dom.js';
import { CURRENCIES, formatNumber, normalizeCurrency } from '../core/formulas.js';

export function screenShell({ id, eyebrow, title, description, milestone, actions = null, children = [] }) {
  return el(
    'section',
    { class: 'screen', id: `screen-${id}`, 'aria-labelledby': `screen-${id}-title` },
    el(
      'div',
      { class: 'hero' },
      el(
        'div',
        { class: 'hero__top' },
        el('p', { class: 'hero__eyebrow', text: eyebrow }),
        actions ?? (milestone ? el('span', { class: 'milestone', text: `Arrives in ${milestone}` }) : null),
      ),
      el('h1', { class: 'hero__title', id: `screen-${id}-title`, text: title }),
      el('p', { class: 'hero__desc', text: description }),
    ),
    ...children,
  );
}

/** Currency picker shared by Finance and Settings. */
export function currencySelect({ value = 'PHP', id = 'currency-select' } = {}) {
  const current = normalizeCurrency(value);
  return el(
    'select',
    {
      class: 'select',
      id,
      'data-role': 'currency-select',
      'aria-label': 'Display currency',
    },
    CURRENCIES.map((currency) =>
      el(
        'option',
        {
          value: currency.code,
          selected: currency.code === current ? true : null,
          title: currency.name,
        },
        `${currency.code} ${currency.symbol}`,
      ),
    ),
  );
}

export function panel({ title, meta, className = '', children = [] }) {
  return el(
    'section',
    { class: `panel ${className}`.trim() },
    title
      ? el(
          'div',
          { class: 'panel__head' },
          el('h2', { class: 'panel__title', text: title }),
          meta ? el('span', { class: 'panel__meta', text: meta }) : null,
        )
      : null,
    ...children,
  );
}

export function statTile({
  icon,
  iconContent = null,
  label,
  value,
  hint,
  tone = 'gold',
  action = null,
  attrs = {},
}) {
  const props = {
    class: `tile tile--${tone}`,
    ...(action ? { 'data-action': action } : {}),
    ...attrs,
  };
  const tag = action ? 'button' : 'div';
  if (action) {
    props.type = 'button';
    props.class = `${props.class} tile--action`;
  }
  return el(
    tag,
    props,
    el(
      'span',
      { class: 'tile__icon', 'aria-hidden': 'true' },
      iconContent ?? (icon != null ? String(icon) : ''),
    ),
    el('span', { class: 'tile__value', text: value }),
    el('span', { class: 'tile__label', text: label }),
    hint ? el('span', { class: 'tile__hint', text: hint }) : null,
  );
}

/** Label + input field used by the M5 finance sheet. */
export function formField({
  label,
  name,
  type = 'text',
  value = '',
  required = false,
  step = null,
  min = null,
  max = null,
  placeholder = '',
  hint = '',
  autocomplete = 'off',
}) {
  const id = `field-${name}`;
  const control = el('input', {
    id,
    name,
    type,
    value: value ?? '',
    required: required ? true : null,
    step,
    min,
    max,
    placeholder,
    autocomplete,
    inputmode: type === 'number' ? 'decimal' : null,
  });

  return el(
    'label',
    { class: 'field', for: id },
    el('span', { class: 'field__label', text: label }),
    control,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

export function featureList(items) {
  return el(
    'ul',
    { class: 'feature-list' },
    items.map((item) =>
      el(
        'li',
        { class: 'feature-list__item' },
        el('span', { class: 'feature-list__mark', text: '◆', 'aria-hidden': 'true' }),
        el('span', {}, item),
      ),
    ),
  );
}

export function questRow({ icon, emoji, name, meta, reward, badge }) {
  const iconNode = icon
    ? img(icon, '', 'row__img')
    : el('span', { class: 'row__emoji', text: emoji ?? '✦', 'aria-hidden': 'true' });

  return el(
    'div',
    { class: 'row' },
    el('span', { class: 'row__icon' }, iconNode),
    el(
      'span',
      { class: 'row__body' },
      el('span', { class: 'row__name', text: name }),
      meta ? el('span', { class: 'row__meta', text: meta }) : null,
    ),
    reward ? el('span', { class: 'row__reward', text: reward }) : null,
    badge ? el('span', { class: 'chip chip--muted', text: badge }) : null,
  );
}

export function miniProgress({ label, value, percent, tone = 'gold', right }) {
  return el(
    'div',
    { class: 'mini-progress' },
    el(
      'div',
      { class: 'mini-progress__head' },
      el('span', { class: 'mini-progress__label', text: label }),
      el('span', { class: 'mini-progress__right', text: right ?? value }),
    ),
    progressBar(percent, { tone }),
    value ? el('span', { class: 'mini-progress__value', text: value }) : null,
  );
}

export function moneyRow({ label, value, tone = '' }) {
  return el(
    'div',
    { class: `money-row ${tone}`.trim() },
    el('span', { class: 'money-row__label', text: label }),
    el('span', { class: 'money-row__value', text: value }),
  );
}

/**
 * Inline amount plus a minted-gold coin, replacing plain “G” labels.
 * The number comes first so the shared inline baseline stays level with the
 * surrounding reward text; the coin emblem trails it (`+10 ◎`).
 */
export function goldAmount(amount, { sign = '', className = '' } = {}) {
  return el(
    'span',
    { class: `gold-amount ${className}`.trim() },
    el('span', { class: 'gold-amount__value', text: `${sign}${formatNumber(amount)}` }),
    el('span', { class: 'coin-emblem coin-emblem--inline', 'aria-hidden': 'true' }),
  );
}

/** Join text strings and DOM nodes with a readable inline separator. */
export function inlineList(parts, separator = ' · ') {
  const nodes = [];
  parts.filter((part) => part !== null && part !== undefined && part !== '').forEach((part, index) => {
    if (index > 0) nodes.push(separator);
    nodes.push(part);
  });
  return el('span', { class: 'inline-list' }, ...nodes);
}

/** Panel toolbar for M6 "+ Add" actions. */
export function panelToolbar(...children) {
  return el('div', { class: 'panel__toolbar' }, ...children);
}

/** Add button wired to the shared M6 CRUD sheet. */
export function crudAddButton(type, label = 'Add') {
  return el('button', {
    class: 'btn btn--sm btn--primary',
    type: 'button',
    'data-action': 'open-crud-add',
    'data-crud-type': type,
    text: `＋ ${label}`,
  });
}

/**
 * Compact ⋮ popover that replaces the inline Edit / Delete pair on cards.
 * Emits the same `open-crud-edit` / `delete-crud` actions, so the shared M6
 * CRUD sheet and delete confirmation are unchanged.
 */
export function crudMenu(type, id, name = '', { className = '' } = {}) {
  return el(
    'span',
    { class: `crud-menu ${className}`.trim(), dataset: { crudMenu: '' } },
    el('button', {
      class: 'btn btn--ghost btn--sm crud-menu__toggle',
      type: 'button',
      'data-action': 'toggle-crud-menu',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-label': `Actions for ${name || 'item'}`,
      text: '⋮',
    }),
    el(
      'span',
      { class: 'crud-menu__pop', role: 'menu', hidden: true },
      el('button', {
        class: 'crud-menu__item',
        type: 'button',
        role: 'menuitem',
        'data-action': 'open-crud-edit',
        'data-crud-type': type,
        'data-crud-id': id,
        text: 'Edit',
      }),
      el('button', {
        class: 'crud-menu__item crud-menu__item--danger',
        type: 'button',
        role: 'menuitem',
        'data-action': 'delete-crud',
        'data-crud-type': type,
        'data-crud-id': id,
        'data-crud-name': name,
        text: 'Delete',
      }),
    ),
  );
}

/** Compact Edit / Delete pair wired to the shared M6 CRUD sheet. */
export function crudActions(type, id, name = '') {
  return el(
    'span',
    { class: 'crud-actions' },
    el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      'data-action': 'open-crud-edit',
      'data-crud-type': type,
      'data-crud-id': id,
      text: 'Edit',
    }),
    el('button', {
      class: 'btn btn--ghost btn--sm btn--danger-text',
      type: 'button',
      'data-action': 'delete-crud',
      'data-crud-type': type,
      'data-crud-id': id,
      'data-crud-name': name,
      text: 'Delete',
    }),
  );
}

export function percent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.floor((value / total) * 100)));
}

export function xpLabel(xp, next) {
  return `${formatNumber(xp)} / ${formatNumber(next)} XP`;
}
