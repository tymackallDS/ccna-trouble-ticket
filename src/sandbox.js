/* Trouble Ticket — Lab Sandbox.
 * A Packet Tracer-style builder on top of the simulator in engine.js: drop devices on a canvas,
 * cable them, configure them through the shared CLI, and work through guided projects (projects.js).
 *
 * World model: the network is a TT.net.makeWorld world. Canvas positions are UI state kept beside it.
 * When devices or cables change the world is rebuilt and every existing device object is carried
 * across untouched, so configuration survives.
 *
 * Pure helpers live on TT.sandbox (usable from Node tests). TT.renderSandbox(main, opts) draws the UI.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  const STORE_KEY = 'trouble-ticket-sandbox-v1';
  const FORMAT = 'trouble-ticket-lab';

  /* ====================================================================== *
   * Pure helpers: device templates, world building, cabling, commands
   * ====================================================================== */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  function hash4(t) {
    let h = 0x2f1d;
    for (const c of String(t)) h = (h * 33 + c.charCodeAt(0)) & 0xffff;
    return h.toString(16).padStart(4, '0');
  }
  const ifSort = (a, b) => (TT.util && TT.util.ifSort ? TT.util.ifSort(a, b) : a < b ? -1 : a > b ? 1 : 0);
  const short = (n) => (n === 'NIC' ? 'Fa0' : TT.ifname.shortIf(n));

  const TYPES = {
    router: { label: 'Router', note: '3 x Gigabit', prefix: 'R', kind: 'router', ports: range(0, 2).map((n) => 'GigabitEthernet0/' + n) },
    switch: { label: 'Switch', note: '2960, 24 + 2 ports', prefix: 'SW', kind: 'switch', ports: [...range(1, 24).map((n) => 'FastEthernet0/' + n), 'GigabitEthernet0/1', 'GigabitEthernet0/2'] },
    mls: { label: 'Layer 3 switch', note: '24 x Gigabit', prefix: 'MLS', kind: 'switch', multilayer: true, ports: range(1, 24).map((n) => 'GigabitEthernet1/0/' + n) },
    pc: { label: 'PC', note: 'Desktop', prefix: 'PC', kind: 'pc' },
    laptop: { label: 'Laptop', note: 'Same as a PC', prefix: 'LAP', kind: 'pc' },
    server: { label: 'Server', note: 'DHCP pools', prefix: 'SRV', kind: 'pc', server: true },
  };
  const TYPE_ORDER = ['router', 'switch', 'mls', 'pc', 'laptop', 'server'];

  /** A device definition (before makeWorld) for one palette type. opts.salt varies MAC addresses. */
  function makeDevice(type, id, opts) {
    const t = TYPES[type];
    if (!t) throw new Error('Unknown device type: ' + type);
    opts = opts || {};
    const salt = opts.salt || '';
    const d = { type, kind: t.kind };
    if (t.kind === 'router') {
      d.hostname = 'Router';
      d.interfaces = Object.fromEntries(t.ports.map((p) => [p, { shutdown: true }]));
    } else if (t.kind === 'switch') {
      d.hostname = 'Switch';
      d.interfaces = Object.fromEntries(t.ports.map((p) => [p, { mode: 'access', accessVlan: 1, trunkAllowed: 'all', shutdown: false }]));
      d.vlans = { 1: 'default' };
      d.mac = '00' + hash4(id + salt + 'a').slice(0, 2) + '.' + hash4(id + salt + 'b') + '.' + hash4(id + salt + 'c');
      if (t.multilayer) d.multilayer = true;
    } else {
      d.hostname = opts.hostname || id;
      d.interfaces = { NIC: {} };
      d.pc = { ip: '', mask: '', gw: '', dhcp: false };
      if (salt) d.pc.mac = '0060.' + hash4(id + salt + 'm') + '.' + hash4(id + salt + 'n');
      if (t.server) Object.assign(d.pc, { server: true, pools: [] });
    }
    return d;
  }

  function inferType(spec) {
    if (spec.type && TYPES[spec.type]) return spec.type;
    if (spec.kind === 'router') return 'router';
    if (spec.kind === 'switch') return spec.multilayer ? 'mls' : 'switch';
    return spec.pc && spec.pc.server ? 'server' : 'pc';
  }
  const canonName = (k) => (k === 'NIC' ? k : TT.ifname.canonIf(k) || k);

  /** Expand a compact or saved device spec onto its template. Interface keys may use short names. */
  function materialize(id, spec) {
    spec = spec || {};
    const type = inferType(spec);
    const base = makeDevice(type, id, { hostname: spec.hostname });
    const rest = clone(spec);
    delete rest.interfaces;
    delete rest.pc;
    delete rest.mode;
    delete rest.ctx;
    const out = Object.assign(base, rest, { type, kind: TYPES[type].kind });
    if (TYPES[type].multilayer) out.multilayer = true;
    const ifs = Object.assign({}, base.interfaces);
    for (const [k, v] of Object.entries(spec.interfaces || {})) {
      const n = canonName(k);
      ifs[n] = Object.assign({}, ifs[n] || {}, clone(v));
    }
    out.interfaces = ifs;
    if (out.kind === 'pc') {
      out.pc = Object.assign({}, base.pc, clone(spec.pc || {}));
      out.interfaces = { NIC: {} };
    }
    return out;
  }

  /** Physical, cable-able ports of a device, in display order. */
  function physPorts(d) {
    if (!d) return [];
    if (d.kind === 'pc') return ['NIC'];
    return Object.keys(d.interfaces || {})
      .filter((n) => !/^(Vlan|Port-channel|Loopback)/.test(n) && !TT.ifname.isSub(n))
      .sort(ifSort);
  }
  function canonPort(d, name) {
    if (!d) return null;
    if (d.kind === 'pc') return /^(nic|fa0|fastethernet0|f0)$/i.test(String(name)) ? 'NIC' : null;
    const n = TT.ifname.canonIf(name);
    return n && physPorts(d).includes(n) ? n : null;
  }
  function portLink(w, id, port) {
    return w.links.findIndex(([a, ai, b, bi]) => (a === id && ai === port) || (b === id && bi === port));
  }
  function freePorts(w, id) {
    return physPorts(w.devices[id]).filter((p) => portLink(w, id, p) < 0);
  }
  /** Check a list of links against a device map. Returns an error string or null. */
  function linkError(devices, links) {
    const used = new Set();
    for (const l of links) {
      if (!Array.isArray(l) || l.length !== 4 || !l.every((x) => typeof x === 'string')) return 'A cable entry is malformed.';
      const [a, ai, b, bi] = l;
      if (!devices[a] || !devices[b]) return `A cable points at a device that does not exist (${!devices[a] ? a : b}).`;
      if (a === b) return 'A cable cannot loop back into the same device.';
      for (const [dev, p] of [[a, ai], [b, bi]]) {
        if (!physPorts(devices[dev]).includes(p)) return `${dev} has no port called ${p}.`;
        const k = dev + '|' + p;
        if (used.has(k)) return `${devices[dev].hostname || dev} ${short(p)} already has a cable in it.`;
        used.add(k);
      }
    }
    return null;
  }

  /** Build a world from a project start spec: { devices, links } (short names allowed). */
  function worldFromSpec(spec) {
    const devices = {};
    for (const [id, d] of Object.entries((spec && spec.devices) || {})) devices[id] = materialize(id, d);
    const links = ((spec && spec.links) || []).map(([a, ai, b, bi]) => [a, canonPort(devices[a], ai) || ai, b, canonPort(devices[b], bi) || bi]);
    const err = linkError(devices, links);
    if (err) throw new Error(err);
    return TT.net.makeWorld({ devices, links });
  }

  /**
   * Rebuild the world after the canvas changed. Existing device objects are copied across as-is
   * (their configuration, mode and flags survive); new ones are materialized and normalized.
   * change = { add: { id: spec }, remove: [ids], links: [...] }
   */
  function rebuildWorld(prev, change) {
    change = change || {};
    const remove = new Set(change.remove || []);
    const addDefs = {};
    for (const [id, spec] of Object.entries(change.add || {})) {
      if (prev.devices[id] && !remove.has(id)) throw new Error(`There is already a device called ${id}.`);
      addDefs[id] = materialize(id, spec);
    }
    const fresh = TT.net.makeWorld({ devices: addDefs, links: [] });
    const devices = {};
    for (const [id, d] of Object.entries(prev.devices)) if (!remove.has(id)) devices[id] = d;
    for (const [id, d] of Object.entries(fresh.devices)) devices[id] = d;
    const links = (change.links || prev.links).filter((l) => devices[l[0]] && devices[l[2]]).map((l) => l.slice());
    const err = linkError(devices, links);
    if (err) throw new Error(err);
    const w = { devices, links, events: (prev.events || []).slice(-20) };
    if (prev.ospfDr) w.ospfDr = prev.ospfDr;
    return w;
  }

  function nextId(w, type) {
    const t = TYPES[type];
    if (!t) throw new Error('Unknown device type: ' + type);
    for (let n = 1; n < 1000; n++) if (!w.devices[t.prefix + n]) return t.prefix + n;
    throw new Error('Too many devices.');
  }
  /** Add a palette device. Returns { w, id }. */
  function addDevice(w, type, id, opts) {
    id = id || nextId(w, type);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(id)) throw new Error('Device ids are letters, digits, - and _ (up to 16).');
    if (w.devices[id]) throw new Error(`There is already a device called ${id}.`);
    const spec = makeDevice(type, id, opts);
    return { w: rebuildWorld(w, { add: { [id]: spec } }), id };
  }
  function removeDevice(w, id) {
    if (!w.devices[id]) throw new Error(`No device called ${id}.`);
    return rebuildWorld(w, { remove: [id] });
  }
  /** Cable two ports. Throws on unknown ports, self links, or a port that already has a cable. */
  function addLink(w, a, ai, b, bi) {
    const da = w.devices[a];
    const db = w.devices[b];
    if (!da || !db) throw new Error(`No device called ${!da ? a : b}.`);
    if (a === b) throw new Error('Pick a different device for the other end of the cable.');
    const pa = canonPort(da, ai);
    const pb = canonPort(db, bi);
    if (!pa) throw new Error(`${da.hostname} has no port called ${ai}.`);
    if (!pb) throw new Error(`${db.hostname} has no port called ${bi}.`);
    if (portLink(w, a, pa) >= 0) throw new Error(`${da.hostname} ${short(pa)} already has a cable in it.`);
    if (portLink(w, b, pb) >= 0) throw new Error(`${db.hostname} ${short(pb)} already has a cable in it.`);
    return rebuildWorld(w, { links: w.links.concat([[a, pa, b, pb]]) });
  }
  function removeLink(w, index) {
    if (index < 0 || index >= w.links.length) throw new Error('No such cable.');
    return rebuildWorld(w, { links: w.links.filter((_, i) => i !== index) });
  }

  /**
   * Builder commands used by project solutions (pseudo-device "_build"):
   *   add <type> [id]  ·  delete <id>  ·  cable <dev> <port> <dev> <port>  ·  uncable <dev> <port>
   * Returns { w, id?, log } where log holds any port-security messages the change caused.
   */
  function applyBuild(w, line) {
    const t = String(line).trim().split(/\s+/);
    const op = (t[0] || '').toLowerCase();
    let out;
    if (op === 'add') out = addDevice(w, t[1], t[2]);
    else if (op === 'delete') out = { w: removeDevice(w, t[1]) };
    else if (op === 'cable') out = { w: addLink(w, t[1], t[2], t[3], t[4]) };
    else if (op === 'uncable') {
      const p = canonPort(w.devices[t[1]], t[2]);
      const i = p ? portLink(w, t[1], p) : -1;
      if (i < 0) throw new Error(`No cable in ${t[1]} ${t[2]}.`);
      out = { w: removeLink(w, i) };
    } else throw new Error('Unknown build step: ' + line);
    out.log = TT.net.psTick(out.w);
    return out;
  }
  function describeBuild(line, w) {
    const t = String(line).trim().split(/\s+/);
    const nm = (id) => (w && w.devices[id] ? w.devices[id].hostname + (w.devices[id].hostname !== id ? ` (${id})` : '') : id);
    const port = (p) => (/^nic$/i.test(p) ? '' : ' ' + short(TT.ifname.canonIf(p) || p));
    switch ((t[0] || '').toLowerCase()) {
      case 'add': return `Place a ${TYPES[t[1]] ? TYPES[t[1]].label : t[1]}${t[2] ? ' (' + t[2] + ')' : ''}.`;
      case 'delete': return `Delete ${nm(t[1])}.`;
      case 'cable': return `Cable ${nm(t[1])}${port(t[2])} to ${nm(t[3])}${port(t[4])}.`;
      case 'uncable': return `Delete the cable in ${nm(t[1])}${port(t[2])}.`;
      default: return line;
    }
  }
  /** Ordered [deviceId, commands] pairs for a project's reference solution. */
  function solutionSteps(p) {
    if (!p || !p.solution) return [];
    return Array.isArray(p.solution) ? p.solution : Object.entries(p.solution);
  }

  /* ---- DHCP pools (server Services tab and the "dhcp pool" command share this) ---- */
  function poolError(pool, existing) {
    const { ipToInt, maskToPrefix, netOf, prefixToMaskInt } = TT.ip;
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(pool.name || '')) return 'Pool names are letters, digits, - and _.';
    if ((existing || []).some((p) => p.name.toLowerCase() === pool.name.toLowerCase())) return `There is already a pool called ${pool.name}.`;
    const p = maskToPrefix(pool.mask);
    if (p === null || p < 8 || p > 30) return 'The mask must be a valid subnet mask between /8 and /30.';
    const net = ipToInt(pool.network);
    if (net === null) return 'The network address is not a valid IPv4 address.';
    if (netOf(net, p) !== net) return `${pool.network} is not the network address for that mask. Try ${TT.ip.intToIp(netOf(net, p))}.`;
    const bc = (net | (~prefixToMaskInt(p) >>> 0)) >>> 0;
    const inside = (s) => { const v = ipToInt(s); return v !== null && v > net && v < bc; };
    for (const [k, label] of [['gw', 'gateway'], ['start', 'first address'], ['end', 'last address']]) {
      if (!inside(pool[k])) return `The ${label} must be a usable address inside ${pool.network}/${p}.`;
    }
    if (ipToInt(pool.start) > ipToInt(pool.end)) return 'The first address must not be higher than the last.';
    const g = ipToInt(pool.gw);
    if (g >= ipToInt(pool.start) && g <= ipToInt(pool.end)) return 'Keep the gateway outside the range you hand out.';
    return null;
  }
  function parseMask(s) {
    const t = String(s || '').trim().replace(/^\//, '');
    if (/^\d{1,2}$/.test(t) && +t <= 32) return TT.ip.intToIp(TT.ip.prefixToMaskInt(+t));
    return TT.ip.maskToPrefix(t) === null ? null : t;
  }
  /** Validate a static host address. Returns an error string or null. */
  function hostError(ip, mask, gw) {
    const { ipToInt, maskToPrefix, netOf, prefixToMaskInt } = TT.ip;
    const a = ipToInt(ip);
    if (a === null) return 'The IPv4 address is not valid.';
    const p = maskToPrefix(mask);
    if (p === null || p === 0) return 'The subnet mask is not valid.';
    if (p < 31) {
      const n = netOf(a, p);
      if (a === n) return `${ip} is the network address of that subnet. Pick a host address.`;
      if (a === ((n | (~prefixToMaskInt(p) >>> 0)) >>> 0)) return `${ip} is the broadcast address of that subnet.`;
    }
    if (gw) {
      const g = ipToInt(gw);
      if (g === null) return 'The default gateway is not a valid address.';
      if (netOf(g, p) !== netOf(a, p)) return 'The default gateway must be in the same subnet as the PC.';
      if (g === a) return 'The gateway cannot be the PC\'s own address.';
    }
    return null;
  }
  function setStatic(d, ip, mask, gw) {
    Object.assign(d.pc, { ip, mask, gw: gw || '', dhcp: false });
  }

  /**
   * Run one command line on a device through the shared Session, with two Packet Tracer-style
   * extras for end hosts: "ipconfig <ip> <mask> [gateway]" and, on servers, "dhcp pool ...".
   */
  function run(sess, id, line) {
    const w = sess.w;
    const d = w.devices[id];
    if (!d) return ['% No such device.'];
    const t = String(line).trim();
    if (d.kind === 'pc' && t && !/\?$/.test(t)) {
      let m;
      if ((m = /^ipconfig\s+(\d[\d.]*)\s+(\S+)(?:\s+(\S+))?$/i.exec(t))) {
        const mask = parseMask(m[2]);
        const err = mask ? hostError(m[1], mask, m[3]) : 'The subnet mask is not valid.';
        if (err) return [err];
        setStatic(d, m[1], mask, m[3]);
        w.events.push({ type: 'ipconfig', dev: id });
        return ['', '   IPv4 Address......................: ' + d.pc.ip, '   Subnet Mask.......................: ' + d.pc.mask, '   Default Gateway...................: ' + (d.pc.gw || '0.0.0.0'), ''].concat(TT.net.psTick(w));
      }
      if (/^dhcp(\s|$)/i.test(t)) {
        if (!d.pc.server) return ['This device is not a DHCP server. Use a Server from the palette.'];
        const a = t.split(/\s+/);
        const sub = (a[2] || '').toLowerCase();
        d.pc.pools = d.pc.pools || [];
        if (a.length === 2 || (a[1] || '').toLowerCase() !== 'pool') return sess.run(id, 'leases');
        if (sub === 'add' && a.length === 9) {
          const pool = { name: a[3], network: a[4], mask: parseMask(a[5]) || a[5], gw: a[6], start: a[7], end: a[8] };
          const err = poolError(pool, d.pc.pools);
          if (err) return ['% ' + err];
          d.pc.pools.push(pool);
          w.events.push({ type: 'dhcppool', dev: id });
          return [`Pool ${pool.name} added: ${pool.network}/${TT.ip.maskToPrefix(pool.mask)}, ${pool.start}-${pool.end}, gateway ${pool.gw}.`];
        }
        if ((sub === 'remove' || sub === 'delete') && a[3]) {
          const before = d.pc.pools.length;
          d.pc.pools = d.pc.pools.filter((p) => p.name.toLowerCase() !== a[3].toLowerCase());
          return [before === d.pc.pools.length ? `% No pool called ${a[3]}.` : `Pool ${a[3]} removed.`];
        }
        if (a.length === 2 || sub === '' || sub === 'list') return sess.run(id, 'leases');
        return ['Usage: dhcp pool add <name> <network> <mask> <gateway> <first> <last>', '       dhcp pool remove <name>', '       dhcp pool          (list pools and leases)'];
      }
      if (/^help$/i.test(t)) {
        return sess.run(id, 'help').concat(['  ipconfig <ip> <mask> [gw] set a static address (Packet Tracer style)'], d.pc.server ? ['  dhcp pool add <name> <network> <mask> <gw> <first> <last>', '  dhcp pool remove <name>  (same as the Services tab)'] : []);
      }
    }
    return sess.run(id, line);
  }

  /* ---- link lights ------------------------------------------------------- */
  /** 'up' | 'block' | 'down' for one cable end. stp is TT.net.computeStp(w, 1) (may be null). */
  function portState(w, id, ifn, stp) {
    if (!TT.net.linkUp(w, id, ifn)) return 'down';
    const d = w.devices[id];
    const p = d.kind === 'switch' && stp && stp.ports[id] && stp.ports[id][ifn];
    if (p && (p.role === 'Altn' || p.sts === 'BLK' || p.sts === 'BKN*')) {
      const i = d.interfaces[ifn];
      if (i.channel) {
        // a bundled EtherChannel member forwards as part of the port-channel
        const g = TT.net.computeEc(w, id)[i.channel.group];
        if (g && g.members[ifn] === 'P') return 'up';
      }
      return 'block';
    }
    return 'up';
  }
  function linkStates(w) {
    let stp = null;
    try { stp = TT.net.computeStp(w, 1); } catch (e) { stp = null; }
    return w.links.map(([a, ai, b, bi]) => {
      try { return [portState(w, a, ai, stp), portState(w, b, bi, stp)]; } catch (e) { return ['down', 'down']; }
    });
  }

  /* ---- saving ------------------------------------------------------------- */
  function snapshot(w, positions, project) {
    const devices = {};
    for (const [id, d] of Object.entries(w.devices)) {
      const c = clone(d);
      delete c.mode;
      delete c.ctx;
      devices[id] = c;
    }
    const pos = {};
    for (const id of Object.keys(devices)) {
      const p = positions && positions[id];
      if (p) pos[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
    return { format: FORMAT, v: 1, project: project || null, devices, links: w.links.map((l) => l.slice()), positions: pos, ospfDr: w.ospfDr || undefined };
  }
  /** Validate a saved or imported lab. Returns an error string, or null when it is usable. */
  function validateState(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return 'That is not a lab file.';
    if (o.format !== FORMAT) return 'That file is not a Trouble Ticket lab export.';
    if (o.v !== 1) return 'That lab file was made by a newer version.';
    if (!o.devices || typeof o.devices !== 'object' || Array.isArray(o.devices)) return 'The lab file has no device list.';
    const ids = Object.keys(o.devices);
    if (ids.length > 80) return 'That lab has more than 80 devices.';
    const devices = {};
    for (const id of ids) {
      const d = o.devices[id];
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(id)) return `Device id "${String(id).slice(0, 20)}" is not allowed.`;
      if (!d || typeof d !== 'object') return `Device ${id} is malformed.`;
      if (!['router', 'switch', 'pc'].includes(d.kind)) return `Device ${id} has an unknown kind.`;
      if (d.type !== undefined && !TYPES[d.type]) return `Device ${id} has an unknown type.`;
      if (typeof d.hostname !== 'string' || d.hostname.length > 63) return `Device ${id} needs a hostname.`;
      if (d.interfaces !== undefined && (typeof d.interfaces !== 'object' || Array.isArray(d.interfaces))) return `Device ${id} has a malformed interface list.`;
      if (d.kind === 'pc' && d.pc !== undefined && typeof d.pc !== 'object') return `Device ${id} has malformed host settings.`;
      try { devices[id] = materialize(id, d); } catch (e) { return `Device ${id} could not be loaded.`; }
    }
    if (!Array.isArray(o.links)) return 'The lab file has no cable list.';
    const err = linkError(devices, o.links);
    if (err) return err;
    if (o.positions !== undefined) {
      if (typeof o.positions !== 'object' || Array.isArray(o.positions)) return 'Device positions are malformed.';
      for (const [id, p] of Object.entries(o.positions)) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e5 || Math.abs(p.y) > 1e5) return `Position for ${id} is malformed.`;
      }
    }
    if (o.project !== null && o.project !== undefined && typeof o.project !== 'string') return 'The project id is malformed.';
    return null;
  }
  function loadState(o) {
    const err = validateState(o);
    if (err) throw new Error(err);
    const w = worldFromSpec({ devices: o.devices, links: o.links });
    if (o.ospfDr && typeof o.ospfDr === 'object') w.ospfDr = clone(o.ospfDr);
    const positions = {};
    for (const [id, p] of Object.entries(o.positions || {})) if (w.devices[id]) positions[id] = { x: p.x, y: p.y };
    return { w, positions, project: o.project || null };
  }

  TT.sandbox = { TYPES, TYPE_ORDER, makeDevice, materialize, physPorts, canonPort, portLink, freePorts, linkError, worldFromSpec, rebuildWorld, nextId, addDevice, removeDevice, addLink, removeLink, applyBuild, describeBuild, solutionSteps, poolError, hostError, parseMask, run, portState, linkStates, snapshot, validateState, loadState, STORE_KEY };

  /* ====================================================================== *
   * UI
   * ====================================================================== */
  const doc = G.document;
  if (!doc) return; // Node: helpers only

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const reduced = () => !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let S = null; // the live sandbox

  /* ---- storage ---- */
  function loadStore() {
    let s = {};
    try { s = JSON.parse(G.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { s = {}; }
    if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
    for (const k of ['slots', 'saves', 'done', 'hints']) if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
    return s;
  }
  function writeStore() {
    if (!S) return;
    try { G.localStorage.setItem(STORE_KEY, JSON.stringify(S.store)); } catch (e) { /* storage full or blocked: the lab lasts for this visit */ }
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!S) return;
    S.store.slots[S.slot] = snapshot(S.w, S.positions, S.project ? S.project.id : null);
    writeStore();
  }

  /* ---- icons (simple, generic line drawings) ---- */
  function icon(type) {
    const s = 'class="sb-ic"';
    switch (type) {
      case 'router':
        return `<circle ${s} r="22"/><path class="sb-ic-l" d="M-12 -3h9m0 0l-4 -4m4 4l-4 4M12 3h-9m0 0l4 -4m-4 4l4 4M-3 -12v9m0 0l-4-4m4 4l4-4M3 12v-9m0 0l-4 4m4-4l4 4"/>`;
      case 'switch':
        return `<rect ${s} x="-30" y="-15" width="60" height="30" rx="5"/><path class="sb-ic-l" d="M-16 -5h28m-5 -4l5 4-5 4M16 5h-28m5 -4l-5 4 5 4"/>`;
      case 'mls':
        return `<rect ${s} x="-30" y="-17" width="60" height="34" rx="5"/><path class="sb-ic-l" d="M-18 -6h22m-5 -4l5 4-5 4M8 6h-22m5 -4l-5 4 5 4"/><circle class="sb-ic-l" cx="18" cy="0" r="7"/><path class="sb-ic-l" d="M14 0h8M18 -4v8"/>`;
      case 'laptop':
        return `<rect ${s} x="-18" y="-17" width="36" height="23" rx="2"/><path ${s} d="M-25 8h50l-4 7h-42z"/>`;
      case 'server':
        return `<rect ${s} x="-15" y="-22" width="30" height="44" rx="3"/><path class="sb-ic-l" d="M-9 -13h18M-9 -6h18M-9 1h18"/><circle class="sb-ic-dot" cx="0" cy="13" r="2.5"/>`;
      default:
        return `<rect ${s} x="-20" y="-18" width="40" height="27" rx="3"/><path class="sb-ic-l" d="M-8 18h16M0 9v9"/>`;
    }
  }
  const palIcon = (type) => `<svg class="sb-pal-ic" viewBox="-32 -26 64 52" aria-hidden="true">${icon(type)}</svg>`;

  /* ---- render entry point ---- */
  TT.renderSandbox = function (main, opts) {
    opts = opts || {};
    if (S && S.anim) cancelAnimationFrame(S.anim.raf);
    const pid = typeof opts.project === 'string' ? opts.project : opts.project && opts.project.id ? opts.project.id : null;
    const projects = TT.labProjects || [];
    const project = pid ? projects.find((p) => p.id === pid) || null : null;
    const store = loadStore();
    const slot = project ? project.id : 'free';
    let w = null;
    let positions = {};
    const saved = store.slots[slot];
    if (saved) {
      try { ({ w, positions } = loadState(saved)); } catch (e) { w = null; }
    }
    if (!w) {
      if (project) { w = worldFromSpec(project.start); positions = clone(project.start.positions || {}); }
      else w = TT.net.makeWorld({ devices: {}, links: [] });
    }
    S = {
      main, store, slot, project, missing: pid && !project ? pid : null,
      w, sess: new TT.Session(w), positions,
      view: { z: 1, x: 0, y: 0 }, tool: 'select', sel: null, cable: null, panel: null,
      logs: {}, hist: {}, hi: -1, hintsShown: project ? store.hints[project.id] || 0 : 0, showSol: false, lights: null, lastTap: null,
    };
    layout();
    fitView();
    drawAll();
  };

  function layout() {
    const p = S.project;
    S.main.innerHTML = `
      <div class="sb">
        <header class="sb-head">
          <div>
            <p class="label">Lab sandbox${p ? ' · Guided project' : ''}</p>
            <h2 class="sb-title">${p ? esc(p.title) : 'Free build'}</h2>
          </div>
          <div class="sb-head-links">${p ? '<a class="btn quiet" href="#lab">All projects</a>' : ''}</div>
        </header>
        ${S.missing ? `<p class="sb-warn" role="status">No project called "${esc(S.missing)}". Opened the free build instead.</p>` : ''}
        <div class="sb-grid">
          <aside class="sb-palette" aria-label="Device palette">
            <p class="label">Devices</p>
            <div class="sb-pal-list">
              ${TYPE_ORDER.map((t) => `<button type="button" class="sb-pal" data-type="${t}" aria-label="Add a ${esc(TYPES[t].label)}">${palIcon(t)}<span class="sb-pal-t">${esc(TYPES[t].label)}<small>${esc(TYPES[t].note)}</small></span></button>`).join('')}
            </div>
            <p class="sb-pal-note">Drag onto the canvas, or press to drop one in a free spot.</p>
          </aside>
          <section class="sb-center" aria-label="Network canvas">
            <div class="sb-toolbar" role="toolbar" aria-label="Canvas tools">
              <div class="seg sb-tools" role="group" aria-label="Tool">
                <button type="button" data-tool="select" aria-pressed="true">Select</button>
                <button type="button" data-tool="cable" aria-pressed="false">Cable</button>
              </div>
              <button type="button" class="btn" data-act="configure">Configure</button>
              <button type="button" class="btn" data-act="delete">Delete</button>
              <button type="button" class="btn" data-act="ping">Ping test</button>
              <span class="sb-zoom">
                <button type="button" class="btn" data-act="zoomout" aria-label="Zoom out">−</button>
                <button type="button" class="btn" data-act="zoomin" aria-label="Zoom in">+</button>
                <button type="button" class="btn" data-act="fit">Fit</button>
              </span>
            </div>
            <form class="sb-pingbar" hidden aria-label="Ping test">
              <label>From <select name="src"></select></label>
              <label>To <input name="dst" list="sb-iplist" placeholder="10.1.1.10" autocomplete="off" spellcheck="false" inputmode="decimal"></label>
              <datalist id="sb-iplist"></datalist>
              <button type="submit" class="btn primary">Send ping</button>
              <button type="button" class="btn quiet" data-act="pingclose">Close</button>
              <div class="sb-pingres" aria-live="polite"></div>
            </form>
            <p class="sb-status" aria-live="polite"></p>
            <div class="sb-canvas">
              <svg class="sb-svg" aria-label="Lab canvas. Devices are buttons: Enter configures, arrow keys move, Delete removes.">
                <defs>
                  <pattern id="sb-grid-s" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" class="sb-grid-s"/></pattern>
                  <pattern id="sb-grid-l" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="url(#sb-grid-s)"/><path d="M120 0H0V120" class="sb-grid-l"/></pattern>
                </defs>
                <g class="sb-view">
                  <rect class="sb-bg" x="-6000" y="-6000" width="12000" height="12000" fill="url(#sb-grid-l)"/>
                  <g class="sb-links"></g><g class="sb-nodes"></g><g class="sb-anim"></g>
                </g>
              </svg>
              <div class="sb-pop" hidden></div>
              <p class="sb-empty" hidden>Empty bench. Drag a device in from the palette, or press one to drop it here.</p>
            </div>
            <div class="sb-legend"><span><i class="sb-led-k up"></i>link up</span><span><i class="sb-led-k block"></i>STP blocking (VLAN 1)</span><span><i class="sb-led-k down"></i>down</span><span><i class="sb-line-k"></i>trunk</span><span>Double-click a device to configure it</span></div>
            <section class="sb-drawer" hidden aria-label="Device panel"></section>
          </section>
          <aside class="sb-side" aria-label="Project and files">
            <div class="sb-proj"></div>
            <details class="sb-files">
              <summary>Save, load and export</summary>
              <form class="sb-saveform"><label for="sb-savename">Save this lab as</label><div class="sb-row"><input id="sb-savename" name="name" maxlength="40" autocomplete="off" placeholder="e.g. vlan practice"><button type="submit" class="btn">Save</button></div></form>
              <ul class="sb-saves"></ul>
              <div class="tools">
                <button type="button" class="btn" data-act="export">Export JSON</button>
                <label class="btn sb-import">Import JSON<input type="file" accept=".json,application/json" class="sr"></label>
                <button type="button" class="btn quiet" data-act="new">${S.project ? 'Restart project' : 'New blank lab'}</button>
              </div>
              <p class="sb-filemsg" aria-live="polite"></p>
            </details>
          </aside>
        </div>
      </div>`;
    wire();
  }

  /* ---- drawing ---- */
  function drawAll() {
    drawCanvas();
    drawSide();
    drawSaves();
    drawToolbar();
  }
  function screenOf(id) {
    const p = S.positions[id] || { x: 0, y: 0 };
    return { x: p.x * S.view.z + S.view.x, y: p.y * S.view.z + S.view.y };
  }
  function canvasSize() {
    const el = $('.sb-canvas', S.main);
    return { w: el.clientWidth || 700, h: el.clientHeight || 520 };
  }
  function freeSpot(near) {
    const { w, h } = canvasSize();
    const c = near || { x: (w / 2 - S.view.x) / S.view.z, y: (h / 2 - S.view.y) / S.view.z };
    const taken = Object.values(S.positions);
    const ok = (x, y) => taken.every((p) => Math.hypot(p.x - x, p.y - y) > 92);
    for (let r = 0; r < 12; r++) {
      for (let i = -r; i <= r; i++) {
        for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
          const x = Math.round(c.x + dx * 110);
          const y = Math.round(c.y + dy * 100);
          if (ok(x, y)) return { x, y };
        }
      }
    }
    return { x: c.x + taken.length * 20, y: c.y };
  }
  function ensurePositions() {
    for (const id of Object.keys(S.w.devices)) if (!S.positions[id]) S.positions[id] = freeSpot();
    for (const id of Object.keys(S.positions)) if (!S.w.devices[id]) delete S.positions[id];
  }
  function subLabel(d) {
    if (d.kind === 'pc') return d.pc.ip ? `${d.pc.ip}/${TT.ip.maskToPrefix(d.pc.mask)}` : d.pc.dhcp ? 'DHCP, no lease' : 'no IP';
    return d.id;
  }

  function drawCanvas(reuseLights) {
    if (!S) return;
    ensurePositions();
    const w = S.w;
    const focused = doc.activeElement;
    const fDev = focused && focused.getAttribute && focused.getAttribute('data-dev');
    const fLink = focused && focused.getAttribute && focused.getAttribute('data-link');
    if (!reuseLights || !S.lights || S.lights.length !== w.links.length) S.lights = linkStates(w);
    const P = S.positions;
    let links = '';
    w.links.forEach(([a, ai, b, bi], k) => {
      const A = P[a];
      const B = P[b];
      if (!A || !B) return;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const off = Math.min(31, len * 0.3);
      const lab = Math.min(54, len * 0.36);
      const st = S.lights[k] || ['down', 'down'];
      const ia = w.devices[a].interfaces[ai] || {};
      const ib = w.devices[b].interfaces[bi] || {};
      const trunk = ia.mode === 'trunk' || ib.mode === 'trunk';
      const sel = S.sel && S.sel.link === k;
      const words = { up: 'up', block: 'blocking', down: 'down' };
      const nm = (id, p) => `${w.devices[id].hostname} ${short(p)}`;
      const port = (X, Y, sign, name) => (name === 'NIC' ? '' : `<text class="sb-port" x="${(X + ux * lab * sign - uy * 10).toFixed(1)}" y="${(Y + uy * lab * sign + ux * 10 + 3).toFixed(1)}" text-anchor="middle">${esc(short(name))}</text>`);
      links += `<g class="sb-link${trunk ? ' trunk' : ''}${sel ? ' sel' : ''}" data-link="${k}" tabindex="0" role="button" aria-label="Cable ${esc(nm(a, ai))} (${words[st[0]]}) to ${esc(nm(b, bi))} (${words[st[1]]})${trunk ? ', trunk' : ''}">
        <line class="sb-wire-hit" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>
        <line class="sb-wire" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>
        <circle class="sb-led ${st[0]}" cx="${(A.x + ux * off).toFixed(1)}" cy="${(A.y + uy * off).toFixed(1)}" r="5"/>
        <circle class="sb-led ${st[1]}" cx="${(B.x - ux * off).toFixed(1)}" cy="${(B.y - uy * off).toFixed(1)}" r="5"/>
        ${port(A.x, A.y, 1, ai)}${port(B.x, B.y, -1, bi)}
      </g>`;
    });
    let nodes = '';
    for (const [id, d] of Object.entries(w.devices)) {
      const p = P[id];
      const type = d.type || inferType(d);
      const cls = ['sb-node', S.sel && S.sel.dev === id ? 'sel' : '', S.cable && S.cable.a === id ? 'src' : '', S.panel && S.panel.id === id ? 'open' : ''].join(' ');
      nodes += `<g class="${cls}" data-dev="${esc(id)}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button" aria-label="${esc(d.hostname)}, ${esc(TYPES[type].label)}${d.kind === 'pc' ? ', ' + esc(subLabel(d)) : ''}">
        <rect class="sb-hit" x="-36" y="-30" width="72" height="88"/>
        ${icon(type)}
        <text class="sb-host" y="40" text-anchor="middle">${esc(d.hostname)}</text>
        <text class="sb-sub" y="53" text-anchor="middle">${esc(subLabel(d))}</text>
      </g>`;
    }
    $('.sb-links', S.main).innerHTML = links;
    $('.sb-nodes', S.main).innerHTML = nodes;
    applyView();
    $('.sb-empty', S.main).hidden = Object.keys(w.devices).length > 0;
    if (fDev) { const el = $(`.sb-node[data-dev="${CSS.escape(fDev)}"]`, S.main); if (el) el.focus({ preventScroll: true }); }
    else if (fLink) { const el = $(`.sb-link[data-link="${CSS.escape(fLink)}"]`, S.main); if (el) el.focus({ preventScroll: true }); }
  }
  function applyView() {
    $('.sb-view', S.main).setAttribute('transform', `translate(${S.view.x.toFixed(1)} ${S.view.y.toFixed(1)}) scale(${S.view.z.toFixed(3)})`);
  }
  function fitView() {
    ensurePositions();
    const pts = Object.values(S.positions);
    const { w, h } = canvasSize();
    if (!pts.length) { S.view = { z: 1, x: w / 2 - 360, y: 40 }; return; }
    const minX = Math.min(...pts.map((p) => p.x)) - 60;
    const maxX = Math.max(...pts.map((p) => p.x)) + 60;
    const minY = Math.min(...pts.map((p) => p.y)) - 50;
    const maxY = Math.max(...pts.map((p) => p.y)) + 75;
    const z = Math.max(0.35, Math.min(1.25, w / (maxX - minX), h / (maxY - minY)));
    S.view = { z, x: (w - (maxX - minX) * z) / 2 - minX * z, y: (h - (maxY - minY) * z) / 2 - minY * z };
  }
  function zoomBy(f, cx, cy) {
    const { w, h } = canvasSize();
    cx = cx === undefined ? w / 2 : cx;
    cy = cy === undefined ? h / 2 : cy;
    const z = Math.max(0.3, Math.min(2.5, S.view.z * f));
    const k = z / S.view.z;
    S.view = { z, x: cx - (cx - S.view.x) * k, y: cy - (cy - S.view.y) * k };
    applyView();
    hidePop();
  }

  function drawToolbar() {
    $$('.sb-tools button', S.main).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
    const has = !!S.sel;
    $('[data-act="delete"]', S.main).disabled = !has;
    $('[data-act="configure"]', S.main).disabled = !(S.sel && S.sel.dev);
    $('.sb-canvas', S.main).classList.toggle('cabling', S.tool === 'cable');
  }
  function status(msg) {
    const el = $('.sb-status', S.main);
    if (el) el.textContent = msg || '';
  }

  /* ---- changes ---- */
  function setWorld(w, logLines) {
    S.w = w;
    S.sess = new TT.Session(w);
    const ps = TT.net.psTick(w).concat(logLines || []);
    for (const l of ps) {
      // port-security messages belong on the switch console that raised them
      const m = /on (?:port )?((?:FastEthernet|GigabitEthernet|Fa|Gi)[\d/]+)/.exec(l);
      const port = m ? TT.ifname.canonIf(m[1]) : null;
      const sw = port && Object.values(w.devices).find((d) => d.kind === 'switch' && d.interfaces[port] && d.interfaces[port].ps && d.interfaces[port].ps.on);
      if (sw) logFor(sw.id).push(['sys', l]);
    }
    S.psMsg = ps.length ? (ps.find((l) => /ERR_DISABLE/.test(l)) ? 'Port security tripped: a switch port went err-disabled.' : ps[0]) : null;
    if (S.psMsg) { status(S.psMsg); drawTerm(); }
  }
  function afterChange(msg, opts) {
    drawCanvas();
    drawChecks();
    scheduleSave();
    if (msg) status(S.psMsg ? msg + ' ' + S.psMsg : msg);
    S.psMsg = null;
    if (!(opts && opts.keepPanel) && S.panel) refreshPanelHead();
  }
  function placeDevice(type, at) {
    try {
      const pos = at || freeSpot();
      const r = addDevice(S.w, type, null, { salt: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
      S.positions[r.id] = pos;
      setWorld(r.w);
      S.sel = { dev: r.id };
      drawToolbar();
      afterChange(`Added ${TYPES[type].label} ${r.id}. ${S.tool === 'cable' ? 'Click it to start a cable.' : 'Double-click it to configure.'}`);
      const el = $(`.sb-node[data-dev="${CSS.escape(r.id)}"]`, S.main);
      if (el) el.focus({ preventScroll: true });
    } catch (e) { status(e.message); }
  }
  function deleteSelection() {
    if (!S.sel) { status('Select a device or a cable first.'); return; }
    try {
      if (S.sel.dev) {
        const id = S.sel.dev;
        const name = S.w.devices[id].hostname;
        setWorld(removeDevice(S.w, id));
        delete S.positions[id];
        delete S.logs[id];
        if (S.panel && S.panel.id === id) closePanel();
        if (S.cable && S.cable.a === id) S.cable = null;
        S.sel = null;
        afterChange(`Deleted ${name}.`);
      } else if (S.sel.link !== undefined) {
        const [a, ai, b, bi] = S.w.links[S.sel.link];
        const msg = `Removed the cable between ${S.w.devices[a].hostname} ${short(ai)} and ${S.w.devices[b].hostname} ${short(bi)}.`;
        setWorld(removeLink(S.w, S.sel.link));
        S.sel = null;
        afterChange(msg);
      }
    } catch (e) { status(e.message); }
    drawToolbar();
  }
  function setTool(t) {
    S.tool = t;
    S.cable = null;
    hidePop();
    drawToolbar();
    drawCanvas(true);
    status(t === 'cable' ? 'Cable tool: click the first device.' : '');
  }

  /* ---- cabling ---- */
  function cablePick(id) {
    const d = S.w.devices[id];
    if (S.cable && S.cable.a === id) { status('That is the same device. Click the device at the other end.'); return; }
    const free = freePorts(S.w, id);
    if (!free.length) { status(`${d.hostname} has no free ports. Delete a cable first.`); return; }
    if (d.kind === 'pc') { portChosen(id, 'NIC'); return; }
    showPortPop(id);
  }
  function portChosen(id, port) {
    hidePop();
    const d = S.w.devices[id];
    if (!S.cable) {
      S.cable = { a: id, ai: port };
      drawCanvas(true);
      status(`Cable from ${d.hostname} ${short(port)}. Now click the device at the other end (Esc cancels).`);
      return;
    }
    const { a, ai } = S.cable;
    S.cable = null;
    try {
      setWorld(addLink(S.w, a, ai, id, port));
      S.sel = { link: S.w.links.length - 1 };
      drawToolbar();
      afterChange(`Cabled ${S.w.devices[a].hostname} ${short(ai)} to ${d.hostname} ${short(port)}.`);
    } catch (e) { drawCanvas(true); status(e.message); }
  }
  function showPortPop(id) {
    const d = S.w.devices[id];
    const pop = $('.sb-pop', S.main);
    const peer = (p) => {
      const i = portLink(S.w, id, p);
      if (i < 0) return null;
      const [a, ai, b, bi] = S.w.links[i];
      return a === id ? `${S.w.devices[b].hostname} ${short(bi)}` : `${S.w.devices[a].hostname} ${short(ai)}`;
    };
    pop.innerHTML = `<div class="sb-pop-head"><b>${S.cable ? 'Other end' : 'First end'}: port on ${esc(d.hostname)}</b><button type="button" class="sb-x" data-pop="cancel" aria-label="Cancel">×</button></div>
      <div class="sb-pop-list">${physPorts(d).map((p) => { const used = peer(p); return `<button type="button" data-port="${esc(p)}" ${used ? 'disabled' : ''}><span>${esc(short(p))}</span><small>${used ? 'to ' + esc(used) : 'free'}</small></button>`; }).join('')}</div>`;
    pop.hidden = false;
    const s = screenOf(id);
    const { w, h } = canvasSize();
    const pw = Math.min(260, w - 16);
    pop.style.width = pw + 'px';
    let x = s.x + 40 * S.view.z;
    if (x + pw > w - 8) x = Math.max(8, s.x - pw - 40 * S.view.z);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, Math.min(h - 250, s.y - 60)) + 'px';
    S.popFor = id;
    const first = $('button[data-port]:not([disabled])', pop);
    if (first) first.focus({ preventScroll: true });
  }
  function hidePop() {
    const pop = S && $('.sb-pop', S.main);
    if (pop && !pop.hidden) { pop.hidden = true; pop.innerHTML = ''; }
    if (S) S.popFor = null;
  }

  /* ---- canvas events ---- */
  function wire() {
    const m = S.main;
    const svg = $('.sb-svg', m);
    $$('.sb-pal', m).forEach((b) => wirePalette(b));
    $$('.sb-tools button', m).forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    m.addEventListener('click', onAction);
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', () => { S.drag = null; });
    svg.addEventListener('keydown', onCanvasKey);
    svg.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    $('.sb-pop', m).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pop === 'cancel') { hidePop(); if (S.cable) status(`Cable from ${S.w.devices[S.cable.a].hostname} ${short(S.cable.ai)}. Click the other device.`); else status('Cable tool: click the first device.'); return; }
      if (b.dataset.port && S.popFor) portChosen(S.popFor, b.dataset.port);
    });
    $('.sb-pingbar', m).addEventListener('submit', (e) => { e.preventDefault(); runPing(); });
    $('.sb-saveform', m).addEventListener('submit', (e) => { e.preventDefault(); namedSave(); });
    $('.sb-import input', m).addEventListener('change', importFile);
  }

  function onAction(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !S.main.contains(b) || b.disabled) return;
    switch (b.dataset.act) {
      case 'configure': if (S.sel && S.sel.dev) openPanel(S.sel.dev); break;
      case 'delete': deleteSelection(); break;
      case 'ping': togglePing(true); break;
      case 'pingclose': togglePing(false); break;
      case 'zoomin': zoomBy(1.2); break;
      case 'zoomout': zoomBy(1 / 1.2); break;
      case 'fit': fitView(); applyView(); hidePop(); break;
      case 'export': exportFile(); break;
      case 'new': newLab(b); break;
      case 'check': checkWork(); break;
      case 'hint': S.hintsShown++; S.store.hints[S.project.id] = S.hintsShown; writeStore(); drawSide(); break;
      case 'solution': S.showSol = !S.showSol; drawSide(); break;
      case 'restart': newLab(b); break;
      case 'load': loadNamed(b.dataset.name); break;
      case 'unsave': delete S.store.saves[b.dataset.name]; writeStore(); drawSaves(); fileMsg('Deleted the save "' + b.dataset.name + '".'); break;
      default: break;
    }
  }

  function svgPoint(e) {
    const r = $('.sb-svg', S.main).getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const node = e.target.closest('[data-dev]');
    const link = e.target.closest('[data-link]');
    const svg = $('.sb-svg', S.main);
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    const id = node ? node.dataset.dev : null;
    S.drag = { id, link: link ? Number(link.dataset.link) : null, cx: e.clientX, cy: e.clientY, moved: false, ox: id ? S.positions[id].x : S.view.x, oy: id ? S.positions[id].y : S.view.y };
    if (!S.popFor || !node || node.dataset.dev !== S.popFor) hidePop();
  }
  function onMove(e) {
    const g = S.drag;
    if (!g) return;
    const dx = e.clientX - g.cx;
    const dy = e.clientY - g.cy;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    g.moved = true;
    if (g.id && S.tool === 'select') {
      S.positions[g.id] = { x: Math.round(g.ox + dx / S.view.z), y: Math.round(g.oy + dy / S.view.z) };
      drawCanvas(true);
    } else if (!g.id && g.link === null) {
      S.view.x = g.ox + dx;
      S.view.y = g.oy + dy;
      applyView();
    }
  }
  function onUp(e) {
    const g = S.drag;
    S.drag = null;
    if (!g) return;
    if (g.moved) { if (g.id) scheduleSave(); return; }
    if (g.id) {
      const now = Date.now();
      const dbl = S.lastTap && S.lastTap.id === g.id && now - S.lastTap.t < 380;
      S.lastTap = { id: g.id, t: now };
      if (S.tool === 'cable') { cablePick(g.id); return; }
      S.sel = { dev: g.id };
      drawToolbar();
      drawCanvas(true);
      if (dbl) openPanel(g.id);
      else status(`${S.w.devices[g.id].hostname} selected. Double-click or press Configure to open it.`);
    } else if (g.link !== null) {
      S.sel = { link: g.link };
      drawToolbar();
      drawCanvas(true);
      const [a, ai, b, bi] = S.w.links[g.link];
      status(`Cable ${S.w.devices[a].hostname} ${short(ai)} to ${S.w.devices[b].hostname} ${short(bi)} selected. Press Delete to remove it.`);
    } else {
      S.sel = null;
      drawToolbar();
      drawCanvas(true);
      void svgPoint(e);
    }
  }
  function onCanvasKey(e) {
    const t = e.target;
    const id = t.getAttribute && t.getAttribute('data-dev');
    const link = t.getAttribute && t.getAttribute('data-link');
    if (id) {
      if (e.key === 'Enter') { e.preventDefault(); if (S.tool === 'cable') cablePick(id); else { S.sel = { dev: id }; drawToolbar(); openPanel(id); } }
      else if (e.key === ' ') { e.preventDefault(); if (S.tool === 'cable') cablePick(id); else { S.sel = { dev: id }; drawToolbar(); drawCanvas(true); status(`${S.w.devices[id].hostname} selected.`); } }
      else if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 10;
        const p = S.positions[id];
        if (e.key === 'ArrowLeft') p.x -= step;
        if (e.key === 'ArrowRight') p.x += step;
        if (e.key === 'ArrowUp') p.y -= step;
        if (e.key === 'ArrowDown') p.y += step;
        drawCanvas(true);
        scheduleSave();
      } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); S.sel = { dev: id }; deleteSelection(); }
    } else if (link !== null && link !== undefined) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.sel = { link: Number(link) }; drawToolbar(); drawCanvas(true); status('Cable selected. Press Delete to remove it.'); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); S.sel = { link: Number(link) }; deleteSelection(); }
    }
  }
  // one document-level handler for Escape and Delete, shared by every render
  doc.addEventListener('keydown', (e) => {
    if (!S || !S.main.isConnected) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') {
      if (S.popFor || S.cable) { hidePop(); S.cable = null; drawCanvas(true); status('Cable cancelled.'); }
      return;
    }
    if ((e.key === 'Delete') && !['input', 'textarea', 'select'].includes(tag) && S.sel && (e.target === doc.body || $('.sb-center', S.main).contains(e.target)) && !e.target.closest('.sb-drawer')) {
      if (e.target.closest && e.target.closest('.sb-svg')) return; // the canvas handler already took it
      e.preventDefault();
      deleteSelection();
    }
  });

  /* ---- palette drag and drop (pointer events, works with touch) ---- */
  function wirePalette(btn) {
    btn.addEventListener('click', () => {
      if (S.palDragged) { S.palDragged = false; return; }
      placeDevice(btn.dataset.type);
    });
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY };
      let ghost = null;
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 7) return;
        if (!ghost) {
          ghost = doc.createElement('div');
          ghost.className = 'sb-ghost';
          ghost.innerHTML = palIcon(btn.dataset.type);
          doc.body.appendChild(ghost);
        }
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        const r = $('.sb-canvas', S.main).getBoundingClientRect();
        $('.sb-canvas', S.main).classList.toggle('drop', ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
      };
      const up = (ev) => {
        G.removeEventListener('pointermove', move);
        G.removeEventListener('pointerup', up);
        G.removeEventListener('pointercancel', cancel);
        if (!ghost) return;
        ghost.remove();
        S.palDragged = true;
        setTimeout(() => { if (S) S.palDragged = false; }, 50);
        const c = $('.sb-canvas', S.main);
        c.classList.remove('drop');
        const r = c.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          placeDevice(btn.dataset.type, { x: Math.round((ev.clientX - r.left - S.view.x) / S.view.z), y: Math.round((ev.clientY - r.top - S.view.y) / S.view.z) });
        }
      };
      const cancel = () => { G.removeEventListener('pointermove', move); G.removeEventListener('pointerup', up); G.removeEventListener('pointercancel', cancel); if (ghost) ghost.remove(); if (S) $('.sb-canvas', S.main).classList.remove('drop'); };
      G.addEventListener('pointermove', move);
      G.addEventListener('pointerup', up);
      G.addEventListener('pointercancel', cancel);
    });
  }

  /* ---- device panel (bottom drawer) ---- */
  function tabsFor(d) {
    if (d.kind !== 'pc') return [['cli', 'CLI']];
    return d.pc.server ? [['ip', 'IP Configuration'], ['dhcp', 'Services: DHCP'], ['cmd', 'Command Prompt']] : [['ip', 'IP Configuration'], ['cmd', 'Command Prompt']];
  }
  function openPanel(id, tab) {
    const d = S.w.devices[id];
    if (!d) return;
    const tabs = tabsFor(d);
    S.panel = { id, tab: tab && tabs.some((t) => t[0] === tab) ? tab : tabs[0][0] };
    S.hi = -1;
    drawPanel();
    drawCanvas(true);
    const dr = $('.sb-drawer', S.main);
    if (dr.scrollIntoView) dr.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    const f = $('.sb-cmd', dr) || $('input, select', dr);
    if (f) f.focus({ preventScroll: true });
  }
  function closePanel() {
    S.panel = null;
    const dr = $('.sb-drawer', S.main);
    dr.hidden = true;
    dr.innerHTML = '';
    drawCanvas(true);
  }
  function refreshPanelHead() {
    const d = S.panel && S.w.devices[S.panel.id];
    const h = $('.sb-drawer-name', S.main);
    if (d && h) h.textContent = d.hostname;
  }
  function drawPanel() {
    const dr = $('.sb-drawer', S.main);
    const d = S.panel && S.w.devices[S.panel.id];
    if (!d) { dr.hidden = true; return; }
    const type = d.type || inferType(d);
    const tabs = tabsFor(d);
    dr.hidden = false;
    dr.innerHTML = `
      <header class="sb-drawer-head">
        <svg class="sb-drawer-ic" viewBox="-32 -26 64 52" aria-hidden="true">${icon(type)}</svg>
        <div class="sb-drawer-id"><b class="sb-drawer-name">${esc(d.hostname)}</b><small>${esc(TYPES[type].label)} · ${esc(d.id)}</small></div>
        <div class="sb-dtabs" role="tablist" aria-label="Device panel tabs">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === S.panel.tab}">${esc(l)}</button>`).join('')}</div>
        <button type="button" class="btn quiet sb-close" aria-label="Close device panel">Close</button>
      </header>
      <div class="sb-drawer-body" role="tabpanel"></div>`;
    $$('.sb-dtabs button', dr).forEach((b) => b.addEventListener('click', () => { S.panel.tab = b.dataset.tab; drawPanel(); const f = $('.sb-cmd', dr) || $('input', dr); if (f) f.focus({ preventScroll: true }); }));
    $('.sb-close', dr).addEventListener('click', closePanel);
    const body = $('.sb-drawer-body', dr);
    if (S.panel.tab === 'cli' || S.panel.tab === 'cmd') drawTermTab(body, d);
    else if (S.panel.tab === 'ip') drawIpTab(body, d);
    else if (S.panel.tab === 'dhcp') drawDhcpTab(body, d);
  }

  /* terminal (same feel as the ticket console) */
  function logFor(id) {
    if (!S.logs[id]) {
      const d = S.w.devices[id];
      S.logs[id] = d.kind === 'pc'
        ? [['dim', `Command prompt on ${d.hostname}. Type help for commands.`], ['', '']]
        : [['dim', `Console connected to ${d.hostname}. Type ? for help.`], ['', '']];
    }
    return S.logs[id];
  }
  function classify(line) {
    if (/^%(LINK|LINEPROTO|OSPF|SYS|PM|PORT_SECURITY|DHCP|SSH|HSRP|DUAL)/.test(line)) return 'sys';
    if (/^% /.test(line) || /^%[A-Z]/.test(line) || /^\s*\^$/.test(line) || /is not recognized/.test(line)) return 'err';
    return '';
  }
  function drawTermTab(body, d) {
    const pc = d.kind === 'pc';
    body.innerHTML = `
      <div class="term sb-term">
        <div class="out" role="log" aria-live="polite" aria-label="${pc ? 'Command prompt' : 'Console'} output"></div>
        <div class="line"><label class="sr" for="sb-cmd">Command</label><span class="p"></span><input id="sb-cmd" class="sb-cmd" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"></div>
      </div>
      <p class="term-help"><kbd>Tab</kbd> completes · <kbd>?</kbd> lists options · <kbd>↑</kbd> <kbd>↓</kbd> history · <kbd>Ctrl</kbd>+<kbd>L</kbd> clears${pc ? ' · try <code>ipconfig</code>, <code>ping</code>, <code>help</code>' : ' · abbreviations work (<code>sh ip int br</code>)'}</p>`;
    const input = $('.sb-cmd', body);
    input.addEventListener('keydown', (e) => onTermKey(e, d.id));
    $('.sb-term', body).addEventListener('click', () => { if (!G.getSelection().toString()) input.focus(); });
    drawTerm();
  }
  function drawTerm() {
    const out = S.panel && $('.sb-drawer .out', S.main);
    if (!out) return;
    const id = S.panel.id;
    out.innerHTML = logFor(id).map(([cls, text]) => {
      if (cls === 'cmd') {
        const i = text.indexOf('\u0000');
        return `<div><span class="p">${esc(text.slice(0, i))}</span><span class="cmd">${esc(text.slice(i + 1))}</span></div>`;
      }
      return `<div class="${cls}">${esc(text) || ' '}</div>`;
    }).join('');
    out.scrollTop = out.scrollHeight;
    const p = $('.sb-drawer .line .p', S.main);
    if (p) p.textContent = S.sess.prompt(id);
  }
  function execLine(id, line, help) {
    const log = logFor(id);
    log.push(['cmd', S.sess.prompt(id) + '\u0000' + line + (help ? '?' : '')]);
    let out;
    try { out = help ? run(S.sess, id, line + '?') : run(S.sess, id, line); } catch (e) { out = ['% ' + e.message]; }
    for (const l of out) log.push([classify(l), l]);
    if (log.length > 500) log.splice(0, log.length - 500);
    drawTerm();
    afterChange(null, { keepPanel: true });
    refreshPanelHead();
  }
  function onTermKey(e, id) {
    const input = e.target;
    const hist = (S.hist[id] = S.hist[id] || []);
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      if (v.trim()) hist.push(v);
      if (hist.length > 80) hist.shift();
      S.hi = -1;
      input.value = '';
      execLine(id, v);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const c = S.sess.complete(id, input.value);
      if (c) input.value = c;
    } else if (e.key === '?') {
      e.preventDefault();
      execLine(id, input.value, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hist.length) return;
      S.hi = S.hi < 0 ? hist.length - 1 : Math.max(0, S.hi - 1);
      input.value = hist[S.hi];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (S.hi < 0) return;
      S.hi++;
      if (S.hi >= hist.length) { S.hi = -1; input.value = ''; } else input.value = hist[S.hi];
    } else if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
      e.preventDefault();
      S.logs[id] = [];
      drawTerm();
    }
  }

  /* IP configuration form */
  function drawIpTab(body, d) {
    const pc = d.pc;
    const dh = !!pc.dhcp;
    body.innerHTML = `
      <form class="sb-form sb-ipform" novalidate>
        <fieldset class="sb-radio"><legend>IPv4 configuration</legend>
          <label><input type="radio" name="mode" value="dhcp" ${dh ? 'checked' : ''}> DHCP</label>
          <label><input type="radio" name="mode" value="static" ${dh ? '' : 'checked'}> Static</label>
        </fieldset>
        <div class="sb-fields">
          <label>IPv4 address<input name="ip" value="${esc(pc.ip || '')}" inputmode="decimal" autocomplete="off" spellcheck="false" ${dh ? 'disabled' : ''}></label>
          <label>Subnet mask<input name="mask" value="${esc(pc.mask || '')}" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="255.255.255.0 or /24" ${dh ? 'disabled' : ''}></label>
          <label>Default gateway<input name="gw" value="${esc(pc.gw || '')}" inputmode="decimal" autocomplete="off" spellcheck="false" ${dh ? 'disabled' : ''}></label>
          <label>Display name<input name="host" value="${esc(d.hostname)}" maxlength="24" autocomplete="off" spellcheck="false"></label>
        </div>
        <div class="sb-row"><button type="submit" class="btn primary">Apply</button><span class="sb-formmsg" aria-live="polite"></span></div>
        <p class="sb-mac">MAC address ${esc(TT.net.pcMac(d).toUpperCase())}</p>
      </form>`;
    const f = $('form', body);
    $$('input[name="mode"]', f).forEach((r) => r.addEventListener('change', () => {
      const st = f.mode.value === 'static';
      for (const n of ['ip', 'mask', 'gw']) f[n].disabled = !st;
    }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = $('.sb-formmsg', f);
      const host = f.host.value.trim();
      if (host && host !== d.hostname) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(host)) { msg.textContent = 'Names are letters, digits, - and _.'; msg.className = 'sb-formmsg bad'; return; }
        d.hostname = host;
      }
      if (f.mode.value === 'static') {
        const mask = parseMask(f.mask.value);
        const ip = f.ip.value.trim();
        const gw = f.gw.value.trim();
        const err = !ip ? 'Enter an IPv4 address.' : !mask ? 'The subnet mask is not valid.' : hostError(ip, mask, gw);
        if (err) { msg.textContent = err; msg.className = 'sb-formmsg bad'; return; }
        setStatic(d, ip, mask, gw);
        S.w.events.push({ type: 'ipconfig', dev: d.id });
        TT.net.psTick(S.w);
        msg.textContent = `Saved: ${ip}/${TT.ip.maskToPrefix(mask)}${gw ? ', gateway ' + gw : ', no gateway'}.`;
        msg.className = 'sb-formmsg good';
        f.mask.value = mask;
      } else {
        d.pc.dhcp = true;
        execLine(d.id, 'ipconfig /renew');
        const ok = d.pc.ip && !/^169\.254\./.test(d.pc.ip);
        msg.textContent = ok ? `DHCP lease: ${d.pc.ip}/${TT.ip.maskToPrefix(d.pc.mask)}, gateway ${d.pc.gw || 'none'}.` : `No DHCP server answered. The PC gave itself ${d.pc.ip} (APIPA).`;
        msg.className = 'sb-formmsg ' + (ok ? 'good' : 'bad');
        f.ip.value = d.pc.ip || '';
        f.mask.value = d.pc.mask || '';
        f.gw.value = d.pc.gw || '';
      }
      afterChange(null);
      refreshPanelHead();
    });
  }

  /* server DHCP pools */
  function drawDhcpTab(body, d) {
    const pools = (d.pc.pools = d.pc.pools || []);
    const leases = Object.entries(d.pc.leases || {});
    body.innerHTML = `
      <div class="sb-dhcp">
        <p class="sb-note">The server hands out an address from the pool whose network matches where the request came from: its own subnet, or the relay interface address (the giaddr) set by <code>ip helper-address</code>.</p>
        <div class="sb-tablewrap"><table class="sb-table"><thead><tr><th>Pool</th><th>Network</th><th>Gateway</th><th>Range</th><th><span class="sr">Remove</span></th></tr></thead><tbody>
          ${pools.length ? pools.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.network)}/${TT.ip.maskToPrefix(p.mask)}</td><td>${esc(p.gw)}</td><td>${esc(p.start)} - ${esc(p.end)}</td><td><button type="button" class="btn quiet" data-unpool="${esc(p.name)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="5" class="sb-none">No pools yet.</td></tr>'}
        </tbody></table></div>
        <form class="sb-form sb-poolform" novalidate>
          <p class="label">Add a pool</p>
          <div class="sb-fields">
            <label>Pool name<input name="name" autocomplete="off" spellcheck="false" placeholder="SCANNERS"></label>
            <label>Network<input name="network" inputmode="decimal" autocomplete="off" placeholder="10.20.10.0"></label>
            <label>Subnet mask<input name="mask" inputmode="decimal" autocomplete="off" placeholder="255.255.255.0"></label>
            <label>Default gateway<input name="gw" inputmode="decimal" autocomplete="off" placeholder="10.20.10.1"></label>
            <label>First address<input name="start" inputmode="decimal" autocomplete="off" placeholder="10.20.10.100"></label>
            <label>Last address<input name="end" inputmode="decimal" autocomplete="off" placeholder="10.20.10.199"></label>
          </div>
          <div class="sb-row"><button type="submit" class="btn primary">Add pool</button><span class="sb-formmsg" aria-live="polite"></span></div>
        </form>
        <p class="label">Leases</p>
        <ul class="sb-leases">${leases.length ? leases.map(([cid, ip]) => `<li><code>${esc(ip)}</code> ${esc(S.w.devices[cid.split(':')[0]] ? S.w.devices[cid.split(':')[0]].hostname : cid)}</li>`).join('') : '<li class="sb-none">None yet.</li>'}</ul>
      </div>`;
    $$('[data-unpool]', body).forEach((b) => b.addEventListener('click', () => {
      d.pc.pools = pools.filter((p) => p.name !== b.dataset.unpool);
      drawDhcpTab(body, d);
      afterChange(`Removed pool ${b.dataset.unpool}.`);
    }));
    const f = $('.sb-poolform', body);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const pool = { name: f.name.value.trim(), network: f.network.value.trim(), mask: parseMask(f.mask.value) || f.mask.value.trim(), gw: f.gw.value.trim(), start: f.start.value.trim(), end: f.end.value.trim() };
      const err = poolError(pool, pools);
      const msg = $('.sb-formmsg', f);
      if (err) { msg.textContent = err; msg.className = 'sb-formmsg bad'; return; }
      pools.push(pool);
      S.w.events.push({ type: 'dhcppool', dev: d.id });
      drawDhcpTab(body, d);
      afterChange(`Pool ${pool.name} added on ${d.hostname}.`);
    });
  }

  /* ---- ping test tool ---- */
  function hostIps() {
    const out = [];
    for (const d of Object.values(S.w.devices)) {
      if (d.kind === 'pc') { if (d.pc.ip) out.push([d.pc.ip, d.hostname]); continue; }
      for (const [n, i] of Object.entries(d.interfaces)) if (i.ip) out.push([i.ip, `${d.hostname} ${short(n)}`]);
    }
    return out;
  }
  function togglePing(on) {
    const f = $('.sb-pingbar', S.main);
    f.hidden = !on;
    if (!on) return;
    const srcs = Object.values(S.w.devices).filter((d) => d.kind === 'pc' || d.kind === 'router' || (d.kind === 'switch' && d.multilayer));
    const prev = f.src.value;
    const def = S.sel && S.sel.dev && srcs.some((d) => d.id === S.sel.dev) ? S.sel.dev : prev;
    f.src.innerHTML = srcs.length ? srcs.map((d) => `<option value="${esc(d.id)}" ${d.id === def ? 'selected' : ''}>${esc(d.hostname)}</option>`).join('') : '<option value="">(add a PC first)</option>';
    $('#sb-iplist', S.main).innerHTML = hostIps().map(([ip, l]) => `<option value="${esc(ip)}">${esc(l)}</option>`).join('');
    f.dst.focus({ preventScroll: true });
  }
  const REASONS = {
    'no-ip': 'the source has no IP address',
    'no-gateway': 'the destination is in another subnet and the source has no usable default gateway',
    'no-route': 'a router has no route to the destination',
    'host-unreachable': 'nothing on the last segment answers ARP for that address',
    'next-hop-unreachable': 'the next hop does not answer ARP (wrong address, VLAN or cable?)',
    acl: 'an access list dropped it',
    'no-return-path': 'the echo got there, but the reply has no way back',
    'nat-pool-exhausted': 'the NAT pool is out of addresses',
    'bad-ip': 'that is not a valid IPv4 address',
    dai: 'Dynamic ARP Inspection dropped the ARP',
    ttl: 'it looped until the TTL ran out',
  };
  function runPing() {
    const f = $('.sb-pingbar', S.main);
    const res = $('.sb-pingres', f);
    const src = f.src.value;
    const dst = f.dst.value.trim();
    if (!src || !S.w.devices[src]) { res.innerHTML = '<span class="bad">Pick a source device.</span>'; return; }
    if (TT.ip.ipToInt(dst) === null) { res.innerHTML = '<span class="bad">Enter a destination IPv4 address.</span>'; return; }
    let r;
    try { r = TT.net.ping(S.w, src, dst); } catch (e) { r = { ok: false, reason: 'ttl' }; }
    const name = (id) => (S.w.devices[id] ? S.w.devices[id].hostname : id);
    const path = (hops) => (hops || []).map(name).map(esc).join(' → ');
    if (r.ok && r.local) { res.innerHTML = '<span class="good">Reply from itself.</span> That is the source\'s own address.'; return; }
    const there = r.there ? r.there.hops : r.hops;
    const back = r.back ? r.back.hops : null;
    if (r.ok) res.innerHTML = `<span class="good">Success.</span> Echo: ${path(there)}. Reply: ${path(back)}.`;
    else res.innerHTML = `<span class="bad">Failed:</span> ${esc(REASONS[r.reason] || r.reason)}${r.at ? ` (at ${esc(name(r.at))})` : ''}.${there && there.length > 1 ? ` Got as far as ${path(there)}.` : ''}${back && back.length > 1 ? ` Reply got as far as ${path(back)}.` : ''}`;
    S.w.events.push({ type: 'pingtest', from: src, to: dst, ok: r.ok });
    animatePing(there || [src], r.ok ? back : back && back.length > 1 ? back : null, r.ok, r.at);
  }
  /** Device-level path between two L3 hops, walking cables through switches. */
  function wirePath(a, b) {
    if (a === b) return [a];
    const w = S.w;
    const prev = { [a]: null };
    const q = [a];
    while (q.length) {
      const cur = q.shift();
      for (const [x, , y] of w.links) {
        for (const [from, to] of [[x, y], [y, x]]) {
          if (from !== cur || prev[to] !== undefined) continue;
          prev[to] = cur;
          if (to === b) { const p = [b]; let c = cur; while (c !== null) { p.unshift(c); c = prev[c]; } return p; }
          if (w.devices[to].kind === 'switch') q.push(to);
        }
      }
    }
    return [a, b];
  }
  function expand(hops) {
    const out = [];
    for (let i = 0; i < hops.length - 1; i++) {
      const seg = wirePath(hops[i], hops[i + 1]);
      out.push(...(out.length ? seg.slice(1) : seg));
    }
    return out.length ? out : hops.slice(0, 1);
  }
  function animatePing(there, back, ok, at) {
    if (S.anim) cancelAnimationFrame(S.anim.raf);
    const g = $('.sb-anim', S.main);
    const legs = [{ pts: expand(there), cls: 'go' }];
    if (back && back.length) legs.push({ pts: expand(back), cls: 'back' });
    const failAt = !ok ? (at && S.positions[at] ? at : (back && back.length ? back[back.length - 1] : there[there.length - 1])) : null;
    const trail = (pts, cls) => pts.slice(1).map((id, i) => { const A = S.positions[pts[i]]; const B = S.positions[id]; return A && B ? `<line class="sb-trail ${cls}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>` : ''; }).join('');
    const finish = () => {
      const F = failAt && S.positions[failAt];
      g.innerHTML = legs.map((l) => trail(l.pts, l.cls)).join('') + (F ? `<g class="sb-fail" transform="translate(${F.x} ${F.y})"><circle r="30"/><path d="M-8 -8L8 8M8 -8L-8 8"/></g>` : '');
      S.anim = { raf: 0 };
      setTimeout(() => { if (g.isConnected) g.innerHTML = ''; }, 2600);
    };
    if (reduced()) { finish(); return; }
    const seq = [];
    for (const l of legs) for (let i = 0; i < l.pts.length - 1; i++) seq.push({ a: l.pts[i], b: l.pts[i + 1], cls: l.cls });
    if (!seq.length) { finish(); return; }
    const per = 300;
    const t0 = performance.now();
    const step = (t) => {
      if (!g.isConnected) return;
      const k = (t - t0) / per;
      const i = Math.floor(k);
      if (i >= seq.length) { finish(); return; }
      const s = seq[i];
      const A = S.positions[s.a];
      const B = S.positions[s.b];
      const f = k - i;
      const done = seq.slice(0, i).map((x) => { const P = S.positions[x.a]; const Q = S.positions[x.b]; return P && Q ? `<line class="sb-trail ${x.cls}" x1="${P.x}" y1="${P.y}" x2="${Q.x}" y2="${Q.y}"/>` : ''; }).join('');
      g.innerHTML = done + (A && B ? `<rect class="sb-packet ${s.cls}" x="${(A.x + (B.x - A.x) * f - 9).toFixed(1)}" y="${(A.y + (B.y - A.y) * f - 6).toFixed(1)}" width="18" height="12" rx="2"/>` : '');
      S.anim = { raf: requestAnimationFrame(step) };
    };
    S.anim = { raf: requestAnimationFrame(step) };
  }

  /* ---- project panel ---- */
  function evalChecks() {
    const p = S.project;
    if (!p) return [];
    return p.checks.map((c) => { try { return !!c.fn(S.w); } catch (e) { return false; } });
  }
  function drawSide() {
    const box = $('.sb-proj', S.main);
    const p = S.project;
    if (!p) {
      const list = TT.labProjects || [];
      box.innerHTML = `
        <p class="label">Free build</p>
        <p class="sb-intro">Anything goes on this bench. Build a topology, configure it from the CLI, and watch the link lights. It saves itself as you work.</p>
        <p class="label">Guided projects (${list.length})</p>
        <ol class="sb-plist">${list.map((x, i) => `<li><a href="#lab-${esc(x.id)}"><span class="sb-pnum">${String(i + 1).padStart(2, '0')}</span><span class="sb-pt">${esc(x.title)}${S.store.done[x.id] ? ' <span class="sb-done">Done</span>' : ''}</span><span class="sb-pm">${esc(x.day)} · ${esc(x.level)} · ${x.minutes} min</span></a></li>`).join('')}</ol>`;
      return;
    }
    const steps = solutionSteps(p);
    box.innerHTML = `
      <div class="sb-proj-head">
        <div class="sb-meta"><span class="pill topic">${esc(p.day)}</span><span class="pill">${esc(p.level)}</span><span class="pill">${p.minutes} min</span></div>
        <div class="sb-stampslot"></div>
      </div>
      <p class="sb-brief">${esc(p.brief)}</p>
      <details class="sb-stepsbox" open><summary class="label">Steps</summary><ol class="sb-steps">${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>
      <p class="label sb-checkhead">Checks <span class="sb-count"></span></p>
      <ul class="objs sb-checks"></ul>
      <div class="tools">
        <button type="button" class="btn primary" data-act="check">Check my work</button>
        <button type="button" class="btn" data-act="hint" ${S.hintsShown >= p.hints.length ? 'disabled' : ''}>${S.hintsShown >= p.hints.length ? 'No more hints' : `Hint (${S.hintsShown + 1} of ${p.hints.length})`}</button>
        <button type="button" class="btn quiet" data-act="solution" aria-expanded="${S.showSol}">${S.showSol ? 'Hide solution' : 'Show solution'}</button>
      </div>
      <p class="sb-checkmsg" aria-live="polite"></p>
      ${p.hints.slice(0, S.hintsShown).map((h, i) => `<div class="hint"><b>HINT ${i + 1}</b>${esc(h)}</div>`).join('')}
      ${S.showSol ? `<div class="sb-sol"><p class="label">One working solution</p>${steps.map(([dev, cmds]) => `<div class="sb-sol-dev"><b>${dev === '_build' ? 'On the canvas' : 'On ' + esc(S.w.devices[dev] ? S.w.devices[dev].hostname + (S.w.devices[dev].hostname !== dev ? ' (' + dev + ')' : '') : dev)}</b>${dev === '_build' ? `<ul>${cmds.map((c) => `<li>${esc(describeBuild(c, S.w))}</li>`).join('')}</ul>` : `<pre>${cmds.map(esc).join('\n')}</pre>`}</div>`).join('')}</div>` : ''}
      <div class="sb-wrapup"></div>`;
    drawChecks();
  }
  function drawChecks() {
    const p = S.project;
    if (!p) return;
    const ul = $('.sb-checks', S.main);
    if (!ul) return;
    const st = evalChecks();
    ul.innerHTML = p.checks.map((c, i) => `<li class="${st[i] ? 'ok' : ''}"><span class="box" aria-hidden="true"></span><span>${esc(c.text)}<span class="sr">${st[i] ? ' (done)' : ' (not done)'}</span></span></li>`).join('');
    const n = st.filter(Boolean).length;
    $('.sb-count', S.main).textContent = `${n} of ${st.length}`;
    const all = n === st.length;
    const was = !!S.store.done[p.id];
    if (all && !was) {
      S.store.done[p.id] = new Date().toISOString().slice(0, 10);
      writeStore();
      $('.sb-stampslot', S.main).innerHTML = '<div class="sb-stamp fresh" aria-label="Project complete">COMPLETE</div>';
    } else if (all || was) {
      if (!$('.sb-stamp', S.main)) $('.sb-stampslot', S.main).innerHTML = '<div class="sb-stamp" aria-label="Project complete">COMPLETE</div>';
    }
    const wrap = $('.sb-wrapup', S.main);
    if (wrap) wrap.innerHTML = all && p.takeaway ? `<div class="sb-take"><b>What you just did</b><p>${esc(p.takeaway)}</p>${nextProjectLink(p)}</div>` : '';
  }
  function nextProjectLink(p) {
    const list = TT.labProjects || [];
    const nx = list[list.indexOf(p) + 1];
    return nx ? `<a class="btn primary" href="#lab-${esc(nx.id)}">Next project: ${esc(nx.title)}</a>` : '<a class="btn" href="#lab">Back to all projects</a>';
  }
  function checkWork() {
    const st = evalChecks();
    const n = st.filter(Boolean).length;
    drawChecks();
    const msg = $('.sb-checkmsg', S.main);
    if (n === st.length) msg.innerHTML = '<b class="good">Everything checks out.</b> Nice work.';
    else {
      const first = S.project.checks[st.indexOf(false)];
      msg.innerHTML = `<b>${n} of ${st.length} done.</b> Next up: ${esc(first.text)}.`;
    }
  }

  /* ---- files ---- */
  function fileMsg(t, bad) {
    const el = $('.sb-filemsg', S.main);
    el.textContent = t;
    el.className = 'sb-filemsg' + (bad ? ' bad' : '');
  }
  function drawSaves() {
    const names = Object.keys(S.store.saves).sort((a, b) => (S.store.saves[b].at || '').localeCompare(S.store.saves[a].at || ''));
    $('.sb-saves', S.main).innerHTML = names.length
      ? names.map((n) => { const x = S.store.saves[n]; const pj = x.state && x.state.project && (TT.labProjects || []).find((p) => p.id === x.state.project); return `<li><span class="sb-save-n">${esc(n)}<small>${esc((x.at || '').slice(0, 16).replace('T', ' '))}${pj ? ' · ' + esc(pj.title) : ''}</small></span><button type="button" class="btn" data-act="load" data-name="${esc(n)}">Load</button><button type="button" class="btn quiet" data-act="unsave" data-name="${esc(n)}" aria-label="Delete save ${esc(n)}">Delete</button></li>`; }).join('')
      : '<li class="sb-none">No named saves yet. Your current lab autosaves anyway.</li>';
  }
  function namedSave() {
    const f = $('.sb-saveform', S.main);
    const name = f.name.value.trim();
    if (!name) { fileMsg('Give the save a name.', true); return; }
    S.store.saves[name] = { at: new Date().toISOString(), state: snapshot(S.w, S.positions, S.project ? S.project.id : null) };
    writeStore();
    f.name.value = '';
    drawSaves();
    fileMsg(`Saved "${name}".`);
  }
  /** Put a state into the slot it belongs to, then show it (navigating if it is another project's). */
  function openState(state, label) {
    const err = validateState(state);
    if (err) { fileMsg(err, true); return; }
    const pid = state.project && (TT.labProjects || []).some((p) => p.id === state.project) ? state.project : null;
    const fixed = Object.assign({}, state, { project: pid });
    S.store.slots[pid || 'free'] = fixed;
    writeStore();
    const want = pid ? '#lab-' + pid : '#lab';
    const cur = (G.location && G.location.hash) || '';
    if (cur !== want && (cur || want !== '#lab')) { G.location.hash = want; return; }
    TT.renderSandbox(S.main, { project: pid });
    fileMsg(label);
  }
  function loadNamed(name) {
    const x = S.store.saves[name];
    if (!x) return;
    openState(x.state, `Loaded "${name}".`);
  }
  function exportFile() {
    saveNow();
    const data = JSON.stringify(snapshot(S.w, S.positions, S.project ? S.project.id : null), null, 1);
    const blob = new Blob([data], { type: 'application/json' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.project ? 'harbor-point-' + S.project.id : 'harbor-point-lab') + '.json';
    doc.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    fileMsg('Exported ' + a.download + '.');
  }
  function importFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2e6) { fileMsg('That file is too big to be a lab export.', true); return; }
    const rd = new FileReader();
    rd.onload = () => {
      let o;
      try { o = JSON.parse(rd.result); } catch (err) { fileMsg('That file is not valid JSON.', true); return; }
      openState(o, `Imported ${file.name}.`);
    };
    rd.onerror = () => fileMsg('Could not read that file.', true);
    rd.readAsText(file);
  }
  function newLab(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      const old = btn.textContent;
      btn.textContent = 'Click again to confirm';
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
      return;
    }
    delete S.store.slots[S.slot];
    if (S.project) delete S.store.hints[S.project.id];
    writeStore();
    TT.renderSandbox(S.main, { project: S.project ? S.project.id : null });
    status(S.project ? 'Project restarted from the beginning.' : 'Blank bench. Drag a device in to start.');
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
