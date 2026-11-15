// Study plan ("Shift schedule"): the generator is pure; check spans, ordering, the stretch, skipping and .ics output.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
for (const f of ['engine', 'scenarios', 'guide', 'course', 'scenes', 'scenes-1', 'scenes-2', 'lessons-1', 'lessons-2', 'questions-1', 'questions-2', 'exam-ui', 'flashcards', 'projects', 'plan', 'career']) {
  await import(new URL(`../src/${f}.js`, import.meta.url));
}
const TT = globalThis.TT;
const P = TT.plan;
const cat = P.catalog();
const START = '2026-11-15';
const mk = (days, minutes = 60, nights = 5, start = START) => ({ start, exam: P.addDays(start, days), minutes, nights });
const all = (plan) => plan.nights.flatMap((n) => n.items.map((x) => ({ ...x, date: n.date, phase: n.phase })));
const cmpObj = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1]; };

const spans = [
  ['60 days', mk(60)],
  ['21 days', mk(21)],
  ['120 days', mk(120, 60, 5, '2026-09-01')],
];

test('catalog sees the real content', () => {
  assert.equal(cat.lessons.length, TT.lessons.length);
  assert.equal(cat.tickets.length, TT.tickets.length);
  assert.equal(cat.labs.length, TT.labProjects.length);
  assert.deepEqual(cat.sets, ['A', 'B', 'C', 'D', 'E']);
  for (const t of cat.tickets) assert.ok(cat.lessons.some((l) => l.obj === t.after), `${t.id} is placed after a real lesson (${t.after})`);
  for (const p of cat.labs) assert.ok(cat.lessons.some((l) => l.obj === p.after), `${p.id} is placed after a real lesson`);
  for (const [d, decks] of Object.entries(P.DECKS)) for (const id of decks) assert.ok(TT.flashDecks.some((x) => x.id === id), `${d}: deck ${id} exists`);
});

for (const [name, s] of spans) {
  test(`generator, ${name}: shape, dates and the final night`, () => {
    const plan = P.build(s, {});
    assert.ok(plan.nights.length > 0);
    const dates = plan.nights.map((n) => n.date);
    assert.deepEqual(dates, [...dates].sort(), 'nights are in date order');
    assert.equal(new Set(dates).size, dates.length, 'one entry per date');
    assert.ok(dates[0] >= s.start && dates[dates.length - 1] < s.exam, 'every night falls between start and exam day');
    for (const n of plan.nights) {
      assert.ok(n.items.length > 0, `${n.date} has work`);
      assert.equal(n.minutes, n.items.reduce((m, x) => m + x.minutes, 0), `${n.date} minutes add up`);
      for (const x of n.items) {
        assert.ok(['lesson', 'scene', 'ticket', 'lab', 'flash', 'checkpoint', 'exam', 'review'].includes(x.kind));
        for (const f of ['id', 'title', 'href', 'minutes']) assert.ok(x[f] !== undefined && x[f] !== '', `${x.key} has ${f}`);
        assert.match(x.href, /^#/);
      }
    }
    const last = plan.nights[plan.nights.length - 1];
    assert.equal(last.date, P.addDays(s.exam, -1), 'the night before the exam is on the plan');
    assert.equal(last.phase, 'final');
    assert.ok(last.items.every((x) => x.kind === 'flash' || x.kind === 'review'), 'the last night is light review only');
    assert.ok(last.minutes <= 45);
    // weeks group every night exactly once
    assert.equal(plan.weeks.reduce((m, w) => m + w.nights.length, 0), plan.nights.length);
    // stretch: about 10-14% of nights or more (room for each exam and its review), at least 4
    const stretch = plan.nights.filter((n) => n.date >= plan.stretchStart);
    assert.ok(stretch.length >= 4);
    assert.ok(stretch.length < plan.nights.length, 'some nights are left for learning');
  });

  test(`ordering, ${name}: every lesson once, blueprint order, before its tickets and labs`, () => {
    const plan = P.build(s, {});
    const items = all(plan);
    const lessons = items.filter((x) => x.kind === 'lesson');
    assert.equal(lessons.length, TT.lessons.length);
    assert.equal(new Set(lessons.map((x) => x.id)).size, TT.lessons.length, 'each lesson once');
    const pos = new Map(items.map((x, i) => [x.key, i]));
    for (let i = 1; i < lessons.length; i++) assert.ok(cmpObj(lessons[i - 1].obj, lessons[i].obj) < 0, `${lessons[i - 1].obj} before ${lessons[i].obj}`);
    const lessonAt = Object.fromEntries(lessons.map((l) => [l.obj, l]));
    for (const kind of ['ticket', 'lab']) {
      const list = items.filter((x) => x.kind === kind);
      assert.equal(list.length, kind === 'ticket' ? TT.tickets.length : TT.labProjects.length, `every ${kind} once`);
      for (const x of list) {
        const l = lessonAt[x.obj];
        assert.ok(l, `${x.id} has a teaching lesson`);
        assert.ok(x.date > l.date, `${x.id} (${x.date}) comes on a night after lesson ${l.obj} (${l.date})`);
        // every lesson for an objective at or before it comes first
        for (const m of lessons) if (cmpObj(m.obj, x.obj) <= 0) assert.ok(pos.get(m.key) < pos.get(x.key));
      }
    }
    // scenes ride with their lesson
    for (const sc of items.filter((x) => x.kind === 'scene')) {
      const l = lessons.find((x) => x.id === sc.lesson);
      assert.equal(sc.date, l.date, `${sc.id} on the same night as ${l.id}`);
    }
    assert.equal(items.filter((x) => x.kind === 'scene').length, TT.scenes.length);
    // each domain ends with a checkpoint, after its lessons
    const cps = items.filter((x) => x.kind === 'checkpoint');
    assert.deepEqual(cps.map((x) => x.id), ['1.0', '2.0', '3.0', '4.0', '5.0', '6.0']);
    for (const c of cps) {
      assert.equal(c.href, '#exam');
      assert.match(c.title, /domain practice/i);
      for (const l of lessons.filter((x) => x.domain === c.domain)) assert.ok(pos.get(l.key) < pos.get(c.key));
    }
    // flash items on learning nights match the night's domain
    for (const n of plan.nights.filter((x) => x.phase === 'learn')) {
      for (const f of n.items.filter((x) => x.kind === 'flash')) assert.ok(P.DECKS[n.domain].includes(f.id), `${f.id} fits ${n.domain}`);
    }
  });

  test(`practice exams, ${name}: in the final stretch, each followed by a review`, () => {
    const plan = P.build(s, {});
    const items = all(plan);
    const exams = items.filter((x) => x.kind === 'exam');
    assert.deepEqual(exams.map((x) => x.id), ['A', 'B', 'C', 'D', 'E']);
    for (const e of exams) {
      assert.ok(e.date >= plan.stretchStart, `exam ${e.id} is in the stretch`);
      const ri = items.findIndex((x) => x.kind === 'review' && x.set === e.id);
      assert.ok(ri > items.indexOf(e), `review for ${e.id} comes after it`);
      assert.ok(items[ri].phase !== 'final', 'never on the light last night');
    }
    assert.ok(!items.some((x) => x.date < plan.stretchStart && x.kind === 'exam'));
    assert.ok(!items.some((x) => x.date >= plan.stretchStart && ['lesson', 'ticket', 'lab'].includes(x.kind)), 'no new material in the stretch');
  });
}

test('roomy spans spread exams evenly with a review night after each', () => {
  const plan = P.build(mk(60, 90), {});
  const nights = plan.nights.filter((n) => n.date >= plan.stretchStart && n.phase !== 'final');
  const idx = nights.map((n, i) => (n.items.some((x) => x.kind === 'exam') ? i : -1)).filter((i) => i >= 0);
  assert.equal(idx.length, 5);
  for (const i of idx) assert.ok(nights[i + 1].items.some((x) => x.kind === 'review' && x.set), 'the next night reviews it');
  const gaps = idx.slice(1).map((v, i) => v - idx[i]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, 'roughly even');
});

test('budget: roomy plans keep nights near the minutes asked for', () => {
  for (const s of [mk(120, 60, 5, '2026-09-01'), mk(60, 90), mk(75, 60, 6)]) {
    const plan = P.build(s, {});
    assert.ok(!plan.warnings.some((w) => w.code === 'tight'), 'not flagged tight');
    for (const n of plan.nights) {
      if (n.items.some((x) => x.kind === 'exam')) continue; // a full exam is 120 minutes
      const biggest = Math.max(...n.items.map((x) => x.minutes));
      assert.ok(n.minutes <= s.minutes + 15 || biggest > s.minutes, `${n.date}: ${n.minutes} min on a ${s.minutes} min budget`);
    }
  }
});

test('tight plans compress and say so honestly', () => {
  const plan = P.build(mk(21), {});
  const w = plan.warnings.find((x) => x.code === 'tight');
  assert.ok(w, 'tight warning');
  assert.match(w.text, /This is tight: ~\d+(\.\d)? hours for ~\d+(\.\d)? hours of material/);
  assert.ok(plan.totals.needed > plan.totals.available);
  assert.equal(all(plan).filter((x) => x.kind === 'lesson').length, TT.lessons.length, 'nothing is dropped');
  // under four weeks is always flagged, even when the minutes fit
  const short = P.build(mk(25, 120, 7), {});
  assert.ok(short.warnings.some((x) => x.code === 'tight'));
});

test('v1.1 retirement warning after Feb 2, 2027', () => {
  assert.ok(P.build({ start: START, exam: '2027-02-03', minutes: 60, nights: 5 }, {}).warnings.some((w) => w.code === 'v2'));
  assert.ok(!P.build({ start: START, exam: '2027-02-02', minutes: 60, nights: 5 }, {}).warnings.some((w) => w.code === 'v2'));
  const none = P.build({ start: '2027-01-20', exam: '2027-01-15', minutes: 60, nights: 5 }, {});
  assert.equal(none.nights.length, 0);
  assert.ok(none.warnings.some((w) => w.code === 'none'));
});

test('completed items are excluded', () => {
  const doneLessons = Object.fromEntries(TT.lessons.filter((l) => l.obj.startsWith('1.') || l.obj.startsWith('2.')).map((l) => [l.id, true]));
  const progress = {
    lessons: doneLessons,
    tickets: { t01: '2026-11-01', t03: '2026-11-02' },
    labs: { basics: '2026-11-03' },
    exams: { A: '2026-11-10T02:00:00Z' },
    weak: ['2026-11-11T02:00:00Z'],
    practice: { '1.0': ['2026-11-05T02:00:00Z'] },
  };
  const plan = P.build(mk(60), progress);
  const items = all(plan);
  for (const id of Object.keys(doneLessons)) assert.ok(!items.some((x) => x.kind === 'lesson' && x.id === id), `${id} skipped`);
  assert.ok(!items.some((x) => x.kind === 'scene' && doneLessons[x.lesson]), 'scenes of finished lessons skipped');
  assert.ok(!items.some((x) => x.kind === 'ticket' && (x.id === 't01' || x.id === 't03')));
  assert.ok(!items.some((x) => x.kind === 'lab' && x.id === 'basics'));
  assert.ok(!items.some((x) => x.kind === 'exam' && x.id === 'A'));
  assert.ok(!items.some((x) => x.kind === 'review' && x.set === 'A'), 'exam A was reviewed after it was taken');
  assert.ok(!items.some((x) => x.kind === 'checkpoint' && x.id === '1.0'));
  assert.ok(items.some((x) => x.kind === 'checkpoint' && x.id === '2.0'), 'domain 2 checkpoint still owed');
  assert.equal(items.filter((x) => x.kind === 'lesson').length, TT.lessons.length - Object.keys(doneLessons).length);
  // the ticket of a finished domain comes early in the plan
  const t04 = items.find((x) => x.id === 't04');
  assert.ok(t04.date <= plan.nights[2].date);
  // raw storage shapes work too
  const raw = P.build(mk(60), { app: { solved: { t01: '2026-11-01' } }, lessons: { done: { 'l1-1': true } }, exam: { attempts: [{ date: '2026-11-10T00:00:00Z', mode: 'full', set: 'B', score: 700 }] } });
  const r = all(raw);
  assert.ok(!r.some((x) => x.id === 't01' || x.id === 'l1-1' || (x.kind === 'exam' && x.id === 'B')));
  assert.ok(r.some((x) => x.kind === 'review' && x.set === 'B'), 'exam B taken but not reviewed: the review stays');
  // fully done: only the stretch's light work remains
  const everything = {
    lessons: Object.fromEntries(TT.lessons.map((l) => [l.id, true])),
    tickets: Object.fromEntries(TT.tickets.map((t) => [t.id, 'x'])),
    labs: Object.fromEntries(TT.labProjects.map((p) => [p.id, 'x'])),
    exams: Object.fromEntries('ABCDE'.split('').map((k) => [k, '2026-11-01T00:00:00Z'])),
    weak: ['2026-11-02T00:00:00Z'],
    practice: Object.fromEntries(['1.0', '2.0', '3.0', '4.0', '5.0', '6.0'].map((d) => [d, ['2026-11-01T00:00:00Z']])),
  };
  const rest = all(P.build(mk(60), everything));
  assert.ok(rest.every((x) => x.kind === 'flash' || x.kind === 'review'));
});

test('isDone and pace read progress', () => {
  const plan = P.build(mk(60), {});
  const n0 = plan.nights[0];
  const lesson = n0.items.find((x) => x.kind === 'lesson');
  assert.equal(P.isDone(lesson, {}), false);
  assert.equal(P.isDone(lesson, { lessons: { [lesson.id]: true } }), true);
  const scene = all(plan).find((x) => x.kind === 'scene');
  assert.equal(P.isDone(scene, { lessons: { [scene.lesson]: true } }), true, 'a scene is done with its lesson');
  assert.equal(P.isDone(scene, { ticks: { [scene.key]: '2026-11-15' } }), true, 'or ticked by hand');
  // two nights in, nothing done: behind by the core items of those nights
  const today = plan.nights[2].date;
  const core = plan.nights.slice(0, 2).flatMap((n) => n.items).filter((x) => x.kind !== 'flash' && x.kind !== 'review').length;
  const behind = P.pace(plan, {}, today);
  assert.equal(behind.state, 'behind');
  assert.equal(behind.n, core);
  // everything due before today done: on track
  const done = { lessons: {}, tickets: {}, labs: {} };
  for (const n of plan.nights.slice(0, 2)) for (const x of n.items) if (x.kind === 'lesson') done.lessons[x.id] = true; else if (x.kind === 'ticket') done.tickets[x.id] = 'x'; else if (x.kind === 'lab') done.labs[x.id] = 'x';
  assert.equal(P.pace(plan, done, today).state, 'on-track');
  const ln = plan.nights.slice(3).find((n) => n.items.some((x) => x.kind === 'lesson'));
  const later = ln.items.find((x) => x.kind === 'lesson');
  done.lessons[later.id] = true;
  const ahead = P.pace(plan, done, today);
  assert.equal(ahead.state, 'ahead');
  assert.equal(ahead.n, 1 + ln.items.filter((x) => x.kind === 'scene' && x.lesson === later.id).length, 'the lesson and its scenes');
});

test('shift bonus: only nights finished on or before their date count', () => {
  assert.deepEqual(P.shiftsEarned({ shifts: { '2026-11-16': '2026-11-16', '2026-11-17': '2026-11-16', '2026-11-18': '2026-11-19', bad: 'x' } }), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(P.shiftsEarned(null), []);
});

test('.ics export is valid iCalendar', () => {
  const plan = P.build(mk(60), {});
  for (const time of [null, '19:00']) {
    const text = P.ics(plan, { stamp: new Date('2026-11-15T12:00:00Z'), time });
    assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(text.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(text), 'every line ends in CRLF');
    const lines = text.split('\r\n').slice(0, -1);
    const enc = new TextEncoder();
    for (const l of lines) assert.ok(enc.encode(l).length <= 75, `line over 75 octets: ${l}`);
    assert.ok(lines.some((l) => l.startsWith(' ')), 'long lines are folded');
    const unfolded = text.replace(/\r\n /g, '').split('\r\n');
    assert.equal(unfolded.filter((l) => l === 'BEGIN:VEVENT').length, plan.nights.length + 1, 'one event per night plus exam day');
    assert.equal(unfolded.filter((l) => l === 'BEGIN:VEVENT').length, unfolded.filter((l) => l === 'END:VEVENT').length);
    for (const k of ['VERSION:2.0', 'PRODID:', 'DTSTAMP:20261115T120000Z']) assert.ok(unfolded.some((l) => l.startsWith(k)), k);
    const uids = unfolded.filter((l) => l.startsWith('UID:'));
    assert.equal(new Set(uids).size, uids.length, 'unique UIDs');
    const d = unfolded.find((l) => l.startsWith('DESCRIPTION:'));
    assert.ok(/\\n/.test(d) && !/[^\\][,;]/.test(d.slice(12).replace(/\\[,;\\n]/g, '')), 'text is escaped');
    if (time) assert.ok(unfolded.some((l) => /^DTSTART:\d{8}T190000$/.test(l)));
    else assert.ok(unfolded.some((l) => /^DTSTART;VALUE=DATE:\d{8}$/.test(l)));
  }
  // folding never splits a multi-byte character
  const f = P.fold('DESCRIPTION:' + 'é→'.repeat(60));
  for (const l of f.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75);
  assert.equal(f.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'é→'.repeat(60));
  // from: skips earlier nights
  const later = P.ics(plan, { from: plan.nights[10].date });
  assert.equal(later.replace(/\r\n /g, '').split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length, plan.nights.length - 10 + 1);
});

test('career hook: the pager prefers tonight\'s shift, and on-time nights pay XP', () => {
  const C = TT.career;
  const st = C.normalize({}, '2026-11-15');
  const plan = P.build(mk(60), {});
  const n = plan.nights[0];
  const tonight = { date: n.date, isToday: true, items: n.items, item: n.items[0], href: n.items[0].href, label: `${n.items[0].title} (+${n.items.length - 1} more)` };
  const t = C.nextTask(st, C.catalog(), 'learn', tonight);
  assert.equal(t.href, '#learn-l1-0');
  assert.match(t.line, /^Tonight's shift: Lesson 1\.0 .+ \(\+\d+ more\)$/);
  assert.equal(C.nextTask(st, C.catalog(), 'tickets', null).kind, 'ticket', 'no plan: the old behaviour');
  const later = C.nextTask(st, C.catalog(), 'tickets', Object.assign({}, tonight, { isToday: false, date: '2026-11-17' }));
  assert.match(later.line, /^Next shift Tue, Nov 17: /);
  // XP: derived from the plan's shift log, so it is idempotent
  const raw = { plan: { shifts: { '2026-11-15': '2026-11-15', '2026-11-16': '2026-11-15', '2026-11-17': '2026-11-20' } } };
  const r1 = C.compute(C.normalize(raw, '2026-11-20'));
  const r2 = C.compute(C.normalize(raw, '2026-11-20'));
  assert.equal(r1.breakdown.shifts, 2 * C.WEIGHTS.shift);
  assert.equal(r1.xp, r2.xp);
  assert.equal(C.compute(C.normalize({}, '2026-11-20')).breakdown.shifts, 0);
  const ev = C.events({ breakdown: { shifts: 0 } }, r1, C.normalize(raw, '2026-11-20'), C.catalog());
  assert.ok(ev.some((e) => e.kind === 'shift' && e.xp === 80));
});

test('the 1.0 primer goes first, with its scene and the OSI deck on the same night', () => {
  assert.equal(cat.lessons[0].id, 'l1-0');
  assert.deepEqual(cat.lessons[0].decks, ['osi']);
  for (const [name, s] of spans) {
    const plan = P.build(s, {});
    const first = plan.nights.find((n) => n.items.some((x) => x.kind === 'lesson'));
    assert.equal(first.items.find((x) => x.kind === 'lesson').id, 'l1-0', name);
    const x = first.items.filter((i) => i.lesson === 'l1-0').map((i) => i.key);
    assert.ok(x.includes('scene:sc-encapsulation'), `${name}: scene with the primer`);
    assert.ok(x.includes('flash:osi:' + first.date), `${name}: OSI deck with the primer`);
    assert.ok(first.items.filter((i) => i.kind === 'flash').length === 1, `${name}: one flashcard slot that night`);
  }
  // done primer: neither the lesson nor its deck is planned again
  const later = P.build(mk(60), { lessons: { 'l1-0': true } });
  assert.ok(!all(later).some((x) => x.id === 'l1-0' || x.lesson === 'l1-0'));
  // checkpoints stay one per domain: the primer adds no checkpoint of its own
  assert.equal(all(P.build(mk(60), {})).filter((x) => x.kind === 'checkpoint').length, 6);
});
