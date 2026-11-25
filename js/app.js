/**
 * The Game of Life V2 — M3 bootstrap.
 *
 * Zero-build ES modules. Owns the router, HUD, bottom navigation, the profile
 * sheet and the daily-loop action delegation. Screens render into #view from
 * the registry.
 */

import { createProfileStore } from './data/store.js';
import { DEFAULT_TAB, normalizeTabId, tabById, tabIdFromHash } from './core/navigation.js';
import { currencySymbol, formatMoney, formatNumber, isValidDateKey, localDateKey, msUntilMidnight, normalizeCurrency, shouldGreetBirthday } from './core/formulas.js';
import { renderHUD } from './ui/hud.js';
import { renderNav } from './ui/nav.js';
import { createProfileSheet } from './ui/profile-sheet.js';
import { showToast } from './ui/toast.js';
import { showCelebration } from './ui/celebration.js';
import { renderScreen } from './screens/index.js';
import { applyQuestFilter } from './screens/quests.js';
import { applyFinanceFilters, setFinanceFilter, toggleFinanceSection } from './screens/finance.js';
import { createCrudSheet } from './editors/crud-sheet.js';
import { backupFilename } from './core/backup.js';
import { el } from './ui/dom.js';

const APP_VERSION = '2.0.0-m6';
const MIDNIGHT_TICK_MS = 30000;
const ROLLOVER_TICK_MS = 60000;

function initialTab(store) {
  if (location.hash) return tabIdFromHash(location.hash);
  return normalizeTabId(store.getSettings().lastTab ?? DEFAULT_TAB);
}

function boot() {
  const app = document.getElementById('app');
  const hudMount = document.getElementById('hud-mount');
  const navMount = document.getElementById('nav-mount');
  const view = document.getElementById('view');

  if (!app || !hudMount || !navMount || !view) {
    throw new Error('Shell markup is incomplete.');
  }

  const store = createProfileStore();
  let activeTab = initialTab(store);

  const sheet = createProfileSheet({
    store,
    onCreated: () => navigate('today', { focus: false }),
    onSwitch: () => render(),
    onChanged: () => render(),
  });
  document.body.append(sheet.element);

  const crudSheet = createCrudSheet({
    store,
    onSaved: (result, mode) => {
      const label = result?.item?.name
        ?? result?.name
        ?? result?.type
        ?? 'Item';
      showToast(
        mode === 'deleted' ? `${label} deleted.` : `${label} saved.`,
        { tone: mode === 'deleted' ? 'warn' : 'ok' },
      );
    },
  });
  document.body.append(crudSheet.element);

  /**
   * First-open-of-the-year birthday greeting. The banner is injected above the
   * active screen and disappears naturally on the next render after dismissal.
   */
  function createBirthdayBanner(profile) {
    if (!shouldGreetBirthday(profile)) return null;
    const confetti = el(
      'span',
      { class: 'birthday-banner__confetti', 'aria-hidden': 'true' },
      ...Array.from({ length: 12 }, () => el('i', { class: 'birthday-banner__piece' })),
    );
    return el(
      'aside',
      { class: 'birthday-banner', role: 'status', 'aria-live': 'polite' },
      confetti,
      el(
        'p',
        { class: 'birthday-banner__text' },
        '🎂 Happy Birthday, ',
        el('strong', { text: profile.name }),
        '!',
      ),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--compact birthday-banner__dismiss',
        'data-action': 'dismiss-birthday',
        text: 'Thanks!',
      }),
    );
  }

  function render() {
    const profile = store.getActiveProfile();
    if (!profile) throw new Error('No active profile.');

    hudMount.replaceChildren(renderHUD(profile));

    const nav = renderNav(activeTab, (id) => navigate(id));
    navMount.replaceChildren(nav);

    const banner = createBirthdayBanner(profile);
    const screen = renderScreen(activeTab, { profile, store, navigate });
    view.replaceChildren(...(banner ? [banner, screen] : [screen]));
    applyFinanceFilters(view);

    const tab = tabById(activeTab);
    document.title = `${tab.title} · The Game of Life V2`;
    app.dataset.boot = 'ready';
  }

  function closeCrudMenus(except = null) {
    for (const menu of document.querySelectorAll('[data-crud-menu].is-open')) {
      if (menu === except) continue;
      menu.classList.remove('is-open');
      const toggle = menu.querySelector('[data-action="toggle-crud-menu"]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      const pop = menu.querySelector('.crud-menu__pop');
      if (pop) pop.hidden = true;
    }
  }

  function navigate(id, { focus = true } = {}) {
    activeTab = normalizeTabId(id);
    const target = `#/${activeTab}`;
    if (location.hash !== target) {
      history.replaceState(null, '', target);
    }
    store.rememberTab(activeTab);
    render();

    if (focus) {
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function openProfiles() {
    sheet.open();
  }

  /** Run a store action; surface its failure as a toast instead of throwing. */
  function safely(run, fallback = 'That action is not available right now.') {
    try {
      return run();
    } catch (error) {
      showToast(error?.message || fallback, { tone: 'warn', duration: 5200 });
      return null;
    }
  }

  /** Close a <dialog> safely even if a store update already re-rendered the view. */
  function closeDialog(dialog) {
    if (!dialog) return;
    try {
      dialog.close();
    } catch {
      dialog.removeAttribute('open');
    }
  }

  function questIdFor(trigger) {
    return trigger.closest?.('[data-quest-card]')?.dataset.questId
      ?? trigger.dataset.questId
      ?? '';
  }

  function habitIdFor(trigger) {
    return trigger.closest?.('[data-habit-card]')?.dataset.habitId
      ?? trigger.dataset.habitId
      ?? '';
  }

  function sideQuestIdFor(trigger) {
    return trigger.closest?.('[data-side-quest-card]')?.dataset.questId
      ?? trigger.dataset.questId
      ?? '';
  }

  function missionIdFor(trigger) {
    return trigger.closest?.('[data-mission-card]')?.dataset.missionId
      ?? trigger.dataset.missionId
      ?? '';
  }

  function goalIdFor(trigger) {
    return trigger.closest?.('[data-goal-card]')?.dataset.goalId
      ?? trigger.dataset.goalId
      ?? '';
  }

  function signed(value, suffix, sign = '+') {
    const number = Math.abs(Number(value) || 0);
    return number ? `${sign}${number} ${suffix}` : '';
  }

  function reportAutoSkips(autoSkipped) {
    if (!Array.isArray(autoSkipped) || autoSkipped.length === 0) return;
    const coins = autoSkipped.reduce((sum, entry) => sum + Math.abs(Number(entry.penaltyCoins) || 0), 0);
    const hp = autoSkipped.reduce((sum, entry) => sum + Math.abs(Number(entry.hpDamage) || 0), 0);
    const count = autoSkipped.length;
    showToast(
      `${count} Strict quest${count === 1 ? '' : 's'} auto-skipped at midnight`
        + `${coins ? ` · −${coins} G` : ''}${hp ? ` · −${hp} HP` : ''}.`,
      { tone: 'warn', duration: 8000 },
    );
  }

  function updateMidnightLabels() {
    const nodes = document.querySelectorAll('[data-midnight]');
    if (nodes.length === 0) return;
    const minutes = Math.ceil(msUntilMidnight(new Date()) / 60000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const label = minutes <= 0
      ? 'Resetting now…'
      : `Resets in ${hours ? `${hours}h ` : ''}${rest}m`;
    for (const node of nodes) node.textContent = label;
  }

  function progressionRewardText(result) {
    const parts = [];
    if (result.coins) parts.push(signed(result.coins, 'G'));
    for (const entry of result.coreRewards ?? []) parts.push(signed(entry.xp, `${entry.label} XP`));
    for (const entry of result.skillRewards ?? []) parts.push(signed(entry.xp, `${entry.label} XP`));
    return parts.filter(Boolean).join(' · ');
  }

  function formatFinanceSync(result) {
    if (!result || result.wealthXP == null) return 're-synced';
    return `XP ${result.wealthXP} · Coins ${result.wealthCoins}`;
  }

  const FINANCE_LIST_KEYS = Object.freeze({
    income: 'incomes',
    expense: 'expenses',
    asset: 'assets',
    savings: 'savings',
  });

  /** Universal, context-specific placeholders for the shared finance editor. */
  const FINANCE_PLACEHOLDERS = Object.freeze({
    income: {
      name: 'Salary, Freelance, Bonus...',
      category: 'Salary, Business, Side Hustle...',
    },
    expense: {
      name: 'Groceries, Rent, Utilities...',
      category: 'Food, Housing, Transport, Bills...',
    },
    asset: {
      name: 'Stocks, Gold, Real Estate...',
      symbol: 'e.g. VOO, GOLD, BTC',
    },
    savings: {
      name: 'Emergency Fund, High-Yield Savings...',
      category: 'Bank or Goal name',
    },
  });

  function setFinanceFieldVisible(form, name, visible, required = false) {
    const field = form.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    field.hidden = !visible;
    const control = field.querySelector('input');
    if (!control) return;
    control.disabled = !visible;
    control.required = visible && required;
  }

  /** Show only the fields that belong to the current finance editor type. */
  function configureFinanceFields(form, type) {
    const profile = store.getActiveProfile();
    const currency = normalizeCurrency(profile?.finance?.currency);
    const symbol = currencySymbol(currency);
    const isStarting = type === 'startingBalance';
    const isBaseline = type === 'baseline';
    const isAsset = type === 'asset';
    const isSavings = type === 'savings';

    setFinanceFieldVisible(form, 'name', !(isStarting || isBaseline), true);
    setFinanceFieldVisible(form, 'amount', true, true);
    setFinanceFieldVisible(form, 'category', !(isStarting || isBaseline || isAsset));
    setFinanceFieldVisible(form, 'symbol', isAsset);
    setFinanceFieldVisible(form, 'quantity', isAsset);
    setFinanceFieldVisible(form, 'date', !(isStarting || isBaseline || isAsset));
    setFinanceFieldVisible(form, 'note', true);

    const amountLabel = form.querySelector('[data-field="amount"] .field__label');
    if (amountLabel) {
      amountLabel.textContent = isBaseline
        ? 'Starting Wealth XP Offset'
        : isStarting
          ? `Starting balance (${symbol})`
          : isAsset
            ? `Value (${symbol})`
            : `Amount (${symbol})`;
    }
    const amountInput = form.elements.amount;
    if (amountInput) {
      amountInput.step = isBaseline ? '1' : '0.01';
      amountInput.inputMode = isBaseline ? 'numeric' : 'decimal';
    }

    const categoryLabel = form.querySelector('[data-field="category"] .field__label');
    if (categoryLabel) {
      categoryLabel.textContent = isSavings ? 'Institution / Goal (optional)' : 'Category';
    }

    const placeholders = FINANCE_PLACEHOLDERS[type] ?? {};
    if (form.elements.name) form.elements.name.placeholder = placeholders.name ?? '';
    if (form.elements.category) form.elements.category.placeholder = placeholders.category ?? '';
    if (form.elements.symbol) form.elements.symbol.placeholder = placeholders.symbol ?? '';

    const calendar = form.querySelector('[data-mini-calendar]');
    if (calendar) calendar.hidden = true;
    const toggle = form.querySelector('[data-action="toggle-calendar"]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function openFinanceSheet({ type, row = null }) {
    const dialog = document.getElementById('finance-dialog');
    const form = document.getElementById('finance-form');
    const title = document.getElementById('finance-dialog-title');
    if (!dialog || !form) return false;

    form.reset();
    form.elements.id.value = row?.id ?? '';
    form.elements.type.value = type;
    form.elements.date.value = row?.date ?? localDateKey(new Date());
    form.elements.name.value = row?.name ?? '';
    form.elements.amount.value = row?.amount ?? '';
    form.elements.category.value = row?.category ?? '';
    form.elements.symbol.value = row?.symbol ?? '';
    form.elements.quantity.value = row?.quantity ?? '';
    form.elements.note.value = row?.note ?? '';

    if (type === 'startingBalance') {
      const profile = store.getActiveProfile();
      form.elements.name.value = 'Starting Balance';
      form.elements.amount.value = profile.finance?.startingBalance ?? 0;
      form.elements.category.value = '';
      form.elements.symbol.value = '';
      form.elements.quantity.value = '';
      form.elements.note.value = 'Editable starting balance';
      if (title) title.textContent = 'Edit starting balance';
    } else if (type === 'baseline') {
      const profile = store.getActiveProfile();
      form.elements.name.value = 'Starting Wealth XP Offset';
      form.elements.amount.value = profile.finance?.wealthXpBaseline ?? 0;
      form.elements.category.value = '';
      form.elements.symbol.value = '';
      form.elements.quantity.value = '';
      form.elements.note.value = 'Adds a starting XP offset on top of live net worth.';
      if (title) title.textContent = 'Edit Starting Wealth XP Offset';
    } else if (title) {
      title.textContent = row ? `Edit ${type}` : `Add ${type}`;
    }

    configureFinanceFields(form, type);
    syncFinanceCalendar(dialog);

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
  }

  function financeRowFor(trigger) {
    const item = trigger.closest('.money-item');
    if (!item) return null;
    const profile = store.getActiveProfile();
    const type = item.dataset.type;
    const listKey = FINANCE_LIST_KEYS[type];
    const list = listKey ? profile.finance?.[listKey] ?? [] : [];
    const row = list.find((entry) => String(entry.id) === String(item.dataset.id)) ?? null;
    return row ? { type, row } : null;
  }

  function openAdjustSheet(trigger) {
    const target = financeRowFor(trigger);
    if (!target || !['asset', 'savings'].includes(target.type)) return false;
    const dialog = document.getElementById('finance-adjust-dialog');
    const form = document.getElementById('finance-adjust-form');
    const label = document.getElementById('finance-adjust-target');
    if (!dialog || !form) return false;

    const profile = store.getActiveProfile();
    const currency = normalizeCurrency(profile?.finance?.currency);
    form.reset();
    form.elements.type.value = target.type;
    form.elements.id.value = target.row.id;
    form.elements.direction.value = 'add';
    form.elements.amount.value = '';
    form.elements.note.value = '';
    if (label) {
      label.textContent = `${target.row.name} · current ${formatMoney(target.row.amount, currency)}`;
    }
    const amountLabel = form.querySelector('label[for="adjust-amount"] .field__label');
    if (amountLabel) amountLabel.textContent = `Amount (${currencySymbol(currency)})`;

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
  }

  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  let pendingBackupText = null;

  function setImportError(message) {
    const dialog = document.getElementById('import-backup-dialog');
    const error = dialog?.querySelector('[data-import-error]');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    const confirm = dialog?.querySelector('[data-action="confirm-import-backup"]');
    if (confirm) confirm.disabled = Boolean(message);
  }

  function openImportPreview(text) {
    const dialog = document.getElementById('import-backup-dialog');
    const previewBody = dialog?.querySelector('[data-import-preview]');
    if (!dialog || !previewBody) return;

    pendingBackupText = null;
    previewBody.replaceChildren();
    setImportError('');

    const preview = safely(() => store.previewBackup(text), 'That backup could not be read.');
    if (!preview) return;

    if (!preview.ok) {
      previewBody.append(
        el('p', { class: 'backup-preview__title', text: 'This file cannot be imported:' }),
        el('ul', { class: 'backup-preview__errors' }, preview.errors.map((message) => el('li', { text: message }))),
      );
      setImportError(preview.errors[0] || 'Invalid backup file.');
    } else {
      const summary = preview.summary;
      pendingBackupText = text;
      previewBody.append(
        el('p', { class: 'backup-preview__title', text: 'Ready to import' }),
        el(
          'div',
          { class: 'backup-preview__meta' },
          el('span', { class: 'chip', text: `Schema v${summary.schemaVersion}` }),
          el('span', { class: 'chip', text: `${summary.profileCount} profile${summary.profileCount === 1 ? '' : 's'}` }),
          summary.exportedAt
            ? el('span', { class: 'chip chip--muted', text: new Date(summary.exportedAt).toLocaleString('en-PH') })
            : null,
        ),
        el(
          'div',
          { class: 'backup-preview__profiles' },
          summary.profiles.map((entry) => el(
            'div',
            { class: 'backup-preview__profile' },
            el('strong', { text: entry.name }),
            el('span', { text: `Level ${entry.level} · ${formatNumber(entry.xp)} XP · ${formatNumber(entry.gold)} G` }),
          )),
        ),
        el('p', {
          class: 'panel__note',
          text: 'Confirming replaces every profile currently stored in this browser. Export a fresh save first if needed.',
        }),
      );
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function readBackupFile(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      input.value = '';
      openImportPreview(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      input.value = '';
      showToast('That file could not be read.', { tone: 'warn' });
    };
    reader.readAsText(file);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;

    navigator.serviceWorker.register('./service-worker.js', { type: 'module' }).then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          showToast('A new app version is ready. Reload to update.', {
            tone: 'info',
            duration: 12000,
            actionLabel: 'Reload',
            onAction: () => location.reload(),
          });
        });
      });
    }).catch(() => {
      // Offline installation is optional; the app still runs without a worker.
    });
  }

  /* ------------------- Finance mini-calendar ------------------- */

  const calendarCursor = { year: null, month: null };

  function parseDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function financeCalendarParts(dialog) {
    const form = dialog?.querySelector?.('#finance-form');
    if (!form) return null;
    return {
      form,
      input: form.elements.date,
      calendar: form.querySelector('[data-mini-calendar]'),
      toggle: form.querySelector('[data-action="toggle-calendar"]'),
      grid: form.querySelector('[data-calendar-grid]'),
      title: form.querySelector('[data-calendar-title]'),
    };
  }

  function syncFinanceCalendar(dialog) {
    const parts = financeCalendarParts(dialog);
    if (!parts) return;
    const date = parseDateKey(parts.input?.value) ?? new Date();
    calendarCursor.year = date.getFullYear();
    calendarCursor.month = date.getMonth();
    renderFinanceCalendar(dialog);
  }

  function renderFinanceCalendar(dialog) {
    const parts = financeCalendarParts(dialog);
    if (!parts?.grid) return;

    const year = calendarCursor.year ?? new Date().getFullYear();
    const month = calendarCursor.month ?? new Date().getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selected = String(parts.input?.value ?? '');
    const todayKey = localDateKey(new Date());

    if (parts.title) {
      parts.title.textContent = first.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    }

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push(el('span', { class: 'mini-calendar__day mini-calendar__day--empty', 'aria-hidden': 'true' }));
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const classes = ['mini-calendar__day'];
      if (key === todayKey) classes.push('is-today');
      if (key === selected) classes.push('is-selected');
      cells.push(
        el('button', {
          type: 'button',
          class: classes.join(' '),
          'data-action': 'calendar-pick',
          'data-date': key,
          'aria-label': `${first.toLocaleDateString('en-PH', { month: 'long' })} ${day}, ${year}`,
          'aria-pressed': key === selected ? 'true' : 'false',
          text: String(day),
        }),
      );
    }
    parts.grid.replaceChildren(...cells);
  }

  function setFinanceCalendarOpen(dialog, open) {
    const parts = financeCalendarParts(dialog);
    if (!parts?.calendar) return;
    parts.calendar.hidden = !open;
    parts.toggle?.setAttribute('aria-expanded', String(open));
    if (open) syncFinanceCalendar(dialog);
  }

  function openFinanceCalendar(input) {
    const dialog = input?.closest?.('dialog');
    if (!dialog) return;
    const parts = financeCalendarParts(dialog);
    if (!parts?.calendar) return;
    parts.calendar.hidden = false;
    parts.toggle?.setAttribute('aria-expanded', 'true');
    syncFinanceCalendar(dialog);
  }

  function pickFinanceDate(trigger) {
    const dialog = trigger?.closest?.('dialog');
    const parts = financeCalendarParts(dialog);
    const value = trigger?.dataset?.date;
    if (!parts?.input || !value) return;
    parts.input.value = value;
    parts.input.dispatchEvent(new Event('input', { bubbles: true }));
    parts.input.dispatchEvent(new Event('change', { bubbles: true }));
    parts.input.focus({ preventScroll: true });
    setFinanceCalendarOpen(dialog, false);
  }

  function handleProgressionAction(action, trigger) {
    if (action === 'filter-quests') {
      applyQuestFilter(view, trigger.dataset.filter);
      return true;
    }

    if (action === 'complete-side-quest') {
      const id = sideQuestIdFor(trigger);
      const result = safely(() => store.completeSideQuest(id));
      if (!result) return true;
      const reward = progressionRewardText(result);
      showToast(`${result.quest.name} complete${reward ? ` · ${reward}` : ''}`, {
        tone: 'ok',
        actionLabel: 'Undo',
        onAction: () => safely(() => store.undoSideQuest(id)),
      });
      if (result.leveledUp) {
        showCelebration({ kind: 'level', name: 'Level', profile: result.profile, result });
      }
      return true;
    }

    if (action === 'undo-side-quest') {
      const id = sideQuestIdFor(trigger);
      const result = safely(() => store.undoSideQuest(id));
      if (!result) return true;
      showToast(`${result.quest.name} restored — its payout was reversed.`, { tone: 'ok' });
      return true;
    }

    if (action === 'complete-mission') {
      const id = missionIdFor(trigger);
      const result = safely(() => store.completeMission(id));
      if (!result) return true;
      showToast(
        `${result.mission.name} complete · +${result.xp} XP · +${result.coins} G`,
        {
          tone: 'ok',
          actionLabel: 'Undo',
          onAction: () => safely(() => store.undoMission(id)),
        },
      );
      showCelebration({
        kind: 'mission',
        name: result.mission.name,
        profile: result.profile,
        result,
      });
      return true;
    }

    if (action === 'undo-mission') {
      const id = missionIdFor(trigger);
      const result = safely(() => store.undoMission(id));
      if (!result) return true;
      showToast(`${result.mission.name} reopened — mission rewards reversed.`, { tone: 'ok' });
      return true;
    }

    if (action === 'complete-goal') {
      const id = goalIdFor(trigger);
      const result = safely(() => store.completeGoal(id));
      if (!result) return true;
      showToast(
        `${result.goal.name} achieved · +${result.xp} XP · +${result.coins} G`,
        {
          tone: 'ok',
          actionLabel: 'Undo',
          onAction: () => safely(() => store.undoGoal(id)),
        },
      );
      showCelebration({
        kind: 'goal',
        name: result.goal.name,
        profile: result.profile,
        result,
      });
      return true;
    }

    if (action === 'undo-goal') {
      const id = goalIdFor(trigger);
      const result = safely(() => store.undoGoal(id));
      if (!result) return true;
      showToast(`${result.goal.name} reopened — goal rewards reversed.`, { tone: 'ok' });
      return true;
    }

    /* ----------------------------- M5 ----------------------------- */

    if (action === 'purchase-reward') {
      const id = trigger.closest('[data-reward-id]')?.dataset.rewardId;
      const result = safely(() => store.purchaseReward(id));
      if (!result) return true;
      const special = result.skipTokenGranted
        ? ` · skip token ×${result.tokens.skipQuest}`
        : result.restDayActivated
          ? ` · rest day active ${result.restDayDate}`
          : '';
      showToast(`Purchased ${result.rewardName} · −${result.price} G${special}`, {
        tone: 'ok',
        actionLabel: 'Undo',
        onAction: () => safely(() => store.undoPurchase(result.purchase.id)),
      });
      return true;
    }

    if (action === 'undo-purchase') {
      const id = trigger.dataset.purchaseId;
      const result = safely(() => store.undoPurchase(id));
      if (!result) return true;
      showToast(`${result.rewardName} refunded · +${result.price} G`, { tone: 'ok' });
      return true;
    }

    if (action === 'open-finance-add') {
      openFinanceSheet({ type: trigger.dataset.type });
      return true;
    }

    if (action === 'open-finance-edit') {
      const target = financeRowFor(trigger);
      if (target) openFinanceSheet(target);
      return true;
    }

    if (action === 'delete-finance-row') {
      const item = trigger.closest('.money-item');
      if (!item) return true;
      const { id, type } = item.dataset;
      if (confirm('Delete this finance entry? Overall Wealth and Wealth XP/Coins will be recalculated.')) {
        const result = safely(() => store.deleteFinanceRow(type, id));
        if (result) showToast('Finance entry deleted · Wealth re-synced.', { tone: 'ok' });
      }
      return true;
    }

    if (action === 'edit-starting-balance') {
      openFinanceSheet({ type: 'startingBalance' });
      return true;
    }

    if (action === 'edit-baseline') {
      openFinanceSheet({ type: 'baseline' });
      return true;
    }

    if (action === 'toggle-finance-more') {
      toggleFinanceSection(trigger.dataset.type);
      applyFinanceFilters(view);
      return true;
    }

    if (action === 'open-finance-adjust') {
      openAdjustSheet(trigger);
      return true;
    }

    /* ----------------------------- M6 ----------------------------- */

    if (action === 'open-crud-add') {
      closeCrudMenus();
      crudSheet.open({ type: trigger.dataset.crudType });
      return true;
    }

    if (action === 'open-crud-edit') {
      closeCrudMenus();
      crudSheet.open({
        type: trigger.dataset.crudType,
        id: trigger.dataset.crudId ?? '',
        statKey: trigger.dataset.crudStatKey ?? '',
      });
      return true;
    }

    if (action === 'delete-crud') {
      closeCrudMenus();
      crudSheet.openDelete({
        type: trigger.dataset.crudType,
        id: trigger.dataset.crudId,
        name: trigger.dataset.crudName ?? '',
      });
      return true;
    }

    if (action === 'toggle-crud-menu') {
      const menu = trigger.closest('[data-crud-menu]');
      if (!menu) return true;
      const open = !menu.classList.contains('is-open');
      closeCrudMenus(menu);
      menu.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      const pop = menu.querySelector('.crud-menu__pop');
      if (pop) pop.hidden = !open;
      return true;
    }

    if (action === 'export-backup') {
      const payload = safely(() => store.exportBackup());
      if (!payload) return true;
      downloadJSON(payload, backupFilename(new Date()));
      showToast(
        `Exported ${payload.profiles.length} profile${payload.profiles.length === 1 ? '' : 's'} as JSON.`,
        { tone: 'ok' },
      );
      return true;
    }

    if (action === 'open-import-backup') {
      view.querySelector('[data-backup-file]')?.click();
      return true;
    }

    if (action === 'confirm-import-backup') {
      if (!pendingBackupText) {
        showToast('Choose a JSON save file first.', { tone: 'warn' });
        return true;
      }
      const text = pendingBackupText;
      pendingBackupText = null;
      closeDialog(trigger.closest('dialog'));
      const result = safely(() => store.importBackup(text));
      if (!result) return true;
      showToast(
        `Imported ${result.profiles.length} profile${result.profiles.length === 1 ? '' : 's'} from JSON.`,
        { tone: 'ok' },
      );
      navigate('today', { focus: false });
      return true;
    }

    if (action === 'open-delete-profile') {
      const dialog = document.getElementById('delete-profile-dialog');
      const form = dialog?.querySelector('form');
      if (!dialog) return true;
      if (form) {
        form.reset();
        const profile = store.getActiveProfile();
        form.elements.id.value = profile.id;
        form.elements.confirm.placeholder = profile.name;
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      return true;
    }

    if (action === 'toggle-calendar') {
      const dialog = trigger.closest('dialog');
      const parts = financeCalendarParts(dialog);
      setFinanceCalendarOpen(dialog, Boolean(parts?.calendar?.hidden));
      return true;
    }

    if (action === 'calendar-prev' || action === 'calendar-next') {
      const dialog = trigger.closest('dialog');
      const parts = financeCalendarParts(dialog);
      if (!parts?.grid) return true;
      const now = new Date();
      const year = calendarCursor.year ?? now.getFullYear();
      const month = calendarCursor.month ?? now.getMonth();
      const delta = action === 'calendar-prev' ? -1 : 1;
      const next = new Date(year, month + delta, 1);
      calendarCursor.year = next.getFullYear();
      calendarCursor.month = next.getMonth();
      renderFinanceCalendar(dialog);
      return true;
    }

    if (action === 'calendar-today') {
      const dialog = trigger.closest('dialog');
      const parts = financeCalendarParts(dialog);
      if (!parts?.input) return true;
      parts.input.value = localDateKey(new Date());
      parts.input.dispatchEvent(new Event('input', { bubbles: true }));
      setFinanceCalendarOpen(dialog, false);
      return true;
    }

    if (action === 'calendar-pick') {
      pickFinanceDate(trigger);
      return true;
    }

    if (action === 'close-dialog') {
      closeDialog(trigger.closest('dialog'));
      return true;
    }

    return false;
  }

  function handleDailyAction(action, trigger) {
    if (action === 'complete-quest') {
      const id = questIdFor(trigger);
      const result = safely(() => store.completeDailyQuest(id));
      if (!result) return;
      const reward = [
        signed(result.xp, 'XP'),
        signed(result.coins, 'G'),
        signed(result.heal, 'HP'),
        signed(result.coreXp, 'core XP'),
        signed(result.skillXp, 'skill XP'),
      ].filter(Boolean).join(' · ');
      showToast(`${result.quest.name} complete${reward ? ` · ${reward}` : ''}`, {
        tone: 'ok',
        actionLabel: 'Undo',
        onAction: () => safely(() => store.undoDailyQuest(id)),
      });
      if (result.leveledUp) {
        showCelebration({ kind: 'level', name: 'Level', profile: result.profile, result });
      }
      return;
    }

    if (action === 'skip-quest') {
      const id = questIdFor(trigger);
      const result = safely(() => store.skipDailyQuest(id));
      if (!result) return;
      const coreEntries = result.corePenalty?.length ? result.corePenalty : (result.coreLoss ?? []);
      const cost = [
        signed(result.coins, 'G', '−'),
        signed(result.xp, 'XP', '−'),
        ...coreEntries.map((entry) => {
          const track = result.profile?.rankTracks?.[entry.stat];
          return signed(entry.xp, `${track?.label ?? entry.stat} XP`, '−');
        }),
        signed(result.hpDamage, 'HP', '−'),
        result.penalty?.physical ?? '',
      ].filter(Boolean).join(' · ');
      showToast(`${result.quest.name} skipped${cost ? ` · ${cost}` : ''}`, {
        tone: 'warn',
        actionLabel: 'Undo',
        onAction: () => safely(() => store.undoDailyQuest(id)),
      });
      return;
    }

    if (action === 'undo-quest') {
      const id = questIdFor(trigger);
      const result = safely(() => store.undoDailyQuest(id));
      if (!result) return;
      showToast(`${result.quest.name} restored — no penalty applied.`, { tone: 'ok' });
      return;
    }

    if (action === 'use-skip-token') {
      const id = questIdFor(trigger);
      const result = safely(() => store.useSkipToken(id));
      if (!result) return;
      showToast(
        `${result.quest.name} skipped with a token · ${result.tokensRemaining} token${result.tokensRemaining === 1 ? '' : 's'} left`,
        {
          tone: 'ok',
          actionLabel: 'Undo',
          onAction: () => safely(() => store.undoDailyQuest(id)),
        },
      );
      return;
    }

    if (action === 'toggle-quest-strict') {
      const id = questIdFor(trigger);
      const next = trigger.getAttribute('aria-checked') !== 'true';
      const result = safely(() => store.setQuestStrict(id, next));
      if (!result) return;
      showToast(`${result.quest.name}: Strict ${next ? 'on' : 'off'}.`, { tone: 'info' });
      return;
    }

    if (action === 'toggle-strict-all') {
      const next = trigger.getAttribute('aria-checked') !== 'true';
      const result = safely(() => store.setStrictAll(next));
      if (!result) return;
      showToast(
        next
          ? 'Strict All is on: every pending quest auto-skips at midnight.'
          : 'Strict All is off: pending quests now stay open across days.',
        { tone: next ? 'warn' : 'ok' },
      );
      return;
    }

    if (action === 'log-habit') {
      const id = habitIdFor(trigger);
      const result = safely(() => store.logBadHabit(id));
      if (!result) return;
      const coreEntries = result.corePenalty?.length ? result.corePenalty : (result.coreLoss ?? []);
      const losses = [
        result.hpDamage ? `${signed(result.hpDamage, 'HP', '−')}` : '',
        ...coreEntries.map((entry) => {
          const track = result.profile?.rankTracks?.[entry.stat];
          return signed(entry.xp, `${track?.label ?? entry.stat} XP`, '−');
        }),
        result.goldLoss ? signed(result.goldLoss, 'G', '−') : '',
      ].filter(Boolean).join(' · ') || 'no penalty';
      showToast(
        `${result.habit.name} logged · ${losses}`,
        {
          tone: 'warn',
          actionLabel: 'Undo',
          onAction: () => safely(() => store.undoBadHabit(id)),
        },
      );
      return;
    }

    if (action === 'undo-habit') {
      const id = habitIdFor(trigger);
      const result = safely(() => store.undoBadHabit(id));
      if (!result) return;
      showToast(`Relapse undone · ${result.habit.name} is clean again.`, { tone: 'ok' });
      return;
    }

    if (action === 'undo-journal') {
      const result = safely(() => store.undoJournal());
      if (!result) return;
      showToast('Today’s reflection and payout were removed.', { tone: 'ok' });
    }
  }

  document.addEventListener('click', (event) => {
    const dateInput = event.target.closest?.('#finance-form input[name="date"]');
    if (dateInput) {
      openFinanceCalendar(dateInput);
      return;
    }

    const openCalendar = document.querySelector('#finance-form [data-mini-calendar]:not([hidden])');
    if (openCalendar && !event.target.closest?.('.field--date')) {
      const form = openCalendar.closest('form');
      openCalendar.hidden = true;
      form?.querySelector('[data-action="toggle-calendar"]')?.setAttribute('aria-expanded', 'false');
    }

    const trigger = event.target.closest?.('[data-action]');
    if (!event.target.closest?.('[data-crud-menu]')) closeCrudMenus();
    // Forms carry data-action for submit delegation; their click must not be cancelled.
    if (!trigger || trigger.tagName === 'FORM' || trigger.tagName === 'DIALOG') return;
    const action = trigger.dataset.action;
    if (action === 'open-profiles') {
      event.preventDefault();
      openProfiles();
    } else if (action === 'go-shop') {
      event.preventDefault();
      navigate('shop');
    } else if (action === 'dismiss-birthday') {
      event.preventDefault();
      const result = safely(() => store.dismissBirthday());
      if (result) render();
    } else {
      event.preventDefault();
      if (!handleProgressionAction(action, trigger)) handleDailyAction(action, trigger);
    }
  });

  document.addEventListener('focusin', (event) => {
    const dateInput = event.target.closest?.('#finance-form input[name="date"]');
    if (dateInput) openFinanceCalendar(dateInput);
  });

  document.addEventListener('change', (event) => {
    const backupFile = event.target.closest?.('[data-backup-file]');
    if (backupFile) {
      readBackupFile(backupFile);
      return;
    }

    const filter = event.target.closest?.('[data-role="finance-filter"]');
    if (filter) {
      setFinanceFilter(filter.dataset.filter, filter.value);
      if (filter.dataset.filter === 'period') render();
      else applyFinanceFilters(view);
      return;
    }

    const financeMonth = event.target.closest?.('[data-role="finance-month"]');
    if (financeMonth) {
      setFinanceFilter('month', financeMonth.value);
      applyFinanceFilters(view);
      return;
    }

    const financeYear = event.target.closest?.('[data-role="finance-year"]');
    if (financeYear) {
      setFinanceFilter('year', financeYear.value);
      applyFinanceFilters(view);
      return;
    }

    const select = event.target.closest?.('[data-role="currency-select"]');
    if (!select) return;
    const result = safely(() => store.setFinanceCurrency(select.value));
    if (!result) return;
    showToast(`Display currency set to ${result.currency} ${result.symbol}.`, { tone: 'ok' });
  });

  document.addEventListener('submit', (event) => {
    const trigger = event.target.closest?.('[data-action]');
    if (trigger?.dataset.action === 'save-finance') {
      event.preventDefault();
      const form = event.target;
      const dialog = form.closest('dialog');
      const data = new FormData(form);
      const type = String(data.get('type') ?? '');
      const id = String(data.get('id') ?? '');
      const rawAmount = data.get('amount');
      const amount = rawAmount === null || rawAmount === '' ? NaN : Number(rawAmount);
      if (!Number.isFinite(amount)) {
        showToast('Enter a valid amount before saving.', { tone: 'warn' });
        form.elements.amount?.focus();
        return;
      }
      const payload = {
        id,
        type,
        name: String(data.get('name') ?? '').trim(),
        amount,
        category: String(data.get('category') ?? '').trim(),
        symbol: String(data.get('symbol') ?? '').trim(),
        quantity: data.get('quantity') === null || data.get('quantity') === ''
          ? null
          : Number(data.get('quantity')),
        date: String(data.get('date') ?? ''),
        note: String(data.get('note') ?? '').trim(),
      };

      let result = null;
      if (type === 'startingBalance') {
        result = safely(() => store.updateFinanceRow({ type, amount }));
      } else if (type === 'baseline') {
        result = safely(() => store.updateFinanceRow({ type, amount: Math.floor(amount), wealthXpBaseline: Math.floor(amount) }));
      } else if (id) {
        result = safely(() => store.updateFinanceRow(payload));
      } else {
        result = safely(() => store.addFinanceRow(type, payload));
      }

      if (!result) return;
      showToast(
        `${id || type === 'startingBalance' || type === 'baseline' ? 'Finance updated' : 'Finance entry added'} · Wealth ${formatFinanceSync(result)}`,
        { tone: 'ok' },
      );
      closeDialog(dialog);
      return;
    }

    const adjustForm = event.target.closest?.('#finance-adjust-form');
    if (adjustForm) {
      event.preventDefault();
      const data = new FormData(adjustForm);
      const type = String(data.get('type') ?? '');
      const id = String(data.get('id') ?? '');
      const amount = Number(data.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Enter an amount greater than zero.', { tone: 'warn' });
        adjustForm.elements.amount?.focus();
        return;
      }
      const result = safely(() => store.adjustFinanceRow(type, id, {
        direction: String(data.get('direction') ?? 'add'),
        amount,
        note: String(data.get('note') ?? ''),
      }));
      if (!result) return;
      const profile = store.getActiveProfile();
      const currency = normalizeCurrency(profile?.finance?.currency);
      closeDialog(adjustForm.closest('dialog'));
      showToast(
        `${result.row.name} ${result.entry.direction === 'add' ? 'increased' : 'reduced'} to ${formatMoney(result.row.amount, currency)} · Wealth ${formatMoney(result.totals.overallWealth, currency)}`,
        { tone: 'ok' },
      );
      return;
    }

    const settingsForm = event.target.closest?.('[data-settings-form]');
    if (settingsForm) {
      event.preventDefault();
      const kind = settingsForm.dataset.settingsForm;
      const data = new FormData(settingsForm);

      if (kind === 'identity') {
        const name = String(data.get('name') ?? '').trim();
        const birthday = String(data.get('birthday') ?? '').trim();
        if (!name) {
          showToast('Enter a player name before saving.', { tone: 'warn' });
          settingsForm.elements.name?.focus();
          return;
        }
        if (!isValidDateKey(birthday)) {
          showToast('Enter a valid birthday.', { tone: 'warn' });
          settingsForm.elements.birthday?.focus();
          return;
        }
        const result = safely(() => store.updateIdentity({ name, birthday }));
        if (!result) return;
        showToast(`Saved ${result.name} · Age ${result.age} · Lifespan HP updated.`, { tone: 'ok' });
        return;
      }

      if (kind === 'economy') {
        const result = safely(() => store.updateWealthBaseline(Number(data.get('wealthXpBaseline') ?? 0)));
        if (!result) return;
        showToast(`Starting Wealth XP offset set to ${formatNumber(result.baseline)} · ${formatNumber(result.wealthXP)} Wealth XP.`, { tone: 'ok' });
        return;
      }

      if (kind === 'hp') {
        const result = safely(() => store.updateHpSettings({
          shieldGainXP: Number(data.get('shieldGainXP') ?? 100),
          shieldLossXP: Number(data.get('shieldLossXP') ?? 60),
          woundedPercent: Number(data.get('woundedPercent') ?? 50),
          exhaustedPercent: Number(data.get('exhaustedPercent') ?? 25),
        }));
        if (!result) return;
        showToast('Vitality Shield tuning saved.', { tone: 'ok' });
        return;
      }

      if (kind === 'points') {
        const result = safely(() => store.updatePointAwards({
          journalXp: Number(data.get('journalXp') ?? 0),
          journalCoins: Number(data.get('journalCoins') ?? 0),
        }));
        if (!result) return;
        showToast('Reflection points saved.', { tone: 'ok' });
        return;
      }

      if (kind === 'delete-profile') {
        const id = String(data.get('id') ?? '');
        const confirmName = String(data.get('confirm') ?? '').trim();
        const profile = store.getActiveProfile();
        const error = settingsForm.querySelector('[data-delete-error]');
        if (!profile || profile.id !== id) {
          showToast('That profile is no longer active.', { tone: 'warn' });
          return;
        }
        if (confirmName !== profile.name) {
          if (error) {
            error.textContent = `Type “${profile.name}” exactly to confirm.`;
            error.hidden = false;
          }
          settingsForm.elements.confirm?.focus();
          return;
        }
        const result = safely(() => store.deleteProfile(id));
        if (!result) return;
        closeDialog(settingsForm.closest('dialog'));
        showToast(`Profile “${profile.name}” deleted.`, { tone: 'warn' });
        navigate('today', { focus: false });
        return;
      }

      return;
    }

    const form = event.target.closest?.('[data-journal-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const result = safely(() => store.saveJournal({
      mood: String(data.get('mood') ?? 'okay'),
      wins: String(data.get('wins') ?? ''),
      lessons: String(data.get('lessons') ?? ''),
      gratitude: String(data.get('gratitude') ?? ''),
      freeText: String(data.get('freeText') ?? ''),
    }));
    if (!result) return;
    const paid = result.payout?.xp || result.payout?.coins
      ? ` · +${result.payout.xp} XP · +${result.payout.coreXp ?? 0} Mind XP · +${result.payout.coins} G`
      : ' · no extra payout';
    showToast(`${result.created ? 'Reflection saved' : 'Reflection updated'}${paid}`, {
      tone: 'ok',
    });
    if (result.leveledUp) {
      showCelebration({ kind: 'level', name: 'Level', profile: result.profile, result });
    }
  });

  window.addEventListener('hashchange', () => {
    const next = tabIdFromHash(location.hash);
    if (next !== activeTab) {
      activeTab = next;
      store.rememberTab(next);
      render();
    }
  });

  store.subscribe(() => {
    render();
    updateMidnightLabels();
  });

  render();

  const meta = store.getMeta();
  if (meta.recoveredFromCorruption) {
    showToast(
      'Saved data was damaged. The default seed profile was restored and the old blob was backed up locally.',
      { tone: 'warn', duration: 8000 },
    );
  }
  if (!meta.persistent) {
    showToast('Local storage is unavailable. Changes will not survive a reload.', {
      tone: 'warn',
      duration: 8000,
    });
  }
  reportAutoSkips(meta.rollover?.autoSkipped);
  updateMidnightLabels();

  window.setInterval(updateMidnightLabels, MIDNIGHT_TICK_MS);
  window.setInterval(() => {
    const result = safely(() => store.syncDaily());
    if (result?.autoSkipped?.length) reportAutoSkips(result.autoSkipped);
  }, ROLLOVER_TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const result = safely(() => store.syncDaily());
    if (result?.autoSkipped?.length) reportAutoSkips(result.autoSkipped);
    updateMidnightLabels();
  });

  window.__GOL__ = {
    version: APP_VERSION,
    store,
    crudSheet,
    navigate: (id) => navigate(id),
    dailySummary: () => store.getDailySummary(),
    progressionSummary: () => store.getProgressionSummary(),
    financeSummary: () => store.getFinanceSummary(),
    exportBackup: () => store.exportBackup(),
    celebrationOpen: () => Boolean(document.querySelector('[data-celebration]')),
    get activeTab() {
      return activeTab;
    },
  };

  registerServiceWorker();
}

try {
  boot();
  document.documentElement.dataset.ready = 'true';
} catch (error) {
  console.error('The Game of Life V2 failed to boot.', error);
  const app = document.getElementById('app');
  const view = document.getElementById('view');
  if (app) app.dataset.boot = 'error';
  if (view) {
    view.replaceChildren(
      el(
        'section',
        { class: 'screen' },
        el(
          'div',
          { class: 'panel' },
          el('h1', { class: 'panel__title', text: 'The app could not start' }),
          el('p', {
            class: 'panel__copy',
            text: 'Your saved profiles were not changed. Reload the page, or check the browser console for the exact error.',
          }),
          el('pre', { class: 'boot-error', text: String(error?.message || error) }),
        ),
      ),
    );
  }
}
