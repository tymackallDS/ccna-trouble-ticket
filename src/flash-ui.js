/* Trouble Ticket: Flashcards UI.
 * TT.renderFlashcards(mainEl, opts) draws the deck picker, study view and session summary.
 * opts.deck (optional): a deck id from TT.flashDecks, or 'due' for every due card. A plain string works too.
 * Scheduler: Leitner boxes 0-5. Again resets to box 0 and comes back in the same session.
 * Progress lives in localStorage 'trouble-ticket-flash-v1' as { cards: { id: { box, due, seen, lapses } } }.
 * Pure helpers TT.flashSched and TT.flashMatch are exported for tests.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  const KEY = 'trouble-ticket-flash-v1';
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  // box:      0     1        2     3        4        5
  const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
  const RATINGS = [
    { id: 'again', label: 'Again', key: '1' },
    { id: 'hard', label: 'Hard', key: '2' },
    { id: 'good', label: 'Good', key: '3' },
    { id: 'easy', label: 'Easy', key: '4' },
  ];
  const DOMAIN_NAMES = { fund: 'Network Fundamentals', access: 'Network Access', ipconn: 'IP Connectivity', svc: 'IP Services', sec: 'Security Fundamentals', auto: 'Automation and Programmability' };
  const TYPED_DECKS = { ports: true, commands: true };

  /* ---------- scheduler (pure) ---------- */
  function nextBox(box, rating) {
    box = Math.max(0, Math.min(5, box | 0));
    if (rating === 'again') return 0;
    if (rating === 'hard') return Math.max(1, box);
    if (rating === 'good') return Math.min(5, box + 1);
    return Math.min(5, box + 2); // easy
  }
  function rate(state, rating, now) {
    const s = state ? { box: state.box | 0, due: state.due || 0, seen: state.seen | 0, lapses: state.lapses | 0 } : { box: 0, due: 0, seen: 0, lapses: 0 };
    s.seen += 1;
    if (rating === 'again') s.lapses += 1;
    s.box = nextBox(s.box, rating);
    s.due = now + INTERVALS[s.box];
    return s;
  }
  function fmtInterval(ms) {
    if (ms <= 0) return 'now';
    if (ms < DAY) return Math.round(ms / MIN) + ' min';
    const d = Math.round(ms / DAY);
    return d + (d === 1 ? ' day' : ' days');
  }
  TT.flashSched = { INTERVALS, nextBox, rate, fmtInterval };

  /* ---------- typed-answer matching (pure) ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const nums = (s) => (String(s).match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join(',');
  function matchAnswer(card, typed) {
    const t = norm(typed);
    if (!t) return false;
    const cands = [card.back, ...(card.accept || [])];
    const stripped = card.back.replace(/\s*\([^)]*\)/g, '').trim();
    if (stripped && stripped !== card.back) cands.push(stripped);
    if (cands.some((c) => norm(c) === t)) return true;
    if (card.deck === 'ports') {
      if (card.rev) {
        // "SSH (also SCP and SFTP)": the first name alone is enough
        const first = norm(card.back.split(/[\s(/]/)[0]);
        return first.length >= 3 && t === first;
      }
      // Number answers: the main part's numbers must match; a protocol word, if typed, must be right
      const main = card.back.replace(/\s*\([^)]*\)/g, '');
      const mainNums = nums(main);
      if (!mainNums || nums(t) !== mainNums) return false;
      const proto = t.match(/\b(tcp|udp)\b/g) || [];
      return proto.every((p) => norm(main).includes(p));
    }
    return false;
  }
  const isTypeable = (c) => !!TYPED_DECKS[c.deck] && !c.rev;
  TT.flashMatch = { matchAnswer, isTypeable, norm };

  /* ---------- storage ---------- */
  function load() {
    try {
      const v = JSON.parse(G.localStorage.getItem(KEY));
      if (v && typeof v === 'object' && v.cards && typeof v.cards === 'object') return v;
    } catch (e) { /* unreadable or blocked: start fresh */ }
    return { cards: {} };
  }
  function save() {
    try { G.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable: progress lasts for this visit */ }
  }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escBr = (s) => esc(s).replace(/\n/g, '<br>');
  const decks = () => TT.flashDecks || [];
  const deckName = (id) => (id === 'due' ? 'All due' : (decks().find((d) => d.id === id) || { name: id }).name);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- module state ---------- */
  let store = load();
  let main = null;
  let keyHandler = null;
  const ui = { domain: 'all', size: 20, typed: false, confirmReset: null };
  let session = null;

  function pool(deck) {
    return (TT.flashcards || []).filter((c) => (deck === 'due' || c.deck === deck) && (ui.domain === 'all' || c.domain === ui.domain));
  }
  function deckStats(cards, now) {
    let due = 0, fresh = 0, boxSum = 0;
    for (const c of cards) {
      const s = store.cards[c.id];
      if (!s) fresh++;
      else { boxSum += s.box | 0; if (s.due <= now) due++; }
    }
    return { total: cards.length, due, fresh, mastery: cards.length ? Math.round((boxSum / (5 * cards.length)) * 100) : 0 };
  }

  function startSession(deck, ahead) {
    const now = Date.now();
    const cards = pool(deck);
    let picked;
    if (ahead) {
      picked = cards.filter((c) => store.cards[c.id]).sort((a, b) => store.cards[a.id].due - store.cards[b.id].due);
    } else {
      const due = shuffle(cards.filter((c) => store.cards[c.id] && store.cards[c.id].due <= now));
      due.sort((a, b) => store.cards[a.id].box - store.cards[b.id].box);
      const fresh = deck === 'due' ? [] : shuffle(cards.filter((c) => !store.cards[c.id]));
      picked = due.concat(fresh);
    }
    if (ui.size) picked = picked.slice(0, ui.size);
    session = { deck, queue: picked.slice(), done: 0, flipped: false, typedAns: null, typedOk: null, first: {}, agains: {}, hards: {}, order: [], ahead: !!ahead };
    return picked.length;
  }

  /* ---------- rendering ---------- */
  TT.renderFlashcards = function (mainEl, opts) {
    main = mainEl;
    store = load();
    const deck = typeof opts === 'string' ? opts : opts && opts.deck;
    session = null;
    ui.confirmReset = null;
    if (deck && (deck === 'due' || decks().some((d) => d.id === deck))) {
      startSession(deck, false);
      return renderStudy();
    }
    renderPicker();
  };

  function bindKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = (e) => {
      if (!main || !main.querySelector('.fc-root')) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      fn(e);
    };
    document.addEventListener('keydown', keyHandler);
  }

  function renderPicker() {
    const now = Date.now();
    const allDue = deckStats(pool('due'), now);
    const chips = [['all', 'All domains']].concat(Object.keys(DOMAIN_NAMES).map((k) => [k, DOMAIN_NAMES[k]]))
      .map(([k, n]) => `<button type="button" class="chip" data-dom="${k}" aria-pressed="${ui.domain === k}">${esc(n)}</button>`).join('');
    const sizes = [[10, '10'], [20, '20'], [50, '50'], [0, 'All']]
      .map(([v, n]) => `<button type="button" data-size="${v}" aria-pressed="${ui.size === v}">${n}</button>`).join('');
    const tiles = decks().map((d) => {
      const st = deckStats(pool(d.id), now);
      const confirming = ui.confirmReset === d.id;
      return `<div class="fc-deck${st.total ? '' : ' fc-empty'}">
        <button type="button" class="fc-deck-open" data-deck="${d.id}" ${st.total ? '' : 'disabled'} aria-label="Study ${esc(d.name)}: ${st.due} due, ${st.fresh} new">
          <span class="fc-deck-tab">${esc(d.id)}</span>
          <span class="fc-deck-name">${esc(d.name)}</span>
          <span class="fc-deck-blurb">${esc(d.blurb)}</span>
          <span class="fc-deck-nums"><span><b>${st.total}</b> cards</span><span><b>${st.due}</b> due</span><span><b>${st.fresh}</b> new</span></span>
          <span class="fc-mastery"><span class="bar"><i style="width:${st.mastery}%"></i></span><span>${st.mastery}% mastered</span></span>
        </button>
        <div class="fc-deck-foot">${confirming
          ? `<span class="fc-confirm-q">Wipe progress for this deck?</span><button type="button" class="btn fc-danger" data-reset-yes="${d.id}">Reset</button><button type="button" class="btn quiet" data-reset-no>Cancel</button>`
          : `<button type="button" class="fc-link" data-reset="${d.id}">Reset deck progress</button>`}</div>
      </div>`;
    }).join('');
    main.innerHTML = `<div class="fc-root sheet">
      <div class="fc-head">
        <div>
          <p class="label">Case file · Flashcards</p>
          <h2 class="fc-title">Flash cards</h2>
          <p class="fc-intro">Short facts you just have to know cold. Flip, be honest with the rating, and the scheduler brings back the ones you miss sooner.</p>
        </div>
        <button type="button" class="fc-due-all" data-deck="due" ${allDue.due ? '' : 'disabled'}>
          <span class="fc-due-n">${allDue.due}</span><span>All due cards<br><small>${allDue.due ? 'across every deck' : 'nothing due right now'}</small></span>
        </button>
      </div>
      <div class="fc-controls">
        <div class="chips" role="group" aria-label="Filter by exam domain">${chips}</div>
        <div class="fc-opts">
          <span class="fc-optlabel" id="fc-size-l">Cards per round</span>
          <div class="seg" role="group" aria-labelledby="fc-size-l">${sizes}</div>
          <label class="fc-toggle"><input type="checkbox" id="fc-typed" ${ui.typed ? 'checked' : ''}> Type the answer <small>(ports and commands)</small></label>
        </div>
      </div>
      <div class="fc-decks">${tiles}</div>
      <p class="fc-note">Boxes: Again resets a card to now; then 10 min, 1 day, 3 days, 7 days, 21 days. "Mastered" is how far up the boxes a deck has climbed.</p>
    </div>`;

    main.querySelectorAll('[data-dom]').forEach((b) => b.addEventListener('click', () => { ui.domain = b.dataset.dom; renderPicker(); }));
    main.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { ui.size = +b.dataset.size; renderPicker(); }));
    main.querySelector('#fc-typed').addEventListener('change', (e) => { ui.typed = e.target.checked; });
    main.querySelectorAll('[data-deck]').forEach((b) => b.addEventListener('click', () => { startSession(b.dataset.deck, false); renderStudy(); }));
    main.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => { ui.confirmReset = b.dataset.reset; renderPicker(); focusSel('[data-reset-no]'); }));
    main.querySelectorAll('[data-reset-no]').forEach((b) => b.addEventListener('click', () => { const d = ui.confirmReset; ui.confirmReset = null; renderPicker(); focusSel(`[data-reset="${d}"]`); }));
    main.querySelectorAll('[data-reset-yes]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.resetYes;
      for (const c of TT.flashcards || []) if (c.deck === id) delete store.cards[c.id];
      save();
      ui.confirmReset = null;
      renderPicker();
      focusSel(`[data-deck="${id}"]`);
    }));
    bindKeys(() => {});
  }

  function focusSel(sel) { const el = main.querySelector(sel); if (el) el.focus(); }

  function renderStudy() {
    const s = session;
    if (!s.queue.length) return s.done ? renderSummary() : renderNothingDue();
    const card = s.queue[0];
    const typed = ui.typed && isTypeable(card);
    const total = s.done + s.queue.length;
    const pct = total ? Math.round((s.done / total) * 100) : 0;
    const st = store.cards[card.id];
    const isNew = !st;
    const btns = RATINGS.map((r) => {
      const nb = nextBox(st ? st.box : 0, r.id);
      return `<button type="button" class="fc-rate fc-r-${r.id}" data-rate="${r.id}"><kbd>${r.key}</kbd><span class="fc-rate-l">${r.label}</span><span class="fc-rate-t">${fmtInterval(INTERVALS[nb])}</span></button>`;
    }).join('');
    main.innerHTML = `<div class="fc-root fc-study">
      <div class="fc-bar">
        <button type="button" class="btn quiet" id="fc-back">&larr; Decks</button>
        <div class="fc-count" aria-live="polite"><b>${s.queue.length}</b> left in this round</div>
      </div>
      <div class="bar fc-prog" role="progressbar" aria-label="Round progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.done}"><i style="width:${pct}%"></i></div>
      <div class="fc-scene">
        <span class="fc-tab">Case file · ${esc(card.deck)}</span>
        <button type="button" class="fc-card" id="fc-card" aria-label="Flashcard. ${esc(card.front)}. Press to flip.">
          <span class="fc-inner">
            <span class="fc-face fc-front">
              <span class="fc-meta"><span class="pill topic">${esc(card.obj)}</span><span>${esc(DOMAIN_NAMES[card.domain] || '')}</span>${isNew ? '<span class="pill fc-new">new</span>' : ''}</span>
              <span class="fc-q${card.rev ? ' fc-mono' : ''}">${escBr(card.front)}</span>
              <span class="fc-hintline">${typed ? 'Type your answer below' : 'Click, tap or press Space to flip'}</span>
            </span>
            <span class="fc-face fc-back" aria-hidden="true">
              <span class="fc-meta"><span class="pill topic">${esc(card.obj)}</span><span class="fc-small-q">${esc(card.front)}</span></span>
              <span class="fc-a${isTypeable(card) ? ' fc-mono' : ''}">${escBr(card.back)}</span>
              ${card.extra ? `<span class="fc-extra">${esc(card.extra)}</span>` : ''}
              <span class="fc-verdict" id="fc-verdict"></span>
            </span>
          </span>
        </button>
      </div>
      <div class="fc-sr sr" aria-live="polite" id="fc-live"></div>
      ${typed ? `<form class="fc-typed" id="fc-form" autocomplete="off">
          <label class="sr" for="fc-input">Your answer</label>
          <input id="fc-input" class="fc-input" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="${card.deck === 'commands' ? 'Type the full IOS command' : 'e.g. UDP 123'}">
          <button type="submit" class="btn primary">Check <kbd>Enter</kbd></button>
        </form>` : ''}
      <div class="fc-actions" id="fc-actions">
        <button type="button" class="btn primary fc-flipbtn" id="fc-flip">Show answer <kbd>Space</kbd></button>
      </div>
      <div class="fc-rates" id="fc-rates" hidden>${btns}</div>
      <p class="fc-keys">Keys: <kbd>Space</kbd> flip, <kbd>1</kbd>-<kbd>4</kbd> rate, <kbd>Esc</kbd> back to decks.</p>
    </div>`;

    const cardEl = main.querySelector('#fc-card');
    const flip = () => {
      if (typed && !s.flipped && s.typedOk === null) return checkTyped();
      s.flipped = !s.flipped;
      if (TT.sfx) TT.sfx('flip');
      applyFlip();
    };
    cardEl.addEventListener('click', flip);
    main.querySelector('#fc-flip').addEventListener('click', flip);
    main.querySelector('#fc-back').addEventListener('click', () => { session = null; renderPicker(); });
    main.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => doRate(b.dataset.rate)));
    if (typed) {
      main.querySelector('#fc-form').addEventListener('submit', (e) => { e.preventDefault(); checkTyped(); });
    }

    function checkTyped() {
      const input = main.querySelector('#fc-input');
      s.typedAns = input.value;
      s.typedOk = matchAnswer(card, input.value);
      input.disabled = true;
      const v = main.querySelector('#fc-verdict');
      v.className = 'fc-verdict ' + (s.typedOk ? 'good' : 'bad');
      v.innerHTML = s.typedOk ? 'Match. Nice.' : (input.value.trim() ? `Not quite. You typed: <code>${esc(input.value.trim())}</code>` : 'No answer typed.');
      const sug = main.querySelector('.fc-r-' + (s.typedOk ? 'good' : 'again'));
      if (sug) sug.classList.add('fc-suggest');
      s.flipped = true;
      if (TT.sfx) TT.sfx(s.typedOk ? 'correct' : 'flip');
      applyFlip();
    }

    function applyFlip() {
      cardEl.classList.toggle('fc-flipped', s.flipped);
      main.querySelector('.fc-front').setAttribute('aria-hidden', String(s.flipped));
      main.querySelector('.fc-back').setAttribute('aria-hidden', String(!s.flipped));
      cardEl.setAttribute('aria-label', s.flipped ? `Answer: ${card.back}. Press to flip back.` : `Flashcard. ${card.front}. Press to flip.`);
      main.querySelector('#fc-live').textContent = s.flipped ? 'Answer: ' + card.back + (s.typedOk === null ? '' : s.typedOk ? '. Your answer matched.' : '. Your answer did not match.') : '';
      if (s.flipped) {
        main.querySelector('#fc-rates').hidden = false;
        main.querySelector('#fc-actions').hidden = true;
        if (document.activeElement && document.activeElement.id === 'fc-input') cardEl.focus();
      }
    }

    bindKeys((e) => {
      const tag = e.target && e.target.tagName;
      if (e.key === 'Escape') { e.preventDefault(); session = null; renderPicker(); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.code === 'Space') {
        if (tag === 'BUTTON') return; // native button activation handles it
        e.preventDefault();
        flip();
        return;
      }
      const r = RATINGS.find((x) => x.key === e.key);
      if (r && s.flipped) { e.preventDefault(); doRate(r.id); }
    });

    s.flipped = false;
    s.typedOk = null;
    s.typedAns = null;
    if (typed) main.querySelector('#fc-input').focus();
    else cardEl.focus();
  }

  function doRate(rating) {
    const s = session;
    const card = s.queue.shift();
    if (!card) return;
    store.cards[card.id] = rate(store.cards[card.id], rating, Date.now());
    save();
    if (!(card.id in s.first)) { s.first[card.id] = rating; s.order.push(card); }
    if (rating === 'again') {
      s.agains[card.id] = (s.agains[card.id] || 0) + 1;
      s.queue.splice(Math.min(3, s.queue.length), 0, card); // comes back a few cards later
    } else {
      if (rating === 'hard') s.hards[card.id] = (s.hards[card.id] || 0) + 1;
      s.done++;
    }
    renderStudy();
  }

  function renderNothingDue() {
    const s = session;
    const anySeen = pool(s.deck).some((c) => store.cards[c.id]);
    main.innerHTML = `<div class="fc-root sheet fc-summary">
      <p class="label">Case file · ${esc(deckName(s.deck))}</p>
      <h2 class="fc-title">Inbox zero</h2>
      <p class="fc-intro">Nothing in this deck is due${ui.domain !== 'all' ? ' for the ' + esc(DOMAIN_NAMES[ui.domain]) + ' filter' : ''}. Come back later, or study ahead if you have time to kill on the night shift.</p>
      <div class="tools">
        ${anySeen ? '<button type="button" class="btn primary" id="fc-ahead">Study ahead</button>' : ''}
        <button type="button" class="btn" id="fc-back">Back to decks</button>
      </div>
    </div>`;
    const ahead = main.querySelector('#fc-ahead');
    if (ahead) ahead.addEventListener('click', () => { startSession(s.deck, true); renderStudy(); });
    main.querySelector('#fc-back').addEventListener('click', () => { session = null; renderPicker(); });
    bindKeys((e) => { if (e.key === 'Escape') { session = null; renderPicker(); } });
    focusSel(ahead ? '#fc-ahead' : '#fc-back');
  }

  function renderSummary() {
    const s = session;
    const reviewed = s.order.length;
    const right = s.order.filter((c) => s.first[c.id] !== 'again').length;
    const pct = reviewed ? Math.round((right / reviewed) * 100) : 0;
    const totalAgain = Object.values(s.agains).reduce((a, b) => a + b, 0);
    const hardest = s.order
      .map((c) => ({ c, score: (s.agains[c.id] || 0) * 2 + (s.hards[c.id] || 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const verdict = pct >= 90 ? 'Clean shift. The day crew will never know you were here.' : pct >= 70 ? 'Solid work. A few cards need another pass.' : 'Rough night. That is what the boxes are for: the misses come back soon.';
    main.innerHTML = `<div class="fc-root sheet fc-summary">
      <div class="fc-sumhead">
        <div>
          <p class="label">Case file · ${esc(deckName(s.deck))}</p>
          <h2 class="fc-title">Round complete</h2>
          <p class="fc-intro">${esc(verdict)}</p>
        </div>
        <span class="stamp fresh fc-stamp" aria-hidden="true">Filed</span>
      </div>
      <div class="stats">
        <div class="stat"><b>${reviewed}</b><span>cards reviewed</span></div>
        <div class="stat"><b>${pct}%</b><span>right first time</span></div>
        <div class="stat"><b>${totalAgain}</b><span>Again presses</span></div>
      </div>
      ${hardest.length ? `<h3 class="fc-sub">Hardest cards this round</h3>
        <ul class="fc-hard">${hardest.map(({ c }) => `<li><span class="fc-hard-f">${esc(c.front)}</span><span class="fc-hard-b">${escBr(c.back)}</span><span class="fc-hard-n${s.agains[c.id] ? '' : ' fc-hard-h'}">${s.agains[c.id] ? s.agains[c.id] + '&times; Again' : 'Hard'}</span></li>`).join('')}</ul>` : '<p class="fc-intro">No misses. Not one.</p>'}
      <div class="tools">
        <button type="button" class="btn primary" id="fc-more">Another round</button>
        <button type="button" class="btn" id="fc-back">Back to decks</button>
      </div>
    </div>`;
    main.querySelector('#fc-more').addEventListener('click', () => { startSession(s.deck, false); renderStudy(); });
    main.querySelector('#fc-back').addEventListener('click', () => { session = null; renderPicker(); });
    bindKeys((e) => { if (e.key === 'Escape') { session = null; renderPicker(); } });
    focusSel('#fc-more');
  }
})(globalThis);
