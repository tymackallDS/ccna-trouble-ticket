// Integrity checks for the domain 3.0-6.0 concept scenes (src/scenes-2.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/lessons-1.js');
await import('../src/lessons-2.js');
try { await import('../src/scenes-1.js'); } catch { /* domain 1-2 scenes not built yet */ }
const before = (globalThis.TT.scenes || []).length;
await import('../src/scenes-2.js');
const TT = globalThis.TT;
const mine = TT.scenes.slice(before);
let hasPlayer = false;
try { await import('../src/scenes.js'); hasPlayer = typeof TT.validateScene === 'function'; } catch { /* player not built yet */ }

const lessonIds = new Set(TT.lessons.map((l) => l.id));
const lessonObj = Object.fromEntries(TT.lessons.map((l) => [l.id, l.obj]));
const ACTIONS = ['packet', 'flood', 'drop', 'highlight', 'state', 'badge', 'table', 'label', 'note', 'add', 'remove'];

test('scenes-2 adds a healthy set of scenes for domains 3-6', () => {
  assert.ok(mine.length >= 14, 'expected at least 14 scenes, got ' + mine.length);
  for (const s of mine) assert.match(s.obj, /^[3-6]\./, s.id + ' obj outside domains 3-6');
});

test('scene ids are unique and prefixed', () => {
  const ids = TT.scenes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate scene id');
  for (const s of mine) assert.match(s.id, /^sc-[a-z0-9-]+$/);
});

test('every scene points at a real lesson with the same objective', () => {
  for (const s of mine) {
    assert.ok(lessonIds.has(s.lesson), s.id + ' lesson ' + s.lesson + ' does not exist');
    assert.equal(lessonObj[s.lesson], s.obj, s.id + ' obj does not match its lesson');
  }
});

test('structure: actors, links, references, spacing, step counts', () => {
  for (const s of mine) {
    assert.equal(s.stage.w, 720, s.id);
    assert.ok(s.stage.h >= 240 && s.stage.h <= 380, s.id + ' stage height');
    assert.ok(s.steps.length >= 5 && s.steps.length <= 12, s.id + ' step count');
    const actors = Object.fromEntries(s.actors.map((a) => [a.id, a]));
    const links = Object.fromEntries(s.links.map((l) => [l.id, l]));
    for (const l of s.links) assert.ok(actors[l.a] && actors[l.b], s.id + ' link ' + l.id + ' end missing');
    const list = s.actors;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        assert.ok(Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) >= 110, s.id + ': ' + list[i].id + '/' + list[j].id + ' too close');
    const isTarget = (t) => actors[t] || links[t] || (/:/.test(t) && actors[t.split(':')[0]] && links[t.split(':')[1]]);
    s.steps.forEach((st, i) => {
      const where = s.id + ' step ' + (i + 1);
      assert.ok(st.caption && st.caption.split(/\s+/).length <= 50, where + ' caption length');
      for (const a of st.actions) {
        assert.ok(ACTIONS.includes(a.do), where + ' unknown action ' + a.do);
        for (const k of ['from', 'at']) if (a[k] != null) assert.ok(actors[a[k]], where + ' ' + k + ' ' + a[k]);
        if (a.do === 'packet' && a.to) assert.ok(actors[a.to], where + ' to ' + a.to);
        if (a.do === 'flood') for (const t of a.to) assert.ok(actors[t], where + ' flood to ' + t);
        if (a.path) for (const p of a.path) assert.ok(actors[p], where + ' path ' + p);
        if (a.target != null) assert.ok(isTarget(a.target), where + ' target ' + a.target);
      }
    });
    assert.ok(s.takeaway && s.summary && s.title, s.id + ' text fields');
  }
});

test('the player validator finds no problems', { skip: !hasPlayer && 'src/scenes.js not present' }, () => {
  const problems = mine.flatMap((s) => TT.validateScene(s));
  assert.deepEqual(problems, []);
});
