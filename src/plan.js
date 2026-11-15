/* Trouble Ticket — the study plan ("Shift schedule").
 * A night-by-night plan from a start date to exam day, built from what is still left to do.
 *
 * Pure parts (tested in tests/plan.test.mjs):
 *   TT.plan.build(settings, progress, cat?)  -> { nights, weeks, stretchStart, totals, warnings, ... }
 *   TT.plan.ics(plan, opts)                  -> iCalendar text (CRLF, folded at 75 octets, escaped)
 *   TT.plan.isDone(item, progress), TT.plan.pace(plan, progress, today)
 * Browser parts:
 *   TT.renderPlan(main)        the #plan view
 *   TT.plan.tonight()          { date, items, href, label, ... } for the "Clock in" button, or null
 *   TT.plan.status()           pace: { state: 'none'|'ahead'|'on-track'|'behind', n, ... }
 *   TT.plan.sync()             records nights finished on or before their date (career.js reads these for XP)
 *
 * Reads (never writes): the same progress keys career.js lists, plus career's day log for flashcard counts.
 * Owns: trouble-ticket-plan-v1 { v, settings, since, built, nights: [{ date, phase, items }], ticks: { key: day }, shifts: { day: dayDone } }
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  const KEY = 'trouble-ticket-plan-v1';
  const SOURCES = {
    app: 'trouble-ticket-v1',
    lessons: 'trouble-ticket-lessons-v1',
    exam: 'trouble-ticket-exam-v1',
    lab: 'trouble-ticket-sandbox-v1',
    career: 'trouble-ticket-career-v1',
  };
  const V11_LAST = '2027-02-02'; // last day to sit 200-301 v1.1; v2.0 starts 2027-02-03
  const DEFAULTS = { exam: '2027-01-15', nights: 5, minutes: 60 };
  const NIGHT_CHOICES = [3, 4, 5, 6, 7];
  const MINUTE_CHOICES = [45, 60, 90, 120];
  // Which weekdays are study nights (0 = Sunday). Spread out so there is rarely more than one night off in a row.
  const PATTERNS = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MIN = { scene: 8, ticketP1: 35, ticketP2: 30, ticketP3: 25, lab: 25, checkpoint: 30, exam: 120, review: 45, flash: 15, flashMin: 10, weak: 30, light: 20 };
  const SETS = ['A', 'B', 'C', 'D', 'E'];
  const DOMAINS = [
    ['1.0', 'fund', 'Network Fundamentals'],
    ['2.0', 'access', 'Network Access'],
    ['3.0', 'ipconn', 'IP Connectivity'],
    ['4.0', 'svc', 'IP Services'],
    ['5.0', 'sec', 'Security Fundamentals'],
    ['6.0', 'auto', 'Automation and Programmability'],
  ];
  // Flashcard decks that fit each domain's nights, best fit first.
  const DECKS = {
    fund: ['subnetting', 'osi', 'terms', 'wireless', 'acronyms'],
    access: ['commands', 'wireless', 'defaults', 'protocols'],
    ipconn: ['defaults', 'commands', 'protocols'],
    svc: ['ports', 'protocols', 'commands'],
    sec: ['security', 'commands', 'ports'],
    auto: ['automation', 'acronyms'],
  };
  // Tickets the blueprint table does not list: placed after the lesson that covers the idea.
  const TICKET_AFTER = { t17: '3.4' };
  const FLASH_DONE = 10; // reviews logged on a night that count as "did the flashcards"

  /* ================= pure helpers ================= */
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const obj = (x) => (isObj(x) ? x : {});
  const pad = (n) => String(n).padStart(2, '0');
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s));
  const dayKey = (d) => { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function parse(k) { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d, 12); }
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const dow = (k) => parse(k).getDay();
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const weekStart = (k) => addDays(k, -dow(k));
  const objNum = (o) => String(o || '').split('.').map((x) => Number(x) || 0);
  const cmpObj = (a, b) => { const x = objNum(a); const y = objNum(b); return x[0] - y[0] || x[1] - y[1]; };
  const maxObj = (list) => list.slice().sort(cmpObj).pop();
  const domOf = (o) => (DOMAINS.find((d) => d[0] === objNum(o)[0] + '.0') || DOMAINS[0]);
  const hours = (m) => { const h = m / 60; return h >= 10 ? String(Math.round(h)) : String(Math.round(h * 10) / 10); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nice = (k, o) => parse(k).toLocaleDateString('en-US', o || { weekday: 'short', month: 'short', day: 'numeric' });

  /** The content the plan is built from. Falls back to empty lists when a data file is absent. */
  function catalog() {
    const scenesFor = typeof TT.scenesFor === 'function' ? TT.scenesFor : () => [];
    const lessons = (TT.lessons || []).slice().sort((a, b) => cmpObj(a.obj, b.obj)).map((l) => ({
      id: l.id, obj: l.obj, domain: l.domain || domOf(l.obj)[1], title: l.title, minutes: Math.max(5, Number(l.minutes) || 15),
      scenes: scenesFor(l.id).map((s) => ({ id: s.id, title: s.title, minutes: Math.max(5, Math.min(12, Math.round(((s.steps && s.steps.length) || 6) * 1.2))) })),
      // flashcard decks that drill this lesson (flashDecks[].lesson), e.g. the OSI deck with the 1.0 layers primer
      decks: (TT.flashDecks || []).filter((d) => d && d.lesson === l.id).map((d) => d.id),
    }));
    const objs = new Set(lessons.map((l) => l.obj));
    const ticketObjs = {};
    for (const [o, , m] of TT.blueprint || []) for (const t of (m && m.t) || []) (ticketObjs[t] = ticketObjs[t] || []).push(o);
    const tickets = (TT.tickets || []).map((t) => {
      const list = (ticketObjs[t.id] || []).concat(TICKET_AFTER[t.id] ? [TICKET_AFTER[t.id]] : []).filter((o) => objs.has(o) || !objs.size);
      return { id: t.id, number: t.number, title: t.title, topic: t.topic, after: list.length ? maxObj(list) : '3.2', minutes: MIN['ticket' + (t.priority || 'P3')] || MIN.ticketP3 };
    });
    const labs = (TT.labProjects || TT.projects || []).map((p) => {
      const list = (p.blueprint || []).filter((o) => objs.has(o) || !objs.size);
      return { id: p.id, title: p.title, after: list.length ? maxObj(list) : '1.1', minutes: Math.max(10, Number(p.minutes) || MIN.lab) };
    });
    const decks = Object.fromEntries((TT.flashDecks || []).map((d) => [d.id, d.name]));
    let sets = SETS.slice();
    try { if (typeof TT.examSets === 'function') { const s = TT.examSets().map((x) => x.id).filter(Boolean); if (s.length) sets = s; } } catch (e) { /* keep A-E */ }
    return { lessons, tickets, labs, decks, sets };
  }

  /* ---------- items ---------- */
  function mk(kind, id, fields) {
    return Object.assign({ kind, id, key: kind + ':' + id }, fields);
  }
  const lessonItem = (l) => mk('lesson', l.id, { tag: 'Lesson ' + l.obj, name: l.title, title: `Lesson ${l.obj} ${l.title}`, href: '#learn-' + l.id, minutes: l.minutes, obj: l.obj, domain: l.domain });
  const sceneItem = (s, l) => mk('scene', s.id, { tag: 'Scene', name: s.title, title: `Scene: ${s.title}`, href: '#scene-' + s.id, minutes: s.minutes, lesson: l.id, obj: l.obj, domain: l.domain });
  const ticketItem = (t) => mk('ticket', t.id, { tag: t.number || t.id, name: t.title, title: `Ticket ${t.number || t.id} ${t.title}`, href: '#' + t.id, minutes: t.minutes, obj: t.after, domain: domOf(t.after)[1] });
  const labItem = (p) => mk('lab', p.id, { tag: 'Lab', name: p.title, title: `Lab: ${p.title}`, href: '#lab-' + p.id, minutes: p.minutes, obj: p.after, domain: domOf(p.after)[1] });
  const checkpointItem = (d) => mk('checkpoint', d[0], { tag: 'Checkpoint ' + d[0], name: `Domain practice ${d[0]} ${d[2]}`, title: `Checkpoint: domain practice ${d[0]} ${d[2]}`, href: '#exam', minutes: MIN.checkpoint, domain: d[1], how: `Mock exam → Domain practice → ${d[0]}` });
  const examItem = (s) => mk('exam', s, { tag: 'Exam ' + s, name: `Practice exam ${s}`, title: `Practice exam ${s} (100 questions, 120 min)`, href: '#exam', minutes: MIN.exam, how: `Mock exam → Practice exams → Exam ${s}` });
  const reviewItem = (s) => mk('review', s, { tag: 'Review', name: `Missed questions from exam ${s}`, title: `Review missed questions from exam ${s}`, href: '#exam', minutes: MIN.review, set: s, how: 'Mock exam → Weak spots, then read each explanation' });
  function flashItem(cat, deck, minutes, date) {
    const name = deck === 'due' ? 'every due card' : deck + ' deck';
    return Object.assign(mk('flash', deck, { tag: 'Flashcards', name, title: `${minutes} min flashcards: ${name}`, href: '#flash-' + deck, minutes, on: date }), { key: `flash:${deck}:${date}` });
  }
  const weakItem = (date, minutes) => Object.assign(mk('review', 'weak', { tag: 'Review', name: 'Weak spots drill', title: 'Weak spots drill: questions you missed before', href: '#exam', minutes: minutes || MIN.weak, how: 'Mock exam → Weak spots', on: date }), { key: 'review:weak:' + date });
  const lightItem = (date) => Object.assign(mk('review', 'final', { tag: 'Light review', name: 'Skim your notes and the exam traps, then sleep', title: 'Light review: skim your notes and the exam traps, then sleep', href: '#learn', minutes: MIN.light, on: date }), { key: 'review:final:' + date });

  /* ---------- settings and progress ---------- */
  function normSettings(s, today) {
    s = obj(s);
    today = isDay(today) ? today : dayKey(new Date());
    const nights = NIGHT_CHOICES.includes(Number(s.nights)) ? Number(s.nights) : DEFAULTS.nights;
    const days = Array.isArray(s.days) && s.days.length ? s.days.map(Number).filter((d) => d >= 0 && d <= 6) : PATTERNS[nights];
    return {
      exam: isDay(s.exam) ? s.exam : DEFAULTS.exam,
      start: isDay(s.start) ? s.start : today,
      nights, days: [...new Set(days)].sort(),
      minutes: Math.max(20, Math.min(240, Number(s.minutes) || DEFAULTS.minutes)),
    };
  }

  /** Progress in the shape the planner reads. Accepts the raw parsed storage objects. */
  function normProgress(raw, extra) {
    raw = obj(raw);
    if (raw.__plan) return raw; // already normalized
    const app = obj(raw.app);
    const les = obj(raw.lessons);
    const ex = obj(raw.exam);
    const lab = obj(raw.lab);
    const car = obj(raw.career);
    const exams = {};
    const practice = {};
    const weak = [];
    for (const a of Array.isArray(ex.attempts) ? ex.attempts : []) {
      if (!isObj(a) || typeof a.date !== 'string') continue;
      if (a.mode === 'full' && a.set && (!exams[a.set] || a.date < exams[a.set])) exams[a.set] = a.date;
      else if (a.mode === 'practice' && a.domain) (practice[a.domain] = practice[a.domain] || []).push(a.date);
      else if (a.mode === 'weak' || a.mode === 'retake') weak.push(a.date);
    }
    const flashDays = {};
    for (const [k, v] of Object.entries(obj(car.days))) if (isDay(k)) flashDays[k] = Number(obj(v).flash) || 0;
    extra = obj(extra);
    return {
      __plan: true,
      lessons: obj(les.done), tickets: obj(app.solved), labs: obj(lab.done),
      exams, practice, weak, flashDays,
      ticks: obj(extra.ticks), since: isDay(extra.since) ? extra.since : null,
    };
  }
  /** Direct form for tests and callers: { lessons: {id:true}, tickets, labs, exams: {A: iso}, practice, weak, ticks }. */
  function progressOf(p) {
    p = obj(p);
    if (p.__plan) return p;
    if (p.app || p.exam || p.lab || p.career || isObj(p.lessons) && isObj(p.lessons.done)) return normProgress(p);
    return { __plan: true, lessons: obj(p.lessons), tickets: obj(p.tickets), labs: obj(p.labs), exams: obj(p.exams), practice: obj(p.practice), weak: Array.isArray(p.weak) ? p.weak : [], flashDays: obj(p.flashDays), ticks: obj(p.ticks), since: p.since || null };
  }

  function isDone(item, p) {
    p = progressOf(p);
    if (!item) return false;
    if (p.ticks[item.key]) return true;
    switch (item.kind) {
      case 'lesson': return !!p.lessons[item.id];
      case 'scene': return !!p.lessons[item.lesson];
      case 'ticket': return !!p.tickets[item.id];
      case 'lab': return !!p.labs[item.id];
      case 'exam': return !!p.exams[item.id];
      case 'checkpoint': return (p.practice[item.id] || []).some((d) => !p.since || dayKey(new Date(d)) >= p.since);
      case 'review':
        if (item.set) { const t = p.exams[item.set]; return !!t && p.weak.some((d) => d > t); }
        if (item.id === 'weak' && item.on) return p.weak.some((d) => dayKey(new Date(d)) === item.on);
        return false;
      case 'flash': return !!item.on && (p.flashDays[item.on] || 0) >= FLASH_DONE;
      default: return false;
    }
  }
  // Items a checkbox can tick by hand (no saved progress says when they are done).
  const manual = (item) => item.kind === 'flash' || item.kind === 'review' || item.kind === 'scene';

  function studyDates(s) {
    const out = [];
    const lastNight = addDays(s.exam, -1);
    for (let k = s.start, guard = 0; k < s.exam && guard < 800; k = addDays(k, 1), guard++) {
      if (s.days.includes(dow(k)) || k === lastNight) out.push(k);
    }
    return out;
  }

  /* ================= the generator ================= */
  function build(settings, progress, cat) {
    const s = normSettings(settings, settings && settings.today);
    const p = progressOf(progress);
    cat = cat || catalog();
    const B = s.minutes;
    const dates = studyDates(s);
    const N = dates.length;
    const days = Math.max(0, diff(s.start, s.exam));
    const warnings = [];
    if (s.exam > V11_LAST) warnings.push({ level: 'bad', code: 'v2', text: 'That date is after Feb 2, 2027. CCNA 200-301 v1.1 retires on Feb 2, and v2.0 starts Feb 3, 2027. This plan covers v1.1; book on or before Feb 2 or plan for the new blueprint.' });

    // what is left
    const units = [];
    for (const l of cat.lessons) {
      if (p.lessons[l.id]) continue;
      const items = [lessonItem(l)].concat(l.scenes.map((sc) => sceneItem(sc, l)));
      units.push({ l, items, minutes: items.reduce((m, x) => m + x.minutes, 0) });
    }
    const practice = cat.tickets.filter((t) => !p.tickets[t.id]).map(ticketItem)
      .concat(cat.labs.filter((x) => !p.labs[x.id]).map(labItem))
      .sort((a, b) => cmpObj(a.obj, b.obj) || (a.kind === b.kind ? 0 : a.kind === 'ticket' ? -1 : 1));
    const checkpoints = DOMAINS.filter((d) => cat.lessons.some((l) => l.domain === d[1])).map(checkpointItem).filter((c) => !isDone(c, p));
    const stretchUnits = [];
    for (const id of cat.sets) {
      const ex = examItem(id);
      const rv = reviewItem(id);
      if (!isDone(ex, p)) stretchUnits.push({ exam: ex, review: rv });
      else if (!isDone(rv, p)) stretchUnits.push({ exam: null, review: rv });
    }
    const learnMin = units.reduce((m, u) => m + u.minutes, 0) + practice.reduce((m, x) => m + x.minutes, 0) + checkpoints.reduce((m, x) => m + x.minutes, 0);
    const stretchMin = stretchUnits.reduce((m, u) => m + (u.exam ? u.exam.minutes : 0) + u.review.minutes, 0) + MIN.light;
    const needed = learnMin + stretchMin;
    const available = N * B;
    const base = { settings: s, start: s.start, exam: s.exam, days, warnings };
    if (!N) {
      warnings.push({ level: 'bad', code: 'none', text: s.start >= s.exam ? 'The exam date has to come after the start date.' : 'No study nights fall between the start date and the exam. Add nights or move the exam.' });
      return Object.assign(base, { nights: [], weeks: [], stretchStart: null, totals: { nights: 0, learnNights: 0, available: 0, needed, budget: B, nightLoad: 0 } });
    }

    // final review stretch: ~12% of nights (at least 4), grown so each practice exam gets a review night after it
    const hasLearn = units.length + practice.length + checkpoints.length > 0;
    const k = stretchUnits.length;
    let S = Math.max(4, Math.round(N * 0.12));
    S = Math.max(S, Math.min(2 * k + 1, Math.floor(N * 0.3)));
    S = Math.max(S, k + 1);
    S = Math.min(S, hasLearn && N > 1 ? N - 1 : N);
    const L = N - S;
    const learnDates = dates.slice(0, L);
    const stretchDates = dates.slice(L);

    // pack the learning nights: practice that is ready first, then lessons in blueprint order
    const domainLessons = {};
    for (const l of cat.lessons) domainLessons[l.domain] = (domainLessons[l.domain] || 0) + 1;
    // Each night aims at the work left divided by the nights left (never much under the budget, so slack
    // collects as buffer nights before the stretch), with a few minutes of give so lessons are not split.
    function pack() {
      const nights = learnDates.map(() => ({ items: [], minutes: 0, domain: null }));
      const queue = [];
      const waiting = practice.slice();
      const cps = checkpoints.slice();
      let left = learnMin;
      // a ticket or lab is ready once no unplaced lesson teaches an objective at or before its last one
      const release = (eligible, from) => {
        for (let i = 0; i < waiting.length;) {
          const x = waiting[i];
          if (!units.some((u, j) => j >= from && cmpObj(u.l.obj, x.obj) <= 0)) { queue.push({ item: x, eligible }); waiting.splice(i, 1); } else i++;
        }
        for (let i = 0; i < cps.length;) {
          const c = cps[i];
          if (!units.some((u, j) => j >= from && u.l.domain === c.domain) && !waiting.some((x) => x.domain === c.domain)) { queue.push({ item: c, eligible }); cps.splice(i, 1); } else i++;
        }
      };
      release(0, 0);
      let li = 0;
      for (let i = 0; i < nights.length; i++) {
        const n = nights[i];
        const lastNight = i === nights.length - 1;
        const target = Math.max(left / (nights.length - i), B * 0.9);
        const fits = (m) => lastNight || !n.items.length || n.minutes + m <= target + 8;
        const put = (x) => { n.items.push(x); n.minutes += x.minutes; left -= x.minutes; if (!n.domain) n.domain = x.domain || null; };
        while (queue.length && queue[0].eligible <= i && fits(queue[0].item.minutes)) put(queue.shift().item);
        while (li < units.length && fits(units[li].minutes)) {
          const u = units[li];
          // a new domain starts on a fresh night unless this one is still mostly empty
          if (!lastNight && n.domain && n.domain !== u.l.domain && n.minutes >= target * 0.5 && left / (nights.length - i - 1) <= target + 8) break;
          for (const x of u.items) put(x);
          li++;
          release(i + 1, li);
        }
        if (lastNight) while (queue.length) put(queue.shift().item);
      }
      return { nights };
    }
    const packed = L ? pack() : { nights: [] };

    // flashcards fill spare minutes on learning nights; empty nights become buffer nights
    const turn = {};
    const lessonById = Object.fromEntries(cat.lessons.map((l) => [l.id, l]));
    const learnNights = packed.nights.map((n, i) => {
      const date = learnDates[i];
      const items = n.items.slice();
      let minutes = n.minutes;
      // a deck tied to a lesson (flashDecks[].lesson, e.g. OSI with the 1.0 primer) takes that night's flashcard slot
      const tied = [];
      for (const x of items) if (x.kind === 'lesson') for (const d of (lessonById[x.id] || {}).decks || []) if (!tied.includes(d)) tied.push(d);
      for (const d of tied) {
        const f = Object.assign(flashItem(cat, d, Math.max(MIN.flashMin, Math.min(MIN.flash, B - minutes)), date), { lesson: items.find((x) => x.kind === 'lesson' && (lessonById[x.id].decks || []).includes(d)).id });
        items.push(f);
        minutes += f.minutes;
      }
      if (!items.length) {
        items.push(flashItem(cat, 'due', Math.min(MIN.flash, B), date));
        if (B - MIN.flash >= 20) items.push(weakItem(date, Math.min(MIN.weak, B - MIN.flash)));
        return { date, phase: 'buffer', domain: null, items, minutes: items.reduce((m, x) => m + x.minutes, 0) };
      }
      const spare = B - minutes;
      if (!tied.length && spare >= MIN.flashMin && n.domain && DECKS[n.domain]) {
        const list = DECKS[n.domain].filter((d) => (!Object.keys(cat.decks).length || cat.decks[d]) && !items.some((x) => x.kind === 'flash' && x.id === d));
        if (list.length) {
          const t = (turn[n.domain] = (turn[n.domain] || 0));
          turn[n.domain] = t + 1;
          const f = flashItem(cat, list[t % list.length], Math.min(MIN.flash, spare), date);
          items.push(f);
          minutes += f.minutes;
        }
      }
      return { date, phase: 'learn', domain: n.domain, items, minutes };
    });

    // the final stretch: practice exams spread evenly, a review night after each, light review last
    const stretch = stretchDates.map((date) => ({ date, phase: 'stretch', domain: null, items: [], minutes: 0 }));
    const final = stretch.length > 1 ? stretch[stretch.length - 1] : null;
    const slots = final ? stretch.length - 1 : stretch.length;
    const add = (n, x) => { n.items.push(x); n.minutes += x.minutes; };
    stretchUnits.forEach((u, j) => {
      const pos = Math.min(slots - 1, Math.floor((j * slots) / Math.max(1, k)));
      const n = stretch[Math.max(0, pos)];
      if (!n) return;
      if (u.exam) {
        add(n, u.exam);
        const next = pos + 1 < slots ? stretch[pos + 1] : n; // the last night stays light
        add(next, u.review);
      } else add(n, u.review);
    });
    for (const n of stretch) {
      if (n === final) continue;
      if (!n.items.length) { add(n, weakItem(n.date, Math.min(MIN.weak, B))); if (B - MIN.weak >= MIN.flashMin) add(n, flashItem(cat, 'due', Math.min(MIN.flash, B - MIN.weak), n.date)); }
    }
    if (final) { final.phase = 'final'; add(final, flashItem(cat, 'due', MIN.flash, final.date)); add(final, lightItem(final.date)); }

    const nights = learnNights.concat(stretch);
    const load = learnNights.filter((n) => n.phase === 'learn');
    const nightLoad = load.length ? Math.round(load.reduce((m, n) => m + n.minutes, 0) / load.length) : 0;
    if (needed > available) {
      warnings.push({ level: 'warn', code: 'tight', text: `This is tight: ~${hours(available)} hours for ~${hours(needed)} hours of material. Study nights will run about ${Math.max(nightLoad, B)} minutes. ${nightLoad > 2 * B ? 'That is more than most people can keep up; think about moving the exam date.' : 'Add a night a week or longer nights if you can.'}` });
    } else if (days < 28) {
      warnings.push({ level: 'warn', code: 'tight', text: `This is tight: under four weeks, ~${hours(available)} hours for ~${hours(needed)} hours of material. It fits on paper; there is no slack for a bad week.` });
    } else if (needed > available * 0.9) {
      warnings.push({ level: 'note', code: 'snug', text: `Snug fit: ~${hours(needed)} hours of material in ~${hours(available)} hours. Missing a night means doubling up later.` });
    }
    return Object.assign(base, {
      nights, weeks: weeksOf(nights), stretchStart: stretchDates[0] || null,
      totals: { nights: N, learnNights: L, available, needed, budget: B, nightLoad },
    });
  }

  function weeksOf(nights) {
    const out = [];
    for (const n of nights) {
      const ws = weekStart(n.date);
      let w = out[out.length - 1];
      if (!w || w.start !== ws) { w = { start: ws, end: addDays(ws, 6), nights: [] }; out.push(w); }
      w.nights.push(n);
    }
    out.forEach((w, i) => { w.label = 'Week ' + (i + 1); });
    return out;
  }

  /* ---------- pace ---------- */
  /** Latest occurrence of each item: an item moved by a catch-up counts where it now sits. */
  function latest(plan) {
    const m = new Map();
    for (const n of plan.nights || []) for (const x of n.items) m.set(x.key, { item: x, date: n.date });
    return m;
  }
  const PACE_KINDS = new Set(['lesson', 'scene', 'ticket', 'lab', 'checkpoint', 'exam']);
  function pace(plan, progress, today) {
    const p = progressOf(progress);
    if (!plan || !plan.nights || !plan.nights.length) return { state: 'none', n: 0, behind: 0, ahead: 0, done: 0, total: 0 };
    let behind = 0; let ahead = 0; let done = 0; let total = 0; let dueNow = 0;
    for (const { item, date } of latest(plan).values()) {
      const d = isDone(item, p);
      total++;
      if (d) done++;
      if (!PACE_KINDS.has(item.kind)) continue;
      if (date < today && !d) behind++;
      if (date > today && d) ahead++;
      if (date <= today) dueNow++;
    }
    const net = ahead - behind;
    const state = net > 0 ? 'ahead' : net < 0 ? 'behind' : 'on-track';
    return { state, n: Math.abs(net), behind, ahead, done, total, dueNow };
  }

  /* ================= iCalendar ================= */
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
    const len = (ch) => (enc ? enc.encode(ch).length : unescape(encodeURIComponent(ch)).length);
    const out = [];
    let cur = '';
    let n = 0;
    for (const ch of line) {
      const b = len(ch);
      const max = out.length ? 74 : 75; // continuation lines start with a space, which counts
      if (n + b > max) { out.push(cur); cur = ''; n = 0; }
      cur += ch;
      n += b;
    }
    out.push(cur);
    return out.map((x, i) => (i ? ' ' + x : x)).join('\r\n');
  }
  const icsDate = (k) => k.replace(/-/g, '');
  const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  /** opts: { from: day (skip earlier nights), time: 'HH:MM' for evening events or null for all-day, stamp: Date } */
  function ics(plan, opts) {
    opts = obj(opts);
    const stamp = icsStamp(opts.stamp instanceof Date ? opts.stamp : new Date());
    const time = typeof opts.time === 'string' && /^\d{2}:\d{2}$/.test(opts.time) ? opts.time : null;
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trouble Ticket//Shift schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText('Shift schedule (CCNA 200-301)')];
    const when = (date, minutes) => {
      if (!time) return ['DTSTART;VALUE=DATE:' + icsDate(date), 'DTEND;VALUE=DATE:' + icsDate(addDays(date, 1)), 'TRANSP:TRANSPARENT'];
      const [h, m] = time.split(':').map(Number);
      const st = parse(date); st.setHours(h, m, 0, 0);
      const en = new Date(st.getTime() + Math.max(15, minutes) * 60000);
      const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      return ['DTSTART:' + f(st), 'DTEND:' + f(en)];
    };
    for (const n of plan.nights || []) {
      if (opts.from && n.date < opts.from) continue;
      if (!n.items.length) continue;
      const first = n.items[0];
      const more = n.items.length - 1;
      const summary = `Shift: ${first.title}${more ? ` (+${more} more)` : ''}`;
      const desc = n.items.map((x) => `- ${x.title} (${x.minutes} min)${x.how ? ` [${x.how}]` : ''}`).join('\n') + `\n\nAbout ${n.minutes} minutes. Open Trouble Ticket → Study plan.`;
      L.push('BEGIN:VEVENT', 'UID:shift-' + icsDate(n.date) + '@trouble-ticket.local', 'DTSTAMP:' + stamp, ...when(n.date, n.minutes), 'SUMMARY:' + icsText(summary), 'DESCRIPTION:' + icsText(desc), 'END:VEVENT');
    }
    if (plan.exam) {
      L.push('BEGIN:VEVENT', 'UID:exam-' + icsDate(plan.exam) + '@trouble-ticket.local', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + icsDate(plan.exam), 'DTEND;VALUE=DATE:' + icsDate(addDays(plan.exam, 1)),
        'SUMMARY:' + icsText('CCNA 200-301 exam day'), 'DESCRIPTION:' + icsText('Bring two forms of ID if testing at a center. Arrive early. You have done the work.'), 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  /** Nights finished on or before their date, from a stored plan record. Used by career.js for XP. */
  function shiftsEarned(rec) {
    const sh = obj(obj(rec).shifts);
    return Object.keys(sh).filter((k) => isDay(k) && isDay(sh[k]) && sh[k] <= k).sort();
  }

  TT.plan = {
    KEY, V11_LAST, DEFAULTS, PATTERNS, NIGHT_CHOICES, MINUTE_CHOICES, MINUTES: MIN, DECKS,
    build, ics, fold, isDone, pace, catalog, studyDates, normSettings, normProgress, progressOf, weeksOf, shiftsEarned,
    dayKey, addDays,
    tonight: () => null, status: () => ({ state: 'none', n: 0 }), sync: () => false,
  };

  /* ================= browser layer ================= */
  const doc = G.document;
  if (!doc || !doc.querySelector) return;
  const reduced = () => !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const readJSON = (k) => { try { return JSON.parse(G.localStorage.getItem(k)); } catch (e) { return null; } };
  const today = () => dayKey(new Date());

  function loadRec() {
    const r = readJSON(KEY);
    return isObj(r) && r.v === 1 ? r : null;
  }
  function saveRec(r) { try { G.localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* storage blocked: the plan lasts for this visit */ } memo = r; }
  let memo = null;
  const rec = () => { const r = loadRec(); return r || memo; };
  const hasPlan = (r) => !!(r && r.settings && Array.isArray(r.nights) && r.nights.length);

  function readProgress(r) {
    const raw = {};
    for (const [k, key] of Object.entries(SOURCES)) raw[k] = readJSON(key);
    return normProgress(raw, { ticks: r && r.ticks, since: r && r.since });
  }
  const planOf = (r) => ({ settings: r.settings, exam: r.settings.exam, start: r.settings.start, nights: r.nights, weeks: weeksOf(r.nights), stretchStart: r.stretchStart, totals: r.totals, warnings: r.warnings || [] });

  /** Build (or rebuild from today, keeping history) and store. */
  function commit(settings, opts) {
    const old = rec();
    const t = today();
    const p = readProgress(old);
    const s = Object.assign({}, settings, { today: t });
    if (opts && opts.keepPast && !(isDay(s.start) && s.start > t)) s.start = t;
    const built = build(s, p);
    let nights = built.nights.map((n) => ({ date: n.date, phase: n.phase, domain: n.domain, items: n.items, minutes: n.minutes }));
    if (old && hasPlan(old) && opts && opts.keepPast) {
      const past = old.nights.filter((n) => n.date < built.start);
      const todayOld = old.nights.find((n) => n.date === built.start);
      const kept = todayOld ? todayOld.items.filter((x) => isDone(x, p)) : [];
      if (kept.length) {
        const tn = nights.find((n) => n.date === built.start);
        if (tn) { tn.items = kept.concat(tn.items.filter((x) => !kept.some((k) => k.key === x.key))); tn.minutes = tn.items.reduce((m, x) => m + x.minutes, 0); }
        else past.push(todayOld);
      }
      nights = past.concat(nights);
    }
    const r = {
      v: 1, settings: built.settings, since: (old && old.since) || t, built: t,
      nights, stretchStart: built.stretchStart, totals: built.totals, warnings: built.warnings,
      ticks: (old && old.ticks) || {}, shifts: (old && old.shifts) || {},
    };
    saveRec(r);
    return r;
  }

  function sync() {
    const r = rec();
    if (!hasPlan(r)) return false;
    const p = readProgress(r);
    const t = today();
    let changed = false;
    r.shifts = obj(r.shifts);
    for (const n of r.nights) {
      if (n.date < t || r.shifts[n.date] || !n.items.length) continue;
      if (n.items.every((x) => isDone(x, p))) { r.shifts[n.date] = t; changed = true; }
    }
    if (changed) saveRec(r);
    return changed;
  }

  function tonight() {
    const r = rec();
    if (!hasPlan(r)) return null;
    const p = readProgress(r);
    const t = today();
    const at = latest(planOf(r));
    const live = (n) => n.items.filter((x) => !isDone(x, p) && at.get(x.key) && at.get(x.key).date === n.date);
    const n = r.nights.find((x) => x.date >= t && live(x).length);
    if (!n) return null;
    const items = live(n);
    const first = items[0];
    const more = items.length - 1;
    return { date: n.date, isToday: n.date === t, items, item: first, href: first.href, label: `${first.title}${more ? ` (+${more} more)` : ''}`, more, night: n };
  }
  function status() {
    const r = rec();
    if (!hasPlan(r)) return { state: 'none', n: 0, behind: 0, ahead: 0, done: 0, total: 0 };
    return pace(planOf(r), readProgress(r), today());
  }
  Object.assign(TT.plan, { tonight, status, sync, readProgress, load: rec, commit });

  /* ================= the view ================= */
  const GLYPH = {
    lesson: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    scene: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
    ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M9 7v10" stroke-dasharray="2 2"/>',
    lab: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M12 10v4M7 7h1M7 17h1"/>',
    flash: '<rect x="7" y="4" width="12" height="15" rx="1.5"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>',
    checkpoint: '<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>',
    exam: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    review: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/>',
  };
  const glyph = (k) => `<svg class="pl-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPH[k] || GLYPH.lesson}</svg>`;
  const KIND = { lesson: 'Lesson', scene: 'Scene', ticket: 'Ticket', lab: 'Lab', flash: 'Flashcards', checkpoint: 'Checkpoint', exam: 'Practice exam', review: 'Review' };
  const PIN = '<svg class="pl-pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="10" r="7"/><circle cx="10" cy="8" r="2.2" class="pl-pin-hi"/></svg>';

  let ticks = {};
  const ui = { main: null, mode: null, draft: null, extra: false, icsTime: '', msg: '' };

  TT.renderPlan = function renderPlan(main) {
    ui.main = main;
    const r = rec();
    if (ui.mode !== 'setup' || !main.querySelector('.pl-setup')) ui.mode = hasPlan(r) ? 'view' : 'setup';
    if (!hasPlan(r)) ui.mode = 'setup';
    draw();
  };

  function draw() {
    const main = ui.main;
    if (!main) return;
    const r = rec();
    if (ui.mode === 'setup' || !hasPlan(r)) { drawSetup(r); return; }
    sync();
    drawView(rec());
  }

  /* ---------- setup / reschedule ---------- */
  function drawSetup(r) {
    const editing = hasPlan(r);
    const t = today();
    if (!ui.draft) {
      const s = editing ? r.settings : {};
      ui.draft = { exam: s.exam || DEFAULTS.exam, nights: s.nights || DEFAULTS.nights, minutes: s.minutes || DEFAULTS.minutes, start: t };
    }
    const d = ui.draft;
    ui.main.innerHTML = `
      <div class="pl-wall">
        <section class="sheet pl-setup pl-paper" aria-labelledby="pl-setup-h">
          ${PIN}${PIN.replace('pl-pin', 'pl-pin pl-pin-r')}
          <p class="label">Harbor Point Logistics · NOC night desk · form HPL-7</p>
          <h2 id="pl-setup-h" class="pl-h">${editing ? 'Reschedule the shifts' : 'Request a shift schedule'}</h2>
          <p class="pl-lede">${editing ? 'Change anything below. Work you have already finished stays done; everything left gets planned again from today.' : 'Tell Kenji when the exam is and how many nights you can give it. He will pin a night-by-night schedule on the wall: lessons in blueprint order, tickets and labs right after the lessons that teach them, and the five practice exams at the end.'}</p>
          <form class="pl-form" novalidate>
            <div class="pl-field">
              <label for="pl-exam">Exam date</label>
              <input id="pl-exam" type="date" value="${esc(d.exam)}" min="${esc(t)}" required aria-describedby="pl-exam-note">
              <p id="pl-exam-note" class="pl-note" aria-live="polite"></p>
            </div>
            <div class="pl-field">
              <label for="pl-start">Start date</label>
              <input id="pl-start" type="date" value="${esc(d.start)}" min="${esc(t)}" required>
              <p class="pl-note">Today by default.</p>
            </div>
            <fieldset class="pl-field pl-chips-f">
              <legend>Study nights per week</legend>
              <div class="chips pl-chips">${NIGHT_CHOICES.map((n) => `<button type="button" class="chip" data-nights="${n}" aria-pressed="${d.nights === n}">${n}</button>`).join('')}</div>
              <p class="pl-note" id="pl-days-note"></p>
            </fieldset>
            <fieldset class="pl-field pl-chips-f">
              <legend>Minutes per night</legend>
              <div class="chips pl-chips">${MINUTE_CHOICES.map((n) => `<button type="button" class="chip" data-minutes="${n}" aria-pressed="${d.minutes === n}">${n} min</button>`).join('')}</div>
            </fieldset>
            <div class="pl-preview" aria-live="polite"></div>
            <div class="pl-actions">
              <button type="submit" class="btn primary">${editing ? 'Rebuild from today' : 'Pin it to the wall'}</button>
              ${editing ? '<button type="button" class="btn" data-act="cancel">Cancel</button><button type="button" class="btn quiet pl-danger" data-act="clear">Take the schedule down</button>' : ''}
            </div>
          </form>
        </section>
      </div>`;
    const f = ui.main.querySelector('form');
    const refresh = () => {
      d.exam = f.querySelector('#pl-exam').value || d.exam;
      d.start = f.querySelector('#pl-start').value || d.start;
      const note = f.querySelector('#pl-exam-note');
      note.className = 'pl-note';
      if (d.exam > V11_LAST) { note.className = 'pl-note pl-bad'; note.innerHTML = '<b>Heads up:</b> v1.1 retires on Feb 2, 2027 and v2.0 starts Feb 3, 2027. This site and plan cover v1.1.'; } else note.textContent = `Sitting CCNA 200-301 v1.1 (last day for v1.1: Feb 2, 2027).`;
      f.querySelector('#pl-days-note').textContent = 'Nights: ' + PATTERNS[d.nights].map((x) => DOW[x]).join(', ') + ', plus the night before the exam.';
      const s = normSettings(Object.assign({}, d, { today: today() }));
      const built = build(s, readProgress(r));
      const tt = built.totals;
      const box = f.querySelector('.pl-preview');
      const ws = built.warnings.filter((w) => w.code !== 'v2');
      box.innerHTML = tt.nights ? `
        <dl class="pl-sum">
          <div><dt>Study nights</dt><dd>${tt.nights}</dd></div>
          <div><dt>Hours available</dt><dd>~${hours(tt.available)}</dd></div>
          <div><dt>Hours of work left</dt><dd>~${hours(tt.needed)}</dd></div>
          <div><dt>Final stretch from</dt><dd>${built.stretchStart ? esc(nice(built.stretchStart, { month: 'short', day: 'numeric' })) : '-'}</dd></div>
        </dl>${ws.map((w) => `<p class="pl-warn pl-${w.level}">${esc(w.text)}</p>`).join('')}` : ws.map((w) => `<p class="pl-warn pl-bad">${esc(w.text)}</p>`).join('');
      f.querySelector('[type=submit]').disabled = !tt.nights;
    };
    f.addEventListener('input', refresh);
    f.addEventListener('change', refresh);
    f.querySelectorAll('[data-nights]').forEach((b) => b.addEventListener('click', () => { d.nights = Number(b.dataset.nights); f.querySelectorAll('[data-nights]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); }));
    f.querySelectorAll('[data-minutes]').forEach((b) => b.addEventListener('click', () => { d.minutes = Number(b.dataset.minutes); f.querySelectorAll('[data-minutes]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      refresh();
      commit(d, { keepPast: editing });
      ui.draft = null; ui.mode = 'view'; ui.msg = editing ? 'Rescheduled. Everything left is planned again from today.' : 'Schedule posted. Tonight\'s shift is below.';
      draw();
      focus('.pl-hero h2, .pl-hero h3');
    });
    const cancel = f.querySelector('[data-act=cancel]');
    if (cancel) cancel.addEventListener('click', () => { ui.draft = null; ui.mode = 'view'; draw(); focus('[data-act=reschedule]'); });
    const clear = f.querySelector('[data-act=clear]');
    if (clear) clear.addEventListener('click', () => {
      if (clear.dataset.armed !== '1') { clear.dataset.armed = '1'; clear.textContent = 'Sure? Click again to take it down'; return; }
      saveRec({ v: 1, shifts: obj(r && r.shifts) });
      ui.draft = null; ui.mode = 'setup'; draw();
    });
    refresh();
  }
  function focus(sel) { const el = ui.main && ui.main.querySelector(sel); if (el) { if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT)$/.test(el.tagName)) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: false }); } }

  /* ---------- the schedule ---------- */
  const KENJI = [
    'One thing at a time. The pager can wait.',
    'Read it, then break it in the lab. That is the order.',
    'Coffee is fresh. Clock in.',
    'Nobody memorizes STP on the first pass. Second pass, maybe.',
    'Do the show commands before you touch the config. Every time.',
  ];
  function drawView(r) {
    const plan = planOf(r);
    const p = readProgress(r);
    ticks = p.ticks;
    const t = today();
    const at = latest(plan);
    const st = pace(plan, p, t);
    const exam = plan.exam;
    const daysLeft = diff(t, exam);
    const nightsLeft = plan.nights.filter((n) => n.date >= t).length;
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    const itemState = (x, date) => {
      const d = isDone(x, p);
      if (d) return 'done';
      const l = at.get(x.key);
      if (l && l.date !== date) return l.date > date ? 'moved' : 'done';
      if (date < t) return PACE_KINDS.has(x.kind) ? 'missed' : 'skipped';
      return 'todo';
    };
    const movedTo = (x) => at.get(x.key) && at.get(x.key).date;

    const countdown = daysLeft > 1 ? `<b>${daysLeft}</b> nights to the exam` : daysLeft === 1 ? '<b>1</b> night to the exam: tomorrow' : daysLeft === 0 ? '<b>Exam day.</b> Good luck' : '<b>Exam date passed</b>';
    const paceTxt = st.state === 'ahead' ? `Ahead by ${st.n} item${st.n === 1 ? '' : 's'}` : st.state === 'behind' ? `Behind by ${st.n} item${st.n === 1 ? '' : 's'}` : 'On track';
    const paceLine = st.state === 'behind' ? `${st.behind} item${st.behind === 1 ? '' : 's'} from earlier nights still open.` : st.state === 'ahead' ? 'You have finished work planned for later nights.' : 'Everything due before tonight is done.';

    ui.main.innerHTML = `
      <div class="pl-wall">
        ${ui.msg ? `<p class="pl-toast" role="status">${esc(ui.msg)}</p>` : ''}
        <section class="sheet pl-paper pl-board" aria-labelledby="pl-h">
          ${PIN}${PIN.replace('pl-pin', 'pl-pin pl-pin-r')}
          <div class="pl-board-top">
            <div class="pl-title">
              <p class="label">HPL-NOC · night desk · posted ${esc(nice(r.built || t, { month: 'short', day: 'numeric' }))}</p>
              <h2 id="pl-h" class="pl-h">Shift schedule</h2>
              <p class="pl-sub">CCNA 200-301 v1.1 · exam ${esc(nice(exam, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))} · ${r.settings.nights} nights a week, ${r.settings.minutes} min</p>
            </div>
            <div class="pl-count" role="group" aria-label="Countdown">
              <p class="pl-count-n">${countdown}</p>
              <p class="pl-count-sub">${nightsLeft} study night${nightsLeft === 1 ? '' : 's'} left on the schedule</p>
            </div>
          </div>
          <div class="pl-gauges">
            <div class="pl-gauge">
              <p class="label">Overall</p>
              <div class="pl-bar" role="progressbar" aria-label="Plan items done" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${st.done} of ${st.total} items done"><i style="width:${pct}%"></i></div>
              <p class="pl-fine">${st.done} of ${st.total} items done · ${pct}%</p>
            </div>
            <div class="pl-gauge pl-pace pl-pace-${st.state}">
              <p class="label">Pace</p>
              <p class="pl-pace-v"><span class="pl-lamp" aria-hidden="true"></span>${esc(paceTxt)}</p>
              <p class="pl-fine">${esc(paceLine)}${st.behind ? ' <button type="button" class="btn pl-catch" data-act="catchup">Catch up: reflow from today</button>' : ''}</p>
            </div>
            <div class="pl-tools">
              <button type="button" class="btn" data-act="reschedule">Reschedule</button>
              <div class="pl-export">
                <label class="sr" for="pl-ics-time">Calendar events</label>
                <select id="pl-ics-time" class="pl-select"><option value="">All-day events</option>${['18:00', '19:00', '20:00', '21:00', '22:00'].map((x) => `<option value="${x}" ${ui.icsTime === x ? 'selected' : ''}>Evenings at ${Number(x.slice(0, 2)) - 12} pm</option>`).join('')}</select>
                <button type="button" class="btn" data-act="ics">Export to calendar</button>
              </div>
            </div>
          </div>
          ${(r.warnings || []).filter((w) => w.code === 'v2' || w.code === 'tight').map((w) => `<p class="pl-warn pl-${w.level}">${esc(w.text)}</p>`).join('')}
        </section>
        ${heroHtml(r, plan, p, t, itemState)}
        ${weekStripHtml(plan, p, t, itemState)}
        <section class="pl-weeks" aria-labelledby="pl-weeks-h">
          <div class="pl-weeks-head"><h3 id="pl-weeks-h" class="pl-h3">The whole schedule</h3><p class="pl-fine">Struck through: done. Flagged: missed. Pace counts lessons, scenes, tickets, labs, checkpoints and exams.</p></div>
          ${plan.weeks.map((w) => weekHtml(w, plan, p, t, itemState, movedTo)).join('')}
          <div class="pl-examday"><span class="pl-stamp pl-stamp-big">Exam day</span><div><b>${esc(nice(exam, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</b><p class="pl-fine">CCNA 200-301 v1.1. Eat something. Read every word of every question.</p></div></div>
        </section>
      </div>`;
    ui.msg = '';
    wire(r);
  }

  function itemHtml(x, state, date, movedTo, compact) {
    const done = state === 'done';
    const box = manual(x) && (!done || ticks[x.key])
      ? `<button type="button" class="pl-box${done ? ' on' : ''}" data-tick="${esc(x.key)}" aria-pressed="${done}" aria-label="${done ? 'Done' : 'Mark done'}: ${esc(x.title)}"></button>`
      : `<span class="pl-box${done ? ' on' : ''}" role="img" aria-label="${done ? 'Done' : 'Not done yet; ticks itself when you finish it'}"></span>`;
    const flag = state === 'missed' ? '<span class="pl-flag">Missed</span>' : state === 'moved' ? `<span class="pl-flag pl-flag-moved">Moved to ${esc(nice(movedTo(x), { month: 'short', day: 'numeric' }))}</span>` : state === 'skipped' ? '<span class="pl-flag pl-flag-soft">Skipped</span>' : '';
    return `<li class="pl-item pl-k-${x.kind} is-${state}">
      ${box}
      <a class="pl-item-a" href="${esc(x.href)}">
        <span class="pl-tag">${glyph(x.kind)}<span>${esc(x.tag)}</span></span>
        <span class="pl-item-t">${done ? '<span class="sr">Done: </span>' : ''}${esc(x.name)}</span>
        ${!compact && x.how ? `<span class="pl-how">${esc(x.how)}</span>` : ''}
      </a>
      <span class="pl-item-m">${flag}<span class="pl-min">${x.minutes} min</span></span>
    </li>`;
  }

  function heroHtml(r, plan, p, t, itemState) {
    const tn = plan.nights.find((n) => n.date === t);
    const next = plan.nights.find((n) => n.date > t && n.items.some((x) => !isDone(x, p)));
    const rows = (n) => `<ul class="pl-items">${n.items.map((x) => itemHtml(x, itemState(x, n.date), n.date, (y) => latest(plan).get(y.key).date)).join('')}</ul>`;
    const line = KENJI[(diff('2026-01-01', t) % KENJI.length + KENJI.length) % KENJI.length];
    if (tn) {
      const open = tn.items.filter((x) => itemState(x, tn.date) === 'todo');
      const allDone = !open.length;
      const first = open[0];
      const kind = tn.phase === 'final' ? 'Light night' : tn.items.some((x) => x.kind === 'exam') ? 'Exam night' : tn.phase === 'buffer' ? 'Buffer night' : tn.phase === 'stretch' ? 'Final stretch' : 'Study night';
      const shiftOk = r.shifts && r.shifts[tn.date] && r.shifts[tn.date] <= tn.date;
      return `<section class="sheet pl-hero${allDone ? ' is-complete' : ''}" aria-labelledby="pl-hero-h">
        <div class="pl-hero-head">
          <div><p class="label">Tonight's shift · ${esc(kind)}</p><h3 id="pl-hero-h" class="pl-hero-h">${esc(nice(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3></div>
          <p class="pl-hero-min"><b>${tn.minutes}</b> min planned<br><span>${tn.items.length - open.length} of ${tn.items.length} done</span></p>
        </div>
        ${rows(tn)}
        ${allDone ? `<div class="pl-complete"><span class="pl-stamp${reduced() ? '' : ' pl-stamp-anim'}">Shift complete</span><p>${shiftOk ? 'Every item done on time. +40 XP on the shift record.' : 'Every item done.'} ${next ? `Next shift: ${esc(nice(next.date))}.` : ''}</p>${next ? '<button type="button" class="btn" data-act="extra">Pick up extra work</button>' : ''}</div>` : `<div class="pl-hero-foot"><a class="btn primary pl-clock" href="${esc(first.href)}">Clock in: ${esc(first.tag)}</a><p class="pl-kenji">KENJI: ${esc(line)}</p></div>`}
        ${ui.extra && next ? extraHtml(next, plan, p, itemState) : ''}
      </section>`;
    }
    return `<section class="sheet pl-hero pl-off" aria-labelledby="pl-hero-h">
      <div class="pl-hero-head">
        <div><p class="label">Tonight's shift</p><h3 id="pl-hero-h" class="pl-hero-h">Night off</h3></div>
        <p class="pl-hero-min">${esc(nice(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
      </div>
      <p class="pl-off-p">Nothing on the schedule tonight. The NOC is covered. ${next ? `Next shift is <b>${esc(nice(next.date, { weekday: 'long', month: 'short', day: 'numeric' }))}</b>: ${next.items.length} item${next.items.length === 1 ? '' : 's'}, about ${next.minutes} minutes.` : ''}</p>
      ${next ? `<div class="pl-hero-foot"><button type="button" class="btn primary" data-act="extra" aria-expanded="${ui.extra}">${ui.extra ? 'Hide the extra work' : 'Pick up extra work'}</button><p class="pl-kenji">KENJI: Rest counts too. But I won't stop you.</p></div>` : ''}
      ${ui.extra && next ? extraHtml(next, plan, p, itemState) : ''}
    </section>`;
  }
  function extraHtml(n, plan, p, itemState) {
    return `<div class="pl-extra"><p class="label">Extra work from ${esc(nice(n.date))}</p><ul class="pl-items">${n.items.map((x) => itemHtml(x, itemState(x, n.date), n.date, (y) => latest(plan).get(y.key).date)).join('')}</ul><p class="pl-fine">Anything you finish early counts toward your pace.</p></div>`;
  }

  function weekStripHtml(plan, p, t, itemState) {
    const ws = weekStart(t);
    const byDate = Object.fromEntries(plan.nights.map((n) => [n.date, n]));
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const n = byDate[d];
      const isExam = d === plan.exam;
      let cls = 'pl-day';
      let status = 'Off';
      let bar = '';
      let sr = 'no shift';
      if (isExam) { cls += ' is-exam'; status = 'EXAM'; sr = 'exam day'; }
      else if (n && n.items.length) {
        const states = n.items.map((x) => itemState(x, d));
        const done = states.filter((s) => s === 'done' || s === 'moved').length;
        const missed = states.filter((s) => s === 'missed').length;
        cls += done === n.items.length ? ' is-done' : missed ? ' is-missed' : ' is-on';
        if (n.items.some((x) => x.kind === 'exam')) cls += ' has-exam';
        status = done === n.items.length ? 'Done' : missed ? `${missed} missed` : `${n.minutes} min`;
        bar = `<span class="pl-day-bar" aria-hidden="true"><i style="width:${Math.round((done / n.items.length) * 100)}%"></i></span>`;
        sr = `${n.items.length} items, ${done} done${missed ? `, ${missed} missed` : ''}`;
      } else cls += ' is-off';
      if (d === t) cls += ' is-today';
      const inner = `<span class="pl-day-w">${DOW[i]}</span><span class="pl-day-d">${parse(d).getDate()}</span><span class="pl-day-s">${esc(status)}</span>${bar}<span class="sr">${esc(nice(d, { weekday: 'long', month: 'long', day: 'numeric' }))}${d === t ? ' (today)' : ''}: ${esc(sr)}</span>`;
      cells.push(`<li class="${cls}">${n ? `<button type="button" class="pl-day-btn" data-goto="${d}">${inner}</button>` : `<div class="pl-day-btn">${inner}</div>`}</li>`);
    }
    return `<section class="pl-week-strip" aria-labelledby="pl-strip-h"><h3 id="pl-strip-h" class="pl-h3">This week</h3><ol class="pl-strip">${cells.join('')}</ol></section>`;
  }

  function weekHtml(w, plan, p, t, itemState, movedTo) {
    const cur = t >= w.start && t <= w.end;
    const all = w.nights.flatMap((n) => n.items.map((x) => itemState(x, n.date)));
    const done = all.filter((s) => s === 'done' || s === 'moved').length;
    const missed = all.filter((s) => s === 'missed').length;
    const past = w.end < t;
    const exams = w.nights.flatMap((n) => n.items.filter((x) => x.kind === 'exam'));
    const phase = DOMAINS.filter((d) => w.nights.some((n) => n.domain === d[1])).map((d) => d[0]).concat(w.nights.some((n) => n.phase === 'final' || n.phase === 'stretch') ? ['Final stretch'] : []).join(' · ');
    return `<details class="pl-week${cur ? ' is-current' : ''}${past ? ' is-past' : ''}" ${cur || missed || (!past && !plan.weeks.some((x) => t >= x.start && t <= x.end) && w === plan.weeks.find((x) => x.end >= t)) ? 'open' : ''} data-week="${w.start}">
      <summary>
        <span class="pl-wk-l"><b>${esc(w.label)}</b><span>${esc(nice(w.start, { month: 'short', day: 'numeric' }))} – ${esc(nice(w.end, { month: 'short', day: 'numeric' }))}</span></span>
        <span class="pl-wk-m">${phase ? `<span class="pl-wk-phase">${esc(phase)}</span>` : ''}${cur ? '<span class="pl-wk-now">This week</span>' : ''}${exams.length ? `<span class="pl-stamp pl-stamp-sm">${exams.map((x) => 'Exam ' + esc(x.id)).join(' · ')}</span>` : ''}${missed ? `<span class="pl-flag">${missed} missed</span>` : ''}</span>
        <span class="pl-wk-r">${done}/${all.length}<span class="sr"> items done</span></span>
      </summary>
      <ol class="pl-nights">
        ${w.nights.map((n) => {
          const states = n.items.map((x) => itemState(x, n.date));
          const ok = states.every((s) => s === 'done' || s === 'moved');
          const ex = n.items.find((x) => x.kind === 'exam');
          return `<li class="pl-night${n.date === t ? ' is-today' : ''}${ok ? ' is-done' : ''}" id="pl-n-${n.date}">
            <div class="pl-night-d"><b>${esc(nice(n.date, { weekday: 'short' }))}</b><span>${esc(nice(n.date, { month: 'short', day: 'numeric' }))}</span>${n.date === t ? '<em>Tonight</em>' : ''}${n.phase === 'final' ? '<em>Light</em>' : n.phase === 'buffer' ? '<em>Buffer</em>' : ''}</div>
            <ul class="pl-items pl-items-c">${n.items.map((x, i) => itemHtml(x, states[i], n.date, movedTo, true)).join('')}</ul>
            <div class="pl-night-r">${ex ? `<span class="pl-stamp pl-stamp-sm">Exam ${esc(ex.id)}</span>` : ''}${ok && n.items.length ? '<span class="pl-ok">✓ Done</span>' : ''}<span class="pl-min">${n.minutes} min</span></div>
          </li>`;
        }).join('')}
      </ol>
    </details>`;
  }

  function wire(r) {
    const m = ui.main;
    const on = (act, fn) => m.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener('click', fn));
    on('reschedule', () => { ui.draft = null; ui.mode = 'setup'; draw(); focus('#pl-setup-h'); });
    on('catchup', () => { commit(r.settings, { keepPast: true }); ui.msg = 'Caught up. Everything still open is planned again from today.'; draw(); focus('.pl-toast'); });
    on('extra', () => { ui.extra = !ui.extra; draw(); if (ui.extra) focus('.pl-extra .label'); else focus('[data-act=extra]'); });
    on('ics', () => {
      const sel = m.querySelector('#pl-ics-time');
      ui.icsTime = sel ? sel.value : '';
      const text = ics(planOf(r), { from: today(), time: ui.icsTime || null });
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'harbor-point-shift-schedule.ics';
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    });
    m.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', () => {
      const cur = rec();
      cur.ticks = obj(cur.ticks);
      if (cur.ticks[b.dataset.tick]) delete cur.ticks[b.dataset.tick]; else cur.ticks[b.dataset.tick] = today();
      saveRec(cur);
      const key = b.dataset.tick;
      draw();
      const again = m.querySelector(`[data-tick="${G.CSS && G.CSS.escape ? G.CSS.escape(key) : key}"]`);
      if (again) again.focus();
    }));
    m.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      const row = m.querySelector('#pl-n-' + b.dataset.goto);
      if (!row) return;
      const det = row.closest('details');
      if (det) det.open = true;
      row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      row.classList.remove('pl-flash'); void row.offsetWidth; if (!reduced()) row.classList.add('pl-flash');
      row.setAttribute('tabindex', '-1'); row.focus({ preventScroll: true });
    }));
  }

  // Keep the shift log current while the app is open, even off the #plan page.
  if (G.addEventListener) {
    G.addEventListener('hashchange', () => { ui.extra = false; try { sync(); } catch (e) { /* ignore */ } });
    G.addEventListener('storage', (e) => { if (e.key === KEY) memo = null; });
  }
})(globalThis);
