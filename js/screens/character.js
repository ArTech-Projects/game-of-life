/**
 * Character — the M4 build sheet.
 *
 * Read-only presentation of the six Core Stats, their Notion rank titles and
 * the six Skills. All values come from the profile; all math comes from
 * `core/formulas.js` and `core/titles.js`.
 */

import { el, iconNode, progressBar } from '../ui/dom.js';
import {
  CORE_BASE,
  SKILL_BASE,
  levelInfo,
  formatNumber,
} from '../core/formulas.js';
import { CORE_STAT_ORDER, rankForLevel } from '../core/titles.js';
import { profileView } from '../core/profile.js';
import { screenShell, panel, statTile, crudAddButton, panelToolbar } from './shared.js';

function coreCard(key, profile) {
  const core = profile.cores[key];
  const track = profile.rankTracks[key] ?? profile.rankTracks.vitality;
  const info = levelInfo(core.xp, CORE_BASE);
  const rank = rankForLevel(info.level, track);

  return el(
    'article',
    { class: 'core-card', dataset: { coreStat: key } },
    el(
      'div',
      { class: 'core-card__head' },
      iconNode(track.icon ?? track.emoji, {
        className: 'core-card__emoji',
        fallback: track.emoji,
      }),
      el(
        'span',
        { class: 'core-card__id' },
        el('span', { class: 'core-card__name', text: track.label }),
        el('span', { class: 'core-card__rank', text: rank.name }),
      ),
      el('span', { class: 'core-card__level', text: `Lv ${info.level}` }),
    ),
    progressBar(info.percent, { tone: 'gold', label: `${track.label} level ${info.level}` }),
    el(
      'div',
      { class: 'core-card__foot' },
      el('span', { text: `${formatNumber(info.xp)} / ${formatNumber(info.nextLevelXP)} XP` }),
      el('span', { text: `${formatNumber(info.xpToNextLevel)} to next` }),
    ),
  );
}

/** Compact ⋮ menu: keeps the skill progress bars wide and clean. */
function skillMenu(skill, name) {
  return el(
    'span',
    { class: 'crud-menu', dataset: { crudMenu: '' } },
    el('button', {
      class: 'btn btn--ghost btn--sm crud-menu__toggle',
      type: 'button',
      'data-action': 'toggle-crud-menu',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-label': `Actions for ${name}`,
      text: '⋮',
    }),
    el(
      'span',
      { class: 'crud-menu__pop', role: 'menu', hidden: true },
      el('button', {
        class: 'crud-menu__item',
        type: 'button',
        role: 'menuitem',
        'data-action': 'open-crud-edit',
        'data-crud-type': 'skill',
        'data-crud-id': skill.id,
        text: 'Edit',
      }),
      el('button', {
        class: 'crud-menu__item crud-menu__item--danger',
        type: 'button',
        role: 'menuitem',
        'data-action': 'delete-crud',
        'data-crud-type': 'skill',
        'data-crud-id': skill.id,
        'data-crud-name': name,
        text: 'Delete',
      }),
    ),
  );
}

function skillRow(skill) {
  const info = levelInfo(skill.xp, SKILL_BASE);
  const name = String(skill.name ?? 'Skill');
  return el(
    'div',
    { class: 'skill-row', dataset: { skill: skill.id } },
    el(
      'span',
      { class: 'skill-row__icon', 'aria-hidden': 'true' },
      iconNode(skill.icon, { fallback: '✦' }),
    ),
    el(
      'span',
      { class: 'skill-row__body' },
      el(
        'span',
        { class: 'skill-row__head' },
        el('span', { class: 'skill-row__name', text: name }),
        el('span', { class: 'skill-row__level', text: `Lv ${info.level}` }),
      ),
      progressBar(info.percent, { tone: 'gold', label: `${name} level ${info.level}` }),
      el('span', {
        class: 'skill-row__next',
        text: `${formatNumber(info.xp)} / ${formatNumber(info.nextLevelXP)} XP · ${formatNumber(info.xpToNextLevel)} to next`,
      }),
    ),
    el('span', {
      class: 'skill-row__xp',
      text: `${info.percent}%`,
    }),
    skillMenu(skill, name),
  );
}

export function renderCharacter({ profile }) {
  const view = profileView(profile);
  const totalCoreXP = CORE_STAT_ORDER.reduce((sum, key) => sum + profile.cores[key].xp, 0);
  const topSkill = [...profile.skills].sort((a, b) => b.xp - a.xp)[0];
  const topInfo = topSkill ? levelInfo(topSkill.xp, SKILL_BASE) : null;

  return screenShell({
    id: 'character',
    eyebrow: 'Build sheet',
    title: 'Character',
    description:
      'Your six Core Stats and specialized Skills level up as you complete quests, missions, and goals.',
    children: [
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          icon: '🧬',
          label: 'Character level',
          value: `Lv ${view.level}`,
          hint: view.title,
        }),
        statTile({
          icon: '💠',
          label: 'Core XP',
          value: formatNumber(totalCoreXP),
          hint: 'Across all six stats',
          tone: 'muted',
        }),
        statTile({
          icon: '🎨',
          label: 'Top skill',
          value: topInfo ? `Lv ${topInfo.level}` : '—',
          hint: topSkill ? String(topSkill.name).replace(/^\S+\s/, '') : 'No skills yet',
          tone: 'muted',
        }),
      ),
      panel({
        title: 'Core stats',
        meta: '6 stats',
        children: [
          el(
            'div',
            { class: 'grid grid--2 core-grid' },
            CORE_STAT_ORDER.map((key) => coreCard(key, profile)),
          ),
          el('p', {
            class: 'panel__note',
            text: 'Rank titles and thresholds are customizable per profile in Settings. Vitality never drops below 0 XP.',
          }),
        ],
      }),
      panel({
        title: 'Skills',
        meta: '6 skills',
        children: [
          panelToolbar(crudAddButton('skill', 'Add skill')),
          profile.skills.length
            ? el('div', { class: 'skill-list' }, profile.skills.map(skillRow))
            : el('p', { class: 'panel__copy', text: 'No skills yet. Add them in M6.' }),
          el('p', {
            class: 'panel__note',
            text: 'Complete side quests, daily quests, and missions to earn Skill XP and unlock higher mastery levels.',
          }),
        ],
      }),
    ],
  });
}
