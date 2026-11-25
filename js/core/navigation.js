/**
 * The Game of Life V2 — primary navigation model.
 *
 * Pure data so the bottom bar, the router and the tests share one source.
 * Labels stay short for a six-column thumb bar on a 360px screen.
 */

export const TABS = Object.freeze([
  Object.freeze({
    id: 'today',
    label: 'Today',
    icon: '☀️',
    title: 'Today',
    milestone: 'M3',
    blurb: 'Daily quests, Strict mode, bad habits and the reflection journal.',
  }),
  Object.freeze({
    id: 'character',
    label: 'Character',
    icon: '🧬',
    title: 'Character',
    milestone: 'M4',
    blurb: 'Six Core Stats, six Skills and your evolving real-life build.',
  }),
  Object.freeze({
    id: 'quests',
    label: 'Quests',
    icon: '🗺️',
    title: 'Quests & Roadmap',
    milestone: 'M4',
    blurb: 'Side quests, secret quests, missions and long-range goals.',
  }),
  Object.freeze({
    id: 'finance',
    label: 'Finance',
    icon: '💰',
    title: 'Finance',
    milestone: 'M5',
    blurb: 'Balance, assets and savings flowing into Wealth XP and Coins.',
  }),
  Object.freeze({
    id: 'shop',
    label: 'Shop',
    icon: '🛍️',
    title: 'Rewards Shop',
    milestone: 'M5',
    blurb: 'Spend hard-earned Gold on real-life rewards, with full undo.',
  }),
  Object.freeze({
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    title: 'Settings',
    milestone: 'M6',
    blurb: 'Profiles, titles, thresholds, JSON backup and offline support.',
  }),
]);

export const DEFAULT_TAB = 'today';

/** Look up a tab, falling back to Today. */
export function tabById(id) {
  return TABS.find((tab) => tab.id === id) ?? TABS[0];
}

/** Accept "character", "#/character" or an unknown value. */
export function normalizeTabId(value) {
  const cleaned = String(value ?? '')
    .replace(/^#\/?/, '')
    .split(/[/?]/)[0]
    .trim()
    .toLowerCase();
  return TABS.some((tab) => tab.id === cleaned) ? cleaned : DEFAULT_TAB;
}

/** Parse a `#/tab` hash into a valid tab id. */
export function tabIdFromHash(hash) {
  return normalizeTabId(hash);
}
