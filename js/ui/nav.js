/**
 * Thumb-first bottom navigation. Six equal targets, safe-area aware.
 * The active tab is exposed with aria-current="page".
 */

import { el } from './dom.js';
import { TABS } from '../core/navigation.js';

export function renderNav(activeId, onNavigate) {
  const nav = el(
    'nav',
    { class: 'bottom-nav', id: 'bottom-nav', 'aria-label': 'Primary' },
    el(
      'div',
      { class: 'bottom-nav__inner' },
      TABS.map((tab) => {
        const active = tab.id === activeId;
        const button = el(
          'button',
          {
            class: 'nav-btn',
            type: 'button',
            dataset: { tab: tab.id },
            'aria-current': active ? 'page' : null,
            'aria-label': tab.title,
          },
          el('span', { class: 'nav-btn__icon', text: tab.icon, 'aria-hidden': 'true' }),
          el('span', { class: 'nav-btn__label', text: tab.label }),
        );
        button.addEventListener('click', () => {
          if (typeof onNavigate === 'function') onNavigate(tab.id);
        });
        return button;
      }),
    ),
  );

  return nav;
}
