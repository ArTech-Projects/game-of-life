/**
 * M6 CRUD sheet — one reusable editor for every collection row.
 *
 * The sheet is presentation only. All validation, id generation, reference
 * cleanup and persistence live in `core/crud.js` and `data/store.js`.
 * Permanent leveling formulas are never exposed here.
 */

import { el, clear, iconNode, isImageSource } from '../ui/dom.js';
import { formatNumber } from '../core/formulas.js';
import { CORE_STAT_ORDER } from '../core/titles.js';

const ICON_FILES = Object.freeze([
  'ares.png', 'arco.png', 'armor.png', 'art.png', 'assasin.png', 'atena.png',
  'bed.png', 'book_(5).png', 'cleaner.png', 'cold.png', 'computer.png', 'disconnect.png',
  'energy.png', 'fighter.png', 'fire.png', 'fish.png', 'focus.png', 'forex.png',
  'game_(3).png', 'gaming.png', 'grassland_(1).png', 'help.png', 'interview.png', 'kitchenware.png',
  'magico.png', 'mechanic.png', 'mona-lisa.png', 'nap.png', 'oil-paint.png', 'road.png',
  'rules.png', 'running.png', 'running-shoes.png', 'sleep 1.png', 'sleep.png', 'social-media.png',
  'sorcerer.png', 'streaming.png', 'streaming_(1).png', 'thief.png', 'video.png', 'video_(1).png',
  'watch-tv.png', 'web-design.png',
]);

const STATUS_OPTIONS = Object.freeze([
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
]);

const TYPE_LABELS = Object.freeze({
  dailyQuest: 'Daily Quest',
  badHabit: 'Bad Habit',
  sideQuest: 'Side / Secret Quest',
  mission: 'Mission',
  goal: 'Goal',
  skill: 'Skill',
  reward: 'Shop Reward',
  characterTitle: 'Character Title',
  coreRank: 'Core Stat Rank',
  coreStat: 'Core Stat Label',
});

function textField({ name, label, value = '', hint = '', required = false, placeholder = '', wide = false, type = 'text', min = null, max = null, step = null }) {
  const id = `crud-field-${name}`;
  return el(
    'label',
    { class: `field${wide ? ' field--wide' : ''}`, for: id },
    el('span', { class: 'field__label', text: label }),
    el('input', {
      id,
      name,
      type,
      value: value ?? '',
      placeholder,
      required: required ? true : null,
      min,
      max,
      step,
      autocomplete: 'off',
      inputmode: type === 'number' ? 'decimal' : null,
    }),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

function selectField({ name, label, value = '', options = [], hint = '', wide = false }) {
  const id = `crud-field-${name}`;
  return el(
    'label',
    { class: `field${wide ? ' field--wide' : ''}`, for: id },
    el('span', { class: 'field__label', text: label }),
    el(
      'select',
      { id, name, class: 'select select--field' },
      options.map((option) => el('option', {
        value: option.value,
        selected: String(option.value) === String(value ?? '') ? true : null,
      }, option.label)),
    ),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

function textareaField({ name, label, value = '', hint = '', rows = 3, wide = true }) {
  const id = `crud-field-${name}`;
  return el(
    'label',
    { class: `field${wide ? ' field--wide' : ''}`, for: id },
    el('span', { class: 'field__label', text: label }),
    el('textarea', { id, name, rows: String(rows), autocomplete: 'off' }, value ?? ''),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

function checkField({ name, label, checked = false, hint = '' }) {
  return el(
    'label',
    { class: 'check-row check-row--compact' },
    el('input', { type: 'checkbox', name, checked: checked ? true : null }),
    el(
      'span',
      {},
      el('strong', { text: label }),
      hint ? el('small', { text: hint }) : null,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Visual icon picker + compressed uploads                             */
/* ------------------------------------------------------------------ */

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode that image.'));
    image.src = src;
  });
}

/**
 * Convert an uploaded image into a small transparent Data URL (96×96 max).
 * Custom icons must survive JSON export/import and localStorage limits.
 */
export async function compressIconFile(file, size = 96) {
  if (!file || !String(file.type ?? '').startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  const source = await readFileAsDataURL(file);
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  const width = Number(image.naturalWidth || image.width || size);
  const height = Number(image.naturalHeight || image.height || size);
  const scale = Math.min(size / Math.max(1, width), size / Math.max(1, height), 1);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  if (/^data:image\/webp/i.test(webp)) return webp;
  return canvas.toDataURL('image/png');
}

function iconValueLabel(value) {
  const source = String(value ?? '').trim();
  if (!source) return 'No icon selected';
  if (/^data:image\//i.test(source)) return `Custom uploaded icon (${Math.max(1, Math.round(source.length / 1024))} KB)`;
  if (source.startsWith('icons/')) return source.replace(/^icons\//, '');
  return source;
}

function iconPickerField({ label = 'Icon', value = '' } = {}) {
  const buttons = [];
  const hidden = el('input', { type: 'hidden', name: 'icon', value: value ?? '' });
  const preview = el('div', { class: 'icon-picker__preview', 'aria-hidden': 'true' });
  const status = el('span', { class: 'icon-picker__status' });
  let select = () => {};

  function renderPreview(current) {
    clear(preview);
    if (!current) {
      preview.append(el('span', { text: '—' }));
      return;
    }
    preview.append(iconNode(current, { fallback: '✦' }));
  }

  select = (next) => {
    const selected = String(next ?? '');
    hidden.value = selected;
    renderPreview(selected);
    status.textContent = iconValueLabel(selected);
    for (const button of buttons) {
      button.classList.toggle(
        'icon-choice--selected',
        String(button.dataset.iconChoice ?? '') === selected,
      );
    }
  };

  const choiceButton = (choice, content, title, extraClass = '') => {
    const button = el(
      'button',
      {
        class: `icon-choice${extraClass ? ` ${extraClass}` : ''}`,
        type: 'button',
        'data-icon-choice': choice,
        title,
        'aria-label': title,
      },
      content,
    );
    button.addEventListener('click', () => select(choice));
    buttons.push(button);
    return button;
  };

  const grid = el(
    'div',
    { class: 'icon-picker__grid', role: 'group', 'aria-label': 'Choose a bundled icon' },
    choiceButton('', el('span', { text: 'No icon' }), 'No icon', 'icon-choice--none'),
    ...ICON_FILES.map((file) => choiceButton(
      `icons/${file}`,
      el('img', { src: `icons/${file}`, alt: '', loading: 'lazy', decoding: 'async' }),
      file,
    )),
  );

  const upload = el('input', { type: 'file', accept: 'image/*', 'data-icon-upload': '' });
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    status.textContent = 'Compressing upload…';
    try {
      const dataUrl = await compressIconFile(file);
      if (!isImageSource(dataUrl)) throw new Error('Unsupported image.');
      select(dataUrl);
    } catch (error) {
      status.textContent = error?.message || 'Could not read that image.';
    } finally {
      upload.value = '';
    }
  });

  const field = el(
    'div',
    { class: 'field field--wide icon-picker', 'data-icon-picker': '' },
    el(
      'div',
      { class: 'icon-picker__head' },
      preview,
      el(
        'span',
        {},
        el('span', { class: 'field__label', text: label }),
        status,
      ),
    ),
    grid,
    el(
      'label',
      { class: 'icon-picker__upload' },
      el('span', { text: '⬆ Upload Custom Icon' }),
      upload,
    ),
    hidden,
  );

  select(value ?? '');
  return field;
}

function rewardPair({ label, first, second }) {
  return el(
    'div',
    { class: 'field field--wide reward-pair' },
    el('span', { class: 'reward-pair__label', text: label }),
    first,
    second,
  );
}

function autoXpValue(row) {
  const core = (row?.coreRewards ?? []).reduce((sum, reward) => sum + Number(reward?.xp ?? 0), 0);
  const skill = (row?.skillRewards ?? []).reduce((sum, reward) => sum + Number(reward?.xp ?? 0), 0);
  return Math.max(0, Math.floor(core + skill));
}

function autoXpBadge(value = 0) {
  return el(
    'div',
    { class: 'auto-xp-badge field--wide', 'data-auto-xp': '' },
    el('span', { text: 'Auto Character XP' }),
    el('strong', { 'data-auto-xp-value': '', text: `+${formatNumber(value)} XP` }),
  );
}

function skillTotalBadge(total) {
  return el(
    'div',
    { class: 'auto-xp-badge field--wide', 'data-skill-total': '' },
    el('span', { text: 'Total XP (read-only)' }),
    el('strong', { 'data-skill-total-value': '', text: `${formatNumber(total)} XP` }),
  );
}

function skillEarnedBadge(earned) {
  return el(
    'div',
    { class: 'auto-xp-badge field--wide', 'data-skill-earned': '', 'data-earned-xp': String(earned) },
    el('span', { text: 'Earned XP (read-only · from quests)' }),
    el('strong', { 'data-skill-earned-value': '', text: `${formatNumber(earned)} XP` }),
  );
}

function coreOptions(profile) {
  return [
    { value: '', label: 'None' },
    ...CORE_STAT_ORDER.map((key) => ({
      value: key,
      label: profile.rankTracks?.[key]?.display ?? key,
    })),
  ];
}

const SKILL_EMOJI = {
  art: '🎨',
  electronics: '⚡',
  mech: '⚙️',
  video: '🎬',
  filming: '🎥',
  trading: '📈',
};

function skillOptions(profile) {
  return [
    { value: '', label: 'None' },
    ...(profile.skills ?? []).map((skill) => {
      const raw = String(skill.name ?? skill.id).trim();
      const known = SKILL_EMOJI[skill.id];
      const name = raw.replace(/^\S+\s+/, '');
      const label = known
        ? `${known} ${name}`
        : /^[A-Za-z0-9]/.test(raw)
          ? `✦ ${raw}`
          : raw;
      return { value: skill.id, label };
    }),
  ];
}

function missionOptions(profile) {
  return [
    { value: '', label: 'Standalone mission' },
    ...(profile.goals ?? []).map((goal) => ({ value: goal.id, label: goal.name })),
  ];
}

function findRow(profile, type, id, statKey) {
  if (type === 'characterTitle') {
    return (profile.titles ?? []).find((title) => String(title.id) === String(id)) ?? null;
  }
  if (type === 'coreRank') {
    const track = profile.rankTracks?.[statKey];
    return (track?.ranks ?? []).find((rank) => String(rank.id) === String(id)) ?? null;
  }
  if (type === 'coreStat') return profile.rankTracks?.[statKey] ?? null;

  const collections = {
    dailyQuest: profile.dailyQuests,
    badHabit: profile.badHabits,
    sideQuest: profile.sideQuests,
    mission: profile.missions,
    goal: profile.goals,
    skill: profile.skills,
    reward: profile.rewards,
  };
  return (collections[type] ?? []).find((row) => String(row.id) === String(id)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Field schemas                                                       */
/* ------------------------------------------------------------------ */

function buildFields({ type, row, profile, statKey }) {
  const fields = [];

  if (type === 'dailyQuest') {
    const coreRewards = Array.isArray(row?.coreRewards) ? row.coreRewards : [];
    const skillRewards = Array.isArray(row?.skillRewards) ? row.skillRewards : [];
    fields.push(
      textField({ name: 'name', label: 'Quest name', value: row?.name, required: true, wide: true }),
      iconPickerField({ label: 'Quest icon', value: row?.icon ?? '' }),
      textField({ name: 'coins', label: 'Gold coins', value: row?.coins ?? 0, type: 'number', min: '0', step: '1' }),
      textField({ name: 'penaltyCoins', label: 'Skip penalty · Gold coins', value: row?.penalty?.coins ?? 0, type: 'number', min: '0', step: '1' }),
      rewardPair({
        label: 'Skip penalty',
        first: selectField({
          name: 'penaltyCoreStat',
          label: 'Skip Penalty Core 1',
          value: row?.penalty?.coreStat ?? coreRewards[0]?.stat ?? '',
          options: coreOptions(profile),
          hint: 'Deducts only from this Core Stat.',
        }),
        second: textField({
          name: 'penaltyCoreXp',
          label: 'Skip Penalty Core XP 1',
          value: row?.penalty?.coreXp ?? autoXpValue({ coreRewards }),
          type: 'number',
          min: '0',
          step: '1',
        }),
      }),
      rewardPair({
        label: ' ',
        first: selectField({
          name: 'penaltyCoreStat2',
          label: 'Skip Penalty Core 2',
          value: row?.penalty?.coreStat2 ?? '',
          options: coreOptions(profile),
          hint: 'Optional second Core Stat loss.',
        }),
        second: textField({
          name: 'penaltyCoreXp2',
          label: 'Skip Penalty Core XP 2',
          value: row?.penalty?.coreXp2 ?? 0,
          type: 'number',
          min: '0',
          step: '1',
        }),
      }),
      rewardPair({
        label: 'Core rewards',
        first: selectField({ name: 'coreStat1', label: 'Core reward 1', value: coreRewards[0]?.stat ?? '', options: coreOptions(profile) }),
        second: textField({ name: 'coreXp1', label: 'Core XP 1', value: coreRewards[0]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: ' ',
        first: selectField({ name: 'coreStat2', label: 'Core reward 2', value: coreRewards[1]?.stat ?? '', options: coreOptions(profile) }),
        second: textField({ name: 'coreXp2', label: 'Core XP 2', value: coreRewards[1]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: 'Skill rewards',
        first: selectField({ name: 'skill1', label: 'Skill reward 1', value: skillRewards[0]?.skill ?? '', options: skillOptions(profile) }),
        second: textField({ name: 'skillXp1', label: 'Skill XP 1', value: skillRewards[0]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: ' ',
        first: selectField({ name: 'skill2', label: 'Skill reward 2', value: skillRewards[1]?.skill ?? '', options: skillOptions(profile) }),
        second: textField({ name: 'skillXp2', label: 'Skill XP 2', value: skillRewards[1]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      autoXpBadge(autoXpValue(row)),
      textField({ name: 'physicalPenalty', label: 'Real-world penalty', value: row?.physicalPenalty, wide: true, placeholder: '20 Push-ups' }),
      checkField({ name: 'strict', label: 'Strict by default', checked: row?.strict === true, hint: 'Auto-skips at local midnight.' }),
      checkField({ name: 'active', label: 'Active', checked: row?.active !== false }),
    );
  }

  if (type === 'badHabit') {
    fields.push(
      textField({ name: 'name', label: 'Habit name', value: row?.name, required: true, wide: true }),
      textField({ name: 'emoji', label: 'Emoji fallback', value: row?.emoji ?? '⚠️' }),
      iconPickerField({ label: 'Habit icon', value: row?.icon ?? '' }),
      rewardPair({
        label: 'Relapse penalty',
        first: selectField({
          name: 'penaltyCoreStat',
          label: 'Penalty Core Stat',
          value: row?.penalty?.coreStat ?? '',
          options: coreOptions(profile),
          hint: 'Optional Core Stat loss on relapse.',
        }),
        second: textField({
          name: 'penaltyCoreXp',
          label: 'Penalty Core XP',
          value: row?.penalty?.coreXp ?? 0,
          type: 'number',
          min: '0',
          step: '1',
        }),
      }),
      textField({
        name: 'penaltyCoins',
        label: 'Penalty Gold',
        value: row?.penalty?.coins ?? 0,
        type: 'number',
        min: '0',
        step: '1',
        hint: 'Gold is clamped at 0.',
      }),
      checkField({ name: 'active', label: 'Active', checked: row?.active !== false }),
    );
  }

  if (type === 'sideQuest') {
    const coreRewards = Array.isArray(row?.coreRewards) ? row.coreRewards : [];
    const skillRewards = Array.isArray(row?.skillRewards) ? row.skillRewards : [];
    fields.push(
      textField({ name: 'name', label: 'Quest name', value: row?.name, required: true, wide: true }),
      selectField({
        name: 'type',
        label: 'Type',
        value: row?.type ?? 'side',
        options: [{ value: 'side', label: 'Side quest' }, { value: 'secret', label: 'Secret quest' }],
      }),
      iconPickerField({ label: 'Quest icon', value: row?.icon ?? '' }),
      textField({ name: 'coins', label: 'Gold coins', value: row?.coins ?? 0, type: 'number', min: '0', step: '1' }),
      rewardPair({
        label: 'Core rewards',
        first: selectField({ name: 'coreStat1', label: 'Core reward 1', value: coreRewards[0]?.stat ?? '', options: coreOptions(profile) }),
        second: textField({ name: 'coreXp1', label: 'Core XP 1', value: coreRewards[0]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: ' ',
        first: selectField({ name: 'coreStat2', label: 'Core reward 2', value: coreRewards[1]?.stat ?? '', options: coreOptions(profile) }),
        second: textField({ name: 'coreXp2', label: 'Core XP 2', value: coreRewards[1]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: 'Skill rewards',
        first: selectField({ name: 'skill1', label: 'Skill reward 1', value: skillRewards[0]?.skill ?? '', options: skillOptions(profile) }),
        second: textField({ name: 'skillXp1', label: 'Skill XP 1', value: skillRewards[0]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      rewardPair({
        label: ' ',
        first: selectField({ name: 'skill2', label: 'Skill reward 2', value: skillRewards[1]?.skill ?? '', options: skillOptions(profile) }),
        second: textField({ name: 'skillXp2', label: 'Skill XP 2', value: skillRewards[1]?.xp ?? 0, type: 'number', min: '0', step: '1' }),
      }),
      autoXpBadge(autoXpValue(row)),
      textField({ name: 'message', label: 'Card note', value: row?.message, wide: true, placeholder: 'Short flavour or instruction' }),
      checkField({ name: 'repeatable', label: 'Repeatable', checked: row?.repeatable !== false }),
      checkField({ name: 'active', label: 'Active', checked: row?.active !== false }),
    );
  }

  if (type === 'mission') {
    fields.push(
      textField({ name: 'name', label: 'Mission name', value: row?.name, required: true, wide: true }),
      selectField({ name: 'goalId', label: 'Linked goal', value: row?.goalId ?? '', options: missionOptions(profile) }),
      selectField({ name: 'status', label: 'Status', value: row?.status ?? 'not-started', options: STATUS_OPTIONS }),
      textField({ name: 'startDate', label: 'Start date (optional)', value: row?.startDate, type: 'date' }),
      textField({ name: 'endDate', label: 'Due date (optional)', value: row?.endDate, type: 'date', hint: 'Leave blank for no deadline.' }),
      textField({ name: 'xp', label: 'Character XP Reward', value: row?.xp ?? 500, type: 'number', min: '0', step: '1' }),
      textField({ name: 'coins', label: 'Gold Coin Reward', value: row?.coins ?? 1000, type: 'number', min: '0', step: '1' }),
      textField({ name: 'progressPercent', label: 'Manual progress %', value: row?.progress != null ? Math.round(Number(row.progress) * 100) : 0, type: 'number', min: '0', max: '100', step: '1', hint: 'Optional override — leave at 0 to use task progress.' }),
      textareaField({ name: 'tasksText', label: 'Tasks', value: (row?.tasks ?? []).map((task) => task.title).join('\n'), hint: 'One task per line. Existing done flags are preserved by title.' }),
    );
  }

  if (type === 'goal') {
    fields.push(
      textField({ name: 'name', label: 'Goal name', value: row?.name, required: true, wide: true }),
      selectField({ name: 'status', label: 'Status', value: row?.status ?? 'active', options: STATUS_OPTIONS }),
      textField({ name: 'startDate', label: 'Start date (optional)', value: row?.startDate, type: 'date' }),
      textField({ name: 'endDate', label: 'Target date (optional)', value: row?.endDate, type: 'date', hint: 'Leave blank for no deadline.' }),
      textField({ name: 'xp', label: 'Character XP Reward', value: row?.xp ?? 10000, type: 'number', min: '0', step: '1' }),
      textField({ name: 'coins', label: 'Gold Coin Reward', value: row?.coins ?? 20000, type: 'number', min: '0', step: '1' }),
      textField({ name: 'progressPercent', label: 'Manual progress %', value: row?.progress != null ? Math.round(Number(row.progress) * 100) : 0, type: 'number', min: '0', max: '100', step: '1', hint: 'Optional override — leave at 0 to use linked-mission progress.' }),
    );
    const linked = new Set((row?.missionIds ?? []).map((id) => String(id)));
    fields.push(
      el(
        'fieldset',
        { class: 'field field--wide field--fieldset' },
        el('legend', { class: 'field__label', text: 'Linked missions' }),
        (profile.missions ?? []).length
          ? el(
              'div',
              { class: 'check-grid' },
              profile.missions.map((mission) => el(
                'label',
                { class: 'check-row check-row--compact' },
                el('input', {
                  type: 'checkbox',
                  name: 'missionIds',
                  value: mission.id,
                  checked: linked.has(String(mission.id)) ? true : null,
                }),
                el('span', {}, el('strong', { text: mission.name })),
              )),
            )
          : el('p', { class: 'field__hint', text: 'Create a mission first to link it to this goal.' }),
      ),
    );
  }

  if (type === 'skill') {
    const startingXP = Math.max(0, Math.floor(Number(row?.startingXP) || 0));
    const earnedXP = row?.earnedXP !== undefined
      ? Math.floor(Number(row.earnedXP) || 0)
      : Math.max(0, Math.floor(Number(row?.xp) || 0) - startingXP);
    fields.push(
      textField({ name: 'name', label: 'Skill name', value: row?.name, required: true, wide: true }),
      iconPickerField({ label: 'Skill icon', value: row?.icon ?? '' }),
      textField({ name: 'startingXP', label: 'Starting XP', value: startingXP, type: 'number', min: '0', step: '1' }),
      skillEarnedBadge(earnedXP),
      skillTotalBadge(Math.max(0, startingXP + earnedXP)),
      el('p', {
        class: 'field__hint field--wide',
        text: 'Earned XP is read-only and fills in from quest rewards and recorded history. Total XP = Starting XP + Earned XP.',
      }),
    );
  }

  if (type === 'reward') {
    fields.push(
      textField({ name: 'name', label: 'Reward name', value: row?.name, required: true, wide: true }),
      iconPickerField({ label: 'Reward icon', value: row?.icon ?? '' }),
      textField({ name: 'price', label: 'Gold price', value: row?.price ?? 0, type: 'number', min: '0', step: '1' }),
      checkField({ name: 'active', label: 'Available in the shop', checked: row?.active !== false }),
    );
  }

  if (type === 'characterTitle') {
    fields.push(
      textField({ name: 'name', label: 'Title', value: row?.name, required: true, wide: true }),
      textField({ name: 'minLevel', label: 'Unlocks at character level', value: row?.minLevel ?? 0, type: 'number', min: '0', step: '1' }),
      el('p', {
        class: 'field__hint field--wide',
        text: 'The highest title whose trigger level is reached is displayed. The first title always starts at level 0.',
      }),
    );
  }

  if (type === 'coreRank') {
    fields.push(
      textField({ name: 'name', label: 'Rank name', value: row?.name, required: true, wide: true }),
      textField({
        name: 'maxLevel',
        label: 'Maximum stat level',
        value: row?.maxLevel === null || row?.maxLevel === undefined ? '' : row.maxLevel,
        type: 'number',
        min: '0',
        step: '1',
        hint: 'Leave blank for the open-ended final rank.',
      }),
    );
  }

  if (type === 'coreStat') {
    const ranks = [...(row?.ranks ?? [])].sort((a, b) => {
      if (a.maxLevel === null) return 1;
      if (b.maxLevel === null) return -1;
      return Number(a.maxLevel) - Number(b.maxLevel);
    });
    fields.push(
      textField({ name: 'label', label: 'Core Stat label', value: row?.label, required: true }),
      iconPickerField({ label: 'Core Stat icon', value: row?.icon ?? row?.emoji ?? '' }),
      textField({
        name: 'startingXP',
        label: 'Starting XP',
        value: Math.max(0, Math.floor(Number(row?.startingXP) || 0)),
        type: 'number',
        min: '0',
        step: '1',
        hint: 'Total XP = Starting XP + Earned XP. The locked BASE 100 curve sets the level.',
      }),
      el('p', {
        class: 'field__hint field--wide',
        text: `Earned XP: ${formatNumber(Math.floor(Number(row?.earnedXP) || 0))} · Total XP: ${formatNumber(Math.max(0, Math.floor(Number(row?.xp) || 0)))}. ${statKey ? `Editing ${statKey}.` : ''}`,
      }),
      el('p', { class: 'field__hint field--wide', text: 'Rank names and inclusive maximum stat levels. The seventh and final rank is open-ended.' }),
      ...ranks.flatMap((rank, index) => {
        const rankNumber = index + 1;
        const openEnded = rank.maxLevel === null || index === ranks.length - 1;
        return [
          el('input', { type: 'hidden', name: `rankId${index}`, value: rank.id ?? '' }),
          textField({
            name: `rankName${index}`,
            label: `Rank ${rankNumber} name`,
            value: rank.name ?? '',
            required: true,
          }),
          textField({
            name: `rankMax${index}`,
            label: `Rank ${rankNumber} max level`,
            value: openEnded ? '' : rank.maxLevel,
            type: 'number',
            min: '0',
            step: '1',
            hint: openEnded ? 'Open-ended (∞) — leave blank.' : 'Inclusive threshold.',
          }),
        ];
      }),
    );
  }

  return fields;
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export function createCrudSheet({ store, onSaved } = {}) {
  const title = el('h2', { class: 'sheet__title', id: 'crud-sheet-title', text: 'Edit item' });
  const fields = el('div', { class: 'form-grid' });
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn btn--gold', type: 'submit', text: 'Save changes' });
  const form = el(
    'form',
    { class: 'profile-form crud-form', novalidate: 'novalidate' },
    el('input', { type: 'hidden', name: 'type' }),
    el('input', { type: 'hidden', name: 'id' }),
    el('input', { type: 'hidden', name: 'statKey' }),
    fields,
    error,
    el(
      'div',
      { class: 'form-actions' },
      el('button', { class: 'btn btn--ghost', type: 'button', 'data-crud-cancel': '' }, 'Cancel'),
      submit,
    ),
  );

  const deleteName = el('strong', { class: 'crud-delete__name' });
  const deleteView = el(
    'div',
    { class: 'crud-delete', hidden: true },
    el('h3', { class: 'crud-delete__title', text: 'Delete this item?' }),
    el('p', { class: 'crud-delete__copy' }, 'This permanently removes ', deleteName, '. This action cannot be undone.'),
    el(
      'div',
      { class: 'form-actions' },
      el('button', { class: 'btn btn--ghost', type: 'button', 'data-crud-cancel': '' }, 'Cancel'),
      el('button', { class: 'btn btn--danger', type: 'button', 'data-crud-confirm-delete': '' }, 'Delete'),
    ),
  );

  const dialog = el(
    'dialog',
    { class: 'sheet crud-sheet', id: 'crud-sheet', 'aria-labelledby': 'crud-sheet-title' },
    el(
      'div',
      { class: 'sheet__panel' },
      el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'sheet__head' },
        title,
        el('button', {
          class: 'sheet__close',
          type: 'button',
          'data-crud-cancel': '',
          'aria-label': 'Close editor',
          text: '×',
        }),
      ),
      el('div', { class: 'sheet__body' }, form, deleteView),
    ),
  );

  let state = { mode: 'edit', type: null, id: null, statKey: null };

  function close() {
    try {
      dialog.close();
    } catch {
      dialog.removeAttribute('open');
    }
  }

  function openDialog() {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function open({ type, id = '', statKey = '' } = {}) {
    const profile = store.getActiveProfile();
    if (!profile) return false;
    const row = type === 'coreStat' && !id
      ? findRow(profile, type, '', statKey)
      : id
        ? findRow(profile, type, id, statKey)
        : null;
    if ((id || type === 'coreStat') && !row) return false;

    state = { mode: 'edit', type, id: String(id ?? ''), statKey: String(statKey ?? '') };
    form.hidden = false;
    deleteView.hidden = true;
    error.hidden = true;
    error.textContent = '';

    form.elements.type.value = type;
    form.elements.id.value = state.id;
    form.elements.statKey.value = state.statKey;

    const label = type === 'coreStat' ? 'Core Stat' : (TYPE_LABELS[type] ?? 'Item');
    const editing = Boolean(state.id) || type === 'coreStat';
    title.textContent = editing ? `Edit ${label}` : `Add ${label}`;
    submit.textContent = editing ? 'Save changes' : `Add ${label.toLowerCase()}`;

    clear(fields);
    for (const field of buildFields({ type, row, profile, statKey })) fields.append(field);

    const focusable = form.querySelector('input[name="name"]');
    openDialog();
    window.setTimeout(() => focusable?.focus({ preventScroll: true }), 40);
    return true;
  }

  function openDelete({ type, id, name = '' } = {}) {
    const profile = store.getActiveProfile();
    const row = findRow(profile, type, id);
    if (!row) return false;

    state = { mode: 'delete', type, id: String(id), statKey: '' };
    form.hidden = true;
    deleteView.hidden = false;
    error.hidden = true;
    title.textContent = `Delete ${TYPE_LABELS[type] ?? 'item'}`;
    deleteName.textContent = name || row.name || id;
    openDialog();
    window.setTimeout(() => dialog.querySelector('[data-crud-confirm-delete]')?.focus({ preventScroll: true }), 40);
    return true;
  }

  function numberOrNull(data, key) {
    const raw = data.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function buildPayload(type, data) {
    const checked = (name) => data.get(name) === 'on';
    const base = {
      id: String(data.get('id') ?? ''),
      statKey: String(data.get('statKey') ?? ''),
    };

    switch (type) {
      case 'dailyQuest':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          icon: String(data.get('icon') ?? ''),
          coins: Number(data.get('coins') ?? 0),
          penaltyCoreStat: String(data.get('penaltyCoreStat') ?? ''),
          penaltyCoreXp: Number(data.get('penaltyCoreXp') ?? 0),
          penaltyCoreStat2: String(data.get('penaltyCoreStat2') ?? ''),
          penaltyCoreXp2: Number(data.get('penaltyCoreXp2') ?? 0),
          penaltyCoins: Number(data.get('penaltyCoins') ?? 0),
          physicalPenalty: String(data.get('physicalPenalty') ?? ''),
          coreStat1: String(data.get('coreStat1') ?? ''),
          coreXp1: Number(data.get('coreXp1') ?? 0),
          coreStat2: String(data.get('coreStat2') ?? ''),
          coreXp2: Number(data.get('coreXp2') ?? 0),
          skill1: String(data.get('skill1') ?? ''),
          skillXp1: Number(data.get('skillXp1') ?? 0),
          skill2: String(data.get('skill2') ?? ''),
          skillXp2: Number(data.get('skillXp2') ?? 0),
          strict: checked('strict'),
          active: checked('active'),
        };
      case 'badHabit':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          emoji: String(data.get('emoji') ?? ''),
          icon: String(data.get('icon') ?? ''),
          penaltyCoreStat: String(data.get('penaltyCoreStat') ?? ''),
          penaltyCoreXp: Number(data.get('penaltyCoreXp') ?? 0),
          penaltyCoins: Number(data.get('penaltyCoins') ?? 0),
          active: checked('active'),
        };
      case 'sideQuest':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          type: String(data.get('type') ?? 'side'),
          icon: String(data.get('icon') ?? ''),
          coins: Number(data.get('coins') ?? 0),
          coreStat1: String(data.get('coreStat1') ?? ''),
          coreXp1: Number(data.get('coreXp1') ?? 0),
          coreStat2: String(data.get('coreStat2') ?? ''),
          coreXp2: Number(data.get('coreXp2') ?? 0),
          skill1: String(data.get('skill1') ?? ''),
          skillXp1: Number(data.get('skillXp1') ?? 0),
          skill2: String(data.get('skill2') ?? ''),
          skillXp2: Number(data.get('skillXp2') ?? 0),
          message: String(data.get('message') ?? ''),
          repeatable: checked('repeatable'),
          active: checked('active'),
        };
      case 'mission':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          goalId: String(data.get('goalId') ?? ''),
          status: String(data.get('status') ?? 'not-started'),
          startDate: String(data.get('startDate') ?? ''),
          endDate: String(data.get('endDate') ?? ''),
          xp: numberOrNull(data, 'xp'),
          coins: numberOrNull(data, 'coins'),
          progressPercent: Number(data.get('progressPercent') ?? 0),
          tasksText: String(data.get('tasksText') ?? ''),
        };
      case 'goal':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          status: String(data.get('status') ?? 'active'),
          startDate: String(data.get('startDate') ?? ''),
          endDate: String(data.get('endDate') ?? ''),
          xp: numberOrNull(data, 'xp'),
          coins: numberOrNull(data, 'coins'),
          progressPercent: Number(data.get('progressPercent') ?? 0),
          missionIds: data.getAll('missionIds').map((id) => String(id)),
        };
      case 'skill':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          icon: String(data.get('icon') ?? ''),
          startingXP: Number(data.get('startingXP') ?? 0),
          active: checked('active'),
        };
      case 'reward':
        return {
          ...base,
          name: String(data.get('name') ?? ''),
          icon: String(data.get('icon') ?? ''),
          price: Number(data.get('price') ?? 0),
          active: checked('active'),
        };
      case 'characterTitle':
        return {
          id: base.id,
          name: String(data.get('name') ?? ''),
          minLevel: Number(data.get('minLevel') ?? 0),
        };
      case 'coreRank':
        return {
          statKey: base.statKey,
          id: base.id,
          name: String(data.get('name') ?? ''),
          maxLevel: numberOrNull(data, 'maxLevel'),
        };
      case 'coreStat': {
        const ranks = [];
        for (let index = 0; index < 7; index += 1) {
          const name = String(data.get(`rankName${index}`) ?? '').trim();
          if (!name) continue;
          const rawMax = data.get(`rankMax${index}`);
          ranks.push({
            id: String(data.get(`rankId${index}`) ?? ''),
            name,
            maxLevel: rawMax === null || rawMax === '' ? null : Number(rawMax),
          });
        }
        return {
          statKey: base.statKey,
          label: String(data.get('label') ?? ''),
          icon: String(data.get('icon') ?? ''),
          startingXP: Number(data.get('startingXP') ?? 0),
          ranks,
        };
      }
      default:
        return null;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.mode !== 'edit') return;
    const data = new FormData(form);
    const payload = buildPayload(state.type, data);
    if (!payload) {
      showError('This editor is not available.');
      return;
    }

    try {
      const result = store.crudUpsert(state.type, payload);
      close();
      if (typeof onSaved === 'function') onSaved(result, 'saved');
    } catch (saveError) {
      showError(saveError?.message || 'Could not save this item.');
    }
  });

  // Live read-only badges: Auto Character XP and Skill Total XP.
  dialog.addEventListener('input', () => {
    if (state.mode !== 'edit' || !form.isConnected) return;
    const data = new FormData(form);
    const auto = ['coreXp1', 'coreXp2', 'skillXp1', 'skillXp2']
      .reduce((sum, name) => sum + Math.max(0, Math.floor(Number(data.get(name) ?? 0) || 0)), 0);
    const autoBadge = form.querySelector('[data-auto-xp-value]');
    if (autoBadge) autoBadge.textContent = `+${formatNumber(auto)} XP`;

    const totalBadge = form.querySelector('[data-skill-total-value]');
    if (totalBadge) {
      const starting = Math.max(0, Math.floor(Number(data.get('startingXP') ?? 0) || 0));
      const earned = Math.floor(Number(form.querySelector('[data-skill-earned]')?.dataset.earnedXp ?? 0) || 0);
      totalBadge.textContent = `${formatNumber(Math.max(0, starting + earned))} XP`;
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      close();
      return;
    }
    if (event.target.closest('[data-crud-cancel]')) {
      close();
      return;
    }
    if (event.target.closest('[data-crud-confirm-delete]')) {
      try {
        const result = store.crudDelete(state.type, state.id);
        close();
        if (typeof onSaved === 'function') onSaved(result, 'deleted');
      } catch (deleteError) {
        showError(deleteError?.message || 'Could not delete this item.');
      }
    }
  });

  dialog.addEventListener('close', () => {
    form.reset();
    error.hidden = true;
    form.hidden = false;
    deleteView.hidden = true;
  });

  return { element: dialog, open, openDelete, close };
}
