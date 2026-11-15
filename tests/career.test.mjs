// Career layer: XP is a pure function of saved progress; ranks and badges follow from it.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
for (const f of ['engine', 'scenarios', 'lessons-1', 'lessons-2', 'projects', 'career']) {
  await import(new URL(`../src/${f}.js`, import.meta.url));
}
const TT = globalThis.TT;
const C = TT.career;
const cat = C.catalog();
const today = '2026-11-15';
const norm = (raw) => C.normalize(raw, today);

function fullProgress() {
  const solved = Object.fromEntries(TT.tickets.map((t) => [t.id, today]));
  const done = Object.fromEntries(TT.lessons.map((l) => [l.id, true]));
  const scores = Object.fromEntries(TT.lessons.map((l) => [l.id, 3]));
  const labDone = Object.fromEntries(TT.labProjects.map((p) => [p.id, today]));
  const days = {};
  for (let i = 0; i < 10; i++) days[C.shiftDay(today, -i)] = { xp: 100, flash: 40 };
  const attempts = ['A', 'B', 'C', 'D', 'E'].map((set) => ({ date: '2026-11-10T02:00:00Z', mode: 'full', set, score: 880 }));
  return norm({
    app: { solved, drill: { best: 15 }, quiz: { best: 100 } },
    lessons: { done, scores },
    exam: { attempts, missed: [] },
    flash: { cards: { a: { seen: 600 } } },
    lab: { done: labDone },
    wlc: { done: { staff: true, guest: true, voice: true } },
    career: { days, flashBase: 0 },
  });
}

test('catalog sees the real content', () => {
  assert.equal(cat.tickets.length, TT.tickets.length);
  assert.equal(cat.lessons.length, TT.lessons.length);
  assert.equal(cat.projects.length, TT.labProjects.length);
});

test('empty progress: zero XP, first rank, no badges', () => {
  for (const s of [norm({}), norm(null), C.normalize(undefined)]) {
    const r = C.compute(s, cat);
    assert.equal(r.xp, 0);
    assert.equal(r.rankIndex, 0);
    assert.equal(r.rank.name, 'Night Shift Intern');
    assert.deepEqual(r.badges, []);
    assert.equal(r.toNext, C.RANKS[1].xp);
  }
});

test('garbage in storage does not throw or score', () => {
  const r = C.compute(norm({ app: { solved: 'x', drill: 5 }, lessons: [], exam: { attempts: [null, 3, { score: 'a' }] }, flash: { cards: null }, lab: 7 }), cat);
  assert.equal(r.xp, 0);
});

test('partial progress: weights add up', () => {
  const p1 = TT.tickets.find((t) => t.priority === 'P1');
  const p3 = TT.tickets.find((t) => t.priority === 'P3');
  const l = TT.lessons[0];
  const s = norm({
    app: { solved: { [p1.id]: today, [p3.id]: today }, drill: { best: 4 }, quiz: { best: 70 } },
    lessons: { done: { [l.id]: true }, scores: { [l.id]: 2 } },
    exam: { attempts: [{ mode: 'full', set: 'A', score: 830 }, { mode: 'practice', score: 500 }] },
    lab: { done: { [TT.labProjects[0].id]: today } },
    wlc: { done: { staff: true } },
  });
  const r = C.compute(s, cat);
  const W = C.WEIGHTS;
  assert.equal(r.breakdown.tickets, W.ticketP1 + W.ticket);
  assert.equal(r.breakdown.lessons, W.lesson + 2 * W.check);
  assert.equal(r.breakdown.labs, W.lab);
  assert.equal(r.breakdown.wlc, W.wlc);
  assert.equal(r.breakdown.exams, W.examFull + W.examPractice + W.examPass);
  assert.equal(r.breakdown.drill, 4 * W.drill);
  assert.equal(r.breakdown.quiz, 70 * W.quiz);
  assert.equal(r.xp, Object.values(r.breakdown).reduce((a, b) => a + b, 0));
  assert.ok(r.badges.includes('first-ticket') && r.badges.includes('first-lesson') && r.badges.includes('first-lab') && r.badges.includes('first-pass'));
  assert.ok(!r.badges.includes('queue-zero'));
});

test('compute is pure and idempotent', () => {
  const s = fullProgress();
  const a = JSON.stringify(C.compute(s, cat));
  const b = JSON.stringify(C.compute(s, cat));
  assert.equal(a, b);
});

test('full progress reaches CCNA-ready with every badge', () => {
  const r = C.compute(fullProgress(), cat);
  assert.equal(r.rank.name, 'CCNA-ready');
  assert.equal(r.next, null);
  assert.equal(r.pct, 1);
  assert.deepEqual(r.badges.slice().sort(), C.BADGES.map((b) => b.id).sort());
});

test('ranks: about eight, thresholds strictly rising, gates never fall', () => {
  assert.ok(C.RANKS.length >= 7 && C.RANKS.length <= 9);
  assert.equal(C.RANKS[0].xp, 0);
  for (let i = 1; i < C.RANKS.length; i++) {
    assert.ok(C.RANKS[i].xp > C.RANKS[i - 1].xp, `rank ${i} threshold`);
    assert.ok((C.RANKS[i].passes || 0) >= (C.RANKS[i - 1].passes || 0));
  }
  assert.equal(C.RANKS[C.RANKS.length - 1].name, 'CCNA-ready');
});

test('top rank needs most of the content, not just grinding one thing', () => {
  const top = C.RANKS[C.RANKS.length - 1].xp;
  const W = C.WEIGHTS;
  const content = TT.lessons.length * (W.lesson + 3 * W.check) + TT.tickets.reduce((m, t) => m + (t.priority === 'P1' ? W.ticketP1 : W.ticket), 0) + TT.labProjects.length * W.lab;
  assert.ok(top > content * 0.7, 'top rank is most of the content');
  // all content but no passing exam: stuck below the gated ranks
  const s = fullProgress();
  s.attempts = [];
  const r = C.compute(s, cat);
  assert.ok(r.xp >= C.RANKS[C.RANKS.length - 2].xp);
  assert.equal(r.rank.name, C.RANKS[C.RANKS.length - 3].name);
  assert.match(r.needs, /825/);
});

test('rank follows XP monotonically', () => {
  let last = -1;
  for (let n = 0; n <= TT.tickets.length; n++) {
    const solved = Object.fromEntries(TT.tickets.slice(0, n).map((t) => [t.id, today]));
    const r = C.compute(norm({ app: { solved } }), cat);
    assert.ok(r.rankIndex >= last);
    last = r.rankIndex;
  }
});

test('flashcards: daily cap and baseline cap', () => {
  const W = C.WEIGHTS;
  const r = C.compute(norm({ career: { flashBase: 5000, days: { [today]: { xp: 0, flash: 500 }, '2026-11-14': { flash: 7 } } } }), cat);
  assert.equal(r.breakdown.flash, W.flashBaseCap + W.flashDaily + 7);
});

test('exam bonus counts each practice exam once', () => {
  const s = norm({ exam: { attempts: [{ mode: 'full', set: 'B', score: 900 }, { mode: 'full', set: 'B', score: 910 }, { mode: 'full', score: 850 }] } });
  const r = C.compute(s, cat);
  assert.equal(r.counts.passes, 2);
  assert.equal(r.counts.setPasses, 1);
  assert.equal(r.breakdown.exams, 3 * C.WEIGHTS.examFull + 2 * C.WEIGHTS.examPass);
});

test('badges unlock at their milestones', () => {
  const has = (raw, id) => C.compute(norm(raw), cat).badges.includes(id);
  const access = TT.lessons.filter((l) => l.domain === 'access');
  const accessDone = Object.fromEntries(access.map((l) => [l.id, true]));
  assert.ok(has({ lessons: { done: accessDone } }, 'access-done'));
  delete accessDone[access[0].id];
  assert.ok(!has({ lessons: { done: accessDone } }, 'access-done'));
  const p1 = TT.tickets.filter((t) => t.priority === 'P1').map((t) => t.id);
  assert.ok(has({ app: { solved: Object.fromEntries(p1.slice(0, 5).map((id) => [id, today])) } }, 'p1-five'));
  assert.ok(!has({ app: { solved: Object.fromEntries(p1.slice(0, 4).map((id) => [id, today])) } }, 'p1-five'));
  assert.ok(has({ exam: { attempts: [{ mode: 'full', score: 825 }] } }, 'first-pass'));
  assert.ok(!has({ exam: { attempts: [{ mode: 'full', score: 824 }, { mode: 'practice', score: 1000 }] } }, 'first-pass'));
  const fiveSets = ['A', 'B', 'C', 'D', 'E'].map((set) => ({ mode: 'full', set, score: 830 }));
  assert.ok(has({ exam: { attempts: fiveSets } }, 'clean-sweep'));
  assert.ok(!has({ exam: { attempts: fiveSets.slice(1) } }, 'clean-sweep'));
  assert.ok(has({ app: { drill: { best: 10 } } }, 'subnet-10'));
  assert.ok(has({ app: { quiz: { best: 100 } } }, 'quiz-perfect'));
  assert.ok(has({ flash: { cards: { a: { seen: 300 }, b: { seen: 200 } } } }, 'flash-500'));
  assert.ok(has({ wlc: { done: { staff: true, guest: true, voice: true } } }, 'wlc-all'));
  assert.ok(C.BADGES.length >= 10 && C.BADGES.length <= 15);
  assert.equal(new Set(C.BADGES.map((b) => b.id)).size, C.BADGES.length);
  for (const b of C.BADGES) assert.ok(b.name && b.hint && b.icon, b.id);
});

test('streaks: current and longest from the day log', () => {
  const days = {};
  for (let i = 0; i < 7; i++) days[C.shiftDay(today, -i)] = { xp: 50 };
  days['2026-10-01'] = { xp: 10 };
  assert.deepEqual(C.streaks(days, today), { current: 7, longest: 7 });
  // nothing yet today: yesterday's streak is still alive
  delete days[today];
  assert.deepEqual(C.streaks(days, today), { current: 6, longest: 6 });
  assert.ok(C.compute(norm({ career: { days: Object.assign(days, { [today]: { xp: 1 } }) } }), cat).badges.includes('streak-7'));
  assert.equal(C.shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(C.shiftDay('2026-12-31', 1), '2027-01-01');
});

test('events: new solves, badges and promotions, nothing on a repeat', () => {
  const before = norm({});
  const r0 = C.compute(before, cat);
  const seen = C.snapshotSeen(r0, before, cat);
  const solved = Object.fromEntries(TT.tickets.slice(0, 3).map((t) => [t.id, today]));
  const after = norm({ app: { solved } });
  const r1 = C.compute(after, cat);
  const ev = C.events(seen, r1, after, cat);
  assert.equal(ev.filter((e) => e.kind === 'ticket').length, 3);
  assert.ok(ev.some((e) => e.kind === 'badge' && e.badge.id === 'first-ticket'));
  assert.ok(ev.some((e) => e.kind === 'rank' && e.rankIndex === r1.rankIndex));
  assert.match(ev[0].text, /^TT-\d{4} resolved$/);
  assert.deepEqual(C.events(C.snapshotSeen(r1, after, cat), r1, after, cat), []);
});

test('backfill builds a day log from dated progress', () => {
  const s = norm({ app: { solved: { t01: '2026-11-13', t04: '2026-11-13' } }, lab: { done: { basics: '2026-11-14' } } });
  const d = C.backfill(s, cat);
  assert.equal(d['2026-11-13'].xp, C.WEIGHTS.ticket + C.WEIGHTS.ticketP1);
  assert.equal(d['2026-11-14'].xp, C.WEIGHTS.lab);
});

test('next task: lesson on Learn, ticket elsewhere, every ticket has a pager line', () => {
  const s = norm({ app: { solved: { t01: today } } });
  const onLearn = C.nextTask(s, cat, 'learn');
  assert.equal(onLearn.kind, 'lesson');
  assert.equal(onLearn.href, '#learn-' + cat.lessons[0].id);
  const onTickets = C.nextTask(s, cat, 'tickets');
  assert.equal(onTickets.href, '#t02');
  for (const t of TT.tickets) assert.ok(C.PAGER_LINES[t.id], t.id);
  assert.equal(C.nextTask(fullProgress(), cat, 'tickets').href, '#exam');
});
