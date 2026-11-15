// Integrity checks for the mock exam question bank (questions-1.js and, if present, questions-2.js).
// Run with: node --test tests/questions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

await import('../src/engine.js');
await import('../src/questions-1.js');
const q2 = new URL('../src/questions-2.js', import.meta.url);
if (existsSync(q2)) await import(q2.href);
const { TT } = globalThis;
const Q = TT.questions;

const OBJ = {
  '1.0': 13, '2.0': 9, '3.0': 5, '4.0': 9, '5.0': 10, '6.0': 7,
};
const TYPES = ['single', 'multi', 'order', 'match', 'sim'];
const isPerm = (a, n) => Array.isArray(a) && a.length === n && new Set(a).size === n && a.every((x) => Number.isInteger(x) && x >= 0 && x < n);
const words = (s) => String(s).trim().split(/\s+/).length;

test('bank is loaded', () => {
  assert.ok(Array.isArray(Q) && Q.length >= 150, `only ${Q && Q.length} questions`);
});

test('ids are unique and well formed', () => {
  const seen = new Set();
  for (const q of Q) {
    assert.match(q.id, /^q\d-\d{4}$/, q.id);
    assert.ok(!seen.has(q.id), 'duplicate id ' + q.id);
    seen.add(q.id);
  }
});

test('no duplicate stems', () => {
  const seen = new Map();
  for (const q of Q) {
    const k = q.stem.trim().toLowerCase().replace(/\s+/g, ' ');
    assert.ok(!seen.has(k), `${q.id} repeats the stem of ${seen.get(k)}`);
    seen.set(k, q.id);
  }
});

for (const q of Q) {
  test(`${q.id} is well formed`, () => {
    assert.ok(OBJ[q.domain], `${q.id} bad domain ${q.domain}`);
    const [d, n] = q.obj.split('.').map(Number);
    assert.equal(d + '.0', q.domain, `${q.id} obj ${q.obj} not in domain ${q.domain}`);
    assert.ok(n >= 1 && n <= OBJ[q.domain], `${q.id} obj ${q.obj} out of range`);
    assert.ok(TYPES.includes(q.type), `${q.id} type ${q.type}`);
    assert.ok([1, 2, 3].includes(q.difficulty), `${q.id} difficulty`);
    assert.ok(q.stem && q.stem.length > 15, `${q.id} stem`);
    assert.ok(q.explanation && words(q.explanation) >= 40, `${q.id} explanation too short (${words(q.explanation || '')} words)`);
    assert.ok(typeof q.ref === 'string' && q.ref.length, `${q.id} ref`);
    if (q.why) assert.equal(q.why.length, q.options.length, `${q.id} why length`);
    if (q.exhibit) {
      assert.ok(['cli', 'svg', 'table'].includes(q.exhibit.kind), `${q.id} exhibit kind`);
      if (q.exhibit.kind === 'cli') assert.ok(Array.isArray(q.exhibit.lines) && q.exhibit.lines.length);
      if (q.exhibit.kind === 'table') assert.ok(Array.isArray(q.exhibit.rows) && q.exhibit.rows.length > 1);
      if (q.exhibit.kind === 'svg') assert.match(q.exhibit.svg, /^<svg/);
    }
    if (q.type !== 'sim') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} options`);
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} duplicate options`);
    }
    const n2 = q.options ? q.options.length : 0;
    if (q.type === 'single') {
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < n2, `${q.id} answer out of range`);
    } else if (q.type === 'multi') {
      assert.ok(Array.isArray(q.answer) && q.answer.length >= 2, `${q.id} multi answer`);
      assert.equal(new Set(q.answer).size, q.answer.length, `${q.id} repeated answer`);
      assert.ok(q.answer.every((i) => Number.isInteger(i) && i >= 0 && i < n2), `${q.id} answer out of range`);
      assert.equal(q.pick, q.answer.length, `${q.id} pick must equal answer count`);
      const word = ['', '', 'two', 'three', 'four'][q.pick];
      assert.ok(new RegExp('Choose ' + word, 'i').test(q.stem), `${q.id} stem should say (Choose ${word}.)`);
    } else if (q.type === 'order') {
      assert.ok(isPerm(q.answer, n2), `${q.id} order answer is not a permutation`);
      assert.ok(q.answer.some((v, i) => v !== i), `${q.id} options are already in the correct order`);
    } else if (q.type === 'match') {
      assert.ok(Array.isArray(q.targets) && q.targets.length >= 2, `${q.id} targets`);
      assert.equal(q.answer.length, n2, `${q.id} every left item needs exactly one pair`);
      const lefts = new Set();
      for (const p of q.answer) {
        assert.ok(Array.isArray(p) && p.length === 2, `${q.id} pair shape`);
        assert.ok(p[0] >= 0 && p[0] < n2 && p[1] >= 0 && p[1] < q.targets.length, `${q.id} pair out of range`);
        lefts.add(p[0]);
      }
      assert.equal(lefts.size, n2, `${q.id} left item paired twice`);
    } else if (q.type === 'sim') {
      const s = q.sim;
      assert.ok(s && s.world && s.world.devices && s.start && s.world.devices[s.start], `${q.id} sim world/start`);
      assert.ok(Array.isArray(s.tasks) && s.tasks.length, `${q.id} sim tasks`);
      assert.equal(typeof (TT.simChecks || {})[s.check], 'function', `${q.id} check ${s.check} missing`);
    }
  });
}

for (const q of Q.filter((x) => x.type === 'sim')) {
  test(`${q.id} sim starts unsolved and is solvable`, () => {
    const check = TT.simChecks[q.sim.check];
    const w0 = TT.net.makeWorld(q.sim.world);
    assert.equal(check(w0), false, 'check passes before any work');
    assert.ok(q.sim.solution, `${q.id} needs sim.solution so it can be verified`);
    const w = TT.net.makeWorld(q.sim.world);
    const s = new TT.Session(w);
    for (const [dev, cmds] of Object.entries(q.sim.solution)) {
      for (const c of cmds) {
        const out = s.run(dev, c);
        const err = out.find((l) => /^% (Invalid|Incomplete|Ambiguous)/.test(l));
        assert.equal(err, undefined, `${dev}: "${c}" -> ${out.join(' | ')}`);
      }
    }
    assert.equal(check(w), true, 'check fails after the solution');
  });
}

test('every domain in the bank has questions on several objectives', () => {
  const by = {};
  for (const q of Q) (by[q.domain] = by[q.domain] || new Set()).add(q.obj);
  for (const [d, s] of Object.entries(by)) assert.ok(s.size >= Math.min(3, OBJ[d]), `domain ${d} only covers ${[...s]}`);
});

test('practice exams A-E: fixed, blueprint-weighted, cover the bank', async () => {
  const { strict: assert } = await import('node:assert');
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {} };
  await import('../src/exam-ui.js');
  const sets = globalThis.TT.examSets();
  assert.equal(sets.length, 5);
  const want = { '1.0': 20, '2.0': 20, '3.0': 25, '4.0': 10, '5.0': 15, '6.0': 10 };
  const all = new Set();
  for (const s of sets) {
    assert.equal(s.ids.length, 100);
    assert.equal(new Set(s.ids).size, 100);
    const per = {};
    for (const id of s.ids) { const q = globalThis.TT.questions.find((x) => x.id === id); per[q.domain] = (per[q.domain] || 0) + 1; all.add(id); }
    assert.deepEqual(per, want);
  }
  assert.equal(all.size, globalThis.TT.questions.length);
  assert.deepEqual(globalThis.TT.examSets().map((s) => s.ids), sets.map((s) => s.ids));
});
