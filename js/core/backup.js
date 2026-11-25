/**
 * The Game of Life V2 — JSON backup helpers (M6, pure functions).
 *
 * A backup is a self-contained document:
 *   { kind, app, schemaVersion, exportedAt, activeProfileId, profiles: [...] }
 *
 * Import is validation-first: nothing is written until the caller confirms
 * the returned summary. No DOM, no storage, no timers.
 */

import { CHARACTER_BASE, levelFromXP, localDateKey } from './formulas.js';

export const BACKUP_KIND = 'gol.v2.backup';
export const BACKUP_APP = 'The Game of Life V2';
export const BACKUP_SCHEMA_VERSION = 1;

function fail(errors, payload = null) {
  return { ok: false, errors, payload, summary: null };
}

function profileSummary(profile) {
  const level = levelFromXP(profile?.character?.xp, CHARACTER_BASE);
  return {
    id: String(profile?.id ?? ''),
    name: String(profile?.name ?? 'Unnamed profile'),
    age: Math.max(0, Math.floor(Number(profile?.age) || 0)),
    level,
    xp: Math.max(0, Math.floor(Number(profile?.character?.xp) || 0)),
    gold: Math.max(0, Math.floor(Number(profile?.character?.gold) || 0)),
    schemaVersion: Number(profile?.schemaVersion),
  };
}

/** Build the canonical export document. */
export function buildBackupPayload({ profiles = [], activeProfileId = null, exportedAt = new Date().toISOString() } = {}) {
  const list = Array.isArray(profiles) ? profiles : [];
  return {
    kind: BACKUP_KIND,
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    activeProfileId: activeProfileId ?? list[0]?.id ?? null,
    profiles: list,
  };
}

/** Timestamped download name (local time, never UTC-shifted). */
export function backupFilename(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const key = localDateKey(d);
  const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `game-of-life-backup-${key}-${time}.json`;
}

/**
 * Validate an export payload (object or JSON string).
 * A backup must carry `schemaVersion` = 1 and every profile must too.
 */
export function validateBackupPayload(input) {
  const errors = [];
  let value = input;

  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return fail(['The selected file is not valid JSON.']);
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(['A backup must be a JSON object with a profiles array.']);
  }

  const schemaVersion = Number(value.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion !== BACKUP_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion ${value.schemaVersion ?? '(missing)'}; this app expects ${BACKUP_SCHEMA_VERSION}.`);
  }

  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    errors.push('The backup contains no profiles.');
    return fail(errors, value);
  }

  const seen = new Set();
  const profiles = [];

  for (const [index, profile] of value.profiles.entries()) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      errors.push(`Profile ${index + 1} is not an object.`);
      continue;
    }
    if (Number(profile.schemaVersion) !== BACKUP_SCHEMA_VERSION) {
      errors.push(`Profile ${index + 1} has schemaVersion ${profile.schemaVersion ?? '(missing)'}; expected ${BACKUP_SCHEMA_VERSION}.`);
    }
    if (!String(profile.name ?? '').trim()) {
      errors.push(`Profile ${index + 1} has no name.`);
    }
    const id = String(profile.id ?? '').trim();
    if (!id) {
      errors.push(`Profile ${index + 1} has no id.`);
    } else if (seen.has(id)) {
      errors.push(`Profile id "${id}" appears more than once.`);
    } else {
      seen.add(id);
    }
    profiles.push(profileSummary(profile));
  }

  const activeProfileId = String(value.activeProfileId ?? '').trim() || profiles[0]?.id || null;
  if (activeProfileId && !seen.has(activeProfileId)) {
    errors.push('The backup activeProfileId does not match any profile.');
  }

  return {
    ok: errors.length === 0,
    errors,
    payload: value,
    summary: {
      schemaVersion,
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : null,
      activeProfileId,
      profileCount: profiles.length,
      profiles,
    },
  };
}
