/* Trouble Ticket: the front door (#home) and the "rooms" model the navigation is built from.
 *
 *   TT.rooms.list          the five rooms, each with its sub-tabs (views)
 *   TT.rooms.parse(hash)   pure: any hash -> { view, arg, room, sub }. app.js routes with it.
 *   TT.rooms.icon(id)      a small original line icon (inline SVG string) for a room, or 'manual'
 *   TT.renderHome(main)    the landing page: the night-shift illustration, Clock in, the shift strip
 *   TT.homeHero()          the illustration on its own (an SVG string)
 *
 * Reads, never writes: the progress keys of the other modules (to greet a returning tech and pick
 * tonight's work), TT.career (rank) and TT.plan.tonight() (the study plan) when they are loaded.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  /* ================= rooms (pure data) ================= */
  const ROOMS = [
    {
      id: 'training', name: 'Training Room', short: 'Training',
      line: 'Read the binder: every v1.1 objective in plain English, with animated scenes.',
      subs: [
        { id: 'lessons', label: 'Lessons', href: '#learn', view: 'learn' },
        { id: 'scenes', label: 'Watch it happen', href: '#scenes', view: 'learn' },
      ],
    },
    {
      id: 'noc', name: 'NOC Floor', short: 'NOC Floor',
      line: 'Work the ticket queue on a simulated Cisco CLI, then build networks from scratch.',
      subs: [
        { id: 'tickets', label: 'Tickets', href: '#tickets', view: 'tickets' },
        { id: 'lab', label: 'Lab bench', href: '#lab', view: 'lab' },
        { id: 'hardware', label: 'Hardware cage', href: '#hardware', view: 'hardware' },
      ],
    },
    {
      id: 'drills', name: 'Drill Room', short: 'Drills',
      line: 'Reps until it is muscle memory: spaced-repetition cards, subnetting against the clock.',
      subs: [
        { id: 'flash', label: 'Flashcards', href: '#flash', view: 'flash' },
        { id: 'drill', label: 'Subnet drill', href: '#drill', view: 'drill' },
        { id: 'quiz', label: 'Quick quiz', href: '#quiz', view: 'quiz' },
      ],
    },
    {
      id: 'cert', name: 'Certification Desk', short: 'Cert Desk',
      line: 'Timed mock exams in the real format, scored per domain like the score report.',
      subs: [{ id: 'exam', label: 'Mock exams', href: '#exam', view: 'exam' }],
    },
    {
      id: 'record', name: 'Shift Record', short: 'Record',
      line: 'Your rank, your streak, a plan for tonight and a map of the whole course.',
      subs: [
        { id: 'progress', label: 'Progress', href: '#progress', view: 'progress' },
        { id: 'plan', label: 'Study plan', href: '#plan', view: 'plan' },
        { id: 'map', label: 'Course map', href: '#map', view: 'map' },
      ],
    },
  ];
  // plain view name -> [room, sub]
  const VIEW_HOME = {};
  for (const r of ROOMS) for (const s of r.subs) if (!VIEW_HOME[s.view]) VIEW_HOME[s.view] = [r.id, s.id];

  const isTicket = (h) => (TT.tickets && TT.tickets.byId ? !!TT.tickets.byId[h] : /^t\d{2}$/.test(h));

  /** Pure: a location hash (with or without '#') -> what to render and which room and sub-tab light up.
   *  view is a key of app.js's view table; arg is what that view's renderer receives. */
  function parse(hash) {
    const h = String(hash == null ? '' : hash).replace(/^#/, '');
    const at = (view, arg, room, sub) => ({ view, arg: arg === undefined ? null : arg, room: room || null, sub: sub || null });
    if (h === '' || h === 'home') return at('home');
    if (isTicket(h)) return at('tickets', h, 'noc', 'tickets');
    if (h.startsWith('card-')) return at('guide', { card: h.slice(5) }, null, 'guide');
    if (h.startsWith('hw-')) return at('hardware', h.slice(3), 'noc', 'hardware');
    if (h.startsWith('scene-')) return at('learn', { scene: h.slice(6) }, 'training', 'scenes');
    if (h.startsWith('learn-scene-')) return at('learn', { id: h.slice(6) }, 'training', 'scenes');
    if (h.startsWith('learn-')) return at('learn', { id: h.slice(6) }, 'training', 'lessons');
    if (h.startsWith('lab-')) return at('lab', { project: h.slice(4) }, 'noc', 'lab');
    if (h.startsWith('flash-')) return at('flash', { deck: h.slice(6) }, 'drills', 'flash');
    if (h === 'scenes') return at('learn', { gallery: true }, 'training', 'scenes');
    if (h === 'guide') return at('guide', null, null, 'guide');
    if (VIEW_HOME[h]) return at(h, null, VIEW_HOME[h][0], VIEW_HOME[h][1]);
    return at('home');
  }
  const room = (id) => ROOMS.find((r) => r.id === id) || null;

  /* ================= icons (24x24 line art, currentColor) ================= */
  const ICON = {
    // a whiteboard on an easel with a little rising line
    training: '<rect x="3.5" y="3.5" width="17" height="11.5" rx="1.5"/><path d="M7 11.5l3-3 2.5 2 4-4.5M8 15l-2.5 5.5M16 15l2.5 5.5M12 15v3"/>',
    // a monitor with a heartbeat trace
    noc: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.8"/><path d="M5.5 10.5h3l1.5-3 2.5 6 1.8-3.5h4.2M9 20h6M12 16.5V20"/>',
    // a stopwatch
    drills: '<circle cx="12" cy="13.5" r="7.2"/><path d="M12 13.5V9.6M10 2.8h4M12 2.8v3.5M18.2 6.4l1.4-1.4"/>',
    // a certificate with a seal and ribbon
    cert: '<path d="M14.5 17.5H4.8a1.3 1.3 0 0 1-1.3-1.3V5.3A1.3 1.3 0 0 1 4.8 4h14.4a1.3 1.3 0 0 1 1.3 1.3v5"/><path d="M7 8h10M7 11h6"/><circle cx="18" cy="15" r="2.8"/><path d="M16.6 17.4L16 21l2-1 2 1-.6-3.6"/>',
    // a clipboard with a tick
    record: '<rect x="5" y="4.5" width="14" height="16.5" rx="1.6"/><path d="M9 4.5V3.2h6v1.3M9 3.2h6v2.6H9z"/><path d="M8.5 13l2.4 2.4 4.6-5"/>',
    // an open field manual
    manual: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
  };
  const icon = (id, cls) => `<svg class="${cls || 'rm-ico'}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[id] || ''}</svg>`;

  TT.rooms = { list: ROOMS, parse, room, icon, ICONS: Object.keys(ICON) };

  /* ================= progress (read only) ================= */
  const KEYS = { app: 'trouble-ticket-v1', lessons: 'trouble-ticket-lessons-v1', exam: 'trouble-ticket-exam-v1', flash: 'trouble-ticket-flash-v1', lab: 'trouble-ticket-sandbox-v1', wlc: 'trouble-ticket-wlc-v1', career: 'trouble-ticket-career-v1' };
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const some = (o) => isObj(o) && Object.keys(o).length > 0;
  function readAll() {
    const raw = {};
    for (const [k, key] of Object.entries(KEYS)) {
      try { raw[k] = JSON.parse(G.localStorage.getItem(key)); } catch (e) { raw[k] = null; }
    }
    return raw;
  }
  /** Pure: has this browser done anything worth a "welcome back"? (Visiting a page does not count.) */
  function hasProgress(raw) {
    raw = raw || {};
    const app = raw.app || {};
    const ex = raw.exam || {};
    const fl = (raw.flash || {}).cards;
    return some(app.solved) || some((raw.lessons || {}).done) || some((raw.lessons || {}).scores)
      || (Array.isArray(ex.attempts) && ex.attempts.length > 0)
      || (isObj(fl) && Object.values(fl).some((c) => c && c.seen > 0))
      || some((raw.lab || {}).done) || some((raw.wlc || {}).done)
      || ((app.drill || {}).best > 0) || ((app.quiz || {}).best != null);
  }
  const objKey = (o) => String(o || '').split('.').map((x) => Number(x) || 0);
  function firstOpenLesson(raw) {
    const done = ((raw && raw.lessons) || {}).done || {};
    return (TT.lessons || []).slice().sort((a, b) => { const x = objKey(a.obj); const y = objKey(b.obj); return x[0] - y[0] || x[1] - y[1]; }).find((l) => !done[l.id]) || null;
  }
  /** TT.plan.tonight() is owned by plan.js. Accept a string href or an object with href/link/url. */
  function planTonight() {
    try {
      if (!TT.plan || typeof TT.plan.tonight !== 'function') return null;
      const t = TT.plan.tonight();
      if (!t) return null;
      if (typeof t === 'string') return { href: t, title: 'Tonight\'s assignment' };
      const href = t.href || t.link || t.url;
      if (!href) return null;
      return { href: String(href).startsWith('#') ? href : '#' + href, title: t.title || t.label || t.name || 'Tonight\'s assignment', line: t.line || t.text || t.detail || t.summary || (t.isToday === false && t.date ? 'Next shift: ' + t.date : '') };
    } catch (e) { return null; }
  }
  /** Where "Clock in" goes: tonight's plan, else the first unfinished lesson, else the ticket queue. */
  function clockIn(raw) {
    const p = planTonight();
    if (p) return { href: p.href, why: p.title };
    const l = firstOpenLesson(raw);
    if (l) return { href: '#learn-' + l.id, why: `Lesson ${l.obj}: ${l.title}` };
    return { href: '#tickets', why: 'The ticket queue' };
  }
  function careerInfo(raw) {
    const C = TT.career;
    if (!C || typeof C.compute !== 'function' || typeof C.normalize !== 'function') return null;
    try {
      const state = C.normalize(raw);
      const res = C.compute(state);
      const next = typeof C.nextTask === 'function' ? C.nextTask(state) : null;
      return { rank: res.rank && res.rank.name, xp: res.xp, streak: res.counts && res.counts.streak, next };
    } catch (e) { return null; }
  }

  /* ================= the illustration ================= */
  // Deterministic scatter so the skyline and the stars are the same on every visit.
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  function heroSvg() {
    const R = rng(2026);
    // --- stars
    let stars = '';
    for (let i = 0; i < 46; i++) {
      const x = 474 + R() * 528; const y = 50 + Math.pow(R(), 1.6) * 110; const r = 0.5 + R() * 0.9;
      if (Math.hypot(x - 566, y - 100) < 44) continue;
      stars += `<circle class="${i % 5 === 0 ? 'hx-tw' : ''}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" style="animation-delay:-${f1(R() * 6)}s" opacity="${f1(0.35 + R() * 0.5)}"/>`;
    }
    // --- skyline: far haze layer, then the near layer with landmarks and lit windows
    const HZ = 242; // the waterline: we are a few floors up, looking down at the harbor
    const UP = 62; // the skyline was drawn for a lower waterline; lift it by this much
    let far = `M470 ${HZ}`;
    for (let x = 470; x < 1008;) { const w = 14 + R() * 26; const h = 18 + R() * 40; far += `V${f1(HZ - h)}H${f1(Math.min(1008, x + w))}`; x += w; }
    far += `V${HZ}Z`;
    // near buildings: [x, width, top, kind]
    const near = [
      [470, 30, 232], [500, 26, 238],
      [526, 20, 196, 'clock'], [548, 36, 226], [586, 30, 244], [616, 44, 172, 'stepped'], [662, 30, 208],
      [694, 46, 192, 'pent'], [742, 26, 230], [768, 34, 214], [804, 24, 248], [828, 40, 262],
    ];
    let nearPath = '';
    let wins = '';
    let refl = '';
    const lit = (x, y, w, h, warm) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${warm ? '#ffd38a' : '#a9d0ff'}" opacity="${f1(0.35 + R() * 0.55)}"/>`;
    for (const [x, w, top0, kind] of near) {
      const top = top0 - UP;
      if (kind === 'stepped') {
        nearPath += `M${x} ${HZ}V${top + 30}H${x + 4}V${top + 14}H${x + 9}V${top}H${x + w - 9}V${top + 14}H${x + w - 4}V${top + 30}H${x + w}V${HZ}Z`;
        nearPath += `M${x + w / 2 - 0.8} ${top}V${top - 18}h1.6V${top}Z`;
      } else if (kind === 'pent') {
        nearPath += `M${x} ${HZ}V${top + 8}L${x + w / 2} ${top - 6}L${x + w} ${top + 8}V${HZ}Z`;
      } else if (kind === 'clock') {
        nearPath += `M${x} ${HZ}V${top + 26}H${x + 3}V${top + 8}L${x + w / 2} ${top - 10}L${x + w - 3} ${top + 8}V${top + 26}H${x + w}V${HZ}Z`;
      } else {
        nearPath += `M${x} ${HZ}V${top}H${x + w}V${HZ}Z`;
      }
      // window grid, sparsely lit
      const cols = Math.max(2, Math.floor((w - 6) / 6));
      const startY = top + (kind === 'stepped' ? 34 : kind === 'clock' ? 32 : 8);
      for (let yy = startY; yy < HZ - 6; yy += 7) {
        for (let c = 0; c < cols; c++) {
          if (R() < 0.27) wins += lit(x + 4 + c * ((w - 8) / cols), yy, 2.6, 3.2, R() < 0.72);
        }
      }
      // reflection columns under the brighter towers
      // its reflection: a column of ripples that thins out toward the glass
      const rows = 5 + Math.floor(R() * 6);
      for (let k = 0; k < rows; k++) {
        const ww = (w - 6) * (0.35 + R() * 0.55);
        const xx = x + 3 + R() * (w - 6 - ww);
        refl += `<rect class="hx-dash" x="${f1(xx)}" y="${f1(HZ + 2.5 + k * 4.2)}" width="${f1(ww)}" height="1.6" rx=".8" fill="${R() < 0.7 ? '#ffcf86' : '#9cc8ff'}" opacity="${f1((0.5 - k * 0.045) * (0.6 + R() * 0.4))}" style="animation-delay:-${f1(R() * 6)}s;animation-duration:${f1(3.5 + R() * 3)}s"/>`;
      }
    }
    // the clock face on the clock tower, and a red light on the stepped tower's mast
    const clock = '<circle cx="536" cy="216" r="4.2" fill="#f6e2a8" opacity=".9"/><path d="M536 216v-2.6M536 216l1.8 1" stroke="#3a2c14" stroke-width=".8"/>';
    // water-taxi and harbor lights shimmer as broken horizontal dashes
    let dashes = '';
    for (let i = 0; i < 34; i++) {
      const y = HZ + 4 + Math.pow(R(), 1.3) * 140; const x = 474 + R() * 528; const w = 6 + R() * 26;
      dashes += `<rect class="hx-dash" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="1.3" rx=".6" fill="${R() < 0.6 ? '#ffcf86' : '#8fc2ff'}" style="animation-delay:-${f1(R() * 6)}s;animation-duration:${f1(4 + R() * 4)}s" opacity="${f1(0.18 + R() * 0.35)}"/>`;
    }
    // --- rack LEDs
    let rackUnits = '';
    let leds = '';
    const RX = 1046; const RW = 116;
    const units = [
      ['patch', 84, 12], ['switch', 100, 16], ['switch', 120, 16], ['blank', 140, 8], ['router', 152, 18],
      ['server', 176, 22], ['server', 202, 22], ['server', 228, 22], ['blank', 254, 10], ['storage', 268, 34],
      ['server', 306, 22], ['ups', 334, 40], ['blank', 378, 12],
    ];
    const ledColor = ['#4fd394', '#4fd394', '#4fd394', '#6fb6ff', '#f4b648'];
    for (const [kind, y, h] of units) {
      rackUnits += `<rect x="${RX}" y="${y}" width="${RW}" height="${h - 2}" rx="1.5" fill="${kind === 'blank' ? '#0a101b' : '#141d2e'}" stroke="#1f2b40" stroke-width=".8"/>`;
      if (kind === 'patch' || kind === 'switch') {
        for (let p = 0; p < 16; p++) {
          const px = RX + 8 + p * 6.2;
          rackUnits += `<rect x="${f1(px)}" y="${y + 3}" width="4.4" height="${kind === 'patch' ? 5 : 4}" rx=".6" fill="#05080f"/>`;
          if (kind === 'switch' && R() < 0.8) leds += `<circle class="hx-led ${R() < 0.5 ? 'fast' : ''}" cx="${f1(px + 2.2)}" cy="${y + 11}" r="1.1" fill="${R() < 0.9 ? '#4fd394' : '#f4b648'}" style="animation-delay:-${f1(R() * 3)}s"/>`;
        }
      } else if (kind === 'server' || kind === 'router') {
        for (let b = 0; b < 5; b++) rackUnits += `<rect x="${RX + 8 + b * 13}" y="${y + 4}" width="11" height="${h - 10}" rx="1" fill="#0d1422" stroke="#223049" stroke-width=".6"/>`;
        for (let l = 0; l < 3; l++) leds += `<circle class="hx-led${l === 0 ? ' slow' : ''}" cx="${RX + RW - 26 + l * 7}" cy="${y + h / 2 - 1}" r="1.5" fill="${ledColor[Math.floor(R() * ledColor.length)]}" style="animation-delay:-${f1(R() * 4)}s"/>`;
        rackUnits += `<path d="M${RX + 76} ${y + 5}v${h - 12}M${RX + 80} ${y + 5}v${h - 12}M${RX + 84} ${y + 5}v${h - 12}" stroke="#0a0f19" stroke-width="1.4"/>`;
      } else if (kind === 'storage') {
        for (let b = 0; b < 8; b++) { rackUnits += `<rect x="${RX + 6 + b * 13.4}" y="${y + 4}" width="11.4" height="${h - 10}" rx="1" fill="#0d1422" stroke="#223049" stroke-width=".6"/>`; leds += `<circle class="hx-led fast" cx="${f1(RX + 11.7 + b * 13.4)}" cy="${y + h - 9}" r="1.1" fill="#6fb6ff" style="animation-delay:-${f1(R() * 2)}s"/>`; }
      } else if (kind === 'ups') {
        rackUnits += `<rect x="${RX + 10}" y="${y + 8}" width="30" height="12" rx="1.5" fill="#09202a"/><text x="${RX + 25}" y="${y + 17}" text-anchor="middle" font-family="monospace" font-size="7" fill="#58e0a8">98%</text>`;
        leds += `<circle class="hx-led slow" cx="${RX + 50}" cy="${y + 14}" r="1.6" fill="#4fd394"/>`;
        rackUnits += `<path d="M${RX + 64} ${y + 8}h40M${RX + 64} ${y + 14}h40M${RX + 64} ${y + 20}h40M${RX + 64} ${y + 26}h40" stroke="#0a0f19" stroke-width="2"/>`;
      }
    }

    return `<svg class="hx" viewBox="0 0 1200 600" preserveAspectRatio="xMaxYMid slice" role="img" aria-labelledby="hx-t hx-d" xmlns="http://www.w3.org/2000/svg">
  <title id="hx-t">The night shift at Harbor Point Logistics</title>
  <desc id="hx-d">Two in the morning at the network operations desk, seen from behind an empty chair. Three monitors glow with a network map, a Cisco terminal and an alert board. A server rack blinks beside the desk. Through the window, the Baltimore Inner Harbor at night: a moonlit skyline, a container crane at the port and city lights on the water. On the desk: a lamp, a cold coffee mug marked HPL, sticky notes reading VLAN 99? and show ip route, and a pager.</desc>
  <defs>
    <linearGradient id="hx-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b15"/><stop offset=".62" stop-color="#0b1222"/><stop offset="1" stop-color="#070a12"/></linearGradient>
    <radialGradient id="hx-wallglow" cx="0.6" cy="0.62" r="0.55"><stop offset="0" stop-color="#2d5fb0" stop-opacity=".30"/><stop offset=".55" stop-color="#1b3a73" stop-opacity=".12"/><stop offset="1" stop-color="#0b1222" stop-opacity="0"/></radialGradient>
    <linearGradient id="hx-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050918"/><stop offset=".45" stop-color="#0c1635"/><stop offset=".78" stop-color="#1c2650"/><stop offset="1" stop-color="#3a2e55"/></linearGradient>
    <radialGradient id="hx-cityglow" cx=".45" cy="1" r=".7"><stop offset="0" stop-color="#ff9a6a" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a6a" stop-opacity="0"/></radialGradient>
    <radialGradient id="hx-moonhalo"><stop offset="0" stop-color="#f4ecd6" stop-opacity=".30"/><stop offset=".35" stop-color="#c9d6ff" stop-opacity=".10"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="hx-moon" cx=".4" cy=".38" r=".7"><stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#efe5cc"/><stop offset="1" stop-color="#d6c9a8"/></radialGradient>
    <linearGradient id="hx-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#142048"/><stop offset=".25" stop-color="#0b1431"/><stop offset="1" stop-color="#050a19"/></linearGradient>
    <linearGradient id="hx-ref" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcc80" stop-opacity=".5"/><stop offset="1" stop-color="#ffcc80" stop-opacity="0"/></linearGradient>
    <linearGradient id="hx-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bcd4ff" stop-opacity=".07"/><stop offset=".3" stop-color="#bcd4ff" stop-opacity="0"/><stop offset=".55" stop-color="#bcd4ff" stop-opacity=".045"/><stop offset=".62" stop-color="#bcd4ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="hx-frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2438"/><stop offset="1" stop-color="#121a2b"/></linearGradient>
    <linearGradient id="hx-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2538"/><stop offset=".25" stop-color="#121a29"/><stop offset="1" stop-color="#0a0f19"/></linearGradient>
    <radialGradient id="hx-deskglow" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#4f8de8" stop-opacity=".42"/><stop offset=".5" stop-color="#2f5fae" stop-opacity=".14"/><stop offset="1" stop-color="#2f5fae" stop-opacity="0"/></radialGradient>
    <radialGradient id="hx-lamppool"><stop offset="0" stop-color="#ffd28c" stop-opacity=".62"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".22"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
    <linearGradient id="hx-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".22"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></linearGradient>
    <linearGradient id="hx-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2140"/><stop offset="1" stop-color="#071223"/></linearGradient>
    <linearGradient id="hx-term" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06131a"/><stop offset="1" stop-color="#040b10"/></linearGradient>
    <radialGradient id="hx-screenglow" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#5aa0ff" stop-opacity=".35"/><stop offset="1" stop-color="#5aa0ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="hx-chair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a2a"/><stop offset=".35" stop-color="#090d16"/><stop offset="1" stop-color="#05070c"/></linearGradient>
    <linearGradient id="hx-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2ff" stop-opacity=".85"/><stop offset=".3" stop-color="#7fb2ff" stop-opacity=".15"/><stop offset="1" stop-color="#7fb2ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="hx-mug" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc6b6"/><stop offset=".45" stop-color="#f3ecdf"/><stop offset="1" stop-color="#9d958a"/></linearGradient>
    <linearGradient id="hx-rack" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d1320"/><stop offset=".5" stop-color="#111a2a"/><stop offset="1" stop-color="#0a0f1a"/></linearGradient>
    <linearGradient id="hx-panelfade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05080f" stop-opacity=".9"/><stop offset="1" stop-color="#05080f" stop-opacity="0"/></linearGradient>
    <radialGradient id="hx-vig" cx=".62" cy=".48" r=".78"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <radialGradient id="hx-pagerglow"><stop offset="0" stop-color="#b6f08a" stop-opacity=".55"/><stop offset="1" stop-color="#b6f08a" stop-opacity="0"/></radialGradient>
    <clipPath id="hx-glassclip"><rect x="470" y="44" width="536" height="352"/></clipPath>
    <clipPath id="hx-scrL"><path d="M494 297L636 290V390L494 386Z"/></clipPath>
    <clipPath id="hx-scrC"><rect x="652" y="288" width="150" height="100" rx="1"/></clipPath>
    <clipPath id="hx-scrR"><path d="M818 290L960 297V386L818 390Z"/></clipPath>
    <filter id="hx-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="hx-cloud" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="3 2.2"/></filter>
    <filter id="hx-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
  </defs>

  <!-- room -->
  <rect width="1200" height="600" fill="url(#hx-wall)"/>
  <rect width="1200" height="600" fill="url(#hx-wallglow)"/>
  <!-- ceiling cable tray -->
  <path d="M0 18H1200" stroke="#121a2a" stroke-width="10"/>
  <path d="M0 24H1200" stroke="#0e1522" stroke-width="2"/>
  <path d="M1080 24C1080 40 1092 46 1092 62M1104 24C1104 44 1118 48 1118 62" stroke="#1a2a44" stroke-width="2.2" fill="none"/>
  <!-- wall panels, lit from the right by the screens -->
  <g stroke="#111a2b" stroke-width="2" opacity=".8"><path d="M120 40V600M260 40V600M400 40V600"/></g>
  <rect x="0" y="40" width="460" height="560" fill="url(#hx-panelfade)"/>
  <!-- the window -->
  <rect x="458" y="32" width="560" height="376" rx="4" fill="url(#hx-frame)"/>
  <g clip-path="url(#hx-glassclip)">
    <rect x="470" y="44" width="536" height="352" fill="url(#hx-sky)"/>
    <rect x="470" y="150" width="536" height="160" fill="url(#hx-cityglow)"/>
    <g fill="#e6ecff">${stars}</g>
    <circle cx="566" cy="100" r="90" fill="url(#hx-moonhalo)"/>
    <circle cx="566" cy="100" r="21" fill="url(#hx-moon)"/>
    <g fill="#cbbf9f" opacity=".45"><circle cx="559" cy="94" r="4"/><circle cx="573" cy="108" r="3"/><circle cx="570" cy="91" r="1.8"/><circle cx="557" cy="108" r="2.2"/></g>
    <!-- thin clouds drifting past the moon -->
    <g fill="#24305e" filter="url(#hx-cloud)" opacity=".75">
      <ellipse cx="540" cy="128" rx="70" ry="5"/><ellipse cx="610" cy="122" rx="46" ry="4"/><ellipse cx="760" cy="96" rx="80" ry="4.5"/><ellipse cx="930" cy="118" rx="60" ry="4"/>
    </g>
    <path fill="#1a2550" opacity=".85" d="${far}"/>
    <path fill="#0e1631" d="${nearPath}"/>
    <g>${wins}</g>
    <g transform="translate(0 -${UP})">${clock}<circle class="hx-beacon" cx="638" cy="154" r="2.2" fill="#ff5a4f"/></g>
    <!-- the port: a ship-to-shore container crane, a box ship and stacked containers -->
    <g transform="translate(0 -${UP})">
      <path d="M856 304V282H1006V304Z" fill="#0b1229"/>
      <g opacity=".95">
        <rect x="944" y="262" width="20" height="9" fill="#5b2a2a"/><rect x="965" y="262" width="20" height="9" fill="#1f4a5a"/><rect x="986" y="262" width="20" height="9" fill="#5e4a24"/>
        <rect x="944" y="272" width="20" height="9" fill="#26385e"/><rect x="965" y="272" width="20" height="9" fill="#5b2a2a"/><rect x="986" y="272" width="20" height="9" fill="#1f4a5a"/>
        <rect x="954" y="253" width="20" height="8" fill="#3d2a4a"/><rect x="975" y="253" width="20" height="8" fill="#26385e"/>
      </g>
      <g fill="none" stroke="#1c2a52" stroke-width="4" stroke-linejoin="round">
        <path d="M880 304V196M928 304V196M880 236H928M880 270H928M880 236L928 270M928 236L880 270"/>
        <path d="M872 196H1006M842 182L872 196M904 196V150M904 150L842 182M904 150L1006 188"/>
      </g>
      <path d="M842 182H1006" stroke="#25366a" stroke-width="3"/>
      <rect x="896" y="200" width="16" height="10" fill="#1c2a52"/>
      <path d="M960 196v38" stroke="#2a3b72" stroke-width="1.2"/>
      <rect x="952" y="232" width="16" height="8" fill="#6a4b25"/>
      <circle class="hx-beacon" cx="904" cy="148" r="2.4" fill="#ff5a4f"/>
      <circle class="hx-beacon b2" cx="1004" cy="187" r="1.8" fill="#ff5a4f"/>
      <!-- the box ship -->
      <path d="M836 290H950L940 304H846Z" fill="#090f24"/>
      <rect x="842" y="280" width="16" height="10" fill="#0c1430"/><rect x="845" y="283" width="3" height="2" fill="#ffd38a" opacity=".8"/><rect x="851" y="283" width="3" height="2" fill="#ffd38a" opacity=".6"/>
      <g opacity=".8"><rect x="862" y="282" width="14" height="8" fill="#3a2440"/><rect x="877" y="282" width="14" height="8" fill="#203a52"/><rect x="892" y="282" width="14" height="8" fill="#4a3a20"/><rect x="907" y="282" width="14" height="8" fill="#3a2440"/><rect x="922" y="282" width="14" height="8" fill="#203a52"/></g>
    </g>
    <!-- the harbor -->
    <rect x="470" y="${HZ}" width="536" height="${396 - HZ}" fill="url(#hx-water)"/>
    <path d="M470 ${HZ}H1006" stroke="#6b5a86" stroke-width=".8" opacity=".5"/>
    <g>${refl}</g>
    <g class="hx-moonref" fill="#f4ecd6">${[0, 1, 2, 3, 4, 5, 6].map((k) => `<rect class="hx-dash" x="${f1(566 - (11 - k) * (0.6 + R() * 0.5))}" y="${HZ + 3 + k * 4}" width="${f1((11 - k) * 2 * (0.6 + R() * 0.5))}" height="1.5" rx=".75" opacity="${f1(0.42 - k * 0.05)}" style="animation-delay:-${f1(R() * 4)}s"/>`).join('')}</g>
    <g>${dashes}</g>
    <!-- a water taxi crossing the harbor -->
    <g class="hx-taxi"><path d="M0 0h18l-3 4H3Z" fill="#0a1024"/><rect x="5" y="-4" width="7" height="4" fill="#0f1835"/><circle cx="16" cy="-1" r="1.1" fill="#9effc8"/><circle cx="2" cy="-1" r="1.1" fill="#ff7a6a"/></g>
    <rect x="470" y="44" width="536" height="352" fill="url(#hx-glass)"/>
    <!-- the room's glow, faintly reflected in the glass -->
    <ellipse cx="725" cy="300" rx="190" ry="60" fill="#4f8de8" opacity=".06" filter="url(#hx-blur)"/>
  </g>
  <!-- mullions, sill -->
  <path d="M649 44V396M827 44V396" stroke="url(#hx-frame)" stroke-width="7"/>
  <path d="M649 44V396M827 44V396" stroke="#26324a" stroke-width="1" transform="translate(-3 0)" opacity=".7"/>
  <rect x="450" y="402" width="576" height="10" rx="2" fill="#1a2438"/>
  <path d="M452 402H1024" stroke="#2c3b56" stroke-width="1.2"/>

  <!-- the server rack -->
  <g>
    <rect x="1032" y="62" width="144" height="376" rx="4" fill="url(#hx-rack)" stroke="#1c273b" stroke-width="2"/>
    <rect x="1040" y="70" width="128" height="360" fill="#070b13"/>
    <path d="M1043 74V428M1165 74V428" stroke="#1a2436" stroke-width="2" stroke-dasharray="1.5 4"/>
    <text x="1104" y="80" text-anchor="middle" font-family="monospace" font-size="6.5" fill="#4a5c78" letter-spacing="1">HPL-DC RACK 02</text>
    ${rackUnits}
    <g>${leds}</g>
    <!-- patch cords dropping out of the patch panel -->
    <path d="M1060 96c-4 30 6 40 2 70M1078 96c0 24 10 30 8 54M1110 96c4 22-4 30 0 48M1140 96c6 26 0 40 10 60" stroke="#2f6fd0" stroke-width="1.6" fill="none" opacity=".75"/>
    <path d="M1092 96c2 18 12 22 10 40M1128 96c-2 20 6 24 4 44" stroke="#d29a2a" stroke-width="1.6" fill="none" opacity=".7"/>
    <ellipse cx="1104" cy="250" rx="70" ry="170" fill="#4fd394" opacity=".035" filter="url(#hx-blur)"/>
  </g>

  <!-- the desk -->
  <path d="M300 430H1200V600H230Z" fill="url(#hx-desk)"/>
  <path d="M300 430H1200" stroke="#33466a" stroke-width="1.5"/>
  <ellipse cx="746" cy="430" rx="340" ry="92" fill="url(#hx-deskglow)"/>
  <ellipse cx="930" cy="506" rx="150" ry="50" fill="url(#hx-lamppool)"/>

  <g transform="translate(746 432) scale(1.1) translate(-726 -432)">
  <!-- monitors: stands first, then the screens -->
  <g fill="#0b111c">
    <path d="M556 386l-4 40h16l-4-40Z"/><ellipse cx="560" cy="430" rx="30" ry="5"/>
    <rect x="716" y="388" width="20" height="38"/><ellipse cx="726" cy="430" rx="36" ry="6"/>
    <path d="M888 386l4 40h-16l4-40Z"/><ellipse cx="884" cy="430" rx="30" ry="5"/>
  </g>
  <ellipse cx="726" cy="340" rx="270" ry="70" fill="url(#hx-screenglow)" filter="url(#hx-blur)"/>
  <!-- left: the network map -->
  <path d="M488 292L642 284V396L488 392Z" fill="#05080e" stroke="#1d2a40" stroke-width="1.2"/>
  <g clip-path="url(#hx-scrL)">
    <rect x="490" y="286" width="150" height="106" fill="url(#hx-screen)"/>
    <text x="500" y="303" font-family="monospace" font-size="6" fill="#7fa8d8" letter-spacing=".6">TOPOLOGY · HPL-CORE</text>
    <g stroke="#3f86e8" stroke-width="1.3" opacity=".9" fill="none">
      <path id="hx-link1" d="M565 318L520 348M565 318L612 346M520 348L612 346M520 348L512 374M612 346L620 372M565 318V300"/>
    </g>
    <path d="M612 346L620 372" stroke="#ff6f63" stroke-width="1.4" stroke-dasharray="3 2"/>
    <circle class="hx-pkt" r="2.1" fill="#bfe3ff"/>
    <g fill="#0d2140" stroke="#8cc8ff" stroke-width="1.3">
      <circle cx="565" cy="318" r="6.5"/><rect x="511" y="342" width="18" height="11" rx="2"/><rect x="603" y="341" width="18" height="11" rx="2"/>
      <rect x="506" y="370" width="12" height="9" rx="1.5"/>
    </g>
    <rect x="614" y="368" width="12" height="9" rx="1.5" fill="#2a0f12" stroke="#ff6f63" stroke-width="1.3"/>
    <text x="628" y="365" font-family="monospace" font-size="5.5" fill="#ff8f85" text-anchor="end">DOWN</text>
  </g>
  <!-- centre: the terminal -->
  <rect x="646" y="282" width="162" height="112" rx="3" fill="#05080e" stroke="#1d2a40" stroke-width="1.2"/>
  <g clip-path="url(#hx-scrC)" font-family="monospace" font-size="6.4">
    <rect x="652" y="288" width="150" height="100" fill="url(#hx-term)"/>
    <text x="657" y="299" fill="#f4b648">HPL-EDGE#<tspan fill="#d8e3ec">show ip ospf neighbor</tspan></text>
    <text x="657" y="309" fill="#7f93a6">Neighbor ID  Pri  State    Intf</text>
    <text x="657" y="318" fill="#8ff0b8">10.0.0.2       1  FULL/DR  Gi0/0</text>
    <text x="657" y="327" fill="#8ff0b8">10.0.0.3       1  FULL/BDR Gi0/0</text>
    <text x="657" y="339" fill="#f4b648">HPL-EDGE#<tspan fill="#d8e3ec">show ip route static</tspan></text>
    <text x="657" y="349" fill="#a9c9ec">S*  0.0.0.0/0 [1/0] via 203.0.113.1</text>
    <text x="657" y="361" fill="#f4b648">HPL-EDGE#<tspan fill="#d8e3ec">ping 10.40.0.10</tspan></text>
    <text x="657" y="371" fill="#8ff0b8">!!!!!  Success rate is 100 percent</text>
    <text x="657" y="383" fill="#f4b648">HPL-EDGE#</text>
    <rect class="hx-cursor" x="694" y="377" width="4" height="7" fill="#d8e3ec"/>
  </g>
  <!-- right: the alert board -->
  <path d="M812 284L966 292V392L812 396Z" fill="#05080e" stroke="#1d2a40" stroke-width="1.2"/>
  <g clip-path="url(#hx-scrR)" font-family="monospace" font-size="5.8">
    <rect x="814" y="286" width="150" height="108" fill="url(#hx-screen)"/>
    <text x="824" y="303" fill="#7fa8d8" letter-spacing=".6">ALERTS · NIGHT QUEUE</text>
    <rect class="hx-alert" x="822" y="308" width="128" height="11" rx="2" fill="#4a1418"/>
    <circle cx="828" cy="313.5" r="2" fill="#ff6f63"/>
    <text x="834" y="316" fill="#ffb3ab">P1  BR2 Gi0/1 down</text>
    <rect x="822" y="322" width="128" height="11" rx="2" fill="#3a2b0c"/>
    <circle cx="828" cy="327.5" r="2" fill="#f4b648"/>
    <text x="834" y="330" fill="#ffd38a">P3  DHCP pool 85%</text>
    <path d="M824 380l10-8 9 3 10-12 9 5 10-14 9 6 10-4 9-10 10 4 10-6" stroke="#4fd394" stroke-width="1.4" fill="none"/>
    <path d="M824 380l10-8 9 3 10-12 9 5 10-14 9 6 10-4 9-10 10 4 10-6V386H824Z" fill="#4fd394" opacity=".12"/>
    <text x="824" y="346" fill="#7f93a6">Gi0/0 util 5 min</text>
  </g>
  <!-- sticky notes -->
  <g transform="translate(478 272) rotate(-7)">
    <rect width="46" height="40" rx="1.5" fill="#f2cf55"/>
    <path d="M0 0h46v6H0z" fill="#e3bd3f"/>
    <text x="23" y="25" text-anchor="middle" font-family="'Segoe Print','Bradley Hand','Chalkboard SE','Marker Felt',system-ui,sans-serif" font-size="10" font-weight="700" fill="#3a2d0a">VLAN 99?</text>
  </g>
  <g transform="translate(926 352) rotate(6)">
    <rect width="50" height="42" rx="1.5" fill="#ff9fb4"/>
    <path d="M0 0h50v6H0z" fill="#f08aa2"/>
    <text x="25" y="21" text-anchor="middle" font-family="'Segoe Print','Bradley Hand','Chalkboard SE','Marker Felt',system-ui,sans-serif" font-size="9.5" font-weight="700" fill="#4a1426">show</text>
    <text x="25" y="33" text-anchor="middle" font-family="'Segoe Print','Bradley Hand','Chalkboard SE','Marker Felt',system-ui,sans-serif" font-size="9.5" font-weight="700" fill="#4a1426">ip route</text>
  </g>

  </g>

  <!-- the desk lamp, clamped at the right end of the desk, and its light -->
  <path d="M968 408L1004 514H850Z" fill="url(#hx-cone)" filter="url(#hx-soft)" opacity=".85"/>
  <g>
    <ellipse cx="1036" cy="503" rx="36" ry="9" fill="#05080e" opacity=".6"/>
    <ellipse cx="1036" cy="498" rx="32" ry="8" fill="#1b2334"/>
    <path d="M1006 498a30 7 0 0 0 60 0" stroke="#384764" stroke-width="1.2" fill="none"/>
    <path d="M1036 496L1062 440L990 400" stroke="#232d42" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M1036 496L1062 440L990 400" stroke="#4a5b7c" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(1.5 -1)"/>
    <circle cx="1062" cy="440" r="5" fill="#2b3650"/>
    <path d="M1004 384L950 402L966 430L1014 410Z" fill="#232d42"/>
    <path d="M1004 384L950 402" stroke="#56688c" stroke-width="1.5"/>
    <path d="M966 430L1014 410" stroke="#ffe2a8" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="990" cy="422" rx="26" ry="6" transform="rotate(-22 990 422)" fill="#ffe7b8" opacity=".5" filter="url(#hx-soft)"/>
  </g>
  <!-- the cold coffee -->
  <g transform="translate(900 458)">
    <ellipse cx="18" cy="38" rx="24" ry="6" fill="#000" opacity=".35"/>
    <path d="M2 10c-14 0-14 20 0 20" stroke="#bdb4a6" stroke-width="5" fill="none"/>
    <path d="M0 4h36v28a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="url(#hx-mug)"/>
    <ellipse cx="18" cy="4" rx="18" ry="4.5" fill="#e9e1d2"/>
    <ellipse cx="18" cy="5" rx="15" ry="3.2" fill="#3b2516"/>
    <ellipse cx="22" cy="4.4" rx="5" ry="1" fill="#6b4a33" opacity=".6"/>
    <text x="19" y="27" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="800" letter-spacing=".5" fill="#1d3a6e">HPL</text>
    <path d="M4 30h28" stroke="#b52f26" stroke-width="1.6"/>
  </g>
  <!-- a printed ticket, stamped P1 -->
  <g transform="translate(486 520) rotate(-6)">
    <rect width="78" height="54" rx="2" fill="#bfbab0"/>
    <path d="M8 12h40M8 20h58M8 28h52M8 36h46" stroke="#7a7569" stroke-width="2"/>
    <rect x="52" y="5" width="20" height="10" rx="2" fill="none" stroke="#a3332a" stroke-width="1.6"/>
    <text x="62" y="13" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7.5" font-weight="800" fill="#a3332a">P1</text>
  </g>
  <!-- the pager -->
  <g transform="translate(566 470) rotate(-9)">
    <g class="hx-pager">
      <circle class="hx-pglow" cx="24" cy="10" r="40" fill="url(#hx-pagerglow)"/>
      <ellipse cx="27" cy="31" rx="34" ry="6" fill="#000" opacity=".4"/>
      <rect width="58" height="30" rx="6" fill="#1c2230" stroke="#323c52" stroke-width="1.2"/>
      <rect x="4" y="4" width="36" height="15" rx="2" fill="#1f2b1c"/>
      <rect class="hx-lcd" x="4" y="4" width="36" height="15" rx="2" fill="#a9de7c"/>
      <text class="hx-pagetxt" x="22" y="15" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="700" fill="#18300f">PAGE</text>
      <rect x="45" y="6" width="9" height="5" rx="1.5" fill="#39455e"/><rect x="45" y="14" width="9" height="5" rx="1.5" fill="#39455e"/>
      <path d="M8 24h28" stroke="#2a3346" stroke-width="2" stroke-linecap="round"/>
      <circle class="hx-pled" cx="52" cy="25" r="1.8" fill="#ff5a4f"/>
    </g>
    <g class="hx-buzz" stroke="#b6f08a" stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M-6 6q-4 9 0 18M-11 3q-6 12 0 24M64 6q4 9 0 18M69 3q6 12 0 24"/>
    </g>
  </g>

  <!-- the empty chair, seen from behind -->
  <g transform="translate(20 0)">
    <ellipse cx="726" cy="598" rx="150" ry="16" fill="#000" opacity=".45"/>
    <path d="M640 600V560h172v40" fill="#06080e"/>
    <path d="M626 470c0-44 20-66 100-66s100 22 100 66v60c0 22-14 34-30 38H656c-16-4-30-16-30-38Z" fill="url(#hx-chair)"/>
    <path d="M626 470c0-44 20-66 100-66s100 22 100 66" fill="none" stroke="url(#hx-rim)" stroke-width="2.6"/>
    <path d="M650 470c0-30 16-46 76-46s76 16 76 46v52c0 16-10 24-22 26H672c-12-2-22-10-22-26Z" fill="none" stroke="#1a2438" stroke-width="1.5" opacity=".9"/>
    <g stroke="#121a29" stroke-width="1" opacity=".9"><path d="M660 450H792M656 474H796M656 498H796M660 522H792"/></g>
    <path d="M580 500c6-8 20-10 40-8M872 500c-6-8-20-10-40-8" stroke="#0a0e17" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M582 494c8-6 18-7 36-6M870 494c-8-6-18-7-36-6" stroke="#2a3a5a" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".8"/>
  </g>

  <rect width="1200" height="600" fill="url(#hx-vig)"/>
</svg>`;
  }

  /* ================= the landing page ================= */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const len = (x) => (Array.isArray(x) ? x.length : 0);

  function shiftStats() {
    let sets = 0;
    try { sets = typeof TT.examSets === 'function' ? TT.examSets().length : 0; } catch (e) { sets = 0; }
    return {
      training: [[len(TT.lessons), 'lessons'], [len(TT.scenes), 'animated scenes']],
      noc: [[len(TT.tickets), 'tickets'], [len(TT.labProjects), 'lab projects']],
      drills: [[len(TT.flashcards), 'flashcards'], [len(TT.flashDecks), 'decks']],
      cert: [[len(TT.questions), 'questions'], [sets, 'practice exams']],
      record: [[TT.career ? len(TT.career.RANKS) : 0, 'ranks'], [TT.career ? len(TT.career.BADGES) : 0, 'badges']],
    };
  }

  function welcomeHtml(raw) {
    if (!hasProgress(raw)) return '';
    const c = careerInfo(raw);
    const p = planTonight();
    const n = c && c.next;
    const l = firstOpenLesson(raw);
    // the same assignment Clock in opens: the plan's, else the next lesson, else what career.js would page
    const task = p ? { href: p.href, title: p.title, line: p.line || '' }
      : l ? { href: '#learn-' + l.id, title: `Lesson ${l.obj}`, line: l.title }
      : n ? { href: n.href, title: `${n.label}: ${n.title}`, line: n.line } : null;
    const greet = c && c.rank ? `Welcome back, ${esc(c.rank)}.` : 'Welcome back.';
    return `<p class="hm-welcome">${greet}${c && c.streak ? ` <span>${c.streak}-night streak</span>` : ''}</p>
      ${task ? `<a class="hm-pager" href="${esc(task.href)}">
        <span class="hm-pager-lcd"><span class="hm-pager-tag">TONIGHT</span><span class="hm-pager-msg">${esc(task.title)}</span>${task.line ? `<span class="hm-pager-line">${esc(task.line)}</span>` : ''}</span>
        <span class="hm-pager-go">Open <span aria-hidden="true">→</span></span></a>` : ''}`;
  }

  function renderHome(main, opts) {
    const raw = readAll();
    const go = clockIn(raw);
    const stats = shiftStats();
    main.innerHTML = `
      <div class="hm">
        <section class="hm-hero" aria-labelledby="hm-title">
          <div class="hm-art">${heroSvg()}</div>
          <div class="hm-copy">
            <p class="hm-kicker"><span class="live-dot" aria-hidden="true"></span><span>02:07 · Harbor Point Logistics<span class="hm-k2"> · Baltimore NOC</span></span></p>
            <h1 class="hm-title" id="hm-title">Trouble <span>Ticket</span></h1>
            <p class="hm-pitch">Work the night shift at Harbor Point. Fix real networks in a simulated Cisco CLI. Pass the CCNA.</p>
            <div class="hm-back" id="hm-back">${welcomeHtml(raw)}</div>
            <div class="hm-actions">
              <a class="hm-cta" id="hm-clockin" href="${esc(go.href)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>Clock in</a>
              <span class="hm-cta-why" id="hm-why">${esc(go.why)}</span>
            </div>
          </div>
        </section>

        <section class="hm-shift" aria-labelledby="hm-shift-h">
          <h2 id="hm-shift-h" class="hm-shift-h">What's on this shift</h2>
          <ul class="hm-rooms">
            ${ROOMS.map((r) => { const s = stats[r.id]; const [n1, l1] = s[0]; const [n2, l2] = s[1]; return `
            <li><a class="hm-room" href="${r.subs[0].href}">
              <span class="hm-room-ico">${icon(r.id)}</span>
              <span class="hm-room-name">${esc(r.name)}</span>
              <span class="hm-room-line">${esc(r.line)}</span>
              <span class="hm-room-num">${n1 ? `<span><b>${fmt(n1)}</b> ${esc(l1)}</span>` : ''}${n2 ? `<small>${fmt(n2)} ${esc(l2)}</small>` : ''}</span>
            </a></li>`; }).join('')}
          </ul>
          <p class="hm-foot">${icon('manual', 'hm-foot-ico')}<span>Stuck on a protocol? The <a href="#guide">Field Manual</a> in the header has ${len(TT.cards)} quick-reference cards and the port numbers to memorize.</span></p>
        </section>
      </div>`;
    // career.js and plan.js load after this file and after app.js routes for the first time:
    // fill in the greeting, the shift-record numbers and the Clock in target once they are there.
    if (!(opts && opts.late)) {
      G.setTimeout(() => {
        if (!main.querySelector('.hm')) return;
        const raw2 = readAll();
        const back = main.querySelector('#hm-back');
        if (back) back.innerHTML = welcomeHtml(raw2);
        const g2 = clockIn(raw2);
        const a = main.querySelector('#hm-clockin');
        if (a) a.setAttribute('href', g2.href);
        const why = main.querySelector('#hm-why');
        if (why) why.textContent = g2.why;
        const rec = main.querySelector('.hm-room[href="#progress"] .hm-room-num');
        const s = shiftStats().record;
        if (rec && s[0][0]) rec.innerHTML = `<span><b>${fmt(s[0][0])}</b> ${esc(s[0][1])}</span><small>${fmt(s[1][0])} ${esc(s[1][1])}</small>`;
      }, 0);
    }
  }

  TT.renderHome = renderHome;
  TT.homeHero = heroSvg;
  TT.home = { hasProgress, clockIn, firstOpenLesson, planTonight };
})(globalThis);
