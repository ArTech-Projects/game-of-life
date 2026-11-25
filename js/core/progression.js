/**
 * The Game of Life V2 — progression engine (M4).
 *
 * Pure domain logic on a **draft profile** (already cloned by the store):
 * side/secret quests, missions, goals and automatic goal progress. No DOM,
 * no storage, no timers.
 *
 * Every mutator returns a result object; on validation failure it returns
 * `{ changed: false, error, code, message }` and leaves the draft untouched.
 */

import {
  CHARACTER_BASE,
  addXP,
  applyVitalityXPToShield,
  clampXP,
  derivedGold,
  levelFromXP,
  restoreShieldState,
  shieldSnapshot,
  toNumber,
} from './formulas.js';

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

function clamp01(value) {
  return Math.min(1, Math.max(0, toNumber(value, 0)));
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

function addCharacterXP(profile, amount) {
  const before = clampXP(profile.character?.xp);
  profile.character.xp = addXP(before, amount);
  return profile.character.xp - before;
}

function takeCharacterXP(profile, amount) {
  return -addCharacterXP(profile, -Math.abs(Math.floor(toNumber(amount, 0))));
}

function findSideQuest(profile, questId) {
  return (profile.sideQuests ?? []).find((quest) => quest?.id === questId) ?? null;
}

function findMission(profile, missionId) {
  return (profile.missions ?? []).find((mission) => mission?.id === missionId) ?? null;
}

function findGoal(profile, goalId) {
  return (profile.goals ?? []).find((goal) => goal?.id === goalId) ?? null;
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

function takeCoreXP(profile, stat, amount) {
  return -addCoreXP(profile, stat, -Math.abs(Math.floor(toNumber(amount, 0))), { trackVitality: false });
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

function takeSkillXP(profile, reference, amount) {
  return -addSkillXP(profile, reference, -Math.abs(Math.floor(toNumber(amount, 0))));
}

function stat(profile, key) {
  if (!profile.stats) profile.stats = {};
  return int(profile.stats[key]);
}

function characterLevel(profile) {
  return levelFromXP(profile?.character?.xp, CHARACTER_BASE);
}

function bumpStat(profile, key, delta) {
  if (!profile.stats) profile.stats = {};
  profile.stats[key] = Math.max(0, stat(profile, key) + Math.round(delta));
}

function coreLabel(profile, key) {
  return profile.rankTracks?.[key]?.label ?? String(key ?? 'Core');
}

function skillLabel(profile, reference) {
  const skill = findSkill(profile, reference);
  if (!skill) return String(reference ?? 'Skill');
  return String(skill.name ?? skill.id ?? reference).replace(/^\S+\s/, '');
}

/* ------------------------------------------------------------------ */
/* Reward configuration                                                */
/* ------------------------------------------------------------------ */

export function missionReward(profile, mission = null) {
  return {
    xp: mission?.xp !== undefined && mission?.xp !== null ? int(mission.xp) : 500,
    coins: mission?.coins !== undefined && mission?.coins !== null ? int(mission.coins) : 1000,
  };
}

export function goalReward(profile, goal = null) {
  return {
    xp: goal?.xp !== undefined && goal?.xp !== null ? int(goal.xp) : 10000,
    coins: goal?.coins !== undefined && goal?.coins !== null ? int(goal.coins) : 20000,
  };
}

export function sideQuestReward(profile, quest) {
  const coreRewards = (quest?.coreRewards ?? [])
    .map((reward) => ({
      stat: reward?.stat ?? null,
      xp: int(reward?.xp),
      label: coreLabel(profile, reward?.stat),
    }))
    .filter((reward) => reward.stat && reward.xp > 0);

  const skillRewards = (quest?.skillRewards ?? [])
    .map((reward) => ({
      skill: reward?.skill ?? null,
      xp: int(reward?.xp),
      label: skillLabel(profile, reward?.skill),
    }))
    .filter((reward) => reward.skill && reward.xp > 0);

  return {
    coins: int(quest?.coins),
    coreRewards,
    skillRewards,
    characterXP: [...coreRewards, ...skillRewards].reduce((sum, reward) => sum + reward.xp, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Goal progress                                                       */
/* ------------------------------------------------------------------ */

export function goalMissionIds(goal) {
  return Array.isArray(goal?.missionIds)
    ? goal.missionIds.map((id) => String(id)).filter(Boolean)
    : [];
}

export function linkedMissions(profile, goal) {
  const ids = new Set(goalMissionIds(goal));
  if (ids.size === 0) return [];
  return (profile.missions ?? []).filter((mission) => ids.has(String(mission?.id)));
}

/**
 * Goal progress is derived from linked missions when any exist, otherwise it
 * keeps the manually stored progress. Completion never happens automatically.
 */
export function goalProgress(profile, goal) {
  const linked = linkedMissions(profile, goal);
  if (linked.length > 0) {
    return linked.filter((mission) => mission.completed === true).length / linked.length;
  }
  return clamp01(goal?.progress);
}

/** Recalculate one goal or every goal. Returns the touched goal rows. */
export function recalculateGoalProgress(profile, goalId = null) {
  const goals = (profile.goals ?? []).filter((goal) => !goalId || goal.id === goalId);
  for (const goal of goals) goal.progress = goalProgress(profile, goal);
  return goals;
}

/* ------------------------------------------------------------------ */
/* Side & Secret quests                                                */
/* ------------------------------------------------------------------ */

export function completeSideQuest(profile, questId, now = new Date()) {
  const quest = findSideQuest(profile, questId);
  if (!quest || quest.active === false) {
    return {
      changed: false,
      error: 'missing-side-quest',
      code: 'missing-side-quest',
      message: 'That side quest no longer exists.',
    };
  }
  if (quest.repeatable === false && quest.completed) {
    return {
      changed: false,
      error: 'already-completed',
      code: 'already-completed',
      message: 'That quest is already complete. Undo it first.',
    };
  }

  const previousCompleted = quest.completed === true;
  const previousCompletedAt = quest.completedAt ?? null;
  const previousCompletions = int(quest.completions);
  const reward = sideQuestReward(profile, quest);
  const shield = shieldSnapshot(profile);

  const coins = addGold(profile, reward.coins);
  const coreRewards = [];
  for (const entry of reward.coreRewards) {
    const xp = addCoreXP(profile, entry.stat, entry.xp);
    if (xp) coreRewards.push({ stat: entry.stat, xp, label: entry.label });
  }
  const skillRewards = [];
  for (const entry of reward.skillRewards) {
    const xp = addSkillXP(profile, entry.skill, entry.xp);
    if (xp) skillRewards.push({ skill: entry.skill, xp, label: entry.label });
  }
  const autoXp = [...coreRewards, ...skillRewards].reduce((sum, entry) => sum + Math.max(0, entry.xp), 0);
  const xp = addCharacterXP(profile, autoXp);

  quest.completed = true;
  quest.completedAt = nowStamp(now);
  quest.completions = previousCompletions + 1;
  quest.lastAction = {
    type: 'side-quest',
    at: nowStamp(now),
    xp,
    coins,
    coreRewards,
    skillRewards,
    previousCompleted,
    previousCompletedAt,
    previousCompletions,
    shield,
  };
  bumpStat(profile, 'sideQuestsCompleted', 1);

  return {
    changed: true,
    quest,
    reward,
    xp,
    autoXp,
    coins,
    coreRewards,
    skillRewards,
    repeatable: quest.repeatable !== false,
    completions: quest.completions,
  };
}

export function undoSideQuest(profile, questId) {
  const quest = findSideQuest(profile, questId);
  if (!quest) {
    return {
      changed: false,
      error: 'missing-side-quest',
      code: 'missing-side-quest',
      message: 'That side quest no longer exists.',
    };
  }
  const action = quest.lastAction;
  if (!action || action.type !== 'side-quest') {
    return {
      changed: false,
      error: 'no-undo',
      code: 'no-undo',
      message: 'Nothing to undo for that quest.',
    };
  }

  takeGold(profile, action.coins);
  takeCharacterXP(profile, action.xp);
  for (const entry of action.coreRewards ?? []) takeCoreXP(profile, entry.stat, entry.xp);
  for (const entry of action.skillRewards ?? []) takeSkillXP(profile, entry.skill, entry.xp);
  restoreShieldState(profile, action.shield);

  quest.completed = action.previousCompleted === true;
  quest.completedAt = action.previousCompletedAt ?? null;
  quest.completions = int(action.previousCompletions);
  quest.lastAction = null;
  bumpStat(profile, 'sideQuestsCompleted', -1);

  return {
    changed: true,
    quest,
    action,
    xp: -int(action.xp),
    coins: -int(action.coins),
    coreRewards: (action.coreRewards ?? []).map((entry) => ({ ...entry, xp: -entry.xp })),
    skillRewards: (action.skillRewards ?? []).map((entry) => ({ ...entry, xp: -entry.xp })),
  };
}

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

export function completeMission(profile, missionId, now = new Date()) {
  const mission = findMission(profile, missionId);
  if (!mission || mission.active === false) {
    return {
      changed: false,
      error: 'missing-mission',
      code: 'missing-mission',
      message: 'That mission no longer exists.',
    };
  }
  if (mission.completed) {
    return {
      changed: false,
      error: 'already-completed',
      code: 'already-completed',
      message: 'That mission is already complete. Undo it first.',
    };
  }

  const previous = {
    completed: mission.completed === true,
    completedAt: mission.completedAt ?? null,
    status: mission.status ?? 'not-started',
    progress: clamp01(mission.progress),
  };
  const levelBefore = characterLevel(profile);
  const reward = missionReward(profile, mission);
  const xp = addCharacterXP(profile, reward.xp);
  const coins = addGold(profile, reward.coins);
  const levelAfter = characterLevel(profile);

  mission.completed = true;
  mission.completedAt = nowStamp(now);
  mission.status = 'done';
  mission.progress = 1;
  mission.lastAction = {
    type: 'mission',
    at: nowStamp(now),
    xp,
    coins,
    previous,
  };
  bumpStat(profile, 'missionsCompleted', 1);

  const goal = mission.goalId ? findGoal(profile, mission.goalId) : null;
  if (goal) recalculateGoalProgress(profile, goal.id);

  return {
    changed: true,
    mission,
    goal,
    goalProgress: goal ? goal.progress : null,
    reward,
    xp,
    coins,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
  };
}

export function undoMission(profile, missionId) {
  const mission = findMission(profile, missionId);
  if (!mission) {
    return {
      changed: false,
      error: 'missing-mission',
      code: 'missing-mission',
      message: 'That mission no longer exists.',
    };
  }
  const action = mission.lastAction;
  if (!action || action.type !== 'mission') {
    return {
      changed: false,
      error: 'no-undo',
      code: 'no-undo',
      message: 'Nothing to undo for that mission.',
    };
  }

  const levelBefore = characterLevel(profile);
  takeCharacterXP(profile, action.xp);
  takeGold(profile, action.coins);

  mission.completed = action.previous?.completed === true;
  mission.completedAt = action.previous?.completedAt ?? null;
  mission.status = action.previous?.status ?? 'not-started';
  mission.progress = clamp01(action.previous?.progress);
  mission.lastAction = null;
  bumpStat(profile, 'missionsCompleted', -1);

  const goal = mission.goalId ? findGoal(profile, mission.goalId) : null;
  if (goal) recalculateGoalProgress(profile, goal.id);

  const levelAfter = characterLevel(profile);
  return {
    changed: true,
    mission,
    goal,
    goalProgress: goal ? goal.progress : null,
    xp: -int(action.xp),
    coins: -int(action.coins),
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
  };
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export function completeGoal(profile, goalId, now = new Date()) {
  const goal = findGoal(profile, goalId);
  if (!goal) {
    return {
      changed: false,
      error: 'missing-goal',
      code: 'missing-goal',
      message: 'That goal no longer exists.',
    };
  }
  if (goal.completed) {
    return {
      changed: false,
      error: 'already-completed',
      code: 'already-completed',
      message: 'That goal is already achieved. Undo it first.',
    };
  }
  if (goalProgress(profile, goal) < 1) {
    return {
      changed: false,
      error: 'goal-incomplete',
      code: 'goal-incomplete',
      message: 'Complete every linked mission first. Goal progress must reach 100%.',
    };
  }

  const previous = {
    completed: goal.completed === true,
    completedAt: goal.completedAt ?? null,
    status: goal.status ?? 'active',
    progress: clamp01(goal.progress),
  };
  const levelBefore = characterLevel(profile);
  const reward = goalReward(profile, goal);
  const xp = addCharacterXP(profile, reward.xp);
  const coins = addGold(profile, reward.coins);
  const levelAfter = characterLevel(profile);

  goal.completed = true;
  goal.completedAt = nowStamp(now);
  goal.status = 'done';
  goal.progress = 1;
  goal.lastAction = {
    type: 'goal',
    at: nowStamp(now),
    xp,
    coins,
    previous,
  };
  bumpStat(profile, 'goalsCompleted', 1);

  return { changed: true, goal, reward, xp, coins, levelBefore, levelAfter, leveledUp: levelAfter > levelBefore };
}

export function undoGoal(profile, goalId) {
  const goal = findGoal(profile, goalId);
  if (!goal) {
    return {
      changed: false,
      error: 'missing-goal',
      code: 'missing-goal',
      message: 'That goal no longer exists.',
    };
  }
  const action = goal.lastAction;
  if (!action || action.type !== 'goal') {
    return {
      changed: false,
      error: 'no-undo',
      code: 'no-undo',
      message: 'Nothing to undo for that goal.',
    };
  }

  const levelBefore = characterLevel(profile);
  takeCharacterXP(profile, action.xp);
  takeGold(profile, action.coins);

  goal.completed = action.previous?.completed === true;
  goal.completedAt = action.previous?.completedAt ?? null;
  goal.status = action.previous?.status ?? 'active';
  goal.progress = clamp01(action.previous?.progress);
  goal.lastAction = null;
  bumpStat(profile, 'goalsCompleted', -1);

  const levelAfter = characterLevel(profile);
  return {
    changed: true,
    goal,
    xp: -int(action.xp),
    coins: -int(action.coins),
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
  };
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export function progressionSummary(profile) {
  const sideQuests = profile?.sideQuests ?? [];
  const missions = profile?.missions ?? [];
  const goals = profile?.goals ?? [];
  const side = sideQuests.filter((quest) => quest.type !== 'secret');
  const secret = sideQuests.filter((quest) => quest.type === 'secret');

  return {
    sideTotal: sideQuests.length,
    sideCount: side.length,
    secretCount: secret.length,
    sideCompleted: side.filter((quest) => quest.completed).length,
    secretCompleted: secret.filter((quest) => quest.completed).length,
    sideCompletions: sideQuests.reduce((sum, quest) => sum + int(quest?.completions), 0),
    missionsTotal: missions.length,
    missionsDone: missions.filter((mission) => mission.completed).length,
    goalsTotal: goals.length,
    goalsDone: goals.filter((goal) => goal.completed).length,
    goals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      progress: goalProgress(profile, goal),
      completed: goal.completed === true,
    })),
    characterLevel: levelFromXP(profile?.character?.xp, 250),
    characterXP: clampXP(profile?.character?.xp),
  };
}
