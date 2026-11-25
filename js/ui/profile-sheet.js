/**
 * Profile switcher + "Create New Profile" bottom sheet.
 * Uses the native <dialog> element so focus trapping and Escape are free.
 */

import { el, img, clear } from './dom.js';
import { AVATAR_OPTIONS, profileView } from '../core/profile.js';
import {
  ageFromBirthday,
  baseLifespan,
  formatNumber,
  isValidDateKey,
  localDateKey,
} from '../core/formulas.js';
import { showToast } from './toast.js';

function miniAvatar(view, className = 'mini-avatar') {
  return el(
    'span',
    { class: className, 'aria-hidden': 'true' },
    view.avatar
      ? img(view.avatar, '')
      : el('span', { class: 'mini-avatar__initials', text: view.initials }),
  );
}

function field(labelText, control, hint) {
  const id = control.id || `field-${labelText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  control.id = id;
  return el(
    'label',
    { class: 'field', for: id },
    el('span', { class: 'field__label', text: labelText }),
    control,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  );
}

export function createProfileSheet({ store, onCreated, onSwitch, onChanged } = {}) {
  const listBody = el('div', { class: 'profile-list' });
  const heading = el('h2', { class: 'sheet__title', id: 'profile-sheet-title', text: 'Profiles' });
  const listView = el(
    'section',
    { class: 'sheet__view', dataset: { view: 'list' } },
    el('p', {
      class: 'sheet__lede',
      text: 'Choose who is playing. Every profile keeps its own XP, HP, Gold and finance history.',
    }),
    listBody,
    el(
      'button',
      {
        class: 'btn btn--gold btn--block',
        type: 'button',
        'data-view': 'create',
      },
      '＋ Create New Profile',
    ),
    el('p', {
      class: 'sheet__footnote',
      text: 'Profiles are stored offline on this device. Use Export JSON Save in Settings to back them up.',
    }),
  );

  const nameInput = el('input', {
    name: 'name',
    type: 'text',
    maxlength: '32',
    placeholder: 'e.g. Alex',
    required: 'required',
    autocomplete: 'off',
  });
  const birthdayInput = el('input', {
    name: 'birthday',
    type: 'date',
    value: '2001-05-15',
    max: localDateKey(new Date()),
  });
  const birthdaySummary = el('p', {
    class: 'field__hint birthday-summary',
    'aria-live': 'polite',
  });

  function updateBirthdaySummary() {
    const birthday = String(birthdayInput.value ?? '').trim();
    const age = isValidDateKey(birthday) ? ageFromBirthday(birthday) : null;
    if (age === null) {
      birthdaySummary.textContent = 'Enter a valid birthday to calculate your age.';
      return;
    }
    birthdaySummary.textContent = `Age ${age} · Lifespan HP: ${formatNumber(baseLifespan(age))} / 1,000`;
  }

  birthdayInput.addEventListener('input', updateBirthdaySummary);
  birthdayInput.addEventListener('change', updateBirthdaySummary);
  updateBirthdaySummary();

  const avatarChoices = AVATAR_OPTIONS.map((option, index) =>
    el(
      'label',
      { class: 'avatar-choice' },
      el('input', {
        type: 'radio',
        name: 'avatar',
        value: option.src,
        checked: index === 0 ? 'checked' : null,
      }),
      el(
        'span',
        { class: 'avatar-choice__body' },
        img(option.src, ''),
        el(
          'span',
          { class: 'avatar-choice__copy' },
          el('span', { class: 'avatar-choice__name', text: option.label }),
          el('span', { class: 'avatar-choice__hint', text: option.blurb }),
        ),
      ),
    ),
  );

  const dailyTemplate = el('input', { type: 'checkbox', name: 'daily' });
  const rewardsTemplate = el('input', { type: 'checkbox', name: 'rewards' });

  const error = el('p', { class: 'form-error', role: 'alert', hidden: 'hidden' });
  const form = el(
    'form',
    { class: 'profile-form', novalidate: 'novalidate' },
    field('Name', nameInput, 'This is your RPG name, up to 32 characters.'),
    field(
      'Birthday',
      birthdayInput,
      'Stored only on this device to calculate your age and update your Lifespan HP automatically on your birthday.',
    ),
    birthdaySummary,
    el(
      'fieldset',
      { class: 'field field--fieldset' },
      el('legend', { class: 'field__label', text: 'Avatar' }),
      el('div', { class: 'avatar-picker' }, ...avatarChoices),
    ),
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Starter templates' }),
      el(
        'label',
        { class: 'check-row' },
        dailyTemplate,
        el(
          'span',
          {},
          el('strong', { text: 'Daily quests' }),
          el('small', { text: '8 starter quests, Normal mode by default.' }),
        ),
      ),
      el(
        'label',
        { class: 'check-row' },
        rewardsTemplate,
        el(
          'span',
          {},
          el('strong', { text: 'Rewards shop' }),
          el('small', { text: '13 starter rewards ready to redeem with Gold.' }),
        ),
      ),
    ),
    error,
    el(
      'div',
      { class: 'form-actions' },
      el('button', { class: 'btn btn--ghost', type: 'button', 'data-view': 'list' }, 'Cancel'),
      el('button', { class: 'btn btn--gold', type: 'submit' }, 'Create Profile'),
    ),
  );

  const createView = el(
    'section',
    { class: 'sheet__view', dataset: { view: 'create' }, hidden: 'hidden' },
    el('p', {
      class: 'sheet__lede',
      text: 'New profiles start from scratch: level 0, 0 Gold and an empty ledger.',
    }),
    form,
  );

  const panel = el(
    'div',
    { class: 'sheet__panel' },
    el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'sheet__head' },
      heading,
      el(
        'button',
        { class: 'sheet__close', type: 'button', 'data-close': 'true', 'aria-label': 'Close profiles' },
        '✕',
      ),
    ),
    el('div', { class: 'sheet__body' }, listView, createView),
  );

  const dialog = el(
    'dialog',
    { class: 'sheet', id: 'profile-sheet', 'aria-labelledby': 'profile-sheet-title' },
    panel,
  );

  function showView(name) {
    const isCreate = name === 'create';
    listView.hidden = isCreate;
    createView.hidden = !isCreate;
    heading.textContent = isCreate ? 'Create Profile' : 'Profiles';
    error.hidden = true;
    error.textContent = '';
    if (isCreate) {
      updateBirthdaySummary();
      window.setTimeout(() => nameInput.focus(), 40);
    }
  }

  function renderList() {
    clear(listBody);
    const profiles = store.getProfiles();
    const activeId = store.getActiveId();

    for (const profile of profiles) {
      const view = profileView(profile);
      const active = profile.id === activeId;
      const editorId = `profile-avatar-editor-${profile.id}`;

      const main = el(
        'button',
        {
          class: 'profile-row__main',
          type: 'button',
          'aria-pressed': active ? 'true' : 'false',
        },
        miniAvatar(view, 'profile-row__avatar'),
        el(
          'span',
          { class: 'profile-row__body' },
          el('span', { class: 'profile-row__name', text: view.name }),
          el('span', {
            class: 'profile-row__meta',
            text: `Lv ${view.level} · ${view.title} · ${formatNumber(view.gold)} Gold`,
          }),
        ),
        active
          ? el('span', { class: 'profile-row__badge', text: 'Active' })
          : el('span', { class: 'profile-row__chevron', text: '›', 'aria-hidden': 'true' }),
      );

      main.addEventListener('click', () => {
        try {
          if (!active) {
            store.setActiveProfile(profile.id);
            showToast(`Switched to ${profile.name}`, { tone: 'ok' });
          }
          dialog.close();
          if (typeof onSwitch === 'function') onSwitch(profile.id);
        } catch (switchError) {
          showToast(switchError?.message || 'Could not switch profiles.', { tone: 'warn' });
        }
      });

      const toggle = el('button', {
        class: 'profile-row__menu-toggle',
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': editorId,
        'aria-label': `Edit avatar for ${view.name}`,
        title: 'Edit avatar',
        text: '⋮',
      });

      const editor = el(
        'div',
        { class: 'profile-avatar-editor', id: editorId, hidden: 'hidden' },
        el('span', { class: 'profile-avatar-editor__label', text: 'Edit avatar' }),
        el(
          'div',
          { class: 'profile-avatar-editor__grid' },
          AVATAR_OPTIONS.map((option) => {
            const selected = profile.avatar === option.src;
            const choice = el(
              'button',
              {
                class: `profile-avatar-choice${selected ? ' is-selected' : ''}`.trim(),
                type: 'button',
                'aria-pressed': selected ? 'true' : 'false',
                'aria-label': `Use ${option.label} avatar`,
                'data-avatar-src': option.src,
              },
              img(option.src, ''),
              el('span', { class: 'profile-avatar-choice__name', text: option.label }),
            );
            choice.addEventListener('click', () => {
              if (profile.avatar === option.src) return;
              try {
                store.updateAvatar(profile.id, option.src);
                showToast(`Avatar updated to ${option.label}`, { tone: 'ok' });
                renderList();
                if (typeof onChanged === 'function') onChanged(profile.id);
              } catch (avatarError) {
                showToast(avatarError?.message || 'Could not update the avatar.', { tone: 'warn' });
              }
            });
            return choice;
          }),
        ),
      );

      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        for (const other of listBody.querySelectorAll('.profile-avatar-editor')) {
          if (other !== editor) other.hidden = true;
        }
        for (const other of listBody.querySelectorAll('.profile-row__menu-toggle')) {
          if (other !== toggle) other.setAttribute('aria-expanded', 'false');
        }
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        editor.hidden = open;
      });

      const row = el(
        'div',
        { class: `profile-row${active ? ' is-active' : ''}`.trim(), 'data-profile-id': profile.id },
        main,
        toggle,
        editor,
      );

      listBody.append(row);
    }
  }

  function open() {
    renderList();
    showView('list');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  dialog.addEventListener('click', (event) => {
    const target = event.target;
    if (target === dialog) {
      close();
      return;
    }
    if (target.closest('[data-close]')) {
      close();
      return;
    }
    const viewButton = target.closest('[data-view]');
    if (viewButton) {
      showView(viewButton.dataset.view);
    }
  });

  dialog.addEventListener('close', () => {
    form.reset();
    showView('list');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();

    if (!name) {
      error.textContent = 'Please enter a profile name.';
      error.hidden = false;
      nameInput.focus();
      return;
    }

    const birthday = String(data.get('birthday') ?? '').trim();
    const age = isValidDateKey(birthday) ? ageFromBirthday(birthday) : null;
    if (age === null || age < 0 || age > 85) {
      error.textContent = 'Enter a valid birthday between 0 and 85 years ago.';
      error.hidden = false;
      birthdayInput.focus();
      return;
    }

    try {
      const created = store.createProfile({
        name,
        birthday,
        avatar: String(data.get('avatar') ?? ''),
        includeDailyQuestTemplate: data.get('daily') === 'on',
        includeRewardTemplate: data.get('rewards') === 'on',
      });
      close();
      showToast(`Profile “${created.name}” created`, { tone: 'ok' });
      if (typeof onCreated === 'function') onCreated(created);
    } catch (createError) {
      error.textContent = createError?.message || 'Could not create the profile.';
      error.hidden = false;
    }
  });

  return { element: dialog, open, close, renderList };
}
