/**
 * Finance — M5 interactive Finance screen.
 *
 * Displays every verified total and lets the player add, edit or delete
 * income, expense, asset and savings rows directly on the tab. Every change
 * flows through the store, which re-syncs Wealth XP/Coins and Gold.
 */

import { el } from '../ui/dom.js';
import {
  computeFinanceTotals,
  currencySymbol,
  formatMoney,
  formatNumber,
  localDateKey,
  normalizeCurrency,
  wealthCoinsFor,
  wealthXPFor,
} from '../core/formulas.js';
import {
  buildFinancePlan,
  ensureFinanceView,
  FINANCE_PERIOD_OPTIONS,
  FINANCE_SORT_OPTIONS,
} from '../core/economy.js';
import { screenShell, panel, moneyRow, statTile, formField, currencySelect } from './shared.js';

const SECTIONS = Object.freeze([
  { type: 'income', listKey: 'incomes', label: 'Income', emoji: '💵', empty: 'No income rows yet.' },
  { type: 'expense', listKey: 'expenses', label: 'Expenses', emoji: '🧾', empty: 'No expense rows yet.' },
  { type: 'asset', listKey: 'assets', label: 'Assets', emoji: '📈', empty: 'No assets yet.' },
  { type: 'savings', listKey: 'savings', label: 'Savings', emoji: '💳', empty: 'No savings accounts yet.' },
]);

const PERIODS = FINANCE_PERIOD_OPTIONS;
const SORTS = FINANCE_SORT_OPTIONS;

/** Collapsed lists show 3 entries; expanded lists scroll at ~5 rows. */
const COMPACT_LIMIT = 3;

export const financeView = { period: 'all', category: 'all', sort: 'newest', month: '', year: '' };
const expandedSections = new Set();
let lastFinanceProfile = null;

export function setFinanceFilter(key, value) {
  if (key === 'period' && PERIODS.some((entry) => entry.value === value)) {
    financeView.period = value;
    financeView.category = 'all';
  }
  if (key === 'sort' && SORTS.some((entry) => entry.value === value)) financeView.sort = value;
  if (key === 'category') financeView.category = value || 'all';
  if (key === 'month' && /^\d{4}-\d{2}$/.test(String(value ?? ''))) {
    financeView.month = value;
    financeView.category = 'all';
  }
  if (key === 'year' && /^\d{4}$/.test(String(value ?? ''))) {
    financeView.year = value;
    financeView.category = 'all';
  }
  return financeView;
}

export function toggleFinanceSection(type) {
  if (expandedSections.has(type)) expandedSections.delete(type);
  else expandedSections.add(type);
  return expandedSections.has(type);
}

export function isFinanceSectionExpanded(type) {
  return expandedSections.has(type);
}

/**
 * Apply Period / Category / Sort and the 3-row collapse from the **full**
 * stored finance collections. Nodes are only reordered and hidden — never
 * removed — so no entry can permanently disappear after filtering.
 */
export function applyFinanceFilters(root = document, now = new Date()) {
  if (!root?.querySelectorAll) return;

  const profile = lastFinanceProfile;
  const finance = profile?.finance ?? null;
  const plan = finance
    ? buildFinancePlan(finance, financeView, { now, expanded: expandedSections })
    : buildPlanFromDom(root, now);

  for (const section of root.querySelectorAll('[data-finance-section]')) {
    const type = section.dataset.financeSection;
    const planSection = plan.sections?.[type];
    if (!planSection) continue;

    const list = section.querySelector('.money-list');
    const items = list ? [...list.querySelectorAll('.money-item')] : [];
    const byId = new Map(items.map((item) => [String(item.dataset.id ?? ''), item]));
    const ordered = planSection.rows
      .map((row) => byId.get(String(row.id ?? '')))
      .filter(Boolean);
    const orderedSet = new Set(ordered);
    const remainder = items.filter((item) => !orderedSet.has(item));

    if (list) {
      for (const item of [...ordered, ...remainder]) list.append(item);
    }

    const expanded = isFinanceSectionExpanded(type);
    const limit = expanded ? ordered.length : COMPACT_LIMIT;
    for (const item of items) item.hidden = true;
    ordered.forEach((item, index) => {
      item.hidden = index >= limit;
    });
    if (list) {
      list.classList.toggle('money-list--expanded', expanded && planSection.visibleCount > COMPACT_LIMIT);
    }

    const count = section.querySelector('[data-finance-count]');
    if (count) {
      const total = planSection.totalRows;
      count.textContent = planSection.visibleCount === total
        ? `${total} ${total === 1 ? 'entry' : 'entries'}`
        : `${planSection.visibleCount} of ${total} entries`;
    }

    const empty = section.querySelector('[data-finance-empty]');
    if (empty) empty.hidden = !(planSection.totalRows > 0 && planSection.visibleCount === 0);

    const more = section.querySelector('[data-finance-more]');
    if (more) {
      more.hidden = planSection.visibleCount <= COMPACT_LIMIT;
      more.textContent = expanded
        ? 'Show less'
        : `Show all (${planSection.visibleCount})`;
      more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  const monthWrap = root.querySelector?.('[data-finance-month-wrap]');
  if (monthWrap) monthWrap.hidden = plan.view?.period !== 'specific-month';
  const yearWrap = root.querySelector?.('[data-finance-year-wrap]');
  if (yearWrap) yearWrap.hidden = plan.view?.period !== 'specific-year';
}

/** Fallback purely for direct DOM calls in tests; the app always has a profile. */
function buildPlanFromDom(root, now) {
  const finance = {};
  for (const section of SECTIONS) {
    const node = root.querySelector?.(`[data-finance-section="${section.type}"]`);
    finance[section.listKey] = node
      ? [...node.querySelectorAll('.money-item')].map((item) => ({
          id: item.dataset.id,
          date: item.dataset.date,
          category: item.dataset.category,
          amount: Number(item.dataset.amount || 0),
          order: Number(item.dataset.order || 0),
        }))
      : [];
  }
  return buildFinancePlan(finance, financeView, { now, expanded: expandedSections });
}

function filterSelect({ filter, label, options, value }) {
  return el(
    'label',
    { class: 'finance-filter', for: `finance-filter-${filter}` },
    el('span', { class: 'finance-filter__label', text: label }),
    el(
      'select',
      {
        id: `finance-filter-${filter}`,
        class: 'select select--filter',
        'data-role': 'finance-filter',
        'data-filter': filter,
        'aria-label': filter === 'category' ? 'Filter by category' : `Filter by ${label.toLowerCase()}`,
      },
      options.map((option) => el('option', {
        value: option.value,
        selected: String(option.value) === String(value) ? true : null,
      }, option.label)),
    ),
  );
}


function metaText(item) {
  return [
    item.category,
    item.symbol,
    item.quantity != null ? `Qty ${formatNumber(item.quantity)}` : '',
    item.date,
  ].filter(Boolean).join(' · ');
}

function moneyItem(item, section, currency) {
  const meta = metaText(item);
  const canAdjust = section.type === 'asset' || section.type === 'savings';
  return el(
    'div',
    {
      class: 'money-item money-item--compact',
      'data-id': item.id,
      'data-type': section.type,
      'data-date': item.date ?? '',
      'data-category': item.category ?? '',
      'data-amount': String(item.amount ?? 0),
      'data-order': String(item.order ?? 0),
    },
    el('span', { class: 'money-item__icon', text: section.emoji, 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'money-item__body' },
      el('span', { class: 'money-item__name', text: item.name }),
      meta ? el('span', { class: 'money-item__meta', text: meta }) : null,
      item.note ? el('span', { class: 'money-item__note', text: item.note }) : null,
    ),
    el('span', { class: 'money-item__amount', text: formatMoney(item.amount, currency) }),
    el(
      'div',
      { class: 'money-item__actions' },
      canAdjust
        ? el('button', {
            class: 'btn btn--sm btn--gold',
            type: 'button',
            'data-action': 'open-finance-adjust',
            text: '＋ Add / − Deduct',
          })
        : null,
      el('button', {
        class: 'btn btn--sm',
        type: 'button',
        'data-action': 'open-finance-edit',
        text: 'Edit',
      }),
      el('button', {
        class: 'btn btn--sm btn--danger',
        type: 'button',
        'data-action': 'delete-finance-row',
        text: 'Delete',
      }),
    ),
  );
}

function moneySection(section, items, currency) {
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return el(
    'section',
    { class: 'finance-section', 'data-finance-section': section.type },
    el(
      'div',
      { class: 'finance-section__head' },
      el('h3', { class: 'finance-section__title', text: section.label }),
      el('span', { class: 'finance-section__total', text: formatMoney(total, currency) }),
      el('button', {
        class: 'btn btn--sm btn--primary',
        type: 'button',
        'data-action': 'open-finance-add',
        'data-type': section.type,
        text: `＋ Add ${section.label.replace(/s$/, '').toLowerCase()}`,
      }),
    ),
    el('span', { class: 'finance-section__count', 'data-finance-count': '' }),
    items.length
      ? el('div', { class: 'money-list' }, items.map((item) => moneyItem(item, section, currency)))
      : el('p', { class: 'finance-section__empty', text: section.empty }),
    el('p', { class: 'finance-section__empty', 'data-finance-empty': '', hidden: true, text: 'No entries match these filters.' }),
    el('button', {
      class: 'btn btn--ghost btn--sm finance-more',
      type: 'button',
      'data-action': 'toggle-finance-more',
      'data-type': section.type,
      'data-finance-more': '',
      hidden: true,
      text: 'Show all',
    }),
  );
}

/** formField + a stable hook the sheet can show/hide per finance type. */
function financeField(options) {
  const field = formField(options);
  field.dataset.field = options.name;
  return field;
}

/** Read-only date display + single built-in gold mini-calendar. */
function financeDateField() {
  return el(
    'div',
    { class: 'field field--date', 'data-field': 'date' },
    el('label', { class: 'field__label', for: 'field-date', text: 'Date' }),
    el(
      'div',
      { class: 'date-control' },
      el('input', {
        id: 'field-date',
        name: 'date',
        type: 'text',
        value: localDateKey(new Date()),
        autocomplete: 'off',
        readonly: true,
        'aria-haspopup': 'dialog',
        'aria-label': 'Date — open the calendar to choose',
      }),
      el(
        'button',
        {
          class: 'date-control__btn',
          type: 'button',
          'data-action': 'toggle-calendar',
          'aria-label': 'Open calendar',
          'aria-expanded': 'false',
        },
        el('span', { text: '📅', 'aria-hidden': 'true' }),
      ),
    ),
    miniCalendar(),
    el('span', { class: 'field__hint', text: 'Tap the field or calendar icon to pick a date.' }),
  );
}

function miniCalendar() {
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return el(
    'div',
    {
      class: 'mini-calendar',
      'data-mini-calendar': '',
      hidden: true,
      role: 'group',
      'aria-label': 'Choose a date',
    },
    el(
      'div',
      { class: 'mini-calendar__head' },
      el('button', {
        type: 'button',
        class: 'mini-calendar__nav',
        'data-action': 'calendar-prev',
        'aria-label': 'Previous month',
        text: '‹',
      }),
      el('span', { class: 'mini-calendar__title', 'data-calendar-title': '' }),
      el('button', {
        type: 'button',
        class: 'mini-calendar__nav',
        'data-action': 'calendar-next',
        'aria-label': 'Next month',
        text: '›',
      }),
    ),
    el(
      'div',
      { class: 'mini-calendar__weekdays', 'aria-hidden': 'true' },
      weekdays.map((day) => el('span', { text: day })),
    ),
    el('div', { class: 'mini-calendar__grid', 'data-calendar-grid': '' }),
    el(
      'div',
      { class: 'mini-calendar__foot' },
      el('button', {
        type: 'button',
        class: 'btn btn--sm',
        'data-action': 'calendar-today',
        text: 'Today',
      }),
    ),
  );
}

function financeDialog(currency) {
  return el(
    'dialog',
    { class: 'sheet', id: 'finance-dialog', 'aria-labelledby': 'finance-dialog-title' },
    el(
      'div',
      { class: 'sheet__panel' },
      el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'sheet__head' },
        el('h2', { class: 'sheet__title', id: 'finance-dialog-title', text: 'Add entry' }),
        el('button', {
          class: 'sheet__close',
          type: 'button',
          'data-action': 'close-dialog',
          'aria-label': 'Close finance editor',
          text: '×',
        }),
      ),
      el(
        'div',
        { class: 'sheet__body' },
        el(
          'form',
          { id: 'finance-form', class: 'profile-form', 'data-action': 'save-finance' },
          el('input', { type: 'hidden', name: 'id' }),
          el('input', { type: 'hidden', name: 'type' }),
          financeField({ label: 'Name', name: 'name', required: true, placeholder: 'Salary, Freelance, Bonus...' }),
          financeField({
            label: `Amount (${currencySymbol(currency)})`,
            name: 'amount',
            type: 'number',
            step: '0.01',
            min: '0',
            required: true,
            placeholder: '0.00',
          }),
          financeField({ label: 'Category', name: 'category', placeholder: 'Food, Housing, Transport, Bills...' }),
          financeField({ label: 'Symbol (assets)', name: 'symbol', placeholder: 'e.g. VOO, GOLD, BTC' }),
          financeField({ label: 'Quantity (optional)', name: 'quantity', type: 'number', step: 'any', min: '0' }),
          financeDateField(),
          financeField({ label: 'Note', name: 'note', placeholder: 'Optional context' }),
          el(
            'div',
            { class: 'chip-row' },
            el('button', { type: 'submit', class: 'btn btn--primary', text: 'Save entry' }),
            el('button', { type: 'button', class: 'btn', 'data-action': 'close-dialog', text: 'Cancel' }),
          ),
        ),
        el('p', {
          class: 'sheet__footnote',
          text: 'Every 100 in Overall Wealth grants +1 Wealth XP, and every 500 grants +1 Wealth Coin toward your Gold balance.',
        }),
      ),
    ),
  );
}

function adjustDialog(currency) {
  return el(
    'dialog',
    { class: 'sheet', id: 'finance-adjust-dialog', 'aria-labelledby': 'finance-adjust-title' },
    el(
      'div',
      { class: 'sheet__panel' },
      el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'sheet__head' },
        el('h2', { class: 'sheet__title', id: 'finance-adjust-title', text: 'Quick adjustment' }),
        el('button', {
          class: 'sheet__close',
          type: 'button',
          'data-action': 'close-dialog',
          'aria-label': 'Close quick adjustment',
          text: '×',
        }),
      ),
      el(
        'div',
        { class: 'sheet__body' },
        el('p', { class: 'sheet__lede', id: 'finance-adjust-target', text: 'Savings account' }),
        el(
          'form',
          { id: 'finance-adjust-form', class: 'profile-form', 'data-action': 'save-adjustment' },
          el('input', { type: 'hidden', name: 'type' }),
          el('input', { type: 'hidden', name: 'id' }),
          el(
            'label',
            { class: 'field', for: 'adjust-direction' },
            el('span', { class: 'field__label', text: 'Direction' }),
            el(
              'select',
              { id: 'adjust-direction', name: 'direction', class: 'select select--field' },
              el('option', { value: 'add' }, '＋ Add to balance'),
              el('option', { value: 'deduct' }, '− Deduct from balance'),
            ),
          ),
          el(
            'label',
            { class: 'field', for: 'adjust-amount' },
            el('span', { class: 'field__label', text: `Amount (${currencySymbol(currency)})` }),
            el('input', {
              id: 'adjust-amount',
              name: 'amount',
              type: 'number',
              min: '0.01',
              step: '0.01',
              placeholder: '0.00',
              required: true,
              inputmode: 'decimal',
              autocomplete: 'off',
            }),
          ),
          el(
            'label',
            { class: 'field', for: 'adjust-note' },
            el('span', { class: 'field__label', text: 'Note (optional)' }),
            el('input', {
              id: 'adjust-note',
              name: 'note',
              type: 'text',
              maxlength: '180',
              placeholder: 'Why did the balance change?',
              autocomplete: 'off',
            }),
          ),
          el(
            'div',
            { class: 'form-actions' },
            el('button', { type: 'submit', class: 'btn btn--gold', text: 'Save adjustment' }),
            el('button', { type: 'button', class: 'btn', 'data-action': 'close-dialog', text: 'Cancel' }),
          ),
        ),
        el('p', {
          class: 'sheet__footnote',
          text: 'Every adjustment is logged on the row and re-syncs Overall Wealth, Wealth XP/Coins and Gold.',
        }),
      ),
    ),
  );
}

function monthPicker() {
  return el(
    'label',
    { class: 'finance-filter finance-filter--month', for: 'finance-filter-month', 'data-finance-month-wrap': '', hidden: financeView.period !== 'specific-month' },
    el('span', { class: 'finance-filter__label', text: 'Month' }),
    el('input', {
      id: 'finance-filter-month',
      class: 'input input--filter',
      type: 'month',
      value: financeView.month,
      'data-role': 'finance-month',
      'aria-label': 'Choose a specific month',
    }),
  );
}

function yearPicker() {
  return el(
    'label',
    { class: 'finance-filter finance-filter--year', for: 'finance-filter-year', 'data-finance-year-wrap': '', hidden: financeView.period !== 'specific-year' },
    el('span', { class: 'finance-filter__label', text: 'Year' }),
    el('input', {
      id: 'finance-filter-year',
      class: 'input input--filter',
      type: 'number',
      min: '1970',
      max: '2100',
      step: '1',
      inputmode: 'numeric',
      value: financeView.year,
      'data-role': 'finance-year',
      'aria-label': 'Choose a specific year',
    }),
  );
}

export function renderFinance({ profile }) {
  const finance = profile.finance ?? {};
  ensureFinanceView(financeView);
  const plan = buildFinancePlan(finance, financeView, { expanded: expandedSections });
  if (financeView.category !== 'all'
    && !plan.categories.some((category) => category.value === financeView.category)) {
    financeView.category = 'all';
  }
  lastFinanceProfile = profile;
  const currency = normalizeCurrency(finance.currency);
  const totals = computeFinanceTotals(finance);
  const baseline = Math.max(0, Math.floor(Number(finance.wealthXpBaseline) || 0));
  const wealthXP = wealthXPFor(totals.overallWealth, baseline);
  const wealthCoins = wealthCoinsFor(totals.overallWealth);
  const categories = plan.categories;
  const assetNames = (finance.assets ?? [])
    .map((asset) => String(asset?.name ?? '').trim())
    .filter(Boolean);
  const savingsNames = (finance.savings ?? [])
    .map((account) => String(account?.name ?? '').trim())
    .filter(Boolean);

  return screenShell({
    id: 'finance',
    eyebrow: 'Net worth',
    title: 'Finance',
    description:
      'Starting Balance, income, expenses, assets and savings all roll into Overall Wealth — then into Wealth XP, Wealth Coins and Gold.',
    actions: el(
      'label',
      { class: 'currency-picker', for: 'finance-currency' },
      el('span', { class: 'currency-picker__label', text: 'Currency' }),
      currencySelect({ value: currency, id: 'finance-currency' }),
    ),
    children: [
      panel({
        title: 'Overall wealth',
        meta: currency,
        className: 'wealth-hero',
        children: [
          el('p', { class: 'wealth-hero__value', text: formatMoney(totals.overallWealth, currency) }),
          el('p', {
            class: 'wealth-hero__formula',
            text: `${formatMoney(totals.currentBalance, currency)} balance + ${formatMoney(totals.totalAssets, currency)} assets + ${formatMoney(totals.totalSavings, currency)} savings`,
          }),
          el(
            'div',
            { class: 'wealth-hero__sync' },
            el('span', { class: 'chip', text: `${formatNumber(wealthXP)} Wealth XP` }),
            el('span', { class: 'chip', text: `${formatNumber(wealthCoins)} Wealth Coins` }),
            el('span', { class: 'chip chip--interactive', 'data-action': 'edit-baseline', text: `Starting offset ${formatNumber(baseline)}` }),
          ),
        ],
      }),
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          icon: '🏦',
          label: 'Starting balance',
          value: formatMoney(totals.startingBalance, currency),
          hint: 'Tap to edit',
          action: 'edit-starting-balance',
        }),
        statTile({
          icon: '⚖️',
          label: 'Current balance',
          value: formatMoney(totals.currentBalance, currency),
          hint: 'Starting + income − expense',
        }),
        statTile({
          icon: '💎',
          label: 'Overall wealth',
          value: formatMoney(totals.overallWealth, currency),
          hint: 'Balance + assets + savings',
        }),
      ),
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          icon: '💵',
          label: 'Total incomes',
          value: formatMoney(totals.totalIncomes, currency),
          hint: `${finance.incomes?.length ?? 0} rows`,
        }),
        statTile({
          icon: '🧾',
          label: 'Total expenses',
          value: formatMoney(totals.totalExpenses, currency),
          hint: `${finance.expenses?.length ?? 0} rows`,
          tone: 'danger',
        }),
        statTile({
          icon: '📈',
          label: 'Total assets',
          value: formatMoney(totals.totalAssets, currency),
          hint: assetNames.length ? assetNames.join(', ') : 'No assets yet',
        }),
      ),
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          icon: '💳',
          label: 'Total savings',
          value: formatMoney(totals.totalSavings, currency),
          hint: savingsNames.length ? savingsNames.join(', ') : 'No savings yet',
          tone: 'muted',
        }),
        statTile({
          icon: '💰',
          label: 'Wealth XP',
          value: formatNumber(wealthXP),
          hint: 'Wealth Core Stat',
        }),
        statTile({
          iconContent: el('span', { class: 'coin-emblem' }),
          label: 'Wealth Coins',
          value: formatNumber(wealthCoins),
          hint: 'Feeds Gold',
        }),
      ),
      el(
        'div',
        { class: 'grid grid--2' },
        panel({
          title: 'Money flow',
          meta: 'Verified totals',
          children: [
            moneyRow({ label: 'Starting balance', value: formatMoney(totals.startingBalance, currency) }),
            moneyRow({ label: 'Total incomes', value: `+${formatMoney(totals.totalIncomes, currency)}`, tone: 'positive' }),
            moneyRow({ label: 'Total expenses', value: `−${formatMoney(totals.totalExpenses, currency)}`, tone: 'negative' }),
            moneyRow({ label: 'Current balance', value: formatMoney(totals.currentBalance, currency), tone: 'strong' }),
          ],
        }),
        panel({
          title: 'Wealth sync',
          meta: 'Automatic',
          children: [
            moneyRow({ label: 'Wealth XP', value: `${formatNumber(wealthXP)} XP` }),
            moneyRow({ label: 'Wealth Coins', value: `${formatNumber(wealthCoins)} coins` }),
            moneyRow({ label: 'Gold coins', value: formatNumber(profile.character?.gold), tone: 'strong' }),
            el('p', {
              class: 'panel__note',
              text: 'Every 100 in Overall Wealth grants +1 Wealth XP, and every 500 grants +1 Wealth Coin toward your Gold balance.',
            }),
          ],
        }),
      ),
      el(
        'div',
        { class: 'finance-filters', role: 'group', 'aria-label': 'Filter and sort finance entries' },
        filterSelect({ filter: 'period', label: 'Period', options: PERIODS, value: financeView.period }),
        monthPicker(),
        yearPicker(),
        filterSelect({ filter: 'category', label: 'Category', options: categories, value: financeView.category }),
        filterSelect({ filter: 'sort', label: 'Sort', options: SORTS, value: financeView.sort }),
      ),
      el(
        'div',
        { class: 'finance-sections' },
        SECTIONS.map((section) => moneySection(section, finance[section.listKey] ?? [], currency)),
      ),
      financeDialog(currency),
      adjustDialog(currency),
    ],
  });
}
