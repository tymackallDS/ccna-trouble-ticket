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
    const traceTo = t && !/\?$/.test(t) && TT.labfx ? TT.labfx.traceTarget(d, t) : null;
    if (traceTo) return TT.labfx.traceroute(w, id, traceTo);
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
   * labfx: clean diagram layout and "living" network effects, shared by the
   * ticket topology (app.js) and this lab canvas. Geometry and traceroute are
   * pure (Node tests use them); the effects need a DOM and are skipped in Node.
   * ====================================================================== */
  const FX = (function () {
    const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
    const grow = (b, m) => box(b.x0 - m, b.y0 - m, b.x1 + m, b.y1 + m);
    const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    /** Does the segment (x1,y1)-(x2,y2) pass through box b? (Liang-Barsky clip) */
    function segHits(x1, y1, x2, y2, b) {
      let t0 = 0;
      let t1 = 1;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const edges = [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dy, y1 - b.y0], [dy, b.y1 - y1]];
      for (const [p, q] of edges) {
        if (p === 0) { if (q < 0) return false; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return t0 < t1;
    }
    /** Distance from a glyph's centre to its outline along the unit vector (ux, uy). */
    function exitDist(sh, ux, uy) {
      if (sh.circle) return sh.r;
      const hx = ux >= 0 ? sh.r : -sh.l;
      const hy = uy >= 0 ? sh.b : -sh.t;
      const tx = Math.abs(ux) < 1e-6 ? Infinity : hx / Math.abs(ux);
      const ty = Math.abs(uy) < 1e-6 ? Infinity : hy / Math.abs(uy);
      return Math.min(tx, ty);
    }
    const glyphBox = (n) => box(n.x + n.shape.l, n.y + n.shape.t, n.x + n.shape.r, n.y + n.shape.b);

    /**
     * Lay out a diagram so text never sits on a cable or a device.
     * nodes: [{ id, x, y, shape: {l, r, t, b, circle?}, lines: [{text, w, h}] }]   (name and address lines)
     * links: [{ a, b, la: {text, w, h} | null, lb }]                             (port labels at each end)
     * opts:  { led: px out from the edge for a status light (lab), pad }
     * Returns { nodes: {id: {glyph, label, side, lines: [{x, y}]}}, links: [{x1, y1, x2, y2, ux, uy, len, ea, eb, leda, ledb, pa, pb}], bounds }
     */
    function layout(nodes, links, opts) {
      opts = opts || {};
      links = links.slice();
      const byId = {};
      for (const n of nodes) byId[n.id] = n;
      // parallel cables between the same two devices are drawn side by side, 7px apart
      const pairs = {};
      links.forEach((k, i) => { const key = [k.a, k.b].sort().join('\u0000'); (pairs[key] = pairs[key] || []).push(i); });
      const shift = {};
      const bundle = {}; // first cable of a parallel group -> { members, half }
      for (const [key, idx] of Object.entries(pairs)) {
        if (idx.length < 2) continue;
        const [p, q] = key.split('\u0000');
        const P = byId[p];
        const Q = byId[q];
        if (!P || !Q) continue;
        const L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
        const nx = -(Q.y - P.y) / L;
        const ny = (Q.x - P.x) / L;
        idx.forEach((i, j) => { const o = (j - (idx.length - 1) / 2) * 7; shift[i] = { x: nx * o, y: ny * o }; });
        // one label per end for the bundle ("Gi1/0/23-24"), on the first cable of the group
        if (opts.font) {
          const merge = (labs) => {
            const t = labs.filter(Boolean).map((l) => l.text);
            if (t.length < 2) return labs[0] || null;
            const m = t.map((x) => /^(.*?)(\d+)$/.exec(x));
            let text;
            if (m.every((x) => x && x[1] === m[0][1])) {
              const nums = m.map((x) => Number(x[2])).sort((a, b) => a - b);
              const run = nums.every((v, j) => j === 0 || v === nums[j - 1] + 1);
              text = m[0][1] + (run ? nums[0] + '-' + nums[nums.length - 1] : nums.join(','));
            } else text = t.join(', ');
            return { text, w: measure(text, opts.font), h: labs.find(Boolean).h };
          };
          const first = links[idx[0]];
          const ends = (id) => idx.map((i) => (links[i].a === id ? links[i].la : links[i].lb));
          const la = merge(ends(first.a));
          const lb = merge(ends(first.b));
          idx.forEach((i) => { links[i] = Object.assign({}, links[i], { la: null, lb: null }); });
          links[idx[0]] = Object.assign({}, links[idx[0]], { la, lb });
          bundle[idx[0]] = { members: idx, half: ((idx.length - 1) / 2) * 7 };
        }
      }
      const segs = [];
      links.forEach((k, i) => {
        const A = byId[k.a];
        const B = byId[k.b];
        const sh = shift[i] || { x: 0, y: 0 };
        if (A && B) segs.push({ i, a: k.a, b: k.b, x1: A.x + sh.x, y1: A.y + sh.y, x2: B.x + sh.x, y2: B.y + sh.y });
      });
      const glyphs = nodes.map((n) => ({ id: n.id, b: grow(glyphBox(n), 2) }));
      const placed = [];
      const outNodes = {};
      const GAP = 5;
      // 1. device names: below when that is clear, otherwise the clearest side
      for (const n of nodes) {
        const g = glyphBox(n);
        const lw = Math.max(1, ...n.lines.map((l) => l.w)) + 6;
        const lh = n.lines.reduce((s, l) => s + l.h, 0) + 2;
        // a ring of spots hugging the icon, below first; then the same ring a little further out
        const cands = [];
        const SPOTS = [[90, 0, 'below'], [0, 1.2, 'right'], [180, 1.4, 'left'], [270, 1.6, 'above'], [55, 1.0, 'below-right'], [125, 1.1, 'below-left'], [325, 1.8, 'above-right'], [215, 1.9, 'above-left'], [25, 1.5, 'right-low'], [155, 1.7, 'left-low']];
        for (const extra of [0, 12]) {
          for (const [deg, pref, side] of SPOTS) {
            const cx0 = Math.cos((deg * Math.PI) / 180);
            const cy0 = Math.sin((deg * Math.PI) / 180);
            // smallest step along the direction that clears the icon, plus the gap
            const hx = (cx0 >= 0 ? g.x1 - n.x : n.x - g.x0) + lw / 2 + GAP + extra;
            const hy = (cy0 >= 0 ? g.y1 - n.y : n.y - g.y0) + lh / 2 + GAP + extra;
            const tt = Math.min(Math.abs(cx0) < 1e-6 ? Infinity : hx / Math.abs(cx0), Math.abs(cy0) < 1e-6 ? Infinity : hy / Math.abs(cy0));
            const cx = n.x + cx0 * tt;
            const cy = n.y + cy0 * tt;
            cands.push([side, box(cx - lw / 2, cy - lh / 2, cx + lw / 2, cy + lh / 2), pref + (extra ? 1 : 0)]);
          }
        }
        let best = null;
        for (const [side, b, pref] of cands) {
          let sc = pref;
          for (const s of segs) if (segHits(s.x1, s.y1, s.x2, s.y2, grow(b, 1))) sc += 10;
          for (const o of glyphs) if (o.id !== n.id && overlap(b, o.b)) sc += 30;
          for (const o of placed) if (overlap(b, o)) sc += 30;
          if (opts.bounds && (b.x0 < opts.bounds.x0 || b.x1 > opts.bounds.x1 || b.y0 < opts.bounds.y0)) sc += 1; // the view grows to fit, so only a nudge
          if (!best || sc < best.sc) best = { side, b, sc };
        }
        placed.push(best.b);
        let y = best.b.y0 + 1;
        const cx = (best.b.x0 + best.b.x1) / 2;
        const lines = n.lines.map((l) => { const at = { x: cx, y: y + l.h * 0.78, w: l.w, h: l.h }; y += l.h; return at; });
        outNodes[n.id] = { glyph: glyphBox(n), label: best.b, side: best.side, lines };
      }
      // 2. cable ends: edge points, status lights, then port labels along the cable
      const outLinks = links.map((k, li) => {
        const A0 = byId[k.a];
        const B0 = byId[k.b];
        if (!A0 || !B0) return null;
        const sh = shift[li] || { x: 0, y: 0 };
        const A = { x: A0.x + sh.x, y: A0.y + sh.y, shape: A0.shape };
        const B = { x: B0.x + sh.x, y: B0.y + sh.y, shape: B0.shape };
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const da = exitDist(A.shape, ux, uy);
        const db = exitDist(B.shape, -ux, -uy);
        const o = { x1: A.x, y1: A.y, x2: B.x, y2: B.y, ux, uy, len, da, db, ea: { x: A.x + ux * da, y: A.y + uy * da }, eb: { x: B.x - ux * db, y: B.y - uy * db } };
        if (opts.led) {
          const la = Math.min(da + opts.led, len / 2 - 2);
          const lb = Math.min(db + opts.led, len / 2 - 2);
          o.leda = { x: A.x + ux * la, y: A.y + uy * la };
          o.ledb = { x: B.x - ux * lb, y: B.y - uy * lb };
        }
        return o;
      });
      const lights = [];
      for (const o of outLinks) if (o && o.leda) lights.push(box(o.leda.x - 6, o.leda.y - 6, o.leda.x + 6, o.leda.y + 6), box(o.ledb.x - 6, o.ledb.y - 6, o.ledb.x + 6, o.ledb.y + 6));
      const nameBoxes = nodes.map((n) => grow(outNodes[n.id].label, 1));
      const portBoxes = [];
      links.forEach((k, i) => {
        const o = outLinks[i];
        if (!o) return;
        for (const end of ['a', 'b']) {
          const lab = end === 'a' ? k.la : k.lb;
          if (!lab) continue;
          const bu = bundle[i];
          // a bundle's labels sit outside the whole group, measured from its centre line
          const N = bu ? { x: end === 'a' ? byId[k.a].x : byId[k.b].x, y: end === 'a' ? byId[k.a].y : byId[k.b].y } : end === 'a' ? { x: o.x1, y: o.y1 } : { x: o.x2, y: o.y2 };
          const ux = end === 'a' ? o.ux : -o.ux;
          const uy = end === 'a' ? o.uy : -o.uy;
          const edge = end === 'a' ? o.da : o.db;
          const otherEdge = end === 'a' ? o.db : o.da;
          // the normal that points up (or right, for a vertical cable) is tried first
          let nx = -uy;
          let ny = ux;
          if (ny > 0.25 || (Math.abs(ny) <= 0.25 && nx < 0)) { nx = -nx; ny = -ny; }
          const w = lab.w + 6;
          const h = lab.h + 2;
          const along = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
          const perp = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2 + 3 + (bu ? bu.half : 0);
          const start = edge + 4;
          const stop = Math.max(start, o.len - otherEdge - 6 - 2 * along);
          let best = null;
          for (let d = start; d <= stop + 0.1 || !best; d += 4) {
            for (const side of [1, -1]) {
              const cx = N.x + ux * (d + along) + nx * side * perp;
              const cy = N.y + uy * (d + along) + ny * side * perp;
              const b = box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
              let sc = (d - start) * 0.04 + (side === 1 ? 0 : 0.6);
              for (const gb of glyphs) if (overlap(b, gb.b)) sc += 100;
              for (const nb of nameBoxes) if (overlap(b, nb)) sc += 100;
              for (const pb of portBoxes) if (overlap(b, pb)) sc += 60;
              for (const lb of lights) if (overlap(b, lb)) sc += 20;
              for (const s of segs) if (s.i !== i && !(bu && bu.members.includes(s.i)) && segHits(s.x1, s.y1, s.x2, s.y2, b)) sc += 12;
              if (bu) for (const s of segs) if (bu.members.includes(s.i) && segHits(s.x1, s.y1, s.x2, s.y2, b)) sc += 40;
              if (!best || sc < best.sc) best = { sc, cx, cy, b };
            }
            if (d > stop + 0.1) break;
          }
          portBoxes.push(best.b);
          o[end === 'a' ? 'pa' : 'pb'] = { x: best.cx, y: best.cy + lab.h * 0.36, box: best.b, text: lab.text, w: lab.w, h: lab.h };
        }
      });
      // 3. everything drawn, for the view box
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const take = (b) => { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); };
      for (const n of nodes) { take(outNodes[n.id].glyph); take(outNodes[n.id].label); }
      for (const pb of portBoxes) take(pb);
      const bounds = nodes.length ? box(x0, y0, x1, y1) : box(0, 0, 0, 0);
      return { nodes: outNodes, links: outLinks, bounds };
    }

    /* ---- text measuring (canvas when there is a DOM, a fixed estimate in Node) ---- */
    let ctx = null;
    const cache = {};
    function fam(v, fb) {
      try {
        const s = G.getComputedStyle && G.document ? G.getComputedStyle(G.document.documentElement).getPropertyValue(v).trim() : '';
        return s || fb;
      } catch (e) { return fb; }
    }
    /** Width in px of text set in font {size, weight, mono}. */
    function measure(text, f) {
      const key = (f.mono ? 'm' : 'b') + f.size + (f.weight || 400) + '|' + text;
      if (cache[key] !== undefined) return cache[key];
      let w = null;
      try {
        if (!ctx && G.document) ctx = G.document.createElement('canvas').getContext('2d');
        if (ctx) {
          ctx.font = `${f.weight || 400} ${f.size}px ${f.mono ? fam('--mono', 'monospace') : fam('--body', 'sans-serif')}`;
          w = ctx.measureText(text).width;
        }
      } catch (e) { w = null; }
      if (w === null || !isFinite(w)) w = text.length * f.size * (f.mono ? 0.6 : 0.62);
      cache[key] = w;
      return w;
    }

    /* ---- what a failure means, in a few words (the caption carries it, not the colour) ---- */
    const WHY = {
      'no-route': 'no route', acl: 'ACL deny', 'host-unreachable': 'no ARP reply', 'next-hop-unreachable': 'next hop silent',
      'no-gateway': 'no gateway', 'no-ip': 'no IP address', dai: 'DAI drop', 'nat-pool-exhausted': 'NAT pool full', ttl: 'TTL expired (loop)',
      'no-return-path': 'reply lost', 'v6-routing-off': 'IPv6 routing off', switch: 'cannot route', error: 'error', 'bad-ip': 'bad address',
    };

    /* ---- traceroute (IOS) / tracert (PC), from the simulator's own path ---- */
    const TRACE_IOS = /^\s*(?:do\s+)?trac(?:e|er|ero|erou|erout|eroute)\s+(\S+)\s*$/i;
    const TRACE_PC = /^\s*(?:tracert|traceroute)\s+(\S+)\s*$/i;
    /** The target when this line is a traceroute this device can run now, else null. */
    function traceTarget(d, line) {
      if (!d || d.locked) return null;
      if (d.kind === 'pc') { const m = TRACE_PC.exec(line); return m ? m[1] : null; }
      const m = TRACE_IOS.exec(line);
      if (!m) return null;
      const doForm = /^\s*do\s/i.test(line);
      if (doForm) return d.mode !== 'user' && d.mode !== 'priv' ? m[1] : null;
      return d.mode === 'user' || d.mode === 'priv' ? m[1] : null;
    }
    function traceroute(w, srcId, target) {
      const d = w.devices[srcId];
      const pc = d.kind === 'pc';
      const ip = TT.ip.ipToInt(target);
      if (ip === null) return pc ? [`Unable to resolve target system name ${target}.`] : ['% Unrecognized host or address, or protocol not running.'];
      const tr = TT.net.tracePath(w, srcId, target);
      w.events.push({ type: 'traceroute', from: srcId, to: target, ok: tr.ok });
      const L = pc ? ['', `Tracing route to ${target} over a maximum of 30 hops:`, ''] : ['Type escape sequence to abort.', `Tracing the route to ${target}`, 'VRF info: (vrf in name/id, vrf out name/id)'];
      const n = (k) => String(k).padStart(3);
      const ok = (k, a) => (pc ? `${n(k)}    <1 ms    <1 ms    <1 ms  ${a}` : `${n(k)} ${a} 1 msec 0 msec 1 msec`);
      const quiet = (k) => (pc ? `${n(k)}     *        *        *     Request timed out.` : `${n(k)}  *  *  *`);
      const unreach = (k, a, code) => (pc ? `${n(k)}  ${a}  reports: ${code === 'A' ? 'Communication administratively prohibited' : code === 'N' ? 'Destination net unreachable' : 'Destination host unreachable'}.` : `${n(k)} ${a} !${code}  !${code}  !${code}`);
      if (tr.local) { L.push(ok(1, target)); if (pc) L.push('', 'Trace complete.'); return L; }
      // each router answers from the address the probe arrived on, if its answer can get home
      const home = tr.srcIp;
      const answers = (dev) => !!home && (dev === srcId || TT.net.tracePath(w, dev, home).ok);
      let k = 0;
      for (const h of tr.there.l3) {
        k++;
        if (tr.ok && h === tr.there.l3[tr.there.l3.length - 1]) { L.push(ok(k, target)); continue; }
        L.push(answers(h.dev) && h.ip ? ok(k, h.ip) : quiet(k));
      }
      if (!tr.ok) {
        const f = tr.fail || {};
        const at = f.at;
        const last = tr.there.l3[tr.there.l3.length - 1];
        // an inbound ACL drops the probe before its TTL is looked at; otherwise the router first answers
        // "time exceeded" (the line above) and then "unreachable" for the next probe
        const atIp = f.ip || (at === srcId ? (pc && d.pc.ip) || null : last && last.dev === at ? last.ip : null);
        const arp = f.reason === 'host-unreachable' || f.reason === 'next-hop-unreachable';
        const code = f.reason === 'acl' ? 'A' : f.reason === 'no-route' ? 'N' : arp && (at !== srcId || pc) ? 'H' : null;
        if (f.leg === 'there' && code && atIp && (at === srcId || answers(at))) L.push(unreach(k + 1, atIp, code));
        else {
          for (let j = 1; j <= 3; j++) L.push(quiet(k + j));
          L.push(pc ? '(Stopped after 3 silent hops. A real tracert keeps going to 30.)' : '(Stopped after 3 silent hops. Press Ctrl+Shift+6 to abort a real one.)');
        }
      }
      if (pc) L.push('', 'Trace complete.');
      return L;
    }

    /* ====================== effects (browser only) ====================== */
    const SVGNS = 'http://www.w3.org/2000/svg';
    const reducedMotion = () => !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function el(parent, tag, attrs, text) {
      const e = G.document.createElementNS(SVGNS, tag);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    /** Caption with a halo: the words are the signal, colour only backs them up. */
    function caption(layer, x, y, text, cls, view) {
      const g = el(layer, 'g', { class: 'lfx-cap ' + (cls || '') });
      const w = measure(text, { size: 11, weight: 600 }) + 10;
      // keep the whole caption on screen
      if (view) { x = Math.max(view.x0 + w / 2 + 4, Math.min(view.x1 - w / 2 - 4, x)); y = Math.max(view.y0 + 13, y); }
      el(g, 'rect', { x: (x - w / 2).toFixed(1), y: (y - 9).toFixed(1), width: w.toFixed(1), height: 17, rx: 4 });
      el(g, 'text', { x: x.toFixed(1), y: (y + 3.5).toFixed(1), 'text-anchor': 'middle' }, text);
      return g;
    }
    function failMark(layer, P, title) {
      const g = el(layer, 'g', { class: 'lfx-x', transform: `translate(${P.x.toFixed(1)} ${P.y.toFixed(1)})` });
      el(g, 'title', {}, title);
      el(g, 'circle', { r: 15 });
      el(g, 'path', { d: 'M-6 -6L6 6M6 -6L-6 6' });
      return g;
    }
    const pts = (leg, pos) => {
      if (!leg) return [];
      const ids = leg.devs;
      return ids.map((id) => pos(id)).filter(Boolean);
    };
    const polyLen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };
    const ptsAttr = (p) => p.map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ');

    /**
     * Play (or, with reduced motion, show) a traced ping on a diagram.
     * o: { under: <g> under the devices, over: <g> above them, pos: (id) => {x, y, top},
     *      trace: TT.net.tracePath result, name: (id) => hostname, target: 'a.b.c.d', kind: 'ping'|'traceroute',
     *      view: () => {x0, y0, x1, y1} visible area, so captions stay on screen }
     * Returns { cancel() }.
     */
    function play(o) {
      const { under, over, pos, trace } = o;
      if (!under || !over || !trace) return { cancel() {} };
      under.querySelectorAll('.lfx-run').forEach((x) => x.remove());
      over.querySelectorAll('.lfx-run').forEach((x) => x.remove());
      const gu = el(under, 'g', { class: 'lfx-run' });
      const go = el(over, 'g', { class: 'lfx-run', 'aria-hidden': 'true' });
      const reduce = reducedMotion();
      const fail = trace.ok ? null : trace.fail;
      const src = trace.there.devs[0];
      const there = pts(trace.there, pos);
      const back = trace.back && (trace.ok || (fail && fail.leg === 'back')) ? pts(trace.back, pos) : [];
      const ok = trace.ok;
      const word = o.kind === 'traceroute' ? 'Trace' : 'Echo';
      const ending = () => {
        if (TT.sfx) TT.sfx(ok ? 'ping-ok' : 'ping-fail');
        if (ok) {
          if (trace.local) { const P = pos(src); if (P) caption(go, P.x, (P.top || P.y - 26) - 10, 'Replied to itself', 'good', o.view && o.view()); return; }
          const P = pos(src);
          if (P) caption(go, P.x, (P.top || P.y - 26) - 10, `Reply from ${o.target}`, 'good', o.view && o.view());
        } else {
          const at = fail && fail.at ? fail.at : src;
          const P = pos(at);
          if (!P) return;
          const why = WHY[fail && fail.reason] || (fail && fail.reason) || 'dropped';
          failMark(go, P, `${fail && fail.leg === 'back' ? 'Reply' : word} dropped at ${o.name ? o.name(at) : at}: ${why}`);
          caption(go, P.x, (P.top || P.y - 26) - 10, `${fail && fail.leg === 'back' ? 'Reply' : word} dropped: ${why}`, 'bad', o.view && o.view());
        }
      };
      const trailCls = (leg) => 'lfx-trail ' + leg + (ok ? ' ok' : ' bad');
      if (reduce) {
        // no travel: the whole result path, drawn at once, stays until the diagram redraws
        if (there.length > 1) el(gu, 'polyline', { class: trailCls('there') + ' static', points: ptsAttr(there) });
        if (back.length > 1) el(gu, 'polyline', { class: trailCls('back') + ' static', points: ptsAttr(back) });
        ending();
        return { cancel() { gu.remove(); go.remove(); } };
      }
      const legs = [];
      if (there.length) legs.push({ p: there, leg: 'there' });
      if (back.length) legs.push({ p: back, leg: 'back' });
      const SPEED = 0.42; // px per ms
      const PAUSE = 80; // ms at each device
      let li = 0;
      let seg = 0;
      let t0 = 0;
      let raf = 0;
      let dead = false;
      let trail = null;
      const dot = el(gu, "circle", { class: "lfx-dot " + (ok ? "ok" : "try"), r: 6 });
      const segDur = (a, b) => Math.max(160, Math.hypot(b.x - a.x, b.y - a.y) / SPEED);
      const startLeg = () => {
        const L = legs[li];
        trail = el(gu, 'polyline', { class: trailCls(L.leg), points: ptsAttr([L.p[0]]) });
        dot.setAttribute('class', 'lfx-dot ' + (ok ? 'ok' : 'try') + (L.leg === 'back' ? ' back' : ''));
        seg = 0;
        t0 = 0;
      };
      const finish = () => {
        dot.remove();
        ending();
        // leave the trail a moment, then fade it
        G.setTimeout(() => { if (gu.isConnected) gu.classList.add('lfx-fade'); if (go.isConnected) go.classList.add('lfx-fade'); }, 2600);
        G.setTimeout(() => { gu.remove(); go.remove(); }, 3400);
      };
      const step = (now) => {
        if (dead || !gu.isConnected) return;
        if (!legs.length) { finish(); return; }
        const L = legs[li];
        if (!trail) startLeg();
        if (!t0) t0 = now;
        // positions are read every frame, so a device dragged mid-flight takes its cable with it
        const pathPts = (L.leg === 'there' ? trace.there : trace.back).devs.map((id) => pos(id)).filter(Boolean);
        if (pathPts.length < 2) {
          dot.setAttribute('cx', pathPts[0].x); dot.setAttribute('cy', pathPts[0].y);
          li++; trail = null;
          if (li >= legs.length) { finish(); return; }
          raf = G.requestAnimationFrame(step);
          return;
        }
        const a = pathPts[seg];
        const b = pathPts[seg + 1];
        const dur = segDur(a, b);
        const el2 = now - t0;
        const f = Math.min(1, el2 / dur);
        const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        const x = a.x + (b.x - a.x) * e;
        const y = a.y + (b.y - a.y) * e;
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        trail.setAttribute('points', ptsAttr(pathPts.slice(0, seg + 1).concat([{ x, y }])));
        if (el2 >= dur + PAUSE) {
          seg++;
          t0 = now;
          if (seg >= pathPts.length - 1) {
            li++;
            trail = null;
            if (li >= legs.length) { finish(); return; }
          }
        }
        raf = G.requestAnimationFrame(step);
      };
      raf = G.requestAnimationFrame(step);
      return { cancel() { dead = true; G.cancelAnimationFrame(raf); gu.remove(); go.remove(); } };
    }

    /**
     * Link state changes: a cable that came up gets a green pulse along it, one that went down flashes red.
     * prev: {key: 'up'|'down'} from the last draw (or null on first draw); items: [{key, up, x1, y1, x2, y2, line}]
     * Returns the new state map.
     */
    function linkChanges(prev, items, layer) {
      const next = {};
      const reduce = reducedMotion();
      for (const it of items) {
        const st = it.up ? 'up' : 'down';
        next[it.key] = st;
        if (!prev) continue;
        const was = prev[it.key] === undefined ? 'down' : prev[it.key]; // a brand-new cable counts as coming up
        if (was === st) continue;
        if (TT.sfx) TT.sfx(st === 'up' ? 'link-up' : 'link-down');
        if (st === 'up') {
          if (!layer) continue;
          const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
          const p = el(layer, 'line', { class: 'lfx-pulse' + (reduce ? ' still' : ''), x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, style: `--len:${len.toFixed(0)}` });
          G.setTimeout(() => p.remove(), 1700);
        } else if (it.line) {
          it.line.classList.add('lfx-downflash');
        }
      }
      return next;
    }

    /** Hovering or focusing a device lightly highlights its cables. */
    function hoverLinks(svg, nodeSel, linkSel) {
      const set = (id, on) => {
        svg.querySelectorAll(linkSel).forEach((l) => { if (l.getAttribute('data-a') === id || l.getAttribute('data-b') === id) l.classList.toggle('lfx-hl', on); });
      };
      svg.querySelectorAll(nodeSel).forEach((n) => {
        const id = n.getAttribute('data-dev');
        n.addEventListener('pointerenter', () => set(id, true));
        n.addEventListener('pointerleave', () => set(id, false));
        n.addEventListener('focus', () => set(id, true));
        n.addEventListener('blur', () => set(id, false));
      });
    }

    /** New ping/traceroute events since index i0: [{from, to, kind}] (IPv4 and IPv6). */
    function newProbes(w, i0) {
      return (w.events || []).slice(i0).filter((e) => (e.type === 'ping' || e.type === 'ping6' || e.type === 'traceroute' || e.type === 'pingtest') && e.from && e.to)
        .map((e) => ({ from: e.from, to: e.to, kind: e.type === 'traceroute' ? 'traceroute' : 'ping' }));
    }

    return { layout, overlap, segHits, exitDist, measure, traceroute, traceTarget, play, linkChanges, hoverLinks, newProbes, caption, WHY, reducedMotion };
  })();
  TT.labfx = FX;

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
    if (S && S.fxRun) S.fxRun.cancel();
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
                  <g class="sb-links"></g><g class="sb-fxu"></g><g class="sb-nodes"></g><g class="sb-anim"></g>
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

  /* Icon extents (centre-relative), so cables, lights, port labels and names are placed around them. */
  const LAB_SHAPES = {
    router: { l: -22, r: 22, t: -22, b: 22, circle: true },
    switch: { l: -30, r: 30, t: -15, b: 15 },
    mls: { l: -30, r: 30, t: -17, b: 17 },
    laptop: { l: -25, r: 25, t: -17, b: 15 },
    server: { l: -15, r: 15, t: -22, b: 22 },
    pc: { l: -20, r: 20, t: -18, b: 18 },
  };
  const LF_HOST = { size: 12.5, weight: 600 };
  const LF_SUB = { size: 10.5, mono: true };
  const LF_PORT = { size: 10, mono: true };
  function computeLayout() {
    const w = S.w;
    const P = S.positions;
    const nodes = Object.keys(w.devices).filter((id) => P[id]).map((id) => {
      const d = w.devices[id];
      const type = d.type || inferType(d);
      const sub = subLabel(d);
      return { id, x: P[id].x, y: P[id].y, type, shape: LAB_SHAPES[type] || LAB_SHAPES.pc, lines: [{ text: d.hostname, w: FX.measure(d.hostname, LF_HOST), h: 15, cls: 'sb-host' }, { text: sub, w: FX.measure(sub, LF_SUB), h: 13, cls: 'sb-sub' }] };
    });
    const lab = (n) => (n === 'NIC' ? null : { text: short(n), w: FX.measure(short(n), LF_PORT), h: 12 });
    const links = w.links.map(([a, ai, b, bi]) => ({ a, b, la: lab(ai), lb: lab(bi) }));
    S.lay = FX.layout(nodes, links, { led: 7, font: LF_PORT });
    S.layNodes = nodes;
    return S.lay;
  }

  function drawCanvas(reuseLights) {
    if (!S) return;
    ensurePositions();
    const w = S.w;
    const focused = doc.activeElement;
    const fDev = focused && focused.getAttribute && focused.getAttribute('data-dev');
    const fLink = focused && focused.getAttribute && focused.getAttribute('data-link');
    const fresh = !reuseLights || !S.lights || S.lights.length !== w.links.length;
    if (fresh) S.lights = linkStates(w);
    const lay = computeLayout();
    let links = '';
    const changes = [];
    w.links.forEach(([a, ai, b, bi], k) => {
      const o = lay.links[k];
      if (!o) return;
      const st = S.lights[k] || ['down', 'down'];
      const ia = w.devices[a].interfaces[ai] || {};
      const ib = w.devices[b].interfaces[bi] || {};
      const trunk = ia.mode === 'trunk' || ib.mode === 'trunk';
      const sel = S.sel && S.sel.link === k;
      const down = st[0] === 'down' || st[1] === 'down';
      const words = { up: 'up', block: 'blocking (Spanning Tree)', down: 'down' };
      const nm = (id, p) => `${w.devices[id].hostname} ${short(p)}`;
      const port = (P) => (P ? `<rect class="lfx-halo" x="${P.box.x0.toFixed(1)}" y="${P.box.y0.toFixed(1)}" width="${(P.box.x1 - P.box.x0).toFixed(1)}" height="${(P.box.y1 - P.box.y0).toFixed(1)}" rx="3"/><text class="sb-port" x="${P.x.toFixed(1)}" y="${P.y.toFixed(1)}" text-anchor="middle">${esc(P.text)}</text>` : '');
      const led = (L, s) => (s === 'block'
        ? `<g class="sb-led-g block" transform="translate(${L.x.toFixed(1)} ${L.y.toFixed(1)})"><circle class="sb-led block" r="6"/><path class="sb-led-bars" d="M-1.9 -3v6M1.9 -3v6"/></g>`
        : `<circle class="sb-led ${s}" cx="${L.x.toFixed(1)}" cy="${L.y.toFixed(1)}" r="5"/>`);
      links += `<g class="sb-link${trunk ? ' trunk' : ''}${sel ? ' sel' : ''}${down ? ' is-down' : ''}" data-link="${k}" data-a="${esc(a)}" data-b="${esc(b)}" tabindex="0" role="button" aria-label="Cable ${esc(nm(a, ai))} (${words[st[0]]}) to ${esc(nm(b, bi))} (${words[st[1]]})${trunk ? ', trunk' : ''}">
        <line class="sb-wire-hit" x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}"/>
        <line class="sb-wire" x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}"/>
        ${down ? '' : `<line class="lfx-shimmer" x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" style="animation-delay:-${((k * 1.37) % 4).toFixed(2)}s"/>`}
        ${led(o.leda, st[0])}${led(o.ledb, st[1])}
        ${port(o.pa)}${port(o.pb)}
      </g>`;
      changes.push({ key: `${a}|${ai}|${b}|${bi}`, up: !down, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, k });
    });
    let nodes = '';
    for (const n of S.layNodes) {
      const id = n.id;
      const d = w.devices[id];
      const type = n.type;
      const N = lay.nodes[id];
      const lb = N.label;
      const hx0 = Math.min(N.glyph.x0, lb.x0) - n.x - 4;
      const hy0 = Math.min(N.glyph.y0, lb.y0) - n.y - 4;
      const hx1 = Math.max(N.glyph.x1, lb.x1) - n.x + 4;
      const hy1 = Math.max(N.glyph.y1, lb.y1) - n.y + 4;
      const cls = ['sb-node', S.sel && S.sel.dev === id ? 'sel' : '', S.cable && S.cable.a === id ? 'src' : '', S.panel && S.panel.id === id ? 'open' : ''].join(' ');
      nodes += `<g class="${cls}" data-dev="${esc(id)}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button" aria-label="${esc(d.hostname)}, ${esc(TYPES[type].label)}${d.kind === 'pc' ? ', ' + esc(subLabel(d)) : ''}">
        <rect class="sb-hit" x="${hx0.toFixed(1)}" y="${hy0.toFixed(1)}" width="${(hx1 - hx0).toFixed(1)}" height="${(hy1 - hy0).toFixed(1)}"/>
        ${icon(type)}
        <rect class="lfx-halo name" x="${(lb.x0 - n.x).toFixed(1)}" y="${(lb.y0 - n.y).toFixed(1)}" width="${(lb.x1 - lb.x0).toFixed(1)}" height="${(lb.y1 - lb.y0).toFixed(1)}" rx="4"/>
        ${n.lines.map((l, j) => `<text class="${l.cls}" x="${(N.lines[j].x - n.x).toFixed(1)}" y="${(N.lines[j].y - n.y).toFixed(1)}" text-anchor="middle">${esc(l.text)}</text>`).join('')}
      </g>`;
    }
    $('.sb-links', S.main).innerHTML = links;
    $('.sb-nodes', S.main).innerHTML = nodes;
    if (fresh) {
      const wires = {};
      $$('.sb-link', S.main).forEach((g) => { wires[g.dataset.link] = $('.sb-wire', g); });
      S.fxLinks = FX.linkChanges(S.fxLinks || null, changes.map((c) => Object.assign(c, { line: wires[c.k] })), $('.sb-fxu', S.main));
    }
    FX.hoverLinks($('.sb-svg', S.main), '.sb-node', '.sb-link');
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
    // fit what is drawn, names and port labels included, with room above for ping captions
    const B = computeLayout().bounds;
    const minX = Math.min(B.x0, ...pts.map((p) => p.x - 40)) - 20;
    const maxX = Math.max(B.x1, ...pts.map((p) => p.x + 40)) + 20;
    const minY = Math.min(B.y0, ...pts.map((p) => p.y - 30)) - 34;
    const maxY = Math.max(B.y1, ...pts.map((p) => p.y + 40)) + 16;
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
    const ev0 = S.w.events.length;
    try { out = help ? run(S.sess, id, line + '?') : run(S.sess, id, line); } catch (e) { out = ['% ' + e.message]; }
    for (const l of out) log.push([classify(l), l]);
    if (log.length > 500) log.splice(0, log.length - 500);
    drawTerm();
    afterChange(null, { keepPanel: true });
    refreshPanelHead();
    const probes = FX.newProbes(S.w, ev0);
    if (probes.length) playProbe(probes[probes.length - 1]);
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
    try { r = TT.net.tracePath(S.w, src, dst); } catch (e) { r = { ok: false, reason: 'ttl', there: { devs: [src], cables: [], l3: [] }, back: null, fail: { at: src, leg: 'there', reason: 'ttl' } }; }
    const name = (id) => (S.w.devices[id] ? S.w.devices[id].hostname : id);
    const path = (devs) => (devs || []).map(name).map(esc).join(' → ');
    S.w.events.push({ type: 'pingtest', from: src, to: dst, ok: r.ok });
    playProbe({ from: src, to: dst, kind: 'ping' }, r);
    if (r.ok && r.local) { res.innerHTML = '<span class="good">Reply from itself.</span> That is the source\'s own address.'; return; }
    const there = r.there ? r.there.devs : [src];
    const back = r.back ? r.back.devs : null;
    const fl = r.fail || {};
    if (r.ok) res.innerHTML = `<span class="good">Success.</span> Echo: ${path(there)}. Reply: ${path(back)}.`;
    else res.innerHTML = `<span class="bad">Failed:</span> ${esc(REASONS[fl.leg === 'back' ? 'no-return-path' : r.reason] || r.reason)}${fl.leg === 'back' && fl.reason && fl.reason !== 'no-return-path' ? ` (${esc(REASONS[fl.reason] || fl.reason)})` : ''}${fl.at ? ` at ${esc(name(fl.at))}` : ''}.${there.length > 1 ? ` Got as far as ${path(there)}.` : ''}${back && back.length > 1 ? ` Reply got as far as ${path(back)}.` : ''}`;
  }
  /** Animate a ping or traceroute along the path the simulator really used (trace may be passed in). */
  function playProbe(p, trace) {
    if (!S || !S.w.devices[p.from]) return;
    try { trace = trace || TT.net.tracePath(S.w, p.from, p.to); } catch (e) { return; }
    if (S.fxRun) S.fxRun.cancel();
    S.fxRun = FX.play({
      under: $('.sb-fxu', S.main),
      over: $('.sb-anim', S.main),
      trace,
      target: p.to,
      kind: p.kind,
      name: (id) => (S.w.devices[id] ? S.w.devices[id].hostname : id),
      view: () => { const c = canvasSize(); const z = S.view.z; return { x0: -S.view.x / z, y0: -S.view.y / z, x1: (c.w - S.view.x) / z, y1: (c.h - S.view.y) / z }; },
      pos: (id) => {
        const P = S.positions[id];
        const N = S.lay && S.lay.nodes[id];
        const n = S.layNodes && S.layNodes.find((x) => x.id === id);
        return P ? { x: P.x, y: P.y, top: N && n ? Math.min(N.glyph.y0, N.label.y0) - n.y + P.y : P.y - 30 } : null;
      },
    });
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
