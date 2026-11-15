/* Trouble Ticket — "Watch it happen" concept scene player (prefix sc-).
 *
 * TT.renderScene(el, scene, opts?)  draws an animated scene into el and returns a controller
 *                                   { play, pause, go(i), restart, destroy }.
 * TT.validateScene(scene)           returns a list of problems (empty = valid). Pure, runs in Node.
 * TT.sceneThumb(scene)              a small static SVG preview (string) for galleries.
 * TT.scenesFor(lessonId)            the scenes that embed in a lesson.
 *
 * Scene data lives in scenes-1.js / scenes-2.js (see /home/claude/scene_format.md for the format).
 * Backward-compatible extensions this player understands (all optional):
 *   scene.zones: [{ id?, label, x, y, w, h, tone? }]    dashed boxes drawn behind actors ("Hypervisor host").
 *   packet.via: 'L2' | ['L1','L2',null]                 which link to use per hop (for parallel links).
 *   packet.labels: ['untagged','VID 10','untagged']     a different label per hop (tags added/removed, NAT).
 *   packet/flood.delay: ms                              start later inside the step (scaled by speed).
 *   any action .when: 'start' | 'end'                   force the reveal phase (default: travel first, then
 *                                                       badges/tables/labels/drops/notes appear).
 *   badge/highlight/note target 'SW1:L2'                a port (the end of link L2 at SW1), like state.
 *   table.side / note.side: 'left'|'right'|'top'|'bottom'  which side of the actor the pop-out sits on.
 *   A drop whose `at` lies on a packet's route in the same step stops that packet there (it shakes and fades).
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.scenes = TT.scenes || [];

  const ACTOR_KINDS = ['router', 'switch', 'l3switch', 'pc', 'laptop', 'server', 'phone', 'ap', 'wlc', 'firewall', 'cloud', 'controller', 'printer'];
  const LINK_KINDS = ['eth', 'trunk', 'fiber', 'wifi', 'serial', 'tunnel', 'api'];
  const TONES = ['accent', 'good', 'warn', 'stamp', 'muted'];
  const SHAPES = ['frame', 'packet', 'segment', 'hello', 'wave'];
  const STATES = ['up', 'down', 'blocked', 'err', 'normal'];
  const ACTIONS = ['packet', 'flood', 'drop', 'highlight', 'state', 'badge', 'table', 'label', 'note', 'add', 'remove'];
  const SIDES = ['left', 'right', 'top', 'bottom'];
  TT.sceneFormat = { actorKinds: ACTOR_KINDS, linkKinds: LINK_KINDS, tones: TONES, shapes: SHAPES, states: STATES, actions: ACTIONS, sides: SIDES };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Caption markup: **bold** and `code`; everything else escaped. */
  function md(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const isStr = (s) => typeof s === 'string' && s.trim().length > 0;
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

  /* =====================================================================
   * Model: present actors, links, routing between actors
   * ===================================================================== */
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  function parsePort(t) {
    const k = String(t).indexOf(':');
    return k > 0 ? { actor: t.slice(0, k), link: t.slice(k + 1) } : null;
  }
  function linksBetween(links, a, b, present) {
    return links.filter((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && (!present || (present.has(l.a) && present.has(l.b))));
  }
  /** Shortest hop route a..b over links whose ends are both present. */
  function bfs(links, present, a, b) {
    if (a === b) return [a];
    const adj = {};
    for (const l of links) {
      if (present && !(present.has(l.a) && present.has(l.b))) continue;
      (adj[l.a] = adj[l.a] || []).push(l.b);
      (adj[l.b] = adj[l.b] || []).push(l.a);
    }
    const prev = { [a]: null };
    const q = [a];
    while (q.length) {
      const u = q.shift();
      for (const v of adj[u] || []) {
        if (v in prev) continue;
        prev[v] = u;
        if (v === b) {
          const route = [b];
          let x = u;
          while (x !== null) { route.unshift(x); x = prev[x]; }
          return route;
        }
        q.push(v);
      }
    }
    return null;
  }

  /* =====================================================================
   * Validation (pure)
   * ===================================================================== */
  function validateScene(sc) {
    const P = [];
    if (!sc || typeof sc !== 'object') return ['scene is not an object'];
    const name = isStr(sc.id) ? sc.id : '(no id)';
    const bad = (m) => P.push(name + ': ' + m);
    if (!isStr(sc.id) || !/^sc-[a-z0-9][a-z0-9-]*$/.test(sc.id)) bad('id must look like sc-something (lowercase, digits, hyphens)');
    if (!isStr(sc.lesson) || !/^l\d+-\d+$/.test(sc.lesson)) bad('lesson must be a lesson id like l1-6');
    if (!isStr(sc.obj) || !/^[1-6]\.\d{1,2}$/.test(sc.obj)) bad('obj must be a blueprint objective like 1.6');
    if (isStr(sc.lesson) && isStr(sc.obj) && sc.lesson.slice(1).split('-')[0] !== sc.obj.split('.')[0]) bad('lesson ' + sc.lesson + ' is in a different domain from obj ' + sc.obj);
    for (const f of ['title', 'summary', 'takeaway']) if (!isStr(sc[f])) bad(f + ' is required');
    const st = sc.stage || {};
    if (st.w !== 720) bad('stage.w must be 720');
    if (!isNum(st.h) || st.h < 240 || st.h > 380) bad('stage.h must be 240-380');
    const W = st.w || 720;
    const H = st.h || 320;

    const all = {};
    const checkActor = (a, where) => {
      if (!a || typeof a !== 'object') { bad(where + ': actor is not an object'); return false; }
      if (!isStr(a.id)) { bad(where + ': actor needs an id'); return false; }
      if (all[a.id]) { bad('actor id ' + a.id + ' is used twice'); return false; }
      if (a.id.indexOf(':') >= 0) bad('actor id ' + a.id + ' may not contain ":"');
      if (!ACTOR_KINDS.includes(a.kind)) bad('actor ' + a.id + ' has unknown kind ' + a.kind);
      if (!isNum(a.x) || !isNum(a.y) || a.x < 30 || a.x > W - 30 || a.y < 30 || a.y > H - 30) bad('actor ' + a.id + ' must sit inside the stage (30 units from each edge)');
      if (!isStr(a.label)) bad('actor ' + a.id + ' needs a label');
      if (a.sub != null && typeof a.sub !== 'string') bad('actor ' + a.id + ' sub must be a string');
      all[a.id] = a;
      return true;
    };
    if (!Array.isArray(sc.actors) || !sc.actors.length) bad('actors must be a non-empty array');
    const initial = (sc.actors || []).filter((a, i) => checkActor(a, 'actors[' + i + ']'));
    const steps = Array.isArray(sc.steps) ? sc.steps : [];
    // Actors that appear later through `add`.
    steps.forEach((s, i) => (s && Array.isArray(s.actions) ? s.actions : []).forEach((a) => { if (a && a.do === 'add') checkActor(a.actor, 'step ' + (i + 1) + ' add'); }));

    const links = Array.isArray(sc.links) ? sc.links : [];
    if (!Array.isArray(sc.links)) bad('links must be an array');
    const linkIds = {};
    for (const l of links) {
      if (!l || !isStr(l.id)) { bad('a link needs an id'); continue; }
      if (linkIds[l.id] || all[l.id]) bad('id ' + l.id + ' is used twice (links and actors share one id space)');
      linkIds[l.id] = l;
      if (!all[l.a] || !all[l.b]) bad('link ' + l.id + ' joins unknown actors ' + l.a + ' and ' + l.b);
      if (l.a === l.b) bad('link ' + l.id + ' joins an actor to itself');
      if (!LINK_KINDS.includes(l.kind)) bad('link ' + l.id + ' has unknown kind ' + l.kind);
      if (l.label != null && typeof l.label !== 'string') bad('link ' + l.id + ' label must be a string');
    }
    if (sc.zones != null) {
      if (!Array.isArray(sc.zones)) bad('zones must be an array');
      else sc.zones.forEach((z, i) => { if (!z || !isNum(z.x) || !isNum(z.y) || !isNum(z.w) || !isNum(z.h)) bad('zones[' + i + '] needs x, y, w, h'); if (z && z.tone && !TONES.includes(z.tone)) bad('zones[' + i + '] has unknown tone'); });
    }

    if (steps.length < 5 || steps.length > 12) bad('a scene has 5-12 steps (this one has ' + steps.length + ')');
    const present = new Set(initial.map((a) => a.id));
    const spacing = (ids, label) => {
      const list = [...ids].map((id) => all[id]).filter(Boolean);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
          if (d < 110) bad(label + ': actors ' + list[i].id + ' and ' + list[j].id + ' are ' + Math.round(d) + ' units apart (keep 110+)');
        }
    };
    spacing(present, 'start');
    const isActor = (t) => present.has(t);
    const isLink = (t) => !!linkIds[t] && present.has(linkIds[t].a) && present.has(linkIds[t].b);
    const isPort = (t) => {
      const p = parsePort(t);
      return !!p && isActor(p.actor) && isLink(p.link) && (linkIds[p.link].a === p.actor || linkIds[p.link].b === p.actor);
    };
    const tone = (a, w) => { if (a.tone != null && !TONES.includes(a.tone)) bad(w + ': unknown tone ' + a.tone); };

    steps.forEach((s, i) => {
      const w0 = 'step ' + (i + 1);
      if (!s || typeof s !== 'object') { bad(w0 + ' is not an object'); return; }
      if (!isStr(s.caption)) bad(w0 + ' needs a caption');
      else if (words(s.caption) > 50) bad(w0 + ' caption is ' + words(s.caption) + ' words (keep it under about 45)');
      if (!Array.isArray(s.actions)) { bad(w0 + ' needs an actions array'); return; }
      const acts = s.actions;
      // adds take effect before everything else in the step; removes after
      let added = false;
      for (const a of acts) if (a && a.do === 'add' && a.actor && all[a.actor.id]) {
        if (present.has(a.actor.id)) bad(w0 + ': add ' + a.actor.id + ' but it is already on stage');
        present.add(a.actor.id);
        added = true;
      }
      if (added) spacing(present, w0);
      const removes = [];
      acts.forEach((a, k) => {
        const w = w0 + ' action ' + (k + 1) + (a && a.do ? ' (' + a.do + ')' : '');
        if (!a || typeof a !== 'object') return bad(w + ' is not an object');
        if (!ACTIONS.includes(a.do)) return bad(w + ': unknown do "' + a.do + '"');
        if (a.when != null && a.when !== 'start' && a.when !== 'end') bad(w + ': when must be start or end');
        if (a.delay != null && (!isNum(a.delay) || a.delay < 0 || a.delay > 6000)) bad(w + ': delay must be 0-6000 ms');
        tone(a, w);
        switch (a.do) {
          case 'packet': {
            const route = Array.isArray(a.path) ? a.path : null;
            const from = a.from != null ? a.from : route && route[0];
            const to = a.to != null ? a.to : route && route[route.length - 1];
            if (!isActor(from)) bad(w + ': from ' + from + ' is not an actor on stage');
            if (!isActor(to)) bad(w + ': to ' + to + ' is not an actor on stage');
            if (from === to) bad(w + ': from and to are the same actor');
            if (a.label != null && typeof a.label !== 'string') bad(w + ': label must be a string');
            if (!isStr(a.label) && !Array.isArray(a.labels)) bad(w + ': a packet needs a label');
            if (a.shape != null && !SHAPES.includes(a.shape)) bad(w + ': unknown shape ' + a.shape);
            let hops = null;
            if (route) {
              if (route.length < 2) bad(w + ': path needs at least two actors');
              if (route[0] !== from || route[route.length - 1] !== to) bad(w + ': path must start at from and end at to');
              for (let h = 0; h + 1 < route.length; h++) {
                if (!isActor(route[h]) || !isActor(route[h + 1])) { bad(w + ': path actor missing'); continue; }
                if (!linksBetween(links, route[h], route[h + 1], present).length) bad(w + ': no link between ' + route[h] + ' and ' + route[h + 1]);
              }
              hops = route.length - 1;
            } else if (isActor(from) && isActor(to)) {
              const r = bfs(links, present, from, to);
              if (!r) bad(w + ': no links connect ' + from + ' to ' + to);
              else hops = r.length - 1;
            }
            if (a.via != null) {
              const vias = Array.isArray(a.via) ? a.via : [a.via];
              const rr = route || (isActor(from) && isActor(to) ? bfs(links, present, from, to) : null);
              if (rr && vias.length !== rr.length - 1) bad(w + ': via needs one link id (or null) per hop');
              vias.forEach((v, h) => {
                if (v == null) return;
                const l = linkIds[v];
                if (!l) return bad(w + ': via link ' + v + ' does not exist');
                if (rr && rr[h + 1] && pairKey(l.a, l.b) !== pairKey(rr[h], rr[h + 1])) bad(w + ': via link ' + v + ' does not join ' + rr[h] + ' and ' + rr[h + 1]);
              });
            }
            if (a.labels != null) {
              if (!Array.isArray(a.labels) || a.labels.some((x) => typeof x !== 'string')) bad(w + ': labels must be an array of strings');
              else if (hops != null && a.labels.length !== hops) bad(w + ': labels needs one entry per hop (' + hops + ')');
            }
            break;
          }
          case 'flood': {
            if (!isActor(a.from)) bad(w + ': from ' + a.from + ' is not an actor on stage');
            if (!Array.isArray(a.to) || !a.to.length) bad(w + ': to must be a non-empty array');
            else for (const t of a.to) {
              if (!isActor(t)) bad(w + ': to ' + t + ' is not an actor on stage');
              else if (isActor(a.from) && !bfs(links, present, a.from, t)) bad(w + ': no links connect ' + a.from + ' to ' + t);
            }
            if (!isStr(a.label)) bad(w + ': a flood needs a label');
            if (a.shape != null && !SHAPES.includes(a.shape)) bad(w + ': unknown shape ' + a.shape);
            break;
          }
          case 'drop':
            if (!isActor(a.at)) bad(w + ': at ' + a.at + ' is not an actor on stage');
            if (a.label != null && typeof a.label !== 'string') bad(w + ': label must be a string');
            break;
          case 'highlight':
            if (!isActor(a.target) && !isLink(a.target) && !isPort(a.target)) bad(w + ': target ' + a.target + ' is not an actor, link or port on stage');
            break;
          case 'state':
            if (!isLink(a.target) && !isPort(a.target)) bad(w + ': target ' + a.target + ' must be a link id or actor:link port');
            if (!STATES.includes(a.state)) bad(w + ': unknown state ' + a.state);
            break;
          case 'badge':
            if (!isActor(a.target) && !isPort(a.target)) bad(w + ': target ' + a.target + ' must be an actor (or actor:link port)');
            if (a.text !== null && !isStr(a.text)) bad(w + ': text must be a string, or null to remove');
            break;
          case 'table':
            if (!isActor(a.target)) bad(w + ': target ' + a.target + ' is not an actor on stage');
            if (a.side != null && !SIDES.includes(a.side)) bad(w + ': unknown side ' + a.side);
            if (a.rows === null) break;
            if (!isStr(a.title)) bad(w + ': a table needs a title');
            if (!Array.isArray(a.cols) || !a.cols.length || a.cols.some((c) => typeof c !== 'string')) { bad(w + ': cols must be an array of strings'); break; }
            if (!Array.isArray(a.rows)) { bad(w + ': rows must be an array (or null to hide)'); break; }
            a.rows.forEach((row, ri) => {
              const cells = Array.isArray(row) ? row : row && row.cells;
              if (!Array.isArray(cells)) bad(w + ': row ' + (ri + 1) + ' must be an array or { cells }');
              else if (cells.length !== a.cols.length) bad(w + ': row ' + (ri + 1) + ' has ' + cells.length + ' cells for ' + a.cols.length + ' columns');
            });
            break;
          case 'label':
            if (!isActor(a.target)) bad(w + ': target ' + a.target + ' is not an actor on stage');
            if (a.sub != null && typeof a.sub !== 'string') bad(w + ': sub must be a string');
            break;
          case 'note':
            if (!isActor(a.target) && !isLink(a.target) && !isPort(a.target)) bad(w + ': target ' + a.target + ' is not an actor, link or port on stage');
            if (!isStr(a.text)) bad(w + ': a note needs text');
            if (a.side != null && !SIDES.includes(a.side)) bad(w + ': unknown side ' + a.side);
            break;
          case 'add':
            break; // handled above
          case 'remove':
            if (!isActor(a.target)) bad(w + ': target ' + a.target + ' is not an actor on stage');
            else removes.push(a.target);
            break;
        }
      });
      for (const id of removes) present.delete(id);
    });
    return P;
  }
  TT.validateScene = validateScene;
  TT.scenesFor = (lessonId) => (TT.scenes || []).filter((s) => s.lesson === lessonId);
  TT.sceneById = (id) => (TT.scenes || []).find((s) => s.id === id);

  /* =====================================================================
   * Snapshots: the persistent state after each step
   * ===================================================================== */
  function buildSnaps(sc) {
    const snaps = [];
    let cur = {
      present: (sc.actors || []).map((a) => a.id),
      actors: Object.fromEntries((sc.actors || []).map((a) => [a.id, a])),
      subs: Object.fromEntries((sc.actors || []).map((a) => [a.id, a.sub || ''])),
      lstate: {},
      pstate: {},
      badges: {},
      tables: {},
    };
    const initial = cur;
    (sc.steps || []).forEach((s) => {
      const n = {
        present: cur.present.slice(),
        actors: Object.assign({}, cur.actors),
        subs: Object.assign({}, cur.subs),
        lstate: Object.assign({}, cur.lstate),
        pstate: Object.assign({}, cur.pstate),
        badges: Object.assign({}, cur.badges),
        tables: Object.assign({}, cur.tables),
        fresh: { badges: {}, tables: {}, subs: {}, added: {}, removed: [] },
      };
      for (const a of s.actions || []) {
        if (a.do === 'add' && a.actor) {
          n.actors[a.actor.id] = a.actor;
          if (!n.present.includes(a.actor.id)) n.present.push(a.actor.id);
          n.subs[a.actor.id] = a.actor.sub || '';
          n.fresh.added[a.actor.id] = true;
        }
      }
      for (const a of s.actions || []) {
        switch (a.do) {
          case 'state': {
            const p = parsePort(a.target);
            const map = p ? n.pstate : n.lstate;
            if (a.state === 'normal') delete map[a.target];
            else map[a.target] = a.state;
            break;
          }
          case 'badge':
            if (a.text == null) delete n.badges[a.target];
            else { n.badges[a.target] = { text: a.text, tone: a.tone || 'accent' }; n.fresh.badges[a.target] = a.when || 'end'; }
            break;
          case 'table':
            if (a.rows == null) delete n.tables[a.target];
            else { n.tables[a.target] = { title: a.title, cols: a.cols, rows: a.rows, side: a.side }; n.fresh.tables[a.target] = a.when || 'end'; }
            break;
          case 'label':
            n.subs[a.target] = a.sub || '';
            n.fresh.subs[a.target] = a.when || 'end';
            break;
          case 'remove':
            n.fresh.removed.push(a.target);
            break;
        }
      }
      snaps.push(n);
      cur = Object.assign({}, n, { present: n.present.filter((id) => !n.fresh.removed.includes(id)) });
    });
    return { initial, snaps };
  }

  /* =====================================================================
   * Icons (classic network-diagram symbols, centred on 0,0, about 52 x 40)
   * ===================================================================== */
  function arrow(x1, y1, x2, y2, h) {
    h = h || 4.5;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const p = (d) => r1(x2 - h * Math.cos(a + d)) + ' ' + r1(y2 - h * Math.sin(a + d));
    return `M${x1} ${y1}L${x2} ${y2}M${p(0.55)}L${x2} ${y2}L${p(-0.55)}`;
  }
  const ICONS = {
    router: () => `<circle class="sc-ib" r="20"/><ellipse class="sc-ih" cx="0" cy="0" rx="20" ry="20"/><path class="sc-ig" d="${arrow(13, -13, 4, -4)}${arrow(-13, 13, -4, 4)}${arrow(-4, -4, -13, -13)}${arrow(4, 4, 13, 13)}"/>`,
    switch: () => `<rect class="sc-ib" x="-25" y="-16" width="50" height="32" rx="4"/><path class="sc-ig" d="${arrow(-16, -6, 16, -6)}${arrow(16, 6, -16, 6)}"/>`,
    l3switch: () => `<rect class="sc-ib" x="-25" y="-16" width="50" height="32" rx="4"/><rect class="sc-ih" x="-21" y="-12" width="42" height="24" rx="2"/><path class="sc-ig" d="${arrow(-4, 0, -16, 0, 4)}${arrow(4, 0, 16, 0, 4)}${arrow(0, -3, 0, -9, 3.5)}${arrow(0, 3, 0, 9, 3.5)}"/>`,
    pc: () => `<rect class="sc-ib sc-end" x="-18" y="-19" width="36" height="26" rx="3"/><rect class="sc-isc" x="-14" y="-15" width="28" height="18" rx="1.5"/><path class="sc-ig sc-end" d="M-4 7L-5 13M4 7L5 13"/><rect class="sc-ib sc-end" x="-12" y="13" width="24" height="5" rx="1.5"/>`,
    laptop: () => `<rect class="sc-ib sc-end" x="-16" y="-18" width="32" height="22" rx="2.5"/><rect class="sc-isc" x="-12.5" y="-14.5" width="25" height="15" rx="1"/><path class="sc-ib sc-end" d="M-20 7H20L24 15H-24Z"/>`,
    server: () => `<rect class="sc-ib sc-end" x="-14" y="-21" width="28" height="42" rx="3"/><path class="sc-ig sc-end" d="M-8 -13H8M-8 -7H8M-8 -1H8"/><circle class="sc-idot" cx="7" cy="13" r="2.2"/>`,
    phone: () => `<path class="sc-ib sc-end" d="M-15 -3H15L18 16H-18Z"/><rect class="sc-ib sc-end" x="-17" y="-15" width="34" height="9" rx="4.5"/><path class="sc-ig sc-end" d="M-7 4H-4M-1 4H2M5 4H8M-7 10H-4M-1 10H2M5 10H8"/>`,
    ap: () => `<rect class="sc-ib" x="-20" y="2" width="40" height="13" rx="6.5"/><circle class="sc-idot sc-net" cx="0" cy="8.5" r="2"/><path class="sc-ig" d="M-7 -4A10 10 0 0 1 7 -4M-12 -10A17 17 0 0 1 12 -10M-17 -16A24 24 0 0 1 17 -16"/>`,
    wlc: () => `<rect class="sc-ib" x="-25" y="-16" width="50" height="32" rx="4"/><path class="sc-ig" d="M-17 2A9 9 0 0 1 -5 2M-20 -3A14 14 0 0 1 -2 -3"/><circle class="sc-idot sc-net" cx="-11" cy="6" r="2"/><path class="sc-ig" d="M4 -8V8M10 -8V8M16 -8V8"/>`,
    firewall: () => `<rect class="sc-ib sc-fw" x="-23" y="-17" width="46" height="34" rx="2"/><path class="sc-ig sc-fw" d="M-23 -5.7H23M-23 5.7H23M-8 -17V-5.7M8 -17V-5.7M0 -5.7V5.7M-15 -5.7V5.7M15 -5.7V5.7M-8 5.7V17M8 5.7V17"/>`,
    cloud: () => `<path class="sc-ib sc-cl" d="M-20 14C-29 14 -31 3 -23 0C-25 -10 -13 -15 -7 -9C-4 -18 11 -18 13 -8C22 -11 28 -2 23 4C30 6 28 14 20 14Z"/>`,
    controller: () => `<rect class="sc-ib" x="-23" y="-17" width="46" height="34" rx="7"/><path class="sc-ig" d="M0 0L-11 -8M0 0L11 -8M0 0L0 10"/><circle class="sc-idot sc-net" r="3.5"/><circle class="sc-idot sc-net" cx="-12" cy="-9" r="2.6"/><circle class="sc-idot sc-net" cx="12" cy="-9" r="2.6"/><circle class="sc-idot sc-net" cx="0" cy="11" r="2.6"/>`,
    printer: () => `<rect class="sc-ib sc-end" x="-12" y="-18" width="24" height="12" rx="1"/><rect class="sc-ib sc-end" x="-20" y="-8" width="40" height="18" rx="3"/><rect class="sc-ib sc-end" x="-12" y="5" width="24" height="12" rx="1"/><path class="sc-ig sc-end" d="M-8 10H8M-8 13H4"/>`,
  };
  const ICON_HALF = { router: 20, switch: 16, l3switch: 16, pc: 19, laptop: 17, server: 21, phone: 16, ap: 15, wlc: 16, firewall: 17, cloud: 16, controller: 17, printer: 18 };

  /* =====================================================================
   * Static drawing (shared by the player and the thumbnails)
   * ===================================================================== */
  function makeGeo(sc, actors, present) {
    const P = new Set(present);
    const links = (sc.links || []).filter((l) => P.has(l.a) && P.has(l.b));
    const groups = {};
    for (const l of links) (groups[pairKey(l.a, l.b)] = groups[pairKey(l.a, l.b)] || []).push(l.id);
    const geo = {};
    for (const l of links) {
      const A = actors[l.a];
      const B = actors[l.b];
      const g = groups[pairKey(l.a, l.b)];
      // offset parallel links in a stable direction (by sorted pair, not by a/b order)
      const [p, q] = l.a < l.b ? [A, B] : [B, A];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const o = (g.indexOf(l.id) - (g.length - 1) / 2) * 16;
      geo[l.id] = { l, x1: A.x + nx * o, y1: A.y + ny * o, x2: B.x + nx * o, y2: B.y + ny * o, nx, ny, o, len };
    }
    return { links, geo };
  }
  /** Point at distance d from actor end of a link, toward the other end. */
  function portPoint(g, actorId, d) {
    const fromA = g.l.a === actorId;
    const sx = fromA ? g.x1 : g.x2;
    const sy = fromA ? g.y1 : g.y2;
    const ex = fromA ? g.x2 : g.x1;
    const ey = fromA ? g.y2 : g.y1;
    const L = Math.hypot(ex - sx, ey - sy) || 1;
    const t = Math.min(d, L * 0.45) / L;
    return { x: sx + (ex - sx) * t, y: sy + (ey - sy) * t };
  }
  const textW = (s, fs, ratio) => String(s).length * fs * (ratio || 0.6);

  function drawLink(g, state, ui, extra) {
    const { x1, y1, x2, y2 } = g;
    const k = g.l.kind;
    const st = state ? ' sc-ls-' + state : '';
    let out = '';
    const line = (cls) => `<line class="${cls}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
    if (k === 'serial') {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const ux = (x2 - x1) / (g.len || 1);
      const uy = (y2 - y1) / (g.len || 1);
      const z = 9;
      const pts = [[x1, y1], [mx - ux * 8, my - uy * 8], [mx - ux * 3 + g.nx * z, my - uy * 3 + g.ny * z], [mx + ux * 3 - g.nx * z, my + uy * 3 - g.ny * z], [mx + ux * 8, my + uy * 8], [x2, y2]];
      out += `<polyline class="sc-ln sc-lk-serial${st}" points="${pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ')}"/>`;
    } else if (k === 'tunnel') {
      out += line('sc-ln-pipe' + st) + line('sc-ln sc-lk-tunnel' + st);
    } else if (k === 'trunk') {
      out += line('sc-ln sc-lk-trunk' + st) + line('sc-ln-core');
    } else out += line('sc-ln sc-lk-' + k + st);
    // stop bar or error mark for whole-link states
    if (state === 'blocked' || state === 'err') out += mark((x1 + x2) / 2, (y1 + y2) / 2, g, state, ui);
    if (g.l.label && !ui.thumb) {
      let nx = g.nx;
      let ny = g.ny;
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } // the "up" normal
      // a parallel link that sits on the lower side gets its label below it
      const sign = g.o * (g.nx * nx + g.ny * ny) < 0 ? -1 : 1;
      const fs = 10.5 * ui.k;
      const off = 11 * ui.k;
      const mx = (x1 + x2) / 2 + nx * off * sign;
      const my = (y1 + y2) / 2 + ny * off * sign;
      out += `<text class="sc-llabel sc-halo" x="${r1(mx)}" y="${r1(my)}" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central">${esc(g.l.label)}</text>`;
    }
    return `<g class="sc-link${extra || ''}" data-id="${esc(g.l.id)}">${out}</g>`;
  }
  /** A state mark at a point on a link: stop bar (blocked), X (err/down), dot (up). */
  function mark(x, y, g, state, ui) {
    const s = ui.s;
    const ux = (g.x2 - g.x1) / (g.len || 1);
    const uy = (g.y2 - g.y1) / (g.len || 1);
    if (state === 'blocked') {
      const h = 11 * s;
      return `<line class="sc-stopbar" x1="${r1(x + g.nx * h)}" y1="${r1(y + g.ny * h)}" x2="${r1(x - g.nx * h)}" y2="${r1(y - g.ny * h)}"/>`;
    }
    if (state === 'err' || state === 'down') {
      const h = 5.5 * s;
      const a = [ux + g.nx, uy + g.ny];
      const b = [ux - g.nx, uy - g.ny];
      return `<circle class="sc-pm sc-pm-${state}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(8 * s)}"/><path class="sc-pmx" d="M${r1(x - a[0] * h)} ${r1(y - a[1] * h)}L${r1(x + a[0] * h)} ${r1(y + a[1] * h)}M${r1(x - b[0] * h)} ${r1(y - b[1] * h)}L${r1(x + b[0] * h)} ${r1(y + b[1] * h)}"/>`;
    }
    return `<circle class="sc-pm sc-pm-${state}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(5.5 * s)}"/>`;
  }
  function pill(text, tone, fs, cls) {
    const w = textW(text, fs, 0.58) + fs * 1.1;
    const h = fs * 1.65;
    return { w, h, svg: `<g class="sc-t-${esc(tone || 'accent')} ${cls || ''}"><rect class="sc-pill" x="${r1(-w / 2)}" y="${r1(-h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}"/><text class="sc-pilltx" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text></g>` };
  }
  function drawActor(a, sub, ui, extraCls) {
    const s = ui.s;
    const half = (ICON_HALF[a.kind] || 18) * s;
    const fsL = 12.5 * ui.k;
    const fsS = 10.5 * ui.k;
    const ly = a.y + half + fsL * 0.95;
    const net = ['router', 'switch', 'l3switch', 'ap', 'wlc', 'controller'].includes(a.kind) ? ' sc-netdev' : '';
    let out = `<g class="sc-actor${net} ${extraCls || ''}" data-id="${esc(a.id)}"><g transform="translate(${r1(a.x)} ${r1(a.y)}) scale(${r1(s * 100) / 100})"><g class="sc-icon">${(ICONS[a.kind] || ICONS.pc)()}</g></g>`;
    if (!ui.thumb || ui.labels) out += `<text class="sc-alabel sc-halo" x="${r1(a.x)}" y="${r1(ly)}" font-size="${r1(fsL)}" text-anchor="middle">${esc(a.label)}</text>`;
    if (sub && !ui.thumb) out += `<text class="sc-asub sc-halo${extraCls && extraCls.includes('sc-subnew') ? ' sc-subnew' : ''}" x="${r1(a.x)}" y="${r1(ly + fsS * 1.35)}" font-size="${r1(fsS)}" text-anchor="middle">${esc(sub)}</text>`;
    return out + '</g>';
  }

  /** Static SVG markup for a snapshot. opts: { fresh, wait } → class names on fresh items. */
  function drawStatic(sc, snap, ui, opts) {
    opts = opts || {};
    const fresh = snap.fresh || { badges: {}, tables: {}, subs: {}, added: {}, removed: [] };
    const present = snap.present;
    const actors = snap.actors;
    const { links, geo } = makeGeo(sc, actors, present);
    const W = sc.stage.w;
    const H = sc.stage.h;
    const waitCls = (phase) => (opts.animate ? (phase === 'start' ? ' sc-in' : ' sc-wait') : '');
    let zones = '';
    for (const z of sc.zones || []) {
      zones += `<g class="sc-zone sc-t-${esc(z.tone || 'muted')}"><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="12"/>${z.label && !(ui.thumb && !ui.labels) ? `<text x="${z.x + 12}" y="${z.y + 10 * ui.k + 8}" font-size="${r1(10 * ui.k)}" class="sc-zlabel">${esc(z.label)}</text>` : ''}</g>`;
    }
    let ls = '';
    for (const l of links) ls += drawLink(geo[l.id], snap.lstate[l.id], ui, fresh.removed.includes(l.a) || fresh.removed.includes(l.b) ? ' sc-removed' : fresh.added[l.a] || fresh.added[l.b] ? ' sc-added' + (opts.animate ? ' sc-in' : '') : '');
    // port marks
    let marks = '';
    for (const key of Object.keys(snap.pstate)) {
      const p = parsePort(key);
      const g = p && geo[p.link];
      if (!g || !present.includes(p.actor)) continue;
      const pt = portPoint(g, p.actor, (ICON_HALF[actors[p.actor].kind] + 13) * ui.s);
      marks += `<g class="sc-port">${mark(pt.x, pt.y, g, snap.pstate[key], ui)}</g>`;
    }
    let as = '';
    for (const id of present) {
      const a = actors[id];
      let cls = '';
      if (fresh.added[id]) cls += ' sc-added' + (opts.animate ? ' sc-in' : '');
      if (fresh.removed.includes(id)) cls += ' sc-removed';
      if (fresh.subs[id]) cls += ' sc-subnew' + waitCls(fresh.subs[id]).replace('sc-wait', 'sc-subwait');
      as += drawActor(a, snap.subs[id], ui, cls);
    }
    let bs = '';
    if (!ui.thumb || ui.badges) {
      for (const key of Object.keys(snap.badges)) {
        const b = snap.badges[key];
        const p = parsePort(key);
        let x;
        let y;
        if (p) {
          const g = geo[p.link];
          if (!g || !present.includes(p.actor)) continue;
          const pt = portPoint(g, p.actor, (ICON_HALF[actors[p.actor].kind] + 30) * ui.s);
          let nx = g.nx;
          let ny = g.ny;
          if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
          x = pt.x + nx * 13 * ui.k;
          y = pt.y + ny * 13 * ui.k;
        } else {
          const a = actors[key];
          if (!a || !present.includes(key)) continue;
          const half = ICON_HALF[a.kind] * ui.s;
          x = a.x + 22 * ui.s;
          y = a.y - half - 3 * ui.k;
        }
        const pl = pill(b.text, b.tone, (p ? 9.5 : 10) * ui.k, 'sc-pop');
        if (!p) x += pl.w / 2 - 12 * ui.s;
        x = Math.max(pl.w / 2 + 2, Math.min(W - pl.w / 2 - 2, x));
        y = Math.max(pl.h / 2 + 2, Math.min(H - pl.h / 2 - 2, y));
        const f = fresh.badges[key];
        bs += `<g class="sc-badge${f ? waitCls(f) : ''}" transform="translate(${r1(x)} ${r1(y)})">${pl.svg}</g>`;
      }
    }
    return { zones, links: ls, marks, actors: as, badges: bs, geo };
  }

  function uiFor(scale, thumb) {
    // scale = rendered px per stage unit. Grow text (and a little the icons) when the stage is small.
    const k = thumb ? 1 : Math.max(1, Math.min(1.75, 0.82 / scale));
    return { k: Math.round(k * 20) / 20, s: thumb ? 1 : Math.round((1 + (k - 1) * 0.45) * 20) / 20, thumb: !!thumb };
  }

  /** Static mini preview: the starting topology, zoomed to the actors. */
  TT.sceneThumb = function sceneThumb(sc, opts) {
    const o = opts || {};
    const { initial } = buildSnaps(sc);
    const snap = Object.assign({}, initial, { badges: {}, fresh: null });
    const ui = Object.assign(uiFor(1, true), { labels: !!o.labels, s: 1.85 });
    const d = drawStatic(sc, snap, ui);
    // zoom to the actors' bounding box (plus zones), widened to the card's 16:10 frame
    const pts = [];
    for (const a of sc.actors || []) pts.push([a.x - 52, a.y - 44], [a.x + 52, a.y + 44]);
    for (const z of sc.zones || []) pts.push([z.x, z.y], [z.x + z.w, z.y + z.h]);
    let x0 = Math.min(...pts.map((p) => p[0])) - 8;
    let x1 = Math.max(...pts.map((p) => p[0])) + 8;
    let y0 = Math.min(...pts.map((p) => p[1])) - 8;
    let y1 = Math.max(...pts.map((p) => p[1])) + 8;
    const want = 1.6;
    if ((x1 - x0) / (y1 - y0) > want) { const h = (x1 - x0) / want; const c = (y0 + y1) / 2; y0 = c - h / 2; y1 = c + h / 2; }
    else { const w = (y1 - y0) * want; const c = (x0 + x1) / 2; x0 = c - w / 2; x1 = c + w / 2; }
    const vb = [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n)).join(' ');
    return `<svg class="sc-svg sc-thumb" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${d.zones}${d.links}${d.marks}${d.actors}</svg>`;
  };

  /* =====================================================================
   * Player
   * ===================================================================== */
  const players = new Set();
  const reduceMQ = () => !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SPEEDS = [0.5, 1, 2];
  const ICON_BTN = {
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    pause: '<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>',
    back: '<path d="M6 5h2.5v14H6zM19 5v14L9.5 12z"/>',
    next: '<path d="M15.5 5H18v14h-2.5zM5 5v14l9.5-7z"/>',
    restart: '<path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3.6 4.2l1.7 5.8 5.6-2.3z"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${ICON_BTN[n]}</svg>`;

  TT.renderScene = function renderScene(el, sc, opts) {
    opts = opts || {};
    const problems = validateScene(sc);
    if (problems.length && G.console) G.console.warn('Scene ' + (sc && sc.id) + ' has problems:\n' + problems.join('\n'));
    const W = sc.stage.w;
    const H = sc.stage.h;
    const { initial, snaps } = buildSnaps(sc);
    const N = sc.steps.length;
    const uid = 'sc' + Math.random().toString(36).slice(2, 8);

    el.innerHTML = `
      <div class="sc-player" role="group" aria-roledescription="animated scene" aria-label="${esc(sc.title)}">
        ${opts.head === false ? '' : `<div class="sc-head"><p class="sc-kicker">Watch it happen · ${esc(sc.obj)}</p><h4 class="sc-title">${esc(sc.title)}</h4><p class="sc-summary">${md(sc.summary)}</p></div>`}
        <div class="sc-stage" tabindex="0" aria-label="Scene stage. Space plays or pauses, left and right arrows step.">
          <svg class="sc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${uid}-t"><title id="${uid}-t">${esc(sc.title)}</title>
            <g class="sc-l-zones"></g><g class="sc-l-hl"></g><g class="sc-l-links"></g><g class="sc-l-trails"></g><g class="sc-l-marks"></g><g class="sc-l-actors"></g><g class="sc-l-badges"></g><g class="sc-l-movers"></g><g class="sc-l-drops"></g>
          </svg>
          <div class="sc-overlay"></div>
          <button type="button" class="sc-start"><span class="sc-start-ic">${ico('play')}</span><span class="sc-start-tx">Play scene<small>${N} steps · about ${Math.max(1, Math.round(sc.steps.reduce((t, s) => t + dwellFor(s.caption) + 1500, 0) / 60000))} min</small></span></button>
        </div>
        <div class="sc-tray" hidden></div>
        <div class="sc-segs" role="group" aria-label="Steps">${sc.steps.map((s, i) => `<button type="button" class="sc-seg" data-i="${i}" aria-label="Step ${i + 1} of ${N}"><i></i></button>`).join('')}</div>
        <div class="sc-cap">
          <div class="sc-cap-who"><span class="sc-avatar" aria-hidden="true">K</span><span class="sc-who">Kenji <span>· senior tech, narrating</span></span><span class="sc-cap-n" aria-hidden="true"></span></div>
          <p class="sc-cap-tx" aria-live="polite"></p>
          <div class="sc-take" hidden><b>Takeaway</b><span>${md(sc.takeaway)}</span></div>
        </div>
        <div class="sc-ctrl">
          <button type="button" class="sc-btn" data-a="restart" aria-label="Restart">${ico('restart')}</button>
          <button type="button" class="sc-btn" data-a="back" aria-label="Previous step">${ico('back')}</button>
          <button type="button" class="sc-btn sc-main" data-a="toggle" aria-label="Play">${ico('play')}</button>
          <button type="button" class="sc-btn" data-a="next" aria-label="Next step">${ico('next')}</button>
          <button type="button" class="sc-btn sc-speed" data-a="speed" aria-label="Speed 1x. Change speed">1x</button>
        </div>
      </div>`;
    const root = el.querySelector('.sc-player');
    const stage = root.querySelector('.sc-stage');
    const svg = root.querySelector('svg.sc-svg');
    const L = (n) => svg.querySelector('.sc-l-' + n);
    const overlay = root.querySelector('.sc-overlay');
    const tray = root.querySelector('.sc-tray');
    const capTx = root.querySelector('.sc-cap-tx');
    const capN = root.querySelector('.sc-cap-n');
    const take = root.querySelector('.sc-take');
    const segs = [...root.querySelectorAll('.sc-seg')];
    const btnToggle = root.querySelector('[data-a="toggle"]');
    const btnSpeed = root.querySelector('[data-a="speed"]');
    const startBtn = root.querySelector('.sc-start');

    const S = { i: 0, auto: false, frozen: false, speed: 1, anim: null, raf: 0, last: 0, scrollPaused: false, started: false, ui: uiFor(1), narrow: false, destroyed: false };
    root.style.setProperty('--sc-speed', '1');

    /* ---------- render one step ---------- */
    function render(i, animate) {
      S.i = i;
      const snap = snaps[i];
      const step = sc.steps[i];
      const reduce = reduceMQ();
      animate = animate && !reduce;
      const d = drawStatic(sc, snap, S.ui, { animate });
      L('zones').innerHTML = d.zones;
      L('links').innerHTML = d.links;
      L('marks').innerHTML = d.marks;
      L('actors').innerHTML = d.actors;
      L('badges').innerHTML = d.badges;
      const plan = planStep(step, snap, d.geo);
      L('hl').innerHTML = plan.hl;
      L('trails').innerHTML = plan.trails;
      L('movers').innerHTML = plan.movers;
      L('drops').innerHTML = plan.drops;
      drawOverlays(snap, step, animate);
      // caption + chrome
      capTx.innerHTML = md(step.caption);
      capN.textContent = 'Step ' + (i + 1) + ' of ' + N;
      take.hidden = i !== N - 1;
      segs.forEach((b, k) => {
        b.classList.toggle('done', k < i);
        b.classList.toggle('on', k === i);
        b.setAttribute('aria-current', k === i ? 'step' : 'false');
        b.querySelector('i').style.width = k < i ? '100%' : '0%';
      });
      root.querySelector('[data-a="back"]').disabled = i === 0;
      root.querySelector('[data-a="next"]').disabled = i === N - 1;
      // timeline
      const movers = [...L('movers').querySelectorAll('.sc-mv')].map((g, k) => Object.assign(plan.list[k], { g, trail: L('trails').querySelectorAll('.sc-trail')[k] }));
      S.anim = { t: 0, revealAt: plan.travel, total: plan.travel + (plan.hasReveal ? 650 : 250), dwell: dwellFor(step.caption), movers, revealed: false };
      if (!animate) {
        S.anim.t = S.anim.total;
        tick(true);
      } else tick(true);
    }

    /** Where every moving unit goes in this step. */
    function planStep(step, snap, geo) {
      const acts = step.actions || [];
      const present = new Set(snap.present);
      const links = (sc.links || []).filter((l) => present.has(l.a) && present.has(l.b));
      const drops = acts.filter((a) => a.do === 'drop' && present.has(a.at));
      const dropAt = new Set(drops.map((a) => a.at));
      const list = [];
      const addMover = (a, from, to, labelArr, tone, shape) => {
        let route = a.do === 'packet' && Array.isArray(a.path) ? a.path.slice() : bfs(links, present, from, to);
        if (!route || route.length < 2) return;
        const vias = a.do === 'packet' && a.via != null ? (Array.isArray(a.via) ? a.via : [a.via]) : [];
        let dead = false;
        for (let h = 1; h < route.length; h++) {
          if (dropAt.has(route[h])) { route = route.slice(0, h + 1); dead = true; break; }
        }
        const pts = [];
        for (let h = 0; h + 1 < route.length; h++) {
          const u = route[h];
          const v = route[h + 1];
          let lk = vias[h] && geo[vias[h]];
          if (!lk) { const c = linksBetween(links, u, v); lk = c.length ? geo[c[0].id] : null; }
          const A = snap.actors[u];
          const B = snap.actors[v];
          let p1 = { x: A.x, y: A.y };
          let p2 = { x: B.x, y: B.y };
          if (lk) {
            const fwd = lk.l.a === u;
            p1 = fwd ? { x: lk.x1, y: lk.y1 } : { x: lk.x2, y: lk.y2 };
            p2 = fwd ? { x: lk.x2, y: lk.y2 } : { x: lk.x1, y: lk.y1 };
          }
          pts.push(p1, p2);
        }
        // trim the ends so the unit starts and parks just outside the icons
        const trim = (p, q, d) => { const L0 = Math.hypot(q.x - p.x, q.y - p.y) || 1; const t = Math.min(d, L0 * 0.42) / L0; return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };
        const halfOf = (id) => ((ICON_HALF[snap.actors[id].kind] || 18) + 14) * S.ui.s;
        pts[0] = trim(pts[0], pts[1], halfOf(route[0]));
        pts[pts.length - 1] = trim(pts[pts.length - 1], pts[pts.length - 2], halfOf(route[route.length - 1]) + (shape === 'hello' || shape === 'wave' ? 0 : 8 * S.ui.k));
        const cum = [0];
        for (let p = 1; p < pts.length; p++) cum.push(cum[p - 1] + Math.hypot(pts[p].x - pts[p - 1].x, pts[p].y - pts[p - 1].y));
        const len = cum[cum.length - 1];
        const hopIdx = []; // which hop each segment belongs to (segments 2h and 2h+1 → hop h; odd ones are inside an actor)
        for (let p = 1; p < pts.length; p++) hopIdx.push(Math.floor(p / 2));
        const dur = Math.max(750, Math.min(3400, len / 0.24));
        list.push({ pts, cum, len, dur, delay: Math.max(0, Number(a.delay) || 0), labels: labelArr, tone, shape, dead, hopIdx, hop: -1 });
      };
      for (const a of acts) {
        const tone = TONES.includes(a.tone) ? a.tone : a.do === 'drop' ? 'stamp' : 'accent';
        if (a.do === 'packet') {
          const route = Array.isArray(a.path) ? a.path : null;
          const from = a.from != null ? a.from : route && route[0];
          const to = a.to != null ? a.to : route && route[route.length - 1];
          if (!present.has(from) || !present.has(to)) continue;
          addMover(a, from, to, Array.isArray(a.labels) && a.labels.length ? a.labels : [a.label || ''], tone, a.shape || 'frame');
        } else if (a.do === 'flood') {
          for (const t of a.to || []) if (present.has(a.from) && present.has(t)) addMover(a, a.from, t, [a.label || ''], tone, a.shape || 'frame');
        }
      }
      const travel = list.reduce((m, x) => Math.max(m, x.delay + x.dur), 0);
      // movers + trails
      let movers = '';
      let trails = '';
      const narrowCut = (s) => (S.narrow && s.length > 22 ? s.slice(0, 21) + '…' : s);
      for (const m of list) {
        m.labels = m.labels.map(narrowCut);
        movers += `<g class="sc-mv sc-t-${m.tone}" opacity="0"><g class="sc-mvi${m.dead ? ' sc-dead-wait' : ''}">${unitSVG(m.shape, m.labels[0], S.ui)}</g></g>`;
        const end = m.pts[m.pts.length - 1];
        const prev = m.pts[m.pts.length - 2];
        const ang = (Math.atan2(end.y - prev.y, end.x - prev.x) * 180) / Math.PI;
        trails += `<g class="sc-trail sc-t-${m.tone}"><polyline points="${m.pts.map((p) => r1(p.x) + ',' + r1(p.y)).join(' ')}" stroke-dasharray="${r1(m.len)} ${r1(m.len + 10)}" stroke-dashoffset="${r1(m.len)}"/><path class="sc-trail-head" d="M0 0L-9 -5L-9 5Z" transform="translate(${r1(end.x)} ${r1(end.y)}) rotate(${r1(ang)})" opacity="0"/></g>`;
      }
      // highlights
      let hl = '';
      for (const a of acts) {
        if (a.do !== 'highlight') continue;
        const tone = TONES.includes(a.tone) ? a.tone : 'accent';
        const p = parsePort(a.target);
        if (p && geo[p.link] && present.has(p.actor)) {
          const pt = portPoint(geo[p.link], p.actor, (ICON_HALF[snap.actors[p.actor].kind] + 13) * S.ui.s);
          hl += `<circle class="sc-hl sc-t-${tone}" cx="${r1(pt.x)}" cy="${r1(pt.y)}" r="${r1(11 * S.ui.s)}"/>`;
        } else if (geo[a.target]) {
          const g = geo[a.target];
          hl += `<line class="sc-hl-link sc-t-${tone}" x1="${r1(g.x1)}" y1="${r1(g.y1)}" x2="${r1(g.x2)}" y2="${r1(g.y2)}"/>`;
        } else if (snap.actors[a.target] && present.has(a.target)) {
          const ac = snap.actors[a.target];
          hl += `<circle class="sc-hl sc-t-${tone}" cx="${ac.x}" cy="${ac.y}" r="${r1((ICON_HALF[ac.kind] + 13) * S.ui.s)}"/>`;
        }
      }
      // drops
      let dr = '';
      for (const a of drops) {
        const ac = snap.actors[a.at];
        const s = S.ui.s;
        const half = ICON_HALF[ac.kind] * s;
        const cx = ac.x - 20 * s;
        const cy = ac.y - half + 2 * s;
        let lab = '';
        if (a.label) {
          const pl = pill(a.label, 'stamp', 10.5 * S.ui.k, '');
          let lx = ac.x;
          let ly = ac.y - half - 18 * S.ui.k;
          if (ly - pl.h / 2 < 2) ly = ac.y + half + 40 * S.ui.k;
          lx = Math.max(pl.w / 2 + 2, Math.min(W - pl.w / 2 - 2, lx));
          lab = `<g transform="translate(${r1(lx)} ${r1(ly)})">${pl.svg}</g>`;
        }
        dr += `<g class="sc-drop${a.when === 'start' ? ' sc-in' : ' sc-wait'}"><g transform="translate(${r1(cx)} ${r1(cy)})"><g class="sc-pop"><circle class="sc-x-bg" r="${r1(11 * s)}"/><path class="sc-x" d="M${r1(-5 * s)} ${r1(-5 * s)}L${r1(5 * s)} ${r1(5 * s)}M${r1(5 * s)} ${r1(-5 * s)}L${r1(-5 * s)} ${r1(5 * s)}"/></g></g>${lab}</g>`;
      }
      const hasReveal = drops.length || acts.some((a) => ['badge', 'table', 'label', 'note', 'add'].includes(a.do));
      return { list, travel, movers, trails, hl, drops: dr, hasReveal };
    }

    function unitHalfW(shape, label, ui) {
      const fs = 11 * ui.k;
      label = label || '';
      if (shape === 'hello' || shape === 'wave') return Math.max(textW(label, fs) / 2, 18 * ui.s);
      return (textW(label, fs) + fs * 1.3 + (shape === 'packet' ? 9 * ui.k : 0)) / 2;
    }
    function unitSVG(shape, label, ui) {
      const fs = 11 * ui.k;
      if (shape === 'hello' || shape === 'wave') {
        const r = (shape === 'wave' ? 5 : 6.5) * ui.s;
        const rings = shape === 'wave'
          ? `<circle class="sc-ring sc-r1" r="${r1(r * 2.2)}"/><circle class="sc-ring sc-r2" r="${r1(r * 3.6)}"/>`
          : `<circle class="sc-ring sc-r1" r="${r1(r * 2)}"/>`;
        return `${rings}<circle class="sc-dot" r="${r1(r)}"/>${label ? `<text class="sc-utx sc-halo" y="${r1(-r * (shape === 'wave' ? 3.9 : 2.6) - 2)}" font-size="${r1(fs)}" text-anchor="middle">${esc(label)}</text>` : ''}`;
      }
      const stripe = shape === 'packet' ? 9 * ui.k : 0;
      const w = textW(label, fs) + fs * 1.3 + stripe;
      const h = fs * 1.9;
      const rx = shape === 'segment' ? 2 : shape === 'packet' ? 3 : h / 2.6;
      let deco = '';
      if (shape === 'packet') deco = `<rect class="sc-stripe" x="${r1(-w / 2)}" y="${r1(-h / 2)}" width="${r1(stripe)}" height="${r1(h)}" rx="${rx}"/>`;
      if (shape === 'segment') deco = `<path class="sc-segdeco" d="M${r1(-w / 2 + 4)} ${r1(-h / 2 + 3)}V${r1(h / 2 - 3)}M${r1(-w / 2 + 7)} ${r1(-h / 2 + 3)}V${r1(h / 2 - 3)}"/>`;
      return `<rect class="sc-chip" x="${r1(-w / 2)}" y="${r1(-h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(rx)}"/>${deco}<text class="sc-ctx" x="${r1(stripe / 2 + (shape === 'segment' ? 3 : 0))}" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`;
    }

    /* ---------- overlays: tables and notes (HTML, real px fonts) ---------- */
    function drawOverlays(snap, step, animate) {
      overlay.innerHTML = '';
      tray.innerHTML = '';
      const fresh = snap.fresh;
      const present = new Set(snap.present);
      const tables = Object.keys(snap.tables).filter((id) => present.has(id));
      for (const id of tables) {
        const t = snap.tables[id];
        const isFresh = !!fresh.tables[id];
        const rows = t.rows
          .map((r) => {
            const cells = Array.isArray(r) ? r : r.cells;
            const nw = !Array.isArray(r) && r.new && isFresh;
            return `<tr${nw ? ' class="sc-new"' : ''}>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
          })
          .join('');
        const box = G.document.createElement('div');
        box.className = 'sc-tbl' + (isFresh && animate ? (fresh.tables[id] === 'start' ? ' sc-in' : ' sc-wait') : '');
        box.dataset.for = id;
        box.innerHTML = `<div class="sc-tbl-h"><span>${esc(snap.actors[id].label)}</span>${esc(t.title)}</div><table><thead><tr>${t.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr class="sc-empty"><td colspan="${t.cols.length}">(empty)</td></tr>`}</tbody></table>`;
        box.dataset.side = t.side || '';
        (S.narrow ? tray : overlay).appendChild(box);
      }
      tray.hidden = !(S.narrow && tables.length);
      for (const a of step.actions || []) {
        if (a.do !== 'note') continue;
        const n = G.document.createElement('div');
        n.className = 'sc-note' + (animate ? (a.when === 'start' ? ' sc-in' : ' sc-wait') : '');
        n.dataset.target = a.target;
        n.dataset.side = a.side || '';
        n.innerHTML = md(a.text);
        overlay.appendChild(n);
      }
      layoutOverlays(snap);
    }
    function anchorOf(snap, target) {
      const p = parsePort(target);
      const geoAll = makeGeo(sc, snap.actors, snap.present.filter((id) => !snap.fresh.removed.includes(id) || true)).geo;
      if (p && geoAll[p.link]) { const pt = portPoint(geoAll[p.link], p.actor, (ICON_HALF[snap.actors[p.actor].kind] + 13) * S.ui.s); return { x: pt.x, y: pt.y, half: 10 }; }
      if (geoAll[target]) { const g = geoAll[target]; return { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2, half: 10 }; }
      const a = snap.actors[target];
      return a ? { x: a.x, y: a.y, half: ICON_HALF[a.kind] * S.ui.s } : { x: W / 2, y: H / 2, half: 0 };
    }
    function layoutOverlays(snap) {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (!sw) return;
      const sc0 = sw / W;
      const place = (box, anchor, side, gap, labelRoom) => {
        const bw = box.offsetWidth;
        const bh = box.offsetHeight;
        const ax = anchor.x * sc0;
        const ay = anchor.y * sc0;
        const hh = anchor.half * sc0;
        let x;
        let y;
        if (side === 'left') { x = ax - hh - gap - bw; y = ay - bh / 2; }
        else if (side === 'right') { x = ax + hh + gap; y = ay - bh / 2; }
        else if (side === 'bottom') { x = ax - bw / 2; y = ay + hh + gap + labelRoom; }
        else { x = ax - bw / 2; y = ay - hh - gap - bh; }
        x = Math.max(4, Math.min(sw - bw - 4, x));
        y = Math.max(4, Math.min(Math.max(4, sh - bh - 4), y));
        box.style.left = Math.round(x) + 'px';
        box.style.top = Math.round(y) + 'px';
        box.dataset.placed = side;
      };
      for (const box of overlay.querySelectorAll('.sc-tbl')) {
        const a = snap.actors[box.dataset.for];
        const side = box.dataset.side || (a.x > W * 0.55 ? 'left' : 'right');
        place(box, anchorOf(snap, box.dataset.for), side, 14, 0);
      }
      for (const n of overlay.querySelectorAll('.sc-note')) {
        const anc = anchorOf(snap, n.dataset.target);
        let side = n.dataset.side;
        if (!side) side = anc.y * sc0 - anc.half * sc0 - 12 - n.offsetHeight < 2 ? 'bottom' : 'top';
        n.dataset.tail = side;
        place(n, anc, side, side === 'bottom' ? 10 : 12, side === 'bottom' ? 30 * S.ui.k * sc0 : 0);
      }
    }

    /* ---------- the clock ---------- */
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    function posAt(m, d) {
      let k = 1;
      while (k < m.cum.length - 1 && m.cum[k] < d) k++;
      const a = m.pts[k - 1];
      const b = m.pts[k];
      const seg = m.cum[k] - m.cum[k - 1] || 1;
      const f = Math.max(0, Math.min(1, (d - m.cum[k - 1]) / seg));
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, seg: k - 1 };
    }
    function setLabel(m, text) {
      const inner = m.g.querySelector('.sc-mvi');
      const dead = inner.classList.contains('sc-dead-wait') || inner.classList.contains('sc-dead');
      inner.innerHTML = unitSVG(m.shape, text, S.ui);
      inner.classList.toggle('sc-dead-wait', dead);
    }
    function tick(force) {
      const A = S.anim;
      if (!A) return;
      for (const m of A.movers) {
        const lt = A.t - m.delay;
        if (lt < 0 && !force) continue;
        const p = Math.max(0, Math.min(1, lt / m.dur));
        const e = ease(p);
        const pos = posAt(m, e * m.len);
        const hop = m.hopIdx[Math.min(pos.seg, m.hopIdx.length - 1)] || 0;
        if (m.labels.length > 1 && hop !== m.hop) { m.hop = hop; setLabel(m, m.labels[Math.min(hop, m.labels.length - 1)]); }
        // keep the whole unit (and its label) on stage
        const hw = unitHalfW(m.shape, m.labels[Math.max(0, Math.min(m.hop, m.labels.length - 1))], S.ui) + 2;
        const cx = Math.max(hw, Math.min(W - hw, pos.x));
        const cy = Math.max(14 * S.ui.k, Math.min(H - 14 * S.ui.k, pos.y));
        m.g.setAttribute('transform', `translate(${r1(cx)} ${r1(cy)})`);
        m.g.setAttribute('opacity', lt < 0 ? '0' : '1');
        const pl = m.trail && m.trail.querySelector('polyline');
        const head = m.trail && m.trail.querySelector('.sc-trail-head');
        if (pl) pl.setAttribute('stroke-dashoffset', r1(m.len * (1 - e)));
        if (head) head.setAttribute('opacity', p >= 1 ? '1' : '0');
        if (p >= 1 && m.dead) { const inner = m.g.querySelector('.sc-mvi'); if (inner.classList.contains('sc-dead-wait')) { inner.classList.remove('sc-dead-wait'); inner.classList.add('sc-dead'); } }
      }
      if (!A.revealed && A.t >= A.revealAt) {
        A.revealed = true;
        root.querySelectorAll('.sc-wait').forEach((x) => { x.classList.remove('sc-wait'); x.classList.add('sc-in'); });
        root.querySelectorAll('.sc-subwait').forEach((x) => { x.classList.remove('sc-subwait'); x.classList.add('sc-subin'); });
      }
      const span = A.total + (S.auto ? stepDwell() : 0);
      const seg = segs[S.i] && segs[S.i].querySelector('i');
      if (seg) seg.style.width = Math.min(100, (A.t / Math.max(1, span)) * 100) + '%';
    }
    const stepDwell = () => S.anim.dwell;
    function loop(now) {
      S.raf = 0;
      if (S.destroyed) return;
      if (!root.isConnected) { destroy(); return; }
      const A = S.anim;
      const dt = S.last ? Math.min(100, now - S.last) : 0;
      S.last = now;
      if (!S.frozen) A.t += dt * S.speed;
      tick(false);
      const end = A.total + (S.auto ? A.dwell : 0);
      if (A.t >= end) {
        if (S.auto && S.i < N - 1) { go(S.i + 1, true); return; }
        if (S.auto) { S.auto = false; syncToggle(); }
        A.t = Math.max(A.t, A.total);
        tick(false);
        return; // idle
      }
      if (!S.frozen) S.raf = G.requestAnimationFrame(loop);
    }
    function kick() {
      if (S.raf || S.destroyed) return;
      S.last = 0;
      S.raf = G.requestAnimationFrame(loop);
    }

    /* ---------- control ---------- */
    function syncToggle() {
      const playing = S.auto && !S.frozen;
      const atEnd = !S.auto && S.i === N - 1 && S.anim && S.anim.t >= S.anim.total && S.started;
      btnToggle.innerHTML = ico(playing ? 'pause' : atEnd ? 'restart' : 'play');
      btnToggle.setAttribute('aria-label', playing ? 'Pause' : atEnd ? 'Play again from the start' : 'Play');
      root.classList.toggle('sc-playing', playing);
      root.classList.toggle('sc-frozen', S.frozen);
    }
    function hideStart() {
      if (!S.started) { S.started = true; startBtn.hidden = true; }
    }
    function go(i, animate) {
      i = Math.max(0, Math.min(N - 1, i));
      hideStart();
      S.frozen = false;
      if (S.raf) { G.cancelAnimationFrame(S.raf); S.raf = 0; }
      render(i, animate !== false);
      syncToggle();
      kick();
    }
    function play() {
      for (const p of players) if (p !== api) p.pause();
      S.scrollPaused = false;
      if (!S.started) { S.auto = true; go(0, true); return; }
      if (!S.auto && S.i === N - 1 && S.anim.t >= S.anim.total) { S.auto = true; go(0, true); return; }
      S.auto = true;
      S.frozen = false;
      syncToggle();
      kick();
    }
    /** Pause autoplay and freeze any motion. reason 'scroll' remembers to resume when it is visible again. */
    function pause(reason) {
      if (reason !== 'scroll') S.scrollPaused = false;
      if (!S.auto && !S.raf) return;
      S.auto = false;
      if (S.raf) { S.frozen = true; G.cancelAnimationFrame(S.raf); S.raf = 0; }
      syncToggle();
    }
    function resumeFrozen() {
      if (S.frozen) { S.frozen = false; kick(); }
    }
    function toggle() { if (S.auto && !S.frozen) pause(); else play(); }
    function setSpeed() {
      const k = SPEEDS.indexOf(S.speed);
      S.speed = SPEEDS[(k + 1) % SPEEDS.length];
      btnSpeed.textContent = S.speed + 'x';
      btnSpeed.setAttribute('aria-label', 'Speed ' + S.speed + 'x. Change speed');
      root.style.setProperty('--sc-speed', String(S.speed));
    }
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b === startBtn) { play(); stage.focus({ preventScroll: true }); return; }
      if (b.classList.contains('sc-seg')) { S.auto = false; go(Number(b.dataset.i), true); return; }
      const a = b.dataset.a;
      if (a === 'toggle') toggle();
      else if (a === 'next') { S.auto = false; go(S.i + 1, true); }
      else if (a === 'back') { S.auto = false; go(S.i - 1, true); }
      else if (a === 'restart') go(0, true);
      else if (a === 'speed') setSpeed();
    });
    root.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (tag === 'button') return; // the focused button handles Space itself
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight') { e.preventDefault(); S.auto = false; go(S.i + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); S.auto = false; go(S.i - 1, true); }
    });

    /* ---------- size, visibility, cleanup ---------- */
    let ro = null;
    let io = null;
    function measure() {
      const sw = stage.clientWidth;
      if (!sw) return;
      const ui = uiFor(sw / W);
      const narrow = sw < 560;
      const changed = ui.k !== S.ui.k || ui.s !== S.ui.s || narrow !== S.narrow;
      S.ui = ui;
      S.narrow = narrow;
      root.classList.toggle('sc-narrow', narrow);
      if (changed && S.anim) {
        // re-draw the current step at its end state (no replay on resize)
        const wasAuto = S.auto;
        if (S.raf) { G.cancelAnimationFrame(S.raf); S.raf = 0; }
        const t = S.anim.t;
        render(S.i, false);
        S.anim.t = Math.max(t, S.anim.total);
        S.auto = wasAuto;
        if (wasAuto) kick();
      } else layoutOverlays(snaps[S.i]);
    }
    if (G.ResizeObserver) { ro = new G.ResizeObserver(() => measure()); ro.observe(stage); }
    if (G.IntersectionObserver) {
      io = new G.IntersectionObserver((ents) => {
        for (const en of ents) {
          if (en.intersectionRatio < 0.25 && (S.auto || S.raf)) { const was = S.auto; pause('scroll'); S.scrollPaused = was; }
          else if (en.intersectionRatio >= 0.25 && S.scrollPaused) { S.scrollPaused = false; play(); }
        }
      }, { threshold: [0, 0.25, 0.5] });
      io.observe(stage);
    }
    function destroy() {
      S.destroyed = true;
      if (S.raf) G.cancelAnimationFrame(S.raf);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      players.delete(api);
    }
    const api = { play, pause: () => pause(), go: (i) => { S.auto = false; go(i, true); }, restart: () => go(0, true), destroy, el: root, scene: sc, get step() { return S.i; }, get playing() { return S.auto && !S.frozen; }, resumeFrozen };
    for (const p of [...players]) if (!p.el.isConnected) p.destroy();
    players.add(api);

    // first paint: step 1 end state behind the play button
    S.ui = uiFor((stage.clientWidth || W) / W);
    S.narrow = (stage.clientWidth || W) < 560;
    root.classList.toggle('sc-narrow', S.narrow);
    render(0, false);
    syncToggle();
    if (reduceMQ()) startBtn.querySelector('.sc-start-tx').firstChild.textContent = 'Start scene';
    if (opts.autoplay && !reduceMQ()) play();
    return api;
  };

  /** Reading time per step at 1x, in ms. */
  function dwellFor(caption) {
    return Math.max(2600, Math.min(9000, 1000 + words(caption) * 210));
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
