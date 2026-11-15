/* Trouble Ticket — Mock Exam module.
 * TT.renderExam(mainEl, opts) draws the exam start screen, a running exam or practice set, results, or study mode.
 * Route: #exam. Reads TT.questions (questions-1.js, questions-2.js) and TT.simChecks.
 * History lives in localStorage under 'trouble-ticket-exam-v1': { attempts: [...], missed: [ids] }.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  const KEY = 'trouble-ticket-exam-v1';
  const DOMAINS = [
    ['1.0', 'Network Fundamentals', 20],
    ['2.0', 'Network Access', 20],
    ['3.0', 'IP Connectivity', 25],
    ['4.0', 'IP Services', 10],
    ['5.0', 'Security Fundamentals', 15],
    ['6.0', 'Automation and Programmability', 10],
  ];
  const DNAME = Object.fromEntries(DOMAINS.map(([d, n]) => [d, n]));
  const FULL_COUNT = 100;
  const FULL_MINUTES = 120;
  const MAX_SIMS_FULL = 6;
  const PRACTICE_COUNT = 20;
  const PASS = 825;
  const MODE_NAME = { full: 'Full mock exam', practice: 'Domain practice', weak: 'Weak spots', retake: 'Retake: missed questions' };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escBr = (s) => esc(s).replace(/\n/g, '<br>');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const bank = () => (Array.isArray(TT.questions) ? TT.questions : []);
  const byId = (id) => bank().find((q) => q.id === id);

  /* ---- storage ------------------------------------------------------ */
  function load() {
    try {
      const v = JSON.parse(G.localStorage.getItem(KEY) || 'null');
      if (v && Array.isArray(v.attempts) && Array.isArray(v.missed)) return v;
    } catch (e) { /* ignore */ }
    return { attempts: [], missed: [] };
  }
  function save(h) {
    try { G.localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) { /* storage full or blocked */ }
  }
  function noteResult(id, ok) {
    const h = load();
    const set = new Set(h.missed);
    if (ok) set.delete(id); else set.add(id);
    h.missed = [...set];
    save(h);
  }

  /* ---- module state (survives re-renders of #exam) ------------------- */
  const S = { view: 'start', run: null, studyFilter: { d: '', o: '', t: '', text: '', show: 20 }, practiceDomain: '1.0' };
  let main = null;
  let timer = null;

  /* ---- building a session ------------------------------------------- */
  function drawFull() {
    const pool = bank();
    const chosen = [];
    const used = new Set();
    let sims = 0;
    const take = (q) => { if (used.has(q.id)) return false; if (q.type === 'sim' && sims >= MAX_SIMS_FULL) return false; used.add(q.id); chosen.push(q); if (q.type === 'sim') sims++; return true; };
    for (const [d, , w] of DOMAINS) {
      const need = Math.round((FULL_COUNT * w) / 100);
      let got = 0;
      for (const q of shuffle(pool.filter((x) => x.domain === d))) { if (got >= need) break; if (take(q)) got++; }
    }
    for (const q of shuffle(pool)) { if (chosen.length >= FULL_COUNT) break; take(q); }
    return shuffle(chosen);
  }

  /* ---- fixed practice exams A-E ------------------------------------
   * Five 100-question exams drawn once from the bank with a fixed seed, so each
   * one is the same every time (retake it, compare scores). Between them they
   * use every question in the bank, weighted by blueprint, with 5 CLI sims each. */
  const SET_IDS = ['A', 'B', 'C', 'D', 'E'];
  const SIMS_PER_SET = 5;
  function rng(seed) {
    let t = seed >>> 0;
    return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function seededShuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  let setCache = null;
  function practiceSets() {
    const pool = bank();
    if (setCache && setCache.n === pool.length) return setCache.sets;
    const rnd = rng(200301);
    const byIdOrder = pool.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const sets = SET_IDS.map(() => []);
    const sims = seededShuffle(byIdOrder.filter((q) => q.type === 'sim'), rnd);
    sets.forEach((set, k) => set.push(...sims.slice(k * SIMS_PER_SET, (k + 1) * SIMS_PER_SET)));
    for (const [d, , w] of DOMAINS) {
      const quota = Math.round((FULL_COUNT * w) / 100);
      const qs = seededShuffle(byIdOrder.filter((q) => q.domain === d && q.type !== 'sim'), rnd);
      if (!qs.length) continue;
      // deal round-robin through the shuffled domain pool; wrap around once the pool runs out
      let cur = 0;
      sets.forEach((set) => {
        const have = set.filter((q) => q.domain === d).length;
        const ids = new Set(set.map((q) => q.id));
        let need = quota - have, guard = 0;
        while (need > 0 && guard++ < qs.length * 2) { const q = qs[cur++ % qs.length]; if (!ids.has(q.id)) { set.push(q); ids.add(q.id); need--; } }
      });
    }
    const out = sets.map((set) => seededShuffle(set, rnd));
    setCache = { n: pool.length, sets: out };
    return out;
  }
  TT.examSets = () => practiceSets().map((s, k) => ({ id: SET_IDS[k], ids: s.map((q) => q.id) }));

  function startSession(mode, qs, opts) {
    if (!qs.length) return;
    const run = {
      mode,
      qs: qs.map((q) => q.id),
      i: 0,
      ans: {},
      marked: {},
      checked: {},
      simOk: {},
      sims: {},
      view: {},
      reveal: mode !== 'full',
      started: Date.now(),
      deadline: opts && opts.minutes ? Date.now() + opts.minutes * 60000 : null,
      label: (opts && opts.label) || MODE_NAME[mode],
      setId: (opts && opts.setId) || undefined,
      confirmEnd: false,
    };
    for (const q of qs) run.view[q.id] = layoutFor(q);
    S.run = run;
    S.view = 'run';
    draw();
  }

  /** Per-session display order: options shuffled for single/multi, starting order for order, target order for match. */
  function layoutFor(q) {
    const n = (q.options || []).length;
    if (q.type === 'single' || q.type === 'multi') return { opt: shuffle(range(n)) };
    if (q.type === 'order') {
      let o = shuffle(range(n));
      for (let k = 0; k < 5 && o.join() === q.answer.join(); k++) o = shuffle(range(n));
      if (o.join() === q.answer.join()) o = o.slice().reverse();
      return { start: o };
    }
    if (q.type === 'match') return { tgt: shuffle(range(q.targets.length)) };
    return {};
  }

  /* ---- grading ------------------------------------------------------- */
  function simWorld(run, q) {
    if (!run.sims[q.id]) {
      const w = TT.net.makeWorld(q.sim.world);
      run.sims[q.id] = { w, s: new TT.Session(w), dev: q.sim.start, logs: {}, hist: [], hi: -1, used: false };
    }
    return run.sims[q.id];
  }
  function gradeSim(run, q) {
    const st = run.sims[q.id];
    const fn = (TT.simChecks || {})[q.sim.check];
    let ok = false;
    if (st && typeof fn === 'function') { try { ok = !!fn(st.w); } catch (e) { ok = false; } }
    run.simOk[q.id] = ok;
    return ok;
  }
  function isCorrect(run, q) {
    const v = run.ans[q.id];
    if (q.type === 'sim') return q.id in run.simOk ? run.simOk[q.id] : gradeSim(run, q);
    if (v == null) return false;
    if (q.type === 'single') return v === q.answer;
    if (q.type === 'multi') return v.length === q.answer.length && q.answer.every((x) => v.includes(x));
    if (q.type === 'order') return v.join() === q.answer.join();
    if (q.type === 'match') return q.answer.every(([l, t]) => v[l] === t);
    return false;
  }
  function isAnswered(run, q) {
    const v = run.ans[q.id];
    if (q.type === 'sim') return !!(run.sims[q.id] && run.sims[q.id].used);
    if (v == null) return false;
    if (q.type === 'multi') return v.length > 0;
    if (q.type === 'match') return v.every((x) => x >= 0);
    return true;
  }

  /* ---- top-level draw ------------------------------------------------ */
  function draw() {
    if (!main) return;
    stopTimer();
    if (S.view === 'run' && S.run && !S.run.result) drawRun();
    else if (S.view === 'results' && S.run && S.run.result) drawResults();
    else if (S.view === 'study') drawStudy();
    else { S.view = 'start'; drawStart(); }
    const top = main.querySelector('.ex-wrap');
    if (top && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
  }

  /* ---- start screen -------------------------------------------------- */
  function drawStart() {
    const h = load();
    const counts = Object.fromEntries(DOMAINS.map(([d]) => [d, bank().filter((q) => q.domain === d).length]));
    const missed = h.missed.filter((id) => byId(id));
    const inProg = S.run && !S.run.result;
    const last = h.attempts.slice(-6).reverse();
    main.innerHTML = `
      <div class="ex-wrap">
        <section class="sheet ex-head">
          <p class="label">Certification desk</p>
          <h2 class="ex-title">Mock Exam</h2>
          <p class="ex-lede">The night shift is quiet. Good time to sit a practice CCNA 200-301. ${bank().length} original questions in the bank, written to the v1.1 blueprint.</p>
          <div class="ex-bank" role="list" aria-label="Questions per domain">
            ${DOMAINS.map(([d, n, w]) => `<div class="ex-bank-d" role="listitem"><b>${counts[d]}</b><span>${esc(d)} ${esc(n)}</span><i>${w}% of exam</i></div>`).join('')}
          </div>
          ${inProg ? `<div class="ex-resume"><span>You have a ${esc(S.run.label.toLowerCase())} in progress (question ${S.run.i + 1} of ${S.run.qs.length}).</span><button type="button" class="btn primary" data-act="resume">Resume</button><button type="button" class="btn quiet" data-act="abandon">Abandon it</button></div>` : ''}
        </section>
        <div class="ex-modes">
          <section class="card ex-mode ex-sets-card">
            <h3>Practice exams A to E</h3>
            <p class="sum">Five fixed ${FULL_COUNT}-question exams, ${FULL_MINUTES} minutes each, weighted like the real blueprint. Together they cover the whole bank. Each one stays the same, so you can retake it and watch your score climb.</p>
            <div class="ex-sets" role="list">${SET_IDS.map((id) => { const best = Math.max(-1, ...h.attempts.filter((a) => a.set === id).map((a) => a.score)); const tries = h.attempts.filter((a) => a.set === id).length; return `<div class="ex-set" role="listitem"><button type="button" class="btn ${best >= PASS ? '' : 'primary'}" data-set="${id}" ${bank().length ? '' : 'disabled'}>Exam ${id}</button><span class="ex-fine">${tries ? `Best <b class="${best >= PASS ? 'ex-good' : 'ex-bad'}">${best}</b> · ${tries} attempt${tries === 1 ? '' : 's'}` : 'Not taken yet'}</span></div>`; }).join('')}</div>
          </section>
          <section class="card ex-mode">
            <h3>Random mock exam</h3>
            <p class="sum">About ${FULL_COUNT} questions drawn by blueprint weight (20/20/25/10/15/10), ${FULL_MINUTES}-minute timer, no feedback until the end. Includes up to ${MAX_SIMS_FULL} CLI labs.</p>
            <div><button type="button" class="btn primary" data-act="full" ${bank().length ? '' : 'disabled'}>Start the exam</button></div>
          </section>
          <section class="card ex-mode">
            <h3>Domain practice</h3>
            <p class="sum">${PRACTICE_COUNT} questions from one domain, untimed. Check each answer as you go and read the explanation.</p>
            <div class="chips" role="group" aria-label="Domain">${DOMAINS.map(([d, n]) => `<button type="button" class="chip" data-dom="${d}" aria-pressed="${S.practiceDomain === d}" ${counts[d] ? '' : 'disabled'} title="${esc(n)}">${esc(d)} · ${counts[d]}</button>`).join('')}</div>
            <div><button type="button" class="btn" data-act="practice">Practice ${esc(S.practiceDomain)} ${esc(DNAME[S.practiceDomain])}</button></div>
          </section>
          <section class="card ex-mode">
            <h3>Weak spots</h3>
            <p class="sum">${missed.length ? `${missed.length} question${missed.length === 1 ? '' : 's'} you missed before. Answer one correctly and it leaves the list.` : 'Nothing here yet. Questions you miss in any mode land here.'}</p>
            <div><button type="button" class="btn" data-act="weak" ${missed.length ? '' : 'disabled'}>Drill weak spots</button></div>
          </section>
          <section class="card ex-mode">
            <h3>Study mode</h3>
            <p class="sum">Browse every question with its answer and explanation. Filter by domain, objective or keyword.</p>
            <div><button type="button" class="btn" data-act="study">Open the answer key</button></div>
          </section>
        </div>
        ${last.length ? `<section class="sheet ex-hist"><p class="label">Recent attempts</p><table class="ex-table"><thead><tr><th scope="col">Date</th><th scope="col">Mode</th><th scope="col">Score</th><th scope="col">Correct</th></tr></thead><tbody>
          ${last.map((a) => `<tr><td>${esc(new Date(a.date).toLocaleDateString())}</td><td>${a.set ? 'Practice Exam ' + esc(a.set) : esc(MODE_NAME[a.mode] || a.mode)}${a.domain ? ' ' + esc(a.domain) : ''}</td><td><b class="${a.score >= PASS ? 'ex-good' : 'ex-bad'}">${a.score}</b></td><td>${a.correct}/${a.total}</td></tr>`).join('')}
          </tbody></table></section>` : ''}
        <p class="ex-fine">Scores are percent correct scaled to 1000. Cisco does not publish an official passing score or its scaling; about 825 is the commonly cited target.</p>
      </div>`;
    main.querySelectorAll('[data-dom]').forEach((b) => b.addEventListener('click', () => { S.practiceDomain = b.dataset.dom; drawStart(); main.querySelector(`[data-dom="${b.dataset.dom}"]`).focus(); }));
    on('resume', () => { S.view = 'run'; draw(); });
    on('abandon', () => { S.run = null; draw(); });
    on('full', () => startSession('full', drawFull(), { minutes: FULL_MINUTES }));
    main.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => { const k = SET_IDS.indexOf(b.dataset.set); startSession('full', practiceSets()[k], { minutes: FULL_MINUTES, label: 'Practice Exam ' + b.dataset.set, setId: b.dataset.set }); }));
    on('practice', () => startSession('practice', shuffle(bank().filter((q) => q.domain === S.practiceDomain)).slice(0, PRACTICE_COUNT), { label: 'Domain practice ' + S.practiceDomain }));
    on('weak', () => startSession('weak', shuffle(missed.map(byId).filter(Boolean)).slice(0, 40)));
    on('study', () => { S.view = 'study'; draw(); });
  }
  function on(act, fn) { const b = main.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); }

  /* ---- running a session --------------------------------------------- */
  function fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    stopTimer();
    const run = S.run;
    if (!run || !run.deadline) return;
    timer = setInterval(() => {
      const el = main && main.querySelector('#ex-timer');
      if (!el || !el.isConnected) { stopTimer(); return; }
      const left = run.deadline - Date.now();
      el.textContent = fmtTime(left);
      el.classList.toggle('ex-low', left < 10 * 60000);
      if (left <= 0) { stopTimer(); finish(true); }
    }, 1000);
  }

  function drawRun() {
    const run = S.run;
    if (run.deadline && Date.now() >= run.deadline) { finish(true); return; }
    const q = byId(run.qs[run.i]);
    const n = run.qs.length;
    const answered = run.qs.filter((id) => isAnswered(run, byId(id))).length;
    const showFb = run.reveal && run.checked[q.id];
    main.innerHTML = `
      <div class="ex-wrap ex-run">
        <div class="ex-bar sheet">
          <div class="ex-bar-l"><span class="ex-mode-name">${esc(run.label)}</span><span class="ex-count">Question <b>${run.i + 1}</b> of ${n}</span><span class="ex-prog">${answered} answered</span></div>
          <div class="ex-bar-r">
            ${run.deadline ? `<span class="ex-timer" aria-label="Time remaining"><span id="ex-timer">${fmtTime(run.deadline - Date.now())}</span></span>` : '<span class="ex-timer ex-untimed">Untimed</span>'}
            <button type="button" class="btn ex-mark" data-act="mark" aria-pressed="${!!run.marked[q.id]}">${run.marked[q.id] ? 'Marked for review' : 'Mark for review'}</button>
            <button type="button" class="btn quiet" data-act="end">${run.mode === 'full' ? 'End exam' : 'Finish'}</button>
          </div>
        </div>
        <div id="ex-confirm"></div>
        <article class="sheet ex-q${q.exhibit ? ' ex-has-exh' : ''}${q.type === 'sim' ? ' ex-is-sim' : ''}" aria-labelledby="ex-stem">
          <div class="ex-q-main">
            <div class="ex-q-meta"><span class="pill topic">${esc(q.domain)} ${esc(DNAME[q.domain] || '')}</span>${run.reveal ? `<span class="pill">Objective ${esc(q.obj)}</span>` : ''}<span class="pill">${esc(typeLabel(q))}</span></div>
            <p class="ex-stem" id="ex-stem">${escBr(q.stem)}</p>
            ${q.type === 'sim' ? simTasks(q) : ''}
            <div id="ex-answer">${answerUI(run, q, showFb)}</div>
            ${showFb ? feedback(run, q) : ''}
          </div>
          ${q.exhibit ? `<aside class="ex-exh" aria-label="Exhibit"><p class="label">Exhibit</p>${exhibit(q.exhibit)}</aside>` : ''}
          ${q.type === 'sim' ? `<div class="ex-sim-wrap">${simConsole(run, q)}</div>` : ''}
        </article>
        <div class="ex-nav">
          <button type="button" class="btn" data-act="prev" ${run.i === 0 ? 'disabled' : ''}>Previous</button>
          ${run.reveal && !run.checked[q.id] ? '<button type="button" class="btn primary" data-act="check">Check answer</button>' : ''}
          <button type="button" class="btn ${run.reveal && !run.checked[q.id] ? '' : 'primary'}" data-act="next">${run.i === n - 1 ? (run.mode === 'full' ? 'Review and end' : 'Finish') : 'Next'}</button>
        </div>
        <details class="ex-grid-wrap sheet" ${n <= 40 || run.gridOpen ? 'open' : ''}>
          <summary>Navigator <span class="ex-legend"><i class="ex-k ex-ans"></i>answered <i class="ex-k"></i>unanswered <i class="ex-k ex-mk"></i>marked</span></summary>
          <div class="ex-grid" role="list">
            ${run.qs.map((id, k) => { const qq = byId(id); const cls = [isAnswered(run, qq) ? 'ex-ans' : '', run.marked[id] ? 'ex-mk' : '', k === run.i ? 'ex-cur' : '', run.reveal && run.checked[id] ? (isCorrect(run, qq) ? 'ex-ok' : 'ex-no') : ''].join(' '); return `<button type="button" role="listitem" class="ex-cell ${cls}" data-go="${k}" aria-label="Question ${k + 1}${isAnswered(run, qq) ? ', answered' : ', unanswered'}${run.marked[id] ? ', marked for review' : ''}"${k === run.i ? ' aria-current="true"' : ''}>${k + 1}</button>`; }).join('')}
          </div>
        </details>
      </div>`;
    wireAnswer(run, q);
    on('mark', () => { run.marked[q.id] = !run.marked[q.id]; drawRun(); focusAct('mark'); });
    on('prev', () => go(run.i - 1));
    on('next', () => { if (run.i === n - 1) askEnd(); else go(run.i + 1); });
    on('check', () => { if (q.type === 'sim') gradeSim(run, q); run.checked[q.id] = true; noteResult(q.id, isCorrect(run, q)); if (TT.sfx) TT.sfx(isCorrect(run, q) ? 'correct' : 'wrong'); drawRun(); focusAct('next'); });
    on('end', askEnd);
    main.querySelector('.ex-grid-wrap').addEventListener('toggle', (e) => { run.gridOpen = e.target.open; });
    main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    if (q.type === 'sim') wireSim(run, q);
    startTimer();
  }
  function focusAct(a) { const b = main.querySelector(`[data-act="${a}"]`); if (b) b.focus(); }
  function typeLabel(q) {
    return { single: 'Choose one', multi: `Choose ${['', '', 'two', 'three', 'four'][q.pick] || q.pick}`, order: 'Put in order', match: 'Match', sim: 'CLI lab' }[q.type];
  }
  function go(k) {
    const run = S.run;
    const q = byId(run.qs[run.i]);
    if (q.type === 'sim') gradeSim(run, q);
    run.i = Math.max(0, Math.min(run.qs.length - 1, k));
    run.confirmEnd = false;
    drawRun();
    const stem = main.querySelector('#ex-stem');
    if (stem) { stem.setAttribute('tabindex', '-1'); stem.focus({ preventScroll: true }); }
    main.scrollIntoView({ block: 'start' });
  }
  function askEnd() {
    const run = S.run;
    const un = run.qs.filter((id) => !isAnswered(run, byId(id))).length;
    const mk = run.qs.filter((id) => run.marked[id]).length;
    const box = main.querySelector('#ex-confirm');
    box.innerHTML = `<div class="ex-confirm" role="alertdialog" aria-labelledby="ex-cf-t"><p id="ex-cf-t"><b>${run.mode === 'full' ? 'End the exam?' : 'Finish this set?'}</b> ${un ? `${un} question${un === 1 ? ' is' : 's are'} unanswered and will be scored wrong.` : 'Every question has an answer.'} ${mk ? `${mk} marked for review.` : ''}</p><div class="ex-cf-b"><button type="button" class="btn primary" data-act="really-end">${run.mode === 'full' ? 'End and score' : 'Finish and score'}</button><button type="button" class="btn quiet" data-act="cancel-end">Keep going</button></div></div>`;
    on('really-end', () => finish(false));
    on('cancel-end', () => { box.innerHTML = ''; });
    focusAct('really-end');
    box.scrollIntoView({ block: 'nearest' });
  }

  /* ---- answer widgets ------------------------------------------------ */
  function answerUI(run, q, locked) {
    const v = run.ans[q.id];
    const L = run.view[q.id] || {};
    const dis = locked ? 'disabled' : '';
    if (q.type === 'single' || q.type === 'multi') {
      const multi = q.type === 'multi';
      const sel = multi ? v || [] : [v];
      return `<fieldset class="ex-opts"><legend class="sr">${multi ? `Choose ${q.pick}` : 'Choose one'}</legend>
        ${L.opt.map((oi, k) => {
          const chk = sel.includes(oi);
          const mark = locked ? (multi ? q.answer.includes(oi) : q.answer === oi) ? ' ex-right' : chk ? ' ex-wrong' : '' : '';
          return `<label class="ex-opt${chk ? ' ex-sel' : ''}${mark}"><input type="${multi ? 'checkbox' : 'radio'}" name="ex-o" value="${oi}" ${chk ? 'checked' : ''} ${dis}><span class="ex-letter">${String.fromCharCode(65 + k)}</span><span class="ex-otext">${escBr(q.options[oi])}</span></label>`;
        }).join('')}
        ${multi ? `<p class="ex-pickmsg" id="ex-pickmsg" aria-live="polite">${(v || []).length} of ${q.pick} selected</p>` : ''}
      </fieldset>`;
    }
    if (q.type === 'order') {
      const cur = v || L.start;
      return `<p class="ex-hint">Drag the items, or use the arrow buttons, to put them in order (first at the top).</p>
        <ol class="ex-order" id="ex-order">${cur.map((oi, k) => {
          const mark = locked ? (q.answer[k] === oi ? ' ex-right' : ' ex-wrong') : '';
          return `<li class="ex-oi${mark}" draggable="${locked ? 'false' : 'true'}" data-oi="${oi}" data-k="${k}"><span class="ex-grip" aria-hidden="true">⋮⋮</span><span class="ex-num">${k + 1}</span><span class="ex-otext">${escBr(q.options[oi])}</span>
          <span class="ex-mv"><button type="button" data-mv="-1" aria-label="Move up: ${esc(q.options[oi])}" ${k === 0 || locked ? 'disabled' : ''}>▲</button><button type="button" data-mv="1" aria-label="Move down: ${esc(q.options[oi])}" ${k === cur.length - 1 || locked ? 'disabled' : ''}>▼</button></span></li>`;
        }).join('')}</ol><p class="sr" id="ex-live" aria-live="polite"></p>`;
    }
    if (q.type === 'match') {
      const cur = v || q.options.map(() => -1);
      const right = Object.fromEntries(q.answer.map(([l, t]) => [l, t]));
      return `<p class="ex-hint">Choose the matching item for each row.${q.answer.length > q.targets.length ? ' An answer can be used more than once.' : ''}</p>
        <div class="ex-match">${q.options.map((o, l) => {
          const mark = locked ? (cur[l] === right[l] ? ' ex-right' : ' ex-wrong') : '';
          return `<div class="ex-mrow${mark}"><label for="ex-m${l}">${escBr(o)}</label><select id="ex-m${l}" data-l="${l}" ${dis}><option value="-1">Choose…</option>${L.tgt.map((t) => `<option value="${t}" ${cur[l] === t ? 'selected' : ''}>${esc(q.targets[t])}</option>`).join('')}</select>${locked && cur[l] !== right[l] ? `<span class="ex-should">Correct: ${esc(q.targets[right[l]])}</span>` : ''}</div>`;
        }).join('')}</div>`;
    }
    return '';
  }

  function wireAnswer(run, q) {
    const box = main.querySelector('#ex-answer');
    if (!box) return;
    if (q.type === 'single') {
      box.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
        run.ans[q.id] = Number(inp.value);
        box.querySelectorAll('.ex-opt').forEach((l) => l.classList.toggle('ex-sel', l.querySelector('input').checked));
        refreshCell(run, q);
      }));
    } else if (q.type === 'multi') {
      box.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
        const cur = new Set(run.ans[q.id] || []);
        const val = Number(inp.value);
        if (inp.checked) {
          if (cur.size >= q.pick) { inp.checked = false; const m = box.querySelector('#ex-pickmsg'); m.textContent = `You can choose only ${q.pick}. Clear one first.`; m.classList.add('ex-warn'); return; }
          cur.add(val);
        } else cur.delete(val);
        run.ans[q.id] = [...cur];
        box.querySelectorAll('.ex-opt').forEach((l) => l.classList.toggle('ex-sel', l.querySelector('input').checked));
        const m = box.querySelector('#ex-pickmsg');
        m.textContent = `${cur.size} of ${q.pick} selected`;
        m.classList.remove('ex-warn');
        refreshCell(run, q);
      }));
    } else if (q.type === 'order') {
      const list = box.querySelector('#ex-order');
      const cur = () => run.ans[q.id] || run.view[q.id].start.slice();
      const set = (arr, focusOi, dir) => {
        run.ans[q.id] = arr;
        box.innerHTML = answerUI(run, q, false);
        wireAnswer(run, q);
        refreshCell(run, q);
        if (focusOi != null) {
          const li = box.querySelector(`[data-oi="${focusOi}"]`);
          const btn = li && (li.querySelector(`[data-mv="${dir}"]:not([disabled])`) || li.querySelector('[data-mv]:not([disabled])'));
          if (btn) btn.focus();
          const live = box.querySelector('#ex-live');
          if (live) live.textContent = `${q.options[focusOi]} moved to position ${arr.indexOf(focusOi) + 1}`;
        }
      };
      list.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => {
        const li = b.closest('li');
        const k = Number(li.dataset.k), d = Number(b.dataset.mv);
        const arr = cur().slice();
        const j = k + d;
        if (j < 0 || j >= arr.length) return;
        [arr[k], arr[j]] = [arr[j], arr[k]];
        set(arr, Number(li.dataset.oi), d);
      }));
      let dragK = null;
      list.querySelectorAll('li').forEach((li) => {
        li.addEventListener('dragstart', (e) => { dragK = Number(li.dataset.k); li.classList.add('ex-drag'); try { e.dataTransfer.setData('text/plain', li.dataset.k); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* old browsers */ } });
        li.addEventListener('dragend', () => { li.classList.remove('ex-drag'); dragK = null; });
        li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('ex-over'); });
        li.addEventListener('dragleave', () => li.classList.remove('ex-over'));
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          li.classList.remove('ex-over');
          const to = Number(li.dataset.k);
          if (dragK == null || dragK === to) return;
          const arr = cur().slice();
          const [it] = arr.splice(dragK, 1);
          arr.splice(to, 0, it);
          set(arr, null);
        });
      });
    } else if (q.type === 'match') {
      box.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
        const cur = (run.ans[q.id] || q.options.map(() => -1)).slice();
        cur[Number(s.dataset.l)] = Number(s.value);
        run.ans[q.id] = cur;
        refreshCell(run, q);
      }));
    }
  }
  function refreshCell(run, q) {
    const k = run.qs.indexOf(q.id);
    const c = main.querySelector(`[data-go="${k}"]`);
    if (c) c.classList.toggle('ex-ans', isAnswered(run, q));
    const p = main.querySelector('.ex-prog');
    if (p) p.textContent = run.qs.filter((id) => isAnswered(run, byId(id))).length + ' answered';
  }

  /* ---- exhibits ------------------------------------------------------ */
  function exhibit(x) {
    if (!x) return '';
    if (x.kind === 'cli') return `<div class="ex-cli" tabindex="0" role="region" aria-label="${esc(x.title || 'CLI output')}">${x.title ? `<div class="ex-cli-t">${esc(x.title)}</div>` : ''}<pre>${x.lines.map((l) => (/^\S+[#>]\s|^C:\\>|^\$ /.test(l) ? `<span class="ex-cli-cmd">${esc(l)}</span>` : /^%/.test(l) ? `<span class="ex-cli-sys">${esc(l)}</span>` : esc(l))).join('\n')}</pre></div>`;
    if (x.kind === 'table') {
      const [h, ...rows] = x.rows;
      return `<div class="ex-tbl-wrap" tabindex="0" role="region" aria-label="Exhibit table"><table class="ex-table"><thead><tr>${h.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (x.kind === 'svg') return `<div class="ex-svg">${x.svg}</div>`;
    return '';
  }

  /* ---- sims ---------------------------------------------------------- */
  function simTasks(q) {
    return `<div class="ex-tasks"><p class="label">Your tasks</p><ol>${q.sim.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ol><p class="ex-hint">Use the console below. Your configuration is graded when you leave this question.</p></div>`;
  }
  function simDevices(q) {
    return Object.entries(q.sim.world.devices).filter(([, d]) => !d.locked).map(([id]) => id);
  }
  function simConsole(run, q) {
    const st = simWorld(run, q);
    const links = q.sim.world.links.map(([a, ai, b, bi]) => `${hn(st, a)} ${shortIf(ai)} ↔ ${hn(st, b)} ${shortIf(bi)}`);
    return `<p class="label">Console</p>
      <p class="ex-links"><span>Cabling:</span> ${links.map(esc).join(' · ')}</p>
      <div class="devtabs" role="tablist" id="ex-devtabs">${simDevices(q).map((id) => `<button type="button" role="tab" data-dev="${id}" aria-selected="${id === st.dev}">${esc(st.w.devices[id].hostname)}</button>`).join('')}</div>
      <div class="term ex-term" id="ex-term"><div class="out" id="ex-out" role="log" aria-live="polite"></div><div class="line"><label class="sr" for="ex-cmd">Command</label><span class="p" id="ex-prompt"></span><input id="ex-cmd" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"></div></div>
      <p class="term-help"><kbd>Tab</kbd> completes a word · <kbd>?</kbd> lists options · <kbd>↑</kbd> <kbd>↓</kbd> history · abbreviations work</p>`;
  }
  const hn = (st, id) => (st.w.devices[id] ? st.w.devices[id].hostname : id);
  const shortIf = (n) => (n === 'NIC' ? 'NIC' : n.replace(/^GigabitEthernet/, 'Gi').replace(/^FastEthernet/, 'Fa'));
  function classify(line) {
    if (/^%(LINK|LINEPROTO|OSPF|SYS|SSH|CDP|SPANTREE|EC)/.test(line)) return 'sys';
    if (/^% /.test(line) || /^\s*\^$/.test(line) || /is not recognized/.test(line)) return 'err';
    return '';
  }
  function simLog(st, id) {
    if (!st.logs[id]) {
      const d = st.w.devices[id];
      st.logs[id] = [['dim', d.kind === 'pc' ? `Command prompt on ${d.hostname}. Type help for commands.` : `Console connected to ${d.hostname}. Type ? for help.`]];
    }
    return st.logs[id];
  }
  function drawSimOut(st) {
    const out = main.querySelector('#ex-out');
    if (!out) return;
    out.innerHTML = simLog(st, st.dev).map(([c, t]) => {
      if (c === 'cmd') { const i = t.indexOf('\u0000'); return `<div><span class="p">${esc(t.slice(0, i))}</span><span class="cmd">${esc(t.slice(i + 1))}</span></div>`; }
      return `<div class="${c}">${esc(t) || ' '}</div>`;
    }).join('');
    out.scrollTop = out.scrollHeight;
    main.querySelector('#ex-prompt').textContent = st.s.prompt(st.dev);
  }
  function wireSim(run, q) {
    const st = simWorld(run, q);
    if (!simDevices(q).includes(st.dev)) st.dev = simDevices(q)[0];
    drawSimOut(st);
    const input = main.querySelector('#ex-cmd');
    const exec = (line, help) => {
      const log = simLog(st, st.dev);
      log.push(['cmd', st.s.prompt(st.dev) + '\u0000' + line + (help ? '?' : '')]);
      let out;
      try { out = help ? st.s.run(st.dev, line + '?') : st.s.run(st.dev, line); } catch (e) { out = ['% ' + (e && e.message ? e.message : 'Command failed')]; }
      for (const l of out) log.push([classify(l), l]);
      if (line.trim()) { st.used = true; delete run.simOk[q.id]; refreshCell(run, q); }
      drawSimOut(st);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value;
        if (v.trim()) st.hist.push(v);
        st.hi = -1;
        input.value = '';
        exec(v, false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const c = typeof st.s.complete === 'function' ? st.s.complete(st.dev, input.value) : null;
        if (c) input.value = c;
      } else if (e.key === '?') {
        e.preventDefault();
        exec(input.value, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!st.hist.length) return;
        st.hi = st.hi < 0 ? st.hist.length - 1 : Math.max(0, st.hi - 1);
        input.value = st.hist[st.hi];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (st.hi < 0) return;
        st.hi++;
        if (st.hi >= st.hist.length) { st.hi = -1; input.value = ''; } else input.value = st.hist[st.hi];
      }
    });
    main.querySelector('#ex-term').addEventListener('click', () => { if (!G.getSelection || !G.getSelection().toString()) input.focus(); });
    main.querySelectorAll('#ex-devtabs [data-dev]').forEach((b) => b.addEventListener('click', () => {
      st.dev = b.dataset.dev;
      main.querySelectorAll('#ex-devtabs [data-dev]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      drawSimOut(st);
      input.focus();
    }));
  }

  /* ---- feedback, results --------------------------------------------- */
  function refLinks(ref) {
    if (!ref) return '';
    const out = [];
    const lessons = Array.isArray(TT.lessons) ? TT.lessons : null;
    const cards = Array.isArray(TT.cards) ? TT.cards : null;
    for (const m of String(ref).matchAll(/\bl(\d+)-(\d+)\b/g)) {
      const id = 'l' + m[1] + '-' + m[2];
      const l = lessons && lessons.find((x) => x.id === id);
      if (lessons && !l) continue;
      out.push(`<a href="#learn-${id}">Lesson ${esc(m[1] + '.' + m[2])}${l && l.title ? ': ' + esc(l.title) : ''}</a>`);
    }
    for (const m of String(ref).matchAll(/card:([\w-]+)/g)) {
      const c = cards && cards.find((x) => x.id === m[1]);
      if (cards && !c) continue;
      out.push(`<a href="#card-${esc(m[1])}">Field guide: ${esc(c && (c.title || c.name) ? c.title || c.name : m[1])}</a>`);
    }
    return out.length ? `<p class="ex-refs"><span>Study:</span> ${out.join(' · ')}</p>` : '';
  }
  function feedback(run, q) {
    const ok = isCorrect(run, q);
    return `<div class="ex-fb ${ok ? 'ex-fb-ok' : 'ex-fb-no'}" role="status"><p class="ex-verdict">${ok ? 'Correct.' : q.type === 'sim' ? 'Not solved yet.' : 'Not quite.'}</p>${q.type === 'sim' && !ok ? '<p class="ex-hint">You can keep working in the console and check again by moving on and back, but the explanation below gives it away.</p>' : ''}${!ok && q.type !== 'sim' ? `<div class="ex-correct"><b>Correct answer:</b> ${correctText(q)}</div>` : ''}<p>${esc(q.explanation)}</p>${q.type === 'sim' && q.sim.solution ? solutionBlock(q) : ''}${refLinks(q.ref)}</div>`;
  }
  function solutionBlock(q) {
    return `<details class="ex-sol"><summary>One working solution</summary><pre>${Object.entries(q.sim.solution).map(([d, cmds]) => `! ${esc((q.sim.world.devices[d] || {}).hostname || d)}\n${cmds.map(esc).join('\n')}`).join('\n\n')}</pre></details>`;
  }
  function correctText(q) {
    if (q.type === 'single') return escBr(q.options[q.answer]);
    if (q.type === 'multi') return '<ul>' + q.answer.map((i) => `<li>${escBr(q.options[i])}</li>`).join('') + '</ul>';
    if (q.type === 'order') return '<ol>' + q.answer.map((i) => `<li>${escBr(q.options[i])}</li>`).join('') + '</ol>';
    if (q.type === 'match') return '<ul>' + q.answer.map(([l, t]) => `<li>${esc(q.options[l])} → ${esc(q.targets[t])}</li>`).join('') + '</ul>';
    if (q.type === 'sim') return 'Complete every task so the lab check passes.';
    return '';
  }
  function yourText(run, q) {
    const v = run.ans[q.id];
    if (q.type === 'sim') return run.sims[q.id] && run.sims[q.id].used ? (isCorrect(run, q) ? 'Lab solved' : 'Lab attempted, check failed') : '<i>Not attempted</i>';
    if (!isAnswered(run, q)) return '<i>No answer</i>';
    if (q.type === 'single') return escBr(q.options[v]);
    if (q.type === 'multi') return '<ul>' + v.map((i) => `<li>${escBr(q.options[i])}</li>`).join('') + '</ul>';
    if (q.type === 'order') return '<ol>' + v.map((i) => `<li>${escBr(q.options[i])}</li>`).join('') + '</ol>';
    if (q.type === 'match') return '<ul>' + v.map((t, l) => `<li>${esc(q.options[l])} → ${t >= 0 ? esc(q.targets[t]) : '?'}</li>`).join('') + '</ul>';
    return '';
  }

  function finish(timeUp) {
    stopTimer();
    const run = S.run;
    if (!run || run.result) return;
    const per = {};
    let correct = 0;
    const missed = [];
    for (const id of run.qs) {
      const q = byId(id);
      if (q.type === 'sim') gradeSim(run, q);
      const ok = isCorrect(run, q);
      if (ok) correct++; else missed.push(id);
      const p = (per[q.domain] = per[q.domain] || [0, 0]);
      p[1]++;
      if (ok) p[0]++;
    }
    const total = run.qs.length;
    const score = Math.round((correct / total) * 1000);
    run.result = { correct, total, score, per, missed, timeUp, secs: Math.round((Date.now() - run.started) / 1000) };
    const h = load();
    const set = new Set(h.missed);
    for (const id of run.qs) { if (missed.includes(id)) set.add(id); else set.delete(id); }
    h.missed = [...set];
    h.attempts.push({ date: new Date().toISOString(), mode: run.mode, set: run.setId, domain: run.mode === 'practice' ? byId(run.qs[0]).domain : undefined, score, correct, total, perDomain: per });
    if (h.attempts.length > 60) h.attempts = h.attempts.slice(-60);
    save(h);
    S.view = 'results';
    draw();
  }

  function drawResults() {
    const run = S.run;
    const r = run.result;
    const pass = r.score >= PASS;
    const filt = run.resFilter || 'missed';
    const list = run.qs.map((id, k) => [k, byId(id)]).filter(([, q]) => filt === 'all' || r.missed.includes(q.id));
    main.innerHTML = `
      <div class="ex-wrap">
        <section class="sheet ex-res-head">
          <p class="label">${esc(run.label)} · results</p>
          <div class="ex-score-row">
            <div class="ex-score ${pass ? 'ex-good' : 'ex-bad'}"><b>${r.score}</b><span>out of 1000</span></div>
            <div class="ex-score-txt">
              <p class="ex-big">${r.correct} of ${r.total} correct${r.timeUp ? ' · time ran out' : ''}</p>
              <div class="ex-meter" role="img" aria-label="Score ${r.score} of 1000; pass mark about ${PASS}"><span style="width:${r.score / 10}%"></span><i style="left:${PASS / 10}%"></i></div>
              <p class="ex-fine">Line at ${PASS}: the commonly cited CCNA pass mark. Cisco does not publish an official passing score, and its scaling is not public, so treat this as a rough guide. ${pass ? 'You cleared it. Do it again on a fresh draw before you book.' : 'Not there yet. The missed list below is your study plan.'}</p>
              <p class="ex-fine">Time used: ${fmtTime(r.secs * 1000)}</p>
            </div>
            ${pass ? '<div class="stamp ex-stamp" aria-hidden="true">PASS</div>' : ''}
          </div>
          <div class="ex-doms">${DOMAINS.filter(([d]) => r.per[d]).map(([d, n]) => { const [c, t] = r.per[d]; const pc = Math.round((c / t) * 100); return `<div class="ex-dom"><div class="ex-dom-l"><span>${esc(d)} ${esc(n)}</span><b>${c}/${t} · ${pc}%</b></div><div class="ex-bar-o" role="img" aria-label="${esc(n)} ${pc} percent"><span class="${pc >= 82 ? 'ex-g' : pc >= 65 ? 'ex-w' : 'ex-r'}" style="width:${pc}%"></span></div></div>`; }).join('')}</div>
          <div class="tools">
            ${r.missed.length ? '<button type="button" class="btn primary" data-act="retake">Retake missed only</button>' : ''}
            <button type="button" class="btn" data-act="home">Back to the exam desk</button>
          </div>
        </section>
        <section class="ex-review">
          <div class="ex-rev-top"><h3>Question review</h3><div class="seg" role="group" aria-label="Show"><button type="button" data-f="missed" aria-pressed="${filt === 'missed'}">Missed (${r.missed.length})</button><button type="button" data-f="all" aria-pressed="${filt === 'all'}">All (${r.total})</button></div></div>
          ${list.length ? list.map(([k, q]) => reviewItem(run, q, k)).join('') : '<p class="sheet">Nothing missed. Clean sheet.</p>'}
        </section>
      </div>`;
    on('retake', () => startSession('retake', r.missed.map(byId).filter(Boolean)));
    on('home', () => { S.view = 'start'; draw(); });
    main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { run.resFilter = b.dataset.f; drawResults(); main.querySelector(`[data-f="${b.dataset.f}"]`).focus(); }));
  }
  function reviewItem(run, q, k) {
    const ok = isCorrect(run, q);
    return `<article class="sheet ex-rev ${ok ? 'ex-rev-ok' : 'ex-rev-no'}">
      <div class="ex-q-meta"><span class="ex-rev-n">Q${k + 1}</span><span class="pill ${ok ? 'ex-pill-ok' : 'p1'}">${ok ? 'Correct' : 'Missed'}</span><span class="pill topic">${esc(q.obj)}</span><span class="pill">${esc(typeLabel(q))}</span></div>
      <p class="ex-stem">${escBr(q.stem)}</p>
      ${q.exhibit ? `<details class="ex-rev-exh"><summary>Show exhibit</summary>${exhibit(q.exhibit)}</details>` : ''}
      <div class="ex-ans-cols"><div><p class="label">Your answer</p><div class="ex-a">${yourText(run, q)}</div></div><div><p class="label">Correct answer</p><div class="ex-a">${correctText(q)}</div></div></div>
      <p class="ex-expl">${esc(q.explanation)}</p>
      ${q.type === 'sim' && q.sim.solution ? solutionBlock(q) : ''}
      ${refLinks(q.ref)}
    </article>`;
  }

  /* ---- study mode ---------------------------------------------------- */
  function drawStudy() {
    const f = S.studyFilter;
    const objs = [...new Set(bank().filter((q) => !f.d || q.domain === f.d).map((q) => q.obj))].sort((a, b) => a.split('.')[0] - b.split('.')[0] || a.split('.')[1] - b.split('.')[1]);
    const text = f.text.trim().toLowerCase();
    const rows = bank().filter((q) => (!f.d || q.domain === f.d) && (!f.o || q.obj === f.o) && (!f.t || q.type === f.t) && (!text || (q.stem + ' ' + (q.options || []).join(' ') + ' ' + q.explanation).toLowerCase().includes(text)));
    main.innerHTML = `
      <div class="ex-wrap">
        <section class="sheet ex-head">
          <p class="label">Study mode</p>
          <h2 class="ex-title">The answer key</h2>
          <div class="ex-filters">
            <label>Domain <select id="ex-fd"><option value="">All domains</option>${DOMAINS.map(([d, n]) => `<option value="${d}" ${f.d === d ? 'selected' : ''}>${d} ${esc(n)}</option>`).join('')}</select></label>
            <label>Objective <select id="ex-fo"><option value="">All</option>${objs.map((o) => `<option ${f.o === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
            <label>Type <select id="ex-ft"><option value="">All</option>${['single', 'multi', 'order', 'match', 'sim'].map((t) => `<option value="${t}" ${f.t === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="ex-fs">Search <input id="ex-fx" type="search" value="${esc(f.text)}" placeholder="e.g. native VLAN"></label>
          </div>
          <div class="tools"><span class="ex-fine" aria-live="polite">${rows.length} question${rows.length === 1 ? '' : 's'}</span><button type="button" class="btn quiet" data-act="home">Back to the exam desk</button></div>
        </section>
        <section class="ex-review">${rows.slice(0, f.show).map((q) => studyItem(q)).join('')}
          ${rows.length > f.show ? `<div class="ex-more"><button type="button" class="btn" data-act="more">Show ${Math.min(20, rows.length - f.show)} more</button></div>` : ''}
        </section>
      </div>`;
    const upd = (k, el, ev) => el.addEventListener(ev, () => { f[k] = el.value; if (k === 'd') f.o = ''; f.show = 20; drawStudy(); const n = main.querySelector('#' + el.id); n.focus(); if (n.type === 'search') { n.setSelectionRange(n.value.length, n.value.length); } });
    upd('d', main.querySelector('#ex-fd'), 'change');
    upd('o', main.querySelector('#ex-fo'), 'change');
    upd('t', main.querySelector('#ex-ft'), 'change');
    let tmo = null;
    const fx = main.querySelector('#ex-fx');
    fx.addEventListener('input', () => { clearTimeout(tmo); tmo = setTimeout(() => { f.text = fx.value; f.show = 20; drawStudy(); const n = main.querySelector('#ex-fx'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
    on('home', () => { S.view = 'start'; draw(); });
    on('more', () => { f.show += 20; drawStudy(); });
  }
  function studyItem(q) {
    let body = '';
    if (q.type === 'single' || q.type === 'multi') {
      const right = q.type === 'multi' ? q.answer : [q.answer];
      body = `<ol class="ex-study-opts" type="A">${q.options.map((o, i) => `<li class="${right.includes(i) ? 'ex-right' : ''}">${escBr(o)}${right.includes(i) ? ' <b class="ex-tick">✓ correct</b>' : ''}${q.why && q.why[i] ? `<span class="ex-why">${esc(q.why[i])}</span>` : ''}</li>`).join('')}</ol>`;
    } else if (q.type === 'sim') {
      body = simTasks(q).replace('Use the console below. Your configuration is graded when you leave this question.', 'Practice this lab in a mock exam or domain practice.') + (q.sim.solution ? solutionBlock(q) : '');
    } else body = `<div class="ex-a"><p class="label">Answer</p>${correctText(q)}</div>`;
    return `<article class="sheet ex-rev">
      <div class="ex-q-meta"><span class="ex-rev-n">${esc(q.id)}</span><span class="pill topic">${esc(q.obj)}</span><span class="pill">${esc(typeLabel(q))}</span><span class="pill">${['', 'Easy', 'Medium', 'Hard'][q.difficulty] || ''}</span></div>
      <p class="ex-stem">${escBr(q.stem)}</p>
      ${q.exhibit ? exhibit(q.exhibit) : ''}
      ${body}
      <details class="ex-why-d"><summary>Explanation</summary><p class="ex-expl">${esc(q.explanation)}</p>${refLinks(q.ref)}</details>
    </article>`;
  }

  /* ---- entry point --------------------------------------------------- */
  TT.renderExam = function renderExam(mainEl, opts) {
    main = mainEl;
    if (opts && opts.view && ['start', 'study'].includes(opts.view)) S.view = opts.view;
    draw();
  };
  // For tests and the lead engineer: pure helpers.
  TT.examInternals = { drawFull, isCorrect, KEY };
})(globalThis);
