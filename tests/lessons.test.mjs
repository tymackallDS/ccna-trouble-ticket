// Integrity tests for the Lessons module: data shape, objective tags, cross-references,
// check-question answers, and every tryIt command replayed through the simulated CLI.
// Run with: node --test tests/lessons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

await import('../src/engine.js');
await import('../src/scenarios.js');
await import('../src/guide.js');
await import('../src/lessons-ui.js');
await import('../src/lessons-1.js');
const hasPart2 = existsSync(new URL('../src/lessons-2.js', import.meta.url));
if (hasPart2) await import('../src/lessons-2.js');
const { TT } = globalThis;

// CCNA 200-301 v1.1 objectives per domain
const OBJ_COUNT = { 1: 13, 2: 9, 3: 5, 4: 9, 5: 10, 6: 7 };
const DOMAIN_OF = { 1: 'fund', 2: 'access', 3: 'ipconn', 4: 'svc', 5: 'sec', 6: 'auto' };
const validObj = (o) => {
  const m = /^([1-6])\.(\d{1,2})$/.exec(o);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= OBJ_COUNT[m[1]];
};
const ticketIds = new Set(TT.tickets.map((t) => t.id));
const cardIds = new Set(TT.cards.map((c) => c.id));
const domainIds = new Set(TT.domains.map((d) => d.id));
const ERR = /^% (Invalid input|Incomplete command|Ambiguous command)|is not recognized as an internal or external command|% Simulator error/;

const lessons = TT.lessons;

test('lessons exist, part 1 covers every objective in domains 1 and 2', () => {
  assert.ok(Array.isArray(lessons) && lessons.length >= 22);
  const objs = new Set(lessons.map((l) => l.obj));
  for (let d = 1; d <= 2; d++) for (let i = 1; i <= OBJ_COUNT[d]; i++) assert.ok(objs.has(`${d}.${i}`), `missing lesson for ${d}.${i}`);
});

test('lesson ids are unique and objectives are unique', () => {
  const ids = lessons.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate lesson id');
  const objs = lessons.map((l) => l.obj);
  assert.equal(new Set(objs).size, objs.length, 'two lessons share an objective');
});

test('the lab bench builds and every lab device answers', () => {
  const w = TT.net.makeWorld(TT.lessonLab.world());
  const s = new TT.Session(w);
  for (const id of Object.values(TT.lessonLab.devices)) assert.ok(w.devices[id], `lab device ${id} missing`);
  assert.equal(TT.net.ping(w, 'PC1', '10.10.10.12').ok, true, 'PC1 should reach PC2 on the bench');
  assert.equal(TT.net.ping(w, 'PC1', '10.10.10.1').ok, true, 'PC1 should reach its gateway');
  assert.match(s.run('R1', 'enable').join('') + s.prompt('R1'), /#/);
});

test('inline markup escapes HTML and renders only the allowed tags', () => {
  const out = TT.lessonMarkup('a <b>x</b> **bold** `c<d>` [go](#learn) [bad](javascript:alert(1))');
  assert.ok(!/<b>/.test(out));
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<code>c&lt;d&gt;<\/code>/);
  assert.match(out, /<a href="#learn">go<\/a>/);
  assert.ok(!/href="javascript/.test(out));
});

for (const l of lessons) {
  test(`${l.id} "${l.title}" has the required fields`, () => {
    assert.match(l.id, /^l[1-6]-\d{1,2}$/);
    assert.ok(validObj(l.obj), `bad objective ${l.obj}`);
    assert.equal(l.id, 'l' + l.obj.replace('.', '-'), 'id must match objective');
    assert.equal(l.domain, DOMAIN_OF[l.obj.split('.')[0]], 'domain must match the objective number');
    assert.ok(domainIds.has(l.domain), `unknown domain ${l.domain}`);
    for (const k of ['title', 'caseFile']) assert.ok(typeof l[k] === 'string' && l[k].length > 10, `${k} missing`);
    assert.ok(Number.isFinite(l.minutes) && l.minutes > 0 && l.minutes <= 40, 'minutes');
    assert.ok(Array.isArray(l.sections) && l.sections.length >= 2, 'sections');
    for (const s of l.sections) {
      assert.ok(typeof s.h === 'string' && s.h, 'section heading');
      assert.ok(Array.isArray(s.body) && s.body.length, `section "${s.h}" body`);
      for (const b of s.body) {
        if (typeof b === 'string') continue;
        const kinds = ['list', 'steps', 'table', 'cli', 'note', 'svg'].filter((k) => k in b);
        assert.equal(kinds.length, 1, `block in "${s.h}" must have exactly one kind`);
        if (b.table) {
          assert.ok(b.table.length >= 2, 'table needs a header and a row');
          const n = b.table[0].length;
          for (const r of b.table) assert.equal(r.length, n, `ragged table row in "${s.h}"`);
        }
        if (b.svg) {
          assert.match(b.svg, /^<svg[^>]*viewBox=/, 'svg needs a viewBox');
          assert.ok(!/<script|on\w+=/i.test(b.svg), 'svg must not carry scripts');
          assert.ok(!/(fill|stroke)="#/.test(b.svg), 'svg must use currentColor or classes, not fixed colors');
        }
      }
    }
    assert.ok(Array.isArray(l.techNotes) && l.techNotes.length >= 2 && l.techNotes.length <= 4, 'techNotes 2-4');
    assert.ok(Array.isArray(l.examTraps) && l.examTraps.length >= 1, 'examTraps');
  });

  test(`${l.id} check questions are valid`, () => {
    assert.equal(l.check.length, 3, 'exactly 3 check questions');
    for (const [q, opts, ans, why] of l.check) {
      assert.ok(typeof q === 'string' && q.length > 10, 'question text');
      assert.ok(Array.isArray(opts) && opts.length >= 2 && opts.length <= 6, 'options');
      assert.equal(new Set(opts).size, opts.length, `duplicate options in "${q}"`);
      assert.ok(Number.isInteger(ans) && ans >= 0 && ans < opts.length, `answer index out of range in "${q}"`);
      assert.ok(typeof why === 'string' && why.length > 10, 'explanation');
    }
  });

  test(`${l.id} related links point at things that exist`, () => {
    const r = l.related || {};
    for (const id of r.tickets || []) assert.ok(ticketIds.has(id), `unknown ticket ${id}`);
    for (const id of r.cards || []) assert.ok(cardIds.has(id), `unknown card ${id}`);
    assert.ok(r.hw === undefined || r.hw === null || ['cable', 'ports', 'gear'].includes(r.hw), `bad hw ${r.hw}`);
    const text = JSON.stringify(l);
    for (const [, hash] of text.matchAll(/\]\(#([\w-]+)\)/g)) {
      if (hash.startsWith('learn-')) assert.ok(lessons.some((x) => x.id === hash.slice(6)) || !hasPart2, `link to missing lesson ${hash}`);
      else if (hash.startsWith('card-')) assert.ok(cardIds.has(hash.slice(5)), `link to missing card ${hash}`);
      else if (/^t\d+$/.test(hash)) assert.ok(ticketIds.has(hash), `link to missing ticket ${hash}`);
    }
  });

  test(`${l.id} tryIt commands run in the simulator`, () => {
    for (const ti of l.tryIt || []) {
      assert.ok(ti.device in TT.lessonLab.devices, `unknown device ${ti.device}`);
      assert.ok(['priv', 'config'].includes(ti.mode), `bad mode ${ti.mode}`);
      assert.ok(typeof ti.prompt === 'string' && ti.prompt.length > 10, 'prompt');
      assert.ok(Array.isArray(ti.cmds) && ti.cmds.length, 'cmds');
      const w = TT.net.makeWorld(TT.lessonLab.world());
      const s = new TT.Session(w);
      const dev = TT.lessonLab.devices[ti.device];
      for (const c of TT.lessonLab.modeSetup(ti.device, ti.mode)) s.run(dev, c);
      if (!/^pc/.test(ti.device)) assert.match(s.prompt(dev), ti.mode === 'config' ? /\(config\)#$/ : /[^)]#$/, 'starting mode');
      for (const c of ti.cmds) {
        const out = s.run(dev, c);
        const bad = out.find((x) => ERR.test(x));
        assert.equal(bad, undefined, `${l.id} ${ti.device}: "${c}" -> ${out.join(' | ')}`);
      }
    }
  });
}
