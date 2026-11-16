/* Harbor Point Night Shift — Lessons (the teaching binder).
 * TT.renderLessons(main, opts): index view, or one lesson when opts.id is set.
 * Lesson data lives in lessons-1.js (domains 1-2) and lessons-2.js (domains 3-6); see the format note in lessons-1.js.
 * Progress: localStorage 'trouble-ticket-lessons-v1' = { done: { id: true }, scores: { id: n } }.
 * Routes (wired by app.js): #learn (index), #learn-<id> (one lesson), #learn-scene-<sceneId> (one "Watch it happen"
 * scene on its own; renderLessons also accepts opts.scene). Scenes come from scenes.js / scenes-1.js / scenes-2.js.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  const doc = G.document;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Inline markup: **bold**, `code`, [text](#hash). Everything else is escaped. */
  function md(s) {
    let out = '';
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((#[A-Za-z0-9_\-]*)\)/g;
    let last = 0;
    let m;
    s = String(s == null ? '' : s);
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1] !== undefined) out += '<strong>' + esc(m[1]) + '</strong>';
      else if (m[2] !== undefined) out += '<code>' + esc(m[2]) + '</code>';
      else out += '<a href="' + esc(m[4]) + '">' + esc(m[3]) + '</a>';
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  }
  TT.lessonMarkup = md;

  /* ---------------- data helpers ---------------- */
  const DOMAINS = [
    { id: 'fund', n: 1, name: 'Network Fundamentals', weight: 20 },
    { id: 'access', n: 2, name: 'Network Access', weight: 20 },
    { id: 'ipconn', n: 3, name: 'IP Connectivity', weight: 25 },
    { id: 'svc', n: 4, name: 'IP Services', weight: 10 },
    { id: 'sec', n: 5, name: 'Security Fundamentals', weight: 15 },
    { id: 'auto', n: 6, name: 'Automation and Programmability', weight: 10 },
  ];
  const domainName = (id) => {
    const fromGuide = (TT.domains || []).find((d) => d.id === id);
    const mine = DOMAINS.find((d) => d.id === id);
    return (fromGuide && fromGuide.name) || (mine && mine.name) || id;
  };
  const objKey = (o) => String(o).split('.').map((x) => Number(x) || 0);
  const byObj = (a, b) => {
    const x = objKey(a.obj);
    const y = objKey(b.obj);
    return x[0] - y[0] || x[1] - y[1];
  };
  const lessons = () => (TT.lessons || []).slice().sort(byObj);
  const find = (id) => (TT.lessons || []).find((l) => l.id === id);

  /* ---------------- storage ---------------- */
  const KEY = 'trouble-ticket-lessons-v1';
  function load() {
    let s = null;
    try { s = JSON.parse(G.localStorage.getItem(KEY)); } catch (e) { s = null; }
    s = s && typeof s === 'object' ? s : {};
    s.done = s.done && typeof s.done === 'object' ? s.done : {};
    s.scores = s.scores && typeof s.scores === 'object' ? s.scores : {};
    return s;
  }
  function save(s) {
    try { G.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable: progress lasts for this visit */ }
  }
  TT.lessonProgress = load;

  /* ---------------- the lab bench (mini simulator world) ---------------- */
  function labWorld() {
    const sw = (hostname, mac, extra) => {
      const interfaces = {};
      for (let i = 1; i <= 8; i++) interfaces['FastEthernet0/' + i] = {};
      interfaces['GigabitEthernet0/1'] = {};
      interfaces['GigabitEthernet0/2'] = {};
      return Object.assign({ kind: 'switch', hostname, mac, interfaces, vlans: { 1: 'default' } }, extra || {});
    };
    return {
      devices: {
        R1: {
          kind: 'router',
          hostname: 'HPL-LAB-R1',
          lldp: true,
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { shutdown: true },
          },
        },
        SW1: sw('HPL-LAB-SW1', '0019.e8a1.1100'),
        SW2: sw('HPL-LAB-SW2', '0019.e8a1.2200', { lldp: true }),
        PC1: { kind: 'pc', hostname: 'LAB-PC1', pc: { ip: '10.10.10.11', mask: '255.255.255.0', gw: '10.10.10.1' } },
        PC2: { kind: 'pc', hostname: 'LAB-PC2', pc: { ip: '10.10.10.12', mask: '255.255.255.0', gw: '10.10.10.1' } },
      },
      links: [
        ['R1', 'GigabitEthernet0/0', 'SW1', 'FastEthernet0/8'],
        ['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'],
        ['SW1', 'GigabitEthernet0/2', 'SW2', 'GigabitEthernet0/2'],
        ['PC1', 'NIC', 'SW1', 'FastEthernet0/1'],
        ['PC2', 'NIC', 'SW2', 'FastEthernet0/1'],
      ],
    };
  }
  const LAB_DEV = { router: 'R1', switch: 'SW1', switch2: 'SW2', pc: 'PC1', pc2: 'PC2' };
  const LAB_ORDER = ['R1', 'SW1', 'SW2', 'PC1', 'PC2'];
  /** Commands that put a device into the tryIt's starting mode. */
  function modeSetup(device, mode) {
    if (/^pc/.test(device)) return [];
    if (mode === 'config') return ['enable', 'configure terminal'];
    if (mode === 'priv') return ['enable'];
    return [];
  }
  TT.lessonLab = { world: labWorld, devices: LAB_DEV, modeSetup };

  const ERR_RE = /^% (Invalid|Incomplete|Ambiguous)|is not recognized as an internal/;
  const classify = (line) => {
    if (/^%(LINK|LINEPROTO|OSPF|SYS|CDP|SPANTREE|DUAL|HSRP|EC)/.test(line)) return 'sys';
    if (ERR_RE.test(line) || /^% /.test(line) || /^\s*\^$/.test(line)) return 'err';
    if (/^\(.*\)$/.test(line)) return 'dim';
    return '';
  };

  /* ---------------- shared bits ---------------- */
  const check = (on) => `<span class="ls-tick${on ? ' on' : ''}" aria-hidden="true"></span>`;
  const bar = (pct, label) => `<div class="ls-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;

  /* ================= index view ================= */
  function renderIndex(main) {
    const all = lessons();
    const st = load();
    const doneCount = all.filter((l) => st.done[l.id]).length;
    const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;
    main.innerHTML = `
      <section class="ls-index">
        <div class="sheet ls-hero">
          <p class="label">Lessons · the study binder</p>
          <h2 class="ls-h2">Learn it before the pager goes off</h2>
          <p class="ls-lede">A primer on the network layers, then one lesson per CCNA 200-301 v1.1 objective. Each one opens with the Harbor Point situation that makes the topic matter, teaches it properly, lets you try the commands on a lab bench, and ends with a three-question check. Pass the check (2 of 3) and the lesson is marked done.</p>
          <div class="ls-hero-row">
            <div class="ls-total"><b>${doneCount}</b><span>of ${all.length} lessons done</span></div>
            <div class="ls-total-bar">${bar(pct, 'All lessons progress')}</div>
            <label class="sr" for="ls-q">Search lessons</label>
            <input id="ls-q" class="search ls-search" type="search" placeholder="Search lessons (e.g. trunk, EUI-64, 1.6)" autocomplete="off">
          </div>
        </div>
        ${sceneGallery()}
        <div id="ls-groups" class="ls-groups"></div>
      </section>`;
    const input = main.querySelector('#ls-q');
    const draw = () => drawGroups(main.querySelector('#ls-groups'), all, st, input.value);
    input.addEventListener('input', draw);
    draw();
  }

  function haystack(l) {
    const parts = [l.obj, l.title, l.caseFile, ...(l.techNotes || []), ...(l.examTraps || [])];
    for (const s of l.sections || []) {
      parts.push(s.h);
      for (const b of s.body || []) {
        if (typeof b === 'string') parts.push(b);
        else if (b.list) parts.push(b.list.join(' '));
        else if (b.note) parts.push(b.note);
        else if (b.table) parts.push(b.table.map((r) => r.join(' ')).join(' '));
        else if (b.cli) parts.push(b.cli.join(' '));
      }
    }
    return parts.join(' ').toLowerCase();
  }
  const hayCache = new Map();

  function drawGroups(el, all, st, query) {
    const q = String(query || '').trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const match = (l) => {
      if (!terms.length) return true;
      if (!hayCache.has(l)) hayCache.set(l, haystack(l));
      const h = hayCache.get(l);
      return terms.every((t) => h.includes(t));
    };
    const known = DOMAINS.map((d) => d.id);
    const extra = [...new Set(all.map((l) => l.domain).filter((d) => !known.includes(d)))].map((id, i) => ({ id, n: 7 + i, name: domainName(id), weight: null }));
    let shown = 0;
    const html = DOMAINS.concat(extra)
      .map((d) => {
        const inDom = all.filter((l) => l.domain === d.id);
        const vis = inDom.filter(match);
        shown += vis.length;
        if (terms.length && !vis.length) return '';
        const done = inDom.filter((l) => st.done[l.id]).length;
        const pct = inDom.length ? Math.round((done / inDom.length) * 100) : 0;
        const rows = vis
          .map(
            (l) => `<li><a class="ls-row${st.done[l.id] ? ' done' : ''}" href="#learn-${esc(l.id)}">
              <span class="ls-obj">${esc(l.obj)}</span>
              <span class="ls-ttl">${esc(l.title)}</span>
              <span class="ls-min">${esc(l.minutes)} min</span>
              ${check(st.done[l.id])}<span class="sr">${st.done[l.id] ? 'done' : 'not done'}</span>
            </a></li>`
          )
          .join('');
        return `<section class="ls-group sheet" aria-labelledby="ls-d-${esc(d.id)}">
          <div class="ls-group-head">
            <h3 id="ls-d-${esc(d.id)}"><span class="ls-dn">${d.n}.0</span> ${esc(domainName(d.id))}</h3>
            <span class="ls-gmeta">${d.weight ? d.weight + '% of the exam · ' : ''}${done}/${inDom.length} done</span>
          </div>
          ${bar(pct, domainName(d.id) + ' progress')}
          ${inDom.length ? `<ol class="ls-list">${rows}</ol>` : '<p class="ls-soon">Lessons for this domain are on the way.</p>'}
        </section>`;
      })
      .join('');
    el.innerHTML = html || '';
    if (terms.length && !shown) el.innerHTML = `<p class="ls-empty sheet">No lesson mentions “${esc(query)}”. Try a shorter word, or an objective number like 2.4.</p>`;
  }

  /* ================= lesson view ================= */
  function block(b) {
    if (typeof b === 'string') return `<p>${md(b)}</p>`;
    if (!b || typeof b !== 'object') return '';
    if (b.list) return `<ul class="ls-ul">${b.list.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`;
    if (b.steps) return `<ol class="ls-ol">${b.steps.map((x) => `<li>${md(x)}</li>`).join('')}</ol>`;
    if (b.table) {
      const [head, ...rows] = b.table;
      return `<div class="ls-tablewrap"><table class="ls-table"><thead><tr>${head.map((c) => `<th scope="col">${md(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (b.cli) return `<pre class="ls-cli" tabindex="0" aria-label="Command line example">${b.cli.map(cliLine).join('\n')}</pre>`;
    if (b.note) return `<aside class="ls-note"><b>Note</b>${md(b.note)}</aside>`;
    if (b.svg) return `<figure class="ls-fig"><div class="ls-figbox">${b.svg}</div>${b.caption ? `<figcaption>${md(b.caption)}</figcaption>` : ''}</figure>`;
    return '';
  }
  function cliLine(line) {
    const m = /^((?:[A-Za-z][\w.\-]*(?:\([\w\-]+\))?[#>])|C:\\>|\S+\$|PS \S+>)( ?)(.*)$/.exec(line);
    if (m) return `<span class="ls-p">${esc(m[1])}</span>${m[2]}<span class="ls-c">${esc(m[3])}</span>`;
    if (/^%/.test(line)) return `<span class="ls-sys">${esc(line)}</span>`;
    if (/^\s*!/.test(line)) return `<span class="ls-dim">${esc(line)}</span>`;
    return esc(line);
  }

  function relatedLinks(l) {
    const r = l.related || {};
    const links = [];
    const tk = (TT.tickets || []);
    for (const id of r.tickets || []) {
      const t = tk.find((x) => x.id === id);
      links.push(`<a class="ls-rel" href="#${esc(id)}"><span class="ls-rk">Ticket</span>${esc(t ? t.number + ' · ' + t.title : id)}</a>`);
    }
    for (const id of r.cards || []) {
      const c = (TT.cards || []).find((x) => x.id === id);
      links.push(`<a class="ls-rel" href="#card-${esc(id)}"><span class="ls-rk">Field guide</span>${esc(c ? c.name : id)}</a>`);
    }
    const hwName = { cable: 'Cabling lab', ports: 'Port ID lab', gear: 'Gear lab' };
    if (r.hw) links.push(`<a class="ls-rel" href="#hw-${esc(r.hw)}"><span class="ls-rk">Hardware</span>${esc(hwName[r.hw] || r.hw)}</a>`);
    if (r.drill) links.push(`<a class="ls-rel" href="#drill"><span class="ls-rk">Drill</span>Subnet drill</a>`);
    return links.join('');
  }

  function renderLesson(main, l) {
    const all = lessons();
    const i = all.indexOf(l);
    const prev = all[i - 1];
    const next = all[i + 1];
    const st = load();
    const done = !!st.done[l.id];
    const sections = (l.sections || [])
      .map((s, k) => `<section class="ls-sec" aria-labelledby="ls-s${k}"><h3 id="ls-s${k}">${md(s.h)}</h3>${(s.body || []).map(block).join('')}</section>`)
      .join('');
    const tryIts = (l.tryIt || [])
      .map(
        (t, k) => `<div class="ls-try" data-k="${k}">
          <div class="ls-try-head"><span class="ls-try-tag">Try it</span><span class="ls-try-dev">${esc(labName(t.device))} · ${t.mode === 'config' ? 'global config' : /^pc/.test(t.device) ? 'command prompt' : 'privileged EXEC'}</span></div>
          <p>${md(t.prompt)}</p>
          <pre class="ls-cli ls-try-cmds" aria-label="Commands to run">${t.cmds.map((c) => `<span class="ls-c">${esc(c)}</span>`).join('\n')}</pre>
          <button type="button" class="btn primary ls-run" data-k="${k}" aria-expanded="false">Run in simulator</button>
          <div class="ls-mini-slot" id="ls-mini-${k}"></div>
        </div>`
      )
      .join('');
    const traps = (l.examTraps || []).map((t) => `<li>${md(t)}</li>`).join('');
    const notes = (l.techNotes || []).map((t) => `<li>${md(t)}</li>`).join('');
    const rel = relatedLinks(l);

    main.innerHTML = `
      <article class="ls-lesson" aria-labelledby="ls-title">
        <nav class="ls-crumbs" aria-label="Breadcrumb"><a href="#learn">Lessons</a><span aria-hidden="true">/</span><span>${esc(domainName(l.domain))}</span></nav>
        <header class="ls-case sheet">
          <div id="ls-stamp-slot">${done ? '<div class="ls-stamp" aria-label="Lesson complete">LEARNED</div>' : ''}</div>
          <div class="ls-case-row">
            <span class="ls-case-num">CASE FILE · ${l.primer ? 'PRIMER' : 'OBJ ' + esc(l.obj)}</span>
            <span class="pill topic">${esc(domainName(l.domain))}</span>
            <span class="pill">${esc(l.minutes)} min read</span>
          </div>
          <h2 id="ls-title" class="ls-h2${done ? ' ls-solved' : ''}">${esc(l.title)}</h2>
          <div class="ls-casefile"><span class="ls-cf-label">Situation</span><p>${md(l.caseFile)}</p></div>
        </header>
        <div class="ls-layout">
          <div class="ls-content sheet">
            ${watchBlock(l)}
            ${sections}
            ${tryIts ? `<section class="ls-sec" aria-labelledby="ls-tryh"><h3 id="ls-tryh">Try it on the lab bench</h3><p class="ls-bench">The bench is a tiny network: <code>HPL-LAB-R1</code> Gi0/0 to <code>HPL-LAB-SW1</code> Fa0/8, two links (Gi0/1, Gi0/2) from SW1 to <code>HPL-LAB-SW2</code>, <code>LAB-PC1</code> on SW1 Fa0/1 and <code>LAB-PC2</code> on SW2 Fa0/1, all in 10.10.10.0/24. Each run starts from a fresh bench.</p>${tryIts}</section>` : ''}
            ${traps ? `<section class="ls-traps" aria-labelledby="ls-traph"><h3 id="ls-traph">Exam traps</h3><ul>${traps}</ul></section>` : ''}
            <section class="ls-check" aria-labelledby="ls-chkh"><h3 id="ls-chkh">Shift check</h3><p class="ls-sub">Three questions, exam style. Get two right and this lesson is marked done.</p><div id="ls-quiz"></div></section>
            ${rel ? `<section class="ls-related" aria-labelledby="ls-relh"><h3 id="ls-relh">Keep going</h3><div class="ls-rels">${rel}</div></section>` : ''}
            <nav class="ls-pager" aria-label="Lesson navigation">
              ${prev ? `<a class="btn ls-prev" href="#learn-${esc(prev.id)}"><span class="ls-pk">Previous · ${esc(prev.obj)}</span>${esc(prev.title)}</a>` : '<span></span>'}
              ${next ? `<a class="btn ls-next" href="#learn-${esc(next.id)}"><span class="ls-pk">Next · ${esc(next.obj)}</span>${esc(next.title)}</a>` : '<a class="btn ls-next" href="#learn"><span class="ls-pk">Done</span>Back to all lessons</a>'}
            </nav>
          </div>
          ${notes ? `<aside class="ls-side" aria-labelledby="ls-sideh"><div class="ls-side-in"><h3 id="ls-sideh">Senior tech's notes</h3><p class="ls-side-by">Field notes from the senior tech on your shift</p><ul>${notes}</ul></div></aside>` : ''}
        </div>
      </article>`;

    main.querySelectorAll('.ls-run').forEach((b) =>
      b.addEventListener('click', () => {
        const k = Number(b.dataset.k);
        const slot = main.querySelector('#ls-mini-' + k);
        if (slot.dataset.open === '1') {
          slot.innerHTML = '';
          slot.dataset.open = '';
          b.textContent = 'Run in simulator';
          b.setAttribute('aria-expanded', 'false');
          return;
        }
        slot.dataset.open = '1';
        b.textContent = 'Close simulator';
        b.setAttribute('aria-expanded', 'true');
        openMini(slot, l.tryIt[k]);
      })
    );
    drawQuiz(main.querySelector('#ls-quiz'), l);
    mountWatch(main, l);
    G.scrollTo && G.scrollTo(0, 0);
  }

  /* ---------------- "Watch it happen" scenes ---------------- */
  const sceneList = () => (TT.scenes || []).slice().sort(byObj);
  const canPlay = () => typeof TT.renderScene === 'function';
  function watchBlock(l) {
    const scs = canPlay() && TT.scenesFor ? TT.scenesFor(l.id) : [];
    if (!scs.length) return '';
    const pick = scs.length > 1
      ? `<div class="sc-pick" role="group" aria-label="Choose a scene">${scs.map((s, k) => `<button type="button" class="chip" data-scene="${esc(s.id)}" aria-pressed="${k === 0}">${esc(s.title)}</button>`).join('')}</div>`
      : '';
    return `<section class="sc-lessonbox" aria-labelledby="ls-watchh"><h3 id="ls-watchh">Watch it happen <small>${scs.length} animated scene${scs.length > 1 ? 's' : ''}</small></h3>${pick}<div class="sc-mount" id="ls-scene"></div></section>`;
  }
  function mountWatch(main, l) {
    const slot = main.querySelector('#ls-scene');
    if (!slot) return;
    const scs = TT.scenesFor(l.id);
    const show = (id) => {
      const sc = scs.find((s) => s.id === id) || scs[0];
      TT.renderScene(slot, sc);
      main.querySelectorAll('.sc-pick .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === sc.id)));
    };
    main.querySelectorAll('.sc-pick .chip').forEach((b) => b.addEventListener('click', () => show(b.dataset.scene)));
    show(scs[0].id);
  }
  function sceneGallery() {
    const scs = canPlay() ? sceneList() : [];
    if (!scs.length) return '';
    const cards = scs
      .map((s) => `<li><a class="sc-card" href="#learn-scene-${esc(s.id)}"><span class="sc-card-art">${TT.sceneThumb ? TT.sceneThumb(s) : ''}</span><span class="sc-card-o"><span class="sc-card-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M8 5v14l11-7z"/></svg></span>${esc(s.obj)} · ${s.steps.length} steps</span><span class="sc-card-t">${esc(s.title)}</span></a></li>`)
      .join('');
    return `<section class="sheet sc-gallery" aria-labelledby="sc-gal-h">
      <div class="sc-gal-head"><h3 id="sc-gal-h">Watch it happen</h3><p>${scs.length} short animations of protocols doing their thing on the wire. Pick one, press play.</p></div>
      <ul class="sc-strip">${cards}</ul>
    </section>`;
  }
  function renderSceneView(main, sc) {
    const all = sceneList();
    const i = all.indexOf(sc);
    const prev = all[i - 1];
    const next = all[i + 1];
    const l = find(sc.lesson);
    main.innerHTML = `
      <section class="sc-view" aria-label="Watch it happen">
        <nav class="ls-crumbs" aria-label="Breadcrumb"><a href="#learn">Lessons</a><span aria-hidden="true">/</span><span>Watch it happen</span><span aria-hidden="true">/</span><span>${esc(sc.obj)}</span></nav>
        <div class="sheet"><div id="sc-solo"></div></div>
        <nav class="sc-view-nav" aria-label="More scenes">
          ${prev ? `<a class="btn" href="#learn-scene-${esc(prev.id)}"><span class="ls-pk">Previous scene · ${esc(prev.obj)}</span>${esc(prev.title)}</a>` : '<span></span>'}
          ${l ? `<a class="btn primary" href="#learn-${esc(l.id)}"><span class="ls-pk" style="color:inherit;opacity:.8">The lesson · ${esc(l.obj)}</span>${esc(l.title)}</a>` : ''}
          ${next ? `<a class="btn" href="#learn-scene-${esc(next.id)}"><span class="ls-pk">Next scene · ${esc(next.obj)}</span>${esc(next.title)}</a>` : '<a class="btn" href="#learn"><span class="ls-pk">Done</span>Back to all lessons</a>'}
        </nav>
      </section>`;
    TT.renderScene(main.querySelector('#sc-solo'), sc);
    G.scrollTo && G.scrollTo(0, 0);
  }

  const labName = (dev) => ({ router: 'HPL-LAB-R1', switch: 'HPL-LAB-SW1', switch2: 'HPL-LAB-SW2', pc: 'LAB-PC1', pc2: 'LAB-PC2' })[dev] || dev;

  /* ---------------- mini terminal ---------------- */
  function openMini(slot, t) {
    const w = TT.net.makeWorld(labWorld());
    const s = new TT.Session(w);
    const r = { w, s, dev: LAB_DEV[t.device] || 'R1', logs: {}, hist: [], hi: -1, busy: true };
    slot.innerHTML = `
      <div class="ls-mini">
        <div class="ls-tabs" role="tablist" aria-label="Lab devices"></div>
        <div class="ls-term">
          <div class="ls-out" aria-live="polite"></div>
          <div class="ls-line"><span class="ls-pr"></span><input class="ls-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" aria-label="Command"></div>
        </div>
        <p class="ls-mini-help"><kbd>Tab</kbd> completes · <kbd>?</kbd> lists options · <kbd>↑</kbd> history · switch devices with the tabs</p>
      </div>`;
    const tabs = slot.querySelector('.ls-tabs');
    const out = slot.querySelector('.ls-out');
    const pr = slot.querySelector('.ls-pr');
    const input = slot.querySelector('.ls-in');
    const log = (id) => {
      if (!r.logs[id]) {
        const d = w.devices[id];
        r.logs[id] = [['dim', d.kind === 'pc' ? `Command prompt on ${d.hostname}. Type help for commands.` : `Console on ${d.hostname}.`]];
      }
      return r.logs[id];
    };
    const draw = () => {
      tabs.innerHTML = LAB_ORDER.map((id) => `<button type="button" role="tab" data-dev="${id}" aria-selected="${id === r.dev}">${esc(w.devices[id].hostname)}</button>`).join('');
      out.innerHTML = log(r.dev)
        .map(([cls, text]) => {
          if (cls === 'cmd') {
            const k = text.indexOf('\u0000');
            return `<div><span class="ls-p">${esc(text.slice(0, k))}</span>${esc(text.slice(k + 1))}</div>`;
          }
          return `<div class="${cls ? 'ls-' + cls : ''}">${esc(text) || ' '}</div>`;
        })
        .join('');
      out.scrollTop = out.scrollHeight;
      pr.textContent = s.prompt(r.dev);
    };
    const exec = (line, help) => {
      const L = log(r.dev);
      L.push(['cmd', s.prompt(r.dev) + '\u0000' + line + (help ? '?' : '')]);
      let res;
      try { res = s.run(r.dev, help ? line + '?' : line); } catch (e) { res = ['% Simulator error: ' + e.message]; }
      for (const x of res) L.push([classify(x), x]);
      if (L.length > 400) L.splice(1, L.length - 400);
    };
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-dev]');
      if (!b) return;
      r.dev = b.dataset.dev;
      r.hi = -1;
      draw();
      input.focus();
    });
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const k = LAB_ORDER.indexOf(r.dev);
      r.dev = LAB_ORDER[(k + (e.key === 'ArrowRight' ? 1 : LAB_ORDER.length - 1)) % LAB_ORDER.length];
      draw();
      const nb = tabs.querySelector(`button[data-dev="${r.dev}"]`);
      if (nb) nb.focus();
    });
    slot.querySelector('.ls-term').addEventListener('click', () => { if (!(G.getSelection && G.getSelection().toString())) input.focus(); });
    input.addEventListener('keydown', (e) => {
      if (r.busy) { if (e.key === 'Enter' || e.key === 'Tab') e.preventDefault(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value;
        if (v.trim()) r.hist.push(v);
        r.hi = -1;
        input.value = '';
        exec(v);
        draw();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const c = s.complete && s.complete(r.dev, input.value);
        if (c) input.value = c;
      } else if (e.key === '?') {
        e.preventDefault();
        exec(input.value, true);
        draw();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!r.hist.length) return;
        r.hi = r.hi < 0 ? r.hist.length - 1 : Math.max(0, r.hi - 1);
        input.value = r.hist[r.hi];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (r.hi < 0) return;
        r.hi++;
        if (r.hi >= r.hist.length) { r.hi = -1; input.value = ''; } else input.value = r.hist[r.hi];
      }
    });
    // Replay: get into the starting mode, then type each command so the learner sees real output.
    const queue = modeSetup(t.device, t.mode).concat(t.cmds);
    const reduce = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;
    draw();
    const step = () => {
      if (!slot.isConnected) return;
      if (!queue.length) {
        r.busy = false;
        log(r.dev).push(['dim', '(Your turn. Type more commands, or switch devices with the tabs.)']);
        draw();
        input.focus({ preventScroll: true });
        return;
      }
      exec(queue.shift());
      draw();
      if (reduce) step();
      else G.setTimeout(step, 220);
    };
    step();
  }

  /* ---------------- check quiz ---------------- */
  function drawQuiz(el, l) {
    const qs = l.check || [];
    const picks = new Array(qs.length).fill(null);
    const paint = () => {
      const answered = picks.filter((p) => p !== null).length;
      const right = picks.filter((p, i) => p === qs[i][2]).length;
      el.innerHTML =
        qs
          .map(([q, opts, ans, why], i) => {
            const p = picks[i];
            return `<div class="ls-q" role="group" aria-labelledby="ls-q${i}">
              <p class="ls-qt" id="ls-q${i}"><span class="ls-qn">Q${i + 1}</span>${md(q)}</p>
              <div class="ls-opts">${opts
                .map((o, k) => {
                  let cls = '';
                  if (p !== null) cls = k === ans ? ' right' : k === p ? ' wrong' : '';
                  return `<button type="button" class="ls-opt${cls}" data-q="${i}" data-k="${k}" ${p !== null ? 'disabled' : ''} aria-pressed="${p === k}"><span class="ls-ok">${'ABCDEF'[k]}</span><span>${md(o)}</span></button>`;
                })
                .join('')}</div>
              ${p !== null ? `<p class="ls-why ${p === ans ? 'good' : 'bad'}" role="status"><b>${p === ans ? 'Correct.' : 'Not quite.'}</b> ${md(why)}</p>` : ''}
            </div>`;
          })
          .join('') +
        (answered === qs.length && qs.length
          ? `<div class="ls-result ${right >= 2 ? 'pass' : 'fail'}" role="status"><b>${right} / ${qs.length}</b><span>${right >= 2 ? (right === qs.length ? 'Clean sweep. Lesson marked done.' : 'Passed. Lesson marked done.') : 'Not yet. Reread the sections above and try again.'}</span><button type="button" class="btn ls-retry">Try again</button></div>`
          : '');
      el.querySelectorAll('.ls-opt').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.q);
          if (picks[i] !== null) return;
          picks[i] = Number(b.dataset.k);
          if (TT.sfx) TT.sfx(picks[i] === qs[i][2] ? 'correct' : 'wrong');
          paint();
          const nextQ = el.querySelectorAll('.ls-q')[i];
          const first = nextQ && nextQ.querySelector('.ls-why');
          if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
          if (picks.every((x) => x !== null)) finish();
        })
      );
      const retry = el.querySelector('.ls-retry');
      if (retry) retry.addEventListener('click', () => { picks.fill(null); paint(); const f = el.querySelector('.ls-opt'); if (f) f.focus(); });
    };
    const finish = () => {
      const right = picks.filter((p, i) => p === qs[i][2]).length;
      const st = load();
      st.scores[l.id] = Math.max(Number(st.scores[l.id]) || 0, right);
      const was = !!st.done[l.id];
      if (right >= 2) st.done[l.id] = true;
      save(st);
      if (right >= 2 && !was) {
        const slot = doc.getElementById('ls-stamp-slot');
        if (slot) slot.innerHTML = '<div class="ls-stamp fresh" aria-label="Lesson complete">LEARNED</div>';
        const h = doc.getElementById('ls-title');
        if (h) h.classList.add('ls-solved');
      }
    };
    paint();
  }

  /* ---------------- entry point ---------------- */
  TT.renderLessons = function renderLessons(main, opts) {
    const id = opts && opts.id;
    const sceneId = (opts && opts.scene) || (typeof id === 'string' && id.startsWith('scene-') ? id.slice(6) : null);
    if (sceneId && canPlay()) {
      const sc = TT.sceneById(sceneId);
      if (sc) return renderSceneView(main, sc);
    }
    const l = id ? find(id) : null;
    if (l) renderLesson(main, l);
    else {
      renderIndex(main);
      if (id) {
        const p = doc.createElement('p');
        p.className = 'ls-empty sheet';
        p.textContent = 'No lesson called "' + id + '". Here is the full list.';
        main.querySelector('.ls-index').prepend(p);
      }
    }
  };
})(globalThis);
