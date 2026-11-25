/**
 * The Game of Life V2 — canonical math engine.
 *
 * Pure functions only: no DOM, no storage, no side effects.
 * Every formula here is permanent. See AGENTS.md §2–§13.
 */

/** Character level curve base. */
export const CHARACTER_BASE = 250;
/** Core Stat level curve base. */
export const CORE_BASE = 100;
/** Skill level curve base. */
export const SKILL_BASE = 100;

export const BASES = Object.freeze({
  character: CHARACTER_BASE,
  core: CORE_BASE,
  skill: SKILL_BASE,
});

/** Healthy lifespan baseline used by the Real-Life HP bar. */
export const LIFESPAN_YEARS = 85;
/** HP at age 0. Lifespan HP is always displayed against this denominator. */
export const HP_BASELINE_MAX = 1000;
/** Legacy HP floor constant. The Lifespan curve no longer applies a floor. */
export const HP_FLOOR = 100;
/** The Lifespan HP bar is always shown out of this fixed value. */
export const LIFESPAN_DENOMINATOR = HP_BASELINE_MAX;
/** Maximum Vitality Shield points a profile can hold before rollover. */
export const SHIELD_MAX = 100;

/** Verified point awards. Never change without user approval. */
export const POINT_AWARDS = Object.freeze({
  mission: Object.freeze({ xp: 500, coins: 1000 }),
  goal: Object.freeze({ xp: 10000, coins: 20000 }),
  journal: Object.freeze({ xp: 10, coins: 35 }),
});

/** Bumped once so old saved profiles can adopt the 100/60 Shield defaults. */
export const SHIELD_DEFAULTS_VERSION = 2;

/** Default HP tuning. Profiles may override these in settings. */
export const HP_DEFAULTS = Object.freeze({
  lifespanYears: LIFESPAN_YEARS,
  baselineMaxHP: HP_BASELINE_MAX,
  floorHP: HP_FLOOR,
  runningHeal: 15,
  sleepHeal: 20,
  skippedHealthDamage: 15,
  exhaustedPercent: 25,
  woundedPercent: 50,
  shieldMax: SHIELD_MAX,
  shieldStart: 50,
  shieldGainXP: 100,
  shieldLossXP: 60,
  shieldDefaultsVersion: SHIELD_DEFAULTS_VERSION,
});

/** Default finance sync tuning. */
export const WEALTH_DEFAULTS = Object.freeze({
  xpPerPeso: 100,
  coinsPerPeso: 500,
  xpBaseline: 0,
});

/** Display currencies. The sync ratios are currency-agnostic. */
export const DEFAULT_CURRENCY = 'PHP';
export const CURRENCIES = Object.freeze([
  Object.freeze({ code: 'PHP', symbol: '₱', name: 'Philippine Peso' }),
  Object.freeze({ code: 'USD', symbol: '$', name: 'US Dollar' }),
  Object.freeze({ code: 'EUR', symbol: '€', name: 'Euro' }),
  Object.freeze({ code: 'GBP', symbol: '£', name: 'British Pound' }),
  Object.freeze({ code: 'JPY', symbol: '¥', name: 'Japanese Yen' }),
  Object.freeze({ code: 'KRW', symbol: '₩', name: 'South Korean Won' }),
  Object.freeze({ code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' }),
  Object.freeze({ code: 'AUD', symbol: 'A$', name: 'Australian Dollar' }),
  Object.freeze({ code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' }),
  Object.freeze({ code: 'INR', symbol: '₹', name: 'Indian Rupee' }),
  Object.freeze({ code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' }),
  Object.freeze({ code: 'THB', symbol: '฿', name: 'Thai Baht' }),
  Object.freeze({ code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' }),
  Object.freeze({ code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' }),
]);

const CURRENCY_INDEX = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

/** Normalise a currency code, falling back to PHP. */
export function normalizeCurrency(code) {
  const key = String(code ?? '').trim().toUpperCase();
  return CURRENCY_INDEX.has(key) ? key : DEFAULT_CURRENCY;
}

/** Symbol for a currency code (₱ for PHP by default). */
export function currencySymbol(code) {
  return CURRENCY_INDEX.get(normalizeCurrency(code))?.symbol ?? '₱';
}

const NUMBER_FALLBACK = 0;

/** Coerce anything to a finite number. */
export function toNumber(value, fallback = NUMBER_FALLBACK) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Numeric clamp. */
export function clamp(value, min, max) {
  const n = toNumber(value, min);
  return Math.min(Math.max(n, min), max);
}

/** XP is always an integer >= 0. Vitality clamps here. */
export function clampXP(xp) {
  return Math.max(0, Math.floor(toNumber(xp, 0)));
}

/** Round to 2 decimals (money display/calculation). */
export function roundMoney(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

/**
 * PERMANENT level formula:
 *   level(xp, BASE) = floor((sqrt(1 + 8*xp/BASE) - 1) / 2)
 */
export function levelFromXP(xp, base = CORE_BASE) {
  const b = Math.max(1, toNumber(base, CORE_BASE));
  const safeXP = clampXP(xp);
  if (safeXP === 0) return 0;
  return Math.floor((Math.sqrt(1 + (8 * safeXP) / b) - 1) / 2);
}

/**
 * PERMANENT next-level threshold:
 *   nextLevelXP(L, BASE) = floor(BASE * (L+1) * (L+2) / 2)
 * This is the cumulative XP needed to reach level L+1.
 */
export function nextLevelXP(level, base = CORE_BASE) {
  const b = Math.max(1, toNumber(base, CORE_BASE));
  const l = Math.max(0, Math.floor(toNumber(level, 0)));
  return Math.floor((b * (l + 1) * (l + 2)) / 2);
}

/** Cumulative XP required to be at the start of `level`. */
export function startLevelXP(level, base = CORE_BASE) {
  const b = Math.max(1, toNumber(base, CORE_BASE));
  const l = Math.max(0, Math.floor(toNumber(level, 0)));
  return Math.floor((b * l * (l + 1)) / 2);
}

/**
 * Full display model. Notion displays cumulative XP against the cumulative
 * next threshold (6548 / 7000 = 93%), so `percent` follows that convention.
 */
export function levelInfo(xp, base = CORE_BASE) {
  const total = clampXP(xp);
  const level = levelFromXP(total, base);
  const nextXP = nextLevelXP(level, base);
  const floorXP = startLevelXP(level, base);
  const span = Math.max(1, nextXP - floorXP);
  const percent = nextXP > 0 ? Math.min(100, Math.floor((total / nextXP) * 100)) : 100;

  return {
    xp: total,
    level,
    nextLevelXP: nextXP,
    startLevelXP: floorXP,
    xpIntoLevel: total - floorXP,
    xpForNextLevel: span,
    xpToNextLevel: Math.max(0, nextXP - total),
    percent,
    isMax: false,
  };
}

/** Add XP with the universal non-negative clamp. */
export function addXP(total, delta) {
  return clampXP(toNumber(total, 0) + toNumber(delta, 0));
}

/** Calculate the cumulative XP required to reach `level` exactly. */
export function totalXPForLevel(level, base = CORE_BASE) {
  return startLevelXP(level, base);
}

/* ------------------------------------------------------------------ */
/* Real-Life HP                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lifespan base HP from age:
 *   round(baselineMaxHP * (lifespanYears - clamp(age, 0, lifespanYears)) / lifespanYears)
 *
 * Age 0 = 1,000 · age 25 = 706 · age 85 = 0. There is deliberately no HP
 * floor here: Lifespan HP is the full age curve and only `hp.current` is
 * clamped to [0, 1,000].
 */
export function baseLifespan(age, options = {}) {
  const lifespan = Math.max(1, toNumber(options.lifespanYears, LIFESPAN_YEARS));
  const baseline = Math.max(1, toNumber(options.baselineMaxHP, HP_BASELINE_MAX));
  const years = clamp(age, 0, lifespan);
  return Math.round(baseline * ((lifespan - years) / lifespan));
}

/** Backwards-compatible alias for the age curve. */
export function maxHPForAge(age, options = {}) {
  return baseLifespan(age, options);
}

/** Clamp current HP into [0, max]. */
export function clampHP(current, maxHP) {
  const max = Math.max(1, Math.floor(toNumber(maxHP, HP_BASELINE_MAX)));
  return clamp(Math.round(toNumber(current, max)), 0, max);
}

/** Apply a signed HP delta (heal positive, damage negative). */
export function applyHPDelta(current, delta, maxHP) {
  return clampHP(toNumber(current, 0) + Math.round(toNumber(delta, 0)), maxHP);
}

/**
 * Lifespan state. Restoring at 0, Frail at <=25%, Worn at <=50%, Thriving
 * above 50%. Keys stay stable for CSS; labels are lifespan-themed.
 */
export function hpState(current, maxHP, options = {}) {
  const max = Math.max(1, Math.floor(toNumber(maxHP, HP_BASELINE_MAX)));
  const hp = clampHP(current, max);
  const exhaustedAt = Math.max(1, Math.floor((max * toNumber(options.exhaustedPercent, HP_DEFAULTS.exhaustedPercent)) / 100));
  const woundedAt = Math.max(exhaustedAt, Math.floor((max * toNumber(options.woundedPercent, HP_DEFAULTS.woundedPercent)) / 100));

  if (hp <= 0) {
    return { key: 'recovery', label: 'Restoring', emoji: '🌱', severity: 3, hp, maxHP: max, percent: 0 };
  }
  if (hp <= exhaustedAt) {
    return { key: 'exhausted', label: 'Frail', emoji: '🍂', severity: 2, hp, maxHP: max, percent: Math.floor((hp / max) * 100) };
  }
  if (hp <= woundedAt) {
    return { key: 'wounded', label: 'Worn', emoji: '🩹', severity: 1, hp, maxHP: max, percent: Math.floor((hp / max) * 100) };
  }
  return { key: 'healthy', label: 'Thriving', emoji: '🌿', severity: 0, hp, maxHP: max, percent: Math.floor((hp / max) * 100) };
}

/* ------------------------------------------------------------------ */
/* Lifespan HP + Vitality Shield                                       */
/* ------------------------------------------------------------------ */

/** Normalised Shield tuning read from `settings.hp`. */
export function shieldConfig(options = {}) {
  const max = Math.max(1, Math.floor(toNumber(options.shieldMax, HP_DEFAULTS.shieldMax)));
  const start = clamp(Math.floor(toNumber(options.shieldStart, HP_DEFAULTS.shieldStart)), 0, max);
  return {
    max,
    start,
    gainXP: Math.max(1, Math.floor(toNumber(options.shieldGainXP, HP_DEFAULTS.shieldGainXP))),
    lossXP: Math.max(1, Math.floor(toNumber(options.shieldLossXP, HP_DEFAULTS.shieldLossXP))),
  };
}

function int0(value, fallback = 0) {
  return Math.floor(toNumber(value, fallback));
}

/**
 * Clamp every Shield field into its legal range. `lifespanBonusHP` is clamped
 * independently of age so editing Age can never rewrite it; the visible total
 * is clamped to [0, 1,000] separately. `base` is accepted for call-site
 * compatibility and future tuning.
 */
export function normalizeShieldState(hp = {}, options = {}, base = LIFESPAN_DENOMINATOR) {
  const cfg = shieldConfig(options);
  return {
    shield: clamp(int0(hp?.shield, cfg.start), 0, cfg.max),
    shieldMax: cfg.max,
    posVitalityBuffer: clamp(int0(hp?.posVitalityBuffer, 0), 0, cfg.gainXP - 1),
    negVitalityBuffer: clamp(int0(hp?.negVitalityBuffer, 0), 0, cfg.lossXP - 1),
    lifespanBonusHP: clamp(
      int0(hp?.lifespanBonusHP, 0),
      -LIFESPAN_DENOMINATOR,
      LIFESPAN_DENOMINATOR,
    ),
  };
}

/** Derived Lifespan HP numbers for an age + hp state. Pure. */
export function lifespanHPFor(age, hp = {}, options = {}) {
  const base = baseLifespan(age, options);
  const normalized = normalizeShieldState(hp, options, base);
  const current = clamp(base + normalized.lifespanBonusHP, 0, LIFESPAN_DENOMINATOR);
  const percent = Math.round((current / LIFESPAN_DENOMINATOR) * 1000) / 10;
  return {
    base,
    max: LIFESPAN_DENOMINATOR,
    current,
    percent,
    state: hpState(current, LIFESPAN_DENOMINATOR, options),
    ...normalized,
  };
}

/**
 * Recompute `profile.hp` from age + `lifespanBonusHP`. Idempotent. The stored
 * `max` is always the fixed Lifespan denominator (1,000).
 */
export function syncLifespanState(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (!profile.hp || typeof profile.hp !== 'object') profile.hp = {};
  const options = profile.settings?.hp ?? {};
  const base = baseLifespan(profile.age, options);
  const normalized = normalizeShieldState(profile.hp, options, base);
  const hp = profile.hp;

  hp.base = base;
  hp.max = LIFESPAN_DENOMINATOR;
  hp.shield = normalized.shield;
  hp.shieldMax = normalized.shieldMax;
  hp.posVitalityBuffer = normalized.posVitalityBuffer;
  hp.negVitalityBuffer = normalized.negVitalityBuffer;
  hp.lifespanBonusHP = normalized.lifespanBonusHP;
  hp.current = clamp(base + normalized.lifespanBonusHP, 0, LIFESPAN_DENOMINATOR);
  return hp;
}

function writeShieldState(profile, state) {
  const hp = profile.hp ?? (profile.hp = {});
  hp.shield = state.shield;
  hp.shieldMax = state.shieldMax;
  hp.posVitalityBuffer = state.posVitalityBuffer;
  hp.negVitalityBuffer = state.negVitalityBuffer;
  hp.lifespanBonusHP = state.lifespanBonusHP;
  return syncLifespanState(profile);
}

/** Roll a full Shield into +1 Lifespan HP (repeat for large gains). */
function rolloverShield(state, base) {
  const cfgMax = state.shieldMax;
  if (state.shield < cfgMax) return state;
  const rolls = Math.floor(state.shield / cfgMax);
  state.shield -= rolls * cfgMax;
  state.lifespanBonusHP = Math.min(
    LIFESPAN_DENOMINATOR - base,
    state.lifespanBonusHP + rolls,
  );
  return state;
}

/**
 * Feed an actual Vitality XP delta into the Shield.
 *   +1 Shield per `shieldGainXP` gained (carryover kept)
 *   −1 Shield per `shieldLossXP` lost (carryover kept)
 * A full Shield rolls over into +1 `lifespanBonusHP`.
 */
export function applyVitalityXPToShield(profile, delta) {
  if (!profile || typeof profile !== 'object') return null;
  const options = profile.settings?.hp ?? {};
  const cfg = shieldConfig(options);
  const base = baseLifespan(profile.age, options);
  const state = normalizeShieldState(profile.hp, options, base);
  const amount = int0(delta, 0);
  let gained = 0;
  let lost = 0;

  if (amount > 0) {
    const total = state.posVitalityBuffer + amount;
    gained = Math.floor(total / cfg.gainXP);
    state.posVitalityBuffer = total % cfg.gainXP;
    state.shield += gained;
    rolloverShield(state, base);
  } else if (amount < 0) {
    const total = state.negVitalityBuffer + Math.abs(amount);
    lost = Math.floor(total / cfg.lossXP);
    state.negVitalityBuffer = total % cfg.lossXP;
    state.shield = Math.max(0, state.shield - lost);
  }

  writeShieldState(profile, state);
  return { gained, lost, shield: state.shield };
}

/**
 * Apply a signed Vitality XP delta straight to the Shield carryover buffers.
 * Penalties use this with the **configured** loss so a Vitality Core Stat that
 * is already clamped at 0 XP cannot dodge the Shield deduction.
 */
export function applyVitalityShieldDelta(profile, delta) {
  return applyVitalityXPToShield(profile, delta);
}

/**
 * Healing charges Shield. Negative Lifespan HP (`lifespanBonusHP`) is restored
 * first, then the rest fills Shield (which may roll over into bonus HP).
 */
export function healLifespanShield(profile, amount) {
  if (!profile || typeof profile !== 'object') return 0;
  const options = profile.settings?.hp ?? {};
  const cfg = shieldConfig(options);
  const base = baseLifespan(profile.age, options);
  const state = normalizeShieldState(profile.hp, options, base);
  let remaining = Math.max(0, Math.round(toNumber(amount, 0)));
  let applied = 0;

  if (remaining > 0 && state.lifespanBonusHP < 0) {
    const restore = Math.min(-state.lifespanBonusHP, remaining);
    state.lifespanBonusHP += restore;
    remaining -= restore;
    applied += restore;
  }
  if (remaining > 0) {
    state.shield += remaining;
    applied += remaining;
    rolloverShield(state, base);
  }

  writeShieldState(profile, state);
  return applied;
}

/**
 * Damage is absorbed by Shield first; overflow subtracts from
 * `lifespanBonusHP`, with total Lifespan HP clamped at 0 (Recovery).
 * Returns the total damage actually applied (Shield + overflow).
 */
export function damageLifespanShield(profile, amount) {
  if (!profile || typeof profile !== 'object') return 0;
  const options = profile.settings?.hp ?? {};
  const base = baseLifespan(profile.age, options);
  const state = normalizeShieldState(profile.hp, options, base);
  let remaining = Math.max(0, Math.round(toNumber(amount, 0)));
  let applied = 0;

  const absorbed = Math.min(state.shield, remaining);
  state.shield -= absorbed;
  remaining -= absorbed;
  applied += absorbed;

  if (remaining > 0) {
    const available = Math.max(0, base + state.lifespanBonusHP);
    const overflow = Math.min(available, remaining);
    state.lifespanBonusHP -= overflow;
    applied += overflow;
  }

  writeShieldState(profile, state);
  return applied;
}

/** Exact Shield-related state for Undo. */
export function shieldSnapshot(profile) {
  const hp = profile?.hp ?? {};
  return {
    shield: int0(hp.shield, 0),
    posVitalityBuffer: int0(hp.posVitalityBuffer, 0),
    negVitalityBuffer: int0(hp.negVitalityBuffer, 0),
    lifespanBonusHP: int0(hp.lifespanBonusHP, 0),
  };
}

/** Restore a Shield snapshot captured by `shieldSnapshot`. */
export function restoreShieldState(profile, snapshot) {
  if (!profile || typeof profile !== 'object' || !snapshot || typeof snapshot !== 'object') return false;
  const hp = profile.hp ?? (profile.hp = {});
  hp.shield = int0(snapshot.shield, 0);
  hp.posVitalityBuffer = int0(snapshot.posVitalityBuffer, 0);
  hp.negVitalityBuffer = int0(snapshot.negVitalityBuffer, 0);
  hp.lifespanBonusHP = int0(snapshot.lifespanBonusHP, 0);
  syncLifespanState(profile);
  return true;
}

/**
 * Difference between two Shield snapshots. Undo stores these instead of the
 * absolute snapshot so reversing one action never overwrites Shield/buffer
 * changes made by a later action.
 */
export function shieldStateDelta(before, after) {
  const from = before ?? {};
  const to = after ?? {};
  return {
    shieldDelta: int0(to.shield, 0) - int0(from.shield, 0),
    posBufferDelta: int0(to.posVitalityBuffer, 0) - int0(from.posVitalityBuffer, 0),
    negBufferDelta: int0(to.negVitalityBuffer, 0) - int0(from.negVitalityBuffer, 0),
    lifespanDelta: int0(to.lifespanBonusHP, 0) - int0(from.lifespanBonusHP, 0),
  };
}

/**
 * Apply a signed Shield delta. Shield and both carryover buffers are cyclic
 * (full Shield rolls over; buffers wrap at their XP thresholds), so inversion
 * uses modular arithmetic and therefore preserves unrelated later changes.
 */
export function applyShieldStateDelta(profile, deltas = {}) {
  if (!profile || typeof profile !== 'object') return false;
  const options = profile.settings?.hp ?? {};
  const cfg = shieldConfig(options);
  const base = baseLifespan(profile.age, options);
  const state = normalizeShieldState(profile.hp, options, base);
  const wrap = (value, size) => ((value % size) + size) % size;

  state.shield = wrap(state.shield + int0(deltas.shieldDelta, 0), cfg.max);
  state.posVitalityBuffer = wrap(
    state.posVitalityBuffer + int0(deltas.posBufferDelta, 0),
    cfg.gainXP,
  );
  state.negVitalityBuffer = wrap(
    state.negVitalityBuffer + int0(deltas.negBufferDelta, 0),
    cfg.lossXP,
  );
  state.lifespanBonusHP = clamp(
    state.lifespanBonusHP + int0(deltas.lifespanDelta, 0),
    -LIFESPAN_DENOMINATOR,
    LIFESPAN_DENOMINATOR,
  );
  writeShieldState(profile, state);
  return true;
}

/* ------------------------------------------------------------------ */
/* Finance → Wealth                                                    */
/* ------------------------------------------------------------------ */

/** Read an amount from a number, numeric string, or {amount} row. */
export function amountOf(row) {
  if (row && typeof row === 'object' && 'amount' in row) return toNumber(row.amount, 0);
  return toNumber(row, 0);
}

/** Sum a collection of money rows. */
export function sumAmounts(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + amountOf(row), 0);
}

/**
 * Canonical finance totals.
 * currentBalance = starting + incomes - expenses
 * overallWealth  = currentBalance + assets + savings
 */
export function computeFinanceTotals(finance = {}) {
  const startingBalance = toNumber(finance.startingBalance, 0);
  const totalIncomes = sumAmounts(finance.incomes);
  const totalExpenses = sumAmounts(finance.expenses);
  const totalAssets = sumAmounts(finance.assets);
  const totalSavings = sumAmounts(finance.savings);

  const currentBalance = startingBalance + totalIncomes - totalExpenses;
  const overallWealth = currentBalance + totalAssets + totalSavings;

  return {
    startingBalance: roundMoney(startingBalance),
    totalIncomes: roundMoney(totalIncomes),
    totalExpenses: roundMoney(totalExpenses),
    currentBalance: roundMoney(currentBalance),
    totalAssets: roundMoney(totalAssets),
    totalSavings: roundMoney(totalSavings),
    overallWealth: roundMoney(overallWealth),
  };
}

/** Wealth XP = max(0, floor(overall / 100) + baseline). */
export function wealthXPFor(overallWealth, baselineXP = WEALTH_DEFAULTS.xpBaseline) {
  const wealth = Math.max(0, toNumber(overallWealth, 0));
  const baseline = Math.max(0, Math.floor(toNumber(baselineXP, 0)));
  return Math.max(0, Math.floor(wealth / WEALTH_DEFAULTS.xpPerPeso) + baseline);
}

/** Wealth Coins = max(0, floor(overall / 500)). */
export function wealthCoinsFor(overallWealth) {
  const wealth = Math.max(0, toNumber(overallWealth, 0));
  return Math.max(0, Math.floor(wealth / WEALTH_DEFAULTS.coinsPerPeso));
}

/**
 * Gold = goldBase + wealthCoins (never double count).
 * `goldBase` may go negative internally after spending wealth-funded Gold;
 * the displayed total still clamps at 0.
 */
export function derivedGold(goldBase, wealthCoins) {
  return Math.max(0, Math.floor(toNumber(goldBase, 0)) + Math.floor(toNumber(wealthCoins, 0)));
}

/** Recompute the wealth-derived part of a profile. Pure; returns a patch. */
export function deriveWealthSnapshot(finance = {}) {
  const totals = computeFinanceTotals(finance);
  const xp = wealthXPFor(totals.overallWealth, finance.wealthXpBaseline);
  const coins = wealthCoinsFor(totals.overallWealth);
  return { totals, wealthXP: xp, wealthCoins: coins };
}

/* ------------------------------------------------------------------ */
/* Dates / Strict mode                                                 */
/* ------------------------------------------------------------------ */

/** Local YYYY-MM-DD (never UTC-shifted). */
export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** True when two dates fall on the same local calendar day. */
export function isSameLocalDay(a, b) {
  return localDateKey(a) === localDateKey(b);
}

/**
 * Strict YYYY-MM-DD validation. Rejects impossible calendar dates (2026-02-30
 * and friends) so a birthday can never silently roll into another day.
 */
export function isValidDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

/** Parse a strict local YYYY-MM-DD key, or null when invalid. */
export function parseDateKey(value) {
  if (!isValidDateKey(value)) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Age in whole local years for a birthday. Returns null for an invalid date.
 * The birthday is the single source of truth; `profile.age` is a cached copy.
 */
export function ageFromBirthday(birthday, now = new Date()) {
  const birth = parseDateKey(birthday);
  if (!birth) return null;
  const today = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(today.getTime())) return null;

  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years;
}

/**
 * A birthday that makes someone exactly `age` today. Uses the local calendar
 * and clamps Feb 29 onto Feb 28 in non-leap target years.
 */
export function birthdayForAge(age, now = new Date()) {
  const today = now instanceof Date ? new Date(now) : new Date(now);
  if (Number.isNaN(today.getTime())) return '';
  const years = Math.max(0, Math.floor(toNumber(age, 0)));
  const year = today.getFullYear() - years;
  const month = today.getMonth();
  const day = Math.min(today.getDate(), daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `MM-DD` portion of a valid birthday, or an empty string. */
export function birthdayMonthDay(birthday) {
  return isValidDateKey(birthday) ? String(birthday).slice(5) : '';
}

/** True when today's local month/day matches the birthday (year ignored). */
export function isBirthdayToday(birthday, now = new Date()) {
  const monthDay = birthdayMonthDay(birthday);
  if (!monthDay) return false;
  return localDateKey(now).slice(5) === monthDay;
}

/**
 * Show the birthday banner only on the first open of a matching year.
 * `birthdayGreetedYear` records the last year the player tapped "Thanks!".
 */
export function shouldGreetBirthday(profile, now = new Date()) {
  if (!profile || typeof profile !== 'object') return false;
  if (!birthdayMonthDay(profile.birthday)) return false;
  const year = (now instanceof Date ? now : new Date(now)).getFullYear();
  const greetedYear = Number(profile.birthdayGreetedYear);
  if (Number.isFinite(greetedYear) && greetedYear === year) return false;
  return isBirthdayToday(profile.birthday, now);
}

/** Next local midnight (for the Strict-mode countdown). */
export function nextLocalMidnight(date = new Date()) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(24, 0, 0, 0);
  return d;
}

/** Milliseconds until the next local midnight. */
export function msUntilMidnight(date = new Date()) {
  return Math.max(0, nextLocalMidnight(date).getTime() - new Date(date).getTime());
}

/**
 * Strict auto-skip decision. A quest is due when Strict is on, it is still
 * pending, and the stored reset day is older than today.
 */
export function isStrictSkipDue({ strict, completed, skipped, lastResetDate }, now = new Date()) {
  if (!strict) return false;
  if (completed || skipped) return false;
  if (!lastResetDate) return true;
  return lastResetDate !== localDateKey(now);
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (presentation-safe, still pure)                  */
/* ------------------------------------------------------------------ */

export function formatMoney(value, currency = DEFAULT_CURRENCY) {
  const symbol = currencySymbol(currency);
  return `${symbol}${roundMoney(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(value) {
  return Math.floor(toNumber(value, 0)).toLocaleString('en-PH');
}
