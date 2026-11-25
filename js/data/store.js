/**
 * The Game of Life V2 — profile persistence.
 *
 * localStorage namespace (AGENTS.md §14):
 *   gol.v2.profiles          -> { schemaVersion, savedAt, profiles: [...] }
 *   gol.v2.activeProfileId   -> "p_king_arts13"
 *   gol.v2.settings          -> { theme, lastTab }
 *
 * Design rules:
 *  - Storage is injectable so the parity suite never touches real data.
 *  - Reads return deep clones; writes go through `updateProfile`.
 *  - A corrupt blob is preserved under gol.v2.corrupt.* and the seed boots.
 *  - King.Arts13 is seeded only when no profile store exists.
 */

import {
  createKingArts13Profile,
  createBlankProfile,
  createDefaultSettings,
  recomputeDerived,
  DAILY_REWARD_TEMPLATES,
  SEED_SCHEMA_VERSION,
} from './seed.js';
import { deepClone, DEFAULT_CHARACTER_TITLES, DEFAULT_RANK_TRACKS, CORE_STAT_ORDER } from '../core/titles.js';
import { DEFAULT_AVATAR, isKnownAvatar } from '../core/profile.js';
import { DEFAULT_TAB, normalizeTabId } from '../core/navigation.js';
import {
  CHARACTER_BASE,
  HP_DEFAULTS,
  LIFESPAN_DENOMINATOR,
  ageFromBirthday,
  birthdayForAge,
  clampXP,
  isValidDateKey,
  levelFromXP,
  baseLifespan,
  localDateKey,
  normalizeCurrency,
  roundMoney,
  syncLifespanState,
  toNumber,
} from '../core/formulas.js';
import * as daily from '../core/daily.js';
import * as progression from '../core/progression.js';
import * as economy from '../core/economy.js';
import * as crud from '../core/crud.js';
import {
  buildBackupPayload,
  validateBackupPayload,
} from '../core/backup.js';

export const STORAGE_KEYS = Object.freeze({
  profiles: 'gol.v2.profiles',
  activeProfileId: 'gol.v2.activeProfileId',
  settings: 'gol.v2.settings',
  corruptPrefix: 'gol.v2.corrupt.',
});

export const STORE_SCHEMA_VERSION = 1;
export const GLOBAL_SETTINGS_DEFAULTS = Object.freeze({
  theme: 'dark',
  lastTab: DEFAULT_TAB,
});

export class StoreError extends Error {
  constructor(message, code = 'store-error') {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** In-memory Storage-compatible adapter used by tests. */
export function createMemoryStorage(initial = {}) {
  const data = new Map(
    Object.entries(initial)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    get length() {
      return data.size;
    },
    _data: data,
  };
}

function resolveBrowserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return { storage: createMemoryStorage(), fallback: true };
    const probe = 'gol.v2.__probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return { storage, fallback: false };
  } catch {
    return { storage: createMemoryStorage(), fallback: true };
  }
}

function nowISO(clock) {
  try {
    const value = clock ? clock() : new Date();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function nowDate(clock) {
  try {
    const value = clock ? clock() : new Date();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  } catch {
    return new Date();
  }
}

function clampAge(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 25;
  return Math.max(0, Math.min(85, Math.floor(n)));
}

function int0(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function rewardList(list, key) {
  return Array.isArray(list)
    ? list
        .map((reward) => ({ [key]: String(reward?.[key] ?? ''), xp: int0(reward?.xp) }))
        .filter((reward) => reward[key] && reward.xp > 0)
    : [];
}

/**
 * Migrate legacy flat daily XP / coreStat / skill targets to reward arrays.
 * Seed quest ids map to themed rewards whose sums equal the old XP totals.
 */
function migrateDailyRewards(source) {
  const coreRewards = rewardList(source.coreRewards, 'stat');
  const skillRewards = rewardList(source.skillRewards, 'skill');
  if (coreRewards.length || skillRewards.length) return { coreRewards, skillRewards };

  const legacyCore = source.coreStat && int0(source.coreXp) > 0
    ? [{ stat: String(source.coreStat), xp: int0(source.coreXp) }]
    : [];
  const legacySkill = source.skill && int0(source.skillXp) > 0
    ? [{ skill: String(source.skill), xp: int0(source.skillXp) }]
    : [];
  if (legacyCore.length || legacySkill.length) {
    return { coreRewards: legacyCore, skillRewards: legacySkill };
  }

  const template = DAILY_REWARD_TEMPLATES[String(source.id ?? '')];
  if (template) {
    return {
      coreRewards: template.coreRewards.map((reward) => ({ ...reward })),
      skillRewards: template.skillRewards.map((reward) => ({ ...reward })),
    };
  }

  const xp = int0(source.xp);
  return {
    coreRewards: xp > 0 ? [{ stat: 'discipline', xp }] : [],
    skillRewards: [],
  };
}

function mergeSettings(base, given) {
  const g = given && typeof given === 'object' ? given : {};
  return {
    ...base,
    ...g,
    points: {
      ...base.points,
      ...(g.points ?? {}),
      journal: { ...(base.points?.journal ?? {}), ...(g.points?.journal ?? {}) },
    },
    hp: { ...base.hp, ...(g.hp ?? {}) },
    strict: { ...base.strict, ...(g.strict ?? {}) },
    finance: { ...base.finance, ...(g.finance ?? {}) },
  };
}

/**
 * One-time adoption of the 100/60 Shield defaults. Profiles saved before
 * final11 carry the old 1000/600 values in storage; only an exact legacy pair
 * is migrated, so any deliberate custom value survives.
 */
function migrateShieldDefaults(hp, rawHp) {
  const raw = rawHp && typeof rawHp === 'object' ? rawHp : {};
  const version = Math.floor(toNumber(raw.shieldDefaultsVersion, 0));
  if (version >= HP_DEFAULTS.shieldDefaultsVersion) {
    hp.shieldDefaultsVersion = HP_DEFAULTS.shieldDefaultsVersion;
    return;
  }

  const legacyGain = raw.shieldGainXP === undefined
    || Math.floor(toNumber(raw.shieldGainXP, 0)) === 1000;
  const legacyLoss = raw.shieldLossXP === undefined
    || Math.floor(toNumber(raw.shieldLossXP, 0)) === 600;
  if (legacyGain) hp.shieldGainXP = HP_DEFAULTS.shieldGainXP;
  if (legacyLoss) hp.shieldLossXP = HP_DEFAULTS.shieldLossXP;
  hp.shieldDefaultsVersion = HP_DEFAULTS.shieldDefaultsVersion;
}

/**
 * Additive migration. Never drops a user field; only fills missing structure,
 * clamps unsafe XP/HP and re-syncs derived values. Idempotent.
 */
export function normalizeProfile(input, clock) {
  const profile = deepClone(input && typeof input === 'object' ? input : {});
  const stamp = nowISO(clock);
  const today = nowDate(clock);
  const defaults = createDefaultSettings();
  const rawHp = profile.settings?.hp ?? null;

  profile.schemaVersion = Number.isInteger(profile.schemaVersion)
    ? profile.schemaVersion
    : SEED_SCHEMA_VERSION;
  profile.id = String(profile.id || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
  profile.name = String(profile.name ?? 'New Player').trim().slice(0, 40) || 'New Player';
  profile.createdAt = profile.createdAt || stamp;
  profile.updatedAt = profile.updatedAt || stamp;

  const storedAge = clampAge(profile.age);
  const rawBirthday = typeof profile.birthday === 'string' ? profile.birthday.trim() : '';
  if (isValidDateKey(rawBirthday)) {
    profile.birthday = rawBirthday;
    const derived = ageFromBirthday(rawBirthday, today);
    profile.age = derived === null ? storedAge : clampAge(derived);
  } else {
    // Migration: a profile with only an age gets a birthday that matches it.
    profile.age = storedAge;
    profile.birthday = birthdayForAge(storedAge, today);
    profile.birthdayGreetedYear = today.getFullYear();
  }
  const rawGreeted = profile.birthdayGreetedYear;
  profile.birthdayGreetedYear = rawGreeted === null || rawGreeted === undefined || rawGreeted === ''
    ? null
    : (Number.isFinite(Number(rawGreeted)) ? Math.floor(Number(rawGreeted)) : null);

  profile.avatar = typeof profile.avatar === 'string' ? profile.avatar : null;
  profile.avatarAlt = typeof profile.avatarAlt === 'string' ? profile.avatarAlt : null;
  profile.bio = typeof profile.bio === 'string' ? profile.bio : '';

  profile.character = {
    xp: 0,
    startingXP: 0,
    goldBase: 0,
    gold: 0,
    legacyCoinsNumber: 0,
    titleOverride: null,
    ...(profile.character ?? {}),
    xp: clampXP(profile.character?.xp),
  };

  profile.settings = mergeSettings(defaults, profile.settings);
  migrateShieldDefaults(profile.settings.hp, rawHp);

  const baseHP = baseLifespan(profile.age, profile.settings.hp);
  const previousHP = profile.hp && typeof profile.hp === 'object' ? profile.hp : {};
  // Age edits must never rewrite the Lifespan bonus. Profiles saved by older
  // builds without Shield state simply start from a clean 0 bonus instead of
  // deriving one from the stored current HP (which used to corrupt it).
  profile.hp = {
    ...previousHP,
    base: baseHP,
    max: LIFESPAN_DENOMINATOR,
    current: previousHP.current ?? baseHP,
    shield: previousHP.shield ?? HP_DEFAULTS.shieldStart,
    posVitalityBuffer: previousHP.posVitalityBuffer ?? 0,
    negVitalityBuffer: previousHP.negVitalityBuffer ?? 0,
    lifespanBonusHP: previousHP.lifespanBonusHP ?? 0,
    updatedAt: previousHP.updatedAt ?? stamp,
    recoverySince: previousHP.recoverySince ?? null,
  };
  syncLifespanState(profile);

  profile.titles = Array.isArray(profile.titles) && profile.titles.length
    ? profile.titles
    : deepClone(DEFAULT_CHARACTER_TITLES);
  profile.rankTracks = profile.rankTracks && typeof profile.rankTracks === 'object'
    ? profile.rankTracks
    : deepClone(DEFAULT_RANK_TRACKS);

  const cores = {};
  for (const key of CORE_STAT_ORDER) {
    const existing = profile.cores?.[key] ?? {};
    const startingXP = Math.max(0, Math.floor(Number(existing.startingXP) || 0));
    const hasXP = existing.xp !== undefined && existing.xp !== null;
    const xp = clampXP(hasXP ? existing.xp : startingXP);
    const earnedXP = Number.isFinite(Number(existing.earnedXP))
      ? Math.floor(Number(existing.earnedXP))
      : xp - startingXP;
    cores[key] = {
      ...existing,
      xp: clampXP(startingXP + earnedXP),
      startingXP,
      earnedXP,
      active: existing.active !== false,
    };
  }
  profile.cores = cores;

  profile.skills = Array.isArray(profile.skills)
    ? profile.skills.map((skill) => {
        const startingXP = Math.max(0, Math.floor(Number(skill.startingXP) || 0));
        const hasXP = skill.xp !== undefined && skill.xp !== null;
        const xp = clampXP(hasXP ? skill.xp : startingXP);
        const earnedXP = Number.isFinite(Number(skill.earnedXP))
          ? Math.floor(Number(skill.earnedXP))
          : xp - startingXP;
        return {
          ...skill,
          id: String(skill.id ?? ''),
          name: String(skill.name ?? 'Skill'),
          xp: clampXP(startingXP + earnedXP),
          startingXP,
          earnedXP,
          active: skill.active !== false,
        };
      })
    : [];

  for (const key of ['dailyQuests', 'sideQuests', 'badHabits', 'missions', 'goals', 'rewards', 'purchases', 'ledger']) {
    profile[key] = Array.isArray(profile[key]) ? profile[key] : [];
  }

  profile.dailyQuests = profile.dailyQuests.map((quest, index) => {
    const source = quest && typeof quest === 'object' ? quest : {};
    const heal = int0(source.heal);
    const { coreRewards, skillRewards } = migrateDailyRewards(source);
    const autoXp = [...coreRewards, ...skillRewards].reduce((sum, reward) => sum + reward.xp, 0);
    const coreTotal = coreRewards.reduce((sum, reward) => sum + reward.xp, 0);
    const penaltyCoreXp = source.penalty?.coreXp === undefined || source.penalty?.coreXp === null
      ? coreTotal
      : int0(source.penalty.coreXp);
    const penaltyCoreStat = source.penalty?.coreStat === undefined
      ? (coreRewards[0]?.stat ?? null)
      : (String(source.penalty.coreStat ?? '').trim() || null);
    const penaltyCoreXp2 = source.penalty?.coreXp2 === undefined || source.penalty?.coreXp2 === null
      ? 0
      : int0(source.penalty.coreXp2);
    const penaltyCoreStat2 = source.penalty?.coreStat2 === undefined
      ? null
      : (String(source.penalty.coreStat2 ?? '').trim() || null);
    return {
      ...source,
      id: String(source.id ?? `dq_${index + 1}`),
      name: String(source.name ?? 'Daily Quest'),
      icon: typeof source.icon === 'string' ? source.icon : null,
      xp: int0(source.xp) > 0 ? int0(source.xp) : autoXp,
      coins: int0(source.coins),
      penalty: {
        xp: int0(source.penalty?.xp),
        coins: int0(source.penalty?.coins),
        coreXp: penaltyCoreXp,
        coreStat: penaltyCoreStat,
        coreXp2: penaltyCoreXp2,
        coreStat2: penaltyCoreStat2,
      },
      physicalPenalty: typeof source.physicalPenalty === 'string' ? source.physicalPenalty : '',
      heal,
      isHealthQuest: source.isHealthQuest === true || heal > 0,
      coreRewards,
      skillRewards,
      coreStat: source.coreStat ?? null,
      coreXp: int0(source.coreXp),
      skill: source.skill ?? null,
      skillXp: int0(source.skillXp),
      strict: source.strict === true,
      completed: source.completed === true,
      skipped: source.skipped === true,
      completedAt: source.completedAt ?? null,
      skippedAt: source.skippedAt ?? null,
      lastResetDate: typeof source.lastResetDate === 'string' ? source.lastResetDate : null,
      lastAction: source.lastAction && typeof source.lastAction === 'object' ? source.lastAction : null,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
      active: source.active !== false,
    };
  });

  profile.badHabits = profile.badHabits.map((habit, index) => {
    const source = habit && typeof habit === 'object' ? habit : {};
    return {
      ...source,
      id: String(source.id ?? `bh_${index + 1}`),
      name: String(source.name ?? 'Bad Habit'),
      icon: typeof source.icon === 'string' ? source.icon : null,
      emoji: typeof source.emoji === 'string' ? source.emoji : '⚠️',
      hpDamage: int0(source.hpDamage),
      penalty: {
        coreStat: source.penalty?.coreStat ? String(source.penalty.coreStat) : null,
        coreXp: int0(source.penalty?.coreXp),
        coins: int0(source.penalty?.coins),
      },
      legacyPoints: {
        xp: int0(source.legacyPoints?.xp),
        coins: int0(source.legacyPoints?.coins),
      },
      active: source.active !== false,
      lastLoggedDate: typeof source.lastLoggedDate === 'string' ? source.lastLoggedDate : null,
      logCount: int0(source.logCount),
      lastAction: source.lastAction && typeof source.lastAction === 'object' ? source.lastAction : null,
    };
  });

  profile.sideQuests = profile.sideQuests.map((quest, index) => {
    const source = quest && typeof quest === 'object' ? quest : {};
    const coreRewards = Array.isArray(source.coreRewards)
      ? source.coreRewards
          .map((reward) => ({
            stat: String(reward?.stat ?? ''),
            xp: int0(reward?.xp),
          }))
          .filter((reward) => reward.stat && reward.xp > 0)
      : [];
    const skillRewards = Array.isArray(source.skillRewards)
      ? source.skillRewards
          .map((reward) => ({
            skill: String(reward?.skill ?? ''),
            xp: int0(reward?.xp),
          }))
          .filter((reward) => reward.skill && reward.xp > 0)
      : [];
    return {
      ...source,
      id: String(source.id ?? `sq_${index + 1}`),
      name: String(source.name ?? 'Side Quest'),
      type: source.type === 'secret' ? 'secret' : 'side',
      icon: typeof source.icon === 'string' ? source.icon : null,
      coins: int0(source.coins),
      coreRewards,
      skillRewards,
      message: typeof source.message === 'string' ? source.message : '',
      repeatable: source.repeatable !== false,
      active: source.active !== false,
      completed: source.completed === true,
      completedAt: source.completedAt ?? null,
      completions: int0(source.completions),
      lastAction: source.lastAction && typeof source.lastAction === 'object' ? source.lastAction : null,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
    };
  });

  profile.missions = profile.missions.map((mission, index) => {
    const source = mission && typeof mission === 'object' ? mission : {};
    return {
      ...source,
      id: String(source.id ?? `m_${index + 1}`),
      name: String(source.name ?? 'Mission'),
      goalId: typeof source.goalId === 'string' && source.goalId ? source.goalId : null,
      xp: int0(source.xp),
      coins: int0(source.coins),
      status: typeof source.status === 'string' ? source.status : 'not-started',
      completed: source.completed === true,
      completedAt: source.completedAt ?? null,
      startDate: typeof source.startDate === 'string' ? source.startDate : null,
      endDate: typeof source.endDate === 'string' ? source.endDate : null,
      progress: Math.min(1, Math.max(0, Number(source.progress) || 0)),
      tasks: Array.isArray(source.tasks)
        ? source.tasks.map((task, taskIndex) => ({
            ...task,
            id: String(task?.id ?? `t_${index + 1}_${taskIndex + 1}`),
            title: String(task?.title ?? 'Task'),
            done: task?.done === true,
          }))
        : [],
      lastAction: source.lastAction && typeof source.lastAction === 'object' ? source.lastAction : null,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
    };
  });

  profile.goals = profile.goals.map((goal, index) => {
    const source = goal && typeof goal === 'object' ? goal : {};
    return {
      ...source,
      id: String(source.id ?? `g_${index + 1}`),
      name: String(source.name ?? 'Goal'),
      xp: int0(source.xp),
      coins: int0(source.coins),
      status: typeof source.status === 'string' ? source.status : 'active',
      completed: source.completed === true,
      completedAt: source.completedAt ?? null,
      startDate: typeof source.startDate === 'string' ? source.startDate : null,
      endDate: typeof source.endDate === 'string' ? source.endDate : null,
      progress: Math.min(1, Math.max(0, Number(source.progress) || 0)),
      missionIds: Array.isArray(source.missionIds)
        ? source.missionIds.map((id) => String(id)).filter(Boolean)
        : [],
      lastAction: source.lastAction && typeof source.lastAction === 'object' ? source.lastAction : null,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
    };
  });

  progression.recalculateGoalProgress(profile);

  profile.journal = {
    xp: 10,
    coins: 35,
    entries: [],
    lastAwardedDate: null,
    lastAction: null,
    ...(profile.journal ?? {}),
    entries: Array.isArray(profile.journal?.entries) ? profile.journal.entries : [],
    lastAwardedDate: typeof profile.journal?.lastAwardedDate === 'string'
      ? profile.journal.lastAwardedDate
      : null,
    lastAction: profile.journal?.lastAction && typeof profile.journal.lastAction === 'object'
      ? profile.journal.lastAction
      : null,
  };

  profile.daily = {
    lastRolloverDate: null,
    ...(profile.daily ?? {}),
  };
  if (typeof profile.daily.lastRolloverDate !== 'string') profile.daily.lastRolloverDate = null;

  const tokenSource = profile.tokens && typeof profile.tokens === 'object' ? profile.tokens : {};
  profile.tokens = {
    skipQuest: 0,
    skipQuestAwardedAt: null,
    restDay: null,
    restDayAwardedAt: null,
    ...tokenSource,
  };
  profile.tokens.skipQuest = Math.max(0, Math.floor(toNumber(profile.tokens.skipQuest, 0)));
  profile.tokens.skipQuestAwardedAt = typeof profile.tokens.skipQuestAwardedAt === 'string'
    ? profile.tokens.skipQuestAwardedAt
    : null;
  profile.tokens.restDay = typeof profile.tokens.restDay === 'string' && profile.tokens.restDay
    ? profile.tokens.restDay
    : null;
  profile.tokens.restDayAwardedAt = typeof profile.tokens.restDayAwardedAt === 'string'
    ? profile.tokens.restDayAwardedAt
    : null;
  // Legacy partial-M5 field migration.
  if (profile.skipToken === true && profile.tokens.skipQuest === 0) profile.tokens.skipQuest = 1;

  const financeSource = profile.finance && typeof profile.finance === 'object' ? profile.finance : {};
  profile.finance = {
    currency: normalizeCurrency(financeSource.currency),
    startingBalance: 0,
    incomes: [],
    expenses: [],
    assets: [],
    savings: [],
    wealthXpBaseline: 0,
    wealthXP: 0,
    wealthCoins: 0,
    lastSyncedAt: null,
    ...financeSource,
    currency: normalizeCurrency(financeSource.currency),
    startingBalance: roundMoney(toNumber(financeSource.startingBalance, 0)),
    wealthXpBaseline: Math.max(0, Math.floor(toNumber(financeSource.wealthXpBaseline, 0))),
    incomes: Array.isArray(financeSource.incomes) ? financeSource.incomes : [],
    expenses: Array.isArray(financeSource.expenses) ? financeSource.expenses : [],
    assets: Array.isArray(financeSource.assets) ? financeSource.assets : [],
    savings: Array.isArray(financeSource.savings) ? financeSource.savings : [],
  };
  profile.settings.currency = profile.finance.currency;

  profile.stats = {
    missionsCompleted: 0,
    goalsCompleted: 0,
    journalsWritten: 0,
    rewardsPurchased: 0,
    daysActive: 1,
    dailyQuestsCompleted: 0,
    dailyQuestsSkipped: 0,
    habitsLogged: 0,
    sideQuestsCompleted: 0,
    ...(profile.stats ?? {}),
  };
  profile.notes = Array.isArray(profile.notes) ? profile.notes : [];

  recomputeDerived(profile);
  return profile;
}

/**
 * Create a profile store.
 * @param {object} [options]
 * @param {Storage} [options.storage] injectable (tests use createMemoryStorage)
 * @param {() => Date} [options.now] deterministic clock for tests
 */
export function createProfileStore(options = {}) {
  const clock = typeof options.now === 'function' ? options.now : () => new Date();
  const resolved = options.storage
    ? { storage: options.storage, fallback: false }
    : resolveBrowserStorage();
  const storage = resolved.storage;

  const meta = {
    seeded: false,
    recoveredFromCorruption: false,
    corruptBackupKey: null,
    persistent: !resolved.fallback,
    storageFallback: resolved.fallback,
    lastWriteError: null,
    loadedAt: nowISO(clock),
    rollover: null,
  };

  const state = {
    profiles: [],
    activeId: null,
    settings: { ...GLOBAL_SETTINGS_DEFAULTS },
  };

  const listeners = new Set();

  function safeGet(key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeKey(key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      meta.lastWriteError = error?.message || String(error);
      return false;
    }
  }

  function persistState() {
    const payload = JSON.stringify({
      schemaVersion: STORE_SCHEMA_VERSION,
      savedAt: nowISO(clock),
      profiles: state.profiles,
    });
    let ok = writeKey(STORAGE_KEYS.profiles, payload);
    ok = writeKey(STORAGE_KEYS.activeProfileId, state.activeId ?? '') && ok;
    ok = writeKey(STORAGE_KEYS.settings, JSON.stringify(state.settings)) && ok;
    meta.persistent = ok && !resolved.fallback;
    return ok;
  }

  function preserveCorrupt(raw) {
    const key = `${STORAGE_KEYS.corruptPrefix}profiles.${Date.now().toString(36)}`;
    const saved = writeKey(key, raw);
    meta.recoveredFromCorruption = true;
    meta.corruptBackupKey = saved ? key : null;
  }

  function seedProfiles() {
    state.profiles = [normalizeProfile(createKingArts13Profile(), clock)];
    state.activeId = state.profiles[0].id;
    meta.seeded = true;
  }

  function load() {
    const raw = safeGet(STORAGE_KEYS.profiles);
    let parsed = null;

    if (raw) {
      try {
        const value = JSON.parse(raw);
        const candidate = Array.isArray(value) ? { profiles: value } : value;
        if (!candidate || !Array.isArray(candidate.profiles)) {
          throw new Error('profiles payload is not an array');
        }
        parsed = candidate;
      } catch {
        preserveCorrupt(raw);
      }
    }

    if (parsed && parsed.profiles.length > 0) {
      const seen = new Set();
      state.profiles = parsed.profiles
        .filter((profile) => profile && typeof profile === 'object')
        .map((profile, index) => {
          const normalized = normalizeProfile(profile, clock);
          if (seen.has(normalized.id)) normalized.id = `${normalized.id}_${index}`;
          seen.add(normalized.id);
          return normalized;
        });
      if (state.profiles.length === 0) seedProfiles();
    } else {
      seedProfiles();
    }

    const storedActive = safeGet(STORAGE_KEYS.activeProfileId);
    state.activeId = state.profiles.some((profile) => profile.id === storedActive)
      ? storedActive
      : state.profiles[0].id;

    const rawSettings = safeGet(STORAGE_KEYS.settings);
    if (rawSettings) {
      try {
        const value = JSON.parse(rawSettings);
        if (value && typeof value === 'object') {
          state.settings = {
            ...GLOBAL_SETTINGS_DEFAULTS,
            ...value,
            lastTab: normalizeTabId(value.lastTab),
          };
        }
      } catch {
        // Global settings are cheap to rebuild; profile data is not.
      }
    }

    const autoSkipped = [];
    for (const profile of state.profiles) {
      const result = daily.applyDailyRollover(profile, nowDate(clock));
      autoSkipped.push(...result.autoSkipped);
    }
    meta.rollover = {
      date: localDateKey(nowDate(clock)),
      autoSkipped,
      at: nowISO(clock),
    };

    persistState();
  }

  function getState() {
    const profiles = deepClone(state.profiles);
    const active = profiles.find((profile) => profile.id === state.activeId) ?? profiles[0] ?? null;
    return {
      profiles,
      activeId: active?.id ?? null,
      activeProfile: active,
      settings: deepClone(state.settings),
      meta: { ...meta },
    };
  }

  function emit() {
    const snapshot = getState();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        // A broken subscriber must never break persistence.
      }
    }
  }

  function commit() {
    const ok = persistState();
    emit();
    return ok;
  }

  function findIndex(id) {
    return state.profiles.findIndex((profile) => profile.id === id);
  }

  function getProfiles() {
    return deepClone(state.profiles);
  }

  function getProfile(id) {
    const profile = state.profiles.find((entry) => entry.id === id);
    return profile ? deepClone(profile) : null;
  }

  function getActiveProfile() {
    return getProfile(state.activeId);
  }

  function getActiveId() {
    return state.activeId;
  }

  function getSettings() {
    return deepClone(state.settings);
  }

  function getMeta() {
    return { ...meta };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setActiveProfile(id) {
    if (!state.profiles.some((profile) => profile.id === id)) {
      throw new StoreError('That profile no longer exists.', 'missing-profile');
    }
    state.activeId = id;
    commit();
    return getActiveProfile();
  }

  function updateProfile(id, updater) {
    const index = findIndex(id);
    if (index < 0) throw new StoreError('Profile not found.', 'missing-profile');
    const draft = deepClone(state.profiles[index]);
    const next = typeof updater === 'function' ? updater(draft) : { ...draft, ...updater };
    if (!next || typeof next !== 'object') {
      throw new StoreError('Profile update returned no data.', 'invalid-update');
    }
    next.id = id;
    next.updatedAt = nowISO(clock);
    state.profiles[index] = normalizeProfile(next, clock);
    commit();
    return deepClone(state.profiles[index]);
  }

  function updateActiveProfile(updater) {
    return updateProfile(state.activeId, updater);
  }

  function uniqueProfileId() {
    let id = '';
    do {
      id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    } while (state.profiles.some((profile) => profile.id === id));
    return id;
  }

  /**
   * Avatar validation is driven by the single AVATAR_OPTIONS source, so all
   * six presets (ares, thief, arco, assasin, atena, magico) are accepted on
   * creation and when a profile is activated.
   */
  function normalizeAvatarInput(value) {
    if (isKnownAvatar(value)) return value;
    return value == null ? DEFAULT_AVATAR : null;
  }

  function createProfile(input = {}) {
    const name = String(input.name ?? '').trim().slice(0, 40) || 'New Player';
    const avatar = normalizeAvatarInput(input.avatar);

    const profile = createBlankProfile(name, {
      id: uniqueProfileId(),
      age: clampAge(input.age),
      birthday: input.birthday,
      avatar,
      now: nowISO(clock),
      includeDailyQuestTemplate: Boolean(input.includeDailyQuestTemplate),
      includeSideQuestTemplate: Boolean(input.includeSideQuestTemplate),
      includeBadHabitTemplate: Boolean(input.includeBadHabitTemplate),
      includeRewardTemplate: Boolean(input.includeRewardTemplate),
    });

    state.profiles.push(normalizeProfile(profile, clock));
    state.activeId = profile.id;
    commit();
    return getProfile(profile.id);
  }

  function removeProfile(id) {
    if (state.profiles.length <= 1) {
      throw new StoreError('You cannot delete the last profile.', 'last-profile');
    }
    const index = findIndex(id);
    if (index < 0) throw new StoreError('Profile not found.', 'missing-profile');
    state.profiles.splice(index, 1);
    if (state.activeId === id) state.activeId = state.profiles[0].id;
    commit();
    return state.activeId;
  }

  function updateSettings(patch = {}) {
    state.settings = {
      ...state.settings,
      ...patch,
      theme: 'dark',
      lastTab: normalizeTabId(patch.lastTab ?? state.settings.lastTab),
    };
    commit();
    return getSettings();
  }

  /** Persist the last tab without waking subscribers (the router renders next). */
  function rememberTab(id) {
    state.settings.lastTab = normalizeTabId(id);
    writeKey(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  /* ----------------------------- M3 actions ----------------------------- */

  function runOnActive(handler) {
    let result = null;
    let levelBefore = 0;
    const updated = updateActiveProfile((draft) => {
      levelBefore = levelFromXP(draft.character?.xp, CHARACTER_BASE);
      result = handler(draft, nowDate(clock));
      if (result && result.changed === false && result.error) {
        throw new StoreError(
          result.message || 'That action is not available.',
          result.code || 'action-failed',
        );
      }
      return draft;
    });
    const levelAfter = levelFromXP(updated.character?.xp, CHARACTER_BASE);
    return {
      ...(result ?? { changed: true }),
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      profile: updated,
    };
  }

  function completeDailyQuest(questId) {
    return runOnActive((profile, now) => daily.completeDailyQuest(profile, questId, now));
  }

  function skipDailyQuest(questId) {
    return runOnActive((profile, now) => daily.skipDailyQuest(profile, questId, now));
  }

  function undoDailyQuest(questId) {
    return runOnActive((profile) => daily.undoDailyQuest(profile, questId));
  }

  function setQuestStrict(questId, strict) {
    return runOnActive((profile) => daily.applyQuestStrict(profile, questId, strict));
  }

  function setStrictAll(strict) {
    return runOnActive((profile) => daily.applyStrictAll(profile, strict));
  }

  function logBadHabit(habitId) {
    return runOnActive((profile, now) => daily.logBadHabit(profile, habitId, now));
  }

  function undoBadHabit(habitId) {
    return runOnActive((profile) => daily.undoBadHabit(profile, habitId));
  }

  function saveJournal(fields) {
    return runOnActive((profile, now) => daily.saveJournalEntry(profile, fields, now));
  }

  function undoJournal(date) {
    return runOnActive((profile, now) => daily.undoJournalEntry(profile, date ?? localDateKey(now)));
  }

  /** Re-check the local date (boot, visibility change, minute timer). */
  function syncDaily() {
    const current = getActiveProfile();
    const now = nowDate(clock);
    const expectedAge = isValidDateKey(current?.birthday)
      ? ageFromBirthday(current.birthday, now)
      : null;
    const ageStale = expectedAge !== null
      && clampAge(expectedAge) !== current?.age;
    if (!ageStale && !daily.dailyRolloverDue(current, now)) {
      return {
        changed: false,
        date: localDateKey(now),
        autoSkipped: [],
        profile: current,
      };
    }
    const result = runOnActive((profile, activeNow) => {
      const rollover = daily.applyDailyRollover(profile, activeNow);
      return {
        ...rollover,
        changed: rollover.changed === true || ageStale,
      };
    });
    meta.rollover = {
      date: result.date,
      autoSkipped: result.autoSkipped,
      at: nowISO(clock),
    };
    return result;
  }

  function getDailySummary() {
    return daily.dailySummary(getActiveProfile(), nowDate(clock));
  }

  /* ----------------------------- M4 actions ----------------------------- */

  function completeSideQuest(questId) {
    return runOnActive((profile, now) => progression.completeSideQuest(profile, questId, now));
  }

  function undoSideQuest(questId) {
    return runOnActive((profile) => progression.undoSideQuest(profile, questId));
  }

  function completeMission(missionId) {
    return runOnActive((profile, now) => progression.completeMission(profile, missionId, now));
  }

  function undoMission(missionId) {
    return runOnActive((profile) => progression.undoMission(profile, missionId));
  }

  function completeGoal(goalId) {
    return runOnActive((profile, now) => progression.completeGoal(profile, goalId, now));
  }

  function undoGoal(goalId) {
    return runOnActive((profile) => progression.undoGoal(profile, goalId));
  }

  function getProgressionSummary() {
    return progression.progressionSummary(getActiveProfile());
  }

  /* ----------------------------- M5 actions ----------------------------- */

  const FINANCE_LISTS = Object.freeze({
    income: 'incomes',
    expense: 'expenses',
    asset: 'assets',
    savings: 'savings',
  });

  function financeListKey(type) {
    return FINANCE_LISTS[type] ?? null;
  }

  function requireFinanceType(type) {
    const key = financeListKey(type);
    if (!key) throw new StoreError('Unknown finance row type.', 'invalid-finance-type');
    return key;
  }

  function financeSnapshot(profile) {
    const derived = economy.deriveWealthSnapshot(profile.finance ?? {});
    return {
      totals: derived.totals,
      wealthXP: derived.wealthXP,
      wealthCoins: derived.wealthCoins,
      gold: economy.availableGold(profile),
    };
  }

  function addFinanceRow(type, row) {
    const key = requireFinanceType(type);
    return runOnActive((profile) => {
      const finance = economy.ensureStartingBalance(profile.finance || {});
      const list = Array.isArray(finance[key]) ? finance[key] : [];
      const normalized = economy.normalizeMoneyRow(
        { ...row, id: row?.id || `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` },
        type,
        list.length + 1,
      );
      if (!economy.isValidMoneyRow(normalized)) {
        throw new StoreError('Enter a name and an amount greater than zero.', 'invalid-finance-row');
      }

      finance[key] = economy.addMoneyRow(list, normalized);
      profile.finance = finance;
      economy.recomputeDerived(profile);

      return {
        changed: true,
        row: normalized,
        ...financeSnapshot(profile),
      };
    });
  }

  function updateFinanceRow(row) {
    if (!row || typeof row !== 'object') {
      throw new StoreError('Invalid finance row.', 'invalid-finance-row');
    }

    const type = String(row.type ?? '');
    if (type === 'startingBalance' || type === 'baseline') {
      return runOnActive((profile) => {
        const finance = economy.ensureStartingBalance(profile.finance || {});
        if (type === 'startingBalance') {
          finance.startingBalance = roundMoney(toNumber(row.amount, 0));
        } else {
          finance.wealthXpBaseline = Math.max(0, Math.floor(toNumber(row.wealthXpBaseline ?? row.amount, 0)));
        }
        profile.finance = finance;
        economy.recomputeDerived(profile);
        return {
          changed: true,
          type,
          ...financeSnapshot(profile),
        };
      });
    }

    const key = requireFinanceType(type);
    if (!row.id) throw new StoreError('Invalid finance row.', 'invalid-finance-row');

    return runOnActive((profile) => {
      const finance = economy.ensureStartingBalance(profile.finance || {});
      const list = Array.isArray(finance[key]) ? finance[key] : [];
      const existing = list.find((entry) => String(entry?.id) === String(row.id));
      if (!existing) throw new StoreError('That finance row no longer exists.', 'missing-finance-row');

      const normalized = economy.normalizeMoneyRow({ ...existing, ...row, id: existing.id }, type, existing.order);
      if (!economy.isValidMoneyRow(normalized)) {
        throw new StoreError('Enter a name and an amount greater than zero.', 'invalid-finance-row');
      }

      finance[key] = economy.updateMoneyRow(list, normalized);
      profile.finance = finance;
      economy.recomputeDerived(profile);

      return {
        changed: true,
        row: normalized,
        ...financeSnapshot(profile),
      };
    });
  }

  function deleteFinanceRow(type, id) {
    const key = requireFinanceType(type);
    return runOnActive((profile) => {
      const finance = economy.ensureStartingBalance(profile.finance || {});
      const list = Array.isArray(finance[key]) ? finance[key] : [];
      const next = economy.deleteMoneyRow(list, id);
      if (next.length === list.length) {
        throw new StoreError('That finance row no longer exists.', 'missing-finance-row');
      }

      finance[key] = next;
      profile.finance = finance;
      economy.recomputeDerived(profile);

      return {
        changed: true,
        deletedId: String(id),
        ...financeSnapshot(profile),
      };
    });
  }

  function getFinanceSummary() {
    return financeSnapshot(getActiveProfile());
  }

  function setFinanceCurrency(currency) {
    return runOnActive((profile) => economy.setFinanceCurrency(profile, currency));
  }

  function purchaseReward(rewardId) {
    return runOnActive((profile, now) => economy.purchaseReward(profile, rewardId, now));
  }

  function undoPurchase(purchaseId) {
    return runOnActive((profile, now) => economy.undoPurchase(profile, purchaseId, now));
  }

  function useSkipToken(questId) {
    return runOnActive((profile, now) => daily.useSkipToken(profile, questId, now));
  }

  /* ----------------------------- M6 actions ----------------------------- */

  function crudUpsert(type, payload = {}) {
    return runOnActive((profile, now) => crud.applyCrudUpsert(profile, type, payload, now));
  }

  function crudDelete(type, id) {
    return runOnActive((profile) => crud.applyCrudDelete(profile, type, id));
  }

  function updateIdentity(patch = {}) {
    return runOnActive((profile, now) => crud.updateIdentity(profile, patch, now));
  }

  function dismissBirthday() {
    return runOnActive((profile, now) => crud.dismissBirthday(profile, now));
  }

  /**
   * Change any profile's avatar from the switcher sheet. Validation stays on
   * the single AVATAR_OPTIONS source, so unknown paths are rejected.
   */
  function updateAvatar(id, avatar) {
    const next = normalizeAvatarInput(avatar);
    if (!next) throw new StoreError('That avatar is not available.', 'invalid-avatar');
    const updated = updateProfile(id, (profile) => {
      profile.avatar = next;
      return profile;
    });
    return { changed: true, id: updated.id, avatar: updated.avatar };
  }

  function updateHpSettings(patch = {}) {
    return runOnActive((profile) => crud.updateHpSettings(profile, patch));
  }

  function updatePointAwards(patch = {}) {
    return runOnActive((profile) => crud.updatePointAwards(profile, patch));
  }

  function updateWealthBaseline(value) {
    return runOnActive((profile) => {
      const finance = economy.ensureStartingBalance(profile.finance || {});
      finance.wealthXpBaseline = Math.max(0, Math.floor(toNumber(value, 0)));
      profile.finance = finance;
      economy.recomputeDerived(profile);
      return {
        changed: true,
        baseline: finance.wealthXpBaseline,
        ...financeSnapshot(profile),
      };
    });
  }

  function adjustFinanceRow(type, id, options = {}) {
    return runOnActive((profile, now) => economy.adjustFinanceAmount(profile, type, id, options, now));
  }

  function exportBackup() {
    return buildBackupPayload({
      profiles: getProfiles(),
      activeProfileId: state.activeId,
      exportedAt: nowISO(clock),
    });
  }

  function previewBackup(input) {
    return validateBackupPayload(input);
  }

  /**
   * Replace the whole profile set with a validated backup.
   * The caller must show the preview and get explicit confirmation first.
   */
  function importBackup(input) {
    const preview = validateBackupPayload(input);
    if (!preview.ok) {
      throw new StoreError(
        preview.errors[0] || 'That backup could not be imported.',
        'invalid-backup',
      );
    }

    const imported = preview.payload.profiles.map((profile) => normalizeProfile(profile, clock));
    if (imported.length === 0) {
      throw new StoreError('That backup contains no profiles.', 'invalid-backup');
    }

    const seen = new Set();
    for (const [index, profile] of imported.entries()) {
      if (seen.has(profile.id)) profile.id = `${profile.id}_${index}`;
      seen.add(profile.id);
    }

    state.profiles = imported;
    const wanted = String(preview.payload.activeProfileId ?? '');
    state.activeId = imported.some((profile) => profile.id === wanted) ? wanted : imported[0].id;
    commit();

    return {
      changed: true,
      profiles: getProfiles(),
      activeId: state.activeId,
      summary: preview.summary,
    };
  }

  load();

  return {
    storage,
    getState,
    getProfiles,
    getProfile,
    getActiveProfile,
    getActiveId,
    getSettings,
    getMeta,
    subscribe,
    setActiveProfile,
    updateProfile,
    updateActiveProfile,
    createProfile,
    removeProfile,
    updateSettings,
    rememberTab,
    completeDailyQuest,
    skipDailyQuest,
    undoDailyQuest,
    setQuestStrict,
    setStrictAll,
    logBadHabit,
    undoBadHabit,
    saveJournal,
    undoJournal,
    syncDaily,
    getDailySummary,
    completeSideQuest,
    undoSideQuest,
    completeMission,
    undoMission,
    completeGoal,
    undoGoal,
    getProgressionSummary,
    updateFinanceRow,
    addFinanceRow,
    deleteFinanceRow,
    getFinanceSummary,
    setFinanceCurrency,
    purchaseReward,
    undoPurchase,
    useSkipToken,
    crudUpsert,
    crudDelete,
    updateIdentity,
    dismissBirthday,
    updateAvatar,
    updateHpSettings,
    updatePointAwards,
    updateWealthBaseline,
    adjustFinanceRow,
    exportBackup,
    previewBackup,
    importBackup,
    deleteProfile: removeProfile,
  };
}
