/**
 * The Game of Life V2 — economy domain logic (M5, pure functions).
 *
 * Finance CRUD: add/edit/delete income, expense, asset and savings rows.
 * Shop purchases, undo, skip tokens and rest-day protection.
 *
 * Every mutator operates on an already-cloned draft profile (the store owns
 * persistence). No DOM, no storage, no timers.
 */

import {
  computeFinanceTotals,
  currencySymbol,
  derivedGold,
  localDateKey,
  normalizeCurrency,
  roundMoney,
  toNumber,
  wealthCoinsFor,
  wealthXPFor,
} from './formulas.js';

export const SKIP_TOKEN_REWARD_ID = 'rw_skip_quest';
export const REST_DAY_REWARD_ID = 'rw_day_off';

export const FINANCE_ROW_TYPES = Object.freeze(['income', 'expense', 'asset', 'savings']);

/** Every finance section, in display order. */
export const FINANCE_SECTIONS = Object.freeze([
  Object.freeze({ type: 'income', listKey: 'incomes' }),
  Object.freeze({ type: 'expense', listKey: 'expenses' }),
  Object.freeze({ type: 'asset', listKey: 'assets' }),
  Object.freeze({ type: 'savings', listKey: 'savings' }),
]);

/** Period options requested for the M6 polish pass. */
export const FINANCE_PERIOD_OPTIONS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All Time' }),
  Object.freeze({ value: 'today', label: 'Today (Daily)' }),
  Object.freeze({ value: 'month', label: 'This Month' }),
  Object.freeze({ value: 'specific-month', label: 'Specific Month' }),
  Object.freeze({ value: 'year', label: 'This Year' }),
  Object.freeze({ value: 'specific-year', label: 'Specific Year' }),
  Object.freeze({ value: '30d', label: 'Last 30 Days' }),
]);

export const FINANCE_SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'newest', label: 'Newest first' }),
  Object.freeze({ value: 'oldest', label: 'Oldest first' }),
  Object.freeze({ value: 'amount-desc', label: 'Amount high → low' }),
  Object.freeze({ value: 'amount-asc', label: 'Amount low → high' }),
]);

const FINANCE_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const FINANCE_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function asLocalDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = value === undefined || value === null ? new Date() : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Local `YYYY-MM` key for a date. */
export function financeMonthKey(date = new Date()) {
  const d = asLocalDate(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Local `YYYY-MM-DD` key for a date. */
export function financeDayKey(date = new Date()) {
  return localDateKey(asLocalDate(date));
}

/** Parse a stored finance date key into a local date (or null). */
export function parseFinanceDateKey(value) {
  const match = FINANCE_DAY_PATTERN.exec(String(value ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Undated rows (assets/savings) stay visible in every period. */
export function isUndatedFinanceRow(row) {
  return !FINANCE_DAY_PATTERN.test(String(row?.date ?? ''));
}

/** Ensure the mutable view object has valid period/month/year/sort values. */
export function ensureFinanceView(view = {}, now = new Date()) {
  if (!view || typeof view !== 'object') return { period: 'all', category: 'all', sort: 'newest', month: financeMonthKey(now), year: String(asLocalDate(now).getFullYear()) };
  if (!FINANCE_PERIOD_OPTIONS.some((option) => option.value === view.period)) view.period = 'all';
  if (!FINANCE_SORT_OPTIONS.some((option) => option.value === view.sort)) view.sort = 'newest';
  if (!FINANCE_MONTH_PATTERN.test(String(view.month ?? ''))) view.month = financeMonthKey(now);
  if (!/^\d{4}$/.test(String(view.year ?? ''))) view.year = String(asLocalDate(now).getFullYear());
  if (view.category === undefined || view.category === null || view.category === '') view.category = 'all';
  return view;
}

/** True when a row's stored date belongs to the selected period. */
export function rowInFinancePeriod(row, view = {}, now = new Date()) {
  const period = ensureFinanceView(view, now).period;
  if (period === 'all') return true;

  const key = String(row?.date ?? '');
  if (!FINANCE_DAY_PATTERN.test(key)) return true; // undated rows stay visible

  const date = parseFinanceDateKey(key);
  if (!date) return true;
  const today = asLocalDate(now);
  const todayKey = financeDayKey(today);
  const currentMonth = financeMonthKey(today);
  const currentYear = String(today.getFullYear());

  if (period === 'today') return key === todayKey;
  if (period === 'month') return key.slice(0, 7) === currentMonth;
  if (period === 'specific-month') return key.slice(0, 7) === view.month;
  if (period === 'year') return key.slice(0, 4) === currentYear;
  if (period === 'specific-year') return key.slice(0, 4) === String(view.year);
  if (period === '30d') {
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    return date.getTime() >= cutoff.getTime();
  }
  return true;
}

/** True when a row matches the view category. */
export function rowInFinanceCategory(row, category = 'all') {
  if (!category || category === 'all') return true;
  const value = String(row?.category ?? '').trim();
  if (category === 'uncategorised') return value === '';
  return value === category;
}

/** Pure category list built from the full, unfiltered finance collections. */
export function financeCategoryOptions(finance = {}) {
  const categories = new Set();
  for (const section of FINANCE_SECTIONS) {
    for (const row of finance?.[section.listKey] ?? []) {
      const value = String(row?.category ?? '').trim();
      if (value) categories.add(value);
    }
  }
  return [
    { value: 'all', label: 'All categories' },
    { value: 'uncategorised', label: 'Uncategorised' },
    ...[...categories].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
  ];
}

/** Sort a copy of the rows; never mutates the stored rows. */
export function sortFinanceRows(rows = [], sort = 'newest') {
  const list = [...(Array.isArray(rows) ? rows : [])];
  if (sort === 'amount-desc') {
    return list.sort((a, b) => Number(b?.amount ?? 0) - Number(a?.amount ?? 0));
  }
  if (sort === 'amount-asc') {
    return list.sort((a, b) => Number(a?.amount ?? 0) - Number(b?.amount ?? 0));
  }
  const direction = sort === 'oldest' ? 1 : -1;
  return list.sort((a, b) => {
    const aDate = String(a?.date ?? '');
    const bDate = String(b?.date ?? '');
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate) * direction;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return (Number(a?.order ?? 0) - Number(b?.order ?? 0)) * direction;
  });
}

/**
 * Build the full render plan for the Finance screen. Reads the **complete**
 * stored collections, so filtering never depends on already-filtered DOM.
 */
export function buildFinancePlan(finance = {}, view = {}, options = {}) {
  const safeView = ensureFinanceView(view, options.now ?? new Date());
  const expanded = options.expanded;
  const isExpanded = (type) => (typeof expanded === 'function'
    ? expanded(type)
    : expanded instanceof Set
      ? expanded.has(type)
      : false);

  const sections = {};
  for (const section of FINANCE_SECTIONS) {
    const rows = Array.isArray(finance?.[section.listKey]) ? finance[section.listKey] : [];
    const filtered = rows.filter(
      (row) => rowInFinancePeriod(row, safeView, options.now ?? new Date())
        && rowInFinanceCategory(row, safeView.category),
    );
    const sorted = sortFinanceRows(filtered, safeView.sort);
    sections[section.type] = {
      type: section.type,
      listKey: section.listKey,
      rows: sorted,
      totalRows: rows.length,
      visibleCount: sorted.length,
      expanded: isExpanded(section.type),
      hiddenCount: Math.max(0, rows.length - sorted.length),
    };
  }

  return {
    view: { ...safeView },
    categories: financeCategoryOptions(finance),
    sections,
  };
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = value === undefined || value === null ? new Date() : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stamp(now) {
  return toDate(now).toISOString();
}

function int(value) {
  return Math.max(0, Math.floor(toNumber(value, 0)));
}

function signedInt(value) {
  return Math.floor(toNumber(value, 0));
}

function sameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Money operations                                                     */
/* ------------------------------------------------------------------ */

export function addMoneyRow(rows = [], newRow) {
  if (!Array.isArray(rows)) return [];
  return [...rows, newRow];
}

export function updateMoneyRow(rows = [], updatedRow) {
  if (!Array.isArray(rows)) return [];
  const id = updatedRow?.id;
  if (!id) return rows;

  const index = rows.findIndex((row) => sameId(row?.id, id));
  if (index < 0) return rows;

  return rows.map((row, i) => (i === index ? { ...row, ...updatedRow, id: row.id } : row));
}

export function deleteMoneyRow(rows = [], id) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !sameId(row?.id, id));
}

/** Set the profile's display currency (finance + settings stay in sync). */
export function setFinanceCurrency(profile, currency) {
  if (!profile || typeof profile !== 'object') {
    return { changed: false, error: 'invalid-profile', currency: normalizeCurrency(currency) };
  }
  const code = normalizeCurrency(currency);
  if (!profile.finance || typeof profile.finance !== 'object') profile.finance = {};
  profile.finance.currency = code;
  if (!profile.settings || typeof profile.settings !== 'object') profile.settings = {};
  profile.settings.currency = code;
  return { changed: true, currency: code, symbol: currencySymbol(code) };
}

export function ensureStartingBalance(finance = {}) {
  if (typeof finance !== 'object' || finance == null) return {};
  const next = { ...finance };
  if (next.startingBalance == null || next.startingBalance === '') {
    next.startingBalance = 500.0;
  }
  return next;
}

/** Canonical, serialisable money row. */
export function normalizeMoneyRow(row = {}, type = 'income', fallbackOrder = 1) {
  const source = row && typeof row === 'object' ? row : {};
  const quantity = source.quantity === undefined || source.quantity === ''
    ? null
    : toNumber(source.quantity, 0);

  return {
    id: String(source.id ?? '').trim(),
    type,
    name: String(source.name ?? '').trim(),
    amount: roundMoney(toNumber(source.amount, 0)),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : fallbackOrder,
    ...(source.category ? { category: String(source.category).trim() } : {}),
    ...(source.date ? { date: String(source.date) } : {}),
    ...(source.note ? { note: String(source.note).trim() } : {}),
    ...(source.symbol ? { symbol: String(source.symbol).trim() } : {}),
    ...(quantity !== null ? { quantity } : {}),
  };
}

export function isValidMoneyRow(row) {
  if (!row || typeof row !== 'object') return false;
  const amount = toNumber(row.amount, 0);
  const name = String(row.name ?? '').trim();
  const id = String(row.id ?? '').trim();
  return amount > 0 && name.length > 0 && id.length > 0;
}

/**
 * Quick "+ Add / − Deduct" adjustment for Savings and Assets.
 * Updates the row amount, appends a dated log entry/note and re-syncs Wealth.
 */
export function adjustFinanceAmount(profile, type, id, options = {}, now = new Date()) {
  if (!profile || typeof profile !== 'object') {
    return { changed: false, error: 'invalid-profile', code: 'invalid-profile', message: 'No active profile.' };
  }
  const key = type === 'asset' ? 'assets' : type === 'savings' ? 'savings' : null;
  if (!key) {
    return {
      changed: false,
      error: 'invalid-finance-type',
      code: 'invalid-finance-type',
      message: 'Only Savings and Asset rows can be adjusted.',
    };
  }

  const finance = ensureStartingBalance(profile.finance || {});
  const list = Array.isArray(finance[key]) ? finance[key] : [];
  const row = list.find((entry) => sameId(entry?.id, id)) ?? null;
  if (!row) {
    return {
      changed: false,
      error: 'missing-finance-row',
      code: 'missing-finance-row',
      message: 'That finance row no longer exists.',
    };
  }

  const delta = roundMoney(Math.abs(toNumber(options.amount, 0)));
  if (delta <= 0) {
    return {
      changed: false,
      error: 'invalid-amount',
      code: 'invalid-amount',
      message: 'Enter an amount greater than zero.',
    };
  }

  const direction = options.direction === 'deduct' ? 'deduct' : 'add';
  const before = roundMoney(toNumber(row.amount, 0));
  const after = roundMoney(direction === 'add' ? before + delta : Math.max(0, before - delta));
  const applied = roundMoney(after - before);
  const date = localDateKey(toDate(now));
  const note = String(options.note ?? '').trim().slice(0, 180);
  const symbol = currencySymbol(normalizeCurrency(finance.currency));
  const noteLine = `${date}: ${direction === 'add' ? '+' : '−'}${symbol}${delta.toFixed(2)}${note ? ` — ${note}` : ''}`;
  const entry = {
    id: uid('adj'),
    date,
    at: stamp(now),
    direction,
    amount: delta,
    applied,
    note,
    before,
    after,
  };

  row.amount = after;
  row.adjustments = [...(Array.isArray(row.adjustments) ? row.adjustments : []), entry];
  row.lastAdjustment = entry;
  row.note = row.note ? `${row.note} · ${noteLine}` : noteLine;

  profile.finance = finance;
  recomputeDerived(profile);

  const totals = computeFinanceTotals(profile.finance);
  return {
    changed: true,
    type,
    row,
    entry,
    totals,
    wealthXP: profile.finance.wealthXP,
    wealthCoins: profile.finance.wealthCoins,
    gold: availableGold(profile),
  };
}

export function roundMoneyValue(value) {
  return roundMoney(toNumber(value, 0));
}

/* ------------------------------------------------------------------ */
/* Finance totals and Wealth sync                                      */
/* ------------------------------------------------------------------ */

export { computeFinanceTotals, wealthXPFor, wealthCoinsFor };

export function deriveWealthSnapshot(finance = {}) {
  const totals = computeFinanceTotals(finance);
  const baseline = int(finance?.wealthXpBaseline);
  const xp = wealthXPFor(totals.overallWealth, baseline);
  const coins = wealthCoinsFor(totals.overallWealth);
  return { totals, wealthXP: xp, wealthCoins: coins };
}

/**
 * Idempotent finance → Wealth Core Stat + Gold snapshot.
 * Gold is always `goldBase + wealthCoins`; spending may make goldBase negative
 * internally, but the displayed Gold total clamps at 0.
 */
export function recomputeDerived(profile) {
  if (!profile || typeof profile !== 'object') return profile;

  if (!profile.finance || typeof profile.finance !== 'object') profile.finance = {};
  const derived = deriveWealthSnapshot(profile.finance);

  profile.finance.wealthXP = derived.wealthXP;
  profile.finance.wealthCoins = derived.wealthCoins;
  profile.finance.lastSyncedAt = new Date().toISOString();

  if (profile.cores?.wealth) {
    profile.cores.wealth.xp = derived.wealthXP;
    profile.cores.wealth.earnedXP = derived.wealthXP - int(profile.cores.wealth.startingXP);
    profile.cores.wealth.wealthCoins = derived.wealthCoins;
  }

  if (profile.character) {
    const goldBase = signedInt(profile.character.goldBase);
    profile.character.goldBase = goldBase;
    profile.character.gold = derivedGold(goldBase, derived.wealthCoins);
  }

  return profile;
}

/** Spendable Gold, derived from the canonical split. */
export function availableGold(profile) {
  const stored = Math.floor(toNumber(profile?.character?.gold, 0));
  if (!profile?.character || profile.character.goldBase === undefined) return Math.max(0, stored);
  const base = signedInt(profile.character.goldBase);
  const coins = int(profile?.finance?.wealthCoins);
  return Math.max(0, derivedGold(base, coins));
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export function ensureTokens(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const source = profile.tokens && typeof profile.tokens === 'object' ? profile.tokens : {};
  profile.tokens = {
    skipQuest: int(source.skipQuest),
    skipQuestAwardedAt: typeof source.skipQuestAwardedAt === 'string' ? source.skipQuestAwardedAt : null,
    restDay: typeof source.restDay === 'string' && source.restDay ? source.restDay : null,
    restDayAwardedAt: typeof source.restDayAwardedAt === 'string' ? source.restDayAwardedAt : null,
    ...source,
  };
  profile.tokens.skipQuest = int(profile.tokens.skipQuest);
  profile.tokens.restDay = typeof profile.tokens.restDay === 'string' && profile.tokens.restDay
    ? profile.tokens.restDay
    : null;
  return profile.tokens;
}

export function isSkipTokenReward(reward) {
  return Boolean(
    reward
      && (sameId(reward.id, SKIP_TOKEN_REWARD_ID) || /skip one daily quest/i.test(String(reward.name ?? ''))),
  );
}

export function isRestDayReward(reward) {
  return Boolean(
    reward
      && (sameId(reward.id, REST_DAY_REWARD_ID) || /day off from tasks/i.test(String(reward.name ?? ''))),
  );
}

/* ------------------------------------------------------------------ */
/* Shop purchases                                                      */
/* ------------------------------------------------------------------ */

function purchaseFailure(code, message) {
  return { changed: false, error: code, code, message };
}

export function purchaseReward(profile, rewardId, now = new Date()) {
  if (!profile || !rewardId) {
    return purchaseFailure('invalid-request', 'That purchase is not valid.');
  }

  const rewards = Array.isArray(profile.rewards) ? profile.rewards : [];
  const reward = rewards.find((row) => sameId(row?.id, rewardId)) ?? null;
  if (!reward) return purchaseFailure('reward-not-found', 'That reward no longer exists.');
  if (reward.active === false) return purchaseFailure('reward-inactive', 'That reward is not available.');

  const price = int(reward.price);
  const goldBefore = availableGold(profile);
  if (goldBefore < price) {
    return purchaseFailure(
      'insufficient-gold',
      `Not enough Gold. ${reward.name} costs ${price} G and you have ${goldBefore} G.`,
    );
  }

  if (!profile.character) profile.character = {};
  profile.character.goldBase = signedInt(profile.character.goldBase) - price;
  recomputeDerived(profile);
  const goldAfter = Math.max(0, Math.floor(toNumber(profile.character.gold, 0)));

  reward.purchaseCount = int(reward.purchaseCount) + 1;
  reward.lastPurchasedAt = stamp(now);

  const tokens = ensureTokens(profile);
  const timestamp = stamp(now);
  const purchase = {
    id: uid('purchase'),
    type: 'purchase',
    rewardId: reward.id,
    rewardName: reward.name,
    price,
    goldBefore,
    goldAfter,
    timestamp,
    undoable: true,
    skipTokenBefore: null,
    skipTokenAfter: null,
    restDayBefore: null,
    restDayAfter: null,
  };

  let skipTokenGranted = false;
  let restDayActivated = false;
  let restDayDate = null;

  if (isSkipTokenReward(reward)) {
    purchase.skipTokenBefore = int(tokens.skipQuest);
    tokens.skipQuest = purchase.skipTokenBefore + 1;
    tokens.skipQuestAwardedAt = timestamp;
    purchase.skipTokenAfter = tokens.skipQuest;
    skipTokenGranted = true;
  } else if (isRestDayReward(reward)) {
    purchase.restDayBefore = tokens.restDay;
    tokens.restDay = localDateKey(toDate(now));
    tokens.restDayAwardedAt = timestamp;
    purchase.restDayAfter = tokens.restDay;
    restDayDate = tokens.restDay;
    restDayActivated = true;
  }

  if (!Array.isArray(profile.ledger)) profile.ledger = [];
  profile.ledger.push(purchase);

  if (!Array.isArray(profile.purchases)) profile.purchases = [];
  profile.purchases.push({
    id: purchase.id,
    rewardId: reward.id,
    rewardName: reward.name,
    price,
    timestamp,
  });

  if (!profile.stats || typeof profile.stats !== 'object') profile.stats = {};
  profile.stats.rewardsPurchased = int(profile.stats.rewardsPurchased) + 1;

  return {
    changed: true,
    reward,
    rewardName: reward.name,
    price,
    purchase,
    ledgerEntry: purchase,
    goldBefore,
    goldAfter,
    gold: goldAfter,
    purchaseCount: reward.purchaseCount,
    skipTokenGranted,
    restDayActivated,
    restDayDate,
    tokens: { ...tokens },
  };
}

export function undoPurchase(profile, purchaseId, now = new Date()) {
  if (!profile || !purchaseId) {
    return purchaseFailure('invalid-request', 'That undo is not valid.');
  }

  const ledger = Array.isArray(profile.ledger) ? profile.ledger : [];
  const index = ledger.findIndex((entry) => entry?.type === 'purchase' && sameId(entry.id, purchaseId));
  if (index < 0) return purchaseFailure('purchase-not-found', 'That purchase is no longer in the ledger.');

  const purchase = ledger[index];
  const price = int(purchase.price);

  if (!profile.character) profile.character = {};
  profile.character.goldBase = signedInt(profile.character.goldBase) + price;
  recomputeDerived(profile);
  const goldAfter = Math.max(0, Math.floor(toNumber(profile.character.gold, 0)));

  const rewards = Array.isArray(profile.rewards) ? profile.rewards : [];
  const reward = rewards.find((row) => sameId(row?.id, purchase.rewardId)) ?? null;
  if (reward) {
    reward.purchaseCount = Math.max(0, int(reward.purchaseCount) - 1);
  }

  ledger.splice(index, 1);
  profile.ledger = ledger;

  if (Array.isArray(profile.purchases)) {
    profile.purchases = profile.purchases.filter((entry) => !sameId(entry?.id, purchaseId));
  }

  const tokens = ensureTokens(profile);
  let skipTokenRemoved = false;
  let restDayCleared = false;

  if (purchase.skipTokenAfter != null) {
    const before = int(tokens.skipQuest);
    tokens.skipQuest = Math.max(0, before - 1);
    skipTokenRemoved = tokens.skipQuest < before;
    if (tokens.skipQuest === 0) tokens.skipQuestAwardedAt = null;
  }

  if (purchase.restDayAfter) {
    const stillGranted = ledger.some(
      (entry) => entry?.type === 'purchase' && entry.restDayAfter === purchase.restDayAfter,
    );
    if (!stillGranted && tokens.restDay === purchase.restDayAfter) {
      tokens.restDay = purchase.restDayBefore ?? null;
      tokens.restDayAwardedAt = null;
      restDayCleared = true;
    }
  }

  if (!profile.stats || typeof profile.stats !== 'object') profile.stats = {};
  profile.stats.rewardsPurchased = Math.max(0, int(profile.stats.rewardsPurchased) - 1);

  return {
    changed: true,
    reward,
    rewardName: purchase.rewardName,
    price,
    purchase,
    goldBefore: Math.max(0, Math.floor(toNumber(purchase.goldAfter, 0))),
    goldAfter,
    gold: goldAfter,
    skipTokenRemoved,
    restDayCleared,
    tokens: { ...tokens },
    undoneAt: stamp(now),
  };
}

export function isAffordable(profile, price) {
  return availableGold(profile) >= int(price);
}
