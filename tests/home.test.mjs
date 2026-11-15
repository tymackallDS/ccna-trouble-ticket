// Front door and rooms navigation: every hash maps to the right view, room and sub-tab.
// Run with: node --test tests/home.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
for (const f of ['engine', 'scenarios', 'lessons-1', 'lessons-2', 'home']) {
  await import(new URL(`../src/${f}.js`, import.meta.url));
}
const TT = globalThis.TT;
const R = TT.rooms;
const at = (h) => { const p = R.parse(h); return [p.view, p.room, p.sub]; };

test('five rooms, each with at least one view, unique ids', () => {
  assert.deepEqual(R.list.map((r) => r.id), ['training', 'noc', 'drills', 'cert', 'record']);
  assert.deepEqual(R.list.map((r) => r.name), ['Training Room', 'NOC Floor', 'Drill Room', 'Certification Desk', 'Shift Record']);
  const subs = R.list.flatMap((r) => r.subs.map((s) => s.id));
  assert.equal(new Set(subs).size, subs.length);
  for (const r of R.list) assert.ok(r.subs.length >= 1 && r.subs.every((s) => s.href.startsWith('#')));
});

test('each sub-tab link routes back to its own room and sub-tab', () => {
  for (const r of R.list) for (const s of r.subs) {
    const p = R.parse(s.href);
    assert.equal(p.room, r.id, s.href);
    assert.equal(p.sub, s.id, s.href);
    assert.equal(p.view, s.view, s.href);
  }
});

test('plain routes', () => {
  const want = {
    '': ['home', null, null], '#home': ['home', null, null], home: ['home', null, null],
    learn: ['learn', 'training', 'lessons'], scenes: ['learn', 'training', 'scenes'],
    tickets: ['tickets', 'noc', 'tickets'], lab: ['lab', 'noc', 'lab'], hardware: ['hardware', 'noc', 'hardware'],
    flash: ['flash', 'drills', 'flash'], drill: ['drill', 'drills', 'drill'], quiz: ['quiz', 'drills', 'quiz'],
    exam: ['exam', 'cert', 'exam'],
    progress: ['progress', 'record', 'progress'], plan: ['plan', 'record', 'plan'], map: ['map', 'record', 'map'],
    guide: ['guide', null, 'guide'],
  };
  for (const [h, w] of Object.entries(want)) assert.deepEqual(at(h), w, h);
});

test('deep links light up the right room and carry their argument', () => {
  assert.deepEqual(R.parse('#t05'), { view: 'tickets', arg: 't05', room: 'noc', sub: 'tickets' });
  for (const t of TT.tickets) assert.deepEqual(at(t.id), ['tickets', 'noc', 'tickets'], t.id);
  assert.deepEqual(R.parse('#learn-l3-4'), { view: 'learn', arg: { id: 'l3-4' }, room: 'training', sub: 'lessons' });
  assert.deepEqual(R.parse('#learn-scene-sc-arp-ping'), { view: 'learn', arg: { id: 'scene-sc-arp-ping' }, room: 'training', sub: 'scenes' });
  assert.deepEqual(R.parse('#scene-sc-arp-ping'), { view: 'learn', arg: { scene: 'sc-arp-ping' }, room: 'training', sub: 'scenes' });
  assert.deepEqual(R.parse('#scenes'), { view: 'learn', arg: { gallery: true }, room: 'training', sub: 'scenes' });
  assert.deepEqual(R.parse('#lab-ospf'), { view: 'lab', arg: { project: 'ospf' }, room: 'noc', sub: 'lab' });
  assert.deepEqual(R.parse('#hw-wlc'), { view: 'hardware', arg: 'wlc', room: 'noc', sub: 'hardware' });
  assert.deepEqual(R.parse('#flash-ports'), { view: 'flash', arg: { deck: 'ports' }, room: 'drills', sub: 'flash' });
  assert.deepEqual(R.parse('#card-ospf'), { view: 'guide', arg: { card: 'ospf' }, room: null, sub: 'guide' });
});

test('every lesson id deep-links into the Training Room', () => {
  for (const l of TT.lessons) assert.deepEqual(at('#learn-' + l.id), ['learn', 'training', 'lessons'], l.id);
});

test('unknown hashes fall back to the front door', () => {
  for (const h of ['nonsense', 'learnx', 't99', '#!/', 'Tickets']) assert.deepEqual(at(h), ['home', null, null], h);
});

test('icons exist for every room and the Field Manual', () => {
  for (const id of [...R.list.map((r) => r.id), 'manual']) {
    const svg = R.icon(id);
    assert.match(svg, /^<svg[^>]*aria-hidden="true"/);
    assert.ok(/<(path|rect|circle)/.test(svg), id);
  }
});

test('Clock in: plan first, then the first unfinished lesson in blueprint order, then the tickets', () => {
  const H = TT.home;
  const saved = TT.plan;
  try {
    TT.plan = { tonight: () => ({ href: '#lab-ospf', label: 'OSPF lab' }) };
    assert.equal(H.clockIn({}).href, '#lab-ospf');
    TT.plan = { tonight: () => null };
    assert.equal(H.clockIn({}).href, '#learn-l1-1');
    assert.equal(H.clockIn({ lessons: { done: { 'l1-1': true } } }).href, '#learn-l1-2');
    const all = Object.fromEntries(TT.lessons.map((l) => [l.id, true]));
    assert.equal(H.clockIn({ lessons: { done: all } }).href, '#tickets');
    TT.plan = { tonight: () => { throw new Error('boom'); } };
    assert.equal(H.clockIn({}).href, '#learn-l1-1');
  } finally { TT.plan = saved; }
});

test('a returning visitor is one with real progress, not just a visit', () => {
  const H = TT.home;
  assert.equal(H.hasProgress({}), false);
  assert.equal(H.hasProgress({ app: { solved: {}, drill: { best: 0 }, quiz: { best: null } }, career: { v: 1, days: {} } }), false);
  assert.equal(H.hasProgress({ app: { solved: { t01: '2026-11-15' } } }), true);
  assert.equal(H.hasProgress({ lessons: { done: { 'l1-1': true } } }), true);
  assert.equal(H.hasProgress({ exam: { attempts: [{ score: 700 }] } }), true);
  assert.equal(H.hasProgress({ flash: { cards: { x: { seen: 2 } } } }), true);
});

test('the hero illustration is one self-contained, labelled SVG', () => {
  const svg = TT.homeHero();
  assert.match(svg, /^<svg[^>]*role="img"/);
  assert.match(svg, /<title id="hx-t">/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), 'no external references');
  for (const bit of ['VLAN 99?', 'HPL', 'PAGE', 'show ip ospf neighbor', 'hx-led', 'hx-cursor', 'hx-pager']) assert.ok(svg.includes(bit), bit);
  assert.equal(TT.homeHero(), svg, 'deterministic');
});
