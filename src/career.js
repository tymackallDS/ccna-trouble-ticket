/* Trouble Ticket — the career layer: XP, ranks, badges, pager toasts and the shift record.
 * An observer: it never writes another module's storage. It reads saved progress, derives XP with a
 * pure function (TT.career.compute), and diffs against the last state it saw to raise pager toasts.
 *
 * Reads (never writes):
 *   trouble-ticket-v1          { solved: { t01: 'YYYY-MM-DD' }, drill: { best }, quiz: { best } }   (app.js)
 *   trouble-ticket-lessons-v1  { done: { id: true }, scores: { id: 0..3 } }                          (lessons-ui.js)
 *   trouble-ticket-exam-v1     { attempts: [{ date, mode, set, score, ... }], missed }              (exam-ui.js)
 *   trouble-ticket-flash-v1    { cards: { id: { box, due, seen, lapses } } }                        (flash-ui.js)
 *   trouble-ticket-sandbox-v1  { done: { projectId: 'YYYY-MM-DD' }, ... }                           (sandbox.js)
 *   trouble-ticket-wlc-v1      { done: { taskId: true }, ... }                                       (wlc.js)
 * Owns: trouble-ticket-career-v1 { v, seen, flashBase, flashLast, days: { 'YYYY-MM-DD': { xp, flash } } }
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  const KEY = 'trouble-ticket-career-v1';
  const SOURCES = {
    app: 'trouble-ticket-v1',
    lessons: 'trouble-ticket-lessons-v1',
    exam: 'trouble-ticket-exam-v1',
    flash: 'trouble-ticket-flash-v1',
    lab: 'trouble-ticket-sandbox-v1',
    wlc: 'trouble-ticket-wlc-v1',
  };

  /* ================= rules (pure data) ================= */
  const W = {
    lesson: 50, check: 5, ticket: 100, ticketP1: 150, lab: 120, wlc: 40,
    examFull: 30, examFullCap: 20, examPractice: 10, examPracticeCap: 30, examPass: 150, PASS: 825,
    flashDaily: 60, flashBaseCap: 300, drill: 5, drillCap: 30, quiz: 2,
  };
  const SET_IDS = ['A', 'B', 'C', 'D', 'E'];

  const RANKS = [
    { name: 'Night Shift Intern', short: 'Intern', xp: 0, line: 'Badge photo is terrible. Everyone\'s is.' },
    { name: 'Tier 1 NOC Tech', short: 'T1 NOC', xp: 250, line: 'You can have the second chair now. Not the good mug.' },
    { name: 'Tier 2 NOC Tech', short: 'T2 NOC', xp: 800, line: 'Tier 1 escalates to you now. Be nice to them.' },
    { name: 'Network Technician', short: 'Net Tech', xp: 1700, line: 'They are putting your name on the closet key list.' },
    { name: 'Network Administrator', short: 'Net Admin', xp: 3000, line: 'Enable secret is yours. Don\'t make me regret it.' },
    { name: 'Senior Network Admin', short: 'Sr Admin', xp: 4600, line: 'The day shift asked for you by name. Twice.' },
    { name: 'Network Engineer', short: 'Net Eng', xp: 6500, passes: 1, line: 'You design it now. You also get paged when it breaks.' },
    { name: 'CCNA-ready', short: 'CCNA-ready', xp: 8500, passes: 3, line: 'Book the exam. I mean it. Tonight.' },
  ];

  // test(c) reads the counts object returned by compute(). Hints describe how to earn a locked badge.
  const BADGES = [
    { id: 'first-ticket', name: 'First page answered', icon: 'ticket', hint: 'Resolve any trouble ticket.', test: (c) => c.tickets >= 1 },
    { id: 'p1-five', name: 'P1 regular', icon: 'siren', hint: 'Resolve five P1 tickets.', test: (c) => c.p1 >= 5 },
    { id: 'queue-zero', name: 'Queue zero', icon: 'inbox', hint: 'Resolve every ticket in the queue.', test: (c) => c.ticketsTotal > 0 && c.tickets >= c.ticketsTotal },
    { id: 'first-lesson', name: 'Opened the binder', icon: 'book', hint: 'Pass the check at the end of any lesson.', test: (c) => c.lessons >= 1 },
    { id: 'access-done', name: 'Layer 2 sorted', icon: 'switch', hint: 'Finish every domain 2.0 Network Access lesson.', test: (c) => c.accessTotal > 0 && c.access >= c.accessTotal },
    { id: 'binder-done', name: 'Read the whole binder', icon: 'stack', hint: 'Finish every lesson in all six domains.', test: (c) => c.lessonsTotal > 0 && c.lessons >= c.lessonsTotal },
    { id: 'first-lab', name: 'Built from scratch', icon: 'lab', hint: 'Complete any guided Lab project.', test: (c) => c.labs >= 1 },
    { id: 'all-labs', name: 'Lab bench veteran', icon: 'rack', hint: 'Complete every guided Lab project.', test: (c) => c.labsTotal > 0 && c.labs >= c.labsTotal },
    { id: 'wlc-all', name: 'Controller hand', icon: 'wifi', hint: 'Finish all three wireless controller tasks.', test: (c) => c.wlcTotal > 0 && c.wlc >= c.wlcTotal },
    { id: 'first-pass', name: 'Over the line', icon: 'check', hint: 'Score 825 or more on a full mock exam.', test: (c) => c.passes >= 1 },
    { id: 'clean-sweep', name: 'Clean sweep', icon: 'five', hint: 'Score 825+ on all five practice exams (A to E).', test: (c) => c.setPasses >= SET_IDS.length },
    { id: 'streak-7', name: 'Seven nights straight', icon: 'calendar', hint: 'Study on seven days in a row.', test: (c) => c.longest >= 7 },
    { id: 'flash-500', name: 'Muscle memory', icon: 'cards', hint: 'Review 500 flashcards.', test: (c) => c.flashSeen >= 500 },
    { id: 'subnet-10', name: 'No calculator needed', icon: 'grid', hint: 'Get a streak of 10 in the subnet drill.', test: (c) => c.drillBest >= 10 },
    { id: 'quiz-perfect', name: 'Perfect ten', icon: 'target', hint: 'Score 100% on a full quick quiz.', test: (c) => c.quizBest >= 100 },
  ];

  const PAGER_LINES = {
    t01: 'Canton edge router still sitting at factory defaults',
    t02: 'Dundalk scanner subnet plan does not add up',
    t03: 'Sales on 3F: PCs fine, printer unreachable',
    t04: 'HR-PC1 lost the second floor after the change window',
    t05: 'Glen Burnie branch dark across the new /30',
    t06: 'HPL-DC rebuilt, OSPF neighbors gone, DC unreachable',
    t07: 'Canton inter-VLAN routing down on the stick',
    t08: 'A closet switch is root bridge again. Floors are slow',
    t09: 'LACP bundle is only using one of its two links',
    t10: 'Dundalk scanners all stuck on 169.254',
    t11: 'Audit: guest Wi-Fi can reach the finance server',
    t12: 'Warehouse has no internet behind PAT',
    t13: 'IPv6 pilot pings die at the HQ router',
    t14: 'Security scan: edge router still takes Telnet',
    t15: 'New hire on Fa0/3 has no link light',
    t16: 'Second floor gateway did not fail over last week',
    t17: 'HPL-DR rebuilt and missing from EIGRP',
    t18: 'Sales PCs pulling 192.168.1.x from a rogue DHCP server',
    t19: 'HPL-EDGE won the DR election again',
    t20: 'Floor 6 cutover to the HPL-CORE1 Layer 3 switch',
    t21: 'WEB-TRACK unreachable from the internet',
    t22: 'A conference room switch took over as STP root',
    t23: 'HPL-BR2 go-live checklist due before the movers leave',
  };
  const KENJI = [
    'Nice. Write it in the ticket before you forget how you did it.',
    'Show commands first, config second. You did it in the right order.',
    'Coffee is fresh. The next one is already in the queue.',
    'Don\'t tell the day shift it was that quick.',
    'That one comes back on the exam. Put it in your notes.',
    'Clean fix. No reload needed. That is the job.',
  ];

  /* ================= pure helpers ================= */
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const obj = (x) => (isObj(x) ? x : {});
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : Number(x) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const shiftDay = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
  const isDayKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const objKey = (o) => String(o || '').split('.').map((x) => Number(x) || 0);
  const byObj = (a, b) => { const x = objKey(a.obj); const y = objKey(b.obj); return x[0] - y[0] || x[1] - y[1]; };

  /** The content catalog XP is measured against. Falls back to empty lists when the data files are absent. */
  function catalog() {
    return {
      tickets: (TT.tickets || []).map((t) => ({ id: t.id, number: t.number, priority: t.priority, title: t.title })),
      lessons: (TT.lessons || []).map((l) => ({ id: l.id, domain: l.domain, obj: l.obj, title: l.title })).sort(byObj),
      projects: (TT.labProjects || []).map((p) => ({ id: p.id, title: p.title })),
      wlc: (TT.wlcTasks || []).map((t) => ({ id: t.id, title: t.title })),
    };
  }

  /** Normalize raw stored objects (already parsed) into the state compute() expects. */
  function normalize(raw, today) {
    raw = obj(raw);
    const app = obj(raw.app);
    const les = obj(raw.lessons);
    const ex = obj(raw.exam);
    const fl = obj(obj(raw.flash).cards);
    const car = obj(raw.career);
    let flashSeen = 0;
    for (const k of Object.keys(fl)) flashSeen += Math.max(0, num(obj(fl[k]).seen));
    return {
      today: today || dayKey(new Date()),
      solved: obj(app.solved),
      drillBest: num(obj(app.drill).best),
      quizBest: obj(app.quiz).best == null ? 0 : num(obj(app.quiz).best),
      lessonsDone: obj(les.done),
      lessonScores: obj(les.scores),
      attempts: (Array.isArray(ex.attempts) ? ex.attempts : []).filter((a) => isObj(a) && typeof a.score === 'number'),
      flashSeen,
      labDone: obj(obj(raw.lab).done),
      wlcDone: obj(obj(raw.wlc).done),
      days: obj(car.days),
      flashBase: num(car.flashBase),
    };
  }

  function streaks(days, today) {
    const active = (k) => { const d = obj(days[k]); return num(d.xp) > 0 || num(d.flash) > 0; };
    const keys = Object.keys(days).filter((k) => isDayKey(k) && active(k)).sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      run = prev && shiftDay(prev, 1) === k ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = k;
    }
    let current = 0;
    if (today) {
      let k = active(today) ? today : shiftDay(today, -1);
      while (active(k)) { current++; k = shiftDay(k, -1); }
    }
    return { current, longest };
  }

  /** Pure: same state in, same result out. state comes from normalize(). */
  function compute(state, cat) {
    const s = state || {};
    cat = cat || catalog();
    const solved = obj(s.solved);
    const done = obj(s.lessonsDone);
    const scores = obj(s.lessonScores);
    const labDone = obj(s.labDone);
    const wlcDone = obj(s.wlcDone);
    const days = obj(s.days);

    const tickets = cat.tickets && cat.tickets.length ? cat.tickets : Object.keys(solved).map((id) => ({ id }));
    const tSolved = tickets.filter((t) => solved[t.id]);
    const p1 = tSolved.filter((t) => t.priority === 'P1').length;
    const lessons = cat.lessons && cat.lessons.length ? cat.lessons : Object.keys(done).map((id) => ({ id }));
    const lDone = lessons.filter((l) => done[l.id]);
    const access = lessons.filter((l) => l.domain === 'access');
    const checkPts = lessons.reduce((m, l) => m + Math.max(0, Math.min(3, Math.floor(num(scores[l.id])))), 0);
    const projects = cat.projects && cat.projects.length ? cat.projects : Object.keys(labDone).map((id) => ({ id }));
    const labs = projects.filter((p) => labDone[p.id]).length;
    const wlcTasks = cat.wlc && cat.wlc.length ? cat.wlc : Object.keys(wlcDone).map((id) => ({ id }));
    const wlc = wlcTasks.filter((t) => wlcDone[t.id]).length;

    const attempts = Array.isArray(s.attempts) ? s.attempts : [];
    const full = attempts.filter((a) => a.mode === 'full');
    const other = attempts.length - full.length;
    const passKeys = new Set(full.filter((a) => num(a.score) >= W.PASS).map((a) => (SET_IDS.includes(a.set) ? a.set : 'random')));
    const setPasses = SET_IDS.filter((k) => passKeys.has(k)).length;
    const best = attempts.reduce((m, a) => Math.max(m, num(a.score)), 0);

    let flashXp = Math.min(Math.max(0, num(s.flashBase)), W.flashBaseCap);
    for (const k of Object.keys(days)) flashXp += Math.min(Math.max(0, num(obj(days[k]).flash)), W.flashDaily);
    const drillBest = Math.max(0, num(s.drillBest));
    const quizBest = Math.max(0, Math.min(100, num(s.quizBest)));

    const breakdown = {
      tickets: (tSolved.length - p1) * W.ticket + p1 * W.ticketP1,
      lessons: lDone.length * W.lesson + checkPts * W.check,
      labs: labs * W.lab,
      wlc: wlc * W.wlc,
      exams: Math.min(full.length, W.examFullCap) * W.examFull + Math.min(other, W.examPracticeCap) * W.examPractice + passKeys.size * W.examPass,
      flash: flashXp,
      drill: Math.min(drillBest, W.drillCap) * W.drill,
      quiz: Math.round(quizBest) * W.quiz,
    };
    const xp = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const st = streaks(days, s.today);
    const counts = {
      tickets: tSolved.length, ticketsTotal: tickets.length, p1,
      lessons: lDone.length, lessonsTotal: lessons.length, access: access.filter((l) => done[l.id]).length, accessTotal: access.length,
      labs, labsTotal: projects.length, wlc, wlcTotal: wlcTasks.length,
      attempts: attempts.length, passes: passKeys.size, setPasses, bestExam: best,
      flashSeen: Math.max(0, num(s.flashSeen)), drillBest, quizBest, streak: st.current, longest: st.longest,
    };

    let rankIndex = 0;
    for (let i = 1; i < RANKS.length; i++) {
      if (xp >= RANKS[i].xp && counts.passes >= (RANKS[i].passes || 0)) rankIndex = i; else break;
    }
    const rank = RANKS[rankIndex];
    const next = RANKS[rankIndex + 1] || null;
    let toNext = 0;
    let pct = 1;
    let needs = '';
    if (next) {
      toNext = Math.max(0, next.xp - xp);
      pct = Math.max(0, Math.min(1, (xp - rank.xp) / (next.xp - rank.xp)));
      if (next.passes && counts.passes < next.passes) {
        const left = next.passes - counts.passes;
        needs = `Score 825+ on ${left} more full mock exam${left === 1 ? '' : 's'}${next.passes > 1 ? ' (different exams)' : ''}`;
      }
    }
    const badges = BADGES.filter((b) => { try { return !!b.test(counts); } catch (e) { return false; } }).map((b) => b.id);
    return { xp, breakdown, counts, rankIndex, rank, next, toNext, pct, needs, badges };
  }

  /** Pure: the toasts owed between what was last seen and what is true now. */
  function events(seen, res, state, cat) {
    seen = obj(seen);
    cat = cat || catalog();
    const out = [];
    const prevB = obj(seen.breakdown);
    const had = (list, id) => Array.isArray(list) && list.includes(id);
    const solved = obj(state.solved);
    for (const t of cat.tickets) {
      if (solved[t.id] && !had(seen.tickets, t.id)) {
        out.push({ kind: 'ticket', tag: 'PAGE', text: `${t.number || t.id} resolved`, xp: t.priority === 'P1' ? W.ticketP1 : W.ticket, kenji: true });
      }
    }
    const lessonGain = res.breakdown.lessons - num(prevB.lessons);
    if (lessonGain > 0) {
      const fresh = cat.lessons.filter((l) => obj(state.lessonsDone)[l.id] && !had(seen.lessons, l.id));
      out.push({ kind: 'lesson', tag: 'LESSON', text: fresh.length === 1 ? `${fresh[0].obj} signed off` : fresh.length ? `${fresh.length} lessons signed off` : 'Lesson check answers logged', xp: lessonGain });
    }
    const labGain = res.breakdown.labs - num(prevB.labs);
    if (labGain > 0) {
      const fresh = cat.projects.filter((p) => obj(state.labDone)[p.id] && !had(seen.labs, p.id));
      out.push({ kind: 'lab', tag: 'LAB', text: fresh.length === 1 ? `"${fresh[0].title}" built and verified` : 'Lab project complete', xp: labGain, kenji: true });
    }
    const wlcGain = res.breakdown.wlc - num(prevB.wlc);
    if (wlcGain > 0) out.push({ kind: 'wlc', tag: 'WLC', text: 'Wireless controller task resolved', xp: wlcGain });
    const examGain = res.breakdown.exams - num(prevB.exams);
    if (examGain > 0) {
      const last = state.attempts[state.attempts.length - 1];
      const pass = last && last.mode === 'full' && last.score >= W.PASS;
      out.push({ kind: 'exam', tag: 'EXAM', text: last ? `${last.mode === 'full' ? (last.set ? 'Practice exam ' + last.set : 'Mock exam') : 'Practice set'} scored ${last.score}${pass ? ' · PASS' : ''}` : 'Mock exam logged', xp: examGain });
    }
    const minor = [['flash', 'FLASH', 'Flashcard reviews'], ['drill', 'DRILL', 'New subnet drill best'], ['quiz', 'QUIZ', 'New quick quiz best']];
    for (const [k, tag, text] of minor) {
      const g = res.breakdown[k] - num(prevB[k]);
      if (g > 0) out.push({ kind: k, tag, text, xp: g, minor: true });
    }
    for (const id of res.badges) {
      if (!had(seen.badges, id)) { const b = BADGES.find((x) => x.id === id); out.push({ kind: 'badge', tag: 'BADGE', text: b.name, badge: b }); }
    }
    if (typeof seen.rankIndex === 'number' && res.rankIndex > seen.rankIndex) out.push({ kind: 'rank', rank: res.rank, rankIndex: res.rankIndex });
    return out;
  }

  function snapshotSeen(res, state, cat) {
    return {
      xp: res.xp, rankIndex: res.rankIndex, badges: res.badges.slice(), breakdown: Object.assign({}, res.breakdown),
      tickets: cat.tickets.filter((t) => obj(state.solved)[t.id]).map((t) => t.id),
      lessons: cat.lessons.filter((l) => obj(state.lessonsDone)[l.id]).map((l) => l.id),
      labs: cat.projects.filter((p) => obj(state.labDone)[p.id]).map((p) => p.id),
    };
  }

  /** First visit: rebuild a day log from dated progress so the activity strip and streak are not blank. */
  function backfill(state, cat) {
    const days = {};
    const add = (d, xp) => { if (!isDayKey(d)) return; const x = (days[d] = days[d] || { xp: 0, flash: 0 }); x.xp += xp; };
    const pri = Object.fromEntries(cat.tickets.map((t) => [t.id, t.priority]));
    for (const [id, d] of Object.entries(obj(state.solved))) add(String(d).slice(0, 10), pri[id] === 'P1' ? W.ticketP1 : W.ticket);
    for (const d of Object.values(obj(state.labDone))) add(String(d).slice(0, 10), W.lab);
    for (const a of state.attempts) if (a.date) add(dayKey(new Date(a.date)), a.mode === 'full' ? W.examFull : W.examPractice);
    return days;
  }

  function nextTask(state, cat, where) {
    cat = cat || catalog();
    const t = cat.tickets.find((x) => !obj(state.solved)[x.id]);
    const l = cat.lessons.find((x) => !obj(state.lessonsDone)[x.id]);
    if (where === 'learn' && l) return { kind: 'lesson', id: l.id, href: '#learn-' + l.id, label: l.obj, title: l.title, line: `Kenji wants ${l.obj} read before the 03:00 walk-through: ${l.title}` };
    if (t) return { kind: 'ticket', id: t.id, href: '#' + t.id, label: t.number, title: t.title, line: PAGER_LINES[t.id] || t.title };
    if (l) return { kind: 'lesson', id: l.id, href: '#learn-' + l.id, label: l.obj, title: l.title, line: `Queue is clear. Read ${l.obj} while it is quiet` };
    return { kind: 'exam', id: 'exam', href: '#exam', label: 'mock exam', title: 'Full mock exam', line: 'Queue is clear and the binder is done. Take a full mock exam' };
  }

  function pagerTime(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hrs = [22, 23, 0, 1, 2, 3, 4, 5];
    return `${pad(hrs[h % hrs.length])}:${pad((h >>> 3) % 60)}`;
  }

  TT.career = { KEY, SOURCES, WEIGHTS: W, RANKS, BADGES, PAGER_LINES, compute, normalize, events, streaks, backfill, nextTask, catalog, dayKey, shiftDay, snapshotSeen };

  /* ================= browser layer ================= */
  const doc = G.document;
  if (!doc || !doc.querySelector || !G.localStorage) return;

  const reduced = () => !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const $ = (s, r) => (r || doc).querySelector(s);
  const readRaw = (k) => { try { return G.localStorage.getItem(k); } catch (e) { return null; } };
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  let career = null; // my stored record
  let res = null; // last compute()
  let state = null;
  let lastRaw = null;
  let kenjiTurn = 0;
  const pending = { flash: 0 };

  function loadCareer() {
    const c = parse(readRaw(KEY));
    return isObj(c) && c.v === 1 ? c : null;
  }
  function saveCareer() { try { G.localStorage.setItem(KEY, JSON.stringify(career)); } catch (e) { /* storage blocked: the record lasts for this visit */ } }

  function readAll() {
    const raws = {};
    for (const [k, key] of Object.entries(SOURCES)) raws[k] = readRaw(key);
    return raws;
  }

  function tick(opts) {
    const raws = readAll();
    const today = dayKey(new Date());
    const sig = Object.values(raws).concat(today);
    if (!(opts && opts.force) && lastRaw && sig.every((x, i) => x === lastRaw[i])) return;
    lastRaw = sig;
    const parsed = {};
    for (const k of Object.keys(raws)) parsed[k] = parse(raws[k]);
    const cat = catalog();
    if (!career) career = loadCareer();
    let first = false;
    if (!career) {
      first = true;
      parsed.career = {};
      const s0 = normalize(parsed, today);
      career = { v: 1, flashBase: s0.flashSeen, flashLast: s0.flashSeen, days: backfill(s0, cat), seen: null };
    }
    // flashcard reviews since we last looked count toward today (capped per day inside compute)
    parsed.career = career;
    let s = normalize(parsed, today);
    const delta = s.flashSeen - num(career.flashLast);
    if (delta > 0) { const d = (career.days[today] = career.days[today] || { xp: 0, flash: 0 }); d.flash = num(d.flash) + delta; }
    career.flashLast = s.flashSeen;
    s = normalize(parsed, today);
    let r = compute(s, cat);
    if (career.seen) {
      const gain = r.xp - num(career.seen.xp);
      if (gain > 0) {
        const d = (career.days[today] = career.days[today] || { xp: 0, flash: 0 });
        d.xp = num(d.xp) + gain;
        s = normalize(parsed, today);
        r = compute(s, cat); // the streak may have moved
      }
    }
    const evs = first ? [] : events(career.seen, r, s, cat);
    const prevXp = career.seen ? career.seen.xp : r.xp;
    career.seen = snapshotSeen(r, s, cat);
    // keep the day log small: 120 days is plenty for a 14-day strip and streaks
    const keys = Object.keys(career.days).sort();
    if (keys.length > 120) for (const k of keys.slice(0, keys.length - 120)) delete career.days[k];
    saveCareer();
    state = s;
    res = r;
    renderChip(prevXp !== r.xp);
    deliver(evs);
    refreshInjected();
  }

  /* ---------- SVG bits ---------- */
  function insignia(i, cls) {
    // chevrons for ranks 1-6, a bar for the intern, a star for the top rank
    const parts = [];
    if (i === 0) parts.push('<rect x="5" y="10" width="14" height="4" rx="1"/>');
    else if (i >= RANKS.length - 1) parts.push('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>');
    else {
      const n = Math.min(i, 3);
      for (let k = 0; k < n; k++) parts.push(`<path d="M4 ${7 + k * 5}l8 4.5 8-4.5" fill="none" stroke-width="2.4" stroke-linejoin="round"/>`);
      if (i > 3) parts.push(`<rect x="6" y="${i === 4 ? 21 : 20}" width="12" height="2" rx="1"/>`);
      if (i > 5) parts.push('<rect x="6" y="2" width="12" height="2" rx="1"/>');
    }
    return `<svg class="${cls || 'cr-ins'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
  }
  const GLYPHS = {
    ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M9 7v10" stroke-dasharray="2 2"/>',
    siren: '<path d="M6 17v-5a6 6 0 0 1 12 0v5"/><path d="M4 17h16v3H4z"/><path d="M12 3v2M4.5 6l1.4 1.4M19.5 6l-1.4 1.4"/>',
    inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    switch: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 12h1M10 12h1M13 12h1M16 12h1"/>',
    stack: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/>',
    lab: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M12 10v4"/>',
    rack: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 8h14M5 13h14M8 5.5h1M8 10.5h1M8 15.5h1"/>',
    wifi: '<path d="M3 9a13 13 0 0 1 18 0"/><path d="M6.5 12.5a8 8 0 0 1 11 0"/><path d="M10 16a3 3 0 0 1 4 0"/><path d="M12 19.5h.01"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
    five: '<path d="M4 18V8M8 18V8M12 18V8M16 18V8M3 15l15-5"/><path d="M20 18v-2"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4M8 14h2M14 14h2M8 17h2"/>',
    cards: '<rect x="7" y="4" width="12" height="15" rx="1.5"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>',
    grid: '<path d="M4 4h16v16H4zM4 12h16M12 4v16M8 4v16M16 4v16M4 8h16M4 16h16" stroke-width="1"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  };
  const glyph = (name) => `<svg class="cr-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPHS[name] || GLYPHS.check}</svg>`;

  /* ---------- header chip and panel ---------- */
  let hud = null;
  function ensureHud() {
    if (hud && doc.contains(hud)) return hud;
    const mast = $('header.mast') || $('header');
    if (!mast) return null;
    hud = doc.createElement('div');
    hud.className = 'cr-hud';
    hud.innerHTML = `
      <button type="button" class="cr-chip" aria-expanded="false" aria-controls="cr-panel"></button>
      <div class="cr-panel" id="cr-panel" role="region" aria-label="Shift record summary" hidden></div>`;
    place();
    const chip = $('.cr-chip', hud);
    chip.addEventListener('click', () => togglePanel());
    hud.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('.cr-panel', hud).hidden) { togglePanel(false); chip.focus(); } });
    doc.addEventListener('click', (e) => { if (hud && !hud.contains(e.target) && !$('.cr-panel', hud).hidden) togglePanel(false); });
    return hud;
  }
  /* Wide screens: sit inside the theme helper's top-right cluster (.tt-hud) when it exists.
   * Narrower screens: a row of its own under the wordmark, so nothing overlaps. */
  function place() {
    if (!hud) return;
    const mast = $('header.mast') || $('header');
    if (!mast) return;
    const wide = !G.matchMedia || G.matchMedia('(min-width: 901px)').matches;
    const th = $('.tt-hud', mast);
    if (wide && th) { if (hud.parentNode !== th) th.insertBefore(hud, th.firstChild); return; }
    const brand = $('.brand', mast);
    if (brand && brand.parentNode === mast) { if (brand.nextElementSibling !== hud) brand.insertAdjacentElement('afterend', hud); }
    else if (hud.parentNode !== mast) mast.insertBefore(hud, mast.firstChild);
  }
  function togglePanel(force) {
    const panel = $('.cr-panel', hud);
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    $('.cr-chip', hud).setAttribute('aria-expanded', String(open));
    if (open) panel.innerHTML = panelHtml();
  }
  function renderChip(bump) {
    if (!ensureHud() || !res) return;
    const chip = $('.cr-chip', hud);
    const pct = Math.round(res.pct * 100);
    chip.setAttribute('aria-label', `Shift record: ${res.rank.name}, ${fmt(res.xp)} XP${res.next ? `, ${fmt(res.toNext)} XP to ${res.next.name}` : ''}. Show details.`);
    chip.innerHTML = `${insignia(res.rankIndex)}<span class="cr-chip-txt"><span class="cr-chip-rank">${esc(res.rank.short)}</span><span class="cr-chip-xp">${fmt(res.xp)} XP</span></span><span class="cr-chip-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
    if (bump && !reduced()) { chip.classList.remove('cr-bump'); void chip.offsetWidth; chip.classList.add('cr-bump'); }
    const panel = $('.cr-panel', hud);
    if (!panel.hidden) panel.innerHTML = panelHtml();
  }
  function panelHtml() {
    const r = res;
    const c = r.counts;
    const earned = BADGES.filter((b) => r.badges.includes(b.id));
    return `
      <div class="cr-p-head">${insignia(r.rankIndex, 'cr-ins cr-ins-lg')}<div><p class="cr-kicker">Shift record</p><p class="cr-p-rank">${esc(r.rank.name)}</p></div></div>
      ${meter(r)}
      <dl class="cr-p-stats">
        <div><dt>Tickets</dt><dd>${c.tickets} / ${c.ticketsTotal}</dd></div>
        <div><dt>Lessons</dt><dd>${c.lessons} / ${c.lessonsTotal}</dd></div>
        <div><dt>Labs</dt><dd>${c.labs} / ${c.labsTotal}</dd></div>
        <div><dt>Streak</dt><dd>${c.streak} day${c.streak === 1 ? '' : 's'}</dd></div>
      </dl>
      <p class="cr-p-badges">${earned.length ? `${earned.length} of ${BADGES.length} badges` : 'No badges yet. Resolve a ticket to earn the first.'}</p>
      <a class="btn cr-p-link" href="#progress">Open the full shift record</a>`;
  }
  function meter(r) {
    const pct = Math.round(r.pct * 100);
    const label = r.next ? `${fmt(r.xp)} XP · ${fmt(r.toNext)} to ${esc(r.next.name)}` : `${fmt(r.xp)} XP · top rank`;
    return `<div class="cr-meter"><div class="cr-meter-bar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${label.replace(/&amp;/g, '&')}"><i style="width:${pct}%"></i></div><p class="cr-meter-txt">${label}</p>${r.needs ? `<p class="cr-needs">Also needed: ${esc(r.needs)}.</p>` : ''}</div>`;
  }

  /* ---------- pager toasts ---------- */
  let stack = null;
  let live = null;
  function ensureStack() {
    if (stack && doc.contains(stack)) return;
    stack = doc.createElement('div');
    stack.className = 'cr-stack';
    stack.setAttribute('role', 'region');
    stack.setAttribute('aria-label', 'Pager');
    live = doc.createElement('div');
    live.className = 'cr-live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'false');
    doc.body.appendChild(stack);
    doc.body.appendChild(live);
  }
  function say(text) {
    ensureStack();
    const p = doc.createElement('p');
    p.textContent = text;
    live.appendChild(p);
    while (live.childNodes.length > 4) live.removeChild(live.firstChild);
  }
  /** Merge bursts (a reset-and-restore, a second tab, a big import) so the pager never floods. */
  function deliver(evs) {
    const tickets = evs.filter((e) => e.kind === 'ticket');
    const badges = evs.filter((e) => e.kind === 'badge');
    let list = evs.filter((e) => e.kind !== 'ticket' && e.kind !== 'badge' && e.kind !== 'rank');
    if (tickets.length > 2) list.unshift({ kind: 'tickets', tag: 'PAGE', text: `${tickets.length} tickets resolved`, xp: tickets.reduce((m, e) => m + e.xp, 0) });
    else list = tickets.concat(list);
    if (badges.length > 1) list.push({ kind: 'badges', tag: 'BADGE', text: `${badges.length} badges earned: ${badges.map((e) => e.text).join(', ')}` });
    else list = list.concat(badges);
    if (list.length > 4) {
      const keep = list.slice(0, 3);
      const rest = list.slice(3);
      keep.push({ kind: 'more', tag: 'LOG', text: `${rest.length} more updates on the shift record`, xp: rest.reduce((m, e) => m + (e.xp || 0), 0) });
      list = keep;
    }
    list.forEach(announce);
    const rank = evs.find((e) => e.kind === 'rank');
    if (rank) promote(rank);
  }
  function announce(e) {
    if (e.kind === 'rank') { promote(e); return; }
    if (e.kind === 'flash') { pending.flash += e.xp; if (pending.flash < 10) return; e = Object.assign({}, e, { xp: pending.flash }); pending.flash = 0; }
    let kenji = '';
    if (e.kenji) { kenjiTurn++; if (kenjiTurn % 2 === 1) kenji = KENJI[Math.floor(kenjiTurn / 2) % KENJI.length]; }
    toast({ tag: e.tag, text: e.text, xp: e.xp, kenji, badge: e.badge });
  }
  function toast(t) {
    ensureStack();
    const el = doc.createElement('div');
    el.className = 'cr-toast' + (t.badge ? ' cr-toast-badge' : '');
    const head = `${t.tag} · ${t.text}`;
    el.innerHTML = `
      <span class="cr-dot" aria-hidden="true"></span>
      <div class="cr-toast-body">
        <p class="cr-toast-head">${t.badge ? glyph(t.badge.icon) : ''}<span>${esc(head)}</span>${t.xp ? `<b class="cr-toast-xp">+${fmt(t.xp)} XP</b>` : ''}</p>
        ${t.badge ? `<p class="cr-toast-sub">Badge earned: ${esc(t.badge.hint.replace(/\.$/, ''))}</p>` : ''}
        ${t.kenji ? `<p class="cr-toast-sub">KENJI: ${esc(t.kenji)}</p>` : ''}
      </div>
      <button type="button" class="cr-x" aria-label="Dismiss page">×</button>`;
    say(`${head}${t.xp ? `, plus ${t.xp} XP` : ''}.${t.kenji ? ' Kenji: ' + t.kenji : ''}`);
    stack.appendChild(el);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild);
    let timer = null;
    let left = t.kenji || t.badge ? 7000 : 5200;
    let started = Date.now();
    const close = () => {
      clearTimeout(timer);
      if (!el.isConnected) return;
      if (reduced()) { el.remove(); return; }
      el.classList.add('cr-out');
      setTimeout(() => el.remove(), 260);
    };
    const arm = () => { started = Date.now(); timer = setTimeout(close, left); };
    const hold = () => { clearTimeout(timer); left = Math.max(1500, left - (Date.now() - started)); };
    el.addEventListener('mouseenter', hold);
    el.addEventListener('mouseleave', arm);
    el.addEventListener('focusin', hold);
    el.addEventListener('focusout', arm);
    $('.cr-x', el).addEventListener('click', close);
    arm();
  }

  /* ---------- rank-up overlay ---------- */
  function promote(e) {
    const old = $('.cr-promo');
    if (old) old.remove();
    const el = doc.createElement('div');
    el.className = 'cr-promo';
    el.innerHTML = `
      <div class="cr-promo-card">
        <p class="cr-kicker">Harbor Point Logistics · personnel notice</p>
        <div class="cr-promo-stamp">Promoted</div>
        <div class="cr-promo-ins">${insignia(e.rankIndex, 'cr-ins cr-ins-xl')}</div>
        <p class="cr-promo-rank">${esc(e.rank.name)}</p>
        <p class="cr-promo-line">KENJI: ${esc(e.rank.line)}</p>
        <button type="button" class="btn cr-promo-ok">Back to work</button>
      </div>`;
    say(`Promoted: ${e.rank.name}. Kenji: ${e.rank.line}`);
    doc.body.appendChild(el);
    if (!reduced()) el.classList.add('cr-anim');
    const close = () => { doc.removeEventListener('keydown', onKey); clearTimeout(timer); el.remove(); };
    const onKey = (k) => { if (k.key === 'Escape') close(); };
    doc.addEventListener('keydown', onKey);
    el.addEventListener('click', (k) => { if (k.target === el || k.target.closest('.cr-promo-ok')) close(); });
    const timer = setTimeout(close, 6500);
  }

  /* ---------- progress page and incoming pages ---------- */
  function route() {
    const h = (G.location.hash || '').replace('#', '');
    if (h === 'progress') return 'progress';
    if (h === 'learn') return 'learn';
    if (h === '' || h === 'tickets') return 'tickets';
    return '';
  }
  function refreshInjected() {
    const main = $('#main');
    if (!main || !res) return;
    const where = route();
    const rec = $('.cr-record', main);
    if (where === 'progress') {
      const html = recordHtml();
      if (!rec) { const div = doc.createElement('div'); div.innerHTML = html; main.insertBefore(div.firstElementChild, main.firstChild); }
      else if (rec.dataset.sig !== recordSig()) rec.outerHTML = html;
      const lad = $('.cr-record .cr-ladder', main);
      const now = lad && $('li.now', lad);
      if (now && lad.scrollWidth > lad.clientWidth && !lad.dataset.scrolled) { lad.scrollLeft = Math.max(0, now.offsetLeft - lad.offsetLeft - 8); lad.dataset.scrolled = '1'; }
    } else if (rec) rec.remove();
    const pg = $('.cr-incoming', main);
    if (where === 'learn' || where === 'tickets') {
      const html = incomingHtml(where);
      if (!pg) { const div = doc.createElement('div'); div.innerHTML = html; main.insertBefore(div.firstElementChild, main.firstChild); }
      else if (pg.dataset.sig !== incomingSig(where)) pg.outerHTML = html;
    } else if (pg) pg.remove();
  }
  const recordSig = () => `${res.xp}|${res.badges.join(',')}|${res.counts.streak}|${state.today}`;
  function recordHtml() {
    const r = res;
    const c = r.counts;
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(shiftDay(state.today, -i));
    const dayXp = days.map((d) => { const x = obj(state.days[d]); return num(x.xp) + (num(x.xp) ? 0 : Math.min(num(x.flash), W.flashDaily)); });
    const maxDay = Math.max(100, ...dayXp);
    const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const nice = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
    const activeDays = dayXp.filter((x) => x > 0).length;
    return `
      <section class="sheet cr-record" aria-labelledby="cr-rec-h" data-sig="${esc(recordSig())}">
        <div class="cr-rec-top">
          <div class="cr-rec-ins">${insignia(r.rankIndex, 'cr-ins cr-ins-xl')}</div>
          <div class="cr-rec-main">
            <p class="label">Shift record</p>
            <h2 id="cr-rec-h" class="cr-rec-rank">${esc(r.rank.name)}</h2>
            ${meter(r)}
          </div>
          <div class="cr-rec-streak"><b>${c.streak}</b><span>day streak</span><small>Longest ${c.longest}</small></div>
        </div>
        <ol class="cr-ladder" aria-label="Rank ladder">
          ${RANKS.map((k, i) => `<li class="${i < r.rankIndex ? 'past' : i === r.rankIndex ? 'now' : ''}"${i === r.rankIndex ? ' aria-current="step"' : ''}><span class="cr-ladder-pip" aria-hidden="true">${insignia(i)}</span><span class="cr-ladder-name">${esc(k.name)}</span><span class="cr-ladder-xp">${fmt(k.xp)} XP${k.passes ? ` + ${k.passes} pass${k.passes > 1 ? 'es' : ''}` : ''}</span><span class="sr">${i < r.rankIndex ? '(reached)' : i === r.rankIndex ? '(current rank)' : '(not reached)'}</span></li>`).join('')}
        </ol>
        <div class="cr-rec-grid">
          <div class="cr-act">
            <p class="label">Last 14 days</p>
            <ol class="cr-strip" aria-label="Study activity, last 14 days">
              ${days.map((d, i) => { const v = dayXp[i]; const h = v ? Math.max(14, Math.round((v / maxDay) * 100)) : 0; const dow = wd[new Date(...d.split('-').map((x, j) => (j === 1 ? Number(x) - 1 : Number(x)))).getDay()]; return `<li class="${v ? 'on' : ''}${d === state.today ? ' today' : ''}" title="${esc(nice(d))}: ${v ? fmt(v) + ' XP' : 'no activity'}"><span class="cr-strip-bar"><i style="height:${h}%"></i></span><span class="cr-strip-d" aria-hidden="true">${dow}</span><span class="sr">${esc(nice(d))}: ${v ? fmt(v) + ' XP' : 'no activity'}</span></li>`; }).join('')}
            </ol>
            <p class="cr-fine">${activeDays} of the last 14 days on shift. A day counts when you earn any XP.</p>
          </div>
          <div class="cr-xp">
            <p class="label">Where the XP came from</p>
            <ul class="cr-break">${[['Tickets', 'tickets'], ['Lessons', 'lessons'], ['Lab projects', 'labs'], ['Mock exams', 'exams'], ['Flashcards', 'flash'], ['Wireless lab', 'wlc'], ['Subnet drill', 'drill'], ['Quick quiz', 'quiz']].map(([n, k]) => `<li><span>${n}</span><b>${fmt(r.breakdown[k])}</b></li>`).join('')}</ul>
          </div>
        </div>
        <p class="label cr-badge-label">Badges · ${r.badges.length} of ${BADGES.length}</p>
        <ul class="cr-badges">
          ${BADGES.map((b) => { const on = r.badges.includes(b.id); return `<li class="cr-badge${on ? ' on' : ''}"><span class="cr-badge-medal" aria-hidden="true">${glyph(b.icon)}</span><span class="cr-badge-txt"><b>${esc(b.name)}</b><small>${on ? 'Earned' : 'Locked'} · ${esc(b.hint)}</small></span></li>`; }).join('')}
        </ul>
        <details class="cr-how"><summary>How XP works</summary>
          <p>XP is worked out from your saved progress every time, so reloading never adds any. Lesson passed ${W.lesson} (plus ${W.check} per check question right), ticket resolved ${W.ticket} (P1 ${W.ticketP1}), guided lab project ${W.lab}, wireless controller task ${W.wlc}, full mock exam ${W.examFull} per attempt (first ${W.examFullCap}), domain practice set ${W.examPractice}, and ${W.examPass} for the first 825+ on each practice exam. Flashcards give 1 per review, up to ${W.flashDaily} a day. The subnet drill gives ${W.drill} per answer in your best streak, the quick quiz ${W.quiz} per percent of your best score. The top two ranks also need passing mock exam scores.</p>
        </details>
      </section>`;
  }
  const incomingSig = (where) => { const n = nextTask(state, catalog(), where); return n.href + '|' + n.line; };
  function incomingHtml(where) {
    const n = nextTask(state, catalog(), where);
    const time = pagerTime(n.id);
    const label = n.kind === 'ticket' ? `Open ${n.label}` : n.kind === 'lesson' ? `Open lesson ${n.label}` : 'Open the mock exam';
    return `<a class="cr-incoming" data-sig="${esc(n.href + '|' + n.line)}" href="${esc(n.href)}" aria-label="Incoming page at ${time}: ${esc(n.line)}. ${esc(label)}."><span class="cr-dot" aria-hidden="true"></span><span class="cr-in-tag" aria-hidden="true">PAGE ${time}</span><span class="cr-in-msg" aria-hidden="true">${esc(n.line)}</span><span class="cr-in-go" aria-hidden="true">${esc(label)} <span class="cr-in-arrow">→</span></span></a>`;
  }

  /* ---------- wiring ---------- */
  let queued = false;
  const soon = (delay) => { if (queued) return; queued = true; setTimeout(() => { queued = false; tick(); }, delay || 0); };
  function boot() {
    tick({ force: true });
    G.addEventListener('hashchange', () => {
      if (pending.flash > 0) { toast({ tag: 'FLASH', text: 'Flashcard reviews', xp: pending.flash }); pending.flash = 0; }
      soon(30);
      setTimeout(refreshInjected, 0);
    });
    G.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith('trouble-ticket-')) { if (e.key === KEY) career = null; soon(0); } });
    doc.addEventListener('click', () => soon(120), true);
    doc.addEventListener('keyup', (e) => { if (e.key === 'Enter') soon(150); }, true);
    G.setInterval(() => { if (!doc.hidden) { tick(); place(); } }, 1500);
    setTimeout(place, 0); // after the theme toggle has been injected
    if (G.matchMedia) { const mq = G.matchMedia('(min-width: 901px)'); if (mq.addEventListener) mq.addEventListener('change', place); }
    const main = $('#main');
    if (main && G.MutationObserver) {
      let raf = 0;
      new G.MutationObserver(() => {
        if (raf) return;
        raf = (G.requestAnimationFrame || setTimeout)(() => { raf = 0; refreshInjected(); });
      }).observe(main, { childList: true });
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis);
