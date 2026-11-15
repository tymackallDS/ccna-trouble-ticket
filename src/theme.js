/* Trouble Ticket: theme switch.
 * The night shift (dark) is the default. Light is opt-in and remembered in localStorage.
 * Sets <html data-theme="dark|light"> as soon as this runs and injects a toggle button into the masthead.
 * For a flash-free first paint, index.html's <head> can carry the tiny snippet in TT.theme.headSnippet.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  const KEY = 'trouble-ticket-theme';
  const THEMES = ['dark', 'light'];
  const doc = G.document;

  const ICONS = {
    // moon: shown in light mode (click for the night shift)
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    // sun: shown in dark mode (click for the day shift)
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  function valid(t) { return THEMES.indexOf(t) !== -1; }

  function stored() {
    try {
      const v = G.localStorage && G.localStorage.getItem(KEY);
      return valid(v) ? v : null;
    } catch (e) { return null; }
  }

  function save(t) {
    try { if (G.localStorage) G.localStorage.setItem(KEY, t); } catch (e) { /* private mode or blocked storage: the choice just won't stick */ }
  }

  function current() {
    const t = doc && doc.documentElement.getAttribute('data-theme');
    return valid(t) ? t : 'dark';
  }

  function syncButton() {
    if (!doc) return;
    const b = doc.getElementById('tt-theme');
    if (!b) return;
    const dark = current() === 'dark';
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    b.innerHTML = dark ? ICONS.sun : ICONS.moon;
    b.setAttribute('aria-label', label);
    b.title = label;
  }

  function apply(t) {
    if (!valid(t)) t = 'dark';
    if (doc) doc.documentElement.setAttribute('data-theme', t);
    syncButton();
    return t;
  }

  function set(t) {
    const v = apply(t);
    save(v);
    return v;
  }

  function toggle() { return set(current() === 'dark' ? 'light' : 'dark'); }

  function inject() {
    if (!doc || doc.getElementById('tt-theme')) return;
    const mast = doc.querySelector('header.mast') || doc.querySelector('header');
    if (!mast) return;
    const hud = doc.createElement('div');
    hud.className = 'tt-hud';
    // A small "on shift" light: decorative, so it is hidden from assistive tech.
    hud.innerHTML = '<span class="tt-onshift" aria-hidden="true"><i class="live-dot"></i>On shift</span>' +
      '<button type="button" class="tt-theme" id="tt-theme"></button>';
    // Sit in the masthead row, right after the career chip if it is there, else right after the brand.
    // (career.js puts its chip directly after .brand, so either load order ends as: brand, chip, toggle, nav.)
    const anchor = (mast.querySelector && (mast.querySelector('.cr-hud') || mast.querySelector('.brand'))) || null;
    if (anchor && anchor.parentNode === mast) anchor.insertAdjacentElement('afterend', hud);
    else mast.appendChild(hud);
    hud.querySelector('#tt-theme').addEventListener('click', toggle);
    syncButton();
  }

  TT.theme = {
    KEY,
    get: current,
    set,
    toggle,
    stored,
    // Paste into <head>, before the stylesheet, to set the theme before the first paint.
    headSnippet: "<script>try{var t=localStorage.getItem('trouble-ticket-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}</script>",
  };

  if (!doc) return; // loaded under node for tests

  // Apply as early as this script runs: the stored choice, else dark.
  apply(stored() || 'dark');

  // Keep several open tabs in step.
  if (G.addEventListener) {
    G.addEventListener('storage', (e) => { if (e.key === KEY) apply(valid(e.newValue) ? e.newValue : 'dark'); });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', inject);
  else inject();
})(globalThis);
