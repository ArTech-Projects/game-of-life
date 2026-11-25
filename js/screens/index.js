/**
 * Screen registry. Each entry receives { profile, store, navigate } and
 * returns a detached section element.
 */

import { renderToday } from './today.js';
import { renderCharacter } from './character.js';
import { renderQuests } from './quests.js';
import { renderFinance } from './finance.js';
import { renderShop } from './shop.js';
import { renderSettings } from './settings.js';

export const SCREENS = Object.freeze({
  today: renderToday,
  character: renderCharacter,
  quests: renderQuests,
  finance: renderFinance,
  shop: renderShop,
  settings: renderSettings,
});

export function renderScreen(tabId, context) {
  const render = SCREENS[tabId] ?? SCREENS.today;
  return render(context);
}
