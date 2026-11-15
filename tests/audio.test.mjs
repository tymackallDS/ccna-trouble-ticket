// Sound: off by default, a safe no-op without Web Audio, settings persist, and the per-effect rate limiter.
// Run with: node --test tests/audio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/audio.css', import.meta.url), 'utf8');
const KEY = 'trouble-ticket-audio-v1';
// objects made inside the vm have another realm's prototype; compare plain copies
const plain = (o) => JSON.parse(JSON.stringify(o));

function run({ stored, blocked, map } = {}) {
  const store = map || new Map(stored ? [[KEY, typeof stored === 'string' ? stored : JSON.stringify(stored)]] : []);
  const localStorage = blocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const g = { localStorage, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(g);
  vm.runInContext(code, g);
  return { TT: g.TT, store };
}

test('settings default to off, with music and effects pre-set for when sound is switched on', () => {
  const { TT } = run();
  const s = TT.audio.get();
  assert.equal(s.on, false);
  assert.equal(s.music, true);
  assert.equal(s.sfx, true);
  assert.ok(Math.abs(s.musicVol - 0.35) < 1e-9);
  assert.ok(Math.abs(s.sfxVol - 0.6) < 1e-9);
  assert.equal(TT.audio.state, 'none', 'no AudioContext is created up front');
});

test('TT.sfx is a safe no-op when off, when on without Web Audio, and for unknown names', () => {
  const { TT } = run();
  assert.equal(typeof TT.sfx, 'function');
  for (const n of TT.audio.NAMES) assert.equal(TT.sfx(n), false);
  assert.doesNotThrow(() => TT.audio.set({ on: true }));
  assert.equal(TT.audio.get().on, true);
  for (const n of TT.audio.NAMES) assert.equal(TT.sfx(n), false);
  assert.equal(TT.sfx('no-such-effect'), false);
  assert.equal(TT.sfx(), false);
  assert.equal(TT.audio.state, 'none');
});

test('settings persist to localStorage and are read back on the next load', () => {
  const map = new Map();
  const a = run({ map });
  a.TT.audio.set({ on: true, musicVol: 0.2, sfx: false });
  assert.deepEqual(JSON.parse(map.get(KEY)), { on: true, music: true, musicVol: 0.2, sfx: false, sfxVol: 0.6 });
  const b = run({ map });
  assert.deepEqual(plain(b.TT.audio.get()), { on: true, music: true, musicVol: 0.2, sfx: false, sfxVol: 0.6 });
  b.TT.audio.toggle();
  assert.equal(run({ map }).TT.audio.get().on, false);
});

test('bad stored values are cleaned and blocked storage is harmless', () => {
  const { TT } = run({ stored: { on: 'yes', musicVol: 7, sfxVol: -1, music: false } });
  assert.deepEqual(plain(TT.audio.get()), { on: false, music: false, musicVol: 1, sfx: true, sfxVol: 0 });
  assert.equal(run({ stored: '{not json' }).TT.audio.get().on, false);
  const blocked = run({ blocked: true });
  assert.equal(blocked.TT.audio.get().on, false);
  assert.doesNotThrow(() => blocked.TT.audio.set({ on: true }));
  assert.equal(blocked.TT.audio.get().on, true, 'the choice holds for this visit even when it cannot be saved');
});

test('the rate limiter lets each effect through at most once per 120 ms', () => {
  const { TT } = run();
  const { allow, GAP_MS } = TT.audio;
  assert.equal(GAP_MS, 120);
  assert.equal(allow('pager', 1000), true);
  assert.equal(allow('pager', 1050), false);
  assert.equal(allow('pager', 1119), false);
  assert.equal(allow('resolve', 1050), true, 'names are limited independently');
  assert.equal(allow('pager', 1120), true);
  assert.equal(allow('pager', 1200), false);
  assert.equal(allow('pager', 1240), true);
});

test('volume curves: silent at zero, unity at the defaults, louder above', () => {
  const { TT } = run();
  assert.equal(TT.audio.musicGain(0), 0);
  assert.equal(TT.audio.sfxGain(0), 0);
  assert.ok(Math.abs(TT.audio.sfxGain(0.6) - 1) < 1e-9);
  assert.ok(TT.audio.musicGain(1) > TT.audio.musicGain(0.35));
  assert.ok(TT.audio.musicGain(0.1) < TT.audio.musicGain(0.35));
});

test('every effect named in the brief exists', () => {
  const { TT } = run();
  for (const n of ['pager', 'resolve', 'promote', 'badge', 'ping-ok', 'ping-fail', 'link-up', 'link-down', 'flip', 'correct', 'wrong', 'scene-step', 'clockin']) {
    assert.ok(TT.audio.NAMES.includes(n), n);
  }
});

test('the stylesheet keeps 40px tap targets and respects reduced motion', () => {
  assert.match(css, /\.tt-audio-btn \{[^}]*width: 40px; height: 40px;/);
  assert.match(css, /\.tt-au-sw \{[^}]*min-height: 40px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
