/**
 * The Game of Life V2 — daily gameplay engine (M3).
 *
 * Pure domain logic on a **draft profile** (already cloned by the store):
 * daily quests, Strict-mode midnight rollover, HP guards, bad habits and the
 * once-per-day reflection journal. No DOM, no storage, no timers.
 *
 * Every mutator returns a result object; on validation failure it returns
 * `{ changed: false, error, code, message }` and leaves the draft untouched.
 */

import {
  addXP,
  applyShieldStateDelta,
  applyVitalityShieldDelta,
  applyVitalityXPToShield,
  clampXP,
  clampHP,
  damageLifespanShield,
  derivedGold,
  healLifespanShield,
  hpState,
  localDateKey,
  restoreShieldState,
  shieldSnapshot,
  shieldStateDelta,
  toNumber,
} from './formulas.js';

export const JOURNAL_MOODS = Object.freeze([
  Object.freeze({ id: 'low', emoji: '😞', label: 'Low' }),
  Object.freeze({ id: 'meh', emoji: '😕', label: 'Meh' }),
  Object.freeze({ id: 'okay', emoji: '😐', label: 'Okay' }),
  Object.freeze({ id: 'good', emoji: '🙂', label: 'Good' }),
  Object.freeze({ id: 'great', emoji: '🤩', label: 'Great' }),
]);

export const DEFAULT_JOURNAL_POINTS = Object.freeze({ xp: 10, coins: 35 });
/** Today's Reflection always feeds the Mind Core Stat. */
export const JOURNAL_CORE_STAT = 'mind';

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = value === undefined || value === null ? new Date() : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function nowStamp(now) {
  return toDate(now).toISOString();
}

function int(value) {
  return Math.max(0, Math.floor(toNumber(value, 0)));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function signedInt(value) {
  return Math.floor(toNumber(value, 0));
}

function syncGold(profile) {
  if (!profile.character) return 0;
  profile.character.goldBase = signedInt(profile.character.goldBase);
  profile.character.gold = derivedGold(profile.character.goldBase, profile.finance?.wealthCoins ?? 0);
  return profile.character.gold;
}

function addGold(profile, amount) {
  const before = signedInt(profile.character?.goldBase);
  profile.character.goldBase = before + Math.floor(toNumber(amount, 0));
  syncGold(profile);
  return profile.character.goldBase - before;
}

function takeGold(profile, amount) {
  return -addGold(profile, -Math.abs(Math.floor(toNumber(amount, 0))));
}

/** Spend Gold but never push the spendable balance below zero. */
function takeGoldClamped(profile, amount) {
  const before = signedInt(profile.character?.goldBase);
  const wanted = Math.abs(Math.floor(toNumber(amount, 0)));
  const applied = Math.min(Math.max(0, before), wanted);
  profile.character.goldBase = before - applied;
  syncGold(profile);
  return -applied;
}

function addCharacterXP(profile, amount) {
  const before = clampXP(profile.character?.xp);
  profile.character.xp = addXP(before, amount);
  return profile.character.xp - before;
}

function takeCharacterXP(profile, amount) {
  return -addCharacterXP(profile, -Math.abs(Math.floor(toNumber(amount, 0))));
}

function findQuest(profile, questId) {
  return (profile.dailyQuests ?? []).find((quest) => quest?.id === questId) ?? null;
}

function findHabit(profile, habitId) {
  return (profile.badHabits ?? []).find((habit) => habit?.id === habitId) ?? null;
}

function findSkill(profile, reference) {
  if (!reference) return null;
  const ref = String(reference);
  return (profile.skills ?? []).find(
    (skill) => skill?.id === ref || skill?.name === ref || String(skill?.name ?? '').includes(ref),
  ) ?? null;
}

function addCoreXP(profile, stat, amount, { trackVitality = true } = {}) {
  const core = stat ? profile.cores?.[stat] : null;
  if (!core) return 0;
  const before = clampXP(core.xp);
  const startingXP = Math.max(0, Math.floor(toNumber(core.startingXP, 0)));
  core.xp = addXP(before, amount);
  core.earnedXP = core.xp - startingXP;
  const applied = core.xp - before;
  if (trackVitality && stat === 'vitality' && applied !== 0) {
    applyVitalityXPToShield(profile, applied);
  }
  return applied;
}

function addSkillXP(profile, reference, amount) {
  const skill = findSkill(profile, reference);
  if (!skill) return 0;
  const before = clampXP(skill.xp);
  const startingXP = Math.max(0, Math.floor(toNumber(skill.startingXP, 0)));
  skill.xp = addXP(before, amount);
  skill.earnedXP = skill.xp - startingXP;
  return skill.xp - before;
}

function healHP(profile, amount) {
  const applied = healLifespanShield(profile, amount);
  profile.hp.updatedAt = new Date().toISOString();
  return applied;
}

function damageHP(profile, amount) {
  const applied = damageLifespanShield(profile, amount);
  profile.hp.updatedAt = new Date().toISOString();
  return applied;
}

/**
 * Reverse a recorded action's Shield effect by its deltas. This keeps any
 * Shield/buffer changes made after the action intact (order-safe Undo).
 * Actions saved before final13 only carry the old absolute snapshot.
 */
function undoShield(profile, action) {
  const keys = ['shieldDelta', 'posBufferDelta', 'negBufferDelta', 'lifespanDelta'];
  if (keys.every((key) => Number.isFinite(action?.[key]))) {
    return applyShieldStateDelta(profile, {
      shieldDelta: -action.shieldDelta,
      posBufferDelta: -action.posBufferDelta,
      negBufferDelta: -action.negBufferDelta,
      lifespanDelta: -action.lifespanDelta,
    });
  }
  return restoreShieldState(profile, action?.shield);
}

function stat(profile, key) {
  if (!profile.stats) profile.stats = {};
  return int(profile.stats[key]);
}

function bumpStat(profile, key, delta) {
  if (!profile.stats) profile.stats = {};
  profile.stats[key] = Math.max(0, stat(profile, key) + Math.round(delta));
}

/** True for the seed health quests and any quest with a heal value. */
export function isHealthQuest(quest) {
  return Boolean(quest?.isHealthQuest) || int(quest?.heal) > 0;
}

/**
 * Health/rest quests remain available while HP is 0. Health quests now charge
 * the Vitality Shield through their Vitality XP rewards instead of direct HP.
 */
export function isHealingQuest(quest) {
  return isHealthQuest(quest) || quest?.isRestQuest === true;
}

export function isRecovery(profile) {
  return toNumber(profile?.hp?.current, 0) <= 0;
}

export function questStatus(quest) {
  if (quest?.completed) return 'completed';
  if (quest?.skipped) return 'skipped';
  return 'pending';
}

export function questReward(quest) {
  const coreRewards = (Array.isArray(quest?.coreRewards) ? quest.coreRewards : [])
    .map((reward) => ({ stat: reward?.stat ?? null, xp: int(reward?.xp) }))
    .filter((reward) => reward.stat && reward.xp > 0);
  const skillRewards = (Array.isArray(quest?.skillRewards) ? quest.skillRewards : [])
    .map((reward) => ({ skill: reward?.skill ?? null, xp: int(reward?.xp) }))
    .filter((reward) => reward.skill && reward.xp > 0);
  const autoXp = [...coreRewards, ...skillRewards].reduce((sum, reward) => sum + reward.xp, 0);
  return {
    xp: autoXp,
    autoXp,
    coins: int(quest?.coins),
    heal: 0,
    coreRewards,
    skillRewards,
  };
}

export function questPenalty(quest, settings = {}) {
  const strictDamage = int(settings?.hp?.skippedHealthDamage ?? 15);
  const coreTotal = questReward(quest).coreRewards.reduce((sum, reward) => sum + reward.xp, 0);
  const coreXp = quest?.penalty?.coreXp === undefined || quest?.penalty?.coreXp === null
    ? coreTotal
    : int(quest.penalty.coreXp);
  const coreStat = quest?.penalty?.coreStat !== undefined
    ? (quest.penalty.coreStat || null)
    : (questReward(quest).coreRewards[0]?.stat ?? null);
  const coreXp2 = quest?.penalty?.coreXp2 === undefined || quest?.penalty?.coreXp2 === null
    ? 0
    : int(quest.penalty.coreXp2);
  const coreStat2 = quest?.penalty?.coreStat2 === undefined
    ? null
    : (quest.penalty.coreStat2 || null);
  const coreTargets = [];
  if (coreStat && coreXp > 0) coreTargets.push({ stat: coreStat, xp: coreXp });
  if (coreStat2 && coreXp2 > 0) coreTargets.push({ stat: coreStat2, xp: coreXp2 });
  return {
    xp: 0,
    coins: int(quest?.penalty?.coins),
    coreXp,
    coreStat,
    coreXp2,
    coreStat2,
    coreTargets,
    physical: String(quest?.physicalPenalty ?? 'Complete the quest tomorrow, no excuses'),
    hpDamage: isHealthQuest(quest) ? strictDamage : 0,
  };
}

/**
 * Split a Core XP penalty proportionally across the quest's Core rewards.
 * Largest-remainder rounding keeps the applied total exact.
 */
export function distributeCorePenalty(coreRewards = [], total = 0) {
  const rewards = (Array.isArray(coreRewards) ? coreRewards : [])
    .map((reward) => ({ stat: reward?.stat ?? null, xp: int(reward?.xp) }))
    .filter((reward) => reward.stat && reward.xp > 0);
  const amount = int(total);
  const rewardTotal = rewards.reduce((sum, reward) => sum + reward.xp, 0);
  if (amount <= 0 || rewardTotal <= 0) return [];

  const exact = rewards.map((reward) => (amount * reward.xp) / rewardTotal);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = amount - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }
  return rewards
    .map((reward, index) => ({ stat: reward.stat, xp: floors[index] }))
    .filter((reward) => reward.xp > 0);
}

function applyCorePenalty(profile, quest, amount, targetStat = undefined) {
  const target = targetStat !== undefined
    ? (targetStat || null)
    : (quest?.penalty?.coreStat !== undefined
        ? (quest.penalty.coreStat || null)
        : (questReward(quest).coreRewards[0]?.stat ?? null));
  const value = int(amount);
  if (!target || value <= 0) return [];
  // Vitality penalties must still charge the Shield when the Core Stat is
  // already clamped at 0 XP, so apply the full configured loss separately.
  const actual = addCoreXP(profile, target, -value, { trackVitality: target !== 'vitality' });
  if (target === 'vitality') applyVitalityShieldDelta(profile, -value);
  const lost = -actual;
  return lost > 0 ? [{ stat: target, xp: lost }] : [];
}

/** Apply every skip target independently; each loss is clamped at 0 XP. */
function applyCorePenaltyTargets(profile, targets = []) {
  const losses = [];
  for (const target of Array.isArray(targets) ? targets : []) {
    const stat = target?.stat ? String(target.stat) : null;
    const value = int(target?.xp);
    if (!stat || value <= 0) continue;
    const actual = addCoreXP(profile, stat, -value, { trackVitality: stat !== 'vitality' });
    if (stat === 'vitality') applyVitalityShieldDelta(profile, -value);
    const lost = -actual;
    if (lost > 0) losses.push({ stat, xp: lost });
  }
  return losses;
}

export function journalConfig(profile) {
  const points = profile?.settings?.points?.journal ?? {};
  return {
    xp: int(points.xp ?? profile?.journal?.xp ?? DEFAULT_JOURNAL_POINTS.xp),
    coins: int(points.coins ?? profile?.journal?.coins ?? DEFAULT_JOURNAL_POINTS.coins),
    coreStat: JOURNAL_CORE_STAT,
  };
}

export function journalEntryFor(profile, date = localDateKey(new Date())) {
  return (profile?.journal?.entries ?? []).find((entry) => entry?.date === date) ?? null;
}

function cleanText(value, max = 600) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMood(value) {
  return JOURNAL_MOODS.some((mood) => mood.id === value) ? value : 'okay';
}

function syncStrictFlag(profile) {
  if (!profile.settings) profile.settings = {};
  if (!profile.settings.strict) profile.settings.strict = {};
  const active = (profile.dailyQuests ?? []).filter((quest) => quest?.active !== false);
  profile.settings.strict.allDailyQuests = active.length > 0 && active.every((quest) => quest.strict === true);
  return profile.settings.strict.allDailyQuests;
}

/* ------------------------------------------------------------------ */
/* M5 tokens: free skip + rest day                                     */
/* ------------------------------------------------------------------ */

export function skipTokenCount(profile) {
  return int(profile?.tokens?.skipQuest);
}

export function isRestDay(profile, now = new Date()) {
  const date = localDateKey(toDate(now));
  return Boolean(date) && profile?.tokens?.restDay === date;
}

/**
 * Spend one shop skip token on a quest. No XP/Coin/HP penalty is applied.
 * The token is returned by `undoDailyQuest`.
 */
export function useSkipToken(profile, questId, now = new Date()) {
  const quest = findQuest(profile, questId);
  if (!quest || quest.active === false) {
    return { changed: false, error: 'missing-quest', code: 'missing-quest', message: 'That quest no longer exists.' };
  }
  if (quest.completed) {
    return { changed: false, error: 'already-completed', code: 'already-completed', message: 'That quest is already complete today.' };
  }
  if (quest.skipped) {
    return { changed: false, error: 'already-skipped', code: 'already-skipped', message: 'That quest is already skipped.' };
  }
  if (!profile.tokens || typeof profile.tokens !== 'object') profile.tokens = {};
  const before = int(profile.tokens.skipQuest);
  if (before <= 0) {
    return {
      changed: false,
      error: 'no-skip-token',
      code: 'no-skip-token',
      message: 'You have no skip tokens. Buy one in the Rewards Shop.',
    };
  }

  const date = localDateKey(toDate(now));
  profile.tokens.skipQuest = before - 1;
  quest.skipped = true;
  quest.completed = false;
  quest.skippedAt = nowStamp(now);
  quest.completedAt = null;
  quest.lastResetDate = date;
  quest.lastAction = {
    type: 'skip-token',
    at: nowStamp(now),
    tokensBefore: before,
    tokensAfter: before - 1,
    date,
  };
  bumpStat(profile, 'dailyQuestsSkipped', 1);

  return {
    changed: true,
    quest,
    penalty: { xp: 0, coins: 0, hpDamage: 0, physical: 'Skip token used: no penalty.' },
    tokenUsed: true,
    tokensBefore: before,
    tokensRemaining: before - 1,
    xp: 0,
    coins: 0,
    hpDamage: 0,
    date,
  };
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export function dailySummary(profile, now = new Date()) {
  const date = localDateKey(toDate(now));
  const quests = (profile?.dailyQuests ?? [])
    .filter((quest) => quest?.active !== false)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const habits = (profile?.badHabits ?? []).filter((habit) => habit?.active !== false);
  const completed = quests.filter((quest) => quest.completed).length;
  const skipped = quests.filter((quest) => quest.skipped).length;
  const strictCount = quests.filter((quest) => quest.strict).length;
  const hp = hpState(profile?.hp?.current, profile?.hp?.max, profile?.settings?.hp);
  const journal = journalEntryFor(profile, date);

  return {
    date,
    quests,
    habits,
    completed,
    skipped,
    pending: Math.max(0, quests.length - completed - skipped),
    total: quests.length,
    strictCount,
    allStrict: quests.length > 0 && strictCount === quests.length,
    hp,
    recovery: hp.key === 'recovery',
    hpBefore: hp.hp,
    hpMax: hp.maxHP,
    habitsClean: habits.filter((habit) => habit.lastLoggedDate !== date).length,
    habitsTotal: habits.length,
    journal,
    journalDone: Boolean(journal),
    journalConfig: journalConfig(profile),
    restDay: isRestDay(profile, now),
    skipTokens: skipTokenCount(profile),
    rewardsAvailable: quests
      .filter((quest) => !quest.completed && !quest.skipped)
      .reduce((sum, quest) => {
        const reward = questReward(quest);
        return sum + reward.autoXp + reward.coins;
      }, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Strict toggles                                                      */
/* ------------------------------------------------------------------ */

export function applyQuestStrict(profile, questId, strict) {
  const quest = findQuest(profile, questId);
  if (!quest) return { changed: false, error: 'missing-quest', message: 'That quest no longer exists.' };
  quest.strict = Boolean(strict);
  syncStrictFlag(profile);
  return { changed: true, quest, allStrict: profile.settings.strict.allDailyQuests };
}

export function applyStrictAll(profile, strict) {
  const value = Boolean(strict);
  for (const quest of profile.dailyQuests ?? []) {
    if (quest?.active !== false) quest.strict = value;
  }
  syncStrictFlag(profile);
  return { changed: true, allStrict: profile.settings.strict.allDailyQuests };
}

/* ------------------------------------------------------------------ */
/* Midnight rollover                                                   */
/* ------------------------------------------------------------------ */

function applyAutoSkip(profile, quest, now) {
  const penalty = questPenalty(quest, profile.settings);
  const coins = takeGold(profile, penalty.coins) || 0;
  const coreLoss = applyCorePenaltyTargets(profile, penalty.coreTargets);
  const hpBefore = clampHP(profile.hp?.current, profile.hp?.max);
  const hpDamage = penalty.hpDamage > 0 ? damageHP(profile, penalty.hpDamage) : 0;
  bumpStat(profile, 'dailyQuestsSkipped', 1);

  return {
    id: quest.id,
    name: quest.name,
    penaltyXp: 0,
    penaltyCoins: coins,
    coreLoss,
    hpDamage,
    hpBefore,
    hpAfter: clampHP(profile.hp?.current, profile.hp?.max),
    auto: true,
    at: nowStamp(now),
  };
}

/**
 * Idempotent local-date rollover.
 * Quests still pending from an earlier day auto-skip **once** when Strict is
 * on, then every quest is reset for today. Calling it again the same day is a
 * no-op.
 */
export function applyDailyRollover(profile, now = new Date()) {
  const date = localDateKey(toDate(now));
  if (!profile || typeof profile !== 'object') {
    return { changed: false, date, autoSkipped: [] };
  }
  if (!profile.daily || typeof profile.daily !== 'object') {
    profile.daily = { lastRolloverDate: null };
  }

  const autoSkipped = [];
  let changed = false;
  const previous = profile.daily.lastRolloverDate;
  const restDay = isRestDay(profile, now);

  if (previous && previous !== date) {
    bumpStat(profile, 'daysActive', 1);
  }

  for (const quest of profile.dailyQuests ?? []) {
    if (!quest || quest.active === false) continue;

    if (!quest.lastResetDate) {
      quest.lastResetDate = date;
      changed = true;
      continue;
    }
    if (quest.lastResetDate === date) continue;

    const pending = !quest.completed && !quest.skipped;
    const autoSkip = pending
      && !restDay
      && quest.strict === true
      && profile.settings?.strict?.autoSkipAtMidnight !== false;

    if (autoSkip) autoSkipped.push(applyAutoSkip(profile, quest, now));

    quest.completed = false;
    quest.skipped = false;
    quest.completedAt = null;
    quest.skippedAt = null;
    quest.lastAction = null;
    quest.lastResetDate = date;
    changed = true;
  }

  if (profile.daily.lastRolloverDate !== date) {
    profile.daily.lastRolloverDate = date;
    changed = true;
  }

  return { changed, date, autoSkipped, restDay };
}

/** Cheap pre-check so the store does not rewrite unchanged data every minute. */
export function dailyRolloverDue(profile, now = new Date()) {
  if (!profile) return false;
  const date = localDateKey(toDate(now));
  if (profile.daily?.lastRolloverDate !== date) return true;
  return (profile.dailyQuests ?? []).some(
    (quest) => quest?.active !== false && quest?.lastResetDate !== date,
  );
}

/* ------------------------------------------------------------------ */
/* Daily quest actions                                                 */
/* ------------------------------------------------------------------ */

export function completeDailyQuest(profile, questId, now = new Date()) {
  const quest = findQuest(profile, questId);
  if (!quest || quest.active === false) {
    return { changed: false, error: 'missing-quest', code: 'missing-quest', message: 'That quest no longer exists.' };
  }
  if (quest.completed) {
    return { changed: false, error: 'already-completed', code: 'already-completed', message: 'That quest is already complete today.' };
  }
  if (quest.skipped) {
    return { changed: false, error: 'already-skipped', code: 'already-skipped', message: 'That quest was skipped. Undo the skip first.' };
  }
  if (isRecovery(profile) && !isHealingQuest(quest)) {
    return {
      changed: false,
      error: 'recovery-locked',
      code: 'recovery-locked',
      message: 'Recovery mode: only healing or rest quests are available until HP is restored.',
    };
  }

  const reward = questReward(quest);
  const date = localDateKey(toDate(now));
  const hpBefore = clampHP(profile.hp?.current, profile.hp?.max);
  const shield = shieldSnapshot(profile);

  const coreRewards = [];
  for (const entry of reward.coreRewards) {
    const gained = addCoreXP(profile, entry.stat, entry.xp);
    if (gained > 0) coreRewards.push({ stat: entry.stat, xp: gained });
  }
  const skillRewards = [];
  for (const entry of reward.skillRewards) {
    const gained = addSkillXP(profile, entry.skill, entry.xp);
    if (gained > 0) skillRewards.push({ skill: entry.skill, xp: gained });
  }
  const autoXp = [...coreRewards, ...skillRewards].reduce((sum, entry) => sum + entry.xp, 0);
  const xp = addCharacterXP(profile, autoXp);
  const coins = addGold(profile, reward.coins);
  const heal = 0;

  quest.completed = true;
  quest.skipped = false;
  quest.completedAt = nowStamp(now);
  quest.skippedAt = null;
  quest.lastResetDate = date;
  quest.lastAction = {
    type: 'complete',
    at: nowStamp(now),
    xp,
    autoXp,
    coins,
    heal,
    coreRewards,
    skillRewards,
    shield,
    ...shieldStateDelta(shield, shieldSnapshot(profile)),
  };
  bumpStat(profile, 'dailyQuestsCompleted', 1);

  const hp = hpState(profile.hp?.current, profile.hp?.max, profile.settings?.hp);
  return {
    changed: true,
    quest,
    reward,
    xp,
    autoXp,
    coins,
    heal,
    coreRewards,
    skillRewards,
    hpBefore,
    hpAfter: hp.hp,
    recovery: hp.key === 'recovery',
    date,
  };
}

export function skipDailyQuest(profile, questId, now = new Date()) {
  const quest = findQuest(profile, questId);
  if (!quest || quest.active === false) {
    return { changed: false, error: 'missing-quest', code: 'missing-quest', message: 'That quest no longer exists.' };
  }
  if (quest.completed) {
    return { changed: false, error: 'already-completed', code: 'already-completed', message: 'That quest is already complete. Undo the completion first.' };
  }
  if (quest.skipped) {
    return { changed: false, error: 'already-skipped', code: 'already-skipped', message: 'That quest is already skipped.' };
  }
  if (isRecovery(profile)) {
    return {
      changed: false,
      error: 'recovery-locked',
      code: 'recovery-locked',
      message: 'Recovery mode: heal above 0 HP before skipping anything.',
    };
  }

  const restDay = isRestDay(profile, now);
  const penalty = restDay
    ? { xp: 0, coins: 0, hpDamage: 0, physical: 'Rest day: no penalty today.' }
    : questPenalty(quest, profile.settings);
  const strict = quest.strict === true;
  const date = localDateKey(toDate(now));
  const hpBefore = clampHP(profile.hp?.current, profile.hp?.max);
  const shield = shieldSnapshot(profile);

  const coins = takeGold(profile, penalty.coins) || 0;
  const coreLoss = restDay ? [] : applyCorePenaltyTargets(profile, penalty.coreTargets);
  const hpDamage = !restDay && strict && penalty.hpDamage > 0 ? damageHP(profile, penalty.hpDamage) : 0;

  quest.skipped = true;
  quest.completed = false;
  quest.skippedAt = nowStamp(now);
  quest.completedAt = null;
  quest.lastResetDate = date;
  quest.lastAction = {
    type: 'skip',
    at: nowStamp(now),
    xp: 0,
    coins,
    coreLoss,
    hpDamage,
    strict,
    shield,
    ...shieldStateDelta(shield, shieldSnapshot(profile)),
  };
  bumpStat(profile, 'dailyQuestsSkipped', 1);

  const hp = hpState(profile.hp?.current, profile.hp?.max, profile.settings?.hp);
  return {
    changed: true,
    quest,
    penalty,
    strict,
    xp: 0,
    coins,
    coreLoss,
    corePenalty: penalty.coreTargets ?? [],
    hpDamage,
    hpBefore,
    hpAfter: hp.hp,
    recovery: hp.key === 'recovery',
    restDay,
    date,
  };
}

export function undoDailyQuest(profile, questId) {
  const quest = findQuest(profile, questId);
  if (!quest) {
    return { changed: false, error: 'missing-quest', code: 'missing-quest', message: 'That quest no longer exists.' };
  }
  const action = quest.lastAction;
  if (!action) {
    return { changed: false, error: 'no-undo', code: 'no-undo', message: 'Nothing to undo for that quest.' };
  }

  if (action.type === 'complete') {
    takeCharacterXP(profile, action.xp);
    takeGold(profile, action.coins);
    for (const entry of action.coreRewards ?? []) {
      if (entry?.stat && entry.xp > 0) addCoreXP(profile, entry.stat, -entry.xp, { trackVitality: false });
    }
    for (const entry of action.skillRewards ?? []) {
      if (entry?.skill && entry.xp > 0) addSkillXP(profile, entry.skill, -entry.xp);
    }
    if (action.coreStat && action.coreXp > 0) addCoreXP(profile, action.coreStat, -action.coreXp, { trackVitality: false });
    if (action.skill && action.skillXp > 0) addSkillXP(profile, action.skill, -action.skillXp);
    undoShield(profile, action);
    bumpStat(profile, 'dailyQuestsCompleted', -1);
  } else if (action.type === 'skip') {
    addGold(profile, action.coins);
    for (const entry of action.coreLoss ?? []) {
      if (entry?.stat && entry.xp > 0) addCoreXP(profile, entry.stat, entry.xp, { trackVitality: false });
    }
    if (!undoShield(profile, action) && action.hpDamage > 0) healHP(profile, action.hpDamage);
    bumpStat(profile, 'dailyQuestsSkipped', -1);
  } else if (action.type === 'skip-token') {
    if (!profile.tokens || typeof profile.tokens !== 'object') profile.tokens = {};
    profile.tokens.skipQuest = int(profile.tokens.skipQuest) + 1;
    bumpStat(profile, 'dailyQuestsSkipped', -1);
  } else {
    return { changed: false, error: 'no-undo', code: 'no-undo', message: 'That action cannot be undone.' };
  }

  quest.completed = false;
  quest.skipped = false;
  quest.completedAt = null;
  quest.skippedAt = null;
  quest.lastAction = null;

  return { changed: true, quest, action, recovery: isRecovery(profile) };
}

/* ------------------------------------------------------------------ */
/* Bad habits                                                          */
/* ------------------------------------------------------------------ */

export function logBadHabit(profile, habitId, now = new Date()) {
  const habit = findHabit(profile, habitId);
  if (!habit || habit.active === false) {
    return { changed: false, error: 'missing-habit', code: 'missing-habit', message: 'That habit no longer exists.' };
  }
  if (isRecovery(profile)) {
    return {
      changed: false,
      error: 'recovery-locked',
      code: 'recovery-locked',
      message: 'Recovery mode: heal above 0 HP before logging a relapse.',
    };
  }

  const penalty = habit.penalty && typeof habit.penalty === 'object' ? habit.penalty : {};
  const date = localDateKey(toDate(now));
  const hpBefore = clampHP(profile.hp?.current, profile.hp?.max);
  const shield = shieldSnapshot(profile);
  const previousLastLoggedDate = habit.lastLoggedDate ?? null;
  const previousLogCount = int(habit.logCount);
  const applied = 0;
  const configuredCoreXp = penalty.coreStat ? int(penalty.coreXp) : 0;
  const corePenalty = configuredCoreXp > 0
    ? [{ stat: String(penalty.coreStat), xp: configuredCoreXp }]
    : [];
  const coreLoss = configuredCoreXp > 0
    ? applyCorePenalty(profile, null, configuredCoreXp, penalty.coreStat)
    : [];
  const goldLoss = int(penalty.coins) > 0 ? Math.abs(takeGoldClamped(profile, int(penalty.coins))) : 0;

  habit.lastLoggedDate = date;
  habit.logCount = previousLogCount + 1;
  habit.lastAction = {
    type: 'habit',
    at: nowStamp(now),
    hpDamage: applied,
    coreLoss,
    goldLoss,
    previousLastLoggedDate,
    previousLogCount,
    shield,
    ...shieldStateDelta(shield, shieldSnapshot(profile)),
  };
  bumpStat(profile, 'habitsLogged', 1);

  const hp = hpState(profile.hp?.current, profile.hp?.max, profile.settings?.hp);
  return {
    changed: true,
    habit,
    hpBefore,
    hpAfter: hp.hp,
    hpDamage: applied,
    coreLoss,
    corePenalty,
    goldLoss,
    recovery: hp.key === 'recovery',
    date,
  };
}

export function undoBadHabit(profile, habitId) {
  const habit = findHabit(profile, habitId);
  if (!habit) {
    return { changed: false, error: 'missing-habit', code: 'missing-habit', message: 'That habit no longer exists.' };
  }
  const action = habit.lastAction;
  if (!action || action.type !== 'habit') {
    return { changed: false, error: 'no-undo', code: 'no-undo', message: 'Nothing to undo for that habit.' };
  }

  if (action.goldLoss > 0) addGold(profile, action.goldLoss);
  for (const entry of action.coreLoss ?? []) {
    if (entry?.stat && entry.xp > 0) addCoreXP(profile, entry.stat, entry.xp, { trackVitality: false });
  }
  if (!undoShield(profile, action) && action.hpDamage > 0) healHP(profile, action.hpDamage);
  habit.lastLoggedDate = action.previousLastLoggedDate ?? null;
  habit.logCount = int(action.previousLogCount);
  habit.lastAction = null;
  bumpStat(profile, 'habitsLogged', -1);

  return { changed: true, habit, hpAfter: clampHP(profile.hp?.current, profile.hp?.max) };
}

/* ------------------------------------------------------------------ */
/* Reflection journal                                                  */
/* ------------------------------------------------------------------ */

export function saveJournalEntry(profile, fields = {}, now = new Date()) {
  if (!profile.journal) {
    profile.journal = { entries: [], lastAwardedDate: null };
  }
  if (!Array.isArray(profile.journal.entries)) profile.journal.entries = [];

  const date = localDateKey(toDate(now));
  const stamp = nowStamp(now);
  const payload = {
    mood: cleanMood(fields.mood),
    wins: cleanText(fields.wins),
    lessons: cleanText(fields.lessons),
    gratitude: cleanText(fields.gratitude),
    freeText: cleanText(fields.freeText, 2000),
  };

  const existing = journalEntryFor(profile, date);
  const config = journalConfig(profile);
  if (existing) {
    Object.assign(existing, payload, { updatedAt: stamp });
    return {
      changed: true,
      created: false,
      entry: existing,
      payout: { xp: 0, coreXp: 0, coins: 0, coreStat: config.coreStat, alreadyPaid: true },
      date,
    };
  }

  const entry = {
    id: uid('j'),
    date,
    ...payload,
    createdAt: stamp,
    updatedAt: stamp,
  };
  profile.journal.entries.push(entry);

  const due = profile.journal.lastAwardedDate !== date;
  const xp = due ? config.xp : 0;
  const coins = due ? config.coins : 0;

  if (due) {
    addCharacterXP(profile, xp);
    const coreXp = Math.max(0, addCoreXP(profile, config.coreStat, xp));
    addGold(profile, coins);
    profile.journal.lastAwardedDate = date;
    bumpStat(profile, 'journalsWritten', 1);
    profile.journal.lastAction = {
      type: 'journal',
      at: stamp,
      date,
      entryId: entry.id,
      xp,
      coreXp,
      coreStat: config.coreStat,
      coins,
    };
    return {
      changed: true,
      created: true,
      entry,
      payout: { xp, coreXp, coins, coreStat: config.coreStat, alreadyPaid: false },
      date,
    };
  }

  profile.journal.lastAction = null;
  return {
    changed: true,
    created: true,
    entry,
    payout: { xp: 0, coreXp: 0, coins: 0, coreStat: config.coreStat, alreadyPaid: true },
    date,
  };
}

export function undoJournalEntry(profile, date = localDateKey(new Date())) {
  const action = profile.journal?.lastAction;
  if (!action || action.type !== 'journal' || action.date !== date) {
    return { changed: false, error: 'no-undo', code: 'no-undo', message: 'Nothing to undo for today\'s reflection.' };
  }

  const entryId = action.entryId;
  profile.journal.entries = (profile.journal.entries ?? []).filter(
    (entry) => entry.id !== entryId && entry.date !== date,
  );
  takeCharacterXP(profile, action.xp);
  if (action.coreStat && action.coreXp > 0) addCoreXP(profile, action.coreStat, -action.coreXp);
  takeGold(profile, action.coins);
  bumpStat(profile, 'journalsWritten', -1);

  const remaining = [...profile.journal.entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  profile.journal.lastAwardedDate = remaining[0]?.date ?? null;
  profile.journal.lastAction = null;

  return { changed: true, removedId: entryId, date };
}
