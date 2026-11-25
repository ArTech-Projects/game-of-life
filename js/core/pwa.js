/**
 * The Game of Life V2 — PWA shell definition (M6).
 *
 * `service-worker.js` imports this module (module service worker) so the
 * offline cache list has a single source of truth and can be asserted by the
 * parity suite. `manifest.json` mirrors PWA_MANIFEST; keep both in sync.
 */

export const PWA_CACHE_VERSION = 'gol-v2-m6-final13';
export const PWA_CACHE_PREFIX = 'gol-v2-';
export const PWA_LEGACY_CACHE_PREFIXES = Object.freeze(['gol-shell-']);
export const PWA_OFFLINE_PAGE = './index.html';

export const PWA_MANIFEST = Object.freeze({
  name: 'The Game of Life V2',
  shortName: 'Life V2',
  description: 'A private, offline-first life RPG with real-life HP, quests, finance and rewards.',
  lang: 'en-PH',
  startUrl: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'portrait-primary',
  backgroundColor: '#07080c',
  themeColor: '#07080c',
  themeIcon: 'icons/ares.png',
  maskableIcon: 'icons/thief.png',
});

export const PWA_PRECACHE = Object.freeze([
  './index.html',
  './tests.html',
  './manifest.json',

  './css/tokens.css',
  './css/base.css',
  './css/shell.css',
  './css/components.css',
  './css/screens.css',

  './js/app.js',
  './js/core/formulas.js',
  './js/core/titles.js',
  './js/core/navigation.js',
  './js/core/profile.js',
  './js/core/daily.js',
  './js/core/progression.js',
  './js/core/economy.js',
  './js/core/backup.js',
  './js/core/crud.js',
  './js/core/pwa.js',
  './js/data/seed.js',
  './js/data/store.js',
  './js/ui/dom.js',
  './js/ui/hud.js',
  './js/ui/nav.js',
  './js/ui/toast.js',
  './js/ui/profile-sheet.js',
  './js/ui/celebration.js',
  './js/screens/index.js',
  './js/screens/shared.js',
  './js/screens/today.js',
  './js/screens/character.js',
  './js/screens/quests.js',
  './js/screens/finance.js',
  './js/screens/shop.js',
  './js/screens/settings.js',
  './js/editors/crud-sheet.js',
  './js/tests/parity.js',

  './icons/ares.png',
  './icons/arco.png',
  './icons/armor.png',
  './icons/art.png',
  './icons/assasin.png',
  './icons/atena.png',
  './icons/bed.png',
  './icons/book_(5).png',
  './icons/cleaner.png',
  './icons/cold.png',
  './icons/computer.png',
  './icons/disconnect.png',
  './icons/energy.png',
  './icons/fighter.png',
  './icons/fire.png',
  './icons/fish.png',
  './icons/focus.png',
  './icons/forex.png',
  './icons/game_(3).png',
  './icons/gaming.png',
  './icons/grassland_(1).png',
  './icons/help.png',
  './icons/interview.png',
  './icons/kitchenware.png',
  './icons/magico.png',
  './icons/mechanic.png',
  './icons/mona-lisa.png',
  './icons/nap.png',
  './icons/oil-paint.png',
  './icons/road.png',
  './icons/rules.png',
  './icons/running.png',
  './icons/running-shoes.png',
  './icons/sleep 1.png',
  './icons/sleep.png',
  './icons/social-media.png',
  './icons/sorcerer.png',
  './icons/streaming.png',
  './icons/streaming_(1).png',
  './icons/thief.png',
  './icons/video.png',
  './icons/video_(1).png',
  './icons/watch-tv.png',
  './icons/web-design.png',
]);

export function isShellAsset(path) {
  return PWA_PRECACHE.includes(path);
}

export function iconCount(assets = PWA_PRECACHE) {
  return assets.filter((path) => path.startsWith('./icons/')).length;
}
