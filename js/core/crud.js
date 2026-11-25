/**
 * The Game of Life V2 — M6 CRUD domain helpers (pure functions).
 *
 * Every mutator works on an already-cloned draft profile. The store owns
 * persistence and re-normalisation. Leveling formulas stay locked: only
 * editable labels, thresholds and collection rows are touched here.
 */

import {
  POINT_AWARDS,
  ageFromBirthday,
  birthdayForAge,
  isValidDateKey,
  localDateKey,
  roundMoney,
  syncLifespanState,
  toNumber,
} from './formulas.js';
import { normalizeRanks, normalizeTitles } from './titles.js';

export const CRUD_COLLECTIONS = Object.freeze({
  dailyQuest: 'dailyQuests',
  badHabit: 'badHabits',
  sideQuest: 'sideQuests',
  mission: 'missions',
  goal: 'goals',
  skill: 'skills',
  reward: 'rewards',
});

export const CRUD_LABELS = Object.freeze({
  dailyQuest: 'daily quest',
  badHabit: 'bad habit',
  sideQuest: 'side quest',
  mission: 'mission',
  goal: 'goal',
  skill: 'skill',
  reward: 'reward',
  characterTitle: 'Character Title',
  coreRank: 'Core Stat rank',
  coreStat: 'Core Stat label',
});

const ICON_MAX = 2000000;

function text(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function iconText(value) {
  return String(value ?? '').trim().slice(0, ICON_MAX);
}

function coreSlots(pairs = []) {
  return pairs
    .map(([stat, xp]) => ({ stat: text(stat, 40), xp: int(xp) }))
    .filter((reward) => reward.stat && reward.xp > 0);
}

function skillSlots(pairs = []) {
  return pairs
    .map(([skill, xp]) => ({ skill: text(skill, 80), xp: int(xp) }))
    .filter((reward) => reward.skill && reward.xp > 0);
}

function int(value) {
  return Math.max(0, Math.floor(toNumber(value, 0)));
}

function numberOr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return Math.max(0, Math.floor(toNumber(value, fallback)));
}

function bool(value) {
  return value === true || value === 'true' || value === 'on' || value === 1;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, toNumber(value, 0)));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextOrder(existing, list) {
  if (existing && Number.isFinite(Number(existing.order))) return Number(existing.order);
  return list.reduce((max, row) => Math.max(max, Number(row?.order) || 0), 0) + 1;
}

function slugId(name, prefix, list) {
  const base = text(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'item';
  let id = `${prefix}_${base}`;
  let suffix = 2;
  while (list.some((row) => String(row?.id) === id)) {
    id = `${prefix}_${base}_${suffix}`;
    suffix += 1;
  }
  return id;
}

function fail(code, message) {
  return { changed: false, error: code, code, message };
}

/* ------------------------------------------------------------------ */
/* Row builders                                                        */
/* ------------------------------------------------------------------ */

function buildDailyQuest(payload, existing, list, profile, now) {
  // The editor no longer exposes direct HP healing. Editing a quest keeps its
  // stored heal value; only an explicit payload.heal can change it.
  const heal = payload.heal === undefined ? int(existing?.heal) : int(payload.heal);
  const healthFlag = payload.isHealthQuest === undefined
    ? existing?.isHealthQuest === true
    : bool(payload.isHealthQuest);
  const coreRewards = coreSlots([
    [payload.coreStat1, payload.coreXp1],
    [payload.coreStat2, payload.coreXp2],
  ]);
  const skillRewards = skillSlots([
    [payload.skill1, payload.skillXp1],
    [payload.skill2, payload.skillXp2],
  ]);
  const autoXp = [...coreRewards, ...skillRewards]
    .reduce((sum, reward) => sum + reward.xp, 0);
  const penaltyCoreXp = payload.penaltyCoreXp === undefined || payload.penaltyCoreXp === ''
    ? int(existing?.penalty?.coreXp ?? coreRewards.reduce((sum, reward) => sum + reward.xp, 0))
    : int(payload.penaltyCoreXp);
  const penaltyCoreStat = payload.penaltyCoreStat === undefined
    ? (existing?.penalty?.coreStat ?? coreRewards[0]?.stat ?? null)
    : (text(payload.penaltyCoreStat, 40) || null);
  const penaltyCoreXp2 = payload.penaltyCoreXp2 === undefined || payload.penaltyCoreXp2 === ''
    ? int(existing?.penalty?.coreXp2 ?? 0)
    : int(payload.penaltyCoreXp2);
  const penaltyCoreStat2 = payload.penaltyCoreStat2 === undefined
    ? (existing?.penalty?.coreStat2 ?? null)
    : (text(payload.penaltyCoreStat2, 40) || null);
  return {
    ...existing,
    id: existing?.id ?? (text(payload.id, 80) || uid('dq')),
    name: text(payload.name, 90),
    icon: iconText(payload.icon) || null,
    xp: int(payload.xp) > 0 ? int(payload.xp) : autoXp,
    coins: int(payload.coins),
    penalty: {
      xp: 0,
      coins: int(payload.penaltyCoins ?? existing?.penalty?.coins),
      coreXp: penaltyCoreXp,
      coreStat: penaltyCoreStat,
      coreXp2: penaltyCoreXp2,
      coreStat2: penaltyCoreStat2,
    },
    physicalPenalty: text(payload.physicalPenalty, 180),
    heal,
    isHealthQuest: heal > 0 || healthFlag,
    coreRewards,
    skillRewards,
    coreStat: coreRewards[0]?.stat ?? null,
    coreXp: coreRewards[0]?.xp ?? 0,
    skill: skillRewards[0]?.skill ?? null,
    skillXp: skillRewards[0]?.xp ?? 0,
    strict: bool(payload.strict),
    completed: existing?.completed === true,
    skipped: existing?.skipped === true,
    completedAt: existing?.completedAt ?? null,
    skippedAt: existing?.skippedAt ?? null,
    lastResetDate: existing?.lastResetDate ?? localDateKey(now),
    lastAction: existing?.lastAction ?? null,
    order: nextOrder(existing, list),
    active: payload.active !== false,
  };
}

function buildBadHabit(payload, existing, list) {
  const previousPenalty = existing?.penalty && typeof existing.penalty === 'object' ? existing.penalty : {};
  const coreStatRaw = payload.penaltyCoreStat === undefined
    ? (previousPenalty.coreStat ?? null)
    : (text(payload.penaltyCoreStat, 40) || null);
  const coreXp = payload.penaltyCoreXp === undefined
    ? int(previousPenalty.coreXp)
    : int(payload.penaltyCoreXp);
  const coins = payload.penaltyCoins === undefined
    ? int(previousPenalty.coins)
    : int(payload.penaltyCoins);
  return {
    ...existing,
    id: existing?.id ?? (text(payload.id) || uid('bh')),
    name: text(payload.name, 90),
    icon: iconText(payload.icon) || null,
    emoji: text(payload.emoji, 12) || existing?.emoji || '⚠️',
    hpDamage: 0,
    penalty: {
      coreStat: coreStatRaw,
      coreXp,
      coins,
    },
    legacyPoints: {
      xp: int(payload.legacyXp ?? existing?.legacyPoints?.xp),
      coins: int(payload.legacyCoins ?? existing?.legacyPoints?.coins),
    },
    active: payload.active !== false,
    lastLoggedDate: existing?.lastLoggedDate ?? null,
    logCount: int(existing?.logCount),
    lastAction: existing?.lastAction ?? null,
    order: nextOrder(existing, list),
  };
}

function buildSideQuest(payload, existing, list) {
  const cores = coreSlots([
    [payload.coreStat1, payload.coreXp1],
    [payload.coreStat2, payload.coreXp2],
  ]);
  const skills = skillSlots([
    [payload.skill1, payload.skillXp1],
    [payload.skill2, payload.skillXp2],
  ]);

  return {
    ...existing,
    id: existing?.id ?? (text(payload.id, 80) || uid('sq')),
    name: text(payload.name, 110),
    type: payload.type === 'secret' ? 'secret' : 'side',
    icon: iconText(payload.icon) || null,
    coins: int(payload.coins),
    coreRewards: cores,
    skillRewards: skills,
    message: text(payload.message, 180),
    repeatable: bool(payload.repeatable),
    active: payload.active !== false,
    completed: existing?.completed === true,
    completedAt: existing?.completedAt ?? null,
    completions: int(existing?.completions),
    lastAction: existing?.lastAction ?? null,
    order: nextOrder(existing, list),
  };
}

function parseTasks(payload, existing) {
  const raw = Array.isArray(payload.tasks) ? payload.tasks.join('\n') : String(payload.tasksText ?? '');
  const titles = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const previous = Array.isArray(existing?.tasks) ? existing.tasks : [];
  return titles.map((title) => {
    const match = previous.find((task) => String(task?.title) === title);
    return {
      id: match?.id ?? uid('task'),
      title,
      done: match?.done === true,
    };
  });
}

function buildMission(payload, existing, list, profile) {
  const progressPercent = numberOr(payload.progressPercent, Math.round((Number(existing?.progress) || 0) * 100));
  return {
    ...existing,
    id: existing?.id ?? (text(payload.id, 80) || uid('m')),
    name: text(payload.name, 120),
    goalId: text(payload.goalId, 80) || null,
    xp: numberOr(payload.xp, existing?.xp ?? 500),
    coins: numberOr(payload.coins, existing?.coins ?? 1000),
    status: text(payload.status, 30) || existing?.status || 'not-started',
    completed: existing?.completed === true,
    completedAt: existing?.completedAt ?? null,
    startDate: text(payload.startDate, 20) || null,
    endDate: text(payload.endDate, 20) || null,
    progress: Math.min(1, Math.max(0, progressPercent / 100)),
    tasks: parseTasks(payload, existing),
    lastAction: existing?.lastAction ?? null,
    order: nextOrder(existing, list),
  };
}

function buildGoal(payload, existing, list, profile) {
  const knownMissions = new Set((profile?.missions ?? []).map((mission) => String(mission.id)));
  const rawIds = Array.isArray(payload.missionIds)
    ? payload.missionIds
    : String(payload.missionIds ?? '').split(',');
  const missionIds = rawIds
    .map((id) => String(id).trim())
    .filter((id) => id && knownMissions.has(id));
  const progressPercent = numberOr(payload.progressPercent, Math.round((Number(existing?.progress) || 0) * 100));
  return {
    ...existing,
    id: existing?.id ?? (text(payload.id, 80) || uid('g')),
    name: text(payload.name, 120),
    xp: numberOr(payload.xp, existing?.xp ?? 10000),
    coins: numberOr(payload.coins, existing?.coins ?? 20000),
    status: text(payload.status, 30) || existing?.status || 'active',
    completed: existing?.completed === true,
    completedAt: existing?.completedAt ?? null,
    startDate: text(payload.startDate, 20) || null,
    endDate: text(payload.endDate, 20) || null,
    progress: Math.min(1, Math.max(0, progressPercent / 100)),
    missionIds,
    lastAction: existing?.lastAction ?? null,
    order: nextOrder(existing, list),
  };
}

function buildSkill(payload, existing, list) {
  const name = text(payload.name, 90);
  const startingXP = payload.startingXP === undefined || payload.startingXP === ''
    ? int(existing?.startingXP)
    : int(payload.startingXP);
  const earnedXP = payload.earnedXP === undefined || payload.earnedXP === ''
    ? (existing?.earnedXP !== undefined
        ? Math.floor(toNumber(existing.earnedXP, 0))
        : int(existing?.xp) - startingXP)
    : Math.floor(toNumber(payload.earnedXP, 0));
  return {
    ...existing,
    id: existing?.id ?? slugId(name, 'skill', list),
    name,
    icon: iconText(payload.icon) || null,
    startingXP,
    earnedXP,
    xp: Math.max(0, startingXP + earnedXP),
    active: payload.active !== false,
  };
}

function buildReward(payload, existing, list) {
  return {
    ...existing,
    id: existing?.id ?? (text(payload.id) || uid('rw')),
    name: text(payload.name, 110),
    price: int(payload.price),
    icon: iconText(payload.icon) || null,
    purchaseCount: int(existing?.purchaseCount),
    active: payload.active !== false,
    undoable: true,
    lastPurchasedAt: existing?.lastPurchasedAt ?? null,
    order: nextOrder(existing, list),
  };
}

const BUILDERS = Object.freeze({
  dailyQuest: buildDailyQuest,
  badHabit: buildBadHabit,
  sideQuest: buildSideQuest,
  mission: buildMission,
  goal: buildGoal,
  skill: buildSkill,
  reward: buildReward,
});

/* ------------------------------------------------------------------ */
/* Upsert / delete                                                     */
/* ------------------------------------------------------------------ */

export function applyCrudUpsert(profile, type, payload = {}, now = new Date()) {
  if (type === 'characterTitle') return updateTitle(profile, payload.id, payload);
  if (type === 'coreRank') return updateRank(profile, payload.statKey, payload.id, payload);
  if (type === 'coreStat') return updateCoreStatMeta(profile, payload.statKey, payload);

  const key = CRUD_COLLECTIONS[type];
  const builder = BUILDERS[type];
  if (!key || !builder) return fail('unknown-crud-type', 'That editor is not available.');

  const list = Array.isArray(profile[key]) ? profile[key] : [];
  const id = text(payload.id);
  const existing = id ? list.find((row) => String(row?.id) === id) ?? null : null;
  if (id && !existing) return fail('missing-crud-row', 'That item no longer exists.');

  const row = builder(payload, existing, list, profile, now);
  if (!String(row.name ?? '').trim()) {
    return fail('invalid-crud-row', 'Enter a name before saving.');
  }

  profile[key] = existing
    ? list.map((entry) => (String(entry?.id) === String(row.id) ? row : entry))
    : [...list, row];

  return { changed: true, type, id: row.id, item: row };
}

function cleanupReferences(profile, type, id) {
  if (type === 'skill') {
    for (const quest of profile.sideQuests ?? []) {
      quest.skillRewards = (quest.skillRewards ?? []).filter((reward) => String(reward.skill) !== String(id));
    }
  }
  if (type === 'mission') {
    for (const goal of profile.goals ?? []) {
      goal.missionIds = (goal.missionIds ?? []).filter((missionId) => String(missionId) !== String(id));
    }
  }
  if (type === 'goal') {
    for (const mission of profile.missions ?? []) {
      if (String(mission.goalId) === String(id)) mission.goalId = null;
    }
  }
}

export function applyCrudDelete(profile, type, id) {
  const key = CRUD_COLLECTIONS[type];
  if (!key) return fail('unknown-crud-type', 'That item cannot be deleted here.');
  const list = Array.isArray(profile[key]) ? profile[key] : [];
  const next = list.filter((row) => String(row?.id) !== String(id));
  if (next.length === list.length) return fail('missing-crud-row', 'That item no longer exists.');
  profile[key] = next;
  cleanupReferences(profile, type, id);
  return { changed: true, type, deletedId: String(id) };
}

/* ------------------------------------------------------------------ */
/* Titles, ranks and Core Stat labels                                   */
/* ------------------------------------------------------------------ */

export function updateTitle(profile, id, patch = {}) {
  const titles = Array.isArray(profile.titles) ? profile.titles : [];
  const existing = titles.find((title) => String(title.id) === String(id)) ?? null;
  if (!existing) return fail('missing-title', 'That Character Title no longer exists.');

  const next = titles.map((title) => (
    String(title.id) === String(id)
      ? {
          ...title,
          name: text(patch.name, 70) || title.name,
          minLevel: Math.max(0, Math.floor(toNumber(patch.minLevel, title.minLevel))),
        }
      : title
  ));
  profile.titles = normalizeTitles(next);
  return {
    changed: true,
    type: 'characterTitle',
    id: existing.id,
    item: profile.titles.find((title) => String(title.id) === String(existing.id)) ?? profile.titles[0],
  };
}

export function updateRank(profile, statKey, rankId, patch = {}) {
  const key = text(statKey, 40);
  const track = profile.rankTracks?.[key];
  if (!track) return fail('missing-rank-track', 'That Core Stat rank track does not exist.');
  const ranks = Array.isArray(track.ranks) ? track.ranks : [];
  const existing = ranks.find((rank) => String(rank.id) === String(rankId)) ?? null;
  if (!existing) return fail('missing-rank', 'That rank no longer exists.');

  const rawMax = patch.maxLevel;
  const maxLevel = rawMax === '' || rawMax === null || rawMax === undefined
    ? null
    : Math.max(0, Math.floor(toNumber(rawMax, existing.maxLevel ?? 0)));

  const next = ranks.map((rank) => (
    String(rank.id) === String(existing.id)
      ? { ...rank, name: text(patch.name, 70) || rank.name, maxLevel }
      : rank
  ));
  profile.rankTracks[key] = { ...track, ranks: normalizeRanks({ ranks: next }) };
  return {
    changed: true,
    type: 'coreRank',
    id: existing.id,
    statKey: key,
    item: profile.rankTracks[key].ranks.find((rank) => String(rank.id) === String(existing.id))
      ?? profile.rankTracks[key].ranks[0],
  };
}

export function updateCoreStatMeta(profile, statKey, patch = {}) {
  const key = text(statKey, 40);
  const track = profile.rankTracks?.[key];
  if (!track) return fail('missing-core-stat', 'That Core Stat does not exist.');
  const label = text(patch.label, 50) || track.label;
  const icon = patch.icon === undefined ? (track.icon ?? track.emoji) : iconText(patch.icon);
  const isImage = /^data:image\//i.test(String(icon ?? '')) || /^(?:\.\/)?icons\//i.test(String(icon ?? ''));
  const emoji = isImage ? (track.emoji || '✨') : (text(icon, 12) || track.emoji || '✨');
  const display = isImage ? label : `${emoji} ${label}`;
  const startingXP = patch.startingXP === undefined
    ? int(track.startingXP)
    : int(patch.startingXP);

  let ranks = Array.isArray(track.ranks) ? track.ranks : [];
  if (Array.isArray(patch.ranks) && patch.ranks.length) {
    const nextRanks = patch.ranks.slice(0, 7).map((patchRank, index) => {
      const current = ranks.find((rank) => String(rank?.id) === String(patchRank?.id))
        ?? ranks[index]
        ?? {};
      const last = index === patch.ranks.length - 1;
      return {
        ...current,
        id: current.id ?? `rank_${key}_${index + 1}`,
        name: text(patchRank?.name, 70) || current.name || `Rank ${index + 1}`,
        maxLevel: last || patchRank?.maxLevel === null || patchRank?.maxLevel === undefined
          ? null
          : int(patchRank.maxLevel),
      };
    });
    ranks = normalizeRanks({ ranks: nextRanks });
    // The seventh rank is always the open-ended cap.
    if (ranks.length > 7) ranks = ranks.slice(0, 7);
    if (ranks.length) ranks[ranks.length - 1] = { ...ranks[ranks.length - 1], maxLevel: null };
  }

  profile.rankTracks[key] = {
    ...track,
    label,
    icon,
    emoji,
    display,
    startingXP,
    ranks,
  };

  const core = profile.cores?.[key];
  if (core) {
    core.startingXP = startingXP;
    if (key === 'wealth') {
      core.earnedXP = int(core.xp) - startingXP;
    } else {
      const earnedXP = core.earnedXP !== undefined
        ? Math.floor(toNumber(core.earnedXP, 0))
        : int(core.xp) - startingXP;
      core.earnedXP = earnedXP;
      core.xp = Math.max(0, startingXP + earnedXP);
    }
  }

  return {
    changed: true,
    type: 'coreStat',
    id: key,
    statKey: key,
    item: profile.rankTracks[key],
  };
}

/* ------------------------------------------------------------------ */
/* Profile settings                                                    */
/* ------------------------------------------------------------------ */

function clearStaleBonus(profile) {
  if (!profile.hp || typeof profile.hp !== 'object') return;
  // Age only rescales the base Lifespan. The bonus is owned by Shield
  // rollover / Shield-break overflow, so never subtract from it here.
  // Older builds derived a negative bonus from the age curve; clear only
  // that stale negative while preserving any earned positive bonus.
  profile.hp.lifespanBonusHP = Math.max(
    0,
    Math.floor(toNumber(profile.hp.lifespanBonusHP, 0)),
  );
}

/**
 * Identity is birthday-first. Saving an age keeps legacy callers working by
 * regenerating a birthday that matches that age today; saving a birthday
 * derives the age and keeps them locked together forever.
 */
export function updateIdentity(profile, patch = {}, now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  let ageChanged = false;

  if (patch.name !== undefined) {
    profile.name = text(patch.name, 40) || profile.name;
  }

  if (patch.birthday !== undefined) {
    const raw = String(patch.birthday ?? '').trim();
    if (raw && !isValidDateKey(raw)) {
      return fail('invalid-birthday', 'Enter a valid birthday.');
    }
    const birthday = raw || birthdayForAge(profile.age, today);
    if (!birthday) {
      return fail('invalid-birthday', 'Enter a valid birthday.');
    }
    const derived = ageFromBirthday(birthday, today);
    if (derived === null || derived < 0) {
      return fail('invalid-birthday', 'Birthday cannot be in the future.');
    }
    profile.birthday = birthday;
    const nextAge = Math.max(0, Math.min(85, Math.floor(derived)));
    if (nextAge !== profile.age) {
      profile.age = nextAge;
      ageChanged = true;
    }
    if (!raw) {
      // Clearing a birthday synthesizes one from the current age; do not greet.
      profile.birthdayGreetedYear = today.getFullYear();
    }
  } else if (patch.age !== undefined) {
    const age = Number(patch.age);
    const nextAge = Number.isFinite(age)
      ? Math.max(0, Math.min(85, Math.floor(age)))
      : profile.age;
    if (nextAge !== profile.age) {
      profile.age = nextAge;
      profile.birthday = birthdayForAge(nextAge, today);
      profile.birthdayGreetedYear = today.getFullYear();
      ageChanged = true;
    }
  }

  if (ageChanged) {
    clearStaleBonus(profile);
    syncLifespanState(profile);
  }

  return {
    changed: true,
    name: profile.name,
    age: profile.age,
    birthday: profile.birthday,
  };
}

/** Record that this year's birthday banner was acknowledged. */
export function dismissBirthday(profile, now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  profile.birthdayGreetedYear = today.getFullYear();
  return { changed: true, year: profile.birthdayGreetedYear };
}

export function updateHpSettings(profile, patch = {}) {
  const hp = { ...(profile.settings?.hp ?? {}) };
  for (const key of ['exhaustedPercent', 'woundedPercent']) {
    if (patch[key] !== undefined && patch[key] !== '') hp[key] = int(patch[key]);
  }
  // Vitality Shield tuning: a shield point always needs at least 1 XP of feed.
  for (const key of ['shieldGainXP', 'shieldLossXP']) {
    if (patch[key] !== undefined && patch[key] !== '') hp[key] = Math.max(1, int(patch[key]));
  }
  profile.settings = { ...(profile.settings ?? {}), hp };

  return { changed: true, hp: { ...hp } };
}

export function updatePointAwards(profile, patch = {}) {
  const base = profile.settings?.points ?? {};
  const points = {
    journal: { ...(base.journal ?? POINT_AWARDS.journal) },
    mission: { ...(base.mission ?? POINT_AWARDS.mission) },
    goal: { ...(base.goal ?? POINT_AWARDS.goal) },
  };

  for (const type of ['mission', 'goal', 'journal']) {
    for (const key of ['xp', 'coins']) {
      const field = type + (key === 'xp' ? 'Xp' : 'Coins');
      if (patch[field] !== undefined && patch[field] !== '') points[type][key] = int(patch[field]);
    }
  }

  profile.settings = { ...(profile.settings ?? {}), points };
  if (profile.journal) {
    profile.journal.xp = points.journal.xp;
    profile.journal.coins = points.journal.coins;
  }

  return { changed: true, points };
}

/* ------------------------------------------------------------------ */
/* Helpers used by Finance adjustments and tests                       */
/* ------------------------------------------------------------------ */

export function normalizeAdjustmentAmount(value) {
  return roundMoney(Math.abs(toNumber(value, 0)));
}

export function clampProgress(value) {
  return clamp01(value);
}
