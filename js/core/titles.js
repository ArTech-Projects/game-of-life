/**
 * The Game of Life V2 — titles and Core Stat rank tracks.
 *
 * These are the exact Notion tracks, pre-loaded for every profile.
 * Users may rename ranks and move trigger levels in Settings, so always
 * deep-clone before writing into a profile.
 */

/** 10 Character Titles. Selection: highest title whose minLevel <= level. */
export const DEFAULT_CHARACTER_TITLES = Object.freeze([
  Object.freeze({ id: 'seeker', name: '🌱 The Seeker', minLevel: 0 }),
  Object.freeze({ id: 'path-aligner', name: '🧭 Path Aligner', minLevel: 10 }),
  Object.freeze({ id: 'skill-artisan', name: '🛠️ Skill Artisan', minLevel: 25 }),
  Object.freeze({ id: 'inner-voyager', name: '🌌 Inner Voyager', minLevel: 50 }),
  Object.freeze({ id: 'freedom-forger', name: '⚙️ Freedom Forger', minLevel: 75 }),
  Object.freeze({ id: 'harmony-architect', name: '🕊️ Harmony Architect', minLevel: 100 }),
  Object.freeze({ id: 'purpose-bringer', name: '✨ Purpose Bringer', minLevel: 125 }),
  Object.freeze({ id: 'legacy-weaver', name: '🔮 Legacy Weaver', minLevel: 150 }),
  Object.freeze({ id: 'realm-uplifter', name: '🌠 Realm Uplifter', minLevel: 175 }),
  Object.freeze({ id: 'life-sovereign', name: '👑 Life Sovereign', minLevel: 200 }),
]);

const rank = (id, name, maxLevel) => Object.freeze({ id, name, maxLevel });

/**
 * Six Core Stat rank tracks. Each has 7 ranks; the last is open-ended
 * (`maxLevel: null`). Thresholds are inclusive stat levels.
 */
export const DEFAULT_RANK_TRACKS = Object.freeze({
  vitality: Object.freeze({
    id: 'vitality',
    stat: 'vitality',
    label: 'Vitality',
    emoji: '💪',
    display: '💪 Vitality',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('conditioned', '🏋️ Conditioned', 25),
      rank('athlete', '🏃 Athlete', 50),
      rank('peak-performer', '🚴 Peak Performer', 99),
      rank('life-force-master', '🔥 Life Force Master', null),
    ]),
  }),
  discipline: Object.freeze({
    id: 'discipline',
    stat: 'discipline',
    label: 'Discipline',
    emoji: '🧘',
    display: '🧘 Discipline',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('consistent', '⏳ Consistent', 25),
      rank('self-guided', '🧭 Self-Guided', 50),
      rank('inner-architect', '🧱 Inner Architect', 99),
      rank('master-of-will', '🔐 Master of Will', null),
    ]),
  }),
  creativity: Object.freeze({
    id: 'creativity',
    stat: 'creativity',
    label: 'Creativity',
    emoji: '🎨',
    display: '🎨 Creativity',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('creative-builder', '✏️ Creative Builder', 25),
      rank('innovator', '💡 Innovator', 50),
      rank('visionary-maker', '👁️ Visionary Maker', 99),
      rank('legacy-creator', '🏆 Legacy Creator', null),
    ]),
  }),
  mind: Object.freeze({
    id: 'mind',
    stat: 'mind',
    label: 'Mind',
    emoji: '🧠',
    display: '🧠 Mind',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('thinker', '📚 Thinker', 25),
      rank('mind-sculptor', '🧩 Mind Sculptor', 50),
      rank('cognitive-strategist', '🔬 Cognitive Strategist', 99),
      rank('wisdom-architect', '🏛️ Wisdom Architect', null),
    ]),
  }),
  wealth: Object.freeze({
    id: 'wealth',
    stat: 'wealth',
    label: 'Wealth',
    emoji: '💰',
    display: '💰 Wealth',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('saver', '💳 Saver', 25),
      rank('investor', '📈 Investor', 50),
      rank('strategic-earner', '🧾 Strategic Earner', 99),
      rank('wealth-maker', '💰 Wealth Maker', null),
    ]),
  }),
  connection: Object.freeze({
    id: 'connection',
    stat: 'connection',
    label: 'Connection',
    emoji: '🧑‍🤝‍🧑',
    display: '🧑‍🤝‍🧑 Connection',
    ranks: Object.freeze([
      rank('novice', '🐣 Novice', 3),
      rank('apprentice', '🛠️ Apprentice', 6),
      rank('practitioner', '📘 Practitioner', 10),
      rank('empathizer', '💞 Empathizer', 25),
      rank('bridge-builder', '🌉 Bridge Builder', 50),
      rank('human-catalyst', '🌍 Human Catalyst', 99),
      rank('legacy-connector', '🕊️ Legacy Connector', null),
    ]),
  }),
});

/** Core stat display order used by every screen. */
export const CORE_STAT_ORDER = Object.freeze([
  'vitality',
  'discipline',
  'creativity',
  'mind',
  'wealth',
  'connection',
]);

/** Deep clone helper that works in every modern browser. */
export function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/** Deep-clone the default titles for a profile (editable copy). */
export function cloneCharacterTitles(titles = DEFAULT_CHARACTER_TITLES) {
  return deepClone(titles);
}

/** Deep-clone the default rank tracks for a profile (editable copy). */
export function cloneRankTracks(tracks = DEFAULT_RANK_TRACKS) {
  return deepClone(tracks);
}

/** Normalize a level to a non-negative integer. */
function levelOf(level) {
  const n = Number(level);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Pick the active Character Title.
 * Falls back safely if a profile's edited titles are malformed.
 */
export function characterTitleForLevel(level, titles = DEFAULT_CHARACTER_TITLES) {
  const list = Array.isArray(titles) && titles.length ? titles : DEFAULT_CHARACTER_TITLES;
  const lvl = levelOf(level);
  const sorted = [...list].sort((a, b) => Number(a.minLevel) - Number(b.minLevel));
  let active = sorted[0];
  for (const title of sorted) {
    if (lvl >= Number(title.minLevel)) active = title;
  }
  return active;
}

/** Convenience: just the title name. */
export function characterTitleName(level, titles = DEFAULT_CHARACTER_TITLES) {
  return characterTitleForLevel(level, titles)?.name ?? '🌱 The Seeker';
}

/** Pick the active rank in one track. */
export function rankForLevel(level, track) {
  const ranks = Array.isArray(track) ? track : track?.ranks;
  if (!Array.isArray(ranks) || ranks.length === 0) {
    return { id: 'novice', name: '🐣 Novice', maxLevel: null };
  }
  const lvl = levelOf(level);
  for (const entry of ranks) {
    if (entry.maxLevel === null || entry.maxLevel === undefined) return entry;
    if (lvl <= Number(entry.maxLevel)) return entry;
  }
  return ranks[ranks.length - 1];
}

/** Rank name for one track. */
export function rankNameForLevel(level, track) {
  return rankForLevel(level, track)?.name ?? '🐣 Novice';
}

/** Get a rank track by stat key, with a safe fallback. */
export function getRankTrack(key, tracks = DEFAULT_RANK_TRACKS) {
  return tracks?.[key] ?? DEFAULT_RANK_TRACKS[key] ?? DEFAULT_RANK_TRACKS.vitality;
}

/**
 * Sort titles ascending and force the first trigger to 0.
 * Used by Settings after edits.
 */
export function normalizeTitles(titles) {
  const list = deepClone(Array.isArray(titles) ? titles : DEFAULT_CHARACTER_TITLES)
    .filter((title) => title && typeof title.name === 'string')
    .map((title, index) => ({
      id: title.id || `title-${index}`,
      name: title.name.trim() || `Title ${index + 1}`,
      minLevel: Math.max(0, Math.floor(Number(title.minLevel) || 0)),
    }))
    .sort((a, b) => a.minLevel - b.minLevel);

  if (!list.length) return cloneCharacterTitles();
  list[0].minLevel = 0;
  return list;
}

/**
 * Normalize one rank track: sort by threshold, last rank open-ended.
 * Duplicate thresholds are collapsed to keep lookup deterministic.
 */
export function normalizeRanks(track) {
  const source = Array.isArray(track?.ranks) ? track.ranks : [];
  const seen = new Set();
  const ranks = source
    .map((entry, index) => ({
      id: entry.id || `rank-${index}`,
      name: String(entry.name ?? '').trim() || `Rank ${index + 1}`,
      maxLevel:
        entry.maxLevel === null || entry.maxLevel === undefined
          ? null
          : Math.max(0, Math.floor(Number(entry.maxLevel) || 0)),
    }))
    .sort((a, b) => {
      if (a.maxLevel === null) return 1;
      if (b.maxLevel === null) return -1;
      return a.maxLevel - b.maxLevel;
    })
    .filter((entry) => {
      if (entry.maxLevel === null) return true;
      if (seen.has(entry.maxLevel)) return false;
      seen.add(entry.maxLevel);
      return true;
    });

  if (!ranks.length) return deepClone(DEFAULT_RANK_TRACKS.vitality.ranks);
  const last = ranks[ranks.length - 1];
  if (last.maxLevel !== null) ranks.push({ id: 'master', name: '👑 Master', maxLevel: null });
  return ranks;
}
