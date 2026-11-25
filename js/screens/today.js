/**
 * Today — the M3 daily loop.
 *
 * Interactive presentation only: every action is delegated to the store via
 * `data-action` attributes handled in `app.js`. Pure data comes from
 * `core/daily.js`, so this file stays a renderer.
 */

import { el, iconNode, img } from '../ui/dom.js';
import { formatNumber } from '../core/formulas.js';
import { profileView } from '../core/profile.js';
import {
  JOURNAL_MOODS,
  dailySummary,
  isHealingQuest,
  isHealthQuest,
  questPenalty,
  questReward,
  questStatus,
} from '../core/daily.js';
import { screenShell, panel, statTile, crudMenu, crudAddButton, panelToolbar, goldAmount, inlineList } from './shared.js';

function dateLabel(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now);
  } catch {
    return 'Today';
  }
}

function rewardText(quest, profile) {
  const reward = questReward(quest);
  const parts = [];
  if (reward.autoXp) parts.push(`+${formatNumber(reward.autoXp)} XP`);
  if (reward.coins) parts.push(goldAmount(reward.coins, { sign: '+' }));
  for (const entry of reward.coreRewards) {
    const track = profile?.rankTracks?.[entry.stat];
    parts.push(`+${formatNumber(entry.xp)} ${track?.label ?? entry.stat}`);
  }
  for (const entry of reward.skillRewards) {
    const skill = (profile?.skills ?? []).find(
      (row) => row.id === entry.skill || row.name === entry.skill,
    );
    parts.push(`+${formatNumber(entry.xp)} ${skill?.name ?? entry.skill}`);
  }
  return parts.length ? inlineList(parts) : 'No reward';
}

function questCostText(quest, profile, strict, restDay = false) {
  if (restDay) return 'Rest day: no XP, Gold or HP penalty today.';
  const penalty = questPenalty(quest, profile.settings);
  const parts = [];
  if (penalty.coins) parts.push(`−${formatNumber(penalty.coins)} G`);
  if (penalty.xp) parts.push(`−${formatNumber(penalty.xp)} XP`);
  if (penalty.coreTargets?.length) {
    for (const target of penalty.coreTargets) {
      const track = profile?.rankTracks?.[target.stat];
      parts.push(`−${formatNumber(target.xp)} ${track?.label ?? target.stat} XP`);
    }
  } else if (penalty.coreStat && penalty.coreXp) {
    const track = profile?.rankTracks?.[penalty.coreStat];
    parts.push(`−${formatNumber(penalty.coreXp)} ${track?.label ?? penalty.coreStat} XP`);
  }
  if (strict && isHealthQuest(quest) && penalty.hpDamage) {
    parts.push(`−${formatNumber(penalty.hpDamage)} HP`);
  }
  parts.push(penalty.physical);
  return parts.join(' · ');
}

function strictSwitch({ checked, action, questId = null, mini = false, label = '' }) {
  const button = el(
    'button',
    {
      class: `switch ${mini ? 'switch--mini' : ''}`.trim(),
      type: 'button',
      role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'data-action': action,
      'aria-label': label || (checked ? 'Turn Strict off' : 'Turn Strict on'),
    },
    el('span', { class: 'switch__track', 'aria-hidden': 'true' }, el('span', { class: 'switch__thumb' })),
    el('span', { class: 'switch__label', text: mini ? 'Strict' : checked ? 'Strict on' : 'Strict off' }),
  );
  if (questId) button.dataset.questId = questId;
  return button;
}

function questCard(quest, profile, summary) {
  const state = questStatus(quest);
  const healing = isHealingQuest(quest);
  const locked = summary.recovery && !healing;
  const strict = quest.strict === true;
  const penalty = summary.restDay
    ? { xp: 0, coins: 0, hpDamage: 0, physical: 'Rest day: no penalty today.' }
    : questPenalty(quest, profile.settings);
  const skipTokens = Math.max(0, Number(profile.tokens?.skipQuest) || 0);
  const badge = state === 'completed'
    ? el('span', { class: 'chip chip--done', text: '✓ Done' })
    : state === 'skipped'
      ? el('span', { class: 'chip chip--danger', text: 'Skipped' })
      : null;

  const actions = state === 'pending'
    ? el(
        'div',
        { class: 'quest-card__actions' },
        el(
          'button',
          {
            class: 'btn btn--gold btn--compact',
            type: 'button',
            'data-action': 'complete-quest',
            disabled: locked ? true : null,
            title: locked ? 'Recovery mode: only healing/rest quests are available' : undefined,
          },
          'Complete',
        ),
        el(
          'button',
          {
            class: 'btn btn--ghost btn--compact btn--danger-text',
            type: 'button',
            'data-action': 'skip-quest',
            disabled: locked ? true : null,
            title: locked
              ? 'Recovery mode: skip is locked until HP is above 0'
              : `Skip instantly · ${questCostText(quest, profile, strict, summary.restDay)}`,
          },
          'Skip',
        ),
        skipTokens > 0
          ? el(
              'button',
              {
                class: 'btn btn--ghost btn--compact',
                type: 'button',
                'data-action': 'use-skip-token',
                title: 'Spend one shop skip token: no XP, Gold or HP penalty',
              },
              `Use token · ${skipTokens}`,
            )
          : null,
      )
    : el(
        'div',
        { class: 'quest-card__actions' },
        state === 'completed'
          ? el('span', { class: 'quest-card__result quest-card__result--done', text: 'Reward collected' })
          : el('span', { class: 'quest-card__result quest-card__result--skip', text: `Penalty: ${penalty.physical}` }),
        quest.lastAction
          ? el(
              'button',
              { class: 'btn btn--ghost btn--compact', type: 'button', 'data-action': 'undo-quest' },
              'Undo',
            )
          : null,
      );

  const card = el(
    'article',
    {
      class: 'quest-card',
      dataset: { questCard: '', questId: quest.id, state },
      'aria-label': `${quest.name}: ${state}`,
    },
    el(
      'div',
      { class: 'quest-card__head' },
      el(
        'span',
        { class: 'quest-card__icon', 'aria-hidden': 'true' },
        iconNode(quest.icon, { fallback: '✦' }),
      ),
      el(
        'div',
        { class: 'quest-card__id' },
        el(
          'div',
          { class: 'quest-card__title-row' },
          el('h3', { class: 'quest-card__name', text: quest.name }),
          badge,
        ),
        el('p', { class: 'quest-card__reward' }, rewardText(quest, profile)),
        el('p', {
          class: 'quest-card__meta',
          text: 'Daily quest · resets at midnight',
        }),
      ),
      el(
        'div',
        { class: 'quest-card__tools' },
        strictSwitch({
          checked: strict,
          action: 'toggle-quest-strict',
          questId: quest.id,
          mini: true,
          label: `${quest.name} Strict mode`,
        }),
        crudMenu('dailyQuest', quest.id, quest.name, { className: 'crud-menu--card' }),
      ),
    ),
    locked
      ? el('p', {
          class: 'quest-card__lock',
          text: '🔒 Recovery mode — complete a healing quest to unlock this action.',
        })
      : null,
    actions,
  );

  return card;
}

function habitCard(habit, today, profile) {
  const clean = habit.lastLoggedDate !== today;
  const icon = habit.icon
    ? img(habit.icon, '')
    : el('span', { text: habit.emoji ?? '⚠️' });
  const penalty = habit.penalty && typeof habit.penalty === 'object' ? habit.penalty : {};
  const lossParts = [];
  if (penalty.coreStat && Number(penalty.coreXp) > 0) {
    const track = profile?.rankTracks?.[penalty.coreStat];
    lossParts.push(`−${formatNumber(penalty.coreXp)} ${track?.label ?? penalty.coreStat} XP`);
  }
  if (Number(penalty.coins) > 0) lossParts.push(`−${formatNumber(penalty.coins)} G`);
  const penaltySummary = lossParts.length
    ? `${lossParts.join(' · ')} per relapse`
    : 'Relapse logged · 0 penalty';

  return el(
    'article',
    {
      class: 'habit-card',
      dataset: { habitCard: '', habitId: habit.id, state: clean ? 'clean' : 'logged' },
    },
    el(
      'div',
      { class: 'habit-card__head' },
      el('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, icon),
      el(
        'div',
        { class: 'habit-card__body' },
        el(
          'div',
          { class: 'habit-card__title-row' },
          el('h3', { class: 'habit-card__name', text: habit.name }),
          clean
            ? el('span', { class: 'chip chip--done', text: '✓ Restraint' })
            : el('span', { class: 'chip chip--danger', text: 'Logged today' }),
          crudMenu('badHabit', habit.id, habit.name, { className: 'crud-menu--card' }),
        ),
        el('p', {
          class: 'habit-card__meta',
          text: `${penaltySummary} · ${formatNumber(habit.logCount)} logged all-time`,
        }),
      ),
    ),
    el(
      'div',
      { class: 'habit-card__actions' },
      el(
        'button',
        {
          class: 'btn btn--ghost btn--compact btn--danger-text',
          type: 'button',
          'data-action': 'log-habit',
          'data-habit-id': habit.id,
          disabled: clean ? null : true,
          title: clean ? undefined : 'Already logged today',
        },
        clean ? 'Log relapse' : 'Logged',
      ),
      habit.lastAction
        ? el(
            'button',
            {
              class: 'btn btn--ghost btn--compact',
              type: 'button',
              'data-action': 'undo-habit',
              'data-habit-id': habit.id,
            },
            'Undo',
          )
        : null,
    ),
  );
}

function journalPanel(summary) {
  const entry = summary.journal;
  const config = summary.journalConfig;

  const moodPicker = el(
    'fieldset',
    { class: 'mood-picker' },
    el('legend', { class: 'field__label', text: 'Mood' }),
    el(
      'div',
      { class: 'mood-picker__row' },
      JOURNAL_MOODS.map((mood) =>
        el(
          'label',
          { class: 'mood-option' },
          el('input', {
            type: 'radio',
            name: 'mood',
            value: mood.id,
            checked: (entry?.mood ?? 'okay') === mood.id ? true : null,
          }),
          el(
            'span',
            { class: 'mood-option__body' },
            el('span', { class: 'mood-option__emoji', text: mood.emoji, 'aria-hidden': 'true' }),
            el('span', { class: 'mood-option__label', text: mood.label }),
          ),
        ),
      ),
    ),
  );

  const textField = (name, label, placeholder, value) =>
    el(
      'label',
      { class: 'journal-field' },
      el('span', { class: 'field__label', text: label }),
      el('textarea', {
        name,
        rows: '2',
        maxlength: '600',
        placeholder,
      }, value ?? ''),
    );

  const form = el(
    'form',
    { class: 'journal-form', dataset: { journalForm: '' }, novalidate: 'novalidate' },
    moodPicker,
    textField('wins', 'Wins', 'What went well today?', entry?.wins),
    textField('lessons', 'Lessons', 'What did today teach you?', entry?.lessons),
    textField('gratitude', 'Gratitude', 'What are you grateful for?', entry?.gratitude),
    textField('freeText', 'Notes', 'Anything else on your mind?', entry?.freeText),
    el(
      'div',
      { class: 'journal-form__foot' },
      el(
        'button',
        { class: 'btn btn--gold btn--block', type: 'submit' },
        entry
          ? 'Update reflection'
          : `Save reflection · +${config.xp} Mind XP · +${config.coins} Gold`,
      ),
    ),
  );

  return panel({
    title: 'Daily reflection',
    meta: entry ? 'Saved today' : `+${config.xp} Mind XP · +${config.coins} Gold`,
    children: [
      el('p', {
        class: 'panel__copy',
        text: entry
          ? 'Today is already paid. Editing your reflection will not award the bonus twice.'
          : 'One entry per local day. The first save awards Character XP, Mind Core XP and Gold; later edits are free.',
      }),
      entry
        ? el(
            'div',
            { class: 'journal-receipt' },
            el('span', { class: 'chip chip--done', text: '✓ Saved today' }),
            el('span', {
              class: 'chip chip--muted',
              text: `+${config.xp} Mind XP · +${config.coins} Gold already paid`,
            }),
            el(
              'button',
              {
                class: 'btn btn--ghost btn--compact',
                type: 'button',
                'data-action': 'undo-journal',
              },
              'Undo today’s payout',
            ),
          )
        : null,
      form,
    ],
  });
}

export function renderToday({ profile }) {
  const view = profileView(profile);
  const summary = dailySummary(profile);
  const pendingGold = summary.quests
    .filter((quest) => !quest.completed && !quest.skipped)
    .reduce((sum, quest) => sum + Number(quest.coins || 0), 0);

  const heroDescription = summary.recovery
    ? 'HP is at 0. Recovery mode is active: heal with Running or Sleep before anything else.'
    : `${summary.completed} of ${summary.total} quests complete${summary.skipped ? `, ${summary.skipped} skipped` : ''}. ${summary.strictCount ? `${summary.strictCount} on Strict.` : 'Normal mode.'}`;

  return screenShell({
    id: 'today',
    eyebrow: dateLabel(),
    title: 'Today',
    description: heroDescription,
    children: [
      summary.recovery
        ? el(
            'div',
            { class: 'recovery-banner', role: 'alert' },
            el('span', { class: 'recovery-banner__icon', text: '💀', 'aria-hidden': 'true' }),
            el(
              'div',
              { class: 'recovery-banner__body' },
              el('strong', { text: 'Recovery mode' }),
              el('p', {
                text: 'Current HP is 0. Only healing or rest quests are available until HP is restored above 0.',
              }),
            ),
          )
        : null,
      summary.restDay
        ? el(
            'div',
            { class: 'rest-day-banner', role: 'status' },
            el('span', { class: 'rest-day-banner__icon', text: '🛌', 'aria-hidden': 'true' }),
            el(
              'div',
              { class: 'rest-day-banner__body' },
              el('strong', { text: 'Rest day active' }),
              el('p', {
                text: 'A Day-off reward is protecting today: skips and midnight rollover apply no XP, Gold or HP penalties.',
              }),
            ),
          )
        : null,
      el(
        'div',
        { class: 'grid grid--4' },
        statTile({
          icon: '☀️',
          label: 'Quests done',
          value: `${summary.completed} / ${summary.total}`,
          hint: `${summary.pending} remaining${summary.skipped ? ` · ${summary.skipped} skipped` : ''}`,
        }),
        statTile({
          icon: summary.hp.key === 'recovery' ? '💀' : summary.hp.key === 'healthy' ? '❤️' : '🩹',
          label: 'Real-life HP',
          value: `${formatNumber(summary.hpBefore)} / ${formatNumber(summary.hpMax)}`,
          hint: summary.hp.label,
          tone: summary.hp.key === 'healthy' ? 'gold' : 'danger',
        }),
        statTile({
          iconContent: el('span', { class: 'coin-emblem' }),
          label: 'Gold coins',
          value: formatNumber(view.gold),
          hint: `Up to +${formatNumber(pendingGold)} Gold from today's quests`,
          tone: 'muted',
        }),
        statTile({
          icon: '🛡️',
          label: 'Restraint',
          value: `${summary.habitsClean} / ${summary.habitsTotal}`,
          hint: 'Bad habits clean today',
        }),
      ),
      panel({
        title: 'Strict mode',
        meta: summary.allStrict ? 'Strict all on' : `${summary.strictCount} strict`,
        children: [
          el(
            'div',
            { class: 'strict-row' },
            el(
              'div',
              { class: 'strict-row__copy' },
              el('strong', { text: 'Strict All Daily Quests' }),
              el('p', {
                text: 'At local midnight, every unmarked Strict quest auto-skips once and applies its penalty. Individual quest switches stay independent.',
              }),
            ),
            strictSwitch({
              checked: summary.allStrict,
              action: 'toggle-strict-all',
              label: 'Strict All Daily Quests',
            }),
          ),
          el(
            'div',
            { class: 'strict-meta' },
            el('span', {
              text: `${summary.strictCount} of ${summary.total} quests strict`,
            }),
            el('span', { class: 'strict-meta__countdown', dataset: { midnight: '' } }),
          ),
          el('p', {
            class: 'panel__note',
            text: 'Reset is idempotent and keyed to your local date (YYYY-MM-DD). Reopening the app never double-applies a skip or penalty.',
          }),
        ],
      }),
      panel({
        title: 'Daily quests',
        meta: `${summary.completed} / ${summary.total}`,
        children: [
          panelToolbar(crudAddButton('dailyQuest', 'Add quest')),
          el(
            'div',
            { class: 'quest-list' },
            summary.quests.map((quest) => questCard(quest, profile, summary)),
          ),
          el('p', {
            class: 'panel__note',
            text: 'Tap Complete for rewards, or Skip to take the Coin/Core XP penalty and a real-world consequence. Strict health quests also cost HP. Every action is undoable.',
          }),
        ],
      }),
      panel({
        title: 'Bad habits',
        meta: `${summary.habitsClean} / ${summary.habitsTotal} clean`,
        children: [
          panelToolbar(crudAddButton('badHabit', 'Add habit')),
          summary.habitsTotal > 0 && summary.habitsClean === summary.habitsTotal
            ? el(
                'div',
                { class: 'restraint-note' },
                el('span', { text: '🛡️', 'aria-hidden': 'true' }),
                el('span', { text: 'Full restraint today — every bad habit stayed unlogged. Keep the streak alive.' }),
              )
            : el('p', {
                class: 'panel__copy',
                text: 'Logging a relapse deals HP damage immediately. Every habit you leave unlogged is a win for your restraint.',
              }),
          el(
            'div',
            { class: 'habit-list' },
            summary.habits.map((habit) => habitCard(habit, summary.date, profile)),
          ),
          el('p', {
            class: 'panel__note',
            text: 'Bad habits never award XP or Gold. Undo is available immediately after a relapse.',
          }),
        ],
      }),
      journalPanel(summary),
    ],
  });
}
