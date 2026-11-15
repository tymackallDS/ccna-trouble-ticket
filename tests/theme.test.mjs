// Theme switch: default dark, stored choice wins, toggle flips and persists, blocked storage is harmless.
// Run with: node --test tests/theme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../src/theme.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

// A tiny DOM stand-in: just enough for theme.js.
function fakeDom() {
  const attrs = {};
  const byId = {};
  const listeners = {};
  const mk = (tag) => {
    const el = {
      tag, className: '', title: '', attrs: {}, children: [], _html: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { (this.on = this.on || {})[t] = f; },
      querySelector(sel) { return sel === '#tt-theme' ? byId['tt-theme'] : null; },
      get innerHTML() { return this._html; },
      set innerHTML(h) {
        this._html = h;
        if (h.includes('id="tt-theme"')) byId['tt-theme'] = mk('button');
      },
    };
    return el;
  };
  const mast = mk('header');
  const doc = {
    readyState: 'complete',
    documentElement: { setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; } },
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => (sel.startsWith('header') ? mast : null),
    createElement: mk,
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  return { doc, attrs, byId, mast };
}

function run({ stored, blocked } = {}) {
  const dom = fakeDom();
  const store = new Map(stored ? [['trouble-ticket-theme', stored]] : []);
  const localStorage = blocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const g = { document: dom.doc, localStorage, addEventListener() {} };
  g.globalThis = g;
  vm.runInNewContext(code, g);
  return { ...dom, store, TT: g.TT };
}

test('defaults to dark when nothing is stored', () => {
  const r = run();
  assert.equal(r.attrs['data-theme'], 'dark');
  assert.equal(r.TT.theme.get(), 'dark');
});

test('a stored light choice is applied on load; junk values fall back to dark', () => {
  assert.equal(run({ stored: 'light' }).attrs['data-theme'], 'light');
  assert.equal(run({ stored: 'purple' }).attrs['data-theme'], 'dark');
});

test('injects one labelled toggle button into the masthead', () => {
  const r = run();
  assert.equal(r.mast.children.length, 1);
  const b = r.byId['tt-theme'];
  assert.ok(b, 'button exists');
  assert.equal(b.attrs['aria-label'], 'Switch to light theme');
  assert.match(b.innerHTML, /<svg[^>]*aria-hidden="true"/);
  assert.match(r.mast.children[0].innerHTML, /<button type="button"/);
});

test('toggle flips the theme, updates the label and persists the choice', () => {
  const r = run();
  r.byId['tt-theme'].on.click();
  assert.equal(r.attrs['data-theme'], 'light');
  assert.equal(r.store.get('trouble-ticket-theme'), 'light');
  assert.equal(r.byId['tt-theme'].attrs['aria-label'], 'Switch to dark theme');
  r.TT.theme.toggle();
  assert.equal(r.attrs['data-theme'], 'dark');
  assert.equal(r.store.get('trouble-ticket-theme'), 'dark');
});

test('blocked localStorage does not throw and still defaults to dark', () => {
  const r = run({ blocked: true });
  assert.equal(r.attrs['data-theme'], 'dark');
  assert.doesNotThrow(() => r.TT.theme.toggle());
  assert.equal(r.attrs['data-theme'], 'light');
});

test('loads under node with no document', () => {
  const g = {}; g.globalThis = g;
  assert.doesNotThrow(() => vm.runInNewContext(code, g));
  assert.match(g.TT.theme.headSnippet, /trouble-ticket-theme/);
});

test('stylesheet: dark is the :root default, light is opt-in, no OS-preference switch', () => {
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)[1];
  assert.match(root, /color-scheme:\s*dark/);
  assert.match(css, /:root\[data-theme='light'\]\s*\{[\s\S]*?color-scheme:\s*light/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
  for (const v of ['--paper', '--sheet', '--ink', '--muted', '--line', '--accent', '--good', '--warn', '--stamp', '--term', '--on-accent']) {
    assert.match(root, new RegExp(v + ':'), `dark ${v}`);
  }
});
