/**
 * Automated parity suite — M1.
 *
 * Runs in the browser (no Node). Verifies the permanent math and that the
 * King.Arts13 seed matches the Notion export exactly.
 */

import {
  CHARACTER_BASE,
  CORE_BASE,
  SKILL_BASE,
  POINT_AWARDS,
  levelFromXP,
  nextLevelXP,
  startLevelXP,
  levelInfo,
  addXP,
  clampXP,
  maxHPForAge,
  applyHPDelta,
  hpState,
  HP_DEFAULTS,
  LIFESPAN_DENOMINATOR,
  SHIELD_MAX,
  baseLifespan,
  lifespanHPFor,
  shieldConfig,
  applyVitalityXPToShield,
  healLifespanShield,
  damageLifespanShield,
  shieldSnapshot,
  restoreShieldState,
  syncLifespanState,
  computeFinanceTotals,
  wealthXPFor,
  wealthCoinsFor,
  derivedGold,
  localDateKey,
  ageFromBirthday,
  shouldGreetBirthday,
  isStrictSkipDue,
  roundMoney,
  formatMoney,
  currencySymbol,
  normalizeCurrency,
  CURRENCIES,
} from '../core/formulas.js';
import {
  DEFAULT_CHARACTER_TITLES,
  DEFAULT_RANK_TRACKS,
  CORE_STAT_ORDER,
  characterTitleForLevel,
  rankForLevel,
} from '../core/titles.js';
import {
  createKingArts13Profile,
  createBlankProfile,
  recomputeDerived,
  KING_ARTS13_EXPECTED,
} from '../data/seed.js';
import {
  createProfileStore,
  createMemoryStorage,
  normalizeProfile,
  STORAGE_KEYS,
} from '../data/store.js';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  profileInitials,
  profileView,
} from '../core/profile.js';
import {
  TABS,
  DEFAULT_TAB,
  normalizeTabId,
  tabIdFromHash,
} from '../core/navigation.js';
import {
  JOURNAL_MOODS,
  applyDailyRollover,
  applyQuestStrict,
  applyStrictAll,
  completeDailyQuest,
  dailySummary,
  isRecovery,
  isRestDay,
  logBadHabit,
  saveJournalEntry,
  skipDailyQuest,
  skipTokenCount,
  undoBadHabit,
  undoDailyQuest,
  undoJournalEntry,
} from '../core/daily.js';
import {
  REST_DAY_REWARD_ID,
  SKIP_TOKEN_REWARD_ID,
  availableGold,
  deriveWealthSnapshot,
  isAffordable,
  isRestDayReward,
  isSkipTokenReward,
  purchaseReward as purchaseRewardDomain,
} from '../core/economy.js';
import {
  completeGoal,
  completeMission,
  completeSideQuest,
  goalProgress,
  progressionSummary,
  recalculateGoalProgress,
  undoGoal,
  undoMission,
  undoSideQuest,
} from '../core/progression.js';
import { buildCelebrationModel, shouldCelebrate } from '../ui/celebration.js';
import {
  PWA_CACHE_PREFIX,
  PWA_CACHE_VERSION,
  PWA_LEGACY_CACHE_PREFIXES,
  PWA_MANIFEST,
  PWA_OFFLINE_PAGE,
  PWA_PRECACHE,
  iconCount,
  isShellAsset,
} from '../core/pwa.js';
import { BACKUP_KIND, BACKUP_SCHEMA_VERSION } from '../core/backup.js';

function fmt(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function close(actual, expected, epsilon = 0.005) {
  return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}

/** Build the result collector. */
export function runParityTests() {
  const results = [];
  const startedAt = performance.now();

  const test = (name, fn) => {
    try {
      const detail = fn();
      results.push({ name, ok: true, detail: detail ?? '' });
    } catch (error) {
      results.push({ name, ok: false, detail: error?.message || String(error) });
    }
  };

  const eq = (actual, expected, label = 'value') => {
    if (!Object.is(actual, expected)) {
      throw new Error(`${label}: expected ${fmt(expected)}, got ${fmt(actual)}`);
    }
  };

  const near = (actual, expected, label = 'value') => {
    if (!close(actual, expected)) {
      throw new Error(`${label}: expected ${fmt(expected)}, got ${fmt(actual)}`);
    }
  };

  const truthy = (value, label = 'value') => {
    if (!value) throw new Error(`${label}: expected truthy, got ${fmt(value)}`);
  };

  /* ------------------------------- math ------------------------------- */

  test('Constants are permanent (250 / 100 / 100)', () => {
    eq(CHARACTER_BASE, 250, 'character base');
    eq(CORE_BASE, 100, 'core base');
    eq(SKILL_BASE, 100, 'skill base');
  });

  test('Character level: level(6548, 250) = 6', () => {
    eq(levelFromXP(6548, 250), 6, 'level');
    eq(nextLevelXP(6, 250), 7000, 'next threshold');
    eq(startLevelXP(6, 250), 5250, 'level start');
  });

  test('Character display: 6548 / 7000 = 93%', () => {
    const info = levelInfo(6548, 250);
    eq(info.level, 6, 'level');
    eq(info.nextLevelXP, 7000, 'threshold');
    eq(info.percent, 93, 'percent');
    eq(info.xpToNextLevel, 452, 'remaining');
  });

  test('Level curve boundaries at BASE 250', () => {
    eq(levelFromXP(0, 250), 0, 'xp 0');
    eq(levelFromXP(249, 250), 0, 'xp 249');
    eq(levelFromXP(250, 250), 1, 'xp 250');
    eq(levelFromXP(749, 250), 1, 'xp 749');
    eq(levelFromXP(750, 250), 2, 'xp 750');
    eq(nextLevelXP(0, 250), 250, 'L0 threshold');
    eq(nextLevelXP(1, 250), 750, 'L1 threshold');
    eq(nextLevelXP(2, 250), 1500, 'L2 threshold');
  });

  test('XP never goes negative', () => {
    eq(clampXP(-20), 0, 'clamp');
    eq(addXP(5, -10), 0, 'addXP');
    eq(levelFromXP(-999, 100), 0, 'negative level');
  });

  test('Golden core levels/thresholds', () => {
    const cases = [
      [1082, 4, 1500],
      [470, 2, 600],
      [30, 0, 100],
      [150, 1, 300],
      [680, 3, 1000],
      [1588, 5, 2100],
      [510, 2, 600],
      [350, 2, 600],
      [458, 2, 600],
      [200, 1, 300],
      [410, 2, 600],
    ];
    for (const [xp, level, threshold] of cases) {
      eq(levelFromXP(xp, 100), level, `level(${xp})`);
      eq(nextLevelXP(level, 100), threshold, `next(${level})`);
    }
  });

  test('startLevelXP and xpIntoLevel are consistent', () => {
    eq(startLevelXP(4, 100), 1000, 'start L4');
    const info = levelInfo(1082, 100);
    eq(info.xpIntoLevel, 82, 'into level');
    eq(info.xpForNextLevel, 500, 'span');
  });

  /* ------------------------------ titles ------------------------------ */

  test('Ten Character Titles are pre-loaded', () => {
    eq(DEFAULT_CHARACTER_TITLES.length, 10, 'title count');
    eq(DEFAULT_CHARACTER_TITLES[0].name, '🌱 The Seeker', 'first title');
    eq(DEFAULT_CHARACTER_TITLES[9].name, '👑 Life Sovereign', 'last title');
  });

  test('Title thresholds match Titles_and_coins', () => {
    const expected = [
      [0, '🌱 The Seeker'],
      [9, '🌱 The Seeker'],
      [10, '🧭 Path Aligner'],
      [24, '🧭 Path Aligner'],
      [25, '🛠️ Skill Artisan'],
      [49, '🛠️ Skill Artisan'],
      [50, '🌌 Inner Voyager'],
      [74, '🌌 Inner Voyager'],
      [75, '⚙️ Freedom Forger'],
      [99, '⚙️ Freedom Forger'],
      [100, '🕊️ Harmony Architect'],
      [124, '🕊️ Harmony Architect'],
      [125, '✨ Purpose Bringer'],
      [149, '✨ Purpose Bringer'],
      [150, '🔮 Legacy Weaver'],
      [174, '🔮 Legacy Weaver'],
      [175, '🌠 Realm Uplifter'],
      [199, '🌠 Realm Uplifter'],
      [200, '👑 Life Sovereign'],
      [999, '👑 Life Sovereign'],
    ];
    for (const [level, name] of expected) {
      eq(characterTitleForLevel(level).name, name, `level ${level}`);
    }
  });

  test('Six rank tracks × seven ranks', () => {
    eq(CORE_STAT_ORDER.length, 6, 'stat count');
    for (const key of CORE_STAT_ORDER) {
      const track = DEFAULT_RANK_TRACKS[key];
      truthy(track, `track ${key}`);
      eq(track.ranks.length, 7, `${key} ranks`);
      eq(track.ranks.at(-1).maxLevel, null, `${key} open-ended`);
    }
  });

  test('Rank lookups match the Notion tracks', () => {
    eq(rankForLevel(0, DEFAULT_RANK_TRACKS.vitality).name, '🐣 Novice', 'vitality 0');
    eq(rankForLevel(4, DEFAULT_RANK_TRACKS.discipline).name, '🛠️ Apprentice', 'discipline 4');
    eq(rankForLevel(3, DEFAULT_RANK_TRACKS.creativity).name, '🐣 Novice', 'creativity 3');
    eq(rankForLevel(7, DEFAULT_RANK_TRACKS.creativity).name, '📘 Practitioner', 'creativity 7');
    eq(rankForLevel(25, DEFAULT_RANK_TRACKS.mind).name, '📚 Thinker', 'mind 25');
    eq(rankForLevel(26, DEFAULT_RANK_TRACKS.mind).name, '🧩 Mind Sculptor', 'mind 26');
    eq(rankForLevel(51, DEFAULT_RANK_TRACKS.wealth).name, '🧾 Strategic Earner', 'wealth 51');
    eq(rankForLevel(100, DEFAULT_RANK_TRACKS.connection).name, '🕊️ Legacy Connector', 'connection 100');
  });

  /* ------------------------------- seed ------------------------------- */

  const king = createKingArts13Profile();

  test('Seed identity and character parity', () => {
    eq(king.id, KING_ARTS13_EXPECTED.id, 'id');
    eq(king.name, 'King.Arts13', 'name');
    eq(king.character.xp, 6548, 'xp');
    eq(levelFromXP(king.character.xp, 250), 6, 'level');
    eq(king.character.gold, 804, 'gold');
    eq(king.character.goldBase, 794, 'gold base');
    eq(king.character.legacyCoinsNumber, 1308, 'legacy coins');
    eq(king.hp.base, 706, 'base lifespan hp');
    eq(king.hp.current, 706, 'current lifespan hp');
    eq(king.hp.max, LIFESPAN_DENOMINATOR, 'lifespan denominator');
    eq(king.hp.max, 1000, 'lifespan shown out of 1000');
    eq(king.age, 25, 'age');
  });

  test('All six Core Stats match King.Arts13', () => {
    const expected = KING_ARTS13_EXPECTED.cores;
    for (const key of CORE_STAT_ORDER) {
      const core = king.cores[key];
      const want = expected[key];
      truthy(core, `core ${key}`);
      eq(core.xp, want.xp, `${key} xp`);
      eq(levelFromXP(core.xp, 100), want.level, `${key} level`);
      eq(nextLevelXP(want.level, 100), want.nextLevelXP, `${key} next`);
      eq(rankForLevel(want.level, king.rankTracks[key]).name, want.rank, `${key} rank`);
    }
  });

  test('Vitality clamps -20 to 0 but preserves the source value', () => {
    eq(king.cores.vitality.xp, 0, 'stored xp');
    eq(king.cores.vitality.rawSourceXP, -20, 'raw source');
    eq(levelFromXP(king.cores.vitality.xp, 100), 0, 'level');
    eq(king.cores.vitality.xp >= 0, true, 'non-negative');
  });

  test('All six Skills match King.Arts13', () => {
    const byId = Object.fromEntries(king.skills.map((skill) => [skill.id, skill]));
    for (const [id, want] of Object.entries(KING_ARTS13_EXPECTED.skills)) {
      eq(byId[id].xp, want.xp, `${id} xp`);
      eq(levelFromXP(want.xp, 100), want.level, `${id} level`);
      eq(nextLevelXP(want.level, 100), want.nextLevelXP, `${id} next`);
    }
  });

  test('Finance totals match exactly', () => {
    const totals = computeFinanceTotals(king.finance);
    const want = KING_ARTS13_EXPECTED.finance;
    near(totals.startingBalance, want.startingBalance, 'starting');
    near(totals.totalIncomes, want.totalIncomes, 'incomes');
    near(totals.totalExpenses, want.totalExpenses, 'expenses');
    near(totals.currentBalance, want.currentBalance, 'balance');
    near(totals.totalAssets, want.totalAssets, 'assets');
    near(totals.totalSavings, want.totalSavings, 'savings');
    near(totals.overallWealth, want.overallWealth, 'overall');
    near(king.finance.overallWealth ?? totals.overallWealth, want.overallWealth, 'seed snapshot');
  });

  test('Wealth sync: 150 XP, 10 Coins, Gold 804', () => {
    const totals = computeFinanceTotals(king.finance);
    eq(king.finance.wealthXpBaseline, 97, 'baseline');
    eq(wealthXPFor(totals.overallWealth, 97), 150, 'wealth xp');
    eq(king.cores.wealth.xp, 150, 'wealth core xp');
    eq(wealthCoinsFor(totals.overallWealth), 10, 'wealth coins');
    eq(king.finance.wealthCoins, 10, 'seed wealth coins');
    eq(derivedGold(king.character.goldBase, king.finance.wealthCoins), 804, 'gold derivation');
  });

  test('Recompute is idempotent and preserves parity', () => {
    const clone = structuredClone(king);
    recomputeDerived(clone);
    recomputeDerived(clone);
    eq(clone.character.gold, 804, 'gold');
    eq(clone.cores.wealth.xp, 150, 'wealth');
    eq(clone.finance.wealthCoins, 10, 'coins');
    eq(clone.hp.max, 1000, 'hp denominator');
    eq(clone.hp.base, 706, 'hp base');
    eq(clone.hp.current, 706, 'hp current');
  });

  test('Seed counts are complete', () => {
    eq(king.dailyQuests.length, 8, 'daily quests');
    eq(king.sideQuests.length, 14, 'side quests');
    eq(king.sideQuests.filter((quest) => quest.type === 'secret').length, 3, 'secret quests');
    eq(king.badHabits.filter((habit) => habit.active).length, 3, 'active habits');
    eq(king.badHabits.every((habit) => habit.hpDamage === 0), true, 'habits deal no direct HP damage');
    eq(king.dailyQuests.every((quest) => quest.heal === 0), true, 'daily quests have no direct HP heal');
    eq(king.missions.length, 5, 'missions');
    eq(king.missions.filter((mission) => mission.completed).length, 3, 'missions done');
    eq(king.goals.length, 2, 'goals');
    eq(king.goals.filter((goal) => goal.completed).length, 1, 'goals done');
    eq(king.rewards.length, 13, 'rewards');
    eq(king.journal.entries.length, 0, 'journal entries');
  });

  test('All seed entity IDs are unique', () => {
    const collections = {
      dailyQuests: king.dailyQuests,
      sideQuests: king.sideQuests,
      badHabits: king.badHabits,
      missions: king.missions,
      goals: king.goals,
      rewards: king.rewards,
    };
    for (const [label, rows] of Object.entries(collections)) {
      const ids = rows.map((row) => row.id);
      eq(new Set(ids).size, ids.length, `${label} duplicate ids`);
      truthy(ids.every(Boolean), `${label} missing id`);
    }
  });

  test('Side quest rewards reference real stats and skills', () => {
    const statIds = new Set(CORE_STAT_ORDER);
    const skillIds = new Set(king.skills.map((skill) => skill.id));
    for (const quest of king.sideQuests) {
      for (const reward of quest.coreRewards) {
        truthy(statIds.has(reward.stat), `${quest.id} unknown stat ${reward.stat}`);
        truthy(reward.xp > 0, `${quest.id} core xp`);
      }
      for (const reward of quest.skillRewards) {
        truthy(skillIds.has(reward.skill), `${quest.id} unknown skill ${reward.skill}`);
        truthy(reward.xp > 0, `${quest.id} skill xp`);
      }
    }
  });

  test('Health quests and strict settings are present', () => {
    const running = king.dailyQuests.find((quest) => quest.id === 'dq_running');
    const sleep = king.dailyQuests.find((quest) => quest.id === 'dq_sleep');
    eq(running.heal, 0, 'running has no direct HP heal');
    eq(sleep.heal, 0, 'sleep has no direct HP heal');
    eq(running.isHealthQuest, true, 'running health flag');
    eq(sleep.isHealthQuest, true, 'sleep health flag');
    eq(king.settings.strict.allDailyQuests, false, 'strict all default');
    eq(king.settings.strict.autoSkipAtMidnight, true, 'auto-skip flag');
    eq(king.dailyQuests.every((quest) => typeof quest.strict === 'boolean'), true, 'per-quest strict');
    eq(king.settings.points.mission.xp, 500, 'points mission');
    eq(king.settings.hp.runningHeal, 15, 'hp settings');
  });

  test('Shop prices match the export (13 items, ₱3,260 total)', () => {
    const expected = {
      'Watch an Episode': 50,
      '1 Hour of Video Games': 120,
      'Eat out': 100,
      'Nap Time': 20,
      '3 Months Vacation': 2000,
      '1 hour of guilt-free video games': 50,
      'Watch 2 Anime episodes': 70,
      '1 hour of social media scroll': 50,
      'Buy new DIY tools/materials': 180,
      'Day off from tasks (Reset Day)': 200,
      'Skip one Daily Quest, no penalty': 100,
      '1-hour nap without guilt': 70,
      'Buy a new art tool or material': 250,
    };
    for (const reward of king.rewards) {
      eq(reward.price, expected[reward.name], reward.name);
      eq(reward.purchaseCount, 0, `${reward.name} purchases`);
    }
    const total = king.rewards.reduce((sum, reward) => sum + reward.price, 0);
    eq(total, 3260, 'price total');
  });

  test('Icon manifest matches the 44 bundled PNGs and all reward icons', () => {
    const iconAssets = PWA_PRECACHE.filter((path) => path.startsWith('./icons/'));
    eq(iconAssets.length, 44, '44 precached icons');
    for (const option of AVATAR_OPTIONS) {
      truthy(isShellAsset(`./${option.src}`), `${option.id} avatar precached`);
    }
    for (const stale of [
      './icons/sticker_(4).png',
      './icons/streaming_(1) 1.png',
      './icons/road 1.png',
      './icons/streaming_(3).png',
    ]) {
      eq(isShellAsset(stale), false, `${stale} removed`);
    }
    for (const reward of king.rewards) {
      truthy(isShellAsset(`./${reward.icon}`), `${reward.name} icon precached`);
    }
  });

  test('Shop Reward #7 uses the canonical streaming icon', () => {
    const reward = king.rewards.find((row) => row.id === 'rw_anime2');
    truthy(reward, 'reward #7 present');
    eq(reward.name, 'Watch 2 Anime episodes', 'reward #7 name');
    eq(reward.icon, 'icons/streaming_(1).png', 'reward #7 icon');
    truthy(isShellAsset(`./${reward.icon}`), 'reward #7 icon precached');
  });

  test('Mission, Goal and Journal awards are exact', () => {
    eq(POINT_AWARDS.mission.xp, 500, 'mission xp');
    eq(POINT_AWARDS.mission.coins, 1000, 'mission coins');
    eq(POINT_AWARDS.goal.xp, 10000, 'goal xp');
    eq(POINT_AWARDS.goal.coins, 20000, 'goal coins');
    eq(POINT_AWARDS.journal.xp, 10, 'journal xp');
    eq(POINT_AWARDS.journal.coins, 35, 'journal coins');
    eq(king.journal.xp, 10, 'seed journal xp');
    eq(king.journal.coins, 35, 'seed journal coins');
    for (const mission of king.missions) {
      eq(mission.xp, 500, `${mission.id} xp`);
      eq(mission.coins, 1000, `${mission.id} coins`);
    }
    for (const goal of king.goals) {
      eq(goal.xp, 10000, `${goal.id} xp`);
      eq(goal.coins, 20000, `${goal.id} coins`);
    }
  });

  /* -------------------------------- HP -------------------------------- */

  test('Lifespan base: age 0 = 1,000, age 25 = 706, age 85 = 0', () => {
    eq(maxHPForAge(25), 706, 'age 25');
    eq(maxHPForAge(0), 1000, 'age 0');
    eq(maxHPForAge(85), 0, 'age 85');
    eq(maxHPForAge(120), 0, 'over-age clamp');
    eq(baseLifespan(0), 1000, 'base age 0');
    eq(baseLifespan(25), 706, 'base age 25');
    eq(baseLifespan(85), 0, 'base age 85');
  });

  test('Lifespan HP is strictly clamp(base + bonus, 0, 1,000) with no stale clamping', () => {
    const profile = createKingArts13Profile();
    const cases = [[0, 1000], [25, 706], [85, 0]];
    for (const [age, want] of cases) {
      profile.age = age;
      profile.hp.lifespanBonusHP = 0;
      syncLifespanState(profile);
      eq(profile.hp.base, want, `age ${age} base`);
      eq(profile.hp.current, want, `age ${age} current`);
      eq(profile.hp.max, 1000, `age ${age} denominator`);
    }

    profile.age = 0;
    profile.hp.lifespanBonusHP = 5;
    syncLifespanState(profile);
    eq(profile.hp.current, 1000, 'total clamps at the ceiling');

    profile.age = 85;
    profile.hp.lifespanBonusHP = -10;
    syncLifespanState(profile);
    eq(profile.hp.lifespanBonusHP, -10, 'age keeps the stored bonus');
    eq(profile.hp.current, 0, 'total clamps at zero');
  });

  test('Saving Age never rewrites the Lifespan bonus; stale negatives reset', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    store.updateActiveProfile((profile) => {
      profile.hp.lifespanBonusHP = -294;
      return profile;
    });
    store.updateIdentity({ age: 0 });
    let profile = store.getActiveProfile();
    eq(profile.hp.lifespanBonusHP, 0, 'stale negative cleared on age save');
    eq(profile.hp.current, 1000, 'age 0 shows 1,000 / 1,000');

    store.updateIdentity({ age: 25 });
    profile = store.getActiveProfile();
    eq(profile.hp.lifespanBonusHP, 0, 'bonus stays clean');
    eq(profile.hp.current, 706, 'age 25 shows 706 / 1,000');

    store.updateActiveProfile((draft) => {
      draft.hp.lifespanBonusHP = 12;
      return draft;
    });
    store.updateIdentity({ age: 50 });
    profile = store.getActiveProfile();
    eq(profile.hp.lifespanBonusHP, 12, 'earned positive bonus preserved');
    eq(profile.hp.current, 424, 'age 50 base 412 + 12');
  });

  test('Lifespan states: Thriving / Worn / Frail / Restoring', () => {
    eq(hpState(706, 706).key, 'healthy', 'full');
    eq(hpState(706, 706).label, 'Thriving', 'full label');
    eq(hpState(354, 706).key, 'healthy', '50%+1');
    eq(hpState(353, 706).key, 'wounded', '50%');
    eq(hpState(353, 706).label, 'Worn', '50% label');
    eq(hpState(177, 706).key, 'wounded', '25%+1');
    eq(hpState(176, 706).key, 'exhausted', '25%');
    eq(hpState(176, 706).label, 'Frail', '25% label');
    eq(hpState(0, 706).key, 'recovery', 'zero');
    eq(hpState(0, 706).label, 'Restoring', 'zero label');
  });

  test('HP heals/damage clamp to [0, max]', () => {
    eq(applyHPDelta(700, 20, 706), 706, 'heal cap');
    eq(applyHPDelta(5, -15, 706), 0, 'damage floor');
    eq(applyHPDelta(100, 15, 706), 115, 'heal');
    eq(applyHPDelta(100, -12, 706), 88, 'damage');
  });

  /* ------------------------ Lifespan + Shield ------------------------- */

  test('Lifespan HP is shown out of 1,000 at age 25 (base 706)', () => {
    const profile = createKingArts13Profile();
    const lifespan = lifespanHPFor(profile.age, profile.hp, profile.settings.hp);
    eq(lifespan.base, 706, 'base lifespan');
    eq(lifespan.max, 1000, 'fixed denominator');
    eq(lifespan.current, 706, 'current lifespan');
    eq(lifespan.percent, 70.6, 'lifespan percent');
    eq(lifespan.shield, 50, 'starting shield');
    eq(lifespan.shieldMax, 100, 'shield cap');
    eq(SHIELD_MAX, 100, 'shield max constant');
    eq(LIFESPAN_DENOMINATOR, 1000, 'lifespan constant');
    eq(HP_DEFAULTS.shieldGainXP, 100, 'gain threshold default');
    eq(HP_DEFAULTS.shieldLossXP, 60, 'loss threshold default');
    const cfg = shieldConfig(profile.settings.hp);
    eq(cfg.gainXP, 100, 'gain config');
    eq(cfg.lossXP, 60, 'loss config');
  });

  test('Vitality gains +1 Shield per 1,000 XP and keeps the buffer', () => {
    const profile = createKingArts13Profile();
    profile.settings.hp.shieldGainXP = 1000;
    profile.settings.hp.shieldLossXP = 600;
    profile.hp.shield = 50;
    profile.hp.posVitalityBuffer = 0;
    profile.hp.negVitalityBuffer = 0;

    let result = applyVitalityXPToShield(profile, 400);
    eq(result.gained, 0, 'no shield yet');
    eq(result.shield, 50, 'shield unchanged');
    eq(profile.hp.posVitalityBuffer, 400, 'buffer carries 400');

    result = applyVitalityXPToShield(profile, 600);
    eq(result.gained, 1, 'one shield at 1000 XP');
    eq(result.shield, 51, 'shield gained');
    eq(profile.hp.posVitalityBuffer, 0, 'buffer reset');

    result = applyVitalityXPToShield(profile, 2500);
    eq(result.gained, 2, 'two shields for 2500 XP');
    eq(result.shield, 53, 'shield total');
    eq(profile.hp.posVitalityBuffer, 500, 'carryover kept');
  });

  test('Vitality losses remove −1 Shield per 600 XP and keep the buffer', () => {
    const profile = createKingArts13Profile();
    profile.settings.hp.shieldGainXP = 1000;
    profile.settings.hp.shieldLossXP = 600;
    profile.hp.shield = 52;
    profile.hp.negVitalityBuffer = 0;
    profile.hp.posVitalityBuffer = 0;

    let result = applyVitalityXPToShield(profile, -300);
    eq(result.lost, 0, 'no shield lost yet');
    eq(result.shield, 52, 'shield unchanged');
    eq(profile.hp.negVitalityBuffer, 300, 'buffer carries 300');

    result = applyVitalityXPToShield(profile, -300);
    eq(result.lost, 1, 'one shield at 600 XP');
    eq(result.shield, 51, 'shield lost');
    eq(profile.hp.negVitalityBuffer, 0, 'buffer reset');

    result = applyVitalityXPToShield(profile, -1200);
    eq(result.lost, 2, 'two shields for 1200 XP');
    eq(result.shield, 49, 'shield total');
    eq(profile.hp.negVitalityBuffer, 0, 'exact multiple carries nothing');
  });

  test('A full 100-point Shield rolls into +1 Lifespan HP', () => {
    const profile = createKingArts13Profile();
    profile.hp.shield = 99;
    profile.hp.lifespanBonusHP = 0;
    profile.hp.posVitalityBuffer = 0;

    const applied = healLifespanShield(profile, 1);
    eq(applied, 1, 'heal applied');
    eq(profile.hp.shield, 0, 'shield rolled over');
    eq(profile.hp.lifespanBonusHP, 1, 'Lifespan bonus');
    eq(profile.hp.current, 707, 'Lifespan HP +1');
    eq(profile.hp.max, 1000, 'denominator unchanged');
  });

  test('Shield break lets damage overflow into Lifespan HP', () => {
    const profile = createKingArts13Profile();
    profile.hp.shield = 10;
    profile.hp.lifespanBonusHP = 0;

    const applied = damageLifespanShield(profile, 25);
    eq(applied, 25, 'all damage applied');
    eq(profile.hp.shield, 0, 'shield broken');
    eq(profile.hp.lifespanBonusHP, -15, 'Lifespan overflow');
    eq(profile.hp.current, 691, 'Lifespan HP reduced');
  });

  test('Shield snapshots restore the exact Lifespan + buffer state for Undo', () => {
    const profile = createKingArts13Profile();
    profile.hp.shield = 30;
    profile.hp.posVitalityBuffer = 70;
    profile.hp.negVitalityBuffer = 25;
    profile.hp.lifespanBonusHP = -12;
    syncLifespanState(profile);
    const snapshot = shieldSnapshot(profile);
    eq(profile.hp.current, 694, 'current reflects the bonus');

    damageLifespanShield(profile, 120);
    eq(profile.hp.shield, 0, 'damage empties shield');
    eq(profile.hp.lifespanBonusHP, -102, 'overflow stored');
    eq(profile.hp.current, 604, 'Lifespan reduced');

    restoreShieldState(profile, snapshot);
    eq(profile.hp.shield, 30, 'shield restored');
    eq(profile.hp.posVitalityBuffer, 70, 'positive buffer restored');
    eq(profile.hp.negVitalityBuffer, 25, 'negative buffer restored');
    eq(profile.hp.lifespanBonusHP, -12, 'bonus HP restored');
    eq(profile.hp.current, 694, 'Lifespan restored');
  });

  test('Age changes rescale base Lifespan but keep Shield state', () => {
    const profile = createKingArts13Profile();
    profile.hp.shield = 73;
    profile.hp.lifespanBonusHP = 5;
    profile.age = 50;
    syncLifespanState(profile);
    eq(profile.hp.base, 412, 'age 50 base');
    eq(profile.hp.current, 417, 'base + bonus');
    eq(profile.hp.max, 1000, 'denominator fixed');
    eq(profile.hp.shield, 73, 'shield preserved');

    profile.age = 85;
    syncLifespanState(profile);
    eq(profile.hp.base, 0, 'age 85 base');
    eq(profile.hp.current, 5, 'bonus still applies');
    eq(profile.hp.shield, 73, 'shield still preserved');
  });

  /* ------------------------------ dates ------------------------------- */

  test('Local date keys never UTC-shift', () => {
    eq(localDateKey(new Date(2026, 10, 15, 23, 30)), '2026-11-15', 'late night');
    eq(localDateKey(new Date(2026, 0, 2, 0, 5)), '2026-01-02', 'early morning');
  });

  test('Strict auto-skip is due only after midnight', () => {
    const now = new Date(2026, 10, 15, 10, 0);
    eq(isStrictSkipDue({ strict: true, completed: false, skipped: false, lastResetDate: '2026-11-14' }, now), true, 'stale');
    eq(isStrictSkipDue({ strict: true, completed: false, skipped: false, lastResetDate: '2026-11-15' }, now), false, 'same day');
    eq(isStrictSkipDue({ strict: false, completed: false, skipped: false, lastResetDate: '2026-11-14' }, now), false, 'normal mode');
    eq(isStrictSkipDue({ strict: true, completed: true, skipped: false, lastResetDate: '2026-11-14' }, now), false, 'completed');
  });

  /* --------------------------- isolation ------------------------------ */

  test('Seed factory returns isolated clones', () => {
    const a = createKingArts13Profile();
    const b = createKingArts13Profile();
    a.character.xp = 1;
    a.cores.discipline.xp = 2;
    a.dailyQuests[0].completed = true;
    a.titles[0].name = 'Hacked';
    a.settings.hp.runningHeal = 999;
    eq(b.character.xp, 6548, 'xp isolation');
    eq(b.cores.discipline.xp, 1082, 'core isolation');
    eq(b.dailyQuests[0].completed, false, 'quest isolation');
    eq(b.titles[0].name, '🌱 The Seeker', 'title isolation');
    eq(b.settings.hp.runningHeal, 15, 'settings isolation');
    eq(a.settings.hp.runningHeal, 999, 'own settings edited');
  });

  test('Blank profile starts from scratch', () => {
    const blank = createBlankProfile('Test Player', { age: 30 });
    eq(blank.name, 'Test Player', 'name');
    eq(blank.character.xp, 0, 'xp');
    eq(blank.character.gold, 0, 'gold');
    eq(blank.dailyQuests.length, 0, 'daily quests');
    eq(blank.sideQuests.length, 0, 'side quests');
    eq(blank.missions.length, 0, 'missions');
    eq(blank.goals.length, 0, 'goals');
    eq(blank.rewards.length, 0, 'rewards');
    eq(blank.finance.startingBalance, 0, 'finance');
    eq(blank.titles.length, 10, 'titles ready');
    eq(blank.rankTracks.vitality.ranks.length, 7, 'ranks ready');
    truthy(blank.hp.max > 0, 'hp');
  });

  test('Money formatting and rounding', () => {
    near(roundMoney(5305.869999), 5305.87, 'round');
    eq(formatMoney(2817), '₱2,817.00', 'format');
    eq(formatMoney(2817, 'USD'), '$2,817.00', 'USD format');
    eq(formatMoney(5305.87, 'JPY'), '¥5,305.87', 'JPY format');
    eq(normalizeCurrency('eur'), 'EUR', 'currency normalisation');
    eq(normalizeCurrency('not-a-currency'), 'PHP', 'currency fallback');
    eq(currencySymbol('AED'), 'د.إ', 'AED symbol');
    eq(CURRENCIES.length, 14, '14 currencies');
    eq(CURRENCIES[0].code, 'PHP', 'PHP defaults first');
  });

  /* --------------------------- M2 profiles ---------------------------- */

  test('Store seeds King.Arts13 once as the default profile', () => {
    const storage = createMemoryStorage();
    const store = createProfileStore({ storage });
    eq(store.getProfiles().length, 1, 'profiles');
    eq(store.getActiveId(), 'p_king_arts13', 'active id');
    const active = store.getActiveProfile();
    eq(active.name, 'King.Arts13', 'name');
    eq(active.character.xp, 6548, 'xp');
    eq(active.character.gold, 804, 'gold');
    eq(active.hp.current, 706, 'hp current');
    eq(active.hp.base, 706, 'hp base');
    eq(active.hp.max, 1000, 'hp max');
    eq(active.hp.shield, 50, 'starting shield');
    const raw = JSON.parse(storage.getItem(STORAGE_KEYS.profiles));
    eq(raw.profiles.length, 1, 'persisted profiles');
    const reloaded = createProfileStore({ storage });
    eq(reloaded.getProfiles().length, 1, 'no duplicate seed');
    eq(reloaded.getActiveProfile().character.xp, 6548, 'reloaded xp');
  });

  test('Profile updates persist across store reloads', () => {
    const storage = createMemoryStorage();
    const store = createProfileStore({ storage });
    store.updateActiveProfile((profile) => {
      profile.character.xp = 6549;
      return profile;
    });
    eq(store.getActiveProfile().character.xp, 6549, 'in memory');
    const reloaded = createProfileStore({ storage });
    eq(reloaded.getActiveProfile().character.xp, 6549, 'after reload');
    eq(reloaded.getProfiles().length, 1, 'single profile');
  });

  test('Reads return isolated clones', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    const snapshot = store.getActiveProfile();
    snapshot.name = 'Hacked';
    snapshot.character.xp = 1;
    eq(store.getActiveProfile().name, 'King.Arts13', 'name untouched');
    eq(store.getActiveProfile().character.xp, 6548, 'xp untouched');
  });

  test('Create profile starts at zero with age-based HP', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    const created = store.createProfile({
      name: 'Test Player',
      age: 30,
      avatar: 'icons/thief.png',
    });
    eq(store.getActiveId(), created.id, 'active switched');
    eq(store.getProfiles().length, 2, 'profile added');
    eq(created.name, 'Test Player', 'name');
    eq(created.age, 30, 'age');
    eq(created.avatar, 'icons/thief.png', 'avatar');
    eq(created.character.xp, 0, 'xp');
    eq(created.character.gold, 0, 'gold');
    eq(levelFromXP(created.character.xp, 250), 0, 'level');
    eq(created.hp.max, 1000, 'lifespan denominator');
    eq(created.hp.base, maxHPForAge(30), 'base hp');
    eq(created.hp.current, maxHPForAge(30), 'current hp');
    eq(created.titles.length, 10, 'titles');
    eq(created.rankTracks.vitality.ranks.length, 7, 'ranks');
  });

  test('Create profile with a birthday derives age, Lifespan HP and greets that day', () => {
    const birthdayNow = new Date(2026, 4, 15, 12, 0);
    const store = createProfileStore({
      storage: createMemoryStorage(),
      now: () => birthdayNow,
    });
    const created = store.createProfile({
      name: 'Birthday Player',
      birthday: '2001-05-15',
      avatar: 'icons/ares.png',
    });
    eq(created.birthday, '2001-05-15', 'birthday saved');
    eq(created.age, ageFromBirthday('2001-05-15', birthdayNow), 'age derives from birthday');
    eq(created.age, 25, 'age 25 on the birthday');
    eq(created.hp.base, 706, 'birthday-based Lifespan HP');
    eq(created.hp.current, 706, 'current follows the base');
    eq(created.birthdayGreetedYear, null, 'not greeted yet');
    eq(shouldGreetBirthday(created, birthdayNow), true, 'first open on the birthday greets');
  });

  test('Starter templates are opt-in', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    const plain = store.createProfile({ name: 'Plain', age: 25 });
    eq(plain.dailyQuests.length, 0, 'no daily quests');
    eq(plain.sideQuests.length, 0, 'no side quests');
    eq(plain.badHabits.length, 0, 'no habits');
    eq(plain.rewards.length, 0, 'no rewards');

    const templated = store.createProfile({
      name: 'Templated',
      age: 25,
      includeDailyQuestTemplate: true,
      includeRewardTemplate: true,
    });
    eq(templated.dailyQuests.length, 8, 'daily template');
    eq(templated.rewards.length, 13, 'reward template');
    eq(templated.sideQuests.length, 0, 'side stays empty');
    eq(
      templated.dailyQuests.every((quest) => quest.lastResetDate === localDateKey(new Date())),
      true,
      'template resets today',
    );
  });

  test('All six avatar presets are accepted at profile creation', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    for (const option of AVATAR_OPTIONS) {
      const created = store.createProfile({
        name: `Avatar ${option.id}`,
        age: 25,
        avatar: option.src,
      });
      eq(created.avatar, option.src, `${option.id} accepted`);
    }
    eq(store.getProfiles().length, 7, 'six new profiles plus the seed');
    for (const option of AVATAR_OPTIONS) {
      truthy(
        store.getProfiles().some((profile) => profile.avatar === option.src),
        `${option.id} persisted`,
      );
    }
  });

  test('Name, age and avatar inputs are normalised', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    const odd = store.createProfile({ name: '   ', age: 120, avatar: 'icons/missing.png' });
    eq(odd.name, 'New Player', 'name fallback');
    eq(odd.age, 85, 'age clamp');
    eq(odd.avatar, null, 'unknown avatar rejected');
    eq(odd.hp.base, 0, 'old age base hp');
    eq(odd.hp.max, 1000, 'lifespan denominator stays fixed');

    const newborn = store.createProfile({ name: 'Newborn', age: 0 });
    eq(newborn.age, 0, 'age zero kept');
    eq(newborn.hp.base, 1000, 'newborn base hp');
    eq(newborn.hp.current, 1000, 'newborn lifespan hp');

    const defaulted = store.createProfile({ name: 'Default Avatar', age: 20 });
    eq(defaulted.avatar, DEFAULT_AVATAR, 'default avatar');
  });

  test('Changing age recomputes Max HP and clamps current HP', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    store.updateIdentity({ age: 85 });
    store.updateActiveProfile((profile) => {
      profile.hp.current = 9999;
      return profile;
    });
    let active = store.getActiveProfile();
    eq(active.hp.max, 1000, 'age 85 denominator');
    eq(active.hp.base, 0, 'age 85 base');
    eq(active.hp.current, 0, 'current follows the base');

    store.updateIdentity({ age: 0 });
    store.updateActiveProfile((profile) => {
      profile.hp.current = 9999;
      return profile;
    });
    active = store.getActiveProfile();
    eq(active.hp.max, 1000, 'age 0 denominator');
    eq(active.hp.base, 1000, 'age 0 base');
    eq(active.hp.current, 1000, 'age 0 current');
  });

  test('Switch and delete profiles keep a valid active profile', () => {
    const store = createProfileStore({ storage: createMemoryStorage() });
    const alpha = store.createProfile({ name: 'Alpha', age: 25 });
    const beta = store.createProfile({ name: 'Beta', age: 25 });
    store.setActiveProfile(alpha.id);
    eq(store.getActiveId(), alpha.id, 'switched');

    const next = store.removeProfile(alpha.id);
    eq(next, 'p_king_arts13', 'falls back to first');
    eq(store.getProfiles().length, 2, 'two remain');

    store.removeProfile('p_king_arts13');
    eq(store.getActiveId(), beta.id, 'beta active');

    let code = '';
    try {
      store.removeProfile(beta.id);
    } catch (error) {
      code = error.code;
    }
    eq(code, 'last-profile', 'last profile protected');
  });

  test('Corrupt storage restores the seed and preserves the blob', () => {
    const raw = '{ definitely not json';
    const storage = createMemoryStorage({ [STORAGE_KEYS.profiles]: raw });
    const store = createProfileStore({ storage });
    eq(store.getProfiles().length, 1, 'seed restored');
    eq(store.getActiveProfile().name, 'King.Arts13', 'seed name');
    const meta = store.getMeta();
    eq(meta.recoveredFromCorruption, true, 'recovery flag');
    truthy(meta.corruptBackupKey, 'backup key');
    eq(storage.getItem(meta.corruptBackupKey), raw, 'raw blob kept');
  });

  test('Last tab is remembered and invalid tabs fall back', () => {
    const storage = createMemoryStorage();
    const store = createProfileStore({ storage });
    store.rememberTab('finance');
    eq(store.getSettings().lastTab, 'finance', 'remembered');
    const reloaded = createProfileStore({ storage });
    eq(reloaded.getSettings().lastTab, 'finance', 'after reload');
    reloaded.updateSettings({ lastTab: 'bogus' });
    eq(reloaded.getSettings().lastTab, DEFAULT_TAB, 'fallback');
  });

  test('Profile view model matches the HUD', () => {
    const kingProfile = createKingArts13Profile();
    const view = profileView(kingProfile);
    eq(view.name, 'King.Arts13', 'name');
    eq(view.level, 6, 'level');
    eq(view.xp, 6548, 'xp');
    eq(view.nextLevelXP, 7000, 'next');
    eq(view.percent, 93, 'percent');
    eq(view.title, '🌱 The Seeker', 'title');
    eq(view.gold, 804, 'gold');
    eq(view.hp.current, 706, 'hp');
    eq(view.hp.base, 706, 'base hp');
    eq(view.hp.max, 1000, 'lifespan denominator');
    eq(view.hp.shield, 50, 'shield');
    eq(view.hp.shieldMax, 100, 'shield max');
    eq(view.hp.shieldPercent, 50, 'shield percent');
    eq(view.hp.label, 'Thriving', 'hp state');
    eq(view.initials, 'KA', 'initials');
    eq(view.avatar, 'icons/ares.png', 'avatar');
    eq(profileInitials(''), '??', 'empty initials');
  });

  test('Six navigation tabs and hash routing are stable', () => {
    eq(TABS.length, 6, 'tab count');
    eq(TABS.map((tab) => tab.id).join(','), 'today,character,quests,finance,shop,settings', 'tab ids');
    eq(DEFAULT_TAB, 'today', 'default tab');
    eq(normalizeTabId('#/finance'), 'finance', 'hash tab');
    eq(normalizeTabId('nope'), 'today', 'unknown tab');
    eq(tabIdFromHash('#/quests'), 'quests', 'hash parser');
    eq(tabIdFromHash(''), 'today', 'empty hash');
  });

  test('Avatar picker exposes all six bundled portraits', () => {
    eq(AVATAR_OPTIONS.length, 6, 'avatar count');
    eq(AVATAR_OPTIONS.map((option) => option.id).join(','), 'ares,thief,arco,assasin,atena,magico', 'avatar ids');
    eq(
      AVATAR_OPTIONS.map((option) => option.label).join(','),
      'Ares,Thief,Huntress,Assassin,Athena,Mage',
      'avatar labels',
    );
    eq(
      AVATAR_OPTIONS.map((option) => option.src).join(','),
      'icons/ares.png,icons/thief.png,icons/arco.png,icons/assasin.png,icons/atena.png,icons/magico.png',
      'avatar sources',
    );
    eq(
      AVATAR_OPTIONS.map((option) => option.blurb).join(','),
      'The vanguard,The wildcard,The sharpshooter,The shadow,The strategist,The mystic',
      'avatar blurbs',
    );
  });

  test('Profile avatars can be changed from the switcher and persist', () => {
    const storage = createMemoryStorage();
    const store = createProfileStore({ storage });
    const king = store.getActiveProfile();
    eq(king.avatar, 'icons/ares.png', 'seed avatar');

    const updated = store.updateAvatar(king.id, 'icons/arco.png');
    eq(updated.changed, true, 'avatar changed');
    eq(store.getProfile(king.id).avatar, 'icons/arco.png', 'avatar stored');

    let code = null;
    try {
      store.updateAvatar(king.id, 'icons/missing.png');
    } catch (error) {
      code = error.code;
    }
    eq(code, 'invalid-avatar', 'unknown avatar rejected');
    eq(store.getProfile(king.id).avatar, 'icons/arco.png', 'avatar untouched after rejection');

    const reloaded = createProfileStore({ storage });
    eq(reloaded.getProfile(king.id).avatar, 'icons/arco.png', 'avatar persists');
  });

  test('Additive migration fills gaps without changing parity', () => {
    const raw = createKingArts13Profile();
    delete raw.titles;
    delete raw.rankTracks;
    delete raw.settings;
    raw.cores.vitality.xp = -20;
    const fixed = normalizeProfile(raw);
    eq(fixed.titles.length, 10, 'titles restored');
    eq(fixed.rankTracks.vitality.ranks.length, 7, 'ranks restored');
    eq(fixed.cores.vitality.xp, 0, 'vitality clamped');
    eq(fixed.cores.vitality.rawSourceXP, -20, 'source kept');
    eq(fixed.character.xp, 6548, 'xp kept');
    eq(fixed.character.gold, 804, 'gold kept');
    eq(fixed.hp.max, 1000, 'hp denominator');
    eq(fixed.hp.base, 706, 'hp base kept');
    eq(fixed.hp.current, 706, 'hp current kept');
  });

  /* -------------------------------- M3 -------------------------------- */

  const m3Day1 = () => new Date(2026, 10, 15, 9, 0, 0);
  const m3Day2 = () => new Date(2026, 10, 16, 0, 5, 0);
  const sumQuest = (profile, id) => profile.dailyQuests.find((quest) => quest.id === id);

  test('M3 complete quest awards XP, Gold, HP and Core/Skill XP, then undoes', () => {
    const profile = createKingArts13Profile();
    profile.hp.lifespanBonusHP = -206;
    syncLifespanState(profile);
    eq(profile.hp.current, 500, 'starting lifespan hp');
    const result = completeDailyQuest(profile, 'dq_running', m3Day1());
    eq(result.changed, true, 'changed');
    eq(result.xp, 20, 'xp');
    eq(result.coins, 10, 'coins');
    eq(result.heal, 0, 'no direct HP heal');
    eq(profile.character.xp, 6568, 'character xp');
    eq(profile.character.goldBase, 804, 'gold base');
    eq(profile.character.gold, 814, 'gold total');
    eq(profile.hp.current, 500, 'lifespan unchanged (Vitality XP charges Shield)');
    eq(sumQuest(profile, 'dq_running').completed, true, 'completed');
    eq(profile.stats.dailyQuestsCompleted, 1, 'stat');

    const duplicate = completeDailyQuest(profile, 'dq_running', m3Day1());
    eq(duplicate.changed, false, 'duplicate rejected');
    eq(duplicate.code, 'already-completed', 'duplicate code');
    eq(profile.character.xp, 6568, 'no double pay');

    const undone = undoDailyQuest(profile, 'dq_running');
    eq(undone.changed, true, 'undo changed');
    eq(profile.character.xp, 6548, 'xp restored');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(profile.character.gold, 804, 'gold total restored');
    eq(profile.hp.current, 500, 'hp restored');
    eq(sumQuest(profile, 'dq_running').completed, false, 'pending again');
    eq(profile.stats.dailyQuestsCompleted, 0, 'stat restored');
  });

  test('M3 quest completion applies assigned Core Stat and Skill XP', () => {
    const profile = createKingArts13Profile();
    const quest = sumQuest(profile, 'dq_reading');
    quest.coreRewards = [{ stat: 'mind', xp: 5 }];
    quest.skillRewards = [{ skill: 'art', xp: 3 }];
    const mindBefore = profile.cores.mind.xp;
    const artBefore = profile.skills.find((skill) => skill.id === 'art').xp;

    const result = completeDailyQuest(profile, 'dq_reading', m3Day1());
    eq(result.coreRewards[0].xp, 5, 'core xp applied');
    eq(result.skillRewards[0].xp, 3, 'skill xp applied');
    eq(profile.cores.mind.xp, mindBefore + 5, 'mind xp');
    eq(profile.skills.find((skill) => skill.id === 'art').xp, artBefore + 3, 'art xp');

    undoDailyQuest(profile, 'dq_reading');
    eq(profile.cores.mind.xp, mindBefore, 'mind restored');
    eq(profile.skills.find((skill) => skill.id === 'art').xp, artBefore, 'art restored');
  });

  test('M3 normal skip applies coin penalty and real-world cost, without HP damage', () => {
    const profile = createKingArts13Profile();
    const result = skipDailyQuest(profile, 'dq_sleep', m3Day1());
    eq(result.changed, true, 'changed');
    eq(result.strict, false, 'not strict');
    eq(result.coins, 5, 'coins penalty');
    eq(result.xp, 0, 'xp penalty');
    eq(result.hpDamage, 0, 'no hp damage in normal mode');
    eq(result.penalty.physical, 'Lights out 30 minutes early tonight', 'physical penalty');
    eq(profile.character.goldBase, 789, 'gold base reduced');
    eq(profile.character.gold, 799, 'gold total reduced');
    eq(profile.hp.current, 706, 'hp untouched');
    eq(sumQuest(profile, 'dq_sleep').skipped, true, 'skipped');

    undoDailyQuest(profile, 'dq_sleep');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(sumQuest(profile, 'dq_sleep').skipped, false, 'pending again');
  });

  test('M3 strict health-quest skip damages Shield first and undo restores it', () => {
    const profile = createKingArts13Profile();
    sumQuest(profile, 'dq_sleep').strict = true;
    const result = skipDailyQuest(profile, 'dq_sleep', m3Day1());
    eq(result.strict, true, 'strict');
    eq(result.hpDamage, 15, 'hp damage absorbed');
    eq(profile.hp.shield, 35, 'shield took the damage');
    eq(profile.hp.current, 706, 'lifespan untouched while shield holds');
    eq(profile.character.goldBase, 789, 'coin penalty');

    undoDailyQuest(profile, 'dq_sleep');
    eq(profile.hp.shield, 50, 'shield restored');
    eq(profile.hp.current, 706, 'lifespan unchanged');
    eq(profile.character.goldBase, 794, 'gold restored');
  });

  test('Shield Undo reverses only its own deltas (order-safe)', () => {
    const profile = createKingArts13Profile();
    profile.settings.hp.shieldGainXP = 10;
    completeDailyQuest(profile, 'dq_running', m3Day1());
    const action = sumQuest(profile, 'dq_running').lastAction;
    eq(action.shieldDelta, 1, 'shield delta recorded');
    eq(action.posBufferDelta, 2, 'positive buffer delta recorded');
    eq(action.negBufferDelta, 0, 'negative buffer delta recorded');
    eq(action.lifespanDelta, 0, 'lifespan delta recorded');
    eq(profile.hp.shield, 51, 'completion gained one Shield');

    const sugar = profile.badHabits.find((habit) => habit.id === 'bh_sugar');
    sugar.penalty = { coreStat: 'vitality', coreXp: 60, coins: 0 };
    logBadHabit(profile, 'bh_sugar', m3Day1());
    eq(profile.hp.shield, 50, 'later relapse drained one Shield');

    undoDailyQuest(profile, 'dq_running');
    eq(profile.hp.shield, 49, 'undo kept the later relapse loss');
    eq(profile.hp.posVitalityBuffer, 0, 'completion buffer reversed');
    eq(profile.hp.negVitalityBuffer, 0, 'relapse buffer left intact');

    undoBadHabit(profile, 'bh_sugar');
    eq(profile.hp.shield, 50, 'habit undo restored its own delta');

    const rollover = createKingArts13Profile();
    rollover.settings.hp.shieldGainXP = 10;
    rollover.hp.shield = 99;
    rollover.hp.lifespanBonusHP = 0;
    completeDailyQuest(rollover, 'dq_running', m3Day1());
    eq(rollover.hp.shield, 0, 'full Shield rolled over');
    eq(rollover.hp.lifespanBonusHP, 1, 'rollover recorded +1 Lifespan');
    undoDailyQuest(rollover, 'dq_running');
    eq(rollover.hp.shield, 99, 'rollover Shield restored');
    eq(rollover.hp.lifespanBonusHP, 0, 'rollover Lifespan reversed');
  });

  test('M3 Strict All toggles every quest and syncs the summary flag', () => {
    const profile = createKingArts13Profile();
    const on = applyStrictAll(profile, true);
    eq(on.allStrict, true, 'all strict');
    eq(profile.dailyQuests.filter((quest) => quest.strict).length, 8, 'eight strict');
    eq(profile.settings.strict.allDailyQuests, true, 'summary flag');

    applyQuestStrict(profile, 'dq_running', false);
    eq(profile.dailyQuests.filter((quest) => quest.strict).length, 7, 'seven strict');
    eq(profile.settings.strict.allDailyQuests, false, 'summary flag cleared');

    applyStrictAll(profile, false);
    eq(profile.dailyQuests.filter((quest) => quest.strict).length, 0, 'none strict');
  });

  test('M3 midnight rollover auto-skips Strict quests exactly once', () => {
    const profile = createKingArts13Profile();
    applyStrictAll(profile, true);
    const first = applyDailyRollover(profile, m3Day2());
    eq(first.changed, true, 'changed');
    eq(first.autoSkipped.length, 8, 'eight auto-skips');
    eq(profile.character.goldBase, 759, '35 G penalty');
    eq(profile.character.gold, 769, 'gold total');
    eq(profile.hp.shield, 20, '30 damage taken by the shield (two health quests)');
    eq(profile.hp.current, 706, 'lifespan survives while shield holds');
    eq(profile.character.xp, 6548, 'seed penalties carry no XP');
    eq(profile.dailyQuests.every((quest) => !quest.completed && !quest.skipped), true, 'reset for today');
    eq(profile.dailyQuests.every((quest) => quest.lastResetDate === '2026-11-16'), true, 'reset date');
    eq(profile.daily.lastRolloverDate, '2026-11-16', 'rollover date');

    const second = applyDailyRollover(profile, m3Day2());
    eq(second.changed, false, 'idempotent');
    eq(second.autoSkipped.length, 0, 'no repeat skips');
    eq(profile.character.goldBase, 759, 'gold unchanged');
    eq(profile.hp.shield, 20, 'shield unchanged');
    eq(profile.hp.current, 706, 'lifespan unchanged');
  });

  test('M3 rollover persists across reloads and never double-applies', () => {
    const storage = createMemoryStorage();
    const day1Store = createProfileStore({ storage, now: m3Day1 });
    day1Store.setStrictAll(true);

    const day2Store = createProfileStore({ storage, now: m3Day2 });
    const meta = day2Store.getMeta();
    eq(meta.rollover.autoSkipped.length, 8, 'eight skips on first open');
    const profile = day2Store.getActiveProfile();
    eq(profile.character.goldBase, 759, 'gold after penalties');
    eq(profile.character.gold, 769, 'gold total');
    eq(profile.hp.shield, 20, 'shield after penalties');
    eq(profile.hp.current, 706, 'lifespan after penalties');

    const reopen = createProfileStore({ storage, now: m3Day2 });
    eq(reopen.getMeta().rollover.autoSkipped.length, 0, 'no skips on reopen');
    eq(reopen.getActiveProfile().character.goldBase, 759, 'gold stable');
    eq(reopen.getActiveProfile().hp.shield, 20, 'shield stable');
    eq(reopen.getActiveProfile().hp.current, 706, 'lifespan stable');
  });

  test('M3 completed quests reset next day without an auto-skip penalty', () => {
    const profile = createKingArts13Profile();
    applyStrictAll(profile, true);
    completeDailyQuest(profile, 'dq_running', m3Day1());
    const rollover = applyDailyRollover(profile, m3Day2());
    eq(rollover.autoSkipped.length, 7, 'only pending quests skip');
    const running = sumQuest(profile, 'dq_running');
    eq(running.completed, false, 'reset');
    eq(running.skipped, false, 'not skipped');
    eq(running.lastAction, null, 'undo cleared');
    eq(profile.character.goldBase, 769, 'gold after completion + 7 skips');
    eq(profile.hp.shield, 35, 'only the skipped health quest charges the shield');
    eq(profile.hp.current, 706, 'lifespan untouched');
  });

  test('M3 Recovery locks non-healing actions until health quest Vitality XP restores HP', () => {
    const profile = createKingArts13Profile();
    profile.settings.hp.shieldGainXP = 1000;
    profile.settings.hp.shieldLossXP = 600;
    profile.hp.shield = 99;
    profile.hp.posVitalityBuffer = 999;
    profile.hp.lifespanBonusHP = -706;
    syncLifespanState(profile);
    eq(profile.hp.current, 0, 'lifespan at zero');
    eq(isRecovery(profile), true, 'recovery');

    const blocked = completeDailyQuest(profile, 'dq_reading', m3Day1());
    eq(blocked.changed, false, 'quest locked');
    eq(blocked.code, 'recovery-locked', 'quest code');
    eq(profile.character.xp, 6548, 'no xp gained');

    const skipBlocked = skipDailyQuest(profile, 'dq_running', m3Day1());
    eq(skipBlocked.code, 'recovery-locked', 'skip locked');
    const habitBlocked = logBadHabit(profile, 'bh_sugar', m3Day1());
    eq(habitBlocked.code, 'recovery-locked', 'habit locked');

    const running = completeDailyQuest(profile, 'dq_running', m3Day1());
    eq(running.changed, true, 'health quest allowed');
    eq(running.heal, 0, 'no direct HP heal');
    eq(profile.hp.current, 1, 'Vitality XP rolls the Shield into Lifespan HP');
    eq(profile.hp.shield, 0, 'full Shield rolled over');
    eq(isRecovery(profile), false, 'recovered');
    eq(completeDailyQuest(profile, 'dq_reading', m3Day1()).changed, true, 'normal quest unlocked');
  });

  test('M3 bad habits log without HP damage, restraint counts and undo', () => {
    const profile = createKingArts13Profile();
    eq(JOURNAL_MOODS.length, 5, 'five moods');
    eq(dailySummary(profile, m3Day1()).habitsClean, 3, 'three clean');

    const logged = logBadHabit(profile, 'bh_sugar', m3Day1());
    eq(logged.hpDamage, 0, 'sugar deals no HP damage');
    eq(profile.hp.shield, 50, 'shield untouched');
    eq(profile.hp.current, 706, 'lifespan untouched');
    eq(sumQuest(profile, 'dq_running').id, 'dq_running', 'profile intact');
    const sugar = profile.badHabits.find((habit) => habit.id === 'bh_sugar');
    eq(sugar.lastLoggedDate, '2026-11-15', 'logged date');
    eq(sugar.logCount, 1, 'log count');
    eq(profile.stats.habitsLogged, 1, 'stat');
    eq(dailySummary(profile, m3Day1()).habitsClean, 2, 'restraint count');

    const undone = undoBadHabit(profile, 'bh_sugar');
    eq(undone.changed, true, 'undo changed');
    eq(profile.hp.shield, 50, 'shield restored');
    eq(profile.hp.current, 706, 'lifespan unchanged');
    eq(sugar.logCount, 0, 'count restored');
    eq(sugar.lastLoggedDate, null, 'date restored');
    eq(profile.stats.habitsLogged, 0, 'stat restored');
  });

  test('M6 daily skip penalty targets the chosen Core Stat and undoes', () => {
    const profile = createKingArts13Profile();
    const trading = profile.dailyQuests.find((quest) => quest.id === 'dq_trading');
    trading.penalty.coreStat = 'creativity';

    const skipped = skipDailyQuest(profile, 'dq_trading', m3Day1());
    eq(skipped.changed, true, 'skipped');
    eq(skipped.coreLoss[0].stat, 'creativity', 'chosen stat');
    eq(skipped.coreLoss[0].xp, 5, 'exact core loss');
    eq(profile.cores.creativity.xp, 465, 'creativity reduced');
    eq(profile.cores.discipline.xp, 1082, 'other core untouched');

    undoDailyQuest(profile, 'dq_trading');
    eq(profile.cores.creativity.xp, 470, 'creativity restored');
  });

  test('M6 dual skip penalties deduct both Core Stats, clamp at zero and undo both', () => {
    const profile = createKingArts13Profile();
    const trading = profile.dailyQuests.find((quest) => quest.id === 'dq_trading');
    trading.penalty.coreStat = 'creativity';
    trading.penalty.coreXp = 5;
    trading.penalty.coreStat2 = 'discipline';
    trading.penalty.coreXp2 = 7;

    const skipped = skipDailyQuest(profile, 'dq_trading', m3Day1());
    eq(skipped.changed, true, 'skipped');
    eq(skipped.coreLoss.length, 2, 'two core losses');
    eq(skipped.coreLoss[0].stat, 'creativity', 'first target');
    eq(skipped.coreLoss[0].xp, 5, 'first exact loss');
    eq(skipped.coreLoss[1].stat, 'discipline', 'second target');
    eq(skipped.coreLoss[1].xp, 7, 'second exact loss');
    eq(profile.cores.creativity.xp, 465, 'creativity reduced');
    eq(profile.cores.discipline.xp, 1075, 'discipline reduced');

    undoDailyQuest(profile, 'dq_trading');
    eq(profile.cores.creativity.xp, 470, 'creativity restored');
    eq(profile.cores.discipline.xp, 1082, 'discipline restored');

    const mind = profile.dailyQuests.find((quest) => quest.id === 'dq_sleep');
    mind.penalty.coreStat = 'mind';
    mind.penalty.coreXp = 999;
    mind.penalty.coreStat2 = 'vitality';
    mind.penalty.coreXp2 = 999;
    const clamped = skipDailyQuest(profile, 'dq_sleep', m3Day1());
    eq(clamped.coreLoss.length, 1, 'zero vitality produces no loss entry');
    eq(clamped.coreLoss[0].xp, 30, 'mind clamped at zero');
    eq(profile.cores.mind.xp, 0, 'mind cannot go below zero');
    undoDailyQuest(profile, 'dq_sleep');
    eq(profile.cores.mind.xp, 30, 'mind restored after clamp');
  });

  test('M6 bad habit Core XP and Gold penalties clamp and undo', () => {
    const profile = createKingArts13Profile();
    const sugar = profile.badHabits.find((habit) => habit.id === 'bh_sugar');
    sugar.penalty = { coreStat: 'mind', coreXp: 1000, coins: 1000 };

    const logged = logBadHabit(profile, 'bh_sugar', m3Day1());
    eq(logged.hpDamage, 0, 'bad habits deal no HP damage');
    eq(logged.coreLoss[0].stat, 'mind', 'core stat loss');
    eq(logged.coreLoss[0].xp, 30, 'core xp clamped at zero');
    eq(logged.goldLoss, 794, 'gold clamped at zero');
    eq(profile.cores.mind.xp, 0, 'mind core at zero');
    eq(profile.character.goldBase, 0, 'gold base at zero');

    const undone = undoBadHabit(profile, 'bh_sugar');
    eq(undone.changed, true, 'undo changed');
    eq(profile.cores.mind.xp, 30, 'mind restored');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(profile.hp.current, 706, 'hp restored');
  });

  test('A -60 Vitality XP habit relapse drains -1 Shield even with 0 Vitality XP', () => {
    const profile = createKingArts13Profile();
    const sugar = profile.badHabits.find((habit) => habit.id === 'bh_sugar');
    sugar.penalty = { coreStat: 'vitality', coreXp: 60, coins: 0 };
    profile.cores.vitality.xp = 0;
    profile.hp.shield = 50;
    profile.hp.posVitalityBuffer = 25;
    profile.hp.negVitalityBuffer = 30;
    profile.hp.lifespanBonusHP = 0;

    const logged = logBadHabit(profile, 'bh_sugar', m3Day1());
    eq(logged.changed, true, 'relapse logged');
    eq(profile.cores.vitality.xp, 0, 'Vitality XP stays clamped at 0');
    eq(logged.coreLoss.length, 0, 'no Core XP entry when nothing can be deducted');
    eq(logged.corePenalty[0].stat, 'vitality', 'configured penalty stat');
    eq(logged.corePenalty[0].xp, 60, 'configured penalty reported as -60 Vitality XP');
    eq(profile.hp.shield, 49, 'full -60 XP loss still drains -1 Shield');
    eq(profile.hp.posVitalityBuffer, 25, 'positive buffer untouched');
    eq(profile.hp.negVitalityBuffer, 30, 'loss buffer keeps the 30 XP remainder');

    const undone = undoBadHabit(profile, 'bh_sugar');
    eq(undone.changed, true, 'undo changed');
    eq(profile.hp.shield, 50, 'shield restored exactly');
    eq(profile.hp.posVitalityBuffer, 25, 'positive buffer restored exactly');
    eq(profile.hp.negVitalityBuffer, 30, 'negative buffer restored exactly');
    eq(profile.hp.lifespanBonusHP, 0, 'Lifespan bonus restored exactly');
    eq(profile.hp.current, 706, 'Lifespan HP restored');
  });

  test('M3 journal pays once per local day and later edits are free', () => {
    const profile = createKingArts13Profile();
    const first = saveJournalEntry(profile, {
      mood: 'great',
      wins: '  Showed up  ',
      lessons: 'Sleep earlier',
      gratitude: 'Family',
      freeText: 'Good day',
    }, m3Day1());
    eq(first.created, true, 'created');
    eq(first.payout.xp, 10, 'xp payout');
    eq(first.payout.coreXp, 10, 'mind core xp payout');
    eq(first.payout.coins, 35, 'coin payout');
    eq(profile.character.xp, 6558, 'xp total');
    eq(profile.cores.mind.xp, 40, 'mind core xp total');
    eq(profile.character.goldBase, 829, 'gold base');
    eq(profile.character.gold, 839, 'gold total');
    eq(profile.journal.entries.length, 1, 'one entry');
    eq(profile.journal.entries[0].wins, 'Showed up', 'trimmed');
    eq(profile.journal.lastAwardedDate, '2026-11-15', 'award date');

    const edit = saveJournalEntry(profile, { mood: 'okay', wins: 'Edited' }, m3Day1());
    eq(edit.created, false, 'same-day edit');
    eq(edit.payout.alreadyPaid, true, 'already paid flag');
    eq(edit.payout.xp, 0, 'no extra xp');
    eq(edit.payout.coins, 0, 'no extra coins');
    eq(profile.character.xp, 6558, 'xp unchanged');
    eq(profile.journal.entries.length, 1, 'still one entry');

    const undone = undoJournalEntry(profile, '2026-11-15');
    eq(undone.changed, true, 'undo changed');
    eq(profile.character.xp, 6548, 'xp restored');
    eq(profile.cores.mind.xp, 30, 'mind core xp restored');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(profile.journal.entries.length, 0, 'entry removed');
    eq(profile.journal.lastAwardedDate, null, 'award cleared');
  });

  test('M3 journal pays again on the next local day', () => {
    const profile = createKingArts13Profile();
    saveJournalEntry(profile, { mood: 'good' }, m3Day1());
    const next = saveJournalEntry(profile, { mood: 'great' }, m3Day2());
    eq(next.created, true, 'new day entry');
    eq(next.payout.xp, 10, 'new xp');
    eq(next.payout.coreXp, 10, 'new mind xp');
    eq(next.payout.coins, 35, 'new coins');
    eq(profile.journal.entries.length, 2, 'two entries');
    eq(profile.character.xp, 6568, 'xp after two days');
    eq(profile.cores.mind.xp, 50, 'mind xp after two days');
    eq(profile.character.goldBase, 864, 'gold after two days');

    undoJournalEntry(profile, '2026-11-16');
    eq(profile.journal.entries.length, 1, 'back to one entry');
    eq(profile.journal.lastAwardedDate, '2026-11-15', 'last award restored');
    eq(profile.character.xp, 6558, 'day-2 payout reversed');
    eq(profile.cores.mind.xp, 40, 'day-2 mind xp reversed');
    eq(profile.character.goldBase, 829, 'day-2 coins reversed');
  });

  test('M3 daily summary reflects Strict, quests, habits and journal', () => {
    const profile = createKingArts13Profile();
    applyStrictAll(profile, true);
    completeDailyQuest(profile, 'dq_running', m3Day1());
    skipDailyQuest(profile, 'dq_sleep', m3Day1());
    logBadHabit(profile, 'bh_fastfood', m3Day1());
    saveJournalEntry(profile, { mood: 'okay' }, m3Day1());

    const summary = dailySummary(profile, m3Day1());
    eq(summary.date, '2026-11-15', 'date');
    eq(summary.total, 8, 'total');
    eq(summary.completed, 1, 'completed');
    eq(summary.skipped, 1, 'skipped');
    eq(summary.pending, 6, 'pending');
    eq(summary.strictCount, 8, 'strict count');
    eq(summary.allStrict, true, 'all strict');
    eq(summary.habitsClean, 2, 'habits clean');
    eq(summary.journalDone, true, 'journal done');
    eq(summary.recovery, false, 'not recovery');
  });

  /* -------------------------------- M4 -------------------------------- */

  const m4Now = () => new Date(2026, 10, 15, 12, 0, 0);

  test('M4 side quest pays Coins + Core XP + Skill XP, then undoes', () => {
    const profile = createKingArts13Profile();
    const questBefore = profile.sideQuests.find((quest) => quest.id === 'sq_create_series');

    const result = completeSideQuest(profile, 'sq_create_series', m4Now());
    eq(result.changed, true, 'changed');
    eq(result.coins, 20, 'coins');
    eq(profile.character.goldBase, 814, 'gold base');
    eq(profile.character.gold, 824, 'gold total');
    eq(profile.cores.creativity.xp, 520, 'creativity xp');
    eq(profile.skills.find((skill) => skill.id === 'video').xp, 488, 'video xp');
    eq(result.coreRewards.length, 1, 'one core reward');
    eq(result.coreRewards[0].label, 'Creativity', 'core label');
    eq(result.skillRewards[0].label, 'Video Editing', 'skill label');
    eq(questBefore.completed, true, 'completed');
    eq(questBefore.completions, 1, 'one completion');
    eq(profile.stats.sideQuestsCompleted, 1, 'stat');

    const undone = undoSideQuest(profile, 'sq_create_series');
    eq(undone.changed, true, 'undo changed');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(profile.cores.creativity.xp, 470, 'creativity restored');
    eq(profile.skills.find((skill) => skill.id === 'video').xp, 458, 'video restored');
    eq(questBefore.completed, false, 'open again');
    eq(questBefore.completions, 0, 'completions restored');
    eq(profile.stats.sideQuestsCompleted, 0, 'stat restored');
  });

  test('M4 secret quest pays its exact Vitality/Discipline/Coin rewards', () => {
    const profile = createKingArts13Profile();
    const result = completeSideQuest(profile, 'sq_run6k', m4Now());
    eq(result.coins, 10, 'coins');
    eq(profile.character.goldBase, 804, 'gold base');
    eq(profile.cores.vitality.xp, 10, 'vitality xp');
    eq(profile.cores.discipline.xp, 1087, 'discipline xp');
    eq(result.coreRewards.length, 2, 'two core rewards');

    undoSideQuest(profile, 'sq_run6k');
    eq(profile.cores.vitality.xp, 0, 'vitality restored');
    eq(profile.cores.discipline.xp, 1082, 'discipline restored');
    eq(profile.character.goldBase, 794, 'gold restored');
  });

  test('M4 repeatable quest can be completed again and undo only reverses the latest payout', () => {
    const profile = createKingArts13Profile();
    completeSideQuest(profile, 'sq_create_series', m4Now());
    const second = completeSideQuest(profile, 'sq_create_series', m4Now());
    eq(second.changed, true, 'second completion allowed');
    eq(profile.character.goldBase, 834, 'two payouts');
    eq(profile.cores.creativity.xp, 570, 'two core payouts');
    eq(profile.sideQuests.find((quest) => quest.id === 'sq_create_series').completions, 2, 'two completions');
    eq(profile.stats.sideQuestsCompleted, 2, 'two stat ticks');

    undoSideQuest(profile, 'sq_create_series');
    const quest = profile.sideQuests.find((row) => row.id === 'sq_create_series');
    eq(profile.character.goldBase, 814, 'latest payout reversed');
    eq(profile.cores.creativity.xp, 520, 'latest core payout reversed');
    eq(quest.completed, true, 'previous completion remains');
    eq(quest.completions, 1, 'one completion remains');
    eq(profile.stats.sideQuestsCompleted, 1, 'one stat tick remains');
  });

  test('M4 mission pays +500 XP / +1,000 G, levels up, updates goal progress and undoes', () => {
    const profile = createKingArts13Profile();
    const result = completeMission(profile, 'm_magnetic', m4Now());
    eq(result.changed, true, 'changed');
    eq(result.xp, 500, 'xp');
    eq(result.coins, 1000, 'coins');
    eq(profile.character.xp, 7048, 'character xp');
    eq(profile.character.goldBase, 1794, 'gold base');
    eq(profile.character.gold, 1804, 'gold total');
    eq(profile.missions.find((mission) => mission.id === 'm_magnetic').completed, true, 'mission done');
    eq(profile.goals.find((goal) => goal.id === 'g_youtube').progress, 0.5, 'goal progress');
    eq(result.goalProgress, 0.5, 'result goal progress');
    eq(profile.stats.missionsCompleted, 4, 'mission stat');
    eq(result.levelBefore, 6, 'level before');
    eq(result.levelAfter, 7, 'level after');
    eq(result.leveledUp, true, 'level up');

    const undone = undoMission(profile, 'm_magnetic');
    eq(undone.changed, true, 'undo changed');
    eq(profile.character.xp, 6548, 'xp restored');
    eq(profile.character.goldBase, 794, 'gold restored');
    eq(profile.goals.find((goal) => goal.id === 'g_youtube').progress, 0, 'goal progress restored');
    eq(profile.stats.missionsCompleted, 3, 'stat restored');
    eq(undone.levelAfter, 6, 'level restored');
  });

  test('M4 goal is gated by automatic progress, then pays +10,000 XP / +20,000 G', () => {
    const profile = createKingArts13Profile();
    const blocked = completeGoal(profile, 'g_youtube', m4Now());
    eq(blocked.changed, false, 'goal blocked');
    eq(blocked.code, 'goal-incomplete', 'goal code');
    eq(profile.character.xp, 6548, 'no xp on blocked goal');

    completeMission(profile, 'm_magnetic', m4Now());
    completeMission(profile, 'm_distribution', m4Now());
    const goal = profile.goals.find((row) => row.id === 'g_youtube');
    eq(goalProgress(profile, goal), 1, 'automatic progress reaches 100%');
    eq(profile.character.xp, 7548, 'two mission payouts');

    const achieved = completeGoal(profile, 'g_youtube', m4Now());
    eq(achieved.changed, true, 'goal paid');
    eq(achieved.xp, 10000, 'goal xp');
    eq(achieved.coins, 20000, 'goal coins');
    eq(profile.character.xp, 17548, 'character xp after goal');
    eq(profile.character.goldBase, 22794, 'gold after goal');
    eq(goal.completed, true, 'goal completed');
    eq(goal.status, 'done', 'goal status');
    eq(profile.stats.goalsCompleted, 2, 'goal stat');

    const undone = undoGoal(profile, 'g_youtube');
    eq(undone.changed, true, 'undo changed');
    eq(profile.character.xp, 7548, 'goal xp restored');
    eq(profile.character.goldBase, 2794, 'goal gold restored');
    eq(goal.completed, false, 'goal reopened');
    eq(goal.status, 'active', 'status restored');
    eq(profile.stats.goalsCompleted, 1, 'stat restored');
  });

  test('M4 completed seed goal rejects a second completion', () => {
    const profile = createKingArts13Profile();
    const result = completeGoal(profile, 'g_bulk', m4Now());
    eq(result.changed, false, 'already complete');
    eq(result.code, 'already-completed', 'code');
    eq(profile.character.xp, 6548, 'no duplicate payout');
  });

  test('M4 level-up and celebration triggers are exact', () => {
    const profile = createKingArts13Profile();
    const mission = completeMission(profile, 'm_magnetic', m4Now());
    const model = buildCelebrationModel({
      kind: 'mission',
      name: mission.mission.name,
      profile: mission.profile ?? profile,
      result: mission,
    });
    eq(model.eyebrow, 'Mission complete', 'mission eyebrow');
    eq(model.title, 'Build Magnetic Content Strategy', 'mission title');
    eq(model.rank, '🌱 The Seeker', 'rank title');
    eq(model.level, 7, 'rank level');
    eq(model.rewards[0], '+500 Character XP', 'mission xp reward');
    eq(model.rewards[1], '+1,000 Gold Coins', 'mission coin reward');
    truthy(model.note.includes('50%'), 'goal progress note');

    const levelModel = buildCelebrationModel({
      kind: 'level',
      profile,
      result: { levelAfter: 7, leveledUp: true, xp: 20, coins: 10 },
    });
    eq(levelModel.eyebrow, 'Level up', 'level eyebrow');
    eq(levelModel.title, 'Level 7 reached', 'level title');
    eq(levelModel.rewards[0], '+20 Character XP', 'level xp reward');

    eq(shouldCelebrate({ kind: 'mission', leveledUp: false }, { celebrationBanner: true }), true, 'mission always');
    eq(shouldCelebrate({ kind: 'goal', leveledUp: false }, { celebrationBanner: true }), true, 'goal always');
    eq(shouldCelebrate({ kind: 'strict', leveledUp: false }, { celebrationBanner: true }), false, 'strict no banner');
    eq(shouldCelebrate({ kind: 'strict', leveledUp: true }, { celebrationBanner: true }), true, 'level-up banner');
    eq(shouldCelebrate({ kind: 'goal', leveledUp: true }, { celebrationBanner: false }), false, 'setting can disable');
  });

  test('M4 normalization defaults repeatable quests and derives goal progress', () => {
    const raw = createKingArts13Profile();
    raw.sideQuests[0].repeatable = undefined;
    raw.goals.find((goal) => goal.id === 'g_youtube').progress = 0.9;
    const normalized = normalizeProfile(raw);
    eq(normalized.sideQuests[0].repeatable, true, 'repeatable default');
    eq(normalized.goals.find((goal) => goal.id === 'g_youtube').progress, 0, 'progress derived from missions');
    eq(normalized.goals.find((goal) => goal.id === 'g_bulk').progress, 1, 'completed goal stays at 1');
    eq(normalized.stats.sideQuestsCompleted, 0, 'side quest stat exists');
    eq(progressionSummary(normalized).sideTotal, 14, 'summary sees 14 quests');
    recalculateGoalProgress(normalized);
    eq(normalized.goals.find((goal) => goal.id === 'g_youtube').progress, 0, 'recalculate is stable');
  });

  test('M4 store exposes progression actions and level metadata', () => {
    const store = createProfileStore({ storage: createMemoryStorage(), now: m4Now });
    const summary = store.getProgressionSummary();
    eq(summary.sideTotal, 14, 'side total');
    eq(summary.sideCount, 11, 'side count');
    eq(summary.secretCount, 3, 'secret count');
    eq(summary.missionsDone, 3, 'missions done');
    eq(summary.goalsDone, 1, 'goals done');

    const mission = store.completeMission('m_magnetic');
    eq(mission.leveledUp, true, 'store level up');
    eq(mission.levelBefore, 6, 'store level before');
    eq(mission.levelAfter, 7, 'store level after');
    eq(store.getActiveProfile().character.xp, 7048, 'store xp');
    eq(store.getProgressionSummary().missionsDone, 4, 'store summary updates');

    const undo = store.undoMission('m_magnetic');
    eq(undo.leveledUp, false, 'undo is not a level up');
    eq(store.getActiveProfile().character.xp, 6548, 'store xp restored');
    eq(store.getProgressionSummary().missionsDone, 3, 'store summary restored');
  });

  /* -------------------------------- M5 -------------------------------- */

  const m5Store = () => createProfileStore({
    storage: createMemoryStorage(),
    now: () => new Date(2026, 10, 15, 12, 0, 0),
  });

  test('M5 finance CRUD re-syncs totals, Wealth XP/Coins, Core Stat and Gold', () => {
    const store = m5Store();
    const seedSummary = store.getFinanceSummary();
    near(seedSummary.totals.overallWealth, 5305.87, 'seed overall wealth');
    eq(seedSummary.wealthXP, 150, 'seed wealth xp');
    eq(seedSummary.wealthCoins, 10, 'seed wealth coins');
    eq(seedSummary.gold, 804, 'seed gold');

    const added = store.addFinanceRow('income', {
      name: 'Parity income',
      amount: 100,
      category: 'Test',
      date: '2026-11-15',
    });
    eq(added.changed, true, 'income added');
    truthy(added.row.id, 'row id');
    near(added.totals.totalIncomes, 4727, 'incomes +100');
    near(added.totals.currentBalance, 2917, 'balance +100');
    near(added.totals.overallWealth, 5405.87, 'wealth +100');
    eq(added.wealthXP, 151, 'wealth xp +1');
    eq(added.wealthCoins, 10, 'wealth coins unchanged');
    eq(added.gold, 804, 'gold unchanged');

    let profile = store.getActiveProfile();
    eq(profile.finance.incomes.length, 3, 'three income rows');
    eq(profile.cores.wealth.xp, 151, 'wealth core stat synced');
    eq(profile.finance.wealthXP, 151, 'finance snapshot synced');
    eq(profile.finance.wealthCoins, 10, 'finance coins synced');
    eq(profile.character.goldBase, 794, 'gold base untouched');
    eq(profile.character.gold, 804, 'displayed gold synced');

    const updated = store.updateFinanceRow({
      type: 'income',
      id: added.row.id,
      name: 'Parity income',
      amount: 200,
    });
    near(updated.totals.totalIncomes, 4827, 'incomes +200');
    near(updated.totals.currentBalance, 3017, 'balance +200');
    near(updated.totals.overallWealth, 5505.87, 'wealth +200');
    eq(updated.wealthXP, 152, 'wealth xp +2');
    eq(updated.wealthCoins, 11, 'wealth coins +1');
    eq(updated.gold, 805, 'gold +1 wealth coin');

    profile = store.getActiveProfile();
    eq(profile.cores.wealth.xp, 152, 'core stat follows edit');
    eq(profile.character.goldBase, 794, 'gold base still untouched');
    eq(profile.character.gold, 805, 'gold total follows coins');

    const deleted = store.deleteFinanceRow('income', added.row.id);
    near(deleted.totals.totalIncomes, 4627, 'incomes restored');
    near(deleted.totals.overallWealth, 5305.87, 'wealth restored');
    eq(deleted.wealthXP, 150, 'wealth xp restored');
    eq(deleted.wealthCoins, 10, 'wealth coins restored');
    eq(deleted.gold, 804, 'gold restored');

    profile = store.getActiveProfile();
    eq(profile.finance.incomes.length, 2, 'two seed income rows');
    eq(profile.cores.wealth.xp, 150, 'core stat restored');
    eq(profile.character.gold, 804, 'gold restored after delete');
  });

  test('M5 finance recompute is idempotent and the starting balance is editable', () => {
    const store = m5Store();
    const edited = store.updateFinanceRow({ type: 'startingBalance', amount: 600 });
    near(edited.totals.startingBalance, 600, 'starting balance');
    near(edited.totals.currentBalance, 2917, 'current balance');
    near(edited.totals.overallWealth, 5405.87, 'overall wealth');
    eq(edited.wealthXP, 151, 'wealth xp');
    eq(edited.wealthCoins, 10, 'wealth coins');

    const again = store.getFinanceSummary();
    near(again.totals.overallWealth, 5405.87, 'idempotent wealth');
    eq(again.wealthXP, 151, 'idempotent xp');
    eq(again.wealthCoins, 10, 'idempotent coins');
    eq(again.gold, 804, 'idempotent gold');

    const profile = store.getActiveProfile();
    eq(profile.cores.wealth.xp, 151, 'wealth core stat');
    eq(profile.character.goldBase, 794, 'gold base');
    eq(profile.character.gold, 804, 'gold total');

    let code = '';
    try {
      store.addFinanceRow('income', { name: '', amount: 0 });
    } catch (error) {
      code = error.code;
    }
    eq(code, 'invalid-finance-row', 'empty row rejected');
  });

  test('M5 purchase deducts Gold, counts the reward and undo restores everything', () => {
    const store = m5Store();
    const bought = store.purchaseReward('rw_nap_time');
    eq(bought.changed, true, 'purchase changed');
    eq(bought.price, 20, 'nap price');
    eq(bought.goldBefore, 804, 'gold before');
    eq(bought.goldAfter, 784, 'gold after');
    eq(bought.purchaseCount, 1, 'purchase counter');

    let profile = store.getActiveProfile();
    eq(profile.character.goldBase, 774, 'gold base spent');
    eq(profile.character.gold, 784, 'displayed gold spent');
    eq(profile.rewards.find((row) => row.id === 'rw_nap_time').purchaseCount, 1, 'reward count');
    eq(profile.ledger.length, 1, 'ledger entry');
    eq(profile.ledger[0].type, 'purchase', 'ledger type');
    eq(profile.ledger[0].rewardId, 'rw_nap_time', 'ledger reward');
    eq(profile.purchases.length, 1, 'purchase mirror');
    eq(profile.stats.rewardsPurchased, 1, 'purchase stat');
    truthy(bought.purchase.id, 'purchase id');

    const undone = store.undoPurchase(bought.purchase.id);
    eq(undone.changed, true, 'undo changed');
    eq(undone.price, 20, 'refund price');
    eq(undone.gold, 804, 'gold refunded');

    profile = store.getActiveProfile();
    eq(profile.character.goldBase, 794, 'gold base restored');
    eq(profile.character.gold, 804, 'gold total restored');
    eq(profile.rewards.find((row) => row.id === 'rw_nap_time').purchaseCount, 0, 'count restored');
    eq(profile.ledger.length, 0, 'ledger cleared');
    eq(profile.purchases.length, 0, 'mirror cleared');
    eq(profile.stats.rewardsPurchased, 0, 'stat restored');
  });

  test('M5 unaffordable rewards are rejected without touching Gold or the ledger', () => {
    const store = m5Store();
    let code = '';
    try {
      store.purchaseReward('rw_vacation');
    } catch (error) {
      code = error.code;
    }
    eq(code, 'insufficient-gold', 'store rejects the purchase');

    const profile = store.getActiveProfile();
    eq(profile.character.gold, 804, 'gold unchanged');
    eq(profile.ledger.length, 0, 'no ledger entry');
    eq(profile.rewards.find((row) => row.id === 'rw_vacation').purchaseCount, 0, 'no count');

    const king = createKingArts13Profile();
    const domain = purchaseRewardDomain(king, 'rw_vacation', m4Now());
    eq(domain.changed, false, 'domain failure');
    eq(domain.code, 'insufficient-gold', 'domain code');
    eq(availableGold(king), 804, 'available gold');
    eq(isAffordable(king, 804), true, 'exact price affordable');
    eq(isAffordable(king, 805), false, 'one over is not');
    eq(king.ledger.length, 0, 'domain left ledger empty');
  });

  test('M5 skip token purchase skips a quest with no penalty and undo returns the token', () => {
    const store = m5Store();
    const bought = store.purchaseReward(SKIP_TOKEN_REWARD_ID);
    eq(bought.price, 100, 'skip token price');
    eq(bought.skipTokenGranted, true, 'token granted');
    eq(bought.tokens.skipQuest, 1, 'one token');
    eq(bought.goldAfter, 704, 'gold spent');

    let profile = store.getActiveProfile();
    eq(profile.tokens.skipQuest, 1, 'stored token');
    eq(skipTokenCount(profile), 1, 'daily helper count');
    eq(profile.character.gold, 704, 'gold after token purchase');

    const used = store.useSkipToken('dq_sleep');
    eq(used.changed, true, 'token used');
    eq(used.tokenUsed, true, 'token flag');
    eq(used.tokensRemaining, 0, 'token consumed');
    eq(used.xp, 0, 'no xp penalty');
    eq(used.coins, 0, 'no coin penalty');
    eq(used.hpDamage, 0, 'no hp penalty');

    profile = store.getActiveProfile();
    eq(profile.dailyQuests.find((quest) => quest.id === 'dq_sleep').skipped, true, 'quest skipped');
    eq(profile.character.gold, 704, 'gold untouched by token');
    eq(profile.character.xp, 6548, 'xp untouched by token');
    eq(profile.hp.current, 706, 'hp untouched by token');
    eq(profile.stats.dailyQuestsSkipped, 1, 'skip stat');

    const undone = store.undoDailyQuest('dq_sleep');
    eq(undone.changed, true, 'skip undone');
    profile = store.getActiveProfile();
    eq(profile.dailyQuests.find((quest) => quest.id === 'dq_sleep').skipped, false, 'quest pending again');
    eq(profile.tokens.skipQuest, 1, 'token returned');

    const refunded = store.undoPurchase(bought.purchase.id);
    eq(refunded.changed, true, 'purchase refunded');
    profile = store.getActiveProfile();
    eq(profile.tokens.skipQuest, 0, 'token removed with refund');
    eq(profile.character.gold, 804, 'gold fully restored');
  });

  test('M5 rest-day reward protects today from skip penalties and auto-skips', () => {
    const store = m5Store();
    store.setQuestStrict('dq_sleep', true);
    const bought = store.purchaseReward(REST_DAY_REWARD_ID);
    eq(bought.price, 200, 'rest day price');
    eq(bought.restDayActivated, true, 'rest day activated');
    eq(bought.restDayDate, '2026-11-15', 'rest day date');
    eq(bought.goldAfter, 604, 'gold spent');

    let profile = store.getActiveProfile();
    eq(profile.tokens.restDay, '2026-11-15', 'stored rest day');
    eq(isRestDay(profile, m4Now()), true, 'daily helper sees rest day');

    const skipped = store.skipDailyQuest('dq_sleep');
    eq(skipped.restDay, true, 'skip sees rest day');
    eq(skipped.coins, 0, 'no coin penalty');
    eq(skipped.xp, 0, 'no xp penalty');
    eq(skipped.hpDamage, 0, 'no hp damage even when strict');
    profile = store.getActiveProfile();
    eq(profile.character.gold, 604, 'gold untouched');
    eq(profile.hp.current, 706, 'hp untouched');

    const refunded = store.undoPurchase(bought.purchase.id);
    eq(refunded.restDayCleared, true, 'rest day cleared on undo');
    profile = store.getActiveProfile();
    eq(profile.tokens.restDay, null, 'rest day removed');
    eq(profile.character.gold, 804, 'gold restored');

    const protectedProfile = createKingArts13Profile();
    protectedProfile.tokens.restDay = '2026-11-15';
    applyStrictAll(protectedProfile, true);
    for (const quest of protectedProfile.dailyQuests) quest.lastResetDate = '2026-11-14';
    const protectedRun = applyDailyRollover(protectedProfile, m4Now());
    eq(protectedRun.restDay, true, 'rollover sees rest day');
    eq(protectedRun.autoSkipped.length, 0, 'no midnight auto-skips');
    eq(protectedProfile.character.goldBase, 794, 'no gold penalty');
    eq(protectedProfile.hp.current, 706, 'no hp penalty');

    const control = createKingArts13Profile();
    applyStrictAll(control, true);
    for (const quest of control.dailyQuests) quest.lastResetDate = '2026-11-14';
    const controlRun = applyDailyRollover(control, m4Now());
    eq(controlRun.autoSkipped.length, 8, 'control still auto-skips');
    eq(control.character.goldBase, 759, 'control pays the coin penalty');
  });

  test('M5 reward helpers identify the two token rewards', () => {
    const king = createKingArts13Profile();
    const skip = king.rewards.find((reward) => reward.id === SKIP_TOKEN_REWARD_ID);
    const rest = king.rewards.find((reward) => reward.id === REST_DAY_REWARD_ID);
    eq(isSkipTokenReward(skip), true, 'skip token helper');
    eq(isRestDayReward(rest), true, 'rest day helper');
    eq(isSkipTokenReward(rest), false, 'rest is not a skip token');
    eq(isRestDayReward(skip), false, 'skip is not a rest day');

    const derived = deriveWealthSnapshot(king.finance);
    near(derived.totals.overallWealth, 5305.87, 'derived wealth');
    eq(derived.wealthXP, 150, 'derived xp');
    eq(derived.wealthCoins, 10, 'derived coins');
  });

  /* -------------------------------- M6 -------------------------------- */

  const m6Store = () => createProfileStore({
    storage: createMemoryStorage(),
    now: () => new Date(2026, 10, 15, 12, 0, 0),
  });

  test('M6 daily-quest CRUD creates, edits and deletes without touching parity math', () => {
    const store = m6Store();
    eq(store.getActiveProfile().dailyQuests.length, 8, 'seed dailies');

    const created = store.crudUpsert('dailyQuest', {
      name: 'Parity Quest',
      xp: 7,
      coins: 3,
      heal: 5,
      strict: true,
      physicalPenalty: 'Stretch for five minutes',
      active: true,
    });
    eq(created.changed, true, 'created');
    truthy(created.id, 'new quest id');

    let profile = store.getActiveProfile();
    eq(profile.dailyQuests.length, 9, 'nine dailies');
    let quest = profile.dailyQuests.find((row) => row.id === created.id);
    eq(quest.name, 'Parity Quest', 'name');
    eq(quest.xp, 7, 'xp');
    eq(quest.coins, 3, 'coins');
    eq(quest.heal, 5, 'heal');
    eq(quest.isHealthQuest, true, 'health quest inferred');
    eq(quest.strict, true, 'strict');
    eq(profile.character.xp, 6548, 'character xp untouched');
    eq(profile.character.gold, 804, 'gold untouched');
    eq(levelFromXP(profile.character.xp, CHARACTER_BASE), 6, 'level untouched');

    const edited = store.crudUpsert('dailyQuest', {
      id: created.id,
      name: 'Parity Quest II',
      xp: 9,
      coins: 4,
      heal: 0,
      isHealthQuest: false,
      strict: false,
      active: true,
    });
    eq(edited.id, created.id, 'same id on edit');

    profile = store.getActiveProfile();
    eq(profile.dailyQuests.length, 9, 'edit does not duplicate');
    quest = profile.dailyQuests.find((row) => row.id === created.id);
    eq(quest.name, 'Parity Quest II', 'edited name');
    eq(quest.xp, 9, 'edited xp');
    eq(quest.isHealthQuest, false, 'health flag can be cleared');

    const removed = store.crudDelete('dailyQuest', created.id);
    eq(removed.changed, true, 'deleted');
    profile = store.getActiveProfile();
    eq(profile.dailyQuests.length, 8, 'seed dailies restored');
    eq(profile.character.xp, 6548, 'xp still untouched');
    eq(profile.character.gold, 804, 'gold still untouched');
  });

  test('M6 CRUD covers every collection and cleans dangling references', () => {
    const store = m6Store();

    const habit = store.crudUpsert('badHabit', {
      name: 'Parity Habit', emoji: '⚠️', active: true,
    });
    eq(habit.changed, true, 'habit created');
    eq(habit.item.hpDamage, 0, 'habit HP damage stays disabled');

    const skill = store.crudUpsert('skill', { name: 'Parity Skill', xp: 120, active: true });
    eq(skill.changed, true, 'skill created');
    eq(skill.item.name, 'Parity Skill', 'skill name');
    eq(skill.item.startingXP, 0, 'new skill starts at zero');

    const artBefore = store.getActiveProfile().skills.find((row) => row.id === 'art');
    const artSaved = store.crudUpsert('skill', {
      id: 'art',
      name: artBefore.name,
      icon: artBefore.icon,
      startingXP: artBefore.startingXP,
      active: true,
    });
    eq(artSaved.item.earnedXP, 88, 'read-only earned xp preserved');
    eq(artSaved.item.xp, 1588, 'seeded art total preserved');

    const side = store.crudUpsert('sideQuest', {
      name: 'Parity Side Quest',
      type: 'secret',
      coins: 9,
      coreStat1: 'mind',
      coreXp1: 5,
      skill1: skill.id,
      skillXp1: 15,
      repeatable: true,
      active: true,
    });
    eq(side.changed, true, 'side quest created');
    eq(side.item.type, 'secret', 'secret type');
    eq(side.item.coreRewards.length, 1, 'core reward');
    eq(side.item.skillRewards.length, 1, 'skill reward');

    const mission = store.crudUpsert('mission', {
      name: 'Parity Mission',
      status: 'active',
      progressPercent: 25,
      tasksText: 'First task\nSecond task',
    });
    eq(mission.changed, true, 'mission created');
    eq(mission.item.tasks.length, 2, 'mission tasks parsed');

    const goal = store.crudUpsert('goal', {
      name: 'Parity Goal',
      missionIds: [mission.id],
      progressPercent: 40,
    });
    eq(goal.changed, true, 'goal created');

    const standaloneGoal = store.crudUpsert('goal', {
      name: 'Parity Standalone Goal',
      progressPercent: 40,
    });
    eq(standaloneGoal.changed, true, 'standalone goal created');

    const reward = store.crudUpsert('reward', { name: 'Parity Reward', price: 33, active: true });
    eq(reward.changed, true, 'reward created');
    eq(reward.item.price, 33, 'reward price');

    let profile = store.getActiveProfile();
    eq(profile.goals.find((row) => row.id === goal.id).missionIds.length, 1, 'goal mission link');
    eq(profile.goals.find((row) => row.id === goal.id).progress, 0, 'linked progress stays derived');
    near(profile.goals.find((row) => row.id === standaloneGoal.id).progress, 0.4, 'standalone progress kept');

    store.crudDelete('mission', mission.id);
    profile = store.getActiveProfile();
    eq(profile.goals.find((row) => row.id === goal.id).missionIds.length, 0, 'mission link cleaned');

    store.crudDelete('skill', skill.id);
    profile = store.getActiveProfile();
    eq(
      profile.sideQuests.find((row) => row.id === side.id).skillRewards.length,
      0,
      'skill reward cleaned',
    );

    for (const [type, id] of [
      ['badHabit', habit.id],
      ['sideQuest', side.id],
      ['goal', goal.id],
      ['goal', standaloneGoal.id],
      ['reward', reward.id],
    ]) {
      eq(store.crudDelete(type, id).changed, true, `${type} deleted`);
    }

    profile = store.getActiveProfile();
    eq(profile.badHabits.length, 4, 'seed habits preserved');
    eq(profile.badHabits.filter((row) => row.active !== false).length, 3, 'three active habits');
    eq(profile.sideQuests.length, 14, 'seed side quests preserved');
    eq(profile.goals.length, 2, 'seed goals preserved');
    eq(profile.rewards.length, 13, 'seed rewards preserved');
    eq(profile.character.xp, 6548, 'xp unlocked');
    eq(profile.character.gold, 804, 'gold unlocked');
  });

  test('M6 title, rank and Core Stat label edits stay profile-only', () => {
    const store = m6Store();

    const title = store.crudUpsert('characterTitle', {
      id: 'seeker',
      name: '🌱 Parity Seeker',
      minLevel: 0,
    });
    eq(title.changed, true, 'title updated');
    let profile = store.getActiveProfile();
    const seeker = profile.titles.find((row) => row.id === 'seeker');
    eq(seeker.name, '🌱 Parity Seeker', 'title name');
    eq(seeker.minLevel, 0, 'first title stays at level 0');
    eq(characterTitleForLevel(6, profile.titles).id, 'seeker', 'title at level 6');
    eq(characterTitleForLevel(6, profile.titles).name, '🌱 Parity Seeker', 'title display');

    const secondTitle = store.crudUpsert('characterTitle', {
      id: 'path-aligner',
      name: '🧭 Parity Aligner',
      minLevel: 12,
    });
    eq(secondTitle.changed, true, 'second title updated');
    profile = store.getActiveProfile();
    const aligner = profile.titles.find((row) => row.id === 'path-aligner');
    eq(aligner.minLevel, 12, 'second title threshold');
    eq(characterTitleForLevel(11, profile.titles).id, 'seeker', 'title below threshold');
    eq(characterTitleForLevel(12, profile.titles).id, 'path-aligner', 'title at threshold');

    const rank = store.crudUpsert('coreRank', {
      statKey: 'vitality',
      id: 'novice',
      name: '🐣 Rookie',
      maxLevel: 4,
    });
    eq(rank.changed, true, 'rank updated');
    profile = store.getActiveProfile();
    const novice = profile.rankTracks.vitality.ranks.find((row) => row.id === 'novice');
    eq(novice.name, '🐣 Rookie', 'rank name');
    eq(novice.maxLevel, 4, 'rank threshold');
    eq(rankForLevel(4, profile.rankTracks.vitality).id, 'novice', 'rank at 4');
    eq(rankForLevel(5, profile.rankTracks.vitality).id, 'apprentice', 'rank at 5');

    const stat = store.crudUpsert('coreStat', {
      statKey: 'wealth',
      label: 'Capital',
      emoji: '💰',
    });
    eq(stat.changed, true, 'core stat label updated');
    profile = store.getActiveProfile();
    eq(profile.rankTracks.wealth.label, 'Capital', 'core stat label');
    eq(profile.rankTracks.wealth.display, '💰 Capital', 'core stat display');

    eq(profile.character.xp, 6548, 'character xp still 6548');
    eq(profile.character.gold, 804, 'gold still 804');
    eq(profile.cores.wealth.xp, 150, 'wealth core xp still 150');
    eq(profile.cores.vitality.xp, 0, 'vitality still clamped');
  });

  test('M6 settings update identity, HP, point awards and Wealth baseline', () => {
    const store = m6Store();

    const identity = store.updateIdentity({ name: '  Test Player  ', age: 30 });
    eq(identity.name, 'Test Player', 'trimmed name');
    eq(identity.age, 30, 'age');
    let profile = store.getActiveProfile();
    eq(profile.name, 'Test Player', 'stored name');
    eq(profile.hp.max, 1000, 'lifespan denominator');
    eq(profile.hp.base, 647, 'base HP at 30');
    eq(profile.hp.current, 647, 'current HP follows the base');

    store.updateIdentity({ age: 120 });
    profile = store.getActiveProfile();
    eq(profile.age, 85, 'age clamps to 85');
    eq(profile.hp.base, 0, 'base HP at 85');
    eq(profile.hp.current, 0, 'current HP follows the base');

    const hp = store.updateHpSettings({
      runningHeal: 25,
      sleepHeal: 30,
      skippedHealthDamage: 20,
      shieldGainXP: 1200,
      shieldLossXP: 750,
      exhaustedPercent: 20,
      woundedPercent: 45,
    });
    eq(hp.changed, true, 'Vitality Shield tuning saved');
    profile = store.getActiveProfile();
    eq(profile.settings.hp.runningHeal, 15, 'running heal is no longer editable');
    eq(profile.settings.hp.sleepHeal, 20, 'sleep heal is no longer editable');
    eq(profile.settings.hp.skippedHealthDamage, 15, 'strict skip damage is no longer editable');
    eq(profile.settings.hp.shieldGainXP, 1200, 'shield gain threshold');
    eq(profile.settings.hp.shieldLossXP, 750, 'shield loss threshold');
    eq(profile.settings.hp.exhaustedPercent, 20, 'exhausted threshold');
    eq(profile.settings.hp.woundedPercent, 45, 'wounded threshold');
    eq(profileView(profile).hp.shieldGainXP, 1200, 'HUD sees the gain threshold');
    eq(profileView(profile).hp.shieldLossXP, 750, 'HUD sees the loss threshold');
    eq(profile.dailyQuests.find((row) => row.id === 'dq_running').heal, 0, 'running quest has no direct heal');
    eq(profile.dailyQuests.find((row) => row.id === 'dq_sleep').heal, 0, 'sleep quest has no direct heal');

    const points = store.updatePointAwards({
      missionXp: 600,
      missionCoins: 1200,
      goalXp: 12000,
      goalCoins: 24000,
      journalXp: 12,
      journalCoins: 40,
    });
    eq(points.changed, true, 'point awards saved');
    profile = store.getActiveProfile();
    eq(profile.settings.points.mission.xp, 600, 'mission xp award');
    eq(profile.settings.points.mission.coins, 1200, 'mission coin award');
    eq(profile.settings.points.goal.xp, 12000, 'goal xp award');
    eq(profile.settings.points.goal.coins, 24000, 'goal coin award');
    eq(profile.settings.points.journal.xp, 12, 'journal xp award');
    eq(profile.settings.points.journal.coins, 40, 'journal coin award');
    eq(profile.journal.xp, 12, 'journal mirror xp');
    eq(profile.journal.coins, 40, 'journal mirror coins');
    eq(levelFromXP(profile.character.xp, CHARACTER_BASE), 6, 'level formula still locked');
    eq(nextLevelXP(6, CHARACTER_BASE), 7000, 'threshold still locked');

    const baseline = store.updateWealthBaseline(97);
    eq(baseline.changed, true, 'baseline saved');
    eq(baseline.baseline, 97, 'baseline value');
    profile = store.getActiveProfile();
    eq(profile.finance.wealthXP, 150, 'wealth xp unchanged');
    eq(profile.character.gold, 804, 'gold unchanged');
    eq(profile.cores.wealth.xp, 150, 'wealth core unchanged');
  });

  test('M6 finance quick adjustment adds, deducts, clamps and re-syncs Wealth', () => {
    const store = m6Store();

    const added = store.adjustFinanceRow('savings', 'sav_cimb', {
      direction: 'add', amount: 500, note: 'Parity top-up',
    });
    eq(added.changed, true, 'added');
    near(added.row.amount, 1000, 'CIMB amount');
    near(added.totals.totalSavings, 1040.13, 'savings total');
    near(added.totals.overallWealth, 5805.87, 'overall wealth');
    eq(added.wealthXP, 155, 'wealth xp');
    eq(added.wealthCoins, 11, 'wealth coins');
    eq(added.gold, 805, 'gold follows coins');

    let profile = store.getActiveProfile();
    const cimb = profile.finance.savings.find((row) => row.id === 'sav_cimb');
    eq(cimb.adjustments.length, 1, 'one adjustment');
    eq(cimb.adjustments[0].direction, 'add', 'direction logged');
    eq(cimb.adjustments[0].amount, 500, 'amount logged');
    eq(profile.cores.wealth.xp, 155, 'wealth core synced');
    eq(profile.character.goldBase, 794, 'gold base untouched');

    const deducted = store.adjustFinanceRow('savings', 'sav_cimb', {
      direction: 'deduct', amount: 500,
    });
    near(deducted.totals.totalSavings, 540.13, 'savings restored');
    near(deducted.totals.overallWealth, 5305.87, 'wealth restored');
    eq(deducted.wealthXP, 150, 'xp restored');
    eq(deducted.wealthCoins, 10, 'coins restored');
    eq(deducted.gold, 804, 'gold restored');

    profile = store.getActiveProfile();
    eq(profile.finance.savings.find((row) => row.id === 'sav_cimb').adjustments.length, 2, 'two logs');

    const clamped = store.adjustFinanceRow('asset', 'ast_usdt', {
      direction: 'deduct', amount: 9999,
    });
    near(clamped.row.amount, 0, 'row clamps at zero');
    eq(clamped.row.adjustments[0].applied, -348.74, 'applied delta clamps');
    near(clamped.totals.totalAssets, 1600, 'assets after clamp');
    near(clamped.totals.overallWealth, 4957.13, 'overall after clamp');
    eq(clamped.wealthXP, 146, 'xp after clamp');
    eq(clamped.wealthCoins, 9, 'coins after clamp');
    eq(clamped.gold, 803, 'gold after clamp');

    let code = '';
    try {
      store.adjustFinanceRow('income', 'inc_commission', { amount: 10 });
    } catch (error) {
      code = error.code;
    }
    eq(code, 'invalid-finance-type', 'incomes cannot be adjusted');

    code = '';
    try {
      store.adjustFinanceRow('savings', 'sav_cimb', { amount: 0 });
    } catch (error) {
      code = error.code;
    }
    eq(code, 'invalid-amount', 'zero amount rejected');
  });

  test('M6 JSON backup exports, previews and replaces the profile set only when valid', () => {
    const store = m6Store();
    const exported = store.exportBackup();
    eq(exported.kind, BACKUP_KIND, 'backup kind');
    eq(exported.schemaVersion, BACKUP_SCHEMA_VERSION, 'backup schema');
    eq(exported.profiles.length, 1, 'one profile exported');
    eq(exported.activeProfileId, 'p_king_arts13', 'active profile exported');

    const json = JSON.stringify(exported);
    const preview = store.previewBackup(json);
    eq(preview.ok, true, 'preview valid');
    eq(preview.summary.profileCount, 1, 'preview count');
    eq(preview.summary.profiles[0].name, 'King.Arts13', 'preview name');
    eq(preview.summary.profiles[0].level, 6, 'preview level');
    eq(preview.summary.profiles[0].gold, 804, 'preview gold');

    eq(store.previewBackup('{not json').ok, false, 'invalid JSON rejected');
    const wrongSchema = store.previewBackup(JSON.stringify({ ...exported, schemaVersion: 99 }));
    eq(wrongSchema.ok, false, 'wrong schema rejected');
    truthy(wrongSchema.errors.length > 0, 'schema error reported');
    eq(store.previewBackup(JSON.stringify({ ...exported, profiles: [] })).ok, false, 'empty set rejected');

    store.updateIdentity({ name: 'Changed Player' });
    eq(store.getActiveProfile().name, 'Changed Player', 'profile changed before import');

    let code = '';
    try {
      store.importBackup('{not json');
    } catch (error) {
      code = error.code;
    }
    eq(code, 'invalid-backup', 'invalid import throws');
    eq(store.getActiveProfile().name, 'Changed Player', 'invalid import leaves state');

    store.createProfile({ name: 'Second Player' });
    eq(store.getProfiles().length, 2, 'two profiles before import');

    const imported = store.importBackup(json);
    eq(imported.changed, true, 'import changed');
    eq(imported.profiles.length, 1, 'backup replaces the set');
    eq(imported.activeId, 'p_king_arts13', 'active restored');
    const restored = store.getActiveProfile();
    eq(restored.name, 'King.Arts13', 'name restored');
    eq(restored.character.xp, 6548, 'xp restored');
    eq(restored.character.gold, 804, 'gold restored');
    eq(levelFromXP(restored.character.xp, CHARACTER_BASE), 6, 'level restored');
  });

  test('M6 delete-profile guard blocks the last profile and keeps an active profile', () => {
    const store = m6Store();
    let code = '';
    try {
      store.deleteProfile('p_king_arts13');
    } catch (error) {
      code = error.code;
    }
    eq(code, 'last-profile', 'last profile blocked');
    eq(store.getProfiles().length, 1, 'profile set untouched');

    store.createProfile({ name: 'Second Player' });
    eq(store.getProfiles().length, 2, 'second profile created');
    eq(store.getActiveProfile().name, 'Second Player', 'new profile active');

    const fallbackId = store.deleteProfile(store.getActiveId());
    eq(fallbackId, 'p_king_arts13', 'fallback profile');
    eq(store.getProfiles().length, 1, 'one profile remains');
    eq(store.getActiveId(), 'p_king_arts13', 'fallback active');
    eq(store.getActiveProfile().character.xp, 6548, 'survivor intact');
  });

  test('M6 PWA manifest and versioned shell precache cover every asset', () => {
    eq(PWA_CACHE_PREFIX, 'gol-v2-', 'cache prefix');
    eq(PWA_CACHE_VERSION, 'gol-v2-m6-final13', 'cache version bumped');
    truthy(PWA_CACHE_VERSION.startsWith(PWA_CACHE_PREFIX), 'versioned cache name');
    truthy(PWA_LEGACY_CACHE_PREFIXES.includes('gol-shell-'), 'legacy cache cleanup');
    eq(PWA_MANIFEST.startUrl, './index.html', 'start url');
    eq(PWA_MANIFEST.scope, './', 'scope');
    eq(PWA_MANIFEST.display, 'standalone', 'display');
    eq(PWA_MANIFEST.themeColor, '#07080c', 'theme color');
    eq(PWA_MANIFEST.backgroundColor, '#07080c', 'background color');
    eq(PWA_OFFLINE_PAGE, './index.html', 'offline fallback');

    eq(iconCount(), 44, '44 icons cached');
    eq(PWA_PRECACHE.filter((path) => path.startsWith('./icons/')).length, 44, 'icon entries');
    eq(PWA_PRECACHE.length, 81, 'full shell size');
    eq(new Set(PWA_PRECACHE).size, PWA_PRECACHE.length, 'no duplicate entries');
    eq(PWA_PRECACHE.filter((path) => path.endsWith('.css')).length, 5, 'five stylesheets');
    eq(PWA_PRECACHE.filter((path) => path.endsWith('.js')).length, 29, 'all JS modules');

    for (const required of [
      './index.html',
      './tests.html',
      './manifest.json',
      './js/app.js',
      './js/core/crud.js',
      './js/core/backup.js',
      './js/core/pwa.js',
      './js/editors/crud-sheet.js',
      './js/tests/parity.js',
      './icons/streaming_(1).png',
      './icons/arco.png',
      './icons/assasin.png',
      './icons/atena.png',
      './icons/magico.png',
    ]) {
      truthy(isShellAsset(required), `precaches ${required}`);
    }
  });


  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;

  const report = {
    suite: 'M1 + M2 + M3 + M4 + M5 + M6 parity',
    passed,
    failed,
    total: results.length,
    durationMs,
    ok: failed === 0,
    results,
    generatedAt: new Date().toISOString(),
    seed: KING_ARTS13_EXPECTED,
  };

  if (typeof window !== 'undefined') {
    window.__PARITY__ = report;
  }

  return report;
}

/** Plain-text report, useful for headless DOM output. */
export function formatParityReport(report) {
  const lines = report.results.map((result) =>
    result.ok ? `PASS  ${result.name}` : `FAIL  ${result.name} — ${result.detail}`,
  );
  lines.push('');
  lines.push(
    `${report.ok ? 'RESULT: PASS' : 'RESULT: FAIL'} — ${report.passed}/${report.total} passed, ${report.failed} failed (${report.durationMs} ms)`,
  );
  return lines.join('\n');
}
