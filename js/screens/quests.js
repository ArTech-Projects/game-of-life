/**
 * Quests & Roadmap — M4.
 *
 * Side/Secret quests with All/Side/Secret filters, mission cards grouped under
 * their goals, automatic goal progress and undoable payouts. Every mutation is
 * delegated to the store through `data-action` attributes handled in app.js.
 */

import { el, iconNode, progressBar } from '../ui/dom.js';
import { formatNumber } from '../core/formulas.js';
import {
  goalProgress,
  goalReward,
  linkedMissions,
  missionReward,
  progressionSummary,
} from '../core/progression.js';
import { screenShell, panel, statTile, crudActions, crudMenu, crudAddButton, panelToolbar, goldAmount, inlineList } from './shared.js';

const FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'side', label: 'Side' }),
  Object.freeze({ id: 'secret', label: 'Secret' }),
]);

let activeFilter = 'all';

function normalizeFilter(value) {
  return FILTERS.some((filter) => filter.id === value) ? value : 'all';
}

export function setQuestFilter(value) {
  activeFilter = normalizeFilter(value);
  return activeFilter;
}

export function currentQuestFilter() {
  return activeFilter;
}

/** Toggle the filter without a full rerender. */
export function applyQuestFilter(root, filter) {
  const next = setQuestFilter(filter);
  if (!root?.querySelectorAll) return next;

  for (const button of root.querySelectorAll('[data-quest-filter][data-filter]')) {
    button.setAttribute('aria-pressed', button.dataset.filter === next ? 'true' : 'false');
  }
  for (const card of root.querySelectorAll('[data-side-quest-card]')) {
    card.hidden = next !== 'all' && card.dataset.type !== next;
  }
  return next;
}

function skillName(profile, reference) {
  const skill = (profile.skills ?? []).find((entry) => entry.id === reference);
  return skill ? String(skill.name).replace(/^\S+\s/, '') : String(reference ?? 'Skill');
}

function questRewardText(quest, profile) {
  const parts = [];
  if (quest.coins) parts.push(goldAmount(quest.coins, { sign: '+' }));
  for (const reward of quest.coreRewards ?? []) {
    const track = profile.rankTracks?.[reward.stat];
    parts.push(`+${formatNumber(reward.xp)} ${track?.label ?? reward.stat} XP`);
  }
  for (const reward of quest.skillRewards ?? []) {
    parts.push(`+${formatNumber(reward.xp)} ${skillName(profile, reward.skill)} XP`);
  }
  return parts.length ? inlineList(parts) : 'No reward';
}

function questIcon(quest) {
  return iconNode(quest.icon, { fallback: quest.type === 'secret' ? '🔮' : '🗺️' });
}

function sideQuestCard(quest, profile) {
  const completed = quest.completed === true;
  const repeatable = quest.repeatable !== false;
  const state = completed ? 'completed' : 'open';

  const badge = el(
    'span',
    {
      class: `chip ${completed ? 'chip--done' : quest.type === 'secret' ? 'chip--muted' : 'chip--muted'}`,
      text: completed
        ? `✓ Done${quest.completions > 1 ? ` ×${quest.completions}` : ''}`
        : quest.type === 'secret' ? 'Secret' : 'Side',
    },
  );

  const completeButton = !completed || repeatable
    ? el(
        'button',
        {
          class: 'btn btn--gold btn--compact',
          type: 'button',
          'data-action': 'complete-side-quest',
        },
        completed ? 'Complete again' : 'Complete',
      )
    : el(
        'button',
        { class: 'btn btn--gold btn--compact', type: 'button', disabled: true },
        'Completed',
      );

  const actions = el(
    'div',
    { class: 'quest-card__actions' },
    completeButton,
    quest.lastAction
      ? el(
          'button',
          { class: 'btn btn--ghost btn--compact', type: 'button', 'data-action': 'undo-side-quest' },
          'Undo',
        )
      : null,
    completed
      ? el('span', { class: 'quest-card__result quest-card__result--done', text: 'Reward collected' })
      : el('span', { class: 'quest-card__result', text: repeatable ? 'Repeatable' : 'One-time' }),
  );

  return el(
    'article',
    {
      class: 'quest-card side-quest-card',
      dataset: {
        sideQuestCard: '',
        questId: quest.id,
        type: quest.type,
        state,
      },
      hidden: activeFilter !== 'all' && activeFilter !== quest.type ? true : null,
      'aria-label': `${quest.name}: ${completed ? 'completed' : 'open'}`,
    },
    el(
      'div',
      { class: 'quest-card__head' },
      el('span', { class: 'quest-card__icon', 'aria-hidden': 'true' }, questIcon(quest)),
      el(
        'div',
        { class: 'quest-card__id' },
        el(
          'div',
          { class: 'quest-card__title-row' },
          el('h3', { class: 'quest-card__name', text: quest.name }),
          badge,
        ),
        el('p', { class: 'quest-card__reward' }, questRewardText(quest, profile)),
        el('p', {
          class: 'quest-card__meta',
          text: `${quest.message || (quest.type === 'secret' ? 'Secret quest' : 'Side quest')}${quest.completions ? ` · completed ${quest.completions}×` : ''}`,
        }),
      ),
      crudMenu('sideQuest', quest.id, quest.name, { className: 'crud-menu--card' }),
    ),
    actions,
  );
}

function missionCard(mission, profile, goal = null) {
  const completed = mission.completed === true;
  const reward = missionReward(profile, mission);
  const tasks = mission.tasks ?? [];
  const tasksDone = tasks.filter((task) => task.done).length;

  return el(
    'article',
    {
      class: 'mission-card',
      dataset: { missionCard: '', missionId: mission.id, state: completed ? 'completed' : 'open' },
      'aria-label': `${mission.name}: ${completed ? 'completed' : 'open'}`,
    },
    el(
      'div',
      { class: 'mission-card__head' },
      el(
        'span',
        { class: 'mission-card__id' },
        el('span', { class: 'mission-card__name', text: mission.name }),
        el('span', {
          class: 'mission-card__meta',
          text: [
            goal ? `Goal: ${goal.name}` : 'Standalone mission',
            tasks.length ? `${tasksDone}/${tasks.length} tasks` : null,
            mission.endDate ? `Due ${mission.endDate}` : null,
          ].filter(Boolean).join(' · '),
        }),
      ),
      el('span', {
        class: `chip ${completed ? 'chip--done' : 'chip--muted'}`,
        text: completed ? '✓ Done' : 'Open',
      }),
    ),
    el(
      'div',
      { class: 'mission-card__foot' },
      el('span', {
        class: 'mission-card__reward',
      }, inlineList([
        `+${formatNumber(reward.xp)} XP`,
        goldAmount(reward.coins, { sign: '+' }),
      ])),
      el(
        'div',
        { class: 'mission-card__actions' },
        completed
          ? el('span', { class: 'mission-card__result', text: 'Reward collected' })
          : el(
              'button',
              { class: 'btn btn--gold btn--compact', type: 'button', 'data-action': 'complete-mission' },
              'Complete mission',
            ),
        mission.lastAction
          ? el(
              'button',
              { class: 'btn btn--ghost btn--compact', type: 'button', 'data-action': 'undo-mission' },
              'Undo',
            )
          : null,
      ),
    ),
    el('div', { class: 'entry-admin' }, crudActions('mission', mission.id, mission.name)),
  );
}

function goalCard(goal, profile) {
  const progress = goalProgress(profile, goal);
  const percent = Math.round(progress * 100);
  const completed = goal.completed === true;
  const linked = linkedMissions(profile, goal);
  const linkedDone = linked.filter((mission) => mission.completed).length;
  const reward = goalReward(profile, goal);
  const ready = completed || progress >= 1;

  return el(
    'article',
    {
      class: 'goal-card',
      dataset: { goalCard: '', goalId: goal.id, state: completed ? 'completed' : ready ? 'ready' : 'open' },
      'aria-label': `${goal.name}: ${completed ? 'achieved' : `${percent}% complete`}`,
    },
    el(
      'div',
      { class: 'goal-card__head' },
      el(
        'span',
        { class: 'goal-card__id' },
        el('span', { class: 'goal-card__name', text: goal.name }),
        el('span', {
          class: 'goal-card__meta',
        }, inlineList([
          linked.length ? `${linkedDone}/${linked.length} linked missions` : 'Manual progress',
          `+${formatNumber(reward.xp)} XP`,
          goldAmount(reward.coins, { sign: '+' }),
        ])),
      ),
      el('span', {
        class: `chip ${completed ? 'chip--done' : ready ? 'chip--gold' : 'chip--muted'}`,
        text: completed ? '✓ Achieved' : ready ? 'Ready' : 'In progress',
      }),
    ),
    el(
      'div',
      { class: 'goal-card__progress' },
      el(
        'div',
        { class: 'goal-card__progress-head' },
        el('span', { text: 'Automatic progress' }),
        el('span', { class: 'goal-card__percent', text: `${percent}%` }),
      ),
      progressBar(percent, { tone: completed ? 'gold' : 'gold', label: `${goal.name} progress` }),
    ),
    el(
      'div',
      { class: 'goal-card__actions' },
      completed
        ? el('span', { class: 'goal-card__result', text: 'Milestone achieved' })
        : el(
            'button',
            {
              class: 'btn btn--gold btn--compact',
              type: 'button',
              'data-action': 'complete-goal',
              disabled: ready ? null : true,
              title: ready ? undefined : 'Complete every linked mission first',
            },
            ready ? 'Complete goal' : `${percent}% complete`,
          ),
      goal.lastAction
        ? el(
            'button',
            { class: 'btn btn--ghost btn--compact', type: 'button', 'data-action': 'undo-goal' },
            'Undo',
          )
        : null,
    ),
    linked.length
      ? el('div', { class: 'mission-list' }, linked.map((mission) => missionCard(mission, profile, goal)))
      : el('p', {
          class: 'goal-card__empty',
          text: 'No linked missions yet. Goal progress is tracked manually.',
        }),
    el('div', { class: 'entry-admin' }, crudActions('goal', goal.id, goal.name)),
  );
}

function filterTabs(summary) {
  return el(
    'div',
    { class: 'quest-filter', role: 'group', 'aria-label': 'Filter side quests' },
    FILTERS.map((filter) => {
      const count = filter.id === 'all'
        ? summary.sideTotal
        : filter.id === 'side' ? summary.sideCount : summary.secretCount;
      return el(
        'button',
        {
          class: 'quest-filter__btn',
          type: 'button',
          'data-action': 'filter-quests',
          'data-filter': filter.id,
          'data-quest-filter': '',
          'aria-pressed': activeFilter === filter.id ? 'true' : 'false',
        },
        el('span', { text: filter.label }),
        el('span', { class: 'quest-filter__count', text: String(count) }),
      );
    }),
  );
}

export function renderQuests({ profile }) {
  const summary = progressionSummary(profile);
  const goals = [...(profile.goals ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const missions = [...(profile.missions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const goalIds = new Set(goals.map((goal) => goal.id));
  const standalone = missions.filter((mission) => !mission.goalId || !goalIds.has(mission.goalId));
  const quests = [...(profile.sideQuests ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return screenShell({
    id: 'quests',
    eyebrow: 'Roadmap',
    title: 'Quests & Roadmap',
    description:
      'Side quests feed Core Stats, Skills and auto Character XP. Missions and goals pay the Character XP and Gold shown on each row. Finishing a mission or goal triggers the celebration banner.',
    children: [
      el(
        'div',
        { class: 'grid grid--3' },
        statTile({
          icon: '🗺️',
          label: 'Side & secret',
          value: `${summary.sideCompleted + summary.secretCompleted} / ${summary.sideTotal}`,
          hint: `${summary.sideCount} side · ${summary.secretCount} secret`,
        }),
        statTile({
          icon: '⚔️',
          label: 'Missions',
          value: `${summary.missionsDone} / ${summary.missionsTotal}`,
          hint: 'Character XP + Gold set per row',
          tone: 'muted',
        }),
        statTile({
          icon: '🏔️',
          label: 'Goals',
          value: `${summary.goalsDone} / ${summary.goalsTotal}`,
          hint: 'Character XP + Gold set per row',
          tone: 'muted',
        }),
      ),
      panel({
        title: 'Side & secret quests',
        meta: `${quests.length} quests`,
        children: [
          panelToolbar(crudAddButton('sideQuest', 'Add quest')),
          filterTabs(summary),
          quests.length
            ? el('div', { class: 'quest-list quest-list--progression' }, quests.map((quest) => sideQuestCard(quest, profile)))
            : el('p', { class: 'panel__copy', text: 'No side quests yet. Add them in M6.' }),
          el('p', {
            class: 'panel__note',
            text: 'One tap pays the Core Stat XP, Skill XP and Gold Coins shown on the card. Repeatable quests can be completed again; Undo reverses the latest payout.',
          }),
        ],
      }),
      panel({
        title: 'Goals & missions',
        meta: `${summary.goalsDone} achieved`,
        children: [
          panelToolbar(
            crudAddButton('goal', 'Add goal'),
            crudAddButton('mission', 'Add mission'),
          ),
          goals.length
            ? el('div', { class: 'goal-list' }, goals.map((goal) => goalCard(goal, profile)))
            : el('p', { class: 'panel__copy', text: 'No goals yet. Create them in M6.' }),
          el('p', {
            class: 'panel__note',
            text: 'Goal progress is calculated from its linked missions. Completing a mission updates the goal immediately but never auto-completes it; finish every linked mission, then claim the goal.',
          }),
        ],
      }),
      standalone.length
        ? panel({
            title: 'Standalone missions',
            meta: `${standalone.length} open roadmap items`,
            children: standalone.map((mission) => missionCard(mission, profile)),
          })
        : null,
    ],
  });
}
