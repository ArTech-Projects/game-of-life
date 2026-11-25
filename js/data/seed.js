/**
 * The Game of Life V2 — seed data.
 *
 * Every number in `createKingArts13Profile()` is verified against the
 * Notion export in `GameOfLife/notion-export/`. See AGENTS.md §5.
 *
 * Never rebuild a profile from scratch in place. Migrations must be additive
 * and must preserve these values.
 */

import {
  POINT_AWARDS,
  HP_DEFAULTS,
  LIFESPAN_DENOMINATOR,
  ageFromBirthday,
  birthdayForAge,
  isValidDateKey,
  maxHPForAge,
  computeFinanceTotals,
  syncLifespanState,
  wealthXPFor,
  wealthCoinsFor,
  derivedGold,
  localDateKey,
} from '../core/formulas.js';
import {
  cloneCharacterTitles,
  cloneRankTracks,
} from '../core/titles.js';

export const SEED_SCHEMA_VERSION = 1;
export const KING_ARTS13_ID = 'p_king_arts13';
/** Fixed seed birthday; at the 2026 seed date this is exactly age 25. */
export const KING_ARTS13_BIRTHDAY = '2001-05-15';
export const SEED_DATE = '2026-11-15';
export const SEED_TIMESTAMP = '2026-11-15T00:00:00.000Z';

/** Maximum HP for the seeded age (25). Kept explicit for parity tests. */
export const KING_ARTS13_MAX_HP = maxHPForAge(25, HP_DEFAULTS); // 706

/**
 * Authoritative expected values for the automated parity suite.
 * If a change breaks one of these, the change is wrong.
 */
export const KING_ARTS13_EXPECTED = Object.freeze({
  id: KING_ARTS13_ID,
  name: 'King.Arts13',
  character: Object.freeze({
    xp: 6548,
    level: 6,
    nextLevelXP: 7000,
    title: '🌱 The Seeker',
    startingXP: 5300,
    gold: 804,
    goldBase: 794,
    legacyCoinsNumber: 1308,
  }),
  cores: Object.freeze({
    vitality: Object.freeze({ xp: 0, rawSourceXP: -20, level: 0, nextLevelXP: 100, rank: '🐣 Novice' }),
    discipline: Object.freeze({ xp: 1082, level: 4, nextLevelXP: 1500, rank: '🛠️ Apprentice' }),
    creativity: Object.freeze({ xp: 470, level: 2, nextLevelXP: 600, rank: '🐣 Novice' }),
    mind: Object.freeze({ xp: 30, level: 0, nextLevelXP: 100, rank: '🐣 Novice' }),
    wealth: Object.freeze({ xp: 150, level: 1, nextLevelXP: 300, rank: '🐣 Novice' }),
    connection: Object.freeze({ xp: 680, level: 3, nextLevelXP: 1000, rank: '🐣 Novice' }),
  }),
  skills: Object.freeze({
    art: Object.freeze({ xp: 1588, level: 5, nextLevelXP: 2100 }),
    electronics: Object.freeze({ xp: 510, level: 2, nextLevelXP: 600 }),
    mech: Object.freeze({ xp: 350, level: 2, nextLevelXP: 600 }),
    video: Object.freeze({ xp: 458, level: 2, nextLevelXP: 600 }),
    filming: Object.freeze({ xp: 200, level: 1, nextLevelXP: 300 }),
    trading: Object.freeze({ xp: 410, level: 2, nextLevelXP: 600 }),
  }),
  finance: Object.freeze({
    startingBalance: 500,
    totalIncomes: 4627,
    totalExpenses: 2310,
    currentBalance: 2817,
    totalAssets: 1948.74,
    totalSavings: 540.13,
    overallWealth: 5305.87,
    wealthXpBaseline: 97,
    wealthXP: 150,
    wealthCoins: 10,
  }),
  hp: Object.freeze({ age: 25, maxHP: 706, birthday: KING_ARTS13_BIRTHDAY }),
  counts: Object.freeze({
    dailyQuests: 8,
    sideQuests: 14,
    secretQuests: 3,
    badHabits: 3,
    missions: 5,
    missionsDone: 3,
    goals: 2,
    goalsDone: 1,
    rewards: 13,
    journalEntries: 0,
  }),
});

const SEED_NOTES = Object.freeze([
  'Vitality: Notion stores -20 XP (starting 125, count -145). Spec requires >= 0, so stored XP is 0.',
  'Wealth: Notion finance XP is 50; live floor(5305.87/100) is 53. Baseline 97 reproduces 150 total.',
  'Gold 804 = 794 earned + 10 wealth coins. Kept split to avoid double counting.',
  'Finance line splits are reconstructed; only the exported totals are authoritative.',
  'Daily quests use editable Core + Skill reward slots; Character XP is auto-computed from them (M6 alignment).',
  'Bad habit Notion points are preserved as legacyPoints; habits deal HP damage instead.',
  'Age is derived from the birthday 2001-05-15; at the 2026 seed date it is 25 and gives Max HP 706.',
]);

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * M6 migration map: themed Core/Skill rewards for the seed daily quests.
 * Sums match the pre-M6 flat `xp` totals so saved profiles keep their XP.
 */
export const DAILY_REWARD_TEMPLATES = Object.freeze({
  dq_running: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'vitality', xp: 12 }, { stat: 'discipline', xp: 8 }]),
    skillRewards: Object.freeze([]),
  }),
  dq_sleep: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'vitality', xp: 10 }]),
    skillRewards: Object.freeze([]),
  }),
  dq_reading: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'mind', xp: 10 }]),
    skillRewards: Object.freeze([]),
  }),
  dq_morning: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'discipline', xp: 5 }]),
    skillRewards: Object.freeze([]),
  }),
  dq_trading: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'discipline', xp: 5 }]),
    skillRewards: Object.freeze([{ skill: 'trading', xp: 10 }]),
  }),
  dq_art: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'creativity', xp: 5 }]),
    skillRewards: Object.freeze([{ skill: 'art', xp: 5 }]),
  }),
  dq_youtube: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'creativity', xp: 5 }]),
    skillRewards: Object.freeze([{ skill: 'video', xp: 5 }]),
  }),
  dq_chores: Object.freeze({
    coreRewards: Object.freeze([{ stat: 'discipline', xp: 5 }]),
    skillRewards: Object.freeze([]),
  }),
});

function dailyQuests() {
  return [
    {
      id: 'dq_running',
      name: 'Running',
      icon: 'icons/running-shoes.png',
      xp: 20,
      coins: 10,
      penalty: { xp: 0, coins: 0, coreXp: 20 },
      physicalPenalty: '20 Push-ups',
      heal: 0,
      isHealthQuest: true,
      coreRewards: [
        { stat: 'vitality', xp: 12 },
        { stat: 'discipline', xp: 8 },
      ],
      skillRewards: [],
      coreStat: 'vitality',
      coreXp: 12,
      skill: null,
      skillXp: 0,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 1,
      active: true,
    },
    {
      id: 'dq_sleep',
      name: 'Sleep before 11 PM',
      icon: 'icons/bed.png',
      xp: 10,
      coins: 30,
      penalty: { xp: 0, coins: 5, coreXp: 10 },
      physicalPenalty: 'Lights out 30 minutes early tonight',
      heal: 0,
      isHealthQuest: true,
      coreRewards: [{ stat: 'vitality', xp: 10 }],
      skillRewards: [],
      coreStat: 'vitality',
      coreXp: 10,
      skill: null,
      skillXp: 0,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 2,
      active: true,
    },
    {
      id: 'dq_reading',
      name: 'Reading/Audiobook',
      icon: 'icons/book_(5).png',
      xp: 10,
      coins: 25,
      penalty: { xp: 0, coins: 0, coreXp: 10 },
      physicalPenalty: 'Read 10 pages aloud',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'mind', xp: 10 }],
      skillRewards: [],
      coreStat: 'mind',
      coreXp: 10,
      skill: null,
      skillXp: 0,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 3,
      active: true,
    },
    {
      id: 'dq_morning',
      name: 'Morning Routine',
      icon: 'icons/rules.png',
      xp: 5,
      coins: 30,
      penalty: { xp: 0, coins: 5, coreXp: 5 },
      physicalPenalty: 'Make your bed + 10 squats',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'discipline', xp: 5 }],
      skillRewards: [],
      coreStat: 'discipline',
      coreXp: 5,
      skill: null,
      skillXp: 0,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 4,
      active: true,
    },
    {
      id: 'dq_trading',
      name: 'Trading(Study,Trade,Backtest)',
      icon: 'icons/forex.png',
      xp: 15,
      coins: 30,
      penalty: { xp: 0, coins: 0, coreXp: 5 },
      physicalPenalty: 'Review one losing trade',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'discipline', xp: 5 }],
      skillRewards: [{ skill: 'trading', xp: 10 }],
      coreStat: 'discipline',
      coreXp: 5,
      skill: 'trading',
      skillXp: 10,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 5,
      active: true,
    },
    {
      id: 'dq_art',
      name: 'Art (Content, Commission)',
      icon: 'icons/art.png',
      xp: 10,
      coins: 5,
      penalty: { xp: 0, coins: 15, coreXp: 5 },
      physicalPenalty: '10-minute warm-up sketch',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'creativity', xp: 5 }],
      skillRewards: [{ skill: 'art', xp: 5 }],
      coreStat: 'creativity',
      coreXp: 5,
      skill: 'art',
      skillXp: 5,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 6,
      active: true,
    },
    {
      id: 'dq_youtube',
      name: 'YouTube/Content Work',
      icon: 'icons/streaming.png',
      xp: 10,
      coins: 0,
      penalty: { xp: 0, coins: 5, coreXp: 5 },
      physicalPenalty: 'Outline one video idea',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'creativity', xp: 5 }],
      skillRewards: [{ skill: 'video', xp: 5 }],
      coreStat: 'creativity',
      coreXp: 5,
      skill: 'video',
      skillXp: 5,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 7,
      active: true,
    },
    {
      id: 'dq_chores',
      name: 'Evening Chores + Family Time',
      icon: 'icons/kitchenware.png',
      xp: 5,
      coins: 0,
      penalty: { xp: 0, coins: 5, coreXp: 5 },
      physicalPenalty: '10-minute tidy sprint',
      heal: 0,
      isHealthQuest: false,
      coreRewards: [{ stat: 'discipline', xp: 5 }],
      skillRewards: [],
      coreStat: 'discipline',
      coreXp: 5,
      skill: null,
      skillXp: 0,
      strict: false,
      completed: false,
      skipped: false,
      completedAt: null,
      lastResetDate: SEED_DATE,
      order: 8,
      active: true,
    },
  ];
}

function sideQuests() {
  return [
    {
      id: 'sq_create_series',
      name: 'Create First Youtube Series',
      type: 'side',
      icon: 'icons/video.png',
      coins: 20,
      coreRewards: [{ stat: 'creativity', xp: 50 }],
      skillRewards: [{ skill: 'video', xp: 30 }],
      message: 'Keep going',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 1,
    },
    {
      id: 'sq_run6k',
      name: 'Run/Jog 6km+',
      type: 'secret',
      icon: 'icons/running.png',
      coins: 10,
      coreRewards: [
        { stat: 'vitality', xp: 10 },
        { stat: 'discipline', xp: 5 },
      ],
      skillRewards: [],
      message: 'Push yourself',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 2,
    },
    {
      id: 'sq_recreate',
      name: 'Recreate a Masterwork',
      type: 'side',
      icon: 'icons/mona-lisa.png',
      coins: 15,
      coreRewards: [{ stat: 'creativity', xp: 12 }],
      skillRewards: [{ skill: 'art', xp: 25 }],
      message: 'Study the masters',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 3,
    },
    {
      id: 'sq_broll',
      name: 'Film B-roll or Process Footage',
      type: 'side',
      icon: 'icons/video_(1).png',
      coins: 10,
      coreRewards: [],
      skillRewards: [{ skill: 'filming', xp: 15 }],
      message: 'Capture the process',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 4,
    },
    {
      id: 'sq_docu',
      name: 'Watch Longform Educational Docu/Interview',
      type: 'side',
      icon: 'icons/watch-tv.png',
      coins: 10,
      coreRewards: [{ stat: 'mind', xp: 15 }],
      skillRewards: [],
      message: 'Feed your mind',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 5,
    },
    {
      id: 'sq_detox',
      name: 'Digital Detox (3hrs.)',
      type: 'side',
      icon: 'icons/disconnect.png',
      coins: 15,
      coreRewards: [{ stat: 'discipline', xp: 10 }],
      skillRewards: [],
      message: 'Disconnect to reconnect',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 6,
    },
    {
      id: 'sq_sleep9',
      name: 'Sleep at 9pm or Earlier',
      type: 'secret',
      icon: 'icons/sleep 1.png',
      coins: 8,
      coreRewards: [
        { stat: 'vitality', xp: 15 },
        { stat: 'discipline', xp: 10 },
      ],
      skillRewards: [],
      message: 'Recovery is progress',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 7,
    },
    {
      id: 'sq_art2h',
      name: '2+ Hours Continuous Art (Practice/Commission/Content)',
      type: 'secret',
      icon: 'icons/focus.png',
      coins: 5,
      coreRewards: [{ stat: 'creativity', xp: 10 }],
      skillRewards: [{ skill: 'art', xp: 15 }],
      message: 'Deep work',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 8,
    },
    {
      id: 'sq_fix',
      name: 'Fix or Repair Something',
      type: 'side',
      icon: 'icons/mechanic.png',
      coins: 15,
      coreRewards: [{ stat: 'discipline', xp: 5 }],
      skillRewards: [
        { skill: 'electronics', xp: 10 },
        { skill: 'mech', xp: 10 },
      ],
      message: 'Make it work again',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 9,
    },
    {
      id: 'sq_help',
      name: 'Help a Stranger or Friend in Need',
      type: 'side',
      icon: 'icons/help.png',
      coins: 20,
      coreRewards: [{ stat: 'connection', xp: 15 }],
      skillRewards: [],
      message: 'Lift someone up',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 10,
    },
    {
      id: 'sq_newmedium',
      name: 'Try New Art Medium',
      type: 'side',
      icon: 'icons/oil-paint.png',
      coins: 8,
      coreRewards: [{ stat: 'creativity', xp: 10 }],
      skillRewards: [{ skill: 'art', xp: 20 }],
      message: 'Experiment',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 11,
    },
    {
      id: 'sq_oneonone',
      name: '1-on-1 Time With Someone',
      type: 'side',
      icon: 'icons/interview.png',
      coins: 10,
      coreRewards: [{ stat: 'connection', xp: 15 }],
      skillRewards: [],
      message: 'Be present',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 12,
    },
    {
      id: 'sq_trading',
      name: 'Study Trading for 1 Extra Hour',
      type: 'side',
      icon: 'icons/computer.png',
      coins: 8,
      coreRewards: [{ stat: 'discipline', xp: 5 }],
      skillRewards: [{ skill: 'trading', xp: 15 }],
      message: 'Sharpen the edge',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 13,
    },
    {
      id: 'sq_deepclean',
      name: 'Deep Clean & Organize Room',
      type: 'side',
      icon: 'icons/cleaner.png',
      coins: 15,
      coreRewards: [{ stat: 'creativity', xp: 10 }],
      skillRewards: [],
      message: 'Clear space, clear mind',
      repeatable: true,
      active: true,
      completed: false,
      completedAt: null,
      completions: 0,
      order: 14,
    },
  ];
}

function badHabits() {
  return [
    {
      id: 'bh_sugar',
      name: 'Sugar',
      icon: null,
      emoji: '🍬',
      hpDamage: 0,
      legacyPoints: { xp: 20, coins: 10 },
      active: true,
      lastLoggedDate: null,
      logCount: 0,
    },
    {
      id: 'bh_fastfood',
      name: 'Fast Food',
      icon: null,
      emoji: '🍔',
      hpDamage: 0,
      legacyPoints: { xp: 30, coins: 25 },
      active: true,
      lastLoggedDate: null,
      logCount: 0,
    },
    {
      id: 'bh_streaming',
      name: 'Unnecessary Streaming (3hours+)',
      icon: 'icons/watch-tv.png',
      emoji: '📺',
      hpDamage: 0,
      legacyPoints: { xp: 50, coins: 30 },
      active: true,
      lastLoggedDate: null,
      logCount: 0,
    },
    {
      id: 'bh_screen4h',
      name: '4 Hours Screen Time',
      icon: 'icons/watch-tv.png',
      emoji: '📱',
      hpDamage: 0,
      legacyPoints: { xp: 50, coins: 30 },
      active: false,
      lastLoggedDate: null,
      logCount: 0,
      legacy: true,
    },
  ];
}

function missions() {
  return [
    {
      id: 'm_magnetic',
      name: 'Build Magnetic Content Strategy',
      goalId: 'g_youtube',
      xp: 500,
      coins: 1000,
      status: 'not-started',
      completed: false,
      completedAt: null,
      startDate: '2025-05-21',
      endDate: '2025-06-27',
      progress: 0,
      tasks: [
        { id: 't_script3', title: 'Script and Shoot 3 High-Retention Videos', done: false },
      ],
      order: 1,
    },
    {
      id: 'm_distribution',
      name: 'Grow with Smart Distribution',
      goalId: 'g_youtube',
      xp: 500,
      coins: 1000,
      status: 'not-started',
      completed: false,
      completedAt: null,
      startDate: '2025-05-21',
      endDate: '2025-08-21',
      progress: 0,
      tasks: [],
      order: 2,
    },
    {
      id: 'm_template',
      name: 'Build game mode template',
      goalId: null,
      xp: 500,
      coins: 1000,
      status: 'done',
      completed: true,
      completedAt: '2025-05-23',
      startDate: '2025-05-20',
      endDate: '2025-05-23',
      progress: 1,
      tasks: [{ id: 't_design', title: 'desing the template', done: true }],
      order: 3,
    },
    {
      id: 'm_bulk',
      name: 'Bulk 7 Months',
      goalId: 'g_bulk',
      xp: 500,
      coins: 1000,
      status: 'done',
      completed: true,
      completedAt: '2025-06-30',
      startDate: '2025-01-01',
      endDate: '2025-06-30',
      progress: 1,
      tasks: [
        { id: 't_gym5', title: 'Go to gym 5 times a week', done: true },
        { id: 't_cal2500', title: 'Eat 2500 calories every day', done: true },
      ],
      order: 4,
    },
    {
      id: 'm_cut',
      name: 'Cut for 5 Months',
      goalId: 'g_bulk',
      xp: 500,
      coins: 1000,
      status: 'done',
      completed: true,
      completedAt: '2025-10-25',
      startDate: '2025-05-25',
      endDate: null,
      progress: 1,
      tasks: [],
      order: 5,
    },
  ];
}

function goals() {
  return [
    {
      id: 'g_youtube',
      name: 'Achieve 100k Followers on Youtube',
      xp: 10000,
      coins: 20000,
      status: 'active',
      completed: false,
      completedAt: null,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      progress: 0,
      missionIds: ['m_magnetic', 'm_distribution'],
      order: 1,
    },
    {
      id: 'g_bulk',
      name: 'Gain 75kg and 12% body fat',
      xp: 10000,
      coins: 20000,
      status: 'done',
      completed: true,
      completedAt: '2025-12-31',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      progress: 1,
      missionIds: ['m_bulk', 'm_cut'],
      order: 2,
    },
  ];
}

function rewards() {
  return [
    {
      id: 'rw_watch_episode',
      name: 'Watch an Episode',
      price: 50,
      icon: 'icons/streaming_(1).png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 1,
    },
    {
      id: 'rw_video_hour',
      name: '1 Hour of Video Games',
      price: 120,
      icon: 'icons/game_(3).png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 2,
    },
    {
      id: 'rw_eat_out',
      name: 'Eat out',
      price: 100,
      icon: 'icons/fish.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 3,
    },
    {
      id: 'rw_nap_time',
      name: 'Nap Time',
      price: 20,
      icon: 'icons/sleep.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 4,
    },
    {
      id: 'rw_vacation',
      name: '3 Months Vacation',
      price: 2000,
      icon: 'icons/road.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 5,
    },
    {
      id: 'rw_gaming_hour',
      name: '1 hour of guilt-free video games',
      price: 50,
      icon: 'icons/gaming.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 6,
    },
    {
      id: 'rw_anime2',
      name: 'Watch 2 Anime episodes',
      price: 70,
      icon: 'icons/streaming_(1).png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 7,
    },
    {
      id: 'rw_social_hour',
      name: '1 hour of social media scroll',
      price: 50,
      icon: 'icons/social-media.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 8,
    },
    {
      id: 'rw_diy_tools',
      name: 'Buy new DIY tools/materials',
      price: 180,
      icon: 'icons/energy.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 9,
    },
    {
      id: 'rw_day_off',
      name: 'Day off from tasks (Reset Day)',
      price: 200,
      icon: 'icons/sorcerer.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 10,
    },
    {
      id: 'rw_skip_quest',
      name: 'Skip one Daily Quest, no penalty',
      price: 100,
      icon: 'icons/fighter.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 11,
    },
    {
      id: 'rw_nap_hour',
      name: '1-hour nap without guilt',
      price: 70,
      icon: 'icons/nap.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 12,
    },
    {
      id: 'rw_art_tools',
      name: 'Buy a new art tool or material',
      price: 250,
      icon: 'icons/web-design.png',
      purchaseCount: 0,
      active: true,
      undoable: true,
      lastPurchasedAt: null,
      order: 13,
    },
  ];
}

function skills() {
  return [
    { id: 'art', name: '🎨 Art Skills', icon: 'icons/art.png', xp: 1588, startingXP: 1500, earnedXP: 88, active: true },
    { id: 'electronics', name: "⚡ Electronics & Electrical", icon: 'icons/energy.png', xp: 510, startingXP: 500, earnedXP: 10, active: true },
    { id: 'mech', name: '🛠️ Mech Engg.', icon: 'icons/mechanic.png', xp: 350, startingXP: 350, earnedXP: 0, active: true },
    { id: 'video', name: '🎬 Video Editing', icon: 'icons/video.png', xp: 458, startingXP: 350, earnedXP: 108, active: true },
    { id: 'filming', name: '📹 Filming', icon: 'icons/video_(1).png', xp: 200, startingXP: 150, earnedXP: 50, active: true },
    { id: 'trading', name: '📈 Trading', icon: 'icons/forex.png', xp: 410, startingXP: 100, earnedXP: 310, active: true },
  ];
}

function defaultFinance() {
  return {
    currency: 'PHP',
    startingBalance: 500,
    incomes: [
      { id: 'inc_commission', name: 'Commission (Bata)', amount: 2817.0, category: 'Commission', date: '2026-11-14', note: 'Linked income in Notion' },
      { id: 'inc_other', name: 'Other recorded income', amount: 1810.0, category: 'Other', date: '2026-11-14', note: 'Reconstructed line to match exported Total Incomes ₱4,627' },
    ],
    expenses: [
      { id: 'exp_halad', name: 'Donations & Halad', amount: 1000.0, category: 'Giving', date: '2026-11-14', note: 'Allocation of exported Total Expenses ₱2,310' },
      { id: 'exp_ambag', name: 'Ambag sa balay', amount: 800.0, category: 'Household', date: '2026-11-14', note: 'Allocation of exported Total Expenses ₱2,310' },
      { id: 'exp_blowout', name: 'Blow out', amount: 510.0, category: 'Leisure', date: '2026-11-14', note: 'Allocation of exported Total Expenses ₱2,310' },
    ],
    assets: [
      { id: 'ast_btc', name: 'Bitcoin', symbol: 'BTC', quantity: null, amount: 1000.0, note: 'Allocation of exported Total Assets ₱1,948.74' },
      { id: 'ast_eth', name: 'Ethereum', symbol: 'ETH', quantity: null, amount: 600.0, note: 'Allocation of exported Total Assets ₱1,948.74' },
      { id: 'ast_usdt', name: 'USDT', symbol: 'USDT', quantity: null, amount: 348.74, note: 'Allocation of exported Total Assets ₱1,948.74' },
    ],
    savings: [
      { id: 'sav_cimb', name: 'CIMB', amount: 500.0, note: 'Allocation of exported Total Savings ₱540.13' },
      { id: 'sav_emergency', name: 'Emergency Fund', amount: 40.13, note: 'Allocation of exported Total Savings ₱540.13' },
    ],
    wealthXpBaseline: 97,
    wealthXP: 150,
    wealthCoins: 10,
    lastSyncedAt: SEED_TIMESTAMP,
  };
}

function defaultSettings() {
  return {
    theme: 'dark',
    currency: 'PHP',
    reducedMotion: false,
    celebrationBanner: true,
    points: {
      journal: { ...POINT_AWARDS.journal },
      mission: { ...POINT_AWARDS.mission },
      goal: { ...POINT_AWARDS.goal },
    },
    hp: { ...HP_DEFAULTS },
    strict: {
      allDailyQuests: false,
      autoSkipAtMidnight: true,
    },
    finance: {
      showWealthCoinsInGold: true,
    },
    journalReminder: true,
    weekStartsOn: 1,
  };
}

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a fresh, fully isolated King.Arts13 profile.
 * Always call this instead of sharing a module-level object.
 */
export function createKingArts13Profile() {
  const totals = computeFinanceTotals(defaultFinance());
  const wealthXP = wealthXPFor(totals.overallWealth, 97);
  const wealthCoins = wealthCoinsFor(totals.overallWealth);
  const maxHP = maxHPForAge(25, HP_DEFAULTS);

  return {
    schemaVersion: SEED_SCHEMA_VERSION,
    id: KING_ARTS13_ID,
    name: 'King.Arts13',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: SEED_TIMESTAMP,
    source: 'notion-export',
    seedVersion: 1,
    avatar: 'icons/ares.png',
    avatarAlt: 'icons/thief.png',
    age: 25,
    birthday: KING_ARTS13_BIRTHDAY,
    birthdayGreetedYear: null,
    bio: 'The Game of Life V2 — founding profile.',
    character: {
      xp: 6548,
      startingXP: 5300,
      goldBase: 794,
      gold: derivedGold(794, wealthCoins),
      legacyCoinsNumber: 1308,
      titleOverride: null,
    },
    hp: {
      base: maxHP,
      current: maxHP,
      max: LIFESPAN_DENOMINATOR,
      shield: HP_DEFAULTS.shieldStart,
      shieldMax: HP_DEFAULTS.shieldMax,
      posVitalityBuffer: 0,
      negVitalityBuffer: 0,
      lifespanBonusHP: 0,
      updatedAt: SEED_TIMESTAMP,
      recoverySince: null,
    },
    titles: cloneCharacterTitles(),
    rankTracks: cloneRankTracks(),
    cores: {
      vitality: { xp: 0, rawSourceXP: -20, startingXP: 125, earnedXP: -125, xpCount: -145, active: true },
      discipline: { xp: 1082, startingXP: 250, earnedXP: 832, xpCount: 832, active: true },
      creativity: { xp: 470, startingXP: 600, earnedXP: -130, xpCount: -130, active: true },
      mind: { xp: 30, startingXP: 150, earnedXP: -120, xpCount: -120, active: true },
      wealth: { xp: wealthXP, startingXP: 100, earnedXP: wealthXP - 100, xpCount: 50, derivedFromFinance: true, active: true },
      connection: { xp: 680, startingXP: 310, earnedXP: 370, xpCount: 370, active: true },
    },
    skills: skills(),
    dailyQuests: dailyQuests(),
    sideQuests: sideQuests(),
    badHabits: badHabits(),
    missions: missions(),
    goals: goals(),
    journal: {
      xp: 10,
      coins: 35,
      entries: [],
      lastAwardedDate: null,
    },
    rewards: rewards(),
    purchases: [],
    ledger: [],
    tokens: {
      skipQuest: 0,
      skipQuestAwardedAt: null,
      restDay: null,
      restDayAwardedAt: null,
    },
    finance: defaultFinance(),
    settings: defaultSettings(),
    stats: {
      missionsCompleted: 3,
      goalsCompleted: 1,
      journalsWritten: 0,
      rewardsPurchased: 0,
      daysActive: 1,
    },
    notes: [...SEED_NOTES],
  };
}

/**
 * Create a brand-new profile from scratch.
 * Templates default to OFF ("from scratch"): no King.Arts13 history.
 */
export function createBlankProfile(name = 'New Player', options = {}) {
  const now = options.now ?? new Date().toISOString();
  const nowDate = new Date(now);
  const today = Number.isNaN(nowDate.getTime()) ? new Date() : nowDate;
  const rawAge = options.age === undefined || options.age === null || options.age === ''
    ? 25
    : Number(options.age);
  let age = Math.max(0, Math.min(85, Number.isFinite(rawAge) ? Math.floor(rawAge) : 25));
  const explicitBirthday = isValidDateKey(options.birthday) ? String(options.birthday) : '';
  if (explicitBirthday) {
    const derived = ageFromBirthday(explicitBirthday, today);
    if (derived !== null) age = Math.max(0, Math.min(85, derived));
  }
  const birthday = explicitBirthday || birthdayForAge(age, today);
  const birthdayGreetedYear = explicitBirthday ? null : today.getFullYear();
  const maxHP = maxHPForAge(age, HP_DEFAULTS);
  const id = options.id ?? `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    schemaVersion: SEED_SCHEMA_VERSION,
    id,
    name: String(name || 'New Player').trim() || 'New Player',
    createdAt: now,
    updatedAt: now,
    source: 'created',
    seedVersion: SEED_SCHEMA_VERSION,
    avatar: options.avatar ?? null,
    avatarAlt: null,
    age,
    birthday,
    birthdayGreetedYear,
    bio: '',
    character: {
      xp: 0,
      startingXP: 0,
      goldBase: 0,
      gold: 0,
      legacyCoinsNumber: 0,
      titleOverride: null,
    },
    hp: {
      base: maxHP,
      current: maxHP,
      max: LIFESPAN_DENOMINATOR,
      shield: HP_DEFAULTS.shieldStart,
      shieldMax: HP_DEFAULTS.shieldMax,
      posVitalityBuffer: 0,
      negVitalityBuffer: 0,
      lifespanBonusHP: 0,
      updatedAt: now,
      recoverySince: null,
    },
    titles: cloneCharacterTitles(),
    rankTracks: cloneRankTracks(),
    cores: {
      vitality: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, active: true },
      discipline: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, active: true },
      creativity: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, active: true },
      mind: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, active: true },
      wealth: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, derivedFromFinance: true, active: true },
      connection: { xp: 0, startingXP: 0, earnedXP: 0, xpCount: 0, active: true },
    },
    skills: [
      { id: 'art', name: '🎨 Art Skills', icon: 'icons/art.png', xp: 0, startingXP: 0, earnedXP: 0, active: true },
      { id: 'electronics', name: "⚡ Electronics & Electrical", icon: 'icons/energy.png', xp: 0, startingXP: 0, active: true },
      { id: 'mech', name: '🛠️ Mech Engg.', icon: 'icons/mechanic.png', xp: 0, startingXP: 0, active: true },
      { id: 'video', name: '🎬 Video Editing', icon: 'icons/video.png', xp: 0, startingXP: 0, active: true },
      { id: 'filming', name: '📹 Filming', icon: 'icons/video_(1).png', xp: 0, startingXP: 0, active: true },
      { id: 'trading', name: '📈 Trading', icon: 'icons/forex.png', xp: 0, startingXP: 0, active: true },
    ],
    dailyQuests: options.includeDailyQuestTemplate
      ? dailyQuests().map((quest) => ({ ...quest, lastResetDate: localDateKey(new Date(now)) }))
      : [],
    sideQuests: options.includeSideQuestTemplate ? sideQuests() : [],
    badHabits: options.includeBadHabitTemplate ? badHabits().filter((habit) => habit.active) : [],
    missions: [],
    goals: [],
    journal: {
      xp: POINT_AWARDS.journal.xp,
      coins: POINT_AWARDS.journal.coins,
      entries: [],
      lastAwardedDate: null,
    },
    rewards: options.includeRewardTemplate ? rewards() : [],
    purchases: [],
    ledger: [],
    tokens: {
      skipQuest: 0,
      skipQuestAwardedAt: null,
      restDay: null,
      restDayAwardedAt: null,
    },
    finance: {
      currency: 'PHP',
      startingBalance: 0,
      incomes: [],
      expenses: [],
      assets: [],
      savings: [],
      wealthXpBaseline: 0,
      wealthXP: 0,
      wealthCoins: 0,
      lastSyncedAt: now,
    },
    settings: defaultSettings(),
    stats: {
      missionsCompleted: 0,
      goalsCompleted: 0,
      journalsWritten: 0,
      rewardsPurchased: 0,
      daysActive: 1,
    },
    notes: [],
  };
}

/** Public factory for blank profiles and migrations. Always returns a fresh copy. */
export function createDefaultSettings() {
  return defaultSettings();
}

/**
 * Recompute all finance/HP-derived fields for a profile **in place**.
 * Idempotent. Call on load and after any finance, gold or age change.
 */
export function recomputeDerived(profile) {
  if (!profile || typeof profile !== 'object') return profile;

  const totals = computeFinanceTotals(profile.finance ?? {});
  const baseline = profile.finance?.wealthXpBaseline ?? 0;
  const wealthXP = wealthXPFor(totals.overallWealth, baseline);
  const wealthCoins = wealthCoinsFor(totals.overallWealth);

  if (profile.finance) {
    profile.finance.wealthXP = wealthXP;
    profile.finance.wealthCoins = wealthCoins;
    profile.finance.lastSyncedAt = new Date().toISOString();
  }

  if (profile.cores?.wealth) {
    profile.cores.wealth.xp = wealthXP;
    profile.cores.wealth.earnedXP = wealthXP - Math.max(0, Math.floor(Number(profile.cores.wealth.startingXP) || 0));
  }

  if (profile.character) {
    // Keep the base signed so a purchase funded by Wealth Coins cannot be
    // refunded for free on the next recompute. Displayed Gold clamps at 0.
    profile.character.goldBase = Math.floor(Number(profile.character.goldBase) || 0);
    profile.character.gold = derivedGold(profile.character.goldBase, wealthCoins);
  }

  const maxHP = maxHPForAge(profile.age, profile.settings?.hp ?? HP_DEFAULTS);
  profile.hp = profile.hp ?? {};
  profile.hp.base = maxHP;
  syncLifespanState(profile);

  return profile;
}

export { SEED_NOTES };
