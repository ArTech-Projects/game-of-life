/**
 * Settings — M6 profile, economy and system configuration.
 *
 * Every form is a thin presentation layer: validation and persistence live in
 * `core/crud.js` + `data/store.js`. Level curves stay locked; only labels,
 * thresholds, identity, tuning constants and backups are editable here.
 */

import { el } from '../ui/dom.js';
import { formatNumber, normalizeCurrency } from '../core/formulas.js';
import { profileView } from '../core/profile.js';
import { CORE_STAT_ORDER } from '../core/titles.js';
import { screenShell, panel, moneyRow, currencySelect } from './shared.js';

function editButton(type, id, statKey = '', label = 'Edit') {
  return el('button', {
    class: 'btn btn--ghost btn--sm',
    type: 'button',
    'data-action': 'open-crud-edit',
    'data-crud-type': type,
    'data-crud-id': id,
    'data-crud-stat-key': statKey || null,
    text: label,
  });
}

function settingField({ label, name, value, type = 'number', min = '0', max = null, step = '1', hint = '', wide = false }) {
  const id = `settings-field-${name}`;
  return el(
    'label',
    { class: `field${wide ? ' field--wide' : ''}`, for: id },
    el('span', { class: 'field__label', text: label }),
    el('input', {
      id,
      name,
      type,
      value: value ?? '',
      min,
      max,
      step,
      autocomplete: 'off',
      inputmode: type === 'number' ? 'decimal' : null,
    }),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

function settingsForm(name, fields, saveLabel) {
  return el(
    'form',
    { class: 'settings-form', 'data-settings-form': name, novalidate: 'novalidate' },
    el('div', { class: 'form-grid' }, fields),
    el(
      'div',
      { class: 'form-actions' },
      el('button', { class: 'btn btn--gold', type: 'submit', text: saveLabel }),
    ),
  );
}

function deleteDialog(profile, canDelete) {
  return el(
    'dialog',
    { class: 'sheet', id: 'delete-profile-dialog', 'aria-labelledby': 'delete-profile-title' },
    el(
      'div',
      { class: 'sheet__panel' },
      el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'sheet__head' },
        el('h2', { class: 'sheet__title', id: 'delete-profile-title', text: 'Delete profile' }),
        el('button', { class: 'sheet__close', type: 'button', 'data-action': 'close-dialog', 'aria-label': 'Close', text: '×' }),
      ),
      el(
        'div',
        { class: 'sheet__body' },
        canDelete
          ? el(
              'form',
              { class: 'profile-form', 'data-settings-form': 'delete-profile', novalidate: 'novalidate' },
              el('input', { type: 'hidden', name: 'id', value: profile.id }),
              el('p', {
                class: 'sheet__lede',
                text: 'This permanently removes the profile and every quest, journal, finance row and purchase it owns. Export a JSON save first if you might want it back.',
              }),
              el(
                'label',
                { class: 'field', for: 'delete-profile-confirm' },
                el('span', { class: 'field__label', text: `Type “${profile.name}” to confirm` }),
                el('input', {
                  id: 'delete-profile-confirm',
                  name: 'confirm',
                  type: 'text',
                  autocomplete: 'off',
                  placeholder: profile.name,
                }),
              ),
              el('p', { class: 'form-error', 'data-delete-error': '', role: 'alert', hidden: true }),
              el(
                'div',
                { class: 'form-actions' },
                el('button', { class: 'btn', type: 'button', 'data-action': 'close-dialog', text: 'Cancel' }),
                el('button', { class: 'btn btn--danger', type: 'submit', text: 'Delete profile permanently' }),
              ),
            )
          : el(
              'div',
              { class: 'settings-warning' },
              el('span', { text: '🛡️', 'aria-hidden': 'true' }),
              el('p', {
                text: 'This is the last profile. Deleting it is blocked so the app always has a valid player.',
              }),
            ),
      ),
    ),
  );
}

function importDialog() {
  return el(
    'dialog',
    { class: 'sheet', id: 'import-backup-dialog', 'aria-labelledby': 'import-backup-title' },
    el(
      'div',
      { class: 'sheet__panel' },
      el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'sheet__head' },
        el('h2', { class: 'sheet__title', id: 'import-backup-title', text: 'Import JSON save' }),
        el('button', { class: 'sheet__close', type: 'button', 'data-action': 'close-dialog', 'aria-label': 'Close', text: '×' }),
      ),
      el(
        'div',
        { class: 'sheet__body' },
        el('p', {
          class: 'sheet__lede',
          text: 'Preview first. Importing replaces every profile currently stored in this browser with the profiles in the backup.',
        }),
        el('div', { class: 'backup-preview', 'data-import-preview': '' }),
        el('p', { class: 'form-error', 'data-import-error': '', role: 'alert', hidden: true }),
        el(
          'div',
          { class: 'form-actions' },
          el('button', { class: 'btn', type: 'button', 'data-action': 'close-dialog', text: 'Cancel' }),
          el('button', { class: 'btn btn--danger', type: 'button', 'data-action': 'confirm-import-backup', text: 'Replace profiles from backup' }),
        ),
      ),
    ),
  );
}

export function renderSettings({ profile, store }) {
  const view = profileView(profile);
  const currency = normalizeCurrency(profile.finance?.currency ?? profile.settings?.currency);
  const profiles = store?.getProfiles?.() ?? [profile];
  const canDelete = profiles.length > 1;
  const hp = profile.settings?.hp ?? {};
  const points = profile.settings?.points ?? {};
  const titles = [...(profile.titles ?? [])].sort((a, b) => Number(a.minLevel) - Number(b.minLevel));

  return screenShell({
    id: 'settings',
    eyebrow: 'System',
    title: 'Settings',
    description:
      'Customize your hero identity, economy preferences, HP tuning, and rank titles.',
    children: [
      panel({
        title: 'Active profile',
        meta: 'Local only',
        children: [
          el(
            'div',
            { class: 'profile-card' },
            el(
              'span',
              { class: 'profile-card__avatar', 'aria-hidden': 'true' },
              view.avatar
                ? el('img', { src: view.avatar, alt: '', decoding: 'async' })
                : el('span', { class: 'mini-avatar__initials', text: view.initials }),
            ),
            el(
              'span',
              { class: 'profile-card__body' },
              el('span', { class: 'profile-card__name', text: view.name }),
              el('span', { class: 'profile-card__meta', text: `${view.title} · Level ${view.level}` }),
              el('span', {
                class: 'profile-card__meta',
                text: `Age ${view.age} · ${formatNumber(view.hp.current)} / ${formatNumber(view.hp.max)} HP · ${formatNumber(view.gold)} Gold`,
              }),
            ),
            el('button', { class: 'btn btn--ghost btn--compact', type: 'button', 'data-action': 'open-profiles' }, 'Switch'),
          ),
          moneyRow({ label: 'Profile ID', value: profile.id }),
          moneyRow({ label: 'Schema version', value: `v${profile.schemaVersion}` }),
          moneyRow({ label: 'Profiles in this browser', value: String(profiles.length) }),
        ],
      }),
      el(
        'div',
        { class: 'grid grid--2' },
        panel({
          title: 'Player details',
          meta: 'Identity',
          children: [
            settingsForm('identity', [
              settingField({ label: 'Player name', name: 'name', type: 'text', value: profile.name, min: null, step: null, wide: true }),
              settingField({
                label: 'Birthday',
                name: 'birthday',
                type: 'date',
                value: profile.birthday ?? view.birthday ?? '',
                min: null,
                max: null,
                step: null,
                hint: `Age ${view.age} · Lifespan HP: ${formatNumber(view.hp.current)} / ${formatNumber(view.hp.max)}`,
              }),
              el('p', {
                class: 'panel__note field--wide birthday-note',
                text: 'Stored only on this device to calculate your age and update your Lifespan HP automatically on your birthday.',
              }),
            ], 'Save player details'),
          ],
        }),
        panel({
          title: 'Starting Wealth XP Offset',
          meta: 'Finance → Wealth',
          children: [
            el('p', {
              class: 'panel__copy',
              text: 'Adds a starting XP offset to your Wealth Core Stat on top of your live net worth (1 XP per 100 currency units).',
            }),
            settingsForm('economy', [
              settingField({
                label: 'Starting Wealth XP Offset',
                name: 'wealthXpBaseline',
                value: profile.finance?.wealthXpBaseline ?? 0,
                hint: 'New profiles default to 0.',
              }),
            ], 'Save offset'),
          ],
        }),
      ),
      el(
        'div',
        { class: 'grid grid--2' },
        panel({
          title: 'Vitality Shield & Status Tuning',
          meta: 'Editable tuning',
          children: [
            settingsForm('hp', [
              settingField({ label: 'Shield Gain XP Threshold', name: 'shieldGainXP', value: hp.shieldGainXP ?? 100, min: '1', hint: 'Vitality XP gained per +1 Shield.' }),
              settingField({ label: 'Shield Loss XP Threshold', name: 'shieldLossXP', value: hp.shieldLossXP ?? 60, min: '1', hint: 'Vitality XP lost per −1 Shield.' }),
              settingField({ label: 'Worn at %', name: 'woundedPercent', value: hp.woundedPercent ?? 50, min: '1', max: '100' }),
              settingField({ label: 'Frail at %', name: 'exhaustedPercent', value: hp.exhaustedPercent ?? 25, min: '1', max: '100' }),
            ], 'Save Vitality Shield tuning'),
            el('p', {
              class: 'panel__note',
              text: 'Lifespan HP scales with age and is always shown out of 1,000. A full Shield rolls into +1 Lifespan HP.',
            }),
          ],
        }),
        panel({
          title: 'Reflection points',
          meta: 'Awards',
          children: [
            el('p', {
              class: 'panel__copy',
              text: 'Daily Reflection rewards. The first save awards Mind Core XP (which also adds Character XP) and Gold.',
            }),
            settingsForm('points', [
              settingField({ label: 'Reflection Mind Core XP', name: 'journalXp', value: points.journal?.xp ?? 10 }),
              settingField({ label: 'Reflection Gold', name: 'journalCoins', value: points.journal?.coins ?? 35 }),
            ], 'Save reflection points'),
          ],
        }),
      ),
      panel({
        title: 'Character Titles',
        meta: `${titles.length} titles`,
        children: [
          el('p', {
            class: 'panel__copy',
            text: 'The displayed title is the highest one whose trigger level is reached. Ten titles are always available.',
          }),
          el(
            'div',
            { class: 'settings-list' },
            titles.map((title, index) => el(
              'div',
              { class: 'settings-row' },
              el('span', { class: 'settings-row__index', text: String(index + 1) }),
              el(
                'span',
                { class: 'settings-row__body' },
                el('strong', { text: title.name }),
                el('span', { class: 'settings-row__meta', text: `Unlocks at level ${formatNumber(title.minLevel)}` }),
              ),
              editButton('characterTitle', title.id),
            )),
          ),
        ],
      }),
      panel({
        title: 'Core Stat ranks',
        meta: '6 tracks × 7 ranks',
        children: [
          el('p', {
            class: 'panel__copy',
            text: 'Rank names and inclusive level thresholds are editable. The final rank in each track is open-ended.',
          }),
          el(
            'div',
            { class: 'settings-details' },
            CORE_STAT_ORDER.map((key) => {
              const track = profile.rankTracks?.[key];
              if (!track) return null;
              const ranks = [...(track.ranks ?? [])].sort((a, b) => {
                if (a.maxLevel === null) return 1;
                if (b.maxLevel === null) return -1;
                return Number(a.maxLevel) - Number(b.maxLevel);
              });
              return el(
                'details',
                { class: 'settings-details__item' },
                el(
                  'summary',
                  { class: 'settings-details__summary' },
                  el(
                    'span',
                    { class: 'settings-row__body' },
                    el('strong', { text: `${track.display ?? track.label} · ${ranks.length} ranks` }),
                    el('span', { class: 'settings-row__meta', text: ranks.map((rank) => rank.name).join(' · ') }),
                  ),
                  editButton('coreStat', '', key, 'Edit label'),
                ),
                el(
                  'div',
                  { class: 'settings-list' },
                  ranks.map((rank) => el(
                    'div',
                    { class: 'settings-row' },
                    el(
                      'span',
                      { class: 'settings-row__body' },
                      el('strong', { text: rank.name }),
                      el('span', {
                        class: 'settings-row__meta',
                        text: rank.maxLevel === null ? 'Open-ended (∞)' : `Up to stat level ${formatNumber(rank.maxLevel)}`,
                      }),
                    ),
                    editButton('coreRank', rank.id, key),
                  )),
                ),
              );
            }),
          ),
        ],
      }),
      el(
        'div',
        { class: 'grid grid--2' },
        panel({
          title: 'Backup & restore',
          meta: 'JSON save',
          children: [
            el('p', {
              class: 'panel__copy',
              text: 'Export every profile as timestamped JSON. Import always shows a preview and asks for confirmation before replacing local profiles.',
            }),
            el(
              'div',
              { class: 'form-actions form-actions--stack' },
              el('button', { class: 'btn btn--gold', type: 'button', 'data-action': 'export-backup', text: '⬇ Export JSON Save' }),
              el('button', { class: 'btn', type: 'button', 'data-action': 'open-import-backup', text: '⬆ Import JSON Save' }),
            ),
            el('input', {
              type: 'file',
              accept: 'application/json,.json',
              'data-backup-file': '',
              hidden: true,
            }),
            el('p', { class: 'panel__note', text: 'Nothing is overwritten until you confirm the preview.' }),
          ],
        }),
        panel({
          title: 'App & Offline Status',
          meta: 'On this device',
          children: [
            moneyRow({ label: 'Storage mode', value: '100% Offline · Saved on Device' }),
            moneyRow({ label: 'Active profile', value: view.name }),
            moneyRow({ label: 'Corruption guard', value: 'Automatic backup & recovery enabled' }),
            moneyRow({ label: 'App version', value: 'v2.0 · Offline PWA Ready' }),
            moneyRow({ label: 'Developer', value: 'ArTech1498 | king.arts13' }),
          ],
        }),
      ),
      panel({
        title: 'Appearance',
        meta: 'Display',
        children: [
          el(
            'div',
            { class: 'setting-row' },
            el('span', { class: 'setting-row__label', text: 'Theme' }),
            el('span', { class: 'chip', text: 'Obsidian & gold' }),
          ),
          el(
            'div',
            { class: 'setting-row' },
            el('span', { class: 'setting-row__label', text: 'Motion' }),
            el('span', { class: 'chip chip--muted', text: 'Respects prefers-reduced-motion' }),
          ),
          el(
            'div',
            { class: 'setting-row' },
            el('label', { class: 'setting-row__label', for: 'settings-currency', text: 'Display currency' }),
            currencySelect({ value: currency, id: 'settings-currency' }),
          ),
          el('p', {
            class: 'panel__note',
            text: 'Switching currency only changes the symbol shown across Finance and the Shop. Wealth XP still uses 100 units = 1 XP and Wealth Coins use 500 units = 1 coin.',
          }),
        ],
      }),
      panel({
        title: 'Danger zone',
        meta: canDelete ? 'Typed confirmation' : 'Last profile protected',
        className: 'panel--danger',
        children: [
          el('p', {
            class: 'panel__copy',
            text: canDelete
              ? 'Deleting a profile removes its XP, HP, Gold, journal, finance and purchase history from this browser. Export a backup first.'
              : 'The last remaining profile cannot be deleted. Create another profile if you need to retire this one.',
          }),
          el(
            'div',
            { class: 'form-actions' },
            el('button', {
              class: 'btn btn--danger',
              type: 'button',
              'data-action': 'open-delete-profile',
              disabled: canDelete ? null : true,
              text: 'Delete this profile',
            }),
          ),
          moneyRow({ label: 'Protection', value: canDelete ? 'Type the profile name to confirm' : 'Last-profile guard active' }),
        ],
      }),
      deleteDialog(profile, canDelete),
      importDialog(),
    ],
  });
}
