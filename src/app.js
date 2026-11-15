/* Trouble Ticket — user interface.
 * Views: #tickets (and #t01..#t06), #drill, #guide, #quiz, #progress
 */
(function (G) {
  'use strict';
  const TT = G.TT;
  const doc = G.document;
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  /* ---------------- storage (one viewer, one browser; optional) ---------------- */
  const KEY = 'trouble-ticket-v1';
  let store = {};
  try { store = JSON.parse(G.localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; }
  store.solved = store.solved || {};
  store.tickets = store.tickets || {};
  store.drill = store.drill || { best: 0, bestTime: null, mode: 'focus' };
  store.quiz = store.quiz || { best: null, missed: [] };
  const save = () => { try { G.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable: progress lasts for this visit */ } };

  /* ---------------- ticket runtime ---------------- */
  const runtime = {};
  function rt(t) {
    if (runtime[t.id]) return runtime[t.id];
    const saved = store.tickets[t.id];
    let w;
    try { w = saved && saved.world ? saved.world : TT.net.makeWorld(t.world); } catch (e) { w = TT.net.makeWorld(t.world); }
    const r = {
      w,
      s: new TT.Session(w),
      dev: (saved && saved.dev) || t.start,
      logs: (saved && saved.logs) || {},
      hist: (saved && saved.hist) || [],
      hi: -1,
      answers: (saved && saved.answers) || {},
      values: (saved && saved.values) || {},
      hints: (saved && saved.hints) || 0,
    };
    runtime[t.id] = r;
    return r;
  }
  function persist(t) {
    const r = runtime[t.id];
    if (!r) return;
    r.w.events = r.w.events.slice(-20);
    for (const k of Object.keys(r.logs)) r.logs[k] = r.logs[k].slice(-250);
    store.tickets[t.id] = { world: r.w, dev: r.dev, logs: r.logs, hist: r.hist.slice(-60), answers: r.answers, values: r.values, hints: r.hints };
    save();
  }
  const objState = (t, r) => t.objectives.map((o) => { try { return !!o.check(r.w, r); } catch (e) { return false; } });

  /* ---------------- router ---------------- */
  const soon = (name, what) => () => {
    $('#main').innerHTML = `<div class="sheet" style="max-width:640px"><p class="label">${name}</p><h2 style="margin:6px 0">On the night-shift whiteboard</h2><p>${what} is being built and will appear here in the next update.</p><p><a href="#tickets">Back to the tickets</a></p></div>`;
  };
  const module = (fnName, name, what) => (arg) => (typeof TT[fnName] === 'function' ? TT[fnName]($('#main'), arg || {}) : soon(name, what)());
  const views = {
    learn: module('renderLessons', 'Learn', 'The lesson library'),
    lab: module('renderSandbox', 'Lab', 'The network lab sandbox'),
    exam: module('renderExam', 'Mock exam', 'The mock exam'),
    flash: module('renderFlashcards', 'Flashcards', 'The flashcard trainer'),
    tickets: renderTickets, map: renderMap, drill: renderDrill, hardware: (tab) => TT.renderHardware($('#main'), tab), guide: renderGuide, quiz: renderQuiz, progress: renderProgress };
  function route() {
    let h = (G.location.hash || '').replace('#', '');
    let ticketId = null;
    if (TT.tickets.byId[h]) { ticketId = h; h = 'tickets'; }
    else if (h.startsWith('card-')) { guideState = { domain: 'all', q: '', only: h.slice(5) }; h = 'guide'; }
    else if (h.startsWith('hw-')) { ticketId = h.slice(3); h = 'hardware'; }
    else if (h.startsWith('learn-')) { ticketId = { id: h.slice(6) }; h = 'learn'; }
    else if (h.startsWith('lab-')) { ticketId = { project: h.slice(4) }; h = 'lab'; }
    else if (h.startsWith('flash-')) { ticketId = { deck: h.slice(6) }; h = 'flash'; }
    else if (h === 'guide' && guideState.only) guideState.only = null;
    if (!views[h]) h = 'tickets';
    $$('nav.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.view === h ? 'page' : 'false'));
    views[h](ticketId);
  }

  /* ======================================================================
   * TICKETS
   * ====================================================================== */
  function renderTickets(id) {
    const t = TT.tickets.byId[id] || TT.tickets.find((x) => !store.solved[x.id]) || TT.tickets[0];
    const r = rt(t);
    const main = $('#main');
    main.innerHTML = `
      <div class="desk">
        <aside class="rail" aria-label="Tickets">
          ${TT.tickets.map((x) => `
            <a class="stub" href="#${x.id}" aria-current="${x.id === t.id}">
              <div class="num">${x.number}</div>
              <div class="ttl">${esc(x.title)}</div>
              <div class="meta"><span>${esc(x.topic)}</span><span>·</span>${store.solved[x.id] ? '<span class="done">Resolved</span>' : `<span>${x.priority}</span>`}</div>
            </a>`).join('')}
          <p class="rail-note">${Object.keys(store.solved).length} of ${TT.tickets.length} resolved. See Progress for what is coming next.</p>
        </aside>
        <article class="sheet" aria-labelledby="tt-title">
          <header class="ticket-head">
            <div class="row"><span class="num">${t.number}</span><span class="pill ${t.priority.toLowerCase()}">${t.priority}</span><span class="pill topic">${esc(t.topic)}</span></div>
            <h2 id="tt-title">${esc(t.title)}</h2>
            <div class="watch">Watch first: <a href="${t.jitl.url}" target="_blank" rel="noopener">Jeremy's IT Lab, ${esc(t.jitl.label)}</a></div>
            <div id="stamp-slot"></div>
          </header>
          <div class="story">${t.story.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          <section class="topo-wrap" aria-label="Topology">
            <p class="label">Topology</p>
            <div class="topo" id="topo"></div>
            <div class="legend"><span><i></i>link up</span><span><i class="dn"></i>link down</span><span><i class="tr"></i>trunk</span><span>Click a device to open its console</span></div>
          </section>
          <div class="cols work">
            <section aria-label="Objectives">
              <p class="label">Objectives</p>
              <ul class="objs" id="objs"></ul>
              <div class="tools">
                <button class="btn" id="hintBtn" type="button"></button>
                <button class="btn quiet" id="resetBtn" type="button">Reset ticket</button>
              </div>
              <div id="hints"></div>
            </section>
            ${t.questions ? `<section aria-label="Subnetting questions"><p class="label">Work it out first</p><form class="qa" id="qa">${t.questions.map((q, i) => `
                <div class="q"><label for="q-${q.id}">${i + 1}. ${esc(q.q)}</label>
                <div class="inrow"><input id="q-${q.id}" data-q="${q.id}" autocomplete="off" spellcheck="false" value="${esc(r.values[q.id] || '')}"></div>
                <div class="fb" id="fb-${q.id}"></div></div>`).join('')}
                <div><button class="btn primary" type="submit">Check answers</button></div></form></section>` : `<section aria-label="Where to start"><p class="label">Where to start</p><p style="margin:0;font-size:14px;max-width:52ch">Open a console below and look before you change anything. ${t.id === 't01' ? 'Try <code>show ip interface brief</code> after <code>enable</code>.' : 'The show commands that fit this topic: ' + ({ t03: '<code>show vlan brief</code>, <code>show running-config</code>', t04: '<code>show interfaces trunk</code>, <code>show vlan brief</code>', t05: '<code>show ip route</code>, <code>show running-config</code>', t06: '<code>show ip ospf neighbor</code>, <code>show ip ospf interface brief</code>, <code>show ip route</code>', t07: '<code>show interfaces trunk</code>, <code>show ip interface brief</code>, <code>show running-config</code>', t08: '<code>show spanning-tree</code>, <code>show spanning-tree vlan 10</code>', t09: '<code>show etherchannel summary</code>, <code>show running-config</code>; <code>interface range g0/1 - 2</code> works too', t10: '<code>show running-config</code> on the router; on the scanner, <code>ipconfig</code> and <code>ipconfig /renew</code>', t11: '<code>show access-lists</code>, <code>show running-config</code>', t12: '<code>show running-config</code>, <code>show ip nat translations</code>, <code>show ip route</code>', t13: '<code>show ipv6 interface brief</code>, <code>show ipv6 route</code>, <code>show running-config</code>; PCs can <code>ping</code> IPv6 addresses', t14: '<code>show ip ssh</code>, <code>show running-config</code>; on PC-ADMIN try <code>telnet 10.0.99.1</code> and <code>ssh -l netadmin 10.0.99.1</code>', t15: '<code>show interfaces status</code>, <code>show port-security</code>, <code>show port-security interface fa0/3</code>', t16: '<code>show standby brief</code>, <code>show running-config</code>, <code>show ip route</code>', t17: '<code>show ip eigrp neighbors</code>, <code>show ip route</code>, <code>show running-config</code>', t18: '<code>show ip dhcp snooping</code>, <code>show ip dhcp snooping binding</code>, <code>show ip arp inspection</code>; on PC-A, <code>ipconfig</code>', t19: '<code>show ip ospf interface g0/0</code>, <code>show ip ospf neighbor</code>, <code>show ip ospf interface brief</code>', t20: '<code>show ip interface brief</code>, <code>show etherchannel summary</code>, <code>show ip route</code>', t21: '<code>show ip nat translations</code>, <code>show running-config</code>; ping 203.0.113.5 from CUSTOMER', t22: '<code>show spanning-tree</code>, <code>show running-config</code> on both access switches', t23: '<code>show ip interface brief</code>, <code>show cdp neighbors</code>, <code>show lldp neighbors</code>, <code>show ntp status</code>, <code>show clock</code>' }[t.id] || '<code>show running-config</code>') + '.'} PCs understand <code>ipconfig</code> and <code>ping</code>.</p></section>`}
          </div>
          <section class="console" aria-label="Console">
            <p class="label">Console</p>
            <div class="devtabs" role="tablist" id="devtabs"></div>
            <div class="term" id="term">
              <div class="out" id="out" role="log" aria-live="polite"></div>
              <div class="line"><label class="sr" for="cmd">Command</label><span class="p" id="prompt"></span><input id="cmd" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"></div>
            </div>
            <p class="term-help"><kbd>Tab</kbd> completes a word · <kbd>?</kbd> lists options · <kbd>↑</kbd> <kbd>↓</kbd> history · abbreviations work (<code>sh ip int br</code>)</p>
          </section>
          <section id="debrief"></section>
        </article>
      </div>`;

    if (store.solved[t.id]) { $('#stamp-slot').innerHTML = '<div class="stamp" aria-label="Resolved">RESOLVED</div>'; $('.ticket-head').classList.add('solved'); }
    drawDevTabs(t, r);
    drawConsole(t, r);
    drawTopo(t, r);
    drawObjectives(t, r, false);
    drawHints(t, r);

    $('#hintBtn').addEventListener('click', () => { if (r.hints < t.hints.length) { r.hints++; drawHints(t, r); persist(t); } });
    let armed = false;
    $('#resetBtn').addEventListener('click', (e) => {
      if (!armed) { armed = true; e.target.textContent = 'Click again to reset'; setTimeout(() => { armed = false; if (e.target.isConnected) e.target.textContent = 'Reset ticket'; }, 3000); return; }
      delete runtime[t.id];
      delete store.tickets[t.id];
      save();
      renderTickets(t.id);
    });
    if (t.questions) {
      for (const q of t.questions) if (r.values[q.id]) markAnswer(t, r, q, false);
      $('#qa').addEventListener('submit', (e) => {
        e.preventDefault();
        for (const q of t.questions) {
          r.values[q.id] = $('#q-' + q.id).value;
          markAnswer(t, r, q, true);
        }
        persist(t);
        drawObjectives(t, r, true);
      });
    }

    const input = $('#cmd');
    input.addEventListener('keydown', (e) => onKey(e, t, r));
    $('#term').addEventListener('click', (e) => { if (!G.getSelection().toString()) input.focus(); });
  }

  function markAnswer(t, r, q, show) {
    const raw = (r.values[q.id] || '').trim().toLowerCase().replace(/\s+/g, '');
    const ok = q.accept.some((a) => a.toLowerCase() === raw);
    r.answers[q.id] = ok;
    const fb = $('#fb-' + q.id);
    if (!fb) return;
    if (!raw) { fb.textContent = ''; fb.className = 'fb'; return; }
    fb.className = 'fb ' + (ok ? 'good' : 'bad');
    fb.textContent = ok ? 'Correct. ' + q.explain : show ? 'Not yet. Check your block size and try again.' : '';
  }

  function drawDevTabs(t, r) {
    const order = t.topology.nodes.map((n) => n.id).filter((id) => r.w.devices[id]);
    $('#devtabs').innerHTML = order
      .map((id) => `<button role="tab" type="button" data-dev="${id}" aria-selected="${id === r.dev}">${esc(r.w.devices[id].hostname)}</button>`)
      .join('');
    $$('#devtabs button').forEach((b) => b.addEventListener('click', () => selectDev(t, r, b.dataset.dev)));
  }

  function selectDev(t, r, id) {
    r.dev = id;
    r.hi = -1;
    drawDevTabs(t, r);
    drawConsole(t, r);
    drawTopo(t, r);
    persist(t);
    $('#cmd').focus();
  }

  function classify(line) {
    if (/^%(LINK|LINEPROTO|OSPF|SYS)/.test(line)) return 'sys';
    if (/^% /.test(line) || /^\s*\^$/.test(line) || /is not recognized/.test(line)) return 'err';
    return '';
  }
  function logFor(r, id) {
    if (!r.logs[id]) {
      const d = r.w.devices[id];
      r.logs[id] = d.kind === 'pc'
        ? [['dim', `Command prompt on ${d.hostname}. Type help for commands.`], ['', '']]
        : [['dim', `Console connected to ${d.hostname}. Press Enter to start, type ? for help.`], ['', '']];
    }
    return r.logs[id];
  }
  function drawConsole(t, r) {
    const out = $('#out');
    const lines = logFor(r, r.dev);
    out.innerHTML = lines
      .map(([cls, text]) => {
        if (cls === 'cmd') {
          const i = text.indexOf('\u0000');
          return `<div><span class="p">${esc(text.slice(0, i))}</span><span class="cmd">${esc(text.slice(i + 1))}</span></div>`;
        }
        return `<div class="${cls}">${esc(text) || ' '}</div>`;
      })
      .join('');
    out.scrollTop = out.scrollHeight;
    $('#prompt').textContent = r.s.prompt(r.dev);
  }

  function exec(t, r, line, opts) {
    const log = logFor(r, r.dev);
    log.push(['cmd', r.s.prompt(r.dev) + '\u0000' + line + (opts && opts.help ? '?' : '')]);
    const outLines = opts && opts.help ? r.s.run(r.dev, line + '?') : r.s.run(r.dev, line);
    for (const l of outLines) log.push([classify(l), l]);
    drawConsole(t, r);
    drawTopo(t, r);
    drawDevTabs(t, r);
    drawObjectives(t, r, true);
    persist(t);
  }

  function onKey(e, t, r) {
    const input = e.target;
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      if (v.trim()) { r.hist.push(v); }
      r.hi = -1;
      input.value = '';
      exec(t, r, v);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const c = r.s.complete(r.dev, input.value);
      if (c) input.value = c;
    } else if (e.key === '?') {
      e.preventDefault();
      exec(t, r, input.value, { help: true });
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
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      r.logs[r.dev] = [];
      drawConsole(t, r);
    }
  }

  function drawObjectives(t, r, celebrate) {
    const st = objState(t, r);
    $('#objs').innerHTML = t.objectives
      .map((o, i) => `<li class="${st[i] ? 'ok' : ''}"><span class="box" aria-hidden="true"></span><span>${esc(o.text)}<span class="sr">${st[i] ? ' (done)' : ' (not done)'}</span></span></li>`)
      .join('');
    const all = st.every(Boolean);
    const was = !!store.solved[t.id];
    if (all && !was) {
      store.solved[t.id] = new Date().toISOString().slice(0, 10);
      save();
      $('#stamp-slot').innerHTML = `<div class="stamp ${celebrate ? 'fresh' : ''}" aria-label="Resolved">RESOLVED</div>`;
      $('.ticket-head').classList.add('solved');
      const note = $('.rail-note');
      if (note) note.textContent = `${Object.keys(store.solved).length} of ${TT.tickets.length} resolved. See Progress for what is coming next.`;
      const stub = $(`.stub[href="#${t.id}"] .meta`);
      if (stub) stub.innerHTML = `<span>${esc(t.topic)}</span><span>·</span><span class="done">Resolved</span>`;
    }
    if (all || was) drawDebrief(t);
  }

  function drawDebrief(t) {
    const next = TT.tickets[TT.tickets.indexOf(t) + 1];
    $('#debrief').innerHTML = `
      <div class="debrief">
        <h3>Debrief</h3>
        <p>${esc(t.debrief.what)}</p>
        <p class="exam"><b>On the exam.</b> ${esc(t.debrief.exam)}</p>
        <p><b>Now do it for real in Packet Tracer:</b> ${esc(t.ptLab)}</p>
        ${next ? `<a class="btn primary" href="#${next.id}">Next ticket: ${esc(next.title)}</a>` : `<a class="btn primary" href="#progress">See your progress</a>`}
      </div>`;
  }

  function drawHints(t, r) {
    const b = $('#hintBtn');
    b.textContent = r.hints < t.hints.length ? `Show a hint (${r.hints + 1} of ${t.hints.length})` : 'No more hints';
    b.disabled = r.hints >= t.hints.length;
    $('#hints').innerHTML = t.hints.slice(0, r.hints).map((h, i) => `<div class="hint"><b>HINT ${i + 1}</b>${esc(h)}</div>`).join('');
  }

  /* ---------------- topology drawing ---------------- */
  function glyph(type) {
    switch (type) {
      case 'router':
        return `<circle class="glyph" r="21" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/>
          <path d="M-11 0h22M0 -11v22" stroke="var(--ink)" stroke-width="1.6"/>
          <path d="M7 -4l4 4-4 4M-7 -4l-4 4 4 4M-4 -7l4 -4 4 4M-4 7l4 4 4 -4" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
      case 'switch':
        return `<rect class="glyph" x="-28" y="-15" width="56" height="30" rx="6" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/>
          <path d="M-15 -4h28m-5 -4 5 4-5 4M15 5h-28m5 -4-5 4 5 4" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      case 'printer':
        return `<rect class="glyph" x="-20" y="-10" width="40" height="20" rx="4" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/>
          <path d="M-12 -10v-9h24v9M-12 10v7h24v-7" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      default:
        return `<rect class="glyph" x="-19" y="-16" width="38" height="25" rx="3" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/>
          <path d="M-7 15h14M0 9v6" stroke="var(--ink)" stroke-width="1.6"/>`;
    }
  }
  function drawTopo(t, r) {
    const nodes = t.topology.nodes;
    const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const H = Math.max(...nodes.map((n) => n.y)) + 74;
    const w = r.w;
    let links = '';
    let labels = '';
    for (const [a, ai, b, bi] of w.links) {
      const A = pos[a];
      const B = pos[b];
      if (!A || !B) continue;
      const devA = w.devices[a];
      const up = devA.kind === 'pc' ? TT.net.linkUp(w, b, bi) : TT.net.linkUp(w, a, ai);
      const trunk = (devA.interfaces[ai] || {}).mode === 'trunk' || (w.devices[b].interfaces[bi] || {}).mode === 'trunk';
      links += `<line class="link ${up ? '' : 'down'} ${trunk ? 'trunk' : ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
      const lab = (P, Q, name) => {
        if (name === 'NIC') return '';
        const x = P.x + (Q.x - P.x) * 0.3;
        const y = P.y + (Q.y - P.y) * 0.3 - 8;
        return `<text class="ifl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(TT.ifname.shortIf(name))}</text>`;
      };
      labels += lab(A, B, ai) + lab(B, A, bi);
    }
    let g = '';
    for (const n of nodes) {
      const d = w.devices[n.id];
      if (!d) continue;
      const addr = d.kind === 'pc' && d.pc.ip ? `${d.pc.ip}/${TT.ip.maskToPrefix(d.pc.mask)}` : '';
      g += `<g class="node ${n.id === r.dev ? 'sel' : ''}" data-dev="${n.id}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button" aria-label="Open console on ${esc(d.hostname)}">
        <rect x="-40" y="-28" width="80" height="${addr ? 88 : 74}" fill="transparent"/>
        ${glyph(n.type)}
        <text class="host" y="38" text-anchor="middle">${esc(d.hostname)}</text>
        ${addr ? `<text class="addr" y="52" text-anchor="middle">${esc(addr)}</text>` : ''}
      </g>`;
    }
    $('#topo').innerHTML = `<svg viewBox="0 0 680 ${H}" role="img" aria-label="Network topology for ${esc(t.title)}">${links}${labels}${g}</svg>`;
    $$('#topo .node').forEach((el) => {
      el.addEventListener('click', () => selectDev(t, r, el.dataset.dev));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDev(t, r, el.dataset.dev); } });
    });
  }

  /* ======================================================================
   * SUBNET DRILL
   * ====================================================================== */
  let drill = null;
  function newProblem(mode) {
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    let ip;
    let p;
    if (mode === 'focus') {
      p = rnd(24, 30);
      const pick = rnd(0, 2);
      ip = pick === 0 ? `192.168.${rnd(0, 255)}.${rnd(1, 254)}` : pick === 1 ? `10.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}` : `172.${rnd(16, 31)}.${rnd(0, 255)}.${rnd(1, 254)}`;
    } else {
      p = rnd(9, 30);
      ip = `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`;
    }
    const { ipToInt, intToIp, netOf, prefixToMaskInt } = TT.ip;
    const n = netOf(ipToInt(ip), p);
    const size = 2 ** (32 - p);
    const b = (n + size - 1) >>> 0;
    if (ipToInt(ip) === n || ipToInt(ip) === b) return newProblem(mode);
    return {
      ip, p,
      ans: { net: intToIp(n), bc: intToIp(b), first: intToIp(n + 1), last: intToIp(b - 1), hosts: String(size - 2), mask: intToIp(prefixToMaskInt(p)) },
      started: Date.now(),
      checked: false,
    };
  }
  function explain(pr) {
    const octet = Math.floor((pr.p - 1) / 8);
    const maskOct = Number(pr.ans.mask.split('.')[octet]);
    const block = 256 - maskOct;
    const val = Number(pr.ip.split('.')[octet]);
    const start = Math.floor(val / block) * block;
    const names = ['first', 'second', 'third', 'fourth'];
    return `The interesting octet is the ${names[octet]} (mask ${maskOct}). Block size = 256 - ${maskOct} = <b>${block}</b>. ${val} falls in the block that starts at ${start} and ends at ${start + block - 1}, so the network is <code>${pr.ans.net}</code> and the broadcast is <code>${pr.ans.bc}</code>. Hosts = 2<sup>${32 - pr.p}</sup> - 2 = ${pr.ans.hosts}.`;
  }
  /* IPv6 modified EUI-64 practice (exam topic 1.9) */
  let eui = null;
  function newEui() {
    const r = () => Math.floor(Math.random() * 256);
    const mac = [r() & 0xfc, r(), r(), r(), r(), r()];
    const pfx = ['2001:DB8:' + (r() * 256 + r()).toString(16).toUpperCase() + ':' + (r()).toString(16).toUpperCase() + '::', '2001:DB8:ACAD:' + (r() % 64 + 1) + '::', 'FE80::'][Math.floor(Math.random() * 3)];
    const id = [mac[0] ^ 0x02, mac[1], mac[2], 0xff, 0xfe, mac[3], mac[4], mac[5]];
    const hex = (a, b) => ((a << 8) | b).toString(16).toUpperCase();
    const iid = [hex(id[0], id[1]), hex(id[2], id[3]), hex(id[4], id[5]), hex(id[6], id[7])].join(':');
    const macStr = [0, 2, 4].map((k) => ((mac[k] << 8) | mac[k + 1]).toString(16).padStart(4, '0')).join('.');
    return { mac, macStr, pfx, iid, flipFrom: mac[0], flipTo: mac[0] ^ 0x02 };
  }
  const normV6 = (t) => { const n = TT.ip6.v6parse(String(t).trim()); return n === null ? null : TT.ip6.v6fmt(n); };
  function renderEui() {
    if (!eui) eui = newEui();
    const box = $('#euiSheet');
    if (!box) return;
    box.innerHTML = `
      <p class="label" style="margin:0">IPv6 EUI-64 practice</p>
      <div class="prob" style="font-size:clamp(20px,4vw,32px)">MAC ${eui.macStr} &nbsp;·&nbsp; prefix ${eui.pfx}/64</div>
      <p style="margin:0;color:var(--muted)">Build the modified EUI-64 interface ID, then the full address. Split the MAC, insert FFFE, flip the 7th bit of the first byte.</p>
      <form id="euiForm"><div class="drill-grid">
        <div class="field"><label for="e-iid">Interface ID (last 64 bits)</label><input id="e-iid" autocomplete="off" spellcheck="false" placeholder="xxxx:xxxx:xxxx:xxxx"><div class="ans" id="ea-iid"></div></div>
        <div class="field"><label for="e-full">Full IPv6 address</label><input id="e-full" autocomplete="off" spellcheck="false"><div class="ans" id="ea-full"></div></div>
      </div>
      <div class="tools"><button class="btn primary" type="submit">Check</button><button class="btn" type="button" id="euiNext">New MAC</button></div></form>
      <div class="method" id="euiMethod"></div>`;
    $('#euiForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const want = TT.ip6.v6fmt(TT.ip6.v6parse(eui.pfx) | TT.ip6.v6parse('::' + eui.iid));
      const gotIid = normV6('::' + $('#e-iid').value.replace(/^:+/, ''));
      const okIid = gotIid !== null && gotIid === normV6('::' + eui.iid);
      const okFull = normV6($('#e-full').value) === want;
      $('#ea-iid').innerHTML = okIid ? '<span class="ok">Correct</span>' : `<span class="no">${eui.iid}</span>`;
      $('#ea-full').innerHTML = okFull ? '<span class="ok">Correct</span>' : `<span class="no">${want}</span>`;
      const b0 = eui.flipFrom.toString(16).padStart(2, '0').toUpperCase();
      const b1 = eui.flipTo.toString(16).padStart(2, '0').toUpperCase();
      $('#euiMethod').innerHTML = `<b>How it works:</b> ${eui.macStr.toUpperCase()} splits into ${eui.macStr.slice(0, 7).replace('.', '').toUpperCase().slice(0, 6)} | ${eui.macStr.replace(/\./g, '').slice(6).toUpperCase()}. Insert FFFE between the halves. The first byte ${b0} is ${eui.flipFrom.toString(2).padStart(8, '0')} in binary; flipping the 7th bit gives ${eui.flipTo.toString(2).padStart(8, '0')} = ${b1}. Interface ID: <code>${eui.iid}</code>. Append it to the /64 prefix: <code>${want}</code>.`;
    });
    $('#euiNext').addEventListener('click', () => { eui = newEui(); renderEui(); });
  }

  function renderDrill() {
    if (!drill) drill = { mode: store.drill.mode || 'focus', streak: 0, pr: null };
    if (!drill.pr) drill.pr = newProblem(drill.mode);
    const pr = drill.pr;
    const F = [
      ['net', 'Network address'],
      ['bc', 'Broadcast address'],
      ['first', 'First usable host'],
      ['last', 'Last usable host'],
      ['hosts', 'Usable hosts'],
      ['mask', 'Subnet mask'],
    ];
    $('#main').innerHTML = `
      <div class="sheet drill">
        <div class="guide-top" style="margin:0">
          <p class="label" style="margin:0">Subnet drill</p>
          <div class="seg" role="group" aria-label="Difficulty">
            <button type="button" data-mode="focus" aria-pressed="${drill.mode === 'focus'}">/24 to /30</button>
            <button type="button" data-mode="full" aria-pressed="${drill.mode === 'full'}">Any prefix</button>
          </div>
        </div>
        <div class="prob">${pr.ip}/${pr.p}</div>
        <p style="margin:0;color:var(--muted)">Fill in every box, then check. Aim for under 60 seconds, like the exam.</p>
        <form id="drillForm">
          <div class="drill-grid">
            ${F.map(([k, l]) => `<div class="field" id="f-${k}"><label for="d-${k}">${l}</label><input id="d-${k}" data-k="${k}" inputmode="decimal" autocomplete="off" spellcheck="false"><div class="ans" id="a-${k}"></div></div>`).join('')}
          </div>
          <div class="tools"><button class="btn primary" type="submit" id="checkBtn">Check</button><button class="btn" type="button" id="nextBtn">New question</button></div>
        </form>
        <div class="method" id="method"></div>
        <div class="stats">
          <div class="stat"><b id="s-streak">${drill.streak}</b><span>Current streak</span></div>
          <div class="stat"><b>${store.drill.best || 0}</b><span>Best streak</span></div>
          <div class="stat"><b id="s-time">0s</b><span>This question</span></div>
          <div class="stat"><b>${store.drill.bestTime ? store.drill.bestTime + 's' : 'none'}</b><span>Fastest perfect answer</span></div>
        </div>
      </div>
      <div class="sheet drill" id="euiSheet" style="margin-top:16px"></div>`;
    renderEui();
    $$('.seg button').forEach((b) => b.addEventListener('click', () => {
      drill.mode = b.dataset.mode;
      store.drill.mode = drill.mode;
      save();
      drill.pr = newProblem(drill.mode);
      renderDrill();
    }));
    $('#nextBtn').addEventListener('click', () => { drill.pr = newProblem(drill.mode); renderDrill(); $('#d-net').focus(); });
    $('#drillForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (pr.checked) { drill.pr = newProblem(drill.mode); renderDrill(); $('#d-net').focus(); return; }
      let all = true;
      for (const [k] of F) {
        const v = $('#d-' + k).value.trim().replace(/^\//, '');
        let ok = v === pr.ans[k];
        if (k === 'mask' && !ok && /^\d+$/.test(v)) ok = Number(v) === pr.p;
        $('#f-' + k).className = 'field ' + (ok ? 'good' : 'bad');
        $('#a-' + k).textContent = ok ? '' : pr.ans[k];
        if (!ok) all = false;
      }
      const secs = Math.round((Date.now() - pr.started) / 1000);
      pr.checked = true;
      clearInterval(drill.timer);
      if (all) {
        drill.streak++;
        if (drill.streak > (store.drill.best || 0)) store.drill.best = drill.streak;
        if (!store.drill.bestTime || secs < store.drill.bestTime) store.drill.bestTime = secs;
      } else drill.streak = 0;
      save();
      $('#s-streak').textContent = drill.streak;
      $('#method').innerHTML = (all ? '<b style="color:var(--good)">All correct.</b> ' : '') + explain(pr);
      $('#checkBtn').textContent = 'Next question';
    });
    clearInterval(drill.timer);
    drill.timer = setInterval(() => {
      const el = $('#s-time');
      if (!el) return clearInterval(drill.timer);
      el.textContent = Math.round((Date.now() - pr.started) / 1000) + 's';
    }, 1000);
  }

  /* ======================================================================
   * FIELD GUIDE
   * ====================================================================== */
  let guideState = { domain: 'all', q: '' };
  /* ======================================================================
   * COURSE MAP
   * ====================================================================== */
  function renderMap() {
    const cardName = Object.fromEntries(TT.cards.map((c) => [c.id, c.name]));
    const hwName = { cable: 'Cabling lab', ports: 'Port ID lab', gear: 'Gear lab', wlc: 'WLC GUI lab' };
    const done = (day) => {
      const t = day[2].t || [];
      return t.length && t.every((id) => store.solved[id]);
    };
    const nT = new Set(TT.course.flatMap((d) => d[2].t || [])).size;
    const covered = TT.course.filter((d) => (d[2].t || []).length || (d[2].c || []).length || d[2].hw || d[2].drill).length;
    const lessonIds = new Set((TT.lessons || []).map((l) => l.obj));
    const hwLabel = { cable: 'Cabling lab', ports: 'Port ID lab', gear: 'Gear lab', wlc: 'WLC GUI lab' };
    const bpRows = (TT.blueprint || []).map(([obj, title, x]) => {
      const links = [
        ...(lessonIds.has(obj) ? [`<a class="pill topic" href="#learn-l${obj.replace('.', '-')}">Lesson</a>`] : []),
        ...(x.t || []).map((id) => `<a class="pill topic" href="#${id}">${TT.tickets.byId[id].number}${store.solved[id] ? ' ✓' : ''}</a>`),
        ...(x.c || []).map((id) => `<a class="pill" href="#card-${id}">${esc(cardName[id] || id)}</a>`),
        ...(x.hw ? [`<a class="pill" href="#hw-${x.hw}">${hwLabel[x.hw]}</a>`] : []),
        ...(x.drill ? ['<a class="pill" href="#drill">Drill</a>'] : []),
      ];
      const done = (x.t || []).length && x.t.every((id) => store.solved[id]);
      return `<li class="mapday${done ? ' done' : ''}"><span class="dnum">${obj}</span><span class="dttl">${esc(title)}</span><span class="dlinks">${links.join('')}</span></li>`;
    });
    const view = store.mapView || 'days';
    $('#main').innerHTML = `
      <div class="map-head">
        <div class="seg" role="group" aria-label="Map view" style="margin-bottom:10px"><button type="button" data-mv="days" aria-pressed="${view === 'days'}">By course day</button><button type="button" data-mv="exam" aria-pressed="${view === 'exam'}">By exam objective (v1.1)</button></div>
        <div><p class="label">Course map</p>
        <h2 style="margin:4px 0 6px">Jeremy's IT Lab, all 63 days</h2>
        <p style="margin:0;max-width:62ch;font-size:14px">Watch the day's video, then use what is linked beside it here: a ticket to troubleshoot, field-guide cards to review, or a lab. ${covered} of 63 days have practice in this app, with ${nT} tickets in all.</p></div>
      </div>
      ${view === 'exam' ? `<p style="margin:0 0 10px;font-size:14px;max-width:62ch">All ${bpRows.length} objectives of the CCNA 200-301 v1.1 blueprint. Weights: Fundamentals 20%, Access 20%, IP Connectivity 25%, IP Services 10%, Security 15%, Automation 10%.</p><ol class="map">${bpRows.join('')}</ol>` : `<ol class="map">
        ${TT.course.map((d) => {
          const [day, title, x] = d;
          const links = [
            ...(x.t || []).map((id) => `<a class="pill topic" href="#${id}">${TT.tickets.byId[id].number}${store.solved[id] ? ' ✓' : ''}</a>`),
            ...(x.c || []).map((id) => `<a class="pill" href="#card-${id}">${esc(cardName[id] || id)}</a>`),
            ...(x.hw ? [`<a class="pill" href="#hw-${x.hw}">${hwName[x.hw]}</a>`] : []),
            ...(x.drill ? ['<a class="pill" href="#drill">Subnet drill</a>'] : []),
          ];
          return `<li class="mapday${done(d) ? ' done' : ''}">
            <span class="dnum">Day ${day}</span>
            <span class="dttl"><a href="${TT.courseVideo(day, title)}" target="_blank" rel="noopener">${esc(title)}</a></span>
            <span class="dlinks">${links.join('')}</span></li>`;
        }).join('')}
      </ol>`}`;
    $$('[data-mv]').forEach((b) => b.addEventListener('click', () => { store.mapView = b.dataset.mv; save(); renderMap(); }));
  }

  function renderGuide() {
    $('#main').innerHTML = `
      <div class="guide-top">
        <div class="chips" role="group" aria-label="Exam domain">
          <button class="chip" type="button" data-d="all" aria-pressed="${guideState.domain === 'all'}">All topics</button>
          ${TT.domains.map((d) => `<button class="chip" type="button" data-d="${d.id}" aria-pressed="${guideState.domain === d.id}">${esc(d.name)}</button>`).join('')}
        </div>
        <label class="sr" for="gsearch">Search the guide</label>
        <input class="search" id="gsearch" type="search" placeholder="Search: ospf, 161, dhcp..." value="${esc(guideState.q)}">
      </div>
      <details class="portbox"><summary>Port numbers to memorize (${TT.ports.length})</summary>
        <table class="ports"><thead><tr><th>Protocol</th><th>Transport</th><th>Port</th></tr></thead><tbody>
        ${TT.ports.map(([n, tr, p]) => `<tr><td>${n}</td><td>${tr}</td><td>${p}</td></tr>`).join('')}
        </tbody></table></details>
      <div class="cards" id="cards"></div>`;
    $$('.chip').forEach((c) => c.addEventListener('click', () => { guideState.domain = c.dataset.d; renderGuide(); }));
    $('#gsearch').addEventListener('input', (e) => { guideState.q = e.target.value; drawCards(); });
    drawCards();
  }
  function drawCards() {
    const q = guideState.q.trim().toLowerCase();
    if (guideState.only) {
      const c1 = TT.cards.filter((c) => c.id === guideState.only);
      if (c1.length) { renderCardList(c1); $('#cards').insertAdjacentHTML('afterbegin', '<p class="mapnote" style="grid-column:1/-1">Showing one card. <a href="#guide">See all cards</a></p>'); return; }
    }
    const list = TT.cards.filter((c) => (guideState.domain === 'all' || c.domain === guideState.domain) && (!q || [c.name, c.summary, c.ports, c.trap, ...c.facts].join(' ').toLowerCase().includes(q)));
    renderCardList(list);
  }
  function renderCardList(list) {
    const dn = Object.fromEntries(TT.domains.map((d) => [d.id, d.name]));
    $('#cards').innerHTML = list.length
      ? list.map((c) => `
        <article class="card">
          <h3>${esc(c.name)}</h3>
          <div class="tags"><span class="pill topic">${esc(dn[c.domain])}</span>${c.layer ? `<span class="pill">${esc(c.layer)}</span>` : ''}${c.ports ? `<span class="pill">${esc(c.ports)}</span>` : ''}</div>
          <p class="sum">${esc(c.summary)}</p>
          <ul>${c.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <div class="trap"><b>Exam trap</b>${esc(c.trap)}</div>
          <div><button class="btn" type="button" data-quiz="${c.id}">Quiz me on this (${c.q.length})</button></div>
        </article>`).join('')
      : '<p>No cards match that search.</p>';
    $$('[data-quiz]').forEach((b) => b.addEventListener('click', () => { startQuiz({ card: b.dataset.quiz }); G.location.hash = 'quiz'; }));
  }

  /* ======================================================================
   * QUIZ
   * ====================================================================== */
  const bank = () => TT.cards.flatMap((c) => c.q.map((q, i) => ({ key: c.id + ':' + i, card: c.id, domain: c.domain, q: q[0], opts: q[1], a: q[2], why: q[3] })));
  let quiz = null;
  function startQuiz(opt) {
    let pool = bank();
    let title = 'All topics';
    if (opt.card) { pool = pool.filter((x) => x.card === opt.card); title = TT.cards.find((c) => c.id === opt.card).name; }
    else if (opt.domain && opt.domain !== 'all') { pool = pool.filter((x) => x.domain === opt.domain); title = TT.domains.find((d) => d.id === opt.domain).name; }
    else if (opt.missed) { pool = pool.filter((x) => store.quiz.missed.includes(x.key)); title = 'Review missed questions'; }
    const qs = shuffle(pool).slice(0, opt.card ? pool.length : 10).map((x) => {
      const order = shuffle(x.opts.map((o, i) => i));
      return Object.assign({}, x, { order, picked: null });
    });
    quiz = { qs, i: 0, score: 0, title, opt, full: !opt.card && !opt.missed && (!opt.domain || opt.domain === 'all') };
  }
  function renderQuiz() {
    if (!quiz) return renderQuizStart();
    if (quiz.i >= quiz.qs.length) return renderQuizEnd();
    const x = quiz.qs[quiz.i];
    const L = 'ABCDEF';
    $('#main').innerHTML = `
      <div class="sheet quiz">
        <div class="qnum">${esc(quiz.title)} · Question ${quiz.i + 1} of ${quiz.qs.length} · Score ${quiz.score}</div>
        <div class="bar"><i style="width:${(quiz.i / quiz.qs.length) * 100}%"></i></div>
        <p class="qtext">${esc(x.q)}</p>
        <div class="opts">${x.order.map((oi, k) => `<button class="opt" type="button" data-oi="${oi}"><span class="k">${L[k]}</span><span>${esc(x.opts[oi])}</span></button>`).join('')}</div>
        <div class="why" id="why"></div>
        <div class="tools"><button class="btn quiet" type="button" id="quitQ">End quiz</button></div>
      </div>`;
    $$('.opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.oi))));
    $('#quitQ').addEventListener('click', () => { quiz = null; renderQuiz(); });
    doc.onkeydown = (e) => {
      if (!$('.quiz') || e.target.tagName === 'INPUT') return;
      const k = 'abcdef'.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < x.order.length && x.picked === null) answer(x.order[k]);
      else if (e.key === 'Enter' && x.picked !== null && $('#nextQ')) $('#nextQ').click();
    };
  }
  function answer(oi) {
    const x = quiz.qs[quiz.i];
    if (x.picked !== null) return;
    x.picked = oi;
    const ok = oi === x.a;
    if (ok) {
      quiz.score++;
      store.quiz.missed = store.quiz.missed.filter((k) => k !== x.key);
    } else if (!store.quiz.missed.includes(x.key)) store.quiz.missed.push(x.key);
    save();
    $$('.opt').forEach((b) => {
      const v = Number(b.dataset.oi);
      b.disabled = true;
      if (v === x.a) b.classList.add('right');
      else if (v === oi) b.classList.add('wrong');
    });
    $('#why').innerHTML = `<b style="color:var(${ok ? '--good' : '--stamp'})">${ok ? 'Correct.' : 'Not quite.'}</b> ${esc(x.why)}
      <div class="tools"><button class="btn primary" type="button" id="nextQ">${quiz.i + 1 < quiz.qs.length ? 'Next question' : 'See results'}</button></div>`;
    $('#nextQ').addEventListener('click', () => { quiz.i++; renderQuiz(); });
    $('#nextQ').focus();
  }
  function renderQuizStart() {
    const missed = store.quiz.missed.length;
    $('#main').innerHTML = `
      <div class="sheet quiz">
        <p class="label">Quiz</p>
        <p class="qtext" style="margin-top:0">Ten questions drawn from ${bank().length}, across all six CCNA exam domains.</p>
        <div class="tools">
          <button class="btn primary" type="button" data-start="all">Start a 10-question quiz</button>
          ${missed ? `<button class="btn" type="button" data-start="missed">Review the ${missed} you missed</button>` : ''}
        </div>
        <p class="label" style="margin-top:20px">Or pick one domain</p>
        <div class="chips">${TT.domains.map((d) => `<button class="chip" type="button" data-start="${d.id}">${esc(d.name)}</button>`).join('')}</div>
        ${store.quiz.best !== null ? `<p style="margin-top:18px;color:var(--muted)">Best full-quiz score: ${store.quiz.best}%</p>` : ''}
      </div>`;
    $$('[data-start]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.start;
      startQuiz(v === 'missed' ? { missed: true } : { domain: v });
      renderQuiz();
    }));
  }
  function renderQuizEnd() {
    const pct = Math.round((quiz.score / quiz.qs.length) * 100);
    if (quiz.full && (store.quiz.best === null || pct > store.quiz.best)) { store.quiz.best = pct; save(); }
    const opt = quiz.opt;
    $('#main').innerHTML = `
      <div class="sheet quiz">
        <p class="label">${esc(quiz.title)}</p>
        <div class="score">${quiz.score} / ${quiz.qs.length}</div>
        <p>${pct >= 85 ? 'Exam-ready on this set. Keep it fresh with the drill.' : pct >= 60 ? 'Close. Review the cards for the ones you missed, then go again.' : 'Worth another pass through the field guide and the matching Jeremy\'s IT Lab videos.'}</p>
        <div class="tools">
          <button class="btn primary" type="button" id="again">Go again</button>
          ${store.quiz.missed.length ? `<button class="btn" type="button" id="rev">Review ${store.quiz.missed.length} missed</button>` : ''}
          <a class="btn" href="#guide">Open the field guide</a>
        </div>
      </div>`;
    $('#again').addEventListener('click', () => { startQuiz(opt); renderQuiz(); });
    if ($('#rev')) $('#rev').addEventListener('click', () => { startQuiz({ missed: true }); renderQuiz(); });
  }

  /* ======================================================================
   * PROGRESS
   * ====================================================================== */
  function readKey(k) { try { return JSON.parse(G.localStorage.getItem(k)) || null; } catch (e) { return null; } }
  function renderProgress() {
    const solved = TT.tickets.filter((t) => store.solved[t.id]).length;
    const lessons = TT.lessons || [];
    const lp = readKey('trouble-ticket-lessons-v1') || {};
    const lessonsDone = lessons.filter((l) => lp.done && lp.done[l.id]).length;
    const cards = TT.flashcards || [];
    const fp = (readKey('trouble-ticket-flash-v1') || {}).cards || {};
    const now = Date.now();
    const due = cards.filter((c) => !fp[c.id] || (fp[c.id].due || 0) <= now).length;
    const mastered = cards.filter((c) => fp[c.id] && fp[c.id].box >= 4).length;
    const ex = readKey('trouble-ticket-exam-v1') || {};
    const attempts = ex.attempts || ex.history || [];
    const last = attempts[attempts.length - 1];
    const best = attempts.reduce((m, a) => Math.max(m, a.score || 0), 0);
    const doms = [['1.0', 'Network Fundamentals', 20], ['2.0', 'Network Access', 20], ['3.0', 'IP Connectivity', 25], ['4.0', 'IP Services', 10], ['5.0', 'Security Fundamentals', 15], ['6.0', 'Automation', 10]];
    const domPct = (d) => {
      const x = last && (last.perDomain || last.domains || {})[d];
      if (x == null) return null;
      if (typeof x === 'number') return x <= 1 ? Math.round(x * 100) : Math.round(x);
      if (x.total) return Math.round((x.correct / x.total) * 100);
      return null;
    };
    // what to do next: the first unfinished lesson in blueprint order, else due cards, else an open ticket
    const nextLesson = lessons.slice().sort((a, b) => { const p = (o) => o.split('.').map(Number); const [a1, a2] = p(a.obj); const [b1, b2] = p(b.obj); return a1 - b1 || a2 - b2; }).find((l) => !(lp.done && lp.done[l.id]));
    const nextTicket = TT.tickets.find((t) => !store.solved[t.id]);
    const next = nextLesson ? `<a class="btn primary" href="#learn-${nextLesson.id}">Next lesson: ${nextLesson.obj} ${esc(nextLesson.title)}</a>`
      : due ? `<a class="btn primary" href="#flash">Review ${due} due flashcards</a>`
      : nextTicket ? `<a class="btn primary" href="#${nextTicket.id}">Next ticket: ${nextTicket.number}</a>`
      : '<a class="btn primary" href="#exam">Take a full mock exam</a>';
    $('#main').innerHTML = `
      <div class="sheet" style="margin-bottom:16px"><p class="label">Tonight's shift</p><h2 style="margin:6px 0 12px">Where you are</h2>${next}</div>
      <div class="prog">
        <div class="stat sheet"><b>${lessonsDone} / ${lessons.length || 53}</b><span>Lessons complete</span></div>
        <div class="stat sheet"><b>${solved} / ${TT.tickets.length}</b><span>Tickets resolved</span></div>
        <div class="stat sheet"><b>${cards.length ? due : 'n/a'}</b><span>Flashcards due${cards.length ? ` · ${mastered} mastered` : ''}</span></div>
        <div class="stat sheet"><b>${last ? (last.score || 0) + ' / 1000' : 'none'}</b><span>Last mock exam${best ? ` · best ${best}` : ''}</span></div>
        <div class="stat sheet"><b>${store.drill.best || 0}</b><span>Best subnet streak</span></div>
        <div class="stat sheet"><b>${store.quiz.best === null ? 'none' : store.quiz.best + '%'}</b><span>Best quick quiz</span></div>
      </div>
      <section class="sheet" style="margin-top:20px">
        <p class="label">Exam readiness by domain (last mock exam)</p>
        <div class="ready">${doms.map(([d, n, wgt]) => { const v = domPct(d); return `<div class="ready-row"><span>${d} ${n} <small>(${wgt}% of exam)</small></span><span class="bar"><i style="width:${v == null ? 0 : v}%;background:${v == null ? 'var(--line)' : v >= 85 ? 'var(--good)' : v >= 70 ? 'var(--warn)' : 'var(--stamp)'}"></i></span><b>${v == null ? '—' : v + '%'}</b></div>`; }).join('')}</div>
        <p style="margin:10px 0 0;font-size:13px;color:var(--muted)">Aim for 85% or better in every domain on full mock exams before booking. Cisco does not publish an official passing score.</p>
      </section>
      <div class="cols" style="margin-top:20px">
        <section class="sheet">
          <p class="label">Tickets</p>
          <ul class="roadmap">${TT.tickets.map((t) => `<li><a href="#${t.id}">${t.number} · ${esc(t.title)}</a><span>${store.solved[t.id] ? 'Resolved ' + (typeof store.solved[t.id] === 'string' ? store.solved[t.id] : '') : esc(t.topic)}</span></li>`).join('')}</ul>
        </section>
        <section class="sheet">
          <p class="label">Coming next</p>
          <ul class="roadmap">${TT.roadmap.map((x) => `<li>${esc(x.topic)}<span>${esc(x.note)}</span></li>`).join('')}</ul>
        </section>
      </div>
      <div class="tools" style="margin-top:20px"><button class="btn quiet" type="button" id="wipe">Reset ticket, drill and quiz progress</button></div>`;
    let armed = false;
    $('#wipe').addEventListener('click', (e) => {
      if (!armed) { armed = true; e.target.textContent = 'Click again to erase it'; return; }
      store = { solved: {}, tickets: {}, drill: { best: 0, bestTime: null, mode: 'focus' }, quiz: { best: null, missed: [] } };
      for (const k of Object.keys(runtime)) delete runtime[k];
      save();
      renderProgress();
    });
  }

  /* ---------------- boot ---------------- */
  G.addEventListener('hashchange', () => { doc.onkeydown = null; route(); });
  route();
})(window);
