/**
 * The Game of Life V2 — profile identity + HUD view model.
 *
 * Pure presentation math: it reads a profile and returns exactly what the
 * shell needs. No DOM, no storage. Keep this stable for every screen.
 */

import {
  CHARACTER_BASE,
  ageFromBirthday,
  clampXP,
  isValidDateKey,
  levelInfo,
  derivedGold,
  lifespanHPFor,
  shieldConfig,
} from './formulas.js';
import {
  characterTitleForLevel,
  DEFAULT_CHARACTER_TITLES,
} from './titles.js';

/** The six bundled avatar portraits. New profiles must pick one. */
export const AVATAR_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'ares',
    label: 'Ares',
    src: 'icons/ares.png',
    blurb: 'The vanguard',
  }),
  Object.freeze({
    id: 'thief',
    label: 'Thief',
    src: 'icons/thief.png',
    blurb: 'The wildcard',
  }),
  Object.freeze({
    id: 'arco',
    label: 'Huntress',
    src: 'icons/arco.png',
    blurb: 'The sharpshooter',
  }),
  Object.freeze({
    id: 'assasin',
    label: 'Assassin',
    src: 'icons/assasin.png',
    blurb: 'The shadow',
  }),
  Object.freeze({
    id: 'atena',
    label: 'Athena',
    src: 'icons/atena.png',
    blurb: 'The strategist',
  }),
  Object.freeze({
    id: 'magico',
    label: 'Mage',
    src: 'icons/magico.png',
    blurb: 'The mystic',
  }),
]);

export const DEFAULT_AVATAR = AVATAR_OPTIONS[0].src;

/** True only for a bundled portrait (future custom uploads can opt in later). */
export function isKnownAvatar(src) {
  return AVATAR_OPTIONS.some((option) => option.src === src);
}

/** Resolve an avatar path; null means "render initials instead". */
export function avatarSrc(profile) {
  const value = profile?.avatar;
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value;
}

/** "King.Arts13" -> "KA"; safe for empty names. */
export function profileInitials(name) {
  const parts = String(name ?? '')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/[\s.]+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * Everything the sticky HUD and profile switcher need.
 * Percent follows the Notion cumulative convention (6548 / 7000 = 93%).
 */
export function profileView(profile, now = new Date()) {
  const safe = profile ?? {};
  const xp = clampXP(safe.character?.xp);
  const info = levelInfo(xp, CHARACTER_BASE);
  const titles = Array.isArray(safe.titles) && safe.titles.length
    ? safe.titles
    : DEFAULT_CHARACTER_TITLES;
  const computedTitle = characterTitleForLevel(info.level, titles)?.name ?? '🌱 The Seeker';
  const title = String(safe.character?.titleOverride || computedTitle);

  const birthday = isValidDateKey(safe.birthday) ? safe.birthday : '';
  const derivedAge = birthday ? ageFromBirthday(birthday, now) : null;
  const age = Math.max(
    0,
    Math.min(85, Math.floor(Number(derivedAge ?? safe.age) || 0)),
  );
  const lifespan = lifespanHPFor(age, safe.hp, safe.settings?.hp);
  const state = lifespan.state;
  const shield = shieldConfig(safe.settings?.hp);

  const goldBase = Math.floor(Number(safe.character?.goldBase) || 0);
  const wealthCoins = Math.max(0, Math.floor(Number(safe.finance?.wealthCoins) || 0));
  const storedGold = Math.max(0, Math.floor(Number(safe.character?.gold) || 0));
  const gold = storedGold || derivedGold(goldBase, wealthCoins);

  return {
    id: String(safe.id ?? ''),
    name: String(safe.name ?? 'Unnamed Player'),
    avatar: avatarSrc(safe),
    initials: profileInitials(safe.name),
    age,
    birthday,
    level: info.level,
    xp: info.xp,
    nextLevelXP: info.nextLevelXP,
    percent: info.percent,
    xpToNextLevel: info.xpToNextLevel,
    title,
    hp: {
      current: lifespan.current,
      max: lifespan.max,
      base: lifespan.base,
      percent: Math.round(lifespan.percent),
      percentLabel: `${lifespan.percent.toFixed(1)}%`,
      label: state.label,
      key: state.key,
      emoji: state.emoji,
      bonus: lifespan.lifespanBonusHP,
      shield: lifespan.shield,
      shieldMax: lifespan.shieldMax,
      shieldPercent: Math.round((lifespan.shield / Math.max(1, lifespan.shieldMax)) * 100),
      posVitalityBuffer: lifespan.posVitalityBuffer,
      negVitalityBuffer: lifespan.negVitalityBuffer,
      shieldGainXP: shield.gainXP,
      shieldLossXP: shield.lossXP,
    },
    gold,
  };
}
