// Integrity tests for the "Watch it happen" concept scenes (scenes.js player + scenes-1.js / scenes-2.js data).
// Run with: node --test tests/scenes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const have = (f) => existsSync(new URL('../src/' + f, import.meta.url));
await import('../src/scenes.js');
await import('../src/scenes-1.js');
if (have('scenes-2.js')) await import('../src/scenes-2.js');
await import('../src/lessons-1.js');
if (have('lessons-2.js')) await import('../src/lessons-2.js');
const { TT } = globalThis;
const scenes = TT.scenes;
const lessonIds = new Set((TT.lessons || []).map((l) => l.id));
const lessonObj = Object.fromEntries((TT.lessons || []).map((l) => [l.id, l.obj]));

test('there are scenes, and domains 1-2 have at least 12', () => {
  assert.ok(Array.isArray(scenes) && scenes.length > 0);
  assert.ok(scenes.filter((s) => /^[12]\./.test(s.obj)).length >= 12);
});

test('scene ids are unique', () => {
  const seen = new Set();
  for (const s of scenes) {
    assert.ok(!seen.has(s.id), 'duplicate scene id ' + s.id);
    seen.add(s.id);
  }
});

for (const s of scenes) {
  test(`${s.id}: passes validateScene`, () => {
    assert.deepEqual(TT.validateScene(s), []);
  });
  test(`${s.id}: embeds in an existing lesson with a matching objective`, () => {
    assert.ok(lessonIds.has(s.lesson), 'unknown lesson ' + s.lesson);
    assert.equal(s.obj, lessonObj[s.lesson], 'obj should match the lesson objective');
  });
  test(`${s.id}: every reference points at a real actor or link`, () => {
    const actors = new Set(s.actors.map((a) => a.id));
    for (const st of s.steps) for (const a of st.actions) if (a.do === 'add') actors.add(a.actor.id);
    const links = new Set(s.links.map((l) => l.id));
    const isPort = (t) => typeof t === 'string' && t.includes(':') && actors.has(t.split(':')[0]) && links.has(t.split(':')[1]);
    const ok = (t) => actors.has(t) || links.has(t) || isPort(t);
    for (const l of s.links) assert.ok(actors.has(l.a) && actors.has(l.b), `link ${l.id} ends`);
    s.steps.forEach((st, i) => {
      for (const a of st.actions) {
        const w = `step ${i + 1} ${a.do}`;
        if (a.from) assert.ok(actors.has(a.from), w + ' from');
        if (typeof a.to === 'string') assert.ok(actors.has(a.to), w + ' to');
        if (Array.isArray(a.to)) a.to.forEach((t) => assert.ok(actors.has(t), w + ' to ' + t));
        if (a.path) a.path.forEach((t) => assert.ok(actors.has(t), w + ' path ' + t));
        if (a.at) assert.ok(actors.has(a.at), w + ' at');
        if (a.target) assert.ok(ok(a.target), w + ' target ' + a.target);
      }
    });
  });
  test(`${s.id}: thumbnail renders`, () => {
    const svg = TT.sceneThumb(s);
    assert.match(svg, /^<svg[^>]*viewBox="-?\d+ -?\d+ \d+ \d+"/);
  });
}

test('validateScene catches broken scenes', () => {
  const good = scenes[0];
  const clone = JSON.parse(JSON.stringify(good));
  clone.steps[0].actions.push({ do: 'packet', from: 'NOPE', to: good.actors[0].id, label: 'x' });
  clone.steps[1].actions.push({ do: 'wiggle' });
  clone.links.push({ id: 'BAD', a: good.actors[0].id, b: 'GHOST', kind: 'eth' });
  const p = TT.validateScene(clone);
  assert.ok(p.some((m) => /NOPE/.test(m)));
  assert.ok(p.some((m) => /wiggle/.test(m)));
  assert.ok(p.some((m) => /GHOST/.test(m)));
  assert.deepEqual(TT.validateScene(null), ['scene is not an object']);
});

test('scenesFor and sceneById find scenes', () => {
  const s = scenes[0];
  assert.ok(TT.scenesFor(s.lesson).includes(s));
  assert.equal(TT.sceneById(s.id), s);
});
