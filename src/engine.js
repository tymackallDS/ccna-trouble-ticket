/* Trouble Ticket — network model + simulated Cisco IOS CLI.
 * Works in the browser (inlined by build.mjs) and in Node (tests import it).
 * Everything hangs off globalThis.TT so the build can concatenate plain scripts.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  /* ------------------------------------------------------------------ *
   * IPv4 helpers
   * ------------------------------------------------------------------ */
  function ipToInt(s) {
    if (typeof s !== 'string') return null;
    const p = s.trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const x of p) {
      if (!/^\d{1,3}$/.test(x)) return null;
      const v = Number(x);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  }
  function intToIp(n) {
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  function prefixToMaskInt(p) {
    return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  }
  function maskToPrefix(m) {
    const n = ipToInt(m);
    if (n === null) return null;
    let p = 0;
    let zero = false;
    for (let i = 31; i >= 0; i--) {
      if ((n >>> i) & 1) {
        if (zero) return null;
        p++;
      } else zero = true;
    }
    return p;
  }
  function netOf(ipInt, p) {
    return (ipInt & prefixToMaskInt(p)) >>> 0;
  }
  function wildMatch(ipInt, netInt, wildInt) {
    return ((ipInt | wildInt) >>> 0) === ((netInt | wildInt) >>> 0);
  }
  TT.ip = { ipToInt, intToIp, prefixToMaskInt, maskToPrefix, netOf, wildMatch };

  /* IPv6 helpers. Addresses are stored as strings; math uses BigInt. */
  function v6parse(str) {
    if (typeof str !== 'string') return null;
    const t = str.trim().toLowerCase();
    if (!/^[0-9a-f:]+$/.test(t) || !t.includes(':')) return null;
    const parts = t.split('::');
    if (parts.length > 2) return null;
    const head = parts[0] ? parts[0].split(':') : [];
    const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
    let groups;
    if (parts.length === 1) {
      if (head.length !== 8) return null;
      groups = head;
    } else {
      const fill = 8 - head.length - tail.length;
      if (fill < 1) return null;
      groups = [...head, ...Array(fill).fill('0'), ...tail];
    }
    let n = 0n;
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      n = (n << 16n) | BigInt(parseInt(g, 16));
    }
    return n;
  }
  function v6fmt(n) {
    const g = [];
    for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn).toString(16).toUpperCase());
    let best = -1;
    let len = 0;
    for (let i = 0; i < 8; ) {
      if (g[i] === '0') {
        let j = i;
        while (j < 8 && g[j] === '0') j++;
        if (j - i > len && j - i > 1) { best = i; len = j - i; }
        i = j;
      } else i++;
    }
    if (best < 0) return g.join(':');
    return g.slice(0, best).join(':') + '::' + g.slice(best + len).join(':');
  }
  function v6net(n, p) {
    if (p === 0) return 0n;
    const all = (1n << 128n) - 1n;
    return n & (all ^ ((1n << BigInt(128 - p)) - 1n));
  }
  function v6pfx(str) {
    const m = /^([0-9a-f:]+)\/(\d{1,3})$/i.exec(String(str || '').trim());
    if (!m) return null;
    const a = v6parse(m[1]);
    const p = Number(m[2]);
    if (a === null || p > 128) return null;
    return { addr: a, p };
  }
  TT.ip6 = { v6parse, v6fmt, v6net, v6pfx };

  /* ------------------------------------------------------------------ *
   * Interface names
   * ------------------------------------------------------------------ */
  const IF_TYPES = [
    ['GigabitEthernet', 'Gi'],
    ['FastEthernet', 'Fa'],
    ['Loopback', 'Lo'],
    ['Serial', 'Se'],
    ['Port-channel', 'Po'],
    ['Vlan', 'Vl'],
  ];
  function canonIf(tok) {
    const m = /^([a-z-]+)\s*(\d+(?:\/\d+)*(?:\.\d+)?)$/i.exec(String(tok || '').trim());
    if (!m) return null;
    const t = m[1].toLowerCase();
    for (const [full] of IF_TYPES) {
      if (full.toLowerCase().startsWith(t)) return full + m[2];
    }
    return null;
  }
  function shortIf(name) {
    if (/^Vlan\d+$/.test(name)) return name;
    for (const [full, s] of IF_TYPES) if (name.startsWith(full)) return s + name.slice(full.length);
    return name;
  }
  const isSub = (n) => /\.\d+$/.test(n);
  const parentIf = (n) => (isSub(n) ? n.replace(/\.\d+$/, '') : n);
  TT.ifname = { canonIf, shortIf, isSub, parentIf };

  /* ------------------------------------------------------------------ *
   * World model
   *   world = { devices: { id: device }, links: [[idA, ifA, idB, ifB], ...] }
   *   device.kind = 'router' | 'switch' | 'pc'
   * ------------------------------------------------------------------ */
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function makeWorld(def) {
    const w = clone(def);
    for (const [id, d] of Object.entries(w.devices)) {
      d.id = id;
      d.interfaces = d.interfaces || {};
      if (d.kind === 'pc') {
        d.interfaces.NIC = d.interfaces.NIC || {};
        d.pc = d.pc || {};
      }
      if (d.kind === 'switch') {
        d.vlans = d.vlans || { 1: 'default' };
        if (!d.vlans[1]) d.vlans[1] = 'default';
        for (const i of Object.values(d.interfaces)) {
          if (!i.mode) i.mode = 'access';
          if (i.accessVlan === undefined) i.accessVlan = 1;
          if (i.trunkAllowed === undefined) i.trunkAllowed = 'all';
          if (i.shutdown === undefined) i.shutdown = false;
        }
      }
      if (d.aclText) {
        d.acls = {};
        for (const [num, lines] of Object.entries(d.aclText)) d.acls[num] = lines.map((l) => parseAce(Number(num), l));
        delete d.aclText;
      }
      if (d.kind === 'router') {
        d.routes = d.routes || [];
        for (const i of Object.values(d.interfaces)) {
          if (i.shutdown === undefined) i.shutdown = true;
        }
      }
      d.flags = d.flags || {};
      d.mode = 'user';
      d.ctx = null;
    }
    w.events = [];
    return w;
  }

  function linkPeer(w, id, ifn) {
    ifn = parentIf(ifn);
    for (const [a, ai, b, bi] of w.links) {
      if (a === id && ai === ifn) return [b, bi];
      if (b === id && bi === ifn) return [a, ai];
    }
    return null;
  }

  function adminUp(w, id, ifn) {
    const d = w.devices[id];
    if (!d) return false;
    if (d.kind === 'pc') return true;
    const i = d.interfaces[ifn];
    if (!i || i.shutdown || i.errdis) return false;
    if (isSub(ifn)) {
      const par = d.interfaces[parentIf(ifn)];
      return !!par && !par.shutdown;
    }
    return true;
  }

  /** Physical link up: both ends administratively up and cabled. Loopbacks are up when not shut. */
  function linkUp(w, id, ifn) {
    if (!adminUp(w, id, ifn)) return false;
    if (/^Loopback/.test(ifn)) return true;
    if (/^Vlan\d+$/.test(ifn)) return sviUp(w, id, ifn);
    if (/^Port-channel/.test(ifn)) return poUp(w, id, ifn);
    if (isSub(ifn)) return linkUp(w, id, parentIf(ifn));
    const p = linkPeer(w, id, ifn);
    if (!p) return false;
    if (!adminUp(w, p[0], p[1])) return false;
    // two hard-coded, different speeds never come up
    const a = w.devices[id].interfaces[ifn] || {};
    const b = (w.devices[p[0]].interfaces || {})[p[1]] || {};
    if (a.speed && b.speed && a.speed !== b.speed) return false;
    return true;
  }
  /** Negotiated speed and duplex for a physical port: { speed, duplex, mismatch: 'late'|'crc'|null } */
  function linkParams(w, id, ifn) {
    const d = w.devices[id];
    const i = d.interfaces[ifn] || {};
    const p = linkPeer(w, id, ifn);
    const o = p ? (w.devices[p[0]].interfaces || {})[p[1]] || {} : {};
    const max = /^Gigabit/.test(ifn) ? 1000 : /^FastEthernet/.test(ifn) ? 100 : 1000;
    const omax = p && /^FastEthernet/.test(p[1]) ? 100 : p && w.devices[p[0]].kind === 'pc' ? 1000 : 1000;
    const speed = Number(i.speed || o.speed || Math.min(max, omax));
    const fixed = (x) => !!(x.speed && x.duplex); // both set = autonegotiation off
    const dupOf = (x, y) => (x.duplex ? x.duplex : fixed(y) ? (speed >= 1000 ? 'full' : 'half') : y.duplex || 'full');
    const mine = dupOf(i, o);
    const theirs = p ? dupOf(o, i) : mine;
    return { speed, duplex: mine, mismatch: mine === theirs ? null : mine === 'half' ? 'late' : 'crc' };
  }
  const ifMac = (d, n) => (d.kind === 'pc' ? pcMac(d) : ['00' + hex4(d.id + n).slice(2), hex4(n + d.id), hex4(d.hostname + n)].join('.'));

  /** An SVI is up when its VLAN exists and at least one Layer 2 port in that VLAN is up. */
  function sviUp(w, id, ifn) {
    const d = w.devices[id];
    const v = Number(ifn.slice(4));
    if (!d.vlans || !d.vlans[v]) return false;
    return Object.entries(d.interfaces).some(([n, i]) => !/^(Vlan|Port-channel)/.test(n) && !i.routed && !i.shutdown && (isTrunk(w, id, n) ? vlanAllowed(i, v) : i.accessVlan === v) && linkUp(w, id, n));
  }
  /** Far end of a routed port-channel: the peer switch's port-channel that the members land in. */
  function poPeer(w, id, ifn) {
    const d = w.devices[id];
    const g = Number(ifn.replace('Port-channel', ''));
    for (const [n, i] of Object.entries(d.interfaces).sort((a, b) => ifSort(a[0], b[0]))) {
      if (!i.channel || i.channel.group !== g) continue;
      const p = linkPeer(w, id, n);
      if (!p) continue;
      const oi = w.devices[p[0]].interfaces[p[1]];
      if (oi && oi.channel) return [p[0], 'Port-channel' + oi.channel.group];
    }
    return null;
  }
  function ipOf(w, id, ifn) {
    const d = w.devices[id];
    if (!d) return null;
    if (d.kind === 'pc') return d.pc.ip ? ipToInt(d.pc.ip) : null;
    const i = d.interfaces[ifn];
    return i && i.ip ? ipToInt(i.ip) : null;
  }
  function prefixOf(w, id, ifn) {
    const d = w.devices[id];
    if (d.kind === 'pc') return d.pc.mask ? maskToPrefix(d.pc.mask) : null;
    const i = d.interfaces[ifn];
    return i && i.mask ? maskToPrefix(i.mask) : null;
  }
  function l3Up(w, id, ifn) {
    return linkUp(w, id, ifn) && ipOf(w, id, ifn) !== null;
  }

  /* ---- Layer 2: which L3 endpoints share a broadcast domain ---------- */
  const nativeOf = (p) => p.nativeVlan || 1;
  /** Administrative mode with the Catalyst default: an untouched access port is really "dynamic auto". */
  const adminMode = (p) => (p.mode === 'access' && !p.modeSet && !p.routed ? 'dynamic-auto' : p.mode);
  /** DTP outcome: is this switch port operating as a trunk? */
  function isTrunk(w, dev, port) {
    const d = w.devices[dev];
    const p = d && d.interfaces[port];
    if (!p || p.routed) return false;
    const m = adminMode(p);
    if (m === 'trunk') return true;
    if (m !== 'dynamic-desirable' && m !== 'dynamic-auto') return false;
    if (p.nonegotiate) return false;
    const peer = linkPeer(w, dev, port);
    if (!peer) return false;
    const o = w.devices[peer[0]];
    const op = o && o.kind === 'switch' && o.interfaces[peer[1]];
    if (!op || op.routed) return false;
    const om = adminMode(op);
    const asks = (om === 'trunk' && !op.nonegotiate) || (om === 'dynamic-desirable' && !op.nonegotiate);
    return m === 'dynamic-desirable' ? asks || (om === 'dynamic-auto' && !op.nonegotiate) : asks;
  }
  function vlanAllowed(port, v) {
    if (port.trunkAllowed === 'all') return true;
    return Array.isArray(port.trunkAllowed) && port.trunkAllowed.includes(v);
  }

  /**
   * Starting at an L3 endpoint (router interface or PC NIC), return every L3 endpoint
   * reachable at layer 2 (same VLAN / broadcast domain), including the start.
   * Optional via (read-only tracing, used by tracePath): via.skip(dev, port, vlan) can hold a port
   * out of the walk, and via.hits['dev|endpoint'] receives the walk entry that reached each endpoint;
   * every entry links to the entry it came from at index 4, so the cable path can be rebuilt.
   */
  function l2Domain(w, id, ifn, via) {
    const out = [[id, ifn]];
    if (!linkUp(w, id, ifn)) return out;
    const seen = new Set();
    const startDev = w.devices[id];
    const isSvi = startDev.kind === 'switch' && /^Vlan\d+$/.test(ifn);
    const firstHop = isSvi ? [id, null] : startDev.kind === 'switch' && /^Port-channel/.test(ifn) ? poPeer(w, id, ifn) : linkPeer(w, id, ifn);
    if (!firstHop) return out;
    let startTag = null;
    if (isSub(ifn)) {
      const si = w.devices[id].interfaces[ifn];
      if (!si.encap) return out; // a subinterface without encapsulation sends nothing
      startTag = si.native ? null : si.encap;
    }

    if (w.devices[id].kind === 'pc' && !psAllows(w, firstHop[0], firstHop[1], id)) return out;
    const stack = [[firstHop[0], firstHop[1], startTag, isSvi ? Number(ifn.slice(4)) : undefined]]; // [device, port, tagVlan|null, insideVlan]
    const addOut = (dev, ep, it) => {
      if (via && via.hits && !via.hits[dev + '|' + ep]) via.hits[dev + '|' + ep] = it;
      if (!out.some(([a, b]) => a === dev && b === ep)) out.push([dev, ep]);
    };
    while (stack.length) {
      const item = stack.pop();
      const [dev, port, tag, inside] = item;
      const d = w.devices[dev];
      if (!d) continue;
      if (d.kind !== 'switch') {
        const ep = endpointFor(d, port, tag);
        if (ep && adminUp(w, dev, ep)) addOut(dev, ep, item);
        continue;
      }
      const p = inside === undefined ? d.interfaces[port] : { mode: 'access', accessVlan: inside };
      if (!p || p.shutdown) continue;
      // a routed port (or a member of a routed port-channel) is a Layer 3 endpoint, like a router interface
      if (inside === undefined && p.routed) { if (tag === null && (/^Port-channel/.test(port) ? linkUp(w, dev, port) : adminUp(w, dev, port))) addOut(dev, port, item); continue; }
      if (inside === undefined && p.channel && (d.interfaces['Port-channel' + p.channel.group] || {}).routed) {
        const po = 'Port-channel' + p.channel.group;
        if (tag === null && linkUp(w, dev, po)) addOut(dev, po, item);
        continue;
      }
      let vlan;
      if (inside !== undefined) vlan = inside;
      else if (isTrunk(w, dev, port)) {
        vlan = tag === null ? nativeOf(p) : tag; // untagged on a trunk = this port's native VLAN
        if (!vlanAllowed(p, vlan)) continue;
      } else {
        if (tag !== null && tag !== 1) continue; // tagged frame arriving on an access port is dropped
        vlan = p.accessVlan;
      }
      if (!d.vlans[vlan]) continue; // VLAN missing from the database: port is inactive
      const key = dev + '|' + vlan;
      if (seen.has(key)) continue;
      seen.add(key);
      if (d.interfaces['Vlan' + vlan] && linkUp(w, dev, 'Vlan' + vlan)) addOut(dev, 'Vlan' + vlan, item);
      for (const [pn, pp] of Object.entries(d.interfaces)) {
        if (pp.shutdown || pp.routed || /^Vlan\d+$/.test(pn)) continue;
        let egressTag;
        if (isTrunk(w, dev, pn)) {
          if (!vlanAllowed(pp, vlan)) continue;
          egressTag = vlan === nativeOf(pp) ? null : vlan;
        } else {
          if (pp.accessVlan !== vlan) continue;
          egressTag = null;
        }
        const peer = linkPeer(w, dev, pn);
        if (!peer || !adminUp(w, peer[0], peer[1])) continue;
        if (w.devices[peer[0]].kind === 'pc' && !psAllows(w, dev, pn, peer[0])) continue;
        if (via && via.skip && via.skip(dev, pn, vlan)) continue;
        stack.push([peer[0], peer[1], egressTag, undefined, item]);
      }
    }
    return out;
  }

  /** Which L3 interface on a router or PC receives a frame arriving on a physical port with this tag. */
  function endpointFor(d, port, tag) {
    if (d.kind === 'pc') return tag === null ? port : null;
    const subs = Object.keys(d.interfaces).filter((n) => n.startsWith(port + '.'));
    if (tag === null) {
      const nat = subs.find((n) => d.interfaces[n].encap && d.interfaces[n].native);
      if (nat) return nat;
      return port;
    }
    return subs.find((n) => d.interfaces[n].encap === tag && !d.interfaces[n].native) || null;
  }

  /* ---- ACLs ------------------------------------------------------------ */
  const isStdAcl = (n) => (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999);
  const isExtAcl = (n) => (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699);
  function addrMatch(spec, ipInt) {
    if (spec.any) return true;
    return wildMatch(ipInt, ipToInt(spec.net), ipToInt(spec.wild));
  }
  /** Evaluate an ACL for an ICMP packet. A missing ACL permits everything (IOS behavior). */
  function aclPermits(d, num, src, dst) {
    const list = d.acls && d.acls[num];
    if (!list || !list.length) return true;
    for (const e of list) {
      if (e.std) {
        if (addrMatch(e.src, src)) return e.action === 'permit';
      } else {
        if (e.proto !== 'ip' && e.proto !== 'icmp') continue;
        if (addrMatch(e.src, src) && addrMatch(e.dst, dst)) return e.action === 'permit';
      }
    }
    return false; // implicit deny
  }

  /* ---- Layer 3: OSPF ------------------------------------------------- */
  function routerId(d) {
    if (d.ospf && d.ospf.routerId) return d.ospf.routerId;
    let best = null;
    const consider = (pred) => {
      for (const [n, i] of Object.entries(d.interfaces)) {
        if (!pred(n) || !i.ip || i.shutdown) continue;
        const v = ipToInt(i.ip);
        if (best === null || v > best) best = v;
      }
    };
    consider((n) => /^Loopback/.test(n));
    if (best === null) consider(() => true);
    return best === null ? '0.0.0.0' : intToIp(best);
  }

  function ospfIfArea(d, ifn) {
    if (!d.ospf) return null;
    const i = d.interfaces[ifn];
    if (!i || !i.ip) return null;
    const ip = ipToInt(i.ip);
    let best = null;
    for (const n of d.ospf.networks || []) {
      const net = ipToInt(n.net);
      const wild = ipToInt(n.wild);
      if (net === null || wild === null) continue;
      if (!wildMatch(ip, net, wild)) continue;
      const bits = popcount(wild);
      if (!best || bits < best.bits) best = { area: String(n.area), bits };
    }
    return best ? best.area : null;
  }
  function popcount(n) {
    let c = 0;
    while (n) {
      c += n & 1;
      n >>>= 1;
    }
    return c;
  }

  /** Returns { adj: [{a, aIf, b, bIf}], learned: { routerId: [route] } } */
  function computeOspf(w) {
    const routers = Object.values(w.devices).filter((d) => d.kind === 'router' && d.ospf);
    const enabled = {}; // id -> [{ifn, area, passive}]
    for (const d of routers) {
      enabled[d.id] = [];
      for (const ifn of Object.keys(d.interfaces)) {
        if (!l3Up(w, d.id, ifn)) continue;
        const area = ospfIfArea(d, ifn);
        if (area === null) continue;
        const passive = d.ospf.passiveDefault ? !(d.ospf.nonPassive || []).includes(ifn) : (d.ospf.passive || []).includes(ifn);
        enabled[d.id].push({ ifn, area, passive });
      }
    }
    // adjacencies
    const adj = [];
    const netType = (d, ifn) => ((d.interfaces[ifn] || {}).ospfNet === 'p2p' ? 'p2p' : 'broadcast');
    for (const d of routers) {
      for (const e of enabled[d.id]) {
        if (e.passive || /^Loopback/.test(e.ifn)) continue;
        const dom = l2Domain(w, d.id, e.ifn);
        const myNet = netOf(ipOf(w, d.id, e.ifn), prefixOf(w, d.id, e.ifn));
        const myP = prefixOf(w, d.id, e.ifn);
        for (const [oid, oif] of dom) {
          if (oid === d.id) continue;
          const o = w.devices[oid];
          if (!o || o.kind !== 'router' || !o.ospf) continue;
          const oe = (enabled[oid] || []).find((x) => x.ifn === oif);
          if (!oe || oe.passive) continue;
          if (oe.area !== e.area) continue;
          if (prefixOf(w, oid, oif) !== myP) continue;
          if (netOf(ipOf(w, oid, oif), myP) !== myNet) continue;
          if (routerId(o) === routerId(d)) continue;
          adj.push({ a: d.id, aIf: e.ifn, b: oid, bIf: oif, mism: netType(d, e.ifn) !== netType(o, oif) });
        }
      }
    }
    // DR/BDR election per broadcast segment. Not preemptive: a sitting DR keeps the job until it
    // leaves the segment or someone runs "clear ip ospf process".
    w.ospfDr = w.ospfDr || {};
    const segs = {};
    for (const d of routers) for (const e of enabled[d.id]) {
      if (e.passive || /^Loopback/.test(e.ifn) || netType(d, e.ifn) === 'p2p') continue;
      const p = prefixOf(w, d.id, e.ifn);
      const key = intToIp(netOf(ipOf(w, d.id, e.ifn), p)) + '/' + p;
      const pr = d.interfaces[e.ifn].ospfPrio === undefined ? 1 : d.interfaces[e.ifn].ospfPrio;
      (segs[key] = segs[key] || []).push({ dev: d.id, ifn: e.ifn, pr, rid: ipToInt(routerId(d)) });
    }
    const roles = {};
    const hasDr = {};
    for (const [key, mem] of Object.entries(segs)) {
      const elig = mem.filter((m) => m.pr > 0).sort((a, b) => b.pr - a.pr || b.rid - a.rid);
      const has = (id) => elig.some((m) => m.dev === id);
      const st = w.ospfDr[key] || {};
      let dr = has(st.dr) ? st.dr : null;
      let bdr = has(st.bdr) && st.bdr !== dr ? st.bdr : null;
      if (!dr && bdr) { dr = bdr; bdr = null; }
      if (!dr && elig[0]) dr = elig[0].dev;
      if (!bdr) { const nb = elig.find((m) => m.dev !== dr); bdr = nb ? nb.dev : null; }
      w.ospfDr[key] = { dr, bdr };
      for (const m of mem) { roles[m.dev + '|' + m.ifn] = m.dev === dr ? 'DR' : m.dev === bdr ? 'BDR' : 'DROTHER'; hasDr[m.dev + '|' + m.ifn] = !!dr; }
    }
    for (const a of adj) {
      const p2p = netType(w.devices[a.a], a.aIf) === 'p2p';
      const ra = roles[a.a + '|' + a.aIf] || 'DROTHER';
      const rb = roles[a.b + '|' + a.bIf] || 'DROTHER';
      a.role = p2p ? 'P2P' : ra;
      a.nbRole = p2p ? '-' : rb;
      a.full = p2p || ra === 'DR' || ra === 'BDR' || rb === 'DR' || rb === 'BDR';
      a.usable = !a.mism && (p2p || !!hasDr[a.a + '|' + a.aIf]);
    }
    w.ospfRoles = roles;
    // shortest paths (each hop costs 1: gigabit links with the 100 Mbps reference)
    const learned = {};
    for (const src of routers) {
      const dist = { [src.id]: 0 };
      const first = {}; // router -> {nhIp, outIf}
      const q = [src.id];
      while (q.length) {
        const cur = q.shift();
        for (const a of adj.filter((x) => x.a === cur && x.usable)) {
          if (dist[a.b] !== undefined) continue;
          dist[a.b] = dist[cur] + 1;
          first[a.b] = cur === src.id ? { nh: intToIp(ipOf(w, a.b, a.bIf)), outIf: a.aIf } : first[cur];
          q.push(a.b);
        }
      }
      const own = new Set(
        Object.keys(src.interfaces)
          .filter((n) => l3Up(w, src.id, n))
          .map((n) => netOf(ipOf(w, src.id, n), prefixOf(w, src.id, n)) + '/' + prefixOf(w, src.id, n))
      );
      const best = {};
      for (const [rid, dd] of Object.entries(dist)) {
        if (rid === src.id) continue;
        for (const e of enabled[rid] || []) {
          const p = prefixOf(w, rid, e.ifn);
          const net = netOf(ipOf(w, rid, e.ifn), p);
          const key = net + '/' + p;
          if (own.has(key)) continue;
          const cost = dd + 1;
          if (!best[key] || cost < best[key].cost) {
            best[key] = { type: 'O', net, p, nh: first[rid].nh, if: first[rid].outIf, cost, ad: 110 };
          }
        }
      }
      // default-information originate: an ASBR with its own default route advertises 0.0.0.0/0 as E2
      for (const [rid, dd] of Object.entries(dist)) {
        if (rid === src.id) continue;
        const r = w.devices[rid];
        if (!r.ospf.defOrig) continue;
        const hasDef = (r.routes || []).some((x) => x.net === '0.0.0.0' && x.mask === '0.0.0.0') || Object.values(r.interfaces).some((x) => x.dhcp && x.dhcpGw) || r.ospf.defOrig === 'always';
        if (!hasDef) continue;
        if (!best['0/0'] || dd < best['0/0'].cost) best['0/0'] = { type: 'O', e2: true, net: 0, p: 0, nh: first[rid].nh, if: first[rid].outIf, cost: dd, ad: 110 };
      }
      learned[src.id] = Object.values(best);
    }
    return { adj, learned };
  }

  /* ---- Routing table ------------------------------------------------- */
  function routingTable(w, id, ospfCache) {
    const d = w.devices[id];
    const rt = [];
    for (const ifn of Object.keys(d.interfaces)) {
      if (!l3Up(w, id, ifn)) continue;
      const ip = ipOf(w, id, ifn);
      const p = prefixOf(w, id, ifn);
      rt.push({ type: 'C', net: netOf(ip, p), p, if: ifn, ad: 0 });
      rt.push({ type: 'L', net: ip, p: 32, if: ifn, ad: 0 });
    }
    const connected = rt.filter((r) => r.type === 'C');
    for (const [n, i] of Object.entries(d.interfaces)) {
      if (i.dhcp && i.dhcpGw && l3Up(w, id, n)) rt.push({ type: 'S', net: 0, p: 0, nh: i.dhcpGw, if: n, ad: 254, dhcp: true });
    }
    for (const s of d.routes || []) {
      const net = ipToInt(s.net);
      const p = maskToPrefix(s.mask);
      if (net === null || p === null) continue;
      if (s.nh) {
        const nh = ipToInt(s.nh);
        const via = connected.find((c) => netOf(nh, c.p) === c.net);
        if (!via) continue; // next hop not resolvable: route is not installed
        if (rt.some((r) => r.type === 'L' && r.net === nh)) continue;
        rt.push({ type: 'S', net: netOf(net, p), p, nh: s.nh, if: via.if, ad: s.ad || 1 });
      } else if (s.exitIf) {
        if (!linkUp(w, id, s.exitIf)) continue;
        rt.push({ type: 'S', net: netOf(net, p), p, exitIf: s.exitIf, if: s.exitIf, ad: s.ad || 1 });
      }
    }
    if (d.ospf) {
      const o = (ospfCache || computeOspf(w)).learned[id] || [];
      for (const r of o) rt.push(r);
    }
    if (d.eigrp) for (const r of computeEigrp(w).learned[id] || []) rt.push(r);
    // keep only the lowest administrative distance per prefix
    const best = {};
    for (const r of rt) {
      const k = r.type === 'L' ? 'L' + r.net : r.net + '/' + r.p;
      if (!best[k] || r.ad < best[k].ad) best[k] = r;
    }
    return Object.values(best).sort((a, b) => a.net - b.net || a.p - b.p);
  }

  function lookup(rt, dst) {
    let best = null;
    for (const r of rt) {
      if (r.type === 'L') continue;
      if (netOf(dst, r.p) !== r.net) continue;
      if (!best || r.p > best.p) best = r;
    }
    return best;
  }

  /** Addresses a NAT router answers for on its outside interfaces: static globals and pool addresses. */
  function natGlobals(d) {
    const out = [];
    for (const m of d.natStatic || []) out.push(ipToInt(m.global));
    for (const pl of Object.values(d.natPools || {})) for (let a = ipToInt(pl.start); a <= ipToInt(pl.end); a++) out.push(a);
    return out;
  }
  function answersFor(w, id, ifn) {
    const d = w.devices[id];
    const own = [ipOf(w, id, ifn), ...vipsOf(w, id, ifn)];
    if (d.kind === 'router' && (d.interfaces[ifn] || {}).nat === 'outside') {
      const p = prefixOf(w, id, ifn);
      const net = netOf(ipOf(w, id, ifn), p);
      for (const g of natGlobals(d)) if (netOf(g, p) === net) own.push(g);
    }
    return own;
  }
  function ownsIp(w, id, dst) {
    const d = w.devices[id];
    if (d.kind === 'pc') return d.pc.ip && ipToInt(d.pc.ip) === dst;
    return Object.keys(d.interfaces).some((n) => l3Up(w, id, n) && (ipOf(w, id, n) === dst || vipsOf(w, id, n).includes(dst)));
  }
  const routes = (d) => d.kind === 'router' || (d.kind === 'switch' && d.ipRouting);
  /** Translate an inside source on the way out: the global address, null when no rule applies, or 'full' when a pool is used up. */
  function natOut(w, d, egress, src, dst) {
    const st = (d.natStatic || []).find((m) => ipToInt(m.local) === src);
    if (st) return ipToInt(st.global);
    const n = d.nat;
    if (!n || n.list === undefined || !aclPermits(d, n.list, src, dst)) return null;
    if (n.pool) {
      const pl = (d.natPools || {})[n.pool];
      if (!pl) return null;
      d.natMap = d.natMap || {};
      const key = intToIp(src);
      if (d.natMap[key]) return ipToInt(d.natMap[key]);
      const used = new Set(Object.values(d.natMap));
      for (const m of d.natStatic || []) used.add(m.global);
      for (let a = ipToInt(pl.start); a <= ipToInt(pl.end); a++) {
        if (!used.has(intToIp(a))) { d.natMap[key] = intToIp(a); return a; }
      }
      if (n.overload) return ipToInt(pl.start);
      return 'full';
    }
    return ipOf(w, d.id, n.outIf || egress);
  }

  /**
   * Forward a packet hop by hop, applying ACLs and NAT. Returns {ok, dstDev, srcIp, pktSrc, nat, reason, hops}.
   * When opts.legs is an array, each hop is also recorded there as {from, out, to, in}, and a drop as
   * {from, out?, to?, in?, fail: reason} (read-only, for tracePath).
   */
  function forward(w, startId, dst, ospfCache, opts) {
    const legs = opts && Array.isArray(opts.legs) ? opts.legs : null;
    const leg = (o) => { if (legs) legs.push(o); };
    let dnat = null;
    let cur = startId;
    let srcIp = null; // source address as first sent
    let pktSrc = null; // source address as it travels (changes after NAT)
    let inIf = null;
    let nat = null;
    const hops = [startId];
    for (let n = 0; n < 16; n++) {
      const d = w.devices[cur];
      // static NAT: traffic arriving on an outside interface for a global address goes to the inside host
      if (d.kind === 'router' && inIf && (d.interfaces[inIf] || {}).nat === 'outside') {
        const st = (d.natStatic || []).find((m) => ipToInt(m.global) === dst);
        if (st) { dnat = { router: cur, global: dst, local: ipToInt(st.local) }; dst = ipToInt(st.local); }
      }
      if (ownsIp(w, cur, dst)) return { ok: true, dstDev: cur, srcIp, pktSrc, nat, dnat, hops };
      // replies to a dynamic NAT pool address end at the NAT router, which translates them back
      if (d.kind === 'router' && inIf && (d.interfaces[inIf] || {}).nat === 'outside' && natGlobals(d).includes(dst)) return { ok: true, dstDev: cur, srcIp, pktSrc, nat, dnat, hops };
      let egress;
      let nextIp;
      if (d.kind === 'pc') {
        if (!d.pc.ip) { leg({ from: cur, fail: 'no-ip' }); return { ok: false, reason: 'no-ip', hops }; }
        const p = maskToPrefix(d.pc.mask);
        egress = 'NIC';
        if (netOf(dst, p) === netOf(ipToInt(d.pc.ip), p)) nextIp = dst;
        else if (d.pc.gw) nextIp = ipToInt(d.pc.gw);
        else { leg({ from: cur, fail: 'no-gateway' }); return { ok: false, reason: 'no-gateway', hops }; }
      } else if (routes(d)) {
        const r = lookup(routingTable(w, cur, ospfCache), dst);
        if (!r) { leg({ from: cur, fail: 'no-route' }); return { ok: false, reason: 'no-route', at: cur, hops }; }
        egress = r.if;
        nextIp = r.type === 'C' || r.exitIf ? dst : ipToInt(r.nh);
      } else {
        // a Layer 2 switch answers like a host from its SVIs, using "ip default-gateway" for other subnets
        const svis = Object.keys(d.interfaces).filter((n) => /^Vlan\d+$/.test(n) && l3Up(w, cur, n));
        const local = svis.find((n) => netOf(dst, prefixOf(w, cur, n)) === netOf(ipOf(w, cur, n), prefixOf(w, cur, n)));
        if (local) { egress = local; nextIp = dst; }
        else if (d.defaultGw) {
          const g = ipToInt(d.defaultGw);
          const via = svis.find((n) => netOf(g, prefixOf(w, cur, n)) === netOf(ipOf(w, cur, n), prefixOf(w, cur, n)));
          if (!via) { leg({ from: cur, fail: 'no-gateway' }); return { ok: false, reason: 'no-gateway', hops }; }
          egress = via; nextIp = g;
        } else { leg({ from: cur, fail: 'no-gateway' }); return { ok: false, reason: 'no-gateway', hops }; }
      }
      if (srcIp === null) { srcIp = ipOf(w, cur, egress); pktSrc = srcIp; }
      if (d.kind === 'router') {
        const ei = d.interfaces[egress] || {};
        const ii = (inIf && d.interfaces[inIf]) || {};
        // NAT: inside -> outside (static mappings first, then the ACL-matched dynamic rule)
        const translated = ii.nat === 'inside' && ei.nat === 'outside' ? natOut(w, d, egress, pktSrc, dst) : null;
        if (translated === 'full') { leg({ from: cur, out: egress, fail: 'nat-pool-exhausted' }); return { ok: false, reason: 'nat-pool-exhausted', at: cur, hops }; }
        if (translated !== null) {
          const global = translated;
          if (global !== null) {
            nat = { router: cur, inside: pktSrc, global, dst };
            if (opts && opts.record) {
              d.natTable = d.natTable || [];
              const k = intToIp(pktSrc) + '>' + intToIp(dst);
              if (!d.natTable.some((x) => x.k === k)) d.natTable.push({ k, inside: intToIp(pktSrc), global: intToIp(global), dst: intToIp(dst) });
            }
            pktSrc = global;
          }
        }
        if (ei.aclOut !== undefined && !aclPermits(d, ei.aclOut, pktSrc, dst)) { leg({ from: cur, out: egress, fail: 'acl', dir: 'out' }); return { ok: false, reason: 'acl', at: cur, hops }; }
      }
      const dom = l2Domain(w, cur, egress);
      const hit = dom.find(([oid, oif]) => oid !== cur && l3Up(w, oid, oif) && answersFor(w, oid, oif).includes(nextIp));
      if (!hit) { leg({ from: cur, out: egress, fail: nextIp === dst ? 'host-unreachable' : 'next-hop-unreachable', nextIp }); return { ok: false, reason: nextIp === dst ? 'host-unreachable' : 'next-hop-unreachable', at: cur, hops }; }
      if (!arpOk(w, cur, egress) || !arpOk(w, hit[0], hit[1])) { leg({ from: cur, out: egress, to: hit[0], in: hit[1], fail: 'dai', side: arpOk(w, cur, egress) ? 'to' : 'from' }); return { ok: false, reason: 'dai', at: cur, hops }; }
      const nd = w.devices[hit[0]];
      if (nd.kind === 'router') {
        const ni = nd.interfaces[hit[1]] || {};
        if (ni.aclIn !== undefined && !aclPermits(nd, ni.aclIn, pktSrc, dst)) { leg({ from: cur, out: egress, to: hit[0], in: hit[1], fail: 'acl', dir: 'in' }); return { ok: false, reason: 'acl', at: hit[0], hops }; }
        // un-NAT on the way back in
        if (nd.nat && nd.natTable && ni.nat === 'outside' && ownsIp(w, hit[0], dst)) {
          /* handled by ping(): delivery to the router's outside address */
        }
      }
      leg({ from: cur, out: egress, to: hit[0], in: hit[1] });
      inIf = hit[1];
      cur = hit[0];
      hops.push(cur);
    }
    leg({ from: cur, fail: 'ttl' });
    return { ok: false, reason: 'ttl', hops };
  }

  /** Full ping: there and back, following NAT translations. opts.trace = {there: [], back: []} collects hop legs. */
  function ping(w, srcId, dstIpStr, opts) {
    const dst = ipToInt(dstIpStr);
    if (dst === null) return { ok: false, reason: 'bad-ip' };
    const cache = computeOspf(w);
    const tr = opts && opts.trace;
    const there = forward(w, srcId, dst, cache, tr ? Object.assign({}, opts, { legs: tr.there }) : opts);
    if (!there.ok) return there;
    if (there.srcIp === null) return { ok: true, local: true }; // pinged own address
    const back = forward(w, there.dstDev, there.pktSrc, cache, tr ? { legs: tr.back } : undefined);
    if (!back.ok) return { ok: false, reason: 'no-return-path', at: back.at, there, back };
    if (there.nat) {
      // the reply reached the NAT router's outside address; translate and continue inside
      if (back.dstDev !== there.nat.router) return { ok: false, reason: 'no-return-path', there, back };
      const inside = forward(w, there.nat.router, there.nat.inside, cache, tr ? { legs: tr.back } : undefined);
      if (!inside.ok || inside.dstDev !== srcId) return { ok: false, reason: 'no-return-path', there, back: inside };
      return { ok: true, there, back: { hops: back.hops.concat(inside.hops.slice(1)) } };
    }
    if (back.dstDev !== srcId && !ownsIp(w, srcId, there.srcIp)) return { ok: false, reason: 'no-return-path', there, back };
    if (there.dnat && back.pktSrc !== there.dnat.global) return { ok: false, reason: 'no-return-path', there, back };
    return { ok: true, there, back };
  }

  /* ---- Port security --------------------------------------------------- */
  const pcMac = (d) => (d.pc && d.pc.mac) || ('0050.' + hex4(d.id) + '.' + hex4(d.id + 'x'));
  function hex4(t) {
    let h = 0;
    for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return h.toString(16).padStart(4, '0');
  }
  /** Does port security on this switch port accept frames from this PC? */
  function psAllows(w, swId, port, pcId) {
    const sw = w.devices[swId];
    if (!sw || sw.kind !== 'switch') return true;
    const i = sw.interfaces[port];
    if (!i || !i.ps || !i.ps.on) return true;
    const mac = pcMac(w.devices[pcId]);
    return (i.ps.macs || []).includes(mac) || (i.ps.macs || []).length < (i.ps.max || 1);
  }
  /** Learn MACs and enforce violations after each command. Returns log lines. */
  function psTick(w) {
    const L = [];
    // BPDU guard: a guarded (or PortFast-by-default) access port that hears a switch is err-disabled
    for (const sw of Object.values(w.devices)) {
      if (sw.kind !== 'switch') continue;
      for (const [n, i] of Object.entries(sw.interfaces)) {
        if (i.shutdown || i.errdis || i.routed || /^(Vlan|Port-channel)/.test(n)) continue;
        const edge = i.portfast || (sw.portfastDefault && !isTrunk(w, sw.id, n) && i.portfast !== false);
        if (!(i.bpduguard || (sw.bpduguardDefault && edge))) continue;
        const p = linkPeer(w, sw.id, n);
        if (!p) continue;
        const o = w.devices[p[0]];
        if (o.kind !== 'switch' || (o.interfaces[p[1]] || {}).bpdufilter || !adminUp(w, p[0], p[1])) continue;
        i.errdis = true;
        L.push(`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${n} with BPDU Guard enabled. Disabling port.`);
        L.push(`%PM-4-ERR_DISABLE: bpduguard error detected on ${shortIf(n)}, putting ${shortIf(n)} in err-disable state`);
      }
    }
    for (const sw of Object.values(w.devices)) {
      if (sw.kind !== 'switch') continue;
      for (const [n, i] of Object.entries(sw.interfaces)) {
        if (!i.ps || !i.ps.on || i.shutdown || i.errdis) continue;
        const p = linkPeer(w, sw.id, n);
        if (!p) continue;
        const o = w.devices[p[0]];
        if (o.kind !== 'pc') continue;
        const mac = pcMac(o);
        i.ps.macs = i.ps.macs || [];
        if (i.ps.macs.includes(mac)) continue;
        if (i.ps.macs.length < (i.ps.max || 1)) {
          i.ps.macs.push(mac);
          if (!i.ps.sticky) i.ps.dyn = (i.ps.dyn || []).concat(mac);
          continue;
        }
        i.ps.violations = (i.ps.violations || 0) + 1;
        i.ps.last = mac;
        if ((i.ps.viol || 'shutdown') === 'shutdown') {
          i.errdis = true;
          L.push(`%PM-4-ERR_DISABLE: psecure-violation error detected on ${shortIf(n)}, putting ${shortIf(n)} in err-disable state`);
          L.push(`%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${mac} on port ${n}.`);
        }
      }
    }
    return L;
  }

  /* ---- HSRP --------------------------------------------------------------- */
  /** Virtual IPs this router interface currently owns (it is the active router). */
  function vipsOf(w, id, ifn) {
    const d = w.devices[id];
    if (!d || d.kind !== 'router') return [];
    const i = d.interfaces[ifn];
    if (!i || !i.standby || !l3Up(w, id, ifn)) return [];
    const out = [];
    for (const [g, cfg] of Object.entries(i.standby)) {
      const me = hsrpRank(w, id, ifn, g);
      if (!me) continue;
      const peers = l2Domain(w, id, ifn).filter(([oid, oif]) => oid !== id && w.devices[oid].kind === 'router' && (w.devices[oid].interfaces[oif].standby || {})[g] && l3Up(w, oid, oif));
      let vip = cfg.ip;
      let active = true;
      for (const [oid, oif] of peers) {
        const r = hsrpRank(w, oid, oif, g);
        if (!vip) vip = w.devices[oid].interfaces[oif].standby[g].ip;
        if (r.prio > me.prio || (r.prio === me.prio && r.ip > me.ip)) active = false;
      }
      if (active && vip) out.push(ipToInt(vip));
    }
    return out;
  }
  function hsrpRank(w, id, ifn, g) {
    const c = w.devices[id].interfaces[ifn].standby[g];
    return { prio: c.prio === undefined ? 100 : c.prio, ip: ipOf(w, id, ifn) };
  }
  /* ---- EIGRP -------------------------------------------------------------- */
  function classfulWild(ip) {
    const a = ipToInt(ip) >>> 24;
    return a < 128 ? '0.255.255.255' : a < 192 ? '0.0.255.255' : '0.0.0.255';
  }
  function eigrpEnabled(d, ifn) {
    if (!d.eigrp) return false;
    const i = d.interfaces[ifn];
    if (!i || !i.ip) return false;
    const ip = ipToInt(i.ip);
    return (d.eigrp.networks || []).some((n) => wildMatch(ip, ipToInt(n.net), ipToInt(n.wild || classfulWild(n.net))));
  }
  function computeEigrp(w) {
    const routers = Object.values(w.devices).filter((d) => d.kind === 'router' && d.eigrp);
    const en = {};
    for (const d of routers) en[d.id] = Object.keys(d.interfaces).filter((n) => l3Up(w, d.id, n) && eigrpEnabled(d, n));
    const adj = [];
    for (const d of routers) {
      for (const n of en[d.id]) {
        if ((d.eigrp.passive || []).includes(n) || /^Loopback/.test(n)) continue;
        const p = prefixOf(w, d.id, n);
        const net = netOf(ipOf(w, d.id, n), p);
        for (const [oid, oif] of l2Domain(w, d.id, n)) {
          if (oid === d.id) continue;
          const o = w.devices[oid];
          if (!o.eigrp || o.eigrp.as !== d.eigrp.as) continue;
          if (!en[oid].includes(oif) || (o.eigrp.passive || []).includes(oif)) continue;
          if (prefixOf(w, oid, oif) !== p || netOf(ipOf(w, oid, oif), p) !== net) continue;
          adj.push({ a: d.id, aIf: n, b: oid, bIf: oif });
        }
      }
    }
    const learned = {};
    for (const src of routers) {
      const dist = { [src.id]: 0 };
      const first = {};
      const q = [src.id];
      while (q.length) {
        const cur = q.shift();
        for (const a of adj.filter((x) => x.a === cur)) {
          if (dist[a.b] !== undefined) continue;
          dist[a.b] = dist[cur] + 1;
          first[a.b] = cur === src.id ? { nh: intToIp(ipOf(w, a.b, a.bIf)), outIf: a.aIf } : first[cur];
          q.push(a.b);
        }
      }
      const own = new Set(Object.keys(src.interfaces).filter((n) => l3Up(w, src.id, n)).map((n) => netOf(ipOf(w, src.id, n), prefixOf(w, src.id, n)) + '/' + prefixOf(w, src.id, n)));
      const best = {};
      for (const [rid, dd] of Object.entries(dist)) {
        if (rid === src.id) continue;
        for (const n of en[rid]) {
          const p = prefixOf(w, rid, n);
          const net = netOf(ipOf(w, rid, n), p);
          const k = net + '/' + p;
          if (own.has(k)) continue;
          if (!best[k] || dd < best[k].hops) best[k] = { type: 'D', net, p, nh: first[rid].nh, if: first[rid].outIf, hops: dd, metric: 2816 + 256 * dd * 10, ad: 90 };
        }
      }
      learned[src.id] = Object.values(best);
    }
    return { adj, learned };
  }

  /* ---- DHCP snooping and DAI ---------------------------------------------- */
  const snoopOn = (sw, v) => !!(sw.snoop && sw.snoop.on && (sw.snoop.vlans || []).includes(v));
  const daiOn = (sw, v) => !!(sw.dai && (sw.dai.vlans || []).includes(v));
  /** Switch ports a frame enters on its way from endpoint (fromId, fromIf) to the PC toId. */
  function l2Path(w, fromId, fromIf, toId) {
    if (!linkUp(w, fromId, fromIf)) return null;
    const first = linkPeer(w, fromId, fromIf);
    if (!first) return null;
    const startTag = isSub(fromIf) ? ((w.devices[fromId].interfaces[fromIf].native ? null : w.devices[fromId].interfaces[fromIf].encap) || null) : null;
    const seen = new Set();
    const queue = [{ dev: first[0], port: first[1], tag: startTag, path: [] }];
    while (queue.length) {
      const { dev, port, tag, path } = queue.shift();
      const d = w.devices[dev];
      if (d.kind !== 'switch') {
        if (dev === toId && tag === null) return path;
        continue;
      }
      const p = d.interfaces[port];
      if (!p || p.shutdown || p.errdis) continue;
      let vlan;
      if (isTrunk(w, dev, port)) { vlan = tag === null ? nativeOf(p) : tag; if (!vlanAllowed(p, vlan)) continue; }
      else { if (tag !== null && tag !== 1) continue; vlan = p.accessVlan; }
      if (!d.vlans[vlan]) continue;
      const key = dev + '|' + vlan;
      if (seen.has(key)) continue;
      seen.add(key);
      const np = path.concat([{ sw: dev, port, vlan }]);
      for (const [pn, pp] of Object.entries(d.interfaces)) {
        if (pn === port || pp.shutdown || pp.errdis) continue;
        let et;
        if (isTrunk(w, dev, pn)) { if (!vlanAllowed(pp, vlan)) continue; et = vlan === nativeOf(pp) ? null : vlan; }
        else { if (pp.accessVlan !== vlan) continue; et = null; }
        const peer = linkPeer(w, dev, pn);
        if (!peer || !adminUp(w, peer[0], peer[1])) continue;
        queue.push({ dev: peer[0], port: peer[1], tag: et, path: np });
      }
    }
    return null;
  }
  /** Dynamic ARP Inspection: may this endpoint's ARP enter its switch port? */
  function arpOk(w, devId, ifn) {
    const d = w.devices[devId];
    const peer = linkPeer(w, devId, d.kind === 'pc' ? 'NIC' : parentIf(ifn));
    if (!peer) return true;
    const sw = w.devices[peer[0]];
    if (!sw || sw.kind !== 'switch') return true;
    const port = sw.interfaces[peer[1]];
    if (!port || port.mode === 'trunk') return true;
    if (!daiOn(sw, port.accessVlan) || port.daiTrust) return true;
    if (d.kind !== 'pc') return false;
    const b = (sw.snoop && sw.snoop.bindings) || {};
    return Object.values(b).some((x) => x.ip === d.pc.ip && x.mac === pcMac(d) && x.port === peer[1]);
  }

  /* ---- IPv6 forwarding ------------------------------------------------------ */
  function v6addrs(w, id, ifn) {
    const d = w.devices[id];
    if (d.kind === 'pc') return d.pc.ip6 ? [{ a: v6parse(d.pc.ip6), p: d.pc.p6 || 64 }] : [];
    const i = d.interfaces[ifn];
    return (i && i.ipv6 ? i.ipv6 : []).map((x) => ({ a: v6parse(x.addr), p: x.p }));
  }
  function routingTable6(w, id) {
    const d = w.devices[id];
    const rt = [];
    for (const n of Object.keys(d.interfaces)) {
      if (!linkUp(w, id, n)) continue;
      for (const x of v6addrs(w, id, n)) {
        rt.push({ type: 'C', net: v6net(x.a, x.p), p: x.p, if: n, ad: 0 });
        rt.push({ type: 'L', net: x.a, p: 128, if: n, ad: 0 });
      }
    }
    const conn = rt.filter((r) => r.type === 'C');
    for (const s of d.routes6 || []) {
      const pf = v6pfx(s.pfx);
      const nh = v6parse(s.nh);
      if (!pf || nh === null) continue;
      const via = conn.find((c) => v6net(nh, c.p) === c.net);
      if (!via) continue;
      rt.push({ type: 'S', net: v6net(pf.addr, pf.p), p: pf.p, nh: s.nh, if: via.if, ad: 1 });
    }
    return rt;
  }
  function forward6(w, startId, dst, legs) {
    const leg = (o) => { if (legs) legs.push(o); };
    let cur = startId;
    let src = null;
    for (let n = 0; n < 16; n++) {
      const d = w.devices[cur];
      const mine = d.kind === 'pc' ? v6addrs(w, cur, 'NIC') : Object.keys(d.interfaces).filter((k) => linkUp(w, cur, k)).flatMap((k) => v6addrs(w, cur, k));
      if (mine.some((x) => x.a === dst)) return { ok: true, dstDev: cur, src };
      if (n > 0 && d.kind === 'router' && !d.v6routing) { leg({ from: cur, fail: 'v6-routing-off' }); return { ok: false, reason: 'v6-routing-off', at: cur }; }
      let egress;
      let next;
      if (d.kind === 'pc') {
        const me = v6addrs(w, cur, 'NIC')[0];
        if (!me) { leg({ from: cur, fail: 'no-ip' }); return { ok: false, reason: 'no-ip' }; }
        egress = 'NIC';
        if (v6net(dst, me.p) === v6net(me.a, me.p)) next = dst;
        else if (d.pc.gw6) next = v6parse(d.pc.gw6);
        else { leg({ from: cur, fail: 'no-gateway' }); return { ok: false, reason: 'no-gateway' }; }
      } else if (d.kind === 'router') {
        let best = null;
        for (const r of routingTable6(w, cur)) if (r.type !== 'L' && v6net(dst, r.p) === r.net && (!best || r.p > best.p)) best = r;
        if (!best) { leg({ from: cur, fail: 'no-route' }); return { ok: false, reason: 'no-route', at: cur }; }
        egress = best.if;
        next = best.type === 'C' ? dst : v6parse(best.nh);
      } else { leg({ from: cur, fail: 'switch' }); return { ok: false, reason: 'switch' }; }
      if (src === null) {
        const a = v6addrs(w, cur, egress)[0];
        src = a ? a.a : null;
      }
      const hit = l2Domain(w, cur, egress).find(([oid, oif]) => oid !== cur && v6addrs(w, oid, oif).some((x) => x.a === next) && linkUp(w, oid, oif));
      if (!hit) { leg({ from: cur, out: egress, fail: next === dst ? 'host-unreachable' : 'next-hop-unreachable' }); return { ok: false, reason: next === dst ? 'host-unreachable' : 'next-hop-unreachable', at: cur }; }
      leg({ from: cur, out: egress, to: hit[0], in: hit[1] });
      cur = hit[0];
    }
    leg({ from: cur, fail: 'ttl' });
    return { ok: false, reason: 'ttl' };
  }
  function ping6(w, srcId, dstStr, opts) {
    const dst = v6parse(dstStr);
    if (dst === null) return { ok: false, reason: 'bad-ip' };
    const tr = opts && opts.trace;
    const there = forward6(w, srcId, dst, tr && tr.there);
    if (!there.ok) return there;
    if (there.src === null) return { ok: true, local: true };
    const back = forward6(w, there.dstDev, there.src, tr && tr.back);
    if (!back.ok || back.dstDev !== srcId) return { ok: false, reason: 'no-return-path', there, back };
    return { ok: true, there, back };
  }

  /* ---- SSH and Telnet reachability ----------------------------------------- */
  function remoteLogin(w, pcId, target, proto, user) {
    const r = ping(w, pcId, target);
    if (!r.ok) return { ok: false, msg: '% Connection timed out; remote host not responding' };
    const dev = Object.values(w.devices).find((d) => d.kind === 'router' && Object.keys(d.interfaces).some((n) => ipOf(w, d.id, n) === ipToInt(target)));
    if (!dev) return { ok: false, msg: '% Connection refused by remote host' };
    const vty = dev.vty || { transport: ['telnet'], login: null };
    if (vty.accessClass !== undefined) {
      const src = ipToInt(w.devices[pcId].kind === 'pc' ? w.devices[pcId].pc.ip : '0.0.0.0');
      if (!aclPermits(dev, vty.accessClass, src, ipToInt(target))) return { ok: false, msg: '% Connection refused by remote host' };
    }
    const tr = vty.transport || [];
    if (!tr.includes(proto) && !tr.includes('all')) return { ok: false, msg: '% Connection refused by remote host' };
    if (proto === 'ssh') {
      if (!dev.rsa || dev.rsa < 768) return { ok: false, msg: '% Connection refused by remote host' };
      if (vty.login === 'local') {
        if (!user || !(dev.users || {})[user]) return { ok: false, msg: '% Authentication failed' };
      } else if (vty.login === 'password') {
        if (!vty.password) return { ok: false, msg: '% Password required, but none set' };
      } else return { ok: false, msg: '% Authentication failed' };
      return { ok: true, dev };
    }
    if (!vty.login) return { ok: true, dev };
    if (vty.login === 'password' && !vty.password) return { ok: false, msg: '% Password required, but none set' };
    if (vty.login === 'local' && !Object.keys(dev.users || {}).length) return { ok: false, msg: '% Authentication failed' };
    return { ok: true, dev };
  }

  /* ---- Spanning Tree (PVST+) ----------------------------------------- */
  const portCost = (ifn) => (/^Gigabit/.test(ifn) ? 4 : /^Port-channel/.test(ifn) ? 3 : 19);
  function bid(d, vlan) {
    const pr = ((d.stp && d.stp.prio && d.stp.prio[vlan]) !== undefined ? d.stp.prio[vlan] : 32768) + vlan;
    return { pr, mac: (d.mac || '0000.0000.0000').toLowerCase(), dev: d.id };
  }
  const bidLess = (a, b) => (a.pr !== b.pr ? a.pr < b.pr : a.mac < b.mac);
  function portIds(d) {
    const names = Object.keys(d.interfaces).filter((n) => !/^Port-channel/.test(n)).sort(ifSort);
    return Object.fromEntries(names.map((n, i) => [n, i + 1]));
  }
  function carries(w, d, ifn, vlan) {
    const i = d.interfaces[ifn];
    if (!i || i.routed || /^Vlan/.test(ifn) || !linkUp(w, d.id, ifn) || !d.vlans[vlan]) return false;
    return isTrunk(w, d.id, ifn) ? vlanAllowed(i, vlan) : i.accessVlan === vlan;
  }
  function computeStp(w, vlan, blocked) {
    const sws = Object.values(w.devices).filter((d) => d.kind === 'switch' && d.vlans[vlan]);
    if (!sws.length) return null;
    blocked = blocked || new Set(); // "dev|port" held root-inconsistent by root guard
    // switch-to-switch segments that exchange BPDUs (BPDU filter on either end means no BPDUs at all)
    const segs = [];
    const filtered = new Set();
    for (const d of sws) {
      for (const n of Object.keys(d.interfaces)) {
        if (/^Port-channel/.test(n) || !carries(w, d, n, vlan)) continue;
        const p = linkPeer(w, d.id, n);
        if (!p) continue;
        const o = w.devices[p[0]];
        if (o.kind !== 'switch' || !carries(w, o, p[1], vlan)) continue;
        if (d.interfaces[n].bpdufilter || o.interfaces[p[1]].bpdufilter) { filtered.add(d.id + '|' + n); continue; }
        if (blocked.has(d.id + '|' + n) || blocked.has(o.id + '|' + p[1])) continue;
        segs.push({ a: d.id, aIf: n, b: o.id, bIf: p[1] });
      }
    }
    // every connected group of switches elects its own root
    const comp = {};
    for (const d of sws) {
      if (comp[d.id]) continue;
      const q = [d.id];
      comp[d.id] = d.id;
      while (q.length) { const c = q.shift(); for (const g of segs.filter((x) => x.a === c)) if (!comp[g.b]) { comp[g.b] = d.id; q.push(g.b); } }
    }
    const compRoot = {};
    for (const d of sws) { const b = bid(d, vlan); const k = comp[d.id]; if (!compRoot[k] || bidLess(b, compRoot[k])) compRoot[k] = b; }
    const rootOf = {};
    for (const d of sws) rootOf[d.id] = compRoot[comp[d.id]];
    const sizes = {};
    for (const d of sws) sizes[comp[d.id]] = (sizes[comp[d.id]] || 0) + 1;
    const bigK = Object.keys(sizes).sort((x, y) => sizes[y] - sizes[x] || (bidLess(compRoot[x], compRoot[y]) ? -1 : 1))[0];
    const root = compRoot[bigK];
    const cost = {};
    for (const b of Object.values(compRoot)) cost[b.dev] = 0;
    for (let k = 0; k < sws.length + 1; k++) {
      for (const g of segs) {
        if (cost[g.b] === undefined) continue;
        const c = cost[g.b] + portCost(g.aIf);
        if (cost[g.a] === undefined || c < cost[g.a]) cost[g.a] = c;
      }
    }
    const ids = Object.fromEntries(sws.map((d) => [d.id, portIds(d)]));
    const rootPort = {};
    for (const d of sws) {
      if (d.id === rootOf[d.id].dev || cost[d.id] === undefined) continue;
      let best = null;
      for (const g of segs.filter((x) => x.a === d.id && cost[x.b] !== undefined)) {
        const cand = { c: cost[g.b] + portCost(g.aIf), nb: bid(w.devices[g.b], vlan), np: ids[g.b][g.bIf], lp: ids[d.id][g.aIf], ifn: g.aIf };
        const better = !best || cand.c < best.c || (cand.c === best.c && (bidLess(cand.nb, best.nb) || (cand.nb.mac === best.nb.mac && (cand.np < best.np || (cand.np === best.np && cand.lp < best.lp)))));
        if (better) best = cand;
      }
      if (best) rootPort[d.id] = best.ifn;
    }
    // root guard: a guarded port about to become a root port is hearing superior BPDUs. Block it, then re-run.
    for (const d of sws) {
      const rp = rootPort[d.id];
      if (rp && d.interfaces[rp].rootGuard && !blocked.has(d.id + '|' + rp)) {
        const nb = new Set(blocked);
        nb.add(d.id + '|' + rp);
        return computeStp(w, vlan, nb);
      }
    }
    const ports = {};
    for (const d of sws) {
      ports[d.id] = {};
      for (const n of Object.keys(d.interfaces)) {
        if (/^Port-channel/.test(n) || !carries(w, d, n, vlan)) continue;
        const pc = portCost(n);
        if (blocked.has(d.id + '|' + n)) { ports[d.id][n] = { role: 'Desg', sts: 'BKN*', cost: pc, inc: 'ROOT_Inc' }; continue; }
        const seg = segs.find((g) => g.a === d.id && g.aIf === n);
        if (!seg) { ports[d.id][n] = { role: 'Desg', sts: 'FWD', cost: pc, filtered: filtered.has(d.id + '|' + n) }; continue; }
        if (rootPort[d.id] === n) { ports[d.id][n] = { role: 'Root', sts: 'FWD', cost: pc }; continue; }
        const me = { c: cost[d.id], b: bid(d, vlan), p: ids[d.id][n] };
        const th = { c: cost[seg.b], b: bid(w.devices[seg.b], vlan), p: ids[seg.b][seg.bIf] };
        const iWin = me.c < th.c || (me.c === th.c && (bidLess(me.b, th.b) || (me.b.mac === th.b.mac && me.p < th.p)));
        ports[d.id][n] = iWin ? { role: 'Desg', sts: 'FWD', cost: pc } : { role: 'Altn', sts: 'BLK', cost: pc };
      }
    }
    // a loop exists when more switch-to-switch links forward than a tree allows
    const fwd = [];
    const seenL = new Set();
    for (const d of sws) for (const n of Object.keys(ports[d.id])) {
      const p = linkPeer(w, d.id, n);
      if (!p || !ports[p[0]] || !ports[p[0]][p[1]]) continue;
      const k = [d.id + '|' + n, p[0] + '|' + p[1]].sort().join('~');
      if (seenL.has(k)) continue;
      seenL.add(k);
      if (ports[d.id][n].sts === 'FWD' && ports[p[0]][p[1]].sts === 'FWD') fwd.push([d.id, p[0]]);
    }
    const par = {};
    const find = (x) => (par[x] === undefined || par[x] === x ? x : (par[x] = find(par[x])));
    let loop = false;
    for (const [x, y] of fwd) { const a = find(x), b = find(y); if (a === b) loop = true; else par[a] = b; }
    return { root, rootOf, cost, rootPort, ports, ids, loop };
  }

  /* ---- EtherChannel --------------------------------------------------- */
  const LACP = ['active', 'passive'];
  const PAGP = ['desirable', 'auto'];
  function ecCompatible(a, b) {
    if (a === 'on' || b === 'on') return a === 'on' && b === 'on';
    if (LACP.includes(a) && LACP.includes(b)) return a === 'active' || b === 'active';
    if (PAGP.includes(a) && PAGP.includes(b)) return a === 'desirable' || b === 'desirable';
    return false;
  }
  const sameL2 = (x, y) => !!x.routed === !!y.routed && (!!x.routed || (x.mode === y.mode && (x.mode === 'trunk' ? JSON.stringify(x.trunkAllowed) === JSON.stringify(y.trunkAllowed) : x.accessVlan === y.accessVlan)));
  /** Per switch: { group: { mode, proto, members: { ifn: 'P'|'I'|'s'|'D' }, up } } */
  function computeEc(w, id) {
    const d = w.devices[id];
    const groups = {};
    for (const [n, i] of Object.entries(d.interfaces)) {
      if (!i.channel) continue;
      const g = (groups[i.channel.group] = groups[i.channel.group] || { mode: i.channel.mode, members: {}, up: false });
      g.members[n] = 'D';
    }
    for (const [num, g] of Object.entries(groups)) {
      g.proto = LACP.includes(g.mode) ? 'LACP' : PAGP.includes(g.mode) ? 'PAgP' : '-';
      const names = Object.keys(g.members).sort(ifSort);
      const ref = d.interfaces[names[0]];
      for (const n of names) {
        const i = d.interfaces[n];
        if (!linkUp(w, id, n)) { g.members[n] = 'D'; continue; }
        if (!sameL2(i, ref)) { g.members[n] = 's'; continue; }
        const p = linkPeer(w, id, n);
        const o = p && w.devices[p[0]];
        const oi = o && o.interfaces[p[1]];
        // "on" never negotiates: it bundles even when the far end is not configured, which is how loops happen
        if (!o || o.kind !== 'switch' || !oi || !oi.channel) { g.members[n] = i.channel.mode === 'on' && o && o.kind === 'switch' ? 'P' : 'I'; continue; }
        if (!ecCompatible(i.channel.mode, oi.channel.mode)) { g.members[n] = 'I'; continue; }
        const oref = Object.entries(o.interfaces).filter(([, x]) => x.channel && x.channel.group === oi.channel.group).map(([k]) => k).sort(ifSort)[0];
        if (!sameL2(oi, o.interfaces[oref]) || !sameL2(oi, i)) { g.members[n] = 's'; continue; }
        g.members[n] = 'P';
      }
      g.up = Object.values(g.members).includes('P');
      groups[num] = g;
    }
    return groups;
  }
  function poUp(w, id, ifn) {
    const num = ifn.replace('Port-channel', '');
    const g = computeEc(w, id)[num];
    return !!(g && g.up);
  }

  /* ---- DHCP ------------------------------------------------------------ */
  /** DHCP pools on a router ("ip dhcp pool"), shaped like a server PC's pools. */
  function routerPools(w, d) {
    const out = [];
    for (const [name, pl] of Object.entries(d.dhcpPools || {})) {
      if (!pl.network || !pl.mask) continue;
      const net = ipToInt(pl.network);
      const p = maskToPrefix(pl.mask);
      const bc = (net | (~prefixToMaskInt(p) >>> 0)) >>> 0;
      const ex = (d.dhcpExcluded || []).map(([a, b]) => [ipToInt(a), ipToInt(b || a)]);
      const own = Object.values(d.interfaces).filter((i) => i.ip).map((i) => ipToInt(i.ip));
      out.push({ name, network: pl.network, mask: pl.mask, gw: pl.gw || '', dns: pl.dns, first: net + 1, last: bc - 1, skip: (a) => ex.some(([x, y]) => a >= x && a <= y) || own.includes(a) });
    }
    return out;
  }
  function routerOffer(w, d, clientId, giaddrInt) {
    const pool = routerPools(w, d).find((p) => netOf(giaddrInt, maskToPrefix(p.mask)) === ipToInt(p.network));
    if (!pool) return null;
    d.dhcpLeases = d.dhcpLeases || {};
    const have = d.dhcpLeases[clientId];
    if (have && netOf(ipToInt(have), maskToPrefix(pool.mask)) === ipToInt(pool.network)) return { ip: have, mask: pool.mask, gw: pool.gw, server: d.id };
    const used = new Set([...Object.values(d.dhcpLeases), ...Object.values(w.devices).filter((x) => x.kind === 'pc' && x.pc.ip).map((x) => x.pc.ip)]);
    for (let a = pool.first; a <= pool.last; a++) {
      if (pool.skip(a) || used.has(intToIp(a))) continue;
      d.dhcpLeases[clientId] = intToIp(a);
      return { ip: intToIp(a), mask: pool.mask, gw: pool.gw, server: d.id };
    }
    return null;
  }
  function dhcpRenew(w, clientId) {
    const c = w.devices[clientId];
    const offer = (srv, giaddrInt) => {
      const pool = (srv.pc.pools || []).find((p) => netOf(giaddrInt, maskToPrefix(p.mask)) === ipToInt(p.network));
      if (!pool) return null;
      srv.pc.leases = srv.pc.leases || {};
      if (srv.pc.leases[clientId] && netOf(ipToInt(srv.pc.leases[clientId]), maskToPrefix(pool.mask)) === ipToInt(pool.network)) {
        return { ip: srv.pc.leases[clientId], mask: pool.mask, gw: pool.gw, server: srv.id };
      }
      const used = new Set(Object.values(w.devices).filter((d) => d.kind === 'pc' && d.pc.ip).map((d) => d.pc.ip));
      for (let a = ipToInt(pool.start); a <= ipToInt(pool.end); a++) {
        const ip = intToIp(a);
        if (!used.has(ip) && !Object.values(srv.pc.leases).includes(ip)) {
          srv.pc.leases[clientId] = ip;
          return { ip, mask: pool.mask, gw: pool.gw, server: srv.id };
        }
      }
      return null;
    };
    // the client has no address yet: its broadcast reaches its own L2 domain
    const saved = { ip: c.pc.ip, mask: c.pc.mask, gw: c.pc.gw };
    c.pc.ip = '0.0.0.0';
    c.pc.mask = '0.0.0.0';
    const dom = l2Domain(w, clientId, 'NIC');
    Object.assign(c.pc, saved);
    let got = null;
    let via = null;
    /** Offers must not enter a snooping switch through an untrusted port. */
    const passes = (srcId, srcIf) => {
      const path = l2Path(w, srcId, srcIf, clientId);
      if (!path) return false;
      return path.every((h) => !snoopOn(w.devices[h.sw], h.vlan) || w.devices[h.sw].interfaces[h.port].snoopTrust);
    };
    for (const [id, ifn] of dom) {
      const d = w.devices[id];
      if (id === clientId) continue;
      if (d.kind === 'pc' && d.pc.server && d.pc.ip && passes(id, 'NIC')) { got = offer(d, ipToInt(d.pc.ip)); if (got) { via = id; break; } }
      if (routes(d) && d.dhcpPools && l3Up(w, id, ifn) && passes(id, ifn)) { got = routerOffer(w, d, clientId, ipOf(w, id, ifn)); if (got) { via = id; break; } }
    }
    if (!got) {
      const cache = computeOspf(w);
      for (const [id, ifn] of dom) {
        const d = w.devices[id];
        if (d.kind !== 'router') continue;
        const i = d.interfaces[ifn] || {};
        const gi = ipOf(w, id, ifn);
        if (!gi || !l3Up(w, id, ifn) || !(i.helpers || []).length || !passes(id, ifn)) continue;
        for (const h of i.helpers || []) {
          const srv = Object.values(w.devices).find((x) => (x.kind === 'pc' && x.pc.server && x.pc.ip === h) || (routes(x) && x.dhcpPools && Object.values(x.interfaces).some((y) => y.ip === h)));
          if (!srv) continue;
          const go = forward(w, id, ipToInt(h), cache);
          if (!go.ok || go.dstDev !== srv.id) continue;
          const back = forward(w, srv.id, gi, cache);
          if (!back.ok || back.dstDev !== id) continue;
          got = srv.kind === 'pc' ? offer(srv, gi) : routerOffer(w, srv, clientId, gi);
          if (got) { via = srv.id; break; }
        }
        if (got) break;
      }
    }
    if (got) {
      // DHCP snooping builds its binding table on the client's access switch
      const peer = linkPeer(w, clientId, 'NIC');
      const sw = peer && w.devices[peer[0]];
      if (sw && sw.kind === 'switch') {
        const port = sw.interfaces[peer[1]];
        if (port && snoopOn(sw, port.accessVlan)) {
          sw.snoop.bindings = sw.snoop.bindings || {};
          sw.snoop.bindings[clientId] = { mac: pcMac(c), ip: got.ip, vlan: port.accessVlan, port: peer[1] };
        }
      }
    }
    if (got) {
      Object.assign(c.pc, { ip: got.ip, mask: got.mask, gw: got.gw });
      return { ok: true, lease: got };
    }
    const n = clientId.length * 37;
    Object.assign(c.pc, { ip: `169.254.${(n % 250) + 2}.${(n * 7) % 250 + 2}`, mask: '255.255.0.0', gw: '' });
    return { ok: false };
  }

  /** A router interface with "ip address dhcp" asks a DHCP server in its broadcast domain. */
  function routerDhcp(w, id, ifn) {
    const d = w.devices[id];
    const i = d.interfaces[ifn];
    if (!i || !i.dhcp || !linkUp(w, id, ifn)) return null;
    const dom = l2Domain(w, id, ifn);
    for (const [sid] of dom) {
      const srv = w.devices[sid];
      if (sid === id || srv.kind !== 'pc' || !srv.pc.server || !srv.pc.ip) continue;
      const pool = (srv.pc.pools || []).find((p) => netOf(ipToInt(srv.pc.ip), maskToPrefix(p.mask)) === ipToInt(p.network));
      if (!pool) continue;
      srv.pc.leases = srv.pc.leases || {};
      const key = id + ':' + ifn;
      let ip = srv.pc.leases[key];
      if (!ip) {
        const used = new Set([...Object.values(srv.pc.leases), ...Object.values(w.devices).filter((x) => x.kind === 'pc' && x.pc.ip).map((x) => x.pc.ip)]);
        for (let a = ipToInt(pool.start); a <= ipToInt(pool.end); a++) if (!used.has(intToIp(a))) { ip = intToIp(a); break; }
        if (!ip) return null;
        srv.pc.leases[key] = ip;
      }
      Object.assign(i, { ip, mask: pool.mask, dhcpGw: pool.gw });
      return { ip, mask: pool.mask, gw: pool.gw };
    }
    return null;
  }
  /** NTP: synchronized when a configured server answers and is itself a time source. */
  function ntpStatus(w, id, depth) {
    const d = w.devices[id];
    if ((depth || 0) > 3) return { synced: false };
    if (d.ntp && d.ntp.master !== undefined) return { synced: true, stratum: d.ntp.master, ref: '127.127.1.1' };
    for (const s of (d.ntp && d.ntp.servers) || []) {
      const tgt = Object.values(w.devices).find((x) => (x.kind === 'pc' ? x.pc.ip === s : Object.values(x.interfaces).some((i) => i.ip === s)));
      if (!tgt) continue;
      const up = tgt.kind === 'pc' ? (tgt.pc.ntp ? { stratum: tgt.pc.stratum || 1 } : null) : ntpStatus(w, tgt.id, (depth || 0) + 1).synced ? ntpStatus(w, tgt.id, (depth || 0) + 1) : null;
      if (!up) continue;
      if (ping(w, id, s).ok) return { synced: true, stratum: up.stratum + 1, ref: s };
    }
    return { synced: false };
  }
  const isCisco = (d) => (d.kind === 'router' || d.kind === 'switch') && d.vendor !== 'other';
  const platformOf = (d) => d.platform || (d.kind === 'router' ? 'ISR4331' : d.multilayer ? 'C9300-48P' : 'WS-C2960');
  /** CDP or LLDP neighbors of a device, or null when that protocol is off on it. */
  function discNeighbors(w, id, proto) {
    const d = w.devices[id];
    const runs = (x) => (proto === 'cdp' ? isCisco(x) && x.cdp !== false : x.vendor === 'other' ? x.lldp !== false : !!x.lldp);
    if (!runs(d)) return null;
    const out = [];
    for (const [n, i] of Object.entries(d.interfaces)) {
      if (/^(Vlan|Port-channel|Loopback)/.test(n) || isSub(n)) continue;
      if (proto === 'cdp' && i.cdpOff) continue;
      if (!linkUp(w, id, n)) continue;
      const p = linkPeer(w, id, n);
      if (!p) continue;
      const o = w.devices[p[0]];
      if (!o || o.kind === 'pc' || !runs(o)) continue;
      if (proto === 'cdp' && (o.interfaces[p[1]] || {}).cdpOff) continue;
      if (proto === 'lldp' && (i.lldpRx === false || (o.interfaces[p[1]] || {}).lldpTx === false)) continue;
      const ips = Object.values(o.interfaces).filter((x) => x.ip).map((x) => x.ip);
      out.push({ local: n, dev: o, port: p[1], ip: ips[0] || null, platform: platformOf(o) });
    }
    return out;
  }

  /** MAC address table of a switch: which source MACs arrive on which port in which VLAN. */
  function macTable(w, swId) {
    const out = [];
    const sources = [];
    for (const d of Object.values(w.devices)) {
      if (d.id === swId) continue;
      if (d.kind === 'pc') sources.push([d.id, 'NIC', pcMac(d)]);
      else for (const n of Object.keys(d.interfaces)) if (d.interfaces[n].ip && (d.kind === 'router' || /^Vlan/.test(n) || d.interfaces[n].routed)) sources.push([d.id, n, ifMac(d, n)]);
    }
    for (const [id, ifn, mac] of sources) {
      if (!linkUp(w, id, ifn)) continue;
      const first = w.devices[id].kind === 'switch' && /^Vlan/.test(ifn) ? null : linkPeer(w, id, ifn);
      if (!first) continue;
      const si = w.devices[id].interfaces[ifn] || {};
      const startTag = isSub(ifn) ? (si.native ? null : si.encap || null) : null;
      const seen = new Set();
      const q = [[first[0], first[1], startTag]];
      while (q.length) {
        const [dev, port, tag] = q.shift();
        const d = w.devices[dev];
        if (d.kind !== 'switch') continue;
        const p = d.interfaces[port];
        if (!p || p.shutdown || p.errdis || p.routed) continue;
        let vlan;
        if (isTrunk(w, dev, port)) { vlan = tag === null ? nativeOf(p) : tag; if (!vlanAllowed(p, vlan)) continue; }
        else { if (tag !== null) continue; vlan = p.accessVlan; }
        if (!d.vlans[vlan] || seen.has(dev + '|' + vlan)) continue;
        seen.add(dev + '|' + vlan);
        if (dev === swId) { out.push({ vlan, mac, port }); continue; }
        for (const [pn, pp] of Object.entries(d.interfaces)) {
          if (pn === port || pp.shutdown || pp.errdis || pp.routed || /^(Vlan|Port-channel)/.test(pn)) continue;
          let et;
          if (isTrunk(w, dev, pn)) { if (!vlanAllowed(pp, vlan)) continue; et = vlan === nativeOf(pp) ? null : vlan; }
          else { if (pp.accessVlan !== vlan) continue; et = null; }
          const peer = linkPeer(w, dev, pn);
          if (peer && adminUp(w, peer[0], peer[1])) q.push([peer[0], peer[1], et]);
        }
      }
    }
    return out.sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));
  }

  /* ---- Read-only tracing for the diagrams (labfx) ------------------------------------------ */
  /** Is this switch port held out of forwarding by STP in this VLAN? A bundled EtherChannel member forwards with its bundle. */
  function stpBlocked(w, dev, ifn, vlan, cache) {
    const d = w.devices[dev];
    if (!d || d.kind !== 'switch') return false;
    cache = cache || {};
    const k = 'v' + vlan;
    if (!(k in cache)) { try { cache[k] = computeStp(w, vlan); } catch (e) { cache[k] = null; } }
    const st = cache[k];
    const p = st && st.ports[dev] && st.ports[dev][ifn];
    if (!p || !(p.role === 'Altn' || p.sts === 'BLK' || p.sts === 'BKN*')) return false;
    const i = d.interfaces[ifn];
    if (i && i.channel) {
      const g = computeEc(w, dev)[i.channel.group];
      if (g && g.members[ifn] === 'P') return false;
    }
    return true;
  }
  /** VLANs in which STP blocks this switch port (empty when it forwards everywhere, or is not a switch port). */
  function stpBlockedVlans(w, dev, ifn, cache) {
    const d = w.devices[dev];
    if (!d || d.kind !== 'switch' || !d.interfaces[ifn]) return [];
    cache = cache || {};
    return Object.keys(d.vlans || {}).map(Number).filter((v) => carries(w, d, ifn, v) && stpBlocked(w, dev, ifn, v, cache));
  }
  /** The cables one hop crosses, in travel order: [{a, ai, b, bi}], from the same Layer 2 walk forward() uses. */
  function legCables(w, L, stpCache) {
    const walk = (skip) => { const via = { hits: {}, skip }; l2Domain(w, L.from, L.out, via); return via.hits[L.to + '|' + L.in]; };
    // prefer the path Spanning Tree leaves forwarding; fall back to any Layer 2 path the simulator accepted
    const held = (dev, port, vlan) => {
      if (stpBlocked(w, dev, port, vlan, stpCache)) return true;
      const p = linkPeer(w, dev, port);
      return !!p && stpBlocked(w, p[0], p[1], vlan, stpCache);
    };
    const it = walk(held) || walk(null);
    const chain = [];
    for (let x = it; x; x = x[4]) chain.unshift(x);
    const out = [];
    for (const [dev, port] of chain) {
      if (!port) continue; // an SVI starts inside its own switch: no cable yet
      let p = linkPeer(w, dev, port);
      let here = port;
      if (!p && /^Port-channel/.test(port)) {
        // a routed port-channel: draw it on its first working member cable
        const g = Number(port.replace('Port-channel', ''));
        for (const [n, i] of Object.entries(w.devices[dev].interfaces).sort((a, b) => ifSort(a[0], b[0]))) {
          if (i.channel && i.channel.group === g && linkUp(w, dev, n) && linkPeer(w, dev, n)) { p = linkPeer(w, dev, n); here = n; break; }
        }
      }
      if (p) out.push({ a: p[0], ai: p[1], b: dev, bi: parentIf(here) });
    }
    if (!out.length && L.to !== L.from) {
      const p = linkPeer(w, L.from, L.out);
      if (p && p[0] === L.to) out.push({ a: L.from, ai: parentIf(L.out), b: p[0], bi: p[1] });
    }
    return out;
  }
  /**
   * Where a ping really goes: tracePath(w, srcId, dst) runs the simulator's own ping (on a copy, so NAT
   * state in w is untouched) and returns the cable-by-cable path for the echo and the reply.
   * { ok, local, reason, v6,
   *   there: { cables: [{a, ai, b, bi}], devs: [ids], l3: [{dev, in, ip}] },
   *   back:  same shape or null,
   *   fail:  { at: deviceId, leg: 'there'|'back', reason } or null }
   */
  function tracePath(w, srcId, dstStr) {
    const c = clone(w);
    const v6 = ipToInt(String(dstStr)) === null && v6parse(String(dstStr)) !== null;
    const tr = { there: [], back: [] };
    let r;
    try { r = v6 ? ping6(c, srcId, dstStr, { trace: tr }) : ping(c, srcId, dstStr, { trace: tr }); } catch (e) { r = { ok: false, reason: 'error' }; }
    const stpCache = {};
    const leg = (legs, name) => {
      const cables = [];
      const l3 = [];
      let fail = null;
      for (const L of legs) {
        if (L.fail) {
          let at = L.from;
          if (L.to !== undefined && L.in !== undefined) {
            let cs = legCables(c, L, stpCache);
            if (L.fail === 'dai') {
              // the ARP is dropped by the access switch in front of whichever end failed inspection
              if (L.side === 'from') cs = cs.slice(0, 1);
              else if (cs.length > 1) cs = cs.slice(0, -1);
              at = cs.length ? cs[cs.length - 1].b : L.from;
            } else at = L.to;
            cables.push(...cs);
          }
          fail = { at, leg: name, reason: L.fail };
          if (L.fail === 'acl') fail.dir = L.dir;
          if (L.fail === 'acl' && L.dir === 'in' && !v6 && ipOf(c, L.to, L.in) !== null) fail.ip = intToIp(ipOf(c, L.to, L.in));
          break;
        }
        cables.push(...legCables(c, L, stpCache));
        l3.push({ dev: L.to, in: L.in, ip: v6 ? null : ipOf(c, L.to, L.in) === null ? null : intToIp(ipOf(c, L.to, L.in)) });
      }
      const devs = [legs.length ? legs[0].from : srcId];
      for (const k of cables) if (devs[devs.length - 1] !== k.b) devs.push(k.b);
      return { cables, devs, l3, fail };
    };
    const there = leg(tr.there, 'there');
    const back = tr.back.length ? leg(tr.back, 'back') : null;
    let fail = null;
    if (!r.ok) {
      fail = there.fail || (back && back.fail) || null;
      if (!fail) {
        // the reply was delivered, just not to the sender (asymmetric routing, NAT mismatch)
        const lastBack = back && back.devs[back.devs.length - 1];
        fail = { at: lastBack || (there.devs[there.devs.length - 1]) || srcId, leg: back ? 'back' : 'there', reason: r.reason || 'no-return-path' };
      }
    }
    const strip = (x) => (x ? { cables: x.cables, devs: x.devs, l3: x.l3 } : null);
    // the source address the echo left with (for traceroute replies); null when it never left
    const first = tr.there[0];
    const sIp = !v6 && first && first.out ? ipOf(c, first.from, first.out) : null;
    return { ok: !!r.ok, local: !!r.local, reason: r.ok ? null : r.reason, v6, srcIp: sIp === null ? null : intToIp(sIp), there: strip(there), back: strip(back), fail };
  }

  TT.net = { tracePath, stpBlocked, stpBlockedVlans, isTrunk, linkParams, macTable, routerPools, routerDhcp, ntpStatus, discNeighbors, natGlobals, sviUp, poPeer, computeStp, computeEc, dhcpRenew, aclPermits, computeEigrp, vipsOf, ping6, routingTable6, psTick, pcMac, remoteLogin, arpOk, l2Path, makeWorld, linkPeer, linkUp, adminUp, l2Domain, computeOspf, routingTable, routerId, ping, ipOf, prefixOf, l3Up, clone };

  /* ------------------------------------------------------------------ *
   * CLI command trees
   * ------------------------------------------------------------------ */
  const PARAM_DESC = {
    ip: 'A.B.C.D',
    mask: 'A.B.C.D',
    wild: 'A.B.C.D',
    num: '<number>',
    vlan: '<1-4094>',
    word: 'WORD',
    if: 'interface',
    vlist: 'WORD  VLAN IDs, e.g. 10,20',
    rest: 'LINE',
    nhop: 'A.B.C.D or interface',
    v6p: 'X:X:X:X::X/<0-128>',
    v6: 'X:X:X:X::X',
    ipany: 'A.B.C.D or X:X:X:X::X',
    mac: 'H.H.H',
  };
  function paramOk(kind, tok) {
    switch (kind) {
      case 'ip':
        return ipToInt(tok) !== null;
      case 'mask':
        return maskToPrefix(tok) !== null;
      case 'wild':
        return ipToInt(tok) !== null;
      case 'num':
        return /^\d+$/.test(tok);
      case 'vlan':
        return /^\d+$/.test(tok) && +tok >= 1 && +tok <= 4094;
      case 'word':
        return tok.length > 0;
      case 'if':
        return canonIf(tok) !== null;
      case 'vlist':
        return /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(tok);
      case 'nhop':
        return ipToInt(tok) !== null || canonIf(tok) !== null;
      case 'v6p':
        return v6pfx(tok) !== null;
      case 'v6':
        return v6parse(tok) !== null;
      case 'ipany':
        return ipToInt(tok) !== null || v6parse(tok) !== null;
      case 'mac':
        return /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(tok);
      default:
        return true;
    }
  }

  function build(specs) {
    const root = { kw: {}, param: null, fn: null };
    for (const [pattern, fn, help] of specs) {
      let node = root;
      for (const part of pattern.split(' ')) {
        const m = /^<(\w+)>$/.exec(part);
        if (m) {
          if (!node.param) node.param = { kind: m[1], node: { kw: {}, param: null, fn: null } };
          node = node.param.node;
        } else {
          node.kw[part] = node.kw[part] || { kw: {}, param: null, fn: null, help: null };
          node = node.kw[part];
        }
      }
      node.fn = fn;
      if (help && !node.help) node.help = help;
    }
    return root;
  }

  const KW_HELP = {
    show: 'Show running system information',
    ip: 'IP information and configuration',
    interface: 'Interface status and configuration',
    interfaces: 'Interface status and configuration',
    ospf: 'OSPF information',
    vlan: 'VLAN information',
    no: 'Negate a command or set its defaults',
    switchport: 'Set switching mode characteristics',
    trunk: 'Set trunking characteristics of the interface',
    access: 'Set access mode characteristics of the interface',
    mode: 'Set trunking mode of the interface',
    allowed: 'Set allowed VLAN characteristics',
    router: 'Enable a routing process',
    copy: 'Copy from one file to another',
    configure: 'Enter configuration mode',
    route: 'Establish static routes',
    address: 'Set the IP address of an interface',
    neighbor: 'Neighbor list',
    brief: 'Brief summary',
  };

  /** Split a line into tokens, joining "g 0/1" style interface names. */
  function tokenize(line) {
    const raw = line.trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      const afterIf = out.length && /^int/i.test(out[out.length - 1].text) && 'interface'.startsWith(out[out.length - 1].text.toLowerCase());
      if (/^[a-z-]+$/i.test(t) && raw[i + 1] && (/^\d+(\/\d+)+(\.\d+)?$/.test(raw[i + 1]) || (afterIf && /^\d+$/.test(raw[i + 1]))) && canonIf(t + raw[i + 1])) {
        out.push({ text: t + raw[i + 1], raw: t + ' ' + raw[i + 1] });
        i++;
      } else out.push({ text: t, raw: t });
    }
    return out;
  }

  /** Walk the tree. Returns {fn, args, kws} or {error, at}. */
  function match(tree, tokens) {
    let node = tree;
    const args = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i].text;
      const lower = tok.toLowerCase();
      if (node.param && node.param.kind === 'rest') {
        args.push(tokens.slice(i).map((t) => t.raw).join(' '));
        node = node.param.node;
        return node.fn ? { fn: node.fn, args } : { error: 'incomplete' };
      }
      const exact = node.kw[lower];
      const cands = exact ? [lower] : Object.keys(node.kw).filter((k) => k.startsWith(lower));
      if (cands.length === 1) {
        node = node.kw[cands[0]];
        continue;
      }
      if (cands.length > 1 && !(node.param && paramOk(node.param.kind, tok))) {
        return { error: 'ambiguous', at: i, cands };
      }
      if (node.param && paramOk(node.param.kind, tok)) {
        args.push(tok);
        node = node.param.node;
        continue;
      }
      return { error: 'invalid', at: i };
    }
    if (node.fn) return { fn: node.fn, args };
    return { error: 'incomplete' };
  }

  /** For '?' help and Tab completion: the node reached by complete tokens. */
  function walk(tree, tokens) {
    let node = tree;
    for (const t of tokens) {
      const lower = t.text.toLowerCase();
      if (node.param && node.param.kind === 'rest') return node.param.node;
      const exact = node.kw[lower];
      const cands = exact ? [lower] : Object.keys(node.kw).filter((k) => k.startsWith(lower));
      if (cands.length === 1) node = node.kw[cands[0]];
      else if (node.param && paramOk(node.param.kind, t.text)) node = node.param.node;
      else return null;
    }
    return node;
  }

  /* ------------------------------------------------------------------ *
   * Session: one per ticket. Handles input for the currently selected device.
   * ------------------------------------------------------------------ */
  class Session {
    constructor(world) {
      this.w = world;
      this.pinged = new Set();
      this.trees = makeTrees(this);
    }

    prompt(id) {
      const d = this.w.devices[id];
      if (d.kind === 'pc') return 'C:\\>';
      const h = d.hostname;
      return (
        {
          user: h + '>',
          priv: h + '#',
          config: h + '(config)#',
          if: h + (Array.isArray(d.ctx) ? '(config-if-range)#' : '(config-if)#'),
          vlan: h + '(config-vlan)#',
          router: h + '(config-router)#',
          eigrp: h + '(config-router)#',
          line: h + '(config-line)#',
          dhcp: h + '(dhcp-config)#',
          acl: h + (d.aclStd ? '(config-std-nacl)#' : '(config-ext-nacl)#'),
        }[d.mode] || h + '>'
      );
    }

    treeFor(d) {
      const k = d.kind === 'pc' ? 'pc' : d.kind + ':' + d.mode;
      return this.trees[k];
    }

    /** Run one line on device id. Returns array of output lines. */
    run(id, line) {
      const d = this.w.devices[id];
      const out = [];
      const text = line.replace(/\s+$/, '');
      if (!text.trim()) return out;

      if (/\?$/.test(text)) return this.help(d, text.slice(0, -1));

      if (d.locked) return ['% Access denied. ' + d.hostname + ' is not managed by Harbor Point IT.'];
      const tokens = tokenize(text);
      const tree = this.treeFor(d);
      let res = match(tree, tokens);

      // IOS lets you type global config commands from a sub-mode.
      if (res.error && ['if', 'vlan', 'router', 'eigrp', 'line', 'dhcp', 'acl'].includes(d.mode)) {
        const g = match(this.trees[d.kind + ':config'], tokens);
        if (!g.error) {
          d.mode = 'config';
          d.ctx = null;
          res = g;
        }
      }
      if (res.error) return this.errorLines(d, text, tokens, res);
      try {
        const r = res.fn(d, res.args, text) || [];
        return out.concat(r, psTick(this.w));
      } catch (e) {
        return ['% ' + (e && e.message ? e.message : 'Command failed')];
      }
    }

    errorLines(d, text, tokens, res) {
      if (d.kind === 'pc') {
        return [`'${tokens[0].text}' is not recognized as an internal or external command.`, 'Type "help" to see what this PC can do.'];
      }
      if (res.error === 'incomplete') return ['% Incomplete command.'];
      if (res.error === 'ambiguous') return [`% Ambiguous command:  "${text.trim()}"`];
      // caret under the bad token
      const prompt = this.prompt(d.id);
      let col = 0;
      let consumed = 0;
      const trimmed = text.replace(/^\s+/, '');
      for (let i = 0; i < res.at; i++) {
        const idx = trimmed.indexOf(tokens[i].raw.split(' ')[0], consumed);
        consumed = idx + tokens[i].raw.length;
      }
      col = trimmed.indexOf(tokens[res.at].raw.split(' ')[0], consumed);
      return [' '.repeat(prompt.length + Math.max(0, col)) + '^', "% Invalid input detected at '^' marker."];
    }

    help(d, before) {
      const tokens = tokenize(before);
      const endsWithSpace = /\s$/.test(before) || before === '';
      const tree = this.treeFor(d);
      if (!endsWithSpace) {
        // "sh?" style: list keywords starting with the partial word
        const partial = tokens.pop();
        const node = walk(tree, tokens);
        if (!node) return ["% Unrecognized command"];
        const ks = Object.keys(node.kw).filter((k) => k.startsWith(partial.text.toLowerCase()));
        return ks.length ? [ks.join('  ')] : ['% Unrecognized command'];
      }
      const node = walk(tree, tokens);
      if (!node) return ["% Unrecognized command"];
      const lines = [];
      for (const [k, v] of Object.entries(node.kw).sort()) lines.push('  ' + k.padEnd(18) + (v.help || KW_HELP[k] || ''));
      if (node.param) lines.push('  ' + PARAM_DESC[node.param.kind].padEnd(18));
      if (node.fn) lines.push('  <cr>');
      return lines;
    }

    /** Tab completion: returns the completed line, or null. */
    complete(id, line) {
      const d = this.w.devices[id];
      if (/\s$/.test(line) || !line.trim()) return null;
      const tokens = tokenize(line);
      const last = tokens.pop();
      let node = walk(this.treeFor(d), tokens);
      if (!node && ['if', 'vlan', 'router', 'eigrp', 'line', 'dhcp', 'acl'].includes(d.mode)) node = walk(this.trees[d.kind + ':config'], tokens);
      if (!node) return null;
      const cands = Object.keys(node.kw).filter((k) => k.startsWith(last.text.toLowerCase()));
      if (cands.length !== 1) return null;
      return line.slice(0, line.length - last.text.length) + cands[0] + ' ';
    }
  }

  /* ------------------------------------------------------------------ *
   * Command implementations
   * ------------------------------------------------------------------ */
  function makeTrees(S) {
    const w = S.w;
    const ev = (msg) => w.events.push(msg);

    const linkMsgs = (d, ifn) => {
      const lines = [];
      const changed = (dev, n, up) => {
        lines.push(`%LINK-5-CHANGED: Interface ${n}, changed state to ${up ? 'up' : 'down'}`);
        lines.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to ${up ? 'up' : 'down'}`);
      };
      const i = d.interfaces[ifn];
      if (i.shutdown) {
        lines.push(`%LINK-5-CHANGED: Interface ${ifn}, changed state to administratively down`);
        lines.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${ifn}, changed state to down`);
      } else if (linkUp(w, d.id, ifn)) changed(d, ifn, true);
      return lines;
    };

    // ---------- show commands (shared by user/priv and "do") ----------
    const showIpIntBrief = (d) => {
      const lines = ['Interface              IP-Address      OK? Method Status                Protocol'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const i = d.interfaces[n];
        const status = i.shutdown ? 'administratively down' : linkUp(w, d.id, n) ? 'up' : 'down';
        const proto = linkUp(w, d.id, n) ? 'up' : 'down';
        lines.push(
          n.padEnd(23) + (i.ip || 'unassigned').padEnd(16) + 'YES ' + (i.dhcp ? 'DHCP   ' : i.ip ? 'manual ' : 'unset  ') + status.padEnd(22) + proto
        );
      }
      return lines;
    };

    const showRun = (d) => {
      const L = ['Building configuration...', '', 'Current configuration : ' + (900 + Object.keys(d.interfaces).length * 60) + ' bytes', '!', 'version 15.2', d.pwEnc ? 'service password-encryption' : 'no service password-encryption', '!', 'hostname ' + d.hostname, '!'];
      if (d.enableSecret) L.push('enable secret 5 $1$mERr$' + hex4(d.enableSecret) + 'Qk1rP0tT9vD/', '!');
      if (d.enablePassword) L.push('enable password ' + (d.pwEnc ? '7 0822455D0A16' : d.enablePassword));
      if (d.tz) L.push(`clock timezone ${d.tz.name} ${d.tz.off}`);
      if (d.kind === 'switch' && d.ipRouting) L.push('ip routing');
      if (d.domain) L.push('ip domain-name ' + d.domain);
      if (d.cdp === false) L.push('no cdp run');
      if (d.noLookup) L.push('no ip domain lookup');
      if (d.pwMin) L.push('security passwords min-length ' + d.pwMin);
      if (d.loginBlock) L.push(`login block-for ${d.loginBlock[0]} attempts ${d.loginBlock[1]} within ${d.loginBlock[2]}`);
      if (d.timestamps) L.push('service timestamps ' + d.timestamps);
      if (d.stpMode) L.push('spanning-tree mode ' + d.stpMode);
      if (d.portfastDefault) L.push('spanning-tree portfast default');
      if (d.bpduguardDefault) L.push('spanning-tree portfast bpduguard default');
      if (d.bpdufilterDefault) L.push('spanning-tree portfast bpdufilter default');
      for (const c of d.errRecovery || []) L.push('errdisable recovery cause ' + c);
      if (d.errInterval) L.push('errdisable recovery interval ' + d.errInterval);
      if (d.ecLb) L.push('port-channel load-balance ' + d.ecLb);
      for (const [a, b] of d.dhcpExcluded || []) L.push('ip dhcp excluded-address ' + a + (b !== a ? ' ' + b : ''));
      for (const [n, pl] of Object.entries(d.dhcpPools || {})) { L.push('!', 'ip dhcp pool ' + n); if (pl.network) L.push(` network ${pl.network} ${pl.mask}`); if (pl.gw) L.push(' default-router ' + pl.gw); if (pl.dns) L.push(' dns-server ' + pl.dns); if (pl.domain) L.push(' domain-name ' + pl.domain); }
      if (d.lldp && d.vendor !== 'other') L.push('lldp run');
      if (d.v6routing) L.push('ipv6 unicast-routing');
      for (const [u, x] of Object.entries(d.users || {})) L.push(x.secret ? `username ${u} secret 5 $1$h9Ws$${hex4(u + x.secret)}aB3x/` : `username ${u} password ${d.pwEnc ? '7 0822455D0A16' : x.password}`);
      if (d.sshver === 2) L.push('ip ssh version 2');
      if (d.snoop && d.snoop.on) { L.push('ip dhcp snooping'); if ((d.snoop.vlans || []).length) L.push('ip dhcp snooping vlan ' + fmtVlans(d.snoop.vlans)); if (d.snoop.noOpt82) L.push('no ip dhcp snooping information option'); }
      if (d.dai && (d.dai.vlans || []).length) L.push('ip arp inspection vlan ' + fmtVlans(d.dai.vlans));
      L.push('!');
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const i = d.interfaces[n];
        L.push('interface ' + n);
        if (i.desc) L.push(' description ' + i.desc);
        if (i.encap) L.push(' encapsulation dot1Q ' + i.encap + (i.native ? ' native' : ''));
        if (d.kind === 'switch' && (/^Vlan\d+$/.test(n) || i.routed)) {
          if (i.routed) L.push(' no switchport');
          L.push(i.ip ? ` ip address ${i.ip} ${i.mask}` : ' no ip address');
          if (i.channel) L.push(` channel-group ${i.channel.group} mode ${i.channel.mode}`);
          if (i.cdpOff) L.push(' no cdp enable');
          if (i.shutdown) L.push(' shutdown');
          L.push('!');
          continue;
        }
        if (d.kind === 'switch') {
          if (i.channel) L.push(` channel-group ${i.channel.group} mode ${i.channel.mode}`);
          if (i.rootGuard) L.push(' spanning-tree guard root');
          if (i.nativeVlan) L.push(' switchport trunk native vlan ' + i.nativeVlan);
          if (i.voiceVlan) L.push(' switchport voice vlan ' + i.voiceVlan);
          if (i.nonegotiate) L.push(' switchport nonegotiate');
          if (i.speed) L.push(' speed ' + i.speed);
          if (i.duplex) L.push(' duplex ' + i.duplex);
          if (i.loopGuard) L.push(' spanning-tree guard loop');
          if (i.bpdufilter) L.push(' spanning-tree bpdufilter enable');
          if (i.cdpOff) L.push(' no cdp enable');
          if (i.ps && i.ps.on) {
            L.push(' switchport port-security');
            if ((i.ps.max || 1) !== 1) L.push(' switchport port-security maximum ' + i.ps.max);
            if (i.ps.viol && i.ps.viol !== 'shutdown') L.push(' switchport port-security violation ' + i.ps.viol);
            if (i.ps.sticky) {
              L.push(' switchport port-security mac-address sticky');
              for (const m of i.ps.macs || []) L.push(' switchport port-security mac-address sticky ' + m);
            }
          }
          if (i.snoopTrust) L.push(' ip dhcp snooping trust');
          if (i.daiTrust) L.push(' ip arp inspection trust');
          if (i.portfast) L.push(' spanning-tree portfast');
          if (i.bpduguard) L.push(' spanning-tree bpduguard enable');
          if (/^Port-channel/.test(n)) { if (i.shutdown) L.push(' shutdown'); L.push('!'); continue; }
          if (i.mode === 'trunk' || /^dynamic/.test(i.mode)) {
            if (i.trunkAllowed !== 'all') L.push(' switchport trunk allowed vlan ' + fmtVlans(i.trunkAllowed));
            L.push(' switchport mode ' + i.mode.replace('-', ' '));
          } else {
            if (i.accessVlan !== 1) L.push(' switchport access vlan ' + i.accessVlan);
            if (i.modeSet) L.push(' switchport mode access');
          }
        } else {
          L.push(i.dhcp ? ' ip address dhcp' : i.ip ? ` ip address ${i.ip} ${i.mask}` : ' no ip address');
          if (i.ospfNet === 'p2p') L.push(' ip ospf network point-to-point');
          if (i.ospfPrio !== undefined) L.push(' ip ospf priority ' + i.ospfPrio);
          if (i.cdpOff) L.push(' no cdp enable');
          if (i.speed) L.push(' speed ' + i.speed);
          if (i.duplex) L.push(' duplex ' + i.duplex);
          if (i.hsrpVer === 2) L.push(' standby version 2');
          if (i.ll) L.push(` ipv6 address ${i.ll} link-local`);
          if (i.v6enable) L.push(' ipv6 enable');
          for (const x of i.ipv6 || []) L.push(x.eui ? ` ipv6 address ${v6fmt(v6net(v6parse(x.addr), 64))}/64 eui-64` : ` ipv6 address ${x.addr}/${x.p}`);
          for (const [g, c] of Object.entries(i.standby || {})) {
            if (c.ip) L.push(` standby ${g} ip ${c.ip}`);
            if (c.prio !== undefined) L.push(` standby ${g} priority ${c.prio}`);
            if (c.preempt) L.push(` standby ${g} preempt`);
          }
          for (const h of i.helpers || []) L.push(' ip helper-address ' + h);
          if (i.aclIn !== undefined) L.push(` ip access-group ${i.aclIn} in`);
          if (i.aclOut !== undefined) L.push(` ip access-group ${i.aclOut} out`);
          if (i.nat) L.push(' ip nat ' + i.nat);
        }
        if (i.shutdown) L.push(' shutdown');
        L.push('!');
      }
      if (d.ospf) {
        L.push('router ospf ' + d.ospf.pid);
        if (d.ospf.routerId) L.push(' router-id ' + d.ospf.routerId);
        if (d.ospf.refBw) L.push(' auto-cost reference-bandwidth ' + d.ospf.refBw);
        if (d.ospf.passiveDefault) { L.push(' passive-interface default'); for (const p of d.ospf.nonPassive || []) L.push(' no passive-interface ' + p); }
        for (const p of d.ospf.passiveDefault ? [] : d.ospf.passive || []) L.push(' passive-interface ' + p);
        if (d.ospf.defOrig) L.push(' default-information originate' + (d.ospf.defOrig === 'always' ? ' always' : ''));
        for (const n of d.ospf.networks || []) L.push(` network ${n.net} ${n.wild} area ${n.area}`);
        L.push('!');
      }
      if (d.eigrp) {
        L.push('router eigrp ' + d.eigrp.as);
        for (const p of d.eigrp.passive || []) L.push(' passive-interface ' + p);
        for (const n of d.eigrp.networks || []) L.push(' network ' + n.net + (n.wild ? ' ' + n.wild : ''));
        L.push('!');
      }
      for (const [n, pl] of Object.entries(d.natPools || {})) L.push(`ip nat pool ${n} ${pl.start} ${pl.end} netmask ${pl.mask}`);
      if (d.nat && d.nat.list !== undefined) L.push(d.nat.pool ? `ip nat inside source list ${d.nat.list} pool ${d.nat.pool}${d.nat.overload ? ' overload' : ''}` : `ip nat inside source list ${d.nat.list} interface ${d.nat.outIf} overload`);
      for (const m of d.natStatic || []) L.push(`ip nat inside source static ${m.local} ${m.global}`);
      for (const r of d.routes6 || []) L.push(`ipv6 route ${r.pfx} ${r.nh}`);
      for (const r of d.routes || []) L.push(`ip route ${r.net} ${r.mask} ${r.nh || r.exitIf}${r.ad ? ' ' + r.ad : ''}`);
      if (d.defaultGw) L.push('ip default-gateway ' + d.defaultGw);
      for (const [num, list] of Object.entries(d.acls || {})) {
        if (/^\d+$/.test(num)) { for (const e of list) L.push(`access-list ${num} ${e.text}`); continue; }
        L.push(`ip access-list ${list.length && list[0].std ? 'standard' : 'extended'} ${num}`);
        for (const e of list) L.push(' ' + e.text);
      }
      for (const h of (d.logging && d.logging.hosts) || []) L.push('logging host ' + h);
      if (d.logging && d.logging.trap) L.push('logging trap ' + d.logging.trap);
      for (const [c, rw] of Object.entries((d.snmp && d.snmp.communities) || {})) L.push(`snmp-server community ${c} ${rw}`);
      if (d.stp && d.stp.prio) for (const [v, pr] of Object.entries(d.stp.prio)) L.push(`spanning-tree vlan ${v} priority ${pr}`);
      if ((d.routes || []).length) L.push('!');
      const vty = d.vty || { transport: ['telnet'], login: null };
      const con = d.con || {};
      const enc = (pw) => (d.pwEnc ? '7 0822455D0A16' : pw);
      L.push('line con 0');
      if (con.timeout) L.push(` exec-timeout ${con.timeout[0]} ${con.timeout[1]}`);
      if (con.password) L.push(' password ' + enc(con.password));
      if (con.logsync) L.push(' logging synchronous');
      if (con.login === 'local') L.push(' login local'); else if (con.login === 'password') L.push(' login');
      if (d.motd) L.push('banner motd ^C' + d.motd + '^C');
      L.push('!', 'line vty 0 15');
      if (vty.accessClass !== undefined) L.push(' access-class ' + vty.accessClass + ' in');
      if (vty.timeout) L.push(` exec-timeout ${vty.timeout[0]} ${vty.timeout[1]}`);
      if (vty.password) L.push(' password ' + enc(vty.password));
      if (vty.login === 'local') L.push(' login local');
      else if (vty.login === 'password') L.push(' login');
      L.push(' transport input ' + ((vty.transport || []).length ? vty.transport.join(' ') : 'none'), '!');
      if (d.ntp && d.ntp.master !== undefined) L.push('ntp master ' + d.ntp.master);
      for (const x of (d.ntp && d.ntp.servers) || []) L.push('ntp server ' + x);
      L.push('end');
      return L;
    };

    const showIpRoute = (d) => {
      if (d.kind === 'switch' && !d.ipRouting) return [d.defaultGw ? 'Default gateway is ' + d.defaultGw : 'Default gateway is not set', '', 'Host               Gateway           Last Use    Total Uses  Interface', 'ICMP redirect cache is empty', '(This switch is not routing. "ip routing" turns it into a Layer 3 switch.)'];
      const cache = computeOspf(w);
      const rt = routingTable(w, d.id, cache);
      const L = [
        'Codes: L - local, C - connected, S - static, O - OSPF, D - EIGRP',
        '       E1 - OSPF external type 1, E2 - OSPF external type 2',
        '       * - candidate default',
        '',
      ];
      const def = rt.find((r) => r.net === 0 && r.p === 0);
      L.push(def ? `Gateway of last resort is ${def.nh || 'directly connected'} to network 0.0.0.0` : 'Gateway of last resort is not set');
      L.push('');
      for (const r of rt) {
        const pfx = intToIp(r.net) + '/' + r.p;
        if (r.type === 'C' || r.type === 'L') L.push(`${r.type}        ${pfx} is directly connected, ${r.if}`);
        else if (r.type === 'S') {
          const star = r.net === 0 && r.p === 0 ? 'S*' : 'S ';
          L.push(r.nh ? `${star}       ${pfx} [${r.ad}/0] via ${r.nh}${r.dhcp ? ' (learned from DHCP)' : ''}` : `${star}       ${pfx} is directly connected, ${r.if}`);
        } else if (r.type === 'O') L.push(r.e2 ? `O*E2     ${pfx} [110/1] via ${r.nh}, 00:01:12, ${r.if}` : `O        ${pfx} [110/${r.cost + 1}] via ${r.nh}, 00:01:12, ${r.if}`);
        else if (r.type === 'D') L.push(`D        ${pfx} [90/${r.metric}] via ${r.nh}, 00:02:41, ${r.if}`);
      }
      return L;
    };

    const showVlanBrief = (d) => {
      const L = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
      for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
        const ports = Object.entries(d.interfaces)
          .filter(([n, i]) => !/^Vlan/.test(n) && !i.routed && !isTrunk(w, d.id, n) && i.accessVlan === v)
          .map(([n]) => shortIf(n))
          .sort(ifSort);
        L.push(String(v).padEnd(5) + d.vlans[v].padEnd(33) + 'active    ' + ports.join(', '));
      }
      return L;
    };

    const showIntTrunk = (d) => {
      const trunks = Object.entries(d.interfaces).filter(([n]) => !/^Vlan/.test(n) && isTrunk(w, d.id, n) && linkUp(w, d.id, n));
      if (!trunks.length) return [''];
      const L = ['', 'Port        Mode             Encapsulation  Status        Native vlan'];
      for (const [n, i] of trunks) L.push(shortIf(n).padEnd(12) + ({ trunk: 'on', 'dynamic-auto': 'auto', 'dynamic-desirable': 'desirable' }[adminMode(i)] || 'on').padEnd(17) + '802.1q'.padEnd(15) + 'trunking'.padEnd(14) + nativeOf(i));
      L.push('', 'Port        Vlans allowed on trunk');
      for (const [n, i] of trunks) L.push(shortIf(n).padEnd(12) + (i.trunkAllowed === 'all' ? '1-4094' : fmtVlans(i.trunkAllowed)));
      L.push('', 'Port        Vlans allowed and active in management domain');
      for (const [n, i] of trunks) {
        const act = Object.keys(d.vlans)
          .map(Number)
          .filter((v) => vlanAllowed(i, v))
          .sort((a, b) => a - b);
        L.push(shortIf(n).padEnd(12) + (act.length ? act.join(',') : 'none'));
      }
      return L;
    };

    const showOspfNei = (d) => {
      if (!d.ospf) return [''];
      const { adj } = computeOspf(w);
      const L = ['', 'Neighbor ID     Pri   State           Dead Time   Address         Interface'];
      const me = routerId(d);
      for (const a of adj.filter((x) => x.a === d.id)) {
        const o = w.devices[a.b];
        const rid = routerId(o);
        me && 0;
        const oi = o.interfaces[a.bIf] || {};
        const pri = a.role === 'P2P' ? 0 : oi.ospfPrio === undefined ? 1 : oi.ospfPrio;
        const state = a.mism ? 'FULL/  -' : a.role === 'P2P' ? 'FULL/  -' : (a.full ? 'FULL/' : '2WAY/') + a.nbRole;
        L.push(rid.padEnd(16) + String(pri).padEnd(6) + state.padEnd(16) + '00:00:3' + (a.b.length % 10) + '    ' + intToIp(ipOf(w, a.b, a.bIf)).padEnd(16) + a.aIf);
      }
      return L;
    };

    const showOspfIntBrief = (d) => {
      if (!d.ospf) return ['% OSPF: No router process is configured'];
      const L = ['Interface    PID   Area            IP Address/Mask    Cost  State   Nbrs F/C'];
      const { adj } = computeOspf(w);
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const area = ospfIfArea(d, n);
        if (area === null) continue;
        const i = d.interfaces[n];
        const nb = adj.filter((x) => x.a === d.id && x.aIf === n).length;
        const full = adj.filter((x) => x.a === d.id && x.aIf === n && (x.full || x.role === 'P2P')).length;
        const st = !linkUp(w, d.id, n) ? 'DOWN' : /^Loopback/.test(n) ? 'LOOP' : i.ospfNet === 'p2p' ? 'P2P' : (w.ospfRoles || {})[d.id + '|' + n] || ((d.ospf.passive || []).includes(n) ? 'DR' : 'WAIT');
        L.push(shortIf(n).padEnd(13) + String(d.ospf.pid).padEnd(6) + area.padEnd(16) + (i.ip + '/' + maskToPrefix(i.mask)).padEnd(19) + '1'.padEnd(6) + st.padEnd(8) + `${full}/${nb}`);
      }
      return L;
    };

    const showOspfIf = (d, [name]) => {
      const n = canonIf(name);
      const i = d.interfaces[n];
      if (!i) throw new Error(`Interface ${name} does not exist.`);
      if (!d.ospf || ospfIfArea(d, n) === null) return [`${n} is ${linkUp(w, d.id, n) ? 'up' : 'down'}, line protocol is ${linkUp(w, d.id, n) ? 'up' : 'down'}`, '  OSPF not enabled on this interface'];
      const { adj } = computeOspf(w);
      const mine = adj.filter((x) => x.a === d.id && x.aIf === n);
      const p2p = i.ospfNet === 'p2p';
      const role = p2p ? 'POINT_TO_POINT' : (w.ospfRoles || {})[d.id + '|' + n] || 'WAITING';
      const p = maskToPrefix(i.mask);
      const seg = (w.ospfDr || {})[intToIp(netOf(ipToInt(i.ip), p)) + '/' + p] || {};
      const ridOf = (id) => (id ? routerId(w.devices[id]) : null);
      const ipOn = (id) => { if (!id) return null; const x = Object.entries(w.devices[id].interfaces).find(([k, v]) => v.ip && netOf(ipToInt(v.ip), p) === netOf(ipToInt(i.ip), p)); return x ? x[1].ip : null; };
      const L = [`${n} is up, line protocol is up`, `  Internet Address ${i.ip}/${p}, Area ${ospfIfArea(d, n)}`, `  Process ID ${d.ospf.pid}, Router ID ${routerId(d)}, Network Type ${p2p ? 'POINT_TO_POINT' : 'BROADCAST'}, Cost: 1`];
      L.push(`  Transmit Delay is 1 sec, State ${role === 'DROTHER' ? 'DROTHER' : role}${p2p ? '' : ', Priority ' + (i.ospfPrio === undefined ? 1 : i.ospfPrio)}`);
      if (!p2p) {
        if (seg.dr) L.push(`  Designated Router (ID) ${ridOf(seg.dr)}, Interface address ${ipOn(seg.dr)}`); else L.push('  No designated router on this network');
        if (seg.bdr) L.push(`  Backup Designated router (ID) ${ridOf(seg.bdr)}, Interface address ${ipOn(seg.bdr)}`); else L.push('  No backup designated router on this network');
      }
      L.push('  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5', `  Neighbor Count is ${mine.length}, Adjacent neighbor count is ${mine.filter((x) => x.full || p2p).length}`);
      for (const a of mine.filter((x) => x.full || p2p)) L.push(`    Adjacent with neighbor ${routerId(w.devices[a.b])}${a.nbRole === 'DR' ? '  (Designated Router)' : a.nbRole === 'BDR' ? '  (Backup Designated Router)' : ''}`);
      return L;
    };
    const showStp = (d, [v]) => {
      const vlans = v ? [Number(v)] : Object.keys(d.vlans).map(Number).sort((a, b) => a - b);
      const L = [];
      for (const vlan of vlans) {
        if (!d.vlans[vlan]) { L.push(`Spanning tree instance(s) for vlan ${vlan} does not exist.`); continue; }
        const st = computeStp(w, vlan);
        if (!st) continue;
        const me = bid(d, vlan);
        const myRoot = st.rootOf[d.id];
        const rootDev = w.devices[myRoot.dev];
        const rp = st.rootPort[d.id];
        L.push('', 'VLAN' + String(vlan).padStart(4, '0'), '  Spanning tree enabled protocol ' + (d.stpMode === 'rapid-pvst' ? 'rstp' : d.stpMode === 'mst' ? 'mstp' : 'ieee'));
        L.push(`  Root ID    Priority    ${myRoot.pr}`, `             Address     ${myRoot.mac}`);
        if (myRoot.dev === d.id) L.push('             This bridge is the root');
        else L.push(`             Cost        ${st.cost[d.id]}`, `             Port        ${st.ids[d.id][rp]} (${rp})`);
        L.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '');
        L.push(`  Bridge ID  Priority    ${me.pr}  (priority ${me.pr - vlan} sys-id-ext ${vlan})`, `             Address     ${me.mac}`, '');
        L.push('Interface           Role Sts Cost      Prio.Nbr Type', '------------------- ---- --- --------- -------- --------------------------------');
        for (const [n, pp] of Object.entries(st.ports[d.id] || {}).sort((a, b) => ifSort(a[0], b[0]))) {
          const ii = d.interfaces[n];
          L.push(shortIf(n).padEnd(20) + pp.role.padEnd(5) + pp.sts.padEnd(5) + String(pp.cost).padEnd(9) + ('128.' + st.ids[d.id][n]).padEnd(9) + 'P2p' + (ii.portfast ? ' Edge' : '') + (pp.inc ? ' *' + pp.inc : '') + (ii.loopGuard ? ' (Loop guard)' : '') + (ii.bpdufilter ? ' (BPDU filter: no BPDUs sent or received)' : ''));
        }
        rootDev && 0;
      }
      return L;
    };
    const showEc = (d) => {
      const groups = computeEc(w, d.id);
      const L = ['Flags:  D - down        P - bundled in port-channel', '        I - stand-alone s - suspended', '        R - Layer3      S - Layer2', '        U - in use', '', `Number of channel-groups in use: ${Object.keys(groups).length}`, `Number of aggregators:           ${Object.keys(groups).length}`, '', 'Group  Port-channel  Protocol    Ports', '------+-------------+-----------+-----------------------------------------------'];
      for (const [num, g] of Object.entries(groups)) {
        const ports = Object.entries(g.members).sort((a, b) => ifSort(a[0], b[0])).map(([n, f]) => `${shortIf(n)}(${f})`).join('  ');
        const l3 = (d.interfaces['Port-channel' + num] || {}).routed;
        L.push(String(num).padEnd(7) + `Po${num}(${l3 ? 'R' : 'S'}${g.up ? 'U' : 'D'})`.padEnd(14) + g.proto.padEnd(12) + ports);
      }
      return L;
    };
    const showAcl = (d) => {
      const L = [];
      for (const [num, list] of Object.entries(d.acls || {})) {
        L.push(`${isStdAcl(Number(num)) ? 'Standard' : 'Extended'} IP access list ${num}`);
        list.forEach((e, k) => L.push(`    ${(k + 1) * 10} ${e.text}`));
      }
      return L.length ? L : [''];
    };
    const showNat = (d) => {
      const L = ['Pro  Inside global         Inside local          Outside local         Outside global'];
      for (const m of d.natStatic || []) L.push('---  ' + m.global.padEnd(22) + m.local.padEnd(22) + '---'.padEnd(22) + '---');
      for (const [loc, g] of Object.entries(d.natMap || {})) L.push('---  ' + g.padEnd(22) + loc.padEnd(22) + '---'.padEnd(22) + '---');
      (d.natTable || []).forEach((t, k) => L.push(('icmp ' + (t.global + ':' + (k + 1)).padEnd(22) + (t.inside + ':' + (k + 1)).padEnd(22) + (t.dst + ':' + (k + 1)).padEnd(22) + t.dst + ':' + (k + 1))));
      return L;
    };

    const showV6Brief = (d) => {
      const L = [];
      Object.keys(d.interfaces).sort(ifSort).forEach((n, k) => {
        const i = d.interfaces[n];
        const st = i.shutdown ? '[administratively down/down]' : linkUp(w, d.id, n) ? '[up/up]' : '[down/down]';
        L.push(n.padEnd(23) + st);
        if ((i.ipv6 || []).length) {
          L.push('    FE80::' + (k + 1));
          for (const x of i.ipv6) L.push('    ' + v6fmt(v6parse(x.addr)));
        } else L.push('    unassigned');
      });
      return L;
    };
    const showV6Route = (d) => {
      const rt = routingTable6(w, d.id);
      const L = [`IPv6 Routing Table - default - ${rt.length} entries`, 'Codes: C - Connected, L - Local, S - Static', ''];
      for (const r of rt) {
        L.push(`${r.type}   ${v6fmt(r.net)}/${r.p} [${r.ad}/0]`);
        L.push(r.type === 'S' ? `     via ${v6fmt(v6parse(r.nh))}` : `     via ${r.if}, ${r.type === 'L' ? 'receive' : 'directly connected'}`);
      }
      return L;
    };
    const showStandby = (d) => {
      const L = ['                     P indicates configured to preempt.', '                     |', 'Interface   Grp  Pri P State   Active          Standby         Virtual IP'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const i = d.interfaces[n];
        for (const [g, c] of Object.entries(i.standby || {})) {
          const up = l3Up(w, d.id, n);
          const vip = c.ip || '';
          const act = vipsOf(w, d.id, n).length > 0;
          const peers = up ? l2Domain(w, d.id, n).filter(([oid, oif]) => oid !== d.id && w.devices[oid].kind === 'router' && (w.devices[oid].interfaces[oif].standby || {})[g] && l3Up(w, oid, oif)) : [];
          const other = peers[0] ? intToIp(ipOf(w, peers[0][0], peers[0][1])) : 'unknown';
          const state = !up ? 'Init' : act ? 'Active' : 'Standby';
          L.push(shortIf(n).padEnd(12) + String(g).padEnd(5) + String(c.prio === undefined ? 100 : c.prio).padEnd(4) + (c.preempt ? 'P ' : '  ') + state.padEnd(8) + (act ? 'local' : other).padEnd(16) + (act ? other : 'local').padEnd(16) + (vip || 'unknown'));
        }
      }
      return L;
    };
    const showEigrpNei = (d) => {
      if (!d.eigrp) return ['% EIGRP is not running on this router.'];
      const { adj } = computeEigrp(w);
      const L = [`EIGRP-IPv4 Neighbors for AS(${d.eigrp.as})`, 'H   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq', '                                                   (sec)         (ms)       Cnt Num'];
      adj.filter((a) => a.a === d.id).forEach((a, k) => L.push(String(k).padEnd(4) + intToIp(ipOf(w, a.b, a.bIf)).padEnd(24) + shortIf(a.aIf).padEnd(23) + '13 00:02:41    1   100  0  ' + (5 + k)));
      return L;
    };
    const showPs = (d, args) => {
      if (args && args[0]) {
        const n = canonIf(args[0]);
        const i = d.interfaces[n];
        if (!i) throw new Error(`Interface ${args[0]} does not exist.`);
        const ps = i.ps || {};
        return [
          'Port Security              : ' + (ps.on ? 'Enabled' : 'Disabled'),
          'Port Status                : ' + (!ps.on ? 'Secure-down' : i.errdis ? 'Secure-shutdown' : linkUp(w, d.id, n) ? 'Secure-up' : 'Secure-down'),
          'Violation Mode             : ' + (ps.viol ? ps.viol[0].toUpperCase() + ps.viol.slice(1) : 'Shutdown'),
          'Aging Time                 : 0 mins',
          'Maximum MAC Addresses      : ' + (ps.max || 1),
          'Total MAC Addresses        : ' + (ps.macs || []).length,
          'Configured MAC Addresses   : 0',
          'Sticky MAC Addresses       : ' + (ps.sticky ? (ps.macs || []).length : 0),
          'Last Source Address:Vlan   : ' + (ps.last || (ps.macs || [])[0] || '0000.0000.0000') + ':' + (i.accessVlan || 1),
          'Security Violation Count   : ' + (ps.violations || 0),
          ...(ps.sticky && (ps.macs || []).length ? ['', 'Sticky MAC addresses: ' + ps.macs.join(', ')] : []),
        ];
      }
      const L = ['Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action', '                (Count)       (Count)          (Count)', '---------------------------------------------------------------------------'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const ps = d.interfaces[n].ps;
        if (!ps || !ps.on) continue;
        L.push(shortIf(n).padEnd(13) + String(ps.max || 1).padEnd(15) + String((ps.macs || []).length).padEnd(13) + String(ps.violations || 0).padEnd(19) + (ps.viol ? ps.viol[0].toUpperCase() + ps.viol.slice(1) : 'Shutdown'));
      }
      return L;
    };
    const showIntStatus = (d) => {
      const L = ['Port      Name               Status       Vlan       Duplex  Speed Type'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        if (/^Port-channel/.test(n)) continue;
        const i = d.interfaces[n];
        const st = i.errdis ? 'err-disabled' : i.shutdown ? 'disabled' : linkUp(w, d.id, n) ? 'connected' : 'notconnect';
        L.push(shortIf(n).padEnd(10) + (i.desc || '').slice(0, 18).padEnd(19) + st.padEnd(13) + (i.mode === 'trunk' ? 'trunk' : String(i.accessVlan)).padEnd(11) + (st === 'connected' ? 'a-full' : 'auto').padEnd(8) + (st === 'connected' ? (/^Gi/.test(n) ? 'a-1000' : 'a-100') : 'auto').padEnd(7) + (/^Gig/.test(n) ? '10/100/1000BaseTX' : '10/100BaseTX'));
      }
      return L;
    };
    const showSnoop = (d) => {
      const sn = d.snoop || {};
      const L = ['Switch DHCP snooping is ' + (sn.on ? 'enabled' : 'disabled'), 'DHCP snooping is configured on following VLANs:', (sn.vlans || []).length ? fmtVlans(sn.vlans) : 'none', 'Insertion of option 82 is ' + (sn.noOpt82 ? 'disabled' : 'enabled'), '', 'Interface                  Trusted    Allow option    Rate limit (pps)', '-----------------------    -------    ------------    ----------------'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const i = d.interfaces[n];
        if (!i.snoopTrust && !i.snoopRate) continue;
        L.push(n.padEnd(27) + (i.snoopTrust ? 'yes' : 'no').padEnd(11) + (i.snoopTrust ? 'yes' : 'no').padEnd(16) + (i.snoopRate || 'unlimited'));
      }
      return L;
    };
    const showBind = (d) => {
      const b = (d.snoop && d.snoop.bindings) || {};
      const L = ['MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface', '------------------  ---------------  ----------  -------------  ----  --------------------'];
      for (const x of Object.values(b)) L.push(x.mac.padEnd(20) + x.ip.padEnd(17) + '86400'.padEnd(12) + 'dhcp-snooping'.padEnd(15) + String(x.vlan).padEnd(6) + x.port);
      L.push('Total number of bindings: ' + Object.keys(b).length);
      return L;
    };
    const showDai = (d) => {
      const v = (d.dai && d.dai.vlans) || [];
      const L = ['', ' Vlan     Configuration    Operation   ACL Match          Static ACL', ' ----     -------------    ---------   ---------          ----------'];
      for (const x of v) L.push(' ' + String(x).padEnd(9) + 'Enabled'.padEnd(17) + 'Active');
      L.push('', 'Interface        Trust State     Rate (pps)', '---------------  -----------     ----------');
      for (const n of Object.keys(d.interfaces).sort(ifSort)) if (!/^Port-channel/.test(n)) L.push(shortIf(n).padEnd(17) + (d.interfaces[n].daiTrust ? 'Trusted' : 'Untrusted').padEnd(16) + (d.interfaces[n].daiTrust ? 'None' : '15'));
      return L;
    };
    const showSsh = (d) => {
      if (!d.rsa || d.rsa < 768) return ['SSH Disabled - version 1.99', '%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).', 'Authentication timeout: 120 secs; Authentication retries: 3'];
      return [`SSH Enabled - version ${d.sshver === 2 ? '2.0' : '1.99'}`, 'Authentication methods:publickey,keyboard-interactive,password', 'Authentication timeout: 120 secs; Authentication retries: 3', `Minimum expected Diffie Hellman key size : ${d.rsa >= 2048 ? 2048 : 1024} bits`];
    };

    const clockLine = (d) => {
      const st = ntpStatus(w, d.id);
      const tz = d.tz ? d.tz.name : 'UTC';
      return [st.synced ? `02:41:07.512 ${tz} Sun Nov 15 2026` : `*00:13:52.004 UTC Mon Mar 1 1993`, ...(st.synced ? [] : ['(The * means the clock is not authoritative: it has never been set or synchronized.)'])];
    };
    const showNtpStatus = (d) => {
      const st = ntpStatus(w, d.id);
      if (!d.ntp || (!(d.ntp.servers || []).length && d.ntp.master === undefined)) return ['%NTP is not enabled.'];
      return st.synced ? [`Clock is synchronized, stratum ${st.stratum}, reference is ${st.ref}`, 'nominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**24'] : ['Clock is unsynchronized, stratum 16, no reference clock', 'nominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**24'];
    };
    const showNtpAssoc = (d) => {
      const L = ['  address         ref clock       st   when   poll reach  delay  offset   disp'];
      const st = ntpStatus(w, d.id);
      for (const x of (d.ntp && d.ntp.servers) || []) L.push((st.synced && st.ref === x ? '*~' : ' ~') + x.padEnd(16) + (st.synced && st.ref === x ? '.GPS.' : '.INIT.').padEnd(16) + String(st.synced && st.ref === x ? st.stratum - 1 : 16).padEnd(5) + '  34     64   ' + (st.synced && st.ref === x ? '377' : '  0') + '  1.20   0.31   0.92');
      L.push(' * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured');
      return L;
    };
    const showCdp = (d) => {
      const nb = discNeighbors(w, d.id, 'cdp');
      if (!nb) return ['% CDP is not enabled'];
      const L = ['Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge', '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone', '', 'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID'];
      for (const x of nb) L.push(x.dev.hostname.slice(0, 16).padEnd(17) + shortIf(x.local).padEnd(18) + '163'.padEnd(11) + (x.dev.kind === 'router' ? 'R B' : x.dev.multilayer ? 'R S I' : 'S I').padEnd(12) + x.platform.padEnd(10) + shortIf(x.port));
      return L;
    };
    const showCdpDetail = (d) => {
      const nb = discNeighbors(w, d.id, 'cdp');
      if (!nb) return ['% CDP is not enabled'];
      const L = [];
      for (const x of nb) L.push('-------------------------', 'Device ID: ' + x.dev.hostname, 'Entry address(es):', '  IP address: ' + (x.ip || '(none)'), `Platform: Cisco ${x.platform},  Capabilities: ${x.dev.kind === 'router' ? 'Router' : 'Switch IGMP'}`, `Interface: ${x.local},  Port ID (outgoing port): ${x.port}`, 'Holdtime : 163 sec', '', 'Version :', 'Cisco IOS Software, Version 15.2', '');
      return L.length ? L : [''];
    };
    const showLldp = (d) => {
      const nb = discNeighbors(w, d.id, 'lldp');
      if (!nb) return ['% LLDP is not enabled'];
      const L = ['Capability codes:', '    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device', '    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other', '', 'Device ID           Local Intf     Hold-time  Capability      Port ID'];
      for (const x of nb) L.push(x.dev.hostname.slice(0, 19).padEnd(20) + shortIf(x.local).padEnd(15) + '120'.padEnd(11) + (x.dev.kind === 'router' ? 'R' : 'B').padEnd(16) + (x.dev.vendor === 'other' ? x.port.replace(/^GigabitEthernet/, '') : shortIf(x.port)));
      L.push('', 'Total entries displayed: ' + nb.length);
      return L;
    };

    const uptime = '2 weeks, 3 days, 4 hours, 12 minutes';
    const showVersion = (d) => {
      const rtr = d.kind === 'router';
      const ml = d.kind === 'switch' && (d.multilayer || d.ipRouting);
      const nIf = (re) => Object.keys(d.interfaces).filter((n) => re.test(n)).length;
      return rtr ? [
        'Cisco IOS XE Software, Version 17.09.04a',
        'Cisco IOS Software [Cupertino], ISR Software (X86_64_LINUX_IOSD-UNIVERSALK9-M), Version 17.9.4a, RELEASE SOFTWARE (fc3)',
        'Technical Support: http://www.cisco.com/techsupport', '',
        'ROM: IOS-XE ROMMON', `${d.hostname} uptime is ${uptime}`, 'System returned to ROM by PowerOn', 'System image file is "bootflash:isr4300-universalk9.17.09.04a.SPA.bin"', '',
        `cisco ISR4331/K9 (1RU) processor with 1795999K/6147K bytes of memory.`, 'Processor board ID FDO21520TGH',
        `${nIf(/^GigabitEthernet/)} Gigabit Ethernet interfaces`, '32768K bytes of non-volatile configuration memory.', '4194304K bytes of physical memory.', '3207167K bytes of flash memory at bootflash:.', '',
        'Configuration register is 0x2102',
      ] : [
        ml ? 'Cisco IOS XE Software, Version 17.09.04a' : 'Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.2(7)E8, RELEASE SOFTWARE (fc2)',
        'Technical Support: http://www.cisco.com/techsupport', '',
        `${d.hostname} uptime is ${uptime}`, 'System returned to ROM by power-on', ml ? 'System image file is "flash:packages.conf"' : 'System image file is "flash:c2960-lanbasek9-mz.152-7.E8.bin"', '',
        ml ? 'cisco C9300-48P (X86) processor with 1392780K/6147K bytes of memory.' : 'cisco WS-C2960-24TT-L (PowerPC405) processor (revision B0) with 65536K bytes of memory.',
        `${nIf(/^FastEthernet/)} FastEthernet interfaces`, `${nIf(/^GigabitEthernet/)} Gigabit Ethernet interfaces`, '64K bytes of flash-simulated non-volatile configuration memory.',
        `Base ethernet MAC Address       : ${(d.mac || ifMac(d, 'base')).toUpperCase().replace(/\./g, '').match(/../g).join(':')}`, '',
        'Configuration register is 0xF',
      ];
    };
    const showStartup = (d) => (d.flags.saved ? ['Using 1872 out of 65536 bytes', ...showRun(Object.assign({}, d, JSON.parse(d.flags.saved), { flags: d.flags, id: d.id, kind: d.kind })).slice(3)] : ['startup-config is not present']);
    const showLogging = (d) => {
      const lg = d.logging || {};
      const L = ['Syslog logging: enabled (0 messages dropped, 0 flushes, 0 overruns, xml disabled, filtering disabled)', '',
        `    Console logging: ${lg.console === 'off' ? 'disabled' : 'level ' + (lg.console || 'debugging')}, 43 messages logged, xml disabled,`,
        '    Monitor logging: level debugging, 0 messages logged, xml disabled,',
        `    Buffer logging:  ${lg.buffered ? 'level ' + lg.buffered + ', 43 messages logged' : 'disabled'}, xml disabled,`,
        `    Trap logging: level ${lg.trap || 'informational'}, 45 message lines logged`];
      for (const h of lg.hosts || []) L.push(`        Logging to ${h}  (udp port 514, audit disabled,`, '              link up),', '              45 message lines logged,');
      if (lg.buffered) {
        L.push('', `Log Buffer (8192 bytes):`);
        for (const n of Object.keys(d.interfaces).filter((n) => linkUp(w, d.id, n)).slice(0, 4)) L.push(`*Nov 15 02:${String(10 + n.length).padStart(2, '0')}:07.311: %LINK-3-UPDOWN: Interface ${n}, changed state to up`);
      }
      return L;
    };
    const showMac = (d) => {
      const t = macTable(w, d.id);
      const L = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
      for (const e of t) {
        const i = d.interfaces[e.port] || {};
        const po = i.channel ? 'Po' + i.channel.group : shortIf(e.port);
        L.push(String(e.vlan).padStart(4) + '    ' + e.mac.toLowerCase().padEnd(18) + (i.ps && i.ps.sticky && (i.ps.macs || []).includes(e.mac.toLowerCase()) ? 'STATIC' : 'DYNAMIC').padEnd(12) + po);
      }
      L.push(`Total Mac Addresses for this criterion: ${t.length}`);
      return L;
    };
    const showArp = (d) => {
      const L = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        if (!l3Up(w, d.id, n)) continue;
        L.push('Internet  ' + d.interfaces[n].ip.padEnd(17) + '-'.padEnd(11) + ifMac(d, n).padEnd(16) + 'ARPA   ' + n);
        for (const [oid, oif] of l2Domain(w, d.id, n)) {
          if (oid === d.id) continue;
          const ip = ipOf(w, oid, oif);
          if (ip === null) continue;
          L.push('Internet  ' + intToIp(ip).padEnd(17) + String(1 + (oid.length % 9)).padEnd(11) + ifMac(w.devices[oid], oif).padEnd(16) + 'ARPA   ' + n);
        }
      }
      return L;
    };
    const showIntf = (d, [name]) => {
      const n = canonIf(name);
      const i = d.interfaces[n];
      if (!i) throw new Error(`Interface ${name} does not exist.`);
      const up = linkUp(w, d.id, n);
      const st = i.shutdown ? 'administratively down' : i.errdis ? 'down' : up ? 'up' : 'down';
      const lp = /^(Vlan|Port-channel|Loopback)/.test(n) || isSub(n) ? null : linkParams(w, d.id, n);
      const hw = /^Vlan/.test(n) ? 'EtherSVI' : /^Port-channel/.test(n) ? 'EtherChannel' : /^Loopback/.test(n) ? 'Loopback' : /^Gigabit/.test(n) ? 'Gigabit Ethernet' : 'Fast Ethernet';
      const bw = /^Gigabit/.test(n) || /^Vlan/.test(n) ? 1000000 : /^FastEthernet/.test(n) ? 100000 : /^Port-channel/.test(n) ? 2000000 : 8000000;
      const errs = up && lp && lp.mismatch;
      const L = [`${n} is ${st}, line protocol is ${up && !i.shutdown ? 'up' : 'down'}${i.errdis ? ' (err-disabled)' : d.kind === 'switch' && !/^Vlan/.test(n) ? (up ? ' (connected)' : ' (notconnect)') : ''}`,
        `  Hardware is ${hw}, address is ${ifMac(d, n)} (bia ${ifMac(d, n)})`];
      if (i.desc) L.push('  Description: ' + i.desc);
      if (i.ip) L.push(`  Internet address is ${i.ip}/${maskToPrefix(i.mask)}`);
      L.push(`  MTU 1500 bytes, BW ${bw} Kbit/sec, DLY 10 usec,`, '     reliability 255/255, txload 1/255, rxload 1/255', '  Encapsulation ARPA, loopback not set', '  Keepalive set (10 sec)');
      if (lp) L.push(`  ${lp.duplex === 'full' ? 'Full' : 'Half'}-duplex, ${lp.speed}Mb/s, media type is 10/100${/^Gigabit/.test(n) ? '/1000' : ''}BaseTX`);
      L.push('  input flow-control is off, output flow-control is unsupported', '  ARP type: ARPA, ARP Timeout 04:00:00', '  Last input 00:00:01, output 00:00:00, output hang never', '  Queueing strategy: fifo',
        '  5 minute input rate 2000 bits/sec, 3 packets/sec', '  5 minute output rate 1000 bits/sec, 2 packets/sec');
      const pk = up ? 184213 + n.length * 911 : 0;
      L.push(`     ${pk} packets input, ${pk * 312} bytes, 0 no buffer`, `     Received ${up ? 4120 : 0} broadcasts (${up ? 3812 : 0} multicasts)`,
        `     ${errs === 'crc' ? 214 : 0} runts, 0 giants, 0 throttles`, `     ${errs === 'crc' ? 1893 : 0} input errors, ${errs === 'crc' ? 1679 : 0} CRC, 0 frame, 0 overrun, 0 ignored`,
        `     ${Math.round(pk * 0.8)} packets output, ${Math.round(pk * 251)} bytes, 0 underruns`, `     0 output errors, ${errs === 'late' ? 3317 : 0} collisions, 1 interface resets`,
        `     0 babbles, ${errs === 'late' ? 1102 : 0} late collision, ${errs === 'late' ? 812 : 0} deferred`, '     0 lost carrier, 0 no carrier', '     0 output buffer failures, 0 output buffers swapped out');
      return L;
    };
    const showSwitchport = (d, [name]) => {
      const n = canonIf(name);
      const i = d.interfaces[n];
      if (!i) throw new Error(`Interface ${name} does not exist.`);
      if (i.routed || /^Vlan/.test(n)) return [`Name: ${shortIf(n)}`, 'Switchport: Disabled'];
      const adm = adminMode(i);
      const op = !linkUp(w, d.id, n) ? 'down' : isTrunk(w, d.id, n) ? 'trunk' : 'static access';
      const admTxt = { access: 'static access', trunk: 'trunk', 'dynamic-auto': 'dynamic auto', 'dynamic-desirable': 'dynamic desirable' }[adm] || adm;
      return [`Name: ${shortIf(n)}`, 'Switchport: Enabled', `Administrative Mode: ${admTxt}`, `Operational Mode: ${op}`, 'Administrative Trunking Encapsulation: dot1q', `Operational Trunking Encapsulation: ${op === 'trunk' ? 'dot1q' : 'native'}`,
        `Negotiation of Trunking: ${i.nonegotiate || adm === 'access' ? 'Off' : 'On'}`, `Access Mode VLAN: ${i.accessVlan} (${(d.vlans[i.accessVlan] || 'Inactive')})`, `Trunking Native Mode VLAN: ${nativeOf(i)} (${d.vlans[nativeOf(i)] || 'Inactive'})`,
        'Administrative Native VLAN tagging: enabled', `Voice VLAN: ${i.voiceVlan ? i.voiceVlan + ' (' + (d.vlans[i.voiceVlan] || 'Inactive') + ')' : 'none'}`, 'Administrative private-vlan host-association: none',
        `Trunking VLANs Enabled: ${i.trunkAllowed === 'all' ? 'ALL' : fmtVlans(i.trunkAllowed)}`, 'Pruning VLANs Enabled: 2-1001', 'Protected: false', 'Unknown unicast blocked: disabled', 'Unknown multicast blocked: disabled', 'Appliance trust: none'];
    };
    const showProtocols = (d) => {
      const L = [];
      if (d.ospf) {
        L.push(`Routing Protocol is "ospf ${d.ospf.pid}"`, '  Outgoing update filter list for all interfaces is not set', '  Incoming update filter list for all interfaces is not set', `  Router ID ${routerId(d)}`, '  Number of areas in this router is 1. 1 normal 0 stub 0 nssa', '  Maximum path: 4', '  Routing for Networks:');
        for (const x of d.ospf.networks || []) L.push(`    ${x.net} ${x.wild} area ${x.area}`);
        const pas = d.ospf.passiveDefault ? Object.keys(d.interfaces).filter((n) => !(d.ospf.nonPassive || []).includes(n)) : d.ospf.passive || [];
        if (pas.length) { L.push('  Passive Interface(s):'); for (const x of pas) L.push('    ' + x); }
        if (d.ospf.refBw) L.push(`  Reference bandwidth unit is ${d.ospf.refBw} mbps`);
        L.push('  Routing Information Sources:', '    Gateway         Distance      Last Update', '  Distance: (default is 110)', '');
      }
      if (d.eigrp) {
        L.push(`Routing Protocol is "eigrp ${d.eigrp.as}"`, '  EIGRP-IPv4 Protocol for AS(' + d.eigrp.as + ')', '    Metric weight K1=1, K2=0, K3=1, K4=0, K5=0', '  Routing for Networks:');
        for (const x of d.eigrp.networks || []) L.push(`    ${x.net}${x.wild ? ' ' + x.wild : ''}`);
        if ((d.eigrp.passive || []).length) { L.push('  Passive Interface(s):'); for (const x of d.eigrp.passive) L.push('    ' + x); }
        L.push('  Distance: internal 90 external 170', '');
      }
      return L.length ? L : ['*** IP Routing is NSF aware ***', '', '(No dynamic routing protocol is running.)'];
    };
    const showDhcpBind = (d) => {
      const L = ['Bindings from all pools not associated with VRF:', 'IP address      Client-ID/              Lease expiration        Type       State      Interface', '                Hardware address/', '                User name'];
      for (const [cid, ip] of Object.entries(d.dhcpLeases || {})) L.push(ip.padEnd(16) + ('01' + pcMac(w.devices[cid] || { id: cid, pc: {} }).replace(/\./g, '')).padEnd(24) + 'Nov 16 2026 02:41 AM'.padEnd(24) + 'Automatic  Active     ' + ((Object.entries(d.interfaces).find(([, x]) => x.ip && netOf(ipToInt(x.ip), maskToPrefix(x.mask)) === netOf(ipToInt(ip), maskToPrefix(x.mask))) || ['?'])[0]));
      return L;
    };
    const showDhcpPool = (d) => {
      const L = [];
      for (const pl of routerPools(w, d)) {
        const leased = Object.values(d.dhcpLeases || {}).filter((ip) => netOf(ipToInt(ip), maskToPrefix(pl.mask)) === ipToInt(pl.network)).length;
        L.push('', `Pool ${pl.name} :`, ' Utilization mark (high/low)    : 100 / 0', ` Subnet size (first/next)       : 0 / 0`, ` Total addresses                : ${pl.last - pl.first + 1}`, ` Leased addresses               : ${leased}`, ' Pending event                  : none', ` 1 subnet is currently in the pool :`, ` Current index        IP address range                    Leased addresses`, ` ${intToIp(pl.first).padEnd(21)}${(intToIp(pl.first) + ' - ' + intToIp(pl.last)).padEnd(36)}${leased}`);
      }
      return L.length ? L : ['% No DHCP pools configured'];
    };
    const showNatStats = (d) => {
      const ins = Object.keys(d.interfaces).filter((n) => d.interfaces[n].nat === 'inside');
      const outs = Object.keys(d.interfaces).filter((n) => d.interfaces[n].nat === 'outside');
      const dyn = Object.keys(d.natMap || {}).length + (d.natTable || []).length;
      const stat = (d.natStatic || []).length;
      const L = [`Total active translations: ${dyn + stat} (${stat} static, ${dyn} dynamic; ${(d.natTable || []).length} extended)`, 'Peak translations: ' + (dyn + stat), `Outside interfaces:`, '  ' + (outs.join(', ') || 'none'), 'Inside interfaces:', '  ' + (ins.join(', ') || 'none'), `Hits: ${dyn * 37}  Misses: ${dyn}`, 'Expired translations: 0', 'Dynamic mappings:'];
      if (d.nat && d.nat.list !== undefined) {
        L.push('-- Inside Source', `[Id: 1] access-list ${d.nat.list} ${d.nat.pool ? 'pool ' + d.nat.pool : 'interface ' + d.nat.outIf}${d.nat.overload ? ' overload' : ''} refcount ${dyn}`);
        const pl = d.nat.pool && (d.natPools || {})[d.nat.pool];
        if (pl) { const tot = ipToInt(pl.end) - ipToInt(pl.start) + 1; const al = new Set(Object.values(d.natMap || {})).size; L.push(` pool ${d.nat.pool}: netmask ${pl.mask}`, `	start ${pl.start} end ${pl.end}`, `	type generic, total addresses ${tot}, allocated ${al} (${Math.round((al / tot) * 100)}%), misses 0`); }
      }
      return L;
    };
    const showV6Nei = (d) => {
      const L = ['IPv6 Address                              Age Link-layer Addr State Interface'];
      for (const n of Object.keys(d.interfaces)) {
        if (!(d.interfaces[n].ipv6 || []).length || !linkUp(w, d.id, n)) continue;
        for (const [oid, oif] of l2Domain(w, d.id, n)) {
          if (oid === d.id) continue;
          const o = w.devices[oid];
          const a = o.kind === 'pc' ? o.pc.ip6 : ((o.interfaces[oif] || {}).ipv6 || [])[0] && o.interfaces[oif].ipv6[0].addr;
          if (a) L.push(String(a).padEnd(42) + '0'.padEnd(4) + ifMac(o, oif).padEnd(15) + 'REACH ' + n);
        }
      }
      return L;
    };

    const pingCmd = (d, [target]) => {
      if (v6parse(target) !== null) {
        const r6 = ping6(w, d.id, target);
        w.events.push({ type: 'ping6', from: d.id, to: target, ok: r6.ok });
        return ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${v6fmt(v6parse(target))}, timeout is 2 seconds:`, r6.ok ? '!!!!!' : '.....', r6.ok ? 'Success rate is 100 percent (5/5), round-trip min/avg/max = 0/1/3 ms' : 'Success rate is 0 percent (0/5)'];
      }
      const r = ping(w, d.id, target, { record: true });
      const key = d.id + '>' + target;
      const first = !S.pinged.has(key);
      S.pinged.add(key);
      const L = ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`];
      if (r.ok) {
        const pattern = first && !r.local ? '.!!!!' : '!!!!!';
        L.push(pattern, `Success rate is ${first && !r.local ? 80 : 100} percent (${first && !r.local ? 4 : 5}/5), round-trip min/avg/max = 1/1/2 ms`);
        w.events.push({ type: 'ping', from: d.id, to: target, ok: true });
      } else {
        L.push(r.reason === 'acl' ? 'U.U.U' : '.....', 'Success rate is 0 percent (0/5)');
        w.events.push({ type: 'ping', from: d.id, to: target, ok: false });
      }
      return L;
    };

    const SHOW = [
      ['show ip interface brief', showIpIntBrief, 'Brief summary of IP status and configuration'],
      ['show running-config', showRun, 'Current operating configuration'],
      ['show ip route', showIpRoute, 'IP routing table'],
      ['show ip ospf neighbor', showOspfNei, 'OSPF neighbor list'],
      ['show ip ospf interface brief', showOspfIntBrief, 'OSPF interface summary'],
      ['show vlan brief', showVlanBrief, 'VTP all VLAN status in brief'],
      ['show interfaces trunk', showIntTrunk, 'Show trunk information'],
      ['show spanning-tree', (d) => showStp(d, []), 'Spanning tree topology'],
      ['show spanning-tree vlan <vlan>', showStp, 'VLAN Switch Spanning Trees'],
      ['show etherchannel summary', showEc, 'One-line summary per channel-group'],
      ['show access-lists', showAcl, 'List access lists'],
      ['show ip nat translations', showNat, 'Translation entries'],
      ['show ip ospf interface <if>', showOspfIf, 'OSPF interface information'],
      ['show ntp status', showNtpStatus, 'NTP status'],
      ['show ntp associations', showNtpAssoc, 'NTP associations'],
      ['show clock', clockLine, 'Display the system clock'],
      ['show cdp neighbors', showCdp, 'CDP neighbor entries'],
      ['show cdp neighbors detail', showCdpDetail, 'Show detailed information'],
      ['show lldp neighbors', showLldp, 'LLDP neighbor entries'],
      ['show version', showVersion, 'System hardware and software status'],
      ['show startup-config', showStartup, 'Contents of startup configuration'],
      ['show logging', showLogging, 'Show the contents of logging buffers'],
      ['show mac address-table', showMac, 'MAC forwarding table'],
      ['show mac-address-table', showMac, 'MAC forwarding table'],
      ['show ip arp', showArp, 'IP ARP table'],
      ['show arp', showArp, 'ARP table'],
      ['show interfaces <if>', showIntf, 'Interface status and configuration'],
      ['show interfaces <if> switchport', showSwitchport, 'Show interface switchport information'],
      ['show ip protocols', showProtocols, 'IP routing protocol process parameters and statistics'],
      ['show ip dhcp binding', showDhcpBind, 'DHCP address bindings'],
      ['show ip dhcp pool', showDhcpPool, 'DHCP pools information'],
      ['show ip nat statistics', showNatStats, 'Translation statistics'],
      ['show ipv6 neighbors', showV6Nei, 'Show IPv6 neighbor cache entries'],
      ['show ip access-lists', (d) => showAcl(d), 'List IP access lists'],
      ['show ipv6 interface brief', showV6Brief, 'Brief summary of IPv6 status'],
      ['show ipv6 route', showV6Route, 'Show IPv6 route table entries'],
      ['show standby brief', showStandby, 'Brief output of HSRP groups'],
      ['show ip eigrp neighbors', showEigrpNei, 'EIGRP neighbors'],
      ['show ip ssh', showSsh, 'Information on SSH'],
      ['show port-security', (d) => showPs(d, []), 'Show secure port information'],
      ['show port-security interface <if>', showPs, 'Show secure port information'],
      ['show interfaces status', showIntStatus, 'Show interface line status'],
      ['show ip dhcp snooping', showSnoop, 'DHCP snooping'],
      ['show ip dhcp snooping binding', showBind, 'DHCP snooping binding table'],
      ['show ip arp inspection', showDai, 'Show ARP Inspection'],
    ];

    const showFor = (kind) =>
      SHOW.filter(([p]) => {
        if (kind === 'switch') return !/ospf|nat|ipv6|standby|eigrp|ip ssh|dhcp binding|dhcp pool|ip protocols/.test(p);
        if (kind === 'router') return !/vlan brief|interfaces trunk|spanning|etherchannel|port-security|interfaces status|snooping|arp inspection|mac.address-table|switchport/.test(p);
        return true;
      });

    const execCommon = (kind) => [
      ...showFor(kind),
      ['ping <ipany>', pingCmd, 'Send echo messages'],
    ];

    const saveCfg = (d) => {
      d.flags.saved = JSON.stringify(cfgSnapshot(d));
      ev({ type: 'save', dev: d.id });
      return ['Building configuration...', '[OK]'];
    };

    const userTree = (kind) =>
      build([
        ['enable', (d) => { d.mode = 'priv'; d.flags.priv = true; ev({ type: 'enable', dev: d.id }); return []; }, 'Turn on privileged commands'],
        ['exit', () => ['(Session stays open in the game. Pick another device with the tabs.)'], 'Exit from the EXEC'],
        ...execCommon(kind).filter(([p]) => !/running-config/.test(p)),
      ]);

    const privTree = (kind) =>
      build([
        ['configure terminal', (d) => { d.mode = 'config'; d.flags.config = true; ev({ type: 'config', dev: d.id }); return ['Enter configuration commands, one per line.  End with CNTL/Z.']; }, 'Enter configuration mode'],
        ['disable', (d) => { d.mode = 'user'; return []; }, 'Turn off privileged commands'],
        ['exit', (d) => { d.mode = 'user'; return []; }, 'Exit from the EXEC'],
        ['copy running-config startup-config', (d) => ['Destination filename [startup-config]? ', ...saveCfg(d)], 'Copy from one file to another'],
        ['write memory', saveCfg, 'Write running configuration to memory'],
        ['write', saveCfg, 'Write running configuration to memory'],
        ['clear ip ospf process', (d) => {
          if (!d.ospf) return ['% OSPF: No router process is configured'];
          for (const [k, x] of Object.entries(w.ospfDr || {})) if (x.dr === d.id || x.bdr === d.id || Object.values(d.interfaces).some((i) => i.ip && (() => { const [net, p] = k.split('/'); return netOf(ipToInt(i.ip), Number(p)) === ipToInt(net); })())) delete w.ospfDr[k];
          ev({ type: 'ospfclear', dev: d.id });
          const { adj } = computeOspf(w);
          return ['Reset ALL OSPF processes? [no]: yes', ...adj.filter((a) => a.a === d.id).map((a) => `%OSPF-5-ADJCHG: Process ${d.ospf.pid}, Nbr ${routerId(w.devices[a.b])} on ${a.aIf} from LOADING to FULL, Loading Done`)];
        }, 'Clear OSPF process (forces a new DR/BDR election)'],
        ['erase startup-config', (d) => { d.flags.saved = null; return ['Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]', '[OK]', 'Erase of nvram: complete']; }, 'Erase contents of configuration memory'],
        ['write erase', (d) => { d.flags.saved = null; return ['Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]', '[OK]', 'Erase of nvram: complete']; }, 'Erase NV memory'],
        ['terminal monitor', () => [], 'Copy debug output to the current terminal line'],
        ['clear mac address-table dynamic', () => [], 'Clear dynamic MAC addresses'],
        ['clear ip nat translation *', (d) => { d.natTable = []; d.natMap = {}; ev({ type: 'nat', dev: d.id }); return []; }, 'Clear dynamic NAT translations'],
        ...execCommon(kind),
      ]);

    const toPriv = (d) => { d.mode = 'priv'; d.ctx = null; return []; };
    const doCmd = (d, [rest]) => {
      const saved = d.mode;
      const ctx = d.ctx;
      d.mode = 'priv';
      const r = S.run(d.id, rest);
      if (d.mode === 'priv') { d.mode = saved; d.ctx = ctx; }
      return r;
    };
    const sub = [
      ['exit', (d) => { d.mode = 'config'; d.ctx = null; return []; }, 'Exit from configure mode'],
      ['end', toPriv, 'Exit to privileged EXEC mode'],
      ['do <rest>', doCmd, 'To run exec commands in config mode'],
    ];

    const enterIf = (d, [name]) => {
      const n = canonIf(name);
      if (!d.interfaces[n]) {
        if (d.kind === 'router' && /^Loopback/.test(n)) {
          d.interfaces[n] = { shutdown: false };
          return [`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to up`];
        }
        if (d.kind === 'router' && isSub(n) && d.interfaces[parentIf(n)]) {
          d.interfaces[n] = { shutdown: false };
          d.mode = 'if';
          d.ctx = n;
          return [];
        }
        if (d.kind === 'switch' && /^Vlan\d+$/.test(n)) {
          const v = Number(n.slice(4));
          if (v < 1 || v > 4094) throw new Error('Invalid VLAN ID.');
          d.interfaces[n] = { shutdown: true };
          d.mode = 'if';
          d.ctx = n;
          ev({ type: 'svi', dev: d.id });
          return [];
        }
        if (d.kind === 'switch' && /^Port-channel\d+$/.test(n)) {
          d.interfaces[n] = { mode: 'access', accessVlan: 1, trunkAllowed: 'all', shutdown: false };
          d.mode = 'if';
          d.ctx = n;
          return [];
        }
        throw new Error(`Interface ${name} does not exist on ${d.hostname}. Try "do show ip interface brief".`);
      }
      d.mode = 'if';
      d.ctx = n;
      return [];
    };

    const enterRange = (d, [text]) => {
      const list = [];
      for (const part of text.replace(/\s+/g, '').split(',')) {
        const m = /^([a-z-]+)(\d+\/(?:\d+\/)?)(\d+)(?:-(\d+))?$/i.exec(part);
        if (!m) throw new Error('Invalid range: ' + part + '. Example: interface range g0/1 - 2');
        const a = Number(m[3]);
        const b = m[4] ? Number(m[4]) : a;
        for (let k = Math.min(a, b); k <= Math.max(a, b); k++) {
          const n = canonIf(m[1] + m[2] + k);
          if (!n || !d.interfaces[n]) throw new Error(`Interface ${m[1]}${m[2]}${k} does not exist on ${d.hostname}.`);
          list.push(n);
        }
      }
      d.mode = 'if';
      d.ctx = list;
      return [];
    };
    const configCommon = (kind) => [
      ['hostname <word>', (d, [h]) => { d.hostname = h; ev({ type: 'hostname', dev: d.id }); return []; }, 'Set system\'s network name'],
      ['interface <if>', enterIf, 'Select an interface to configure'],
      ['exit', toPriv, 'Exit from configure mode'],
      ['end', toPriv, 'Exit from configure mode'],
      ['do <rest>', doCmd, 'To run exec commands in config mode'],
    ];

    const lineOf = (d) => (d.ctx === 'con' ? (d.con = d.con || {}) : (d.vty = d.vty || { transport: ['telnet'], login: null }));
    const mgmt = [
      ['username <word> secret <word>', (d, [u, pw]) => { d.users = d.users || {}; d.users[u] = { secret: pw }; ev({ type: 'user', dev: d.id }); return []; }, 'Establish User Name Authentication'],
      ['username <word> password <word>', (d, [u, pw]) => { d.users = d.users || {}; d.users[u] = { password: pw }; ev({ type: 'user', dev: d.id }); return []; }, 'Establish User Name Authentication'],
      ['enable secret <word>', (d, [pw]) => { d.enableSecret = pw; ev({ type: 'pw', dev: d.id }); return []; }, 'Assign the privileged level secret'],
      ['enable password <word>', (d, [pw]) => { d.enablePassword = pw; return []; }, 'Assign the privileged level password'],
      ['service password-encryption', (d) => { d.pwEnc = true; ev({ type: 'pw', dev: d.id }); return []; }, 'Encrypt system passwords'],
      ['no service password-encryption', (d) => { d.pwEnc = false; return []; }, 'Negate a command'],
      ['line vty <num> <num>', (d) => { d.vty = d.vty || { transport: ['telnet'], login: null }; d.mode = 'line'; d.ctx = 'vty'; return []; }, 'Configure a terminal line'],
      ['line console <num>', (d) => { d.con = d.con || {}; d.mode = 'line'; d.ctx = 'con'; return []; }, 'Primary terminal line'],
      ['ntp server <ip>', (d, [ip]) => { d.ntp = d.ntp || {}; d.ntp.servers = [...new Set([...(d.ntp.servers || []), ip])]; ev({ type: 'ntp', dev: d.id }); return []; }, 'Configure NTP server'],
      ['no ntp server <ip>', (d, [ip]) => { if (d.ntp) d.ntp.servers = (d.ntp.servers || []).filter((x) => x !== ip); return []; }, 'Negate a command'],
      ['ntp master', (d) => { d.ntp = d.ntp || {}; d.ntp.master = 8; ev({ type: 'ntp', dev: d.id }); return []; }, 'Act as NTP master clock'],
      ['ntp master <num>', (d, [n]) => { d.ntp = d.ntp || {}; d.ntp.master = Number(n); ev({ type: 'ntp', dev: d.id }); return []; }, 'Act as NTP master clock'],
      ['no ntp master', (d) => { if (d.ntp) delete d.ntp.master; return []; }, 'Negate a command'],
      ['clock timezone <word> <rest>', (d, [z, off]) => { d.tz = { name: z, off: Number(off.split(/\s+/)[0]) }; return []; }, 'Configure time zone'],
      ['cdp run', (d) => { d.cdp = true; ev({ type: 'cdp', dev: d.id }); return []; }, 'Enable CDP'],
      ['no cdp run', (d) => { d.cdp = false; ev({ type: 'cdp', dev: d.id }); return []; }, 'Negate a command'],
      ['lldp run', (d) => { d.lldp = true; ev({ type: 'lldp', dev: d.id }); return []; }, 'Enable LLDP'],
      ['no lldp run', (d) => { d.lldp = false; return []; }, 'Negate a command'],
      ['ip domain-name <word>', (d, [n]) => { d.domain = n; return []; }, 'Define the default domain name'],
      ['ip domain name <word>', (d, [n]) => { d.domain = n; return []; }, 'Define the default domain name'],
      ['no ip domain-lookup', (d) => { d.noLookup = true; return []; }, 'Stop typos being treated as hostnames to resolve'],
      ['no ip domain lookup', (d) => { d.noLookup = true; return []; }, 'Stop typos being treated as hostnames to resolve'],
      ['ip domain-lookup', (d) => { d.noLookup = false; return []; }, 'Enable IP Domain Name System hostname translation'],
      ['banner motd <rest>', (d, [t]) => { const m = /^(\S)(.*)\1$/.exec(t.trim()); d.motd = m ? m[2] : t.trim(); ev({ type: 'banner', dev: d.id }); return []; }, 'Set Message of the Day banner'],
      ['security passwords min-length <num>', (d, [n]) => { d.pwMin = Number(n); ev({ type: 'pw', dev: d.id }); return []; }, 'Minimum length of passwords'],
      ['login block-for <num> attempts <num> within <num>', (d, [a, b, c]) => { d.loginBlock = [Number(a), Number(b), Number(c)]; ev({ type: 'pw', dev: d.id }); return []; }, 'Block logins after repeated failures'],
      ['logging host <ip>', (d, [ip]) => { d.logging = d.logging || {}; d.logging.hosts = [...new Set([...(d.logging.hosts || []), ip])]; ev({ type: 'log', dev: d.id }); return []; }, 'Set syslog server IP address'],
      ['logging <ip>', (d, [ip]) => { d.logging = d.logging || {}; d.logging.hosts = [...new Set([...(d.logging.hosts || []), ip])]; ev({ type: 'log', dev: d.id }); return []; }, 'Set syslog server IP address'],
      ['logging trap <word>', (d, [l]) => { d.logging = d.logging || {}; d.logging.trap = sevName(l); ev({ type: 'log', dev: d.id }); return []; }, 'Set syslog server logging level'],
      ['logging console <word>', (d, [l]) => { d.logging = d.logging || {}; d.logging.console = sevName(l); return []; }, 'Set console logging level'],
      ['logging buffered', (d) => { d.logging = d.logging || {}; d.logging.buffered = 'debugging'; return []; }, 'Set buffered logging parameters'],
      ['logging buffered <word>', (d, [l]) => { d.logging = d.logging || {}; d.logging.buffered = /^\d{3,}$/.test(l) ? 'debugging' : sevName(l); return []; }, 'Set buffered logging parameters'],
      ['no logging console', (d) => { d.logging = d.logging || {}; d.logging.console = 'off'; return []; }, 'Negate a command'],
      ['service timestamps <rest>', (d, [t]) => { d.timestamps = t; return []; }, 'Timestamp debug/log messages'],
      ['snmp-server community <word> <word>', (d, [c, rw]) => { d.snmp = d.snmp || {}; d.snmp.communities = Object.assign(d.snmp.communities || {}, { [c]: rw.toUpperCase() }); ev({ type: 'snmp', dev: d.id }); return []; }, 'Enable SNMP; set community string and access privs'],
      ['snmp-server host <ip> <rest>', (d, [ip, r]) => { d.snmp = d.snmp || {}; d.snmp.hosts = Object.assign(d.snmp.hosts || {}, { [ip]: r }); return []; }, 'Specify hosts to receive SNMP notifications'],
      ['snmp-server location <rest>', (d, [t]) => { d.snmp = d.snmp || {}; d.snmp.location = t; return []; }, 'Text for mib object sysLocation'],
      ['snmp-server contact <rest>', (d, [t]) => { d.snmp = d.snmp || {}; d.snmp.contact = t; return []; }, 'Text for mib object sysContact'],
      ['ip http server', (d) => { d.http = true; return []; }, 'Enable HTTP server'],
      ['no ip http server', (d) => { d.http = false; return []; }, 'Negate a command'],
      ['ip http secure-server', (d) => { d.https = true; return []; }, 'Enable HTTP secure server'],
      ['no ip http secure-server', (d) => { d.https = false; return []; }, 'Negate a command'],
      ['ip access-list standard <word>', (d, [n]) => { d.acls = d.acls || {}; d.acls[n] = d.acls[n] || []; d.mode = 'acl'; d.ctx = n; d.aclStd = true; return []; }, 'Named standard access list'],
      ['ip access-list extended <word>', (d, [n]) => { d.acls = d.acls || {}; d.acls[n] = d.acls[n] || []; d.mode = 'acl'; d.ctx = n; d.aclStd = false; return []; }, 'Named extended access list'],
      ['no ip access-list standard <word>', (d, [n]) => { if (d.acls) delete d.acls[n]; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['no ip access-list extended <word>', (d, [n]) => { if (d.acls) delete d.acls[n]; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
    ];
    const SEV = ['emergencies', 'alerts', 'critical', 'errors', 'warnings', 'notifications', 'informational', 'debugging'];
    const sevName = (l) => {
      if (/^\d$/.test(l)) { const n = Number(l); if (n > 7) throw new Error('Severity is 0-7.'); return SEV[n]; }
      const m = SEV.find((x) => x.startsWith(l.toLowerCase()));
      if (!m) throw new Error('Use a level 0-7 or a name: ' + SEV.join(', ') + '.');
      return m;
    };
    const ipRouteSpecs = [
      ['ip route <ip> <mask> <nhop>', (d, [net, mask, nh]) => {
        d.routes = d.routes || [];
        const r = { net, mask };
        if (ipToInt(nh) !== null) r.nh = nh; else r.exitIf = canonIf(nh);
        if (netOf(ipToInt(net), maskToPrefix(mask)) !== ipToInt(net)) throw new Error('Inconsistent address and mask');
        if (!d.routes.some((x) => x.net === net && x.mask === mask && (x.nh || x.exitIf) === (r.nh || r.exitIf))) d.routes.push(r);
        ev({ type: 'route', dev: d.id });
        return d.kind === 'switch' && !d.ipRouting ? ['% Saved, but this switch is not routing yet. Enable it with "ip routing".'] : [];
      }, 'Establish static routes'],
      ['ip route <ip> <mask> <nhop> <num>', (d, [net, mask, nh, ad]) => {
        d.routes = d.routes || [];
        const r = { net, mask, ad: Number(ad) };
        if (ipToInt(nh) !== null) r.nh = nh; else r.exitIf = canonIf(nh);
        if (netOf(ipToInt(net), maskToPrefix(mask)) !== ipToInt(net)) throw new Error('Inconsistent address and mask');
        d.routes = d.routes.filter((x) => !(x.net === net && x.mask === mask && (x.nh || x.exitIf) === (r.nh || r.exitIf)));
        d.routes.push(r);
        ev({ type: 'route', dev: d.id });
        return [];
      }, 'Establish a static route with an administrative distance (floating static)'],
      ['no ip route <ip> <mask> <nhop>', (d, [net, mask, nh]) => {
        d.routes = d.routes || [];
        const before = d.routes.length;
        const nhC = ipToInt(nh) !== null ? nh : canonIf(nh);
        d.routes = d.routes.filter((x) => !(x.net === net && x.mask === mask && (x.nh || x.exitIf) === nhC));
        if (d.routes.length === before) return ['%No matching route to delete'];
        ev({ type: 'route', dev: d.id });
        return [];
      }, 'Negate a command'],
    ];
    const routerConfig = build([
      ...configCommon('router'),
      ...mgmt,
      ...ipRouteSpecs,
      ['ip nat inside source static <ip> <ip>', (d, [l, g]) => {
        d.natStatic = (d.natStatic || []).filter((m) => m.local !== l && m.global !== g);
        d.natStatic.push({ local: l, global: g });
        ev({ type: 'nat', dev: d.id });
        return [];
      }, 'Static local to global address translation'],
      ['no ip nat inside source static <ip> <ip>', (d, [l, g]) => { d.natStatic = (d.natStatic || []).filter((m) => !(m.local === l && m.global === g)); ev({ type: 'nat', dev: d.id }); return []; }, 'Negate a command'],
      ['ip nat pool <word> <ip> <ip> netmask <mask>', (d, [n, a, b, m]) => {
        if (ipToInt(a) > ipToInt(b)) throw new Error('The start address must not be higher than the end address.');
        d.natPools = d.natPools || {};
        d.natPools[n] = { start: a, end: b, mask: m };
        ev({ type: 'nat', dev: d.id });
        return [];
      }, 'Define pool of addresses'],
      ['no ip nat pool <word>', (d, [n]) => { if (d.natPools) delete d.natPools[n]; return []; }, 'Negate a command'],
      ['ip nat inside source list <num> pool <word>', (d, [num, n]) => { d.nat = { list: Number(num), pool: n, overload: false }; ev({ type: 'nat', dev: d.id }); return (d.natPools || {})[n] ? [] : [`%Pool ${n} not found. Create it with "ip nat pool".`]; }, 'Translate inside sources from a pool'],
      ['ip nat inside source list <num> pool <word> overload', (d, [num, n]) => { d.nat = { list: Number(num), pool: n, overload: true }; ev({ type: 'nat', dev: d.id }); return []; }, 'Translate inside sources from a pool with PAT'],
      ['no ip nat inside source list <num> pool <word>', (d) => { delete d.nat; ev({ type: 'nat', dev: d.id }); return []; }, 'Negate a command'],
      ['no ip nat inside source list <num> pool <word> overload', (d) => { delete d.nat; ev({ type: 'nat', dev: d.id }); return []; }, 'Negate a command'],
      ['access-list <num> <rest>', (d, [num, rest]) => {
        const n = Number(num);
        if (!isStdAcl(n) && !isExtAcl(n)) throw new Error('Use 1-99 or 1300-1999 for standard ACLs, 100-199 or 2000-2699 for extended.');
        const e = parseAce(n, rest);
        d.acls = d.acls || {};
        (d.acls[n] = d.acls[n] || []).push(e);
        ev({ type: 'acl', dev: d.id });
        return [];
      }, 'Add an access list entry'],
      ['no access-list <num>', (d, [num]) => { if (d.acls) delete d.acls[Number(num)]; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['ip nat inside source list <num> interface <if> overload', (d, [num, ifn]) => {
        const n = canonIf(ifn);
        if (!d.interfaces[n]) throw new Error(`Interface ${ifn} does not exist.`);
        d.nat = { list: Number(num), outIf: n };
        ev({ type: 'nat', dev: d.id });
        return [];
      }, 'Translate inside source addresses'],
      ['no ip nat inside source list <num> interface <if> overload', (d) => { delete d.nat; ev({ type: 'nat', dev: d.id }); return []; }, 'Negate a command'],
      ['ipv6 unicast-routing', (d) => { d.v6routing = true; ev({ type: 'v6', dev: d.id }); return []; }, 'Enable unicast routing'],
      ['no ipv6 unicast-routing', (d) => { d.v6routing = false; return []; }, 'Negate a command'],
      ['ipv6 route <v6p> <v6>', (d, [pf, nh]) => {
        d.routes6 = d.routes6 || [];
        const x = v6pfx(pf);
        const norm = v6fmt(v6net(x.addr, x.p)) + '/' + x.p;
        if (!d.routes6.some((r) => r.pfx === norm && r.nh === nh)) d.routes6.push({ pfx: norm, nh });
        ev({ type: 'v6', dev: d.id });
        return [];
      }, 'Configure static routes'],
      ['no ipv6 route <v6p> <v6>', (d, [pf, nh]) => {
        const x = v6pfx(pf);
        const norm = v6fmt(v6net(x.addr, x.p)) + '/' + x.p;
        d.routes6 = (d.routes6 || []).filter((r) => !(r.pfx === norm && v6parse(r.nh) === v6parse(nh)));
        return [];
      }, 'Negate a command'],
      ['router eigrp <num>', (d, [as]) => {
        if (d.eigrp && String(d.eigrp.as) !== as) throw new Error(`EIGRP AS ${d.eigrp.as} is already configured. Remove it with "no router eigrp ${d.eigrp.as}" first.`);
        if (!d.eigrp) d.eigrp = { as: Number(as), networks: [], passive: [] };
        d.mode = 'eigrp';
        return [];
      }, 'Enhanced Interior Gateway Routing Protocol (EIGRP)'],
      ['no router eigrp <num>', (d, [as]) => { if (d.eigrp && String(d.eigrp.as) === as) delete d.eigrp; ev({ type: 'eigrp', dev: d.id }); return []; }, 'Negate a command'],
      ['crypto key generate rsa', (d) => genRsa(d, 1024), 'Generate RSA keys'],
      ['crypto key generate rsa general-keys modulus <num>', (d, [m]) => genRsa(d, Number(m)), 'Generate RSA keys'],
      ['ip dhcp excluded-address <ip>', (d, [a]) => { d.dhcpExcluded = (d.dhcpExcluded || []).concat([[a, a]]); return []; }, 'Prevent DHCP from assigning an address'],
      ['ip dhcp excluded-address <ip> <ip>', (d, [a, b]) => { if (ipToInt(a) > ipToInt(b)) throw new Error('The low address must come first.'); d.dhcpExcluded = (d.dhcpExcluded || []).concat([[a, b]]); return []; }, 'Prevent DHCP from assigning a range'],
      ['ip dhcp pool <word>', (d, [n]) => { d.dhcpPools = d.dhcpPools || {}; d.dhcpPools[n] = d.dhcpPools[n] || {}; d.mode = 'dhcp'; d.ctx = n; return []; }, 'Configure a DHCP address pool'],
      ['no ip dhcp pool <word>', (d, [n]) => { if (d.dhcpPools) delete d.dhcpPools[n]; return []; }, 'Negate a command'],
      ['crypto key generate rsa modulus <num>', (d, [m]) => genRsa(d, Number(m)), 'Generate RSA keys'],
      ['ip ssh version <num>', (d, [v]) => {
        if (v !== '1' && v !== '2') throw new Error('SSH version must be 1 or 2.');
        if (v === '2' && (!d.rsa || d.rsa < 768)) return ['Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).'];
        d.sshver = Number(v);
        ev({ type: 'ssh', dev: d.id });
        return [];
      }, 'Specify protocol version supported'],
      ['router ospf <num>', (d, [pid]) => {
        if (d.ospf && String(d.ospf.pid) !== pid) throw new Error(`This router already runs OSPF process ${d.ospf.pid}. Use "router ospf ${d.ospf.pid}".`);
        if (!d.ospf) d.ospf = { pid: Number(pid), networks: [], passive: [] };
        d.mode = 'router';
        return [];
      }, 'Open Shortest Path First (OSPF)'],
    ]);

    const setPrio = (d, list, pr) => {
      d.stp = d.stp || { prio: {} };
      d.stp.prio = d.stp.prio || {};
      for (const v of list) d.stp.prio[v] = pr;
      ev({ type: 'stp', dev: d.id });
    };
    const switchConfig = build([
      ...configCommon('switch'),
      ...mgmt,
      ...ipRouteSpecs,
      ['port-channel load-balance <word>', (d, [m]) => { d.ecLb = m; return []; }, 'EtherChannel load-balancing method'],
      ['spanning-tree mode <word>', (d, [m]) => { const v = m.toLowerCase(); if (!['pvst', 'rapid-pvst', 'mst'].includes(v)) throw new Error('Mode is pvst, rapid-pvst or mst.'); d.stpMode = v; ev({ type: 'stp', dev: d.id }); return []; }, 'Spanning tree operating mode'],
      ['spanning-tree portfast default', (d) => { d.portfastDefault = true; ev({ type: 'stp', dev: d.id }); return ['%Warning: this command enables portfast by default on all interfaces. You should now disable portfast explicitly on switched ports leading to hubs, switches and bridges as they may create temporary bridging loops.']; }, 'Enable PortFast by default on all access ports'],
      ['spanning-tree portfast edge default', (d) => { d.portfastDefault = true; ev({ type: 'stp', dev: d.id }); return []; }, 'Enable PortFast (edge) by default on all access ports'],
      ['spanning-tree portfast bpdufilter default', (d) => { d.bpdufilterDefault = true; return []; }, 'Stop sending BPDUs on PortFast ports by default'],
      ['mac address-table aging-time <num>', (d, [n]) => { d.macAging = Number(n); return []; }, 'Set MAC address table entry maximum age'],
      ['spanning-tree portfast bpduguard default', (d) => { d.bpduguardDefault = true; ev({ type: 'stp', dev: d.id }); return []; }, 'Enable BPDU guard on PortFast ports by default'],
      ['spanning-tree portfast edge bpduguard default', (d) => { d.bpduguardDefault = true; ev({ type: 'stp', dev: d.id }); return []; }, 'Enable BPDU guard on PortFast ports by default'],
      ['spanning-tree vlan <vlist> root secondary', (d, [l]) => { setPrio(d, parseVlist(l), 28672); return []; }, 'Configure switch as secondary root'],
      ['errdisable recovery cause <word>', (d, [c]) => { d.errRecovery = [...new Set([...(d.errRecovery || []), c])]; return []; }, 'Enable error disable recovery for an application'],
      ['errdisable recovery interval <num>', (d, [n]) => { d.errInterval = Number(n); return []; }, 'Error disable recovery timer value'],
      ['ip routing', (d) => { d.ipRouting = true; ev({ type: 'iprouting', dev: d.id }); return []; }, 'Enable IP routing'],
      ['no ip routing', (d) => { d.ipRouting = false; ev({ type: 'iprouting', dev: d.id }); return []; }, 'Negate a command'],
      ['ip default-gateway <ip>', (d, [g]) => { d.defaultGw = g; return []; }, 'Specify default gateway (if not routing IP)'],
      ['interface range <rest>', enterRange, 'interface range command'],
      ['ip dhcp snooping', (d) => { d.snoop = Object.assign(d.snoop || { vlans: [] }, { on: true }); ev({ type: 'snoop', dev: d.id }); return []; }, 'DHCP Snooping'],
      ['no ip dhcp snooping', (d) => { if (d.snoop) d.snoop.on = false; return []; }, 'Negate a command'],
      ['ip dhcp snooping vlan <vlist>', (d, [l]) => { d.snoop = d.snoop || { on: false, vlans: [] }; d.snoop.vlans = [...new Set([...(d.snoop.vlans || []), ...parseVlist(l)])].sort((a, b) => a - b); ev({ type: 'snoop', dev: d.id }); return []; }, 'DHCP Snooping vlan'],
      ['no ip dhcp snooping vlan <vlist>', (d, [l]) => { if (d.snoop) { const r = new Set(parseVlist(l)); d.snoop.vlans = d.snoop.vlans.filter((v) => !r.has(v)); } return []; }, 'Negate a command'],
      ['no ip dhcp snooping information option', (d) => { d.snoop = d.snoop || { on: false, vlans: [] }; d.snoop.noOpt82 = true; return []; }, 'Negate a command'],
      ['ip arp inspection vlan <vlist>', (d, [l]) => { d.dai = d.dai || { vlans: [] }; d.dai.vlans = [...new Set([...d.dai.vlans, ...parseVlist(l)])].sort((a, b) => a - b); ev({ type: 'dai', dev: d.id }); return []; }, 'Enable/Disable ARP Inspection on vlans'],
      ['no ip arp inspection vlan <vlist>', (d, [l]) => { if (d.dai) { const r = new Set(parseVlist(l)); d.dai.vlans = d.dai.vlans.filter((v) => !r.has(v)); } return []; }, 'Negate a command'],
      ['spanning-tree vlan <vlist> priority <num>', (d, [l, p]) => {
        const pr = Number(p);
        if (pr % 4096 !== 0 || pr > 61440) return ['% Bridge Priority must be in increments of 4096.', '% Allowed values are:', '  0     4096  8192  12288 16384 20480 24576 28672', '  32768 36864 40960 45056 49152 53248 57344 61440'];
        setPrio(d, parseVlist(l), pr);
        return [];
      }, 'Spanning Tree Subsystem'],
      ['spanning-tree vlan <vlist> root primary', (d, [l]) => {
        for (const v of parseVlist(l)) {
          let pr = 24576;
          for (const o of Object.values(w.devices)) {
            if (o.kind !== 'switch' || o.id === d.id || !o.vlans[v]) continue;
            const ob = bid(o, v).pr - v;
            if (ob <= pr) pr = Math.max(0, ob - 4096);
          }
          setPrio(d, [v], pr);
        }
        return [];
      }, 'Configure switch as root'],
      ['no spanning-tree vlan <vlist> priority <num>', (d, [l]) => { for (const v of parseVlist(l)) if (d.stp && d.stp.prio) delete d.stp.prio[v]; return []; }, 'Negate a command'],
      ['vlan <vlan>', (d, [v]) => {
        const n = Number(v);
        if (!d.vlans[n]) d.vlans[n] = 'VLAN' + String(n).padStart(4, '0');
        d.mode = 'vlan';
        d.ctx = n;
        ev({ type: 'vlan', dev: d.id });
        return [];
      }, 'VLAN commands'],
      ['no vlan <vlan>', (d, [v]) => {
        const n = Number(v);
        if (n === 1) throw new Error('Default VLAN 1 may not be deleted.');
        delete d.vlans[n];
        return [];
      }, 'Negate a command'],
    ]);

    const setEncap = (d, v, native) => {
      if (!isSub(d.ctx)) throw new Error('Configure encapsulation on a subinterface, for example interface g0/0.10');
      const n = Number(v);
      const par = parentIf(d.ctx);
      const clash = Object.entries(d.interfaces).find(([k, x]) => k !== d.ctx && k.startsWith(par + '.') && x.encap === n);
      if (clash) throw new Error(`Configuration of multiple subinterfaces of the same main interface with the same VID (${n}) is not permitted. This VID is already configured on ${clash[0]}.`);
      d.interfaces[d.ctx].encap = n;
      d.interfaces[d.ctx].native = native;
      ev({ type: 'encap', dev: d.id });
      return [];
    };
    const setSpeed = (d, list, v) => {
      if (!['10', '100', '1000', 'auto'].includes(v)) throw new Error('Speed is 10, 100, 1000 or auto.');
      for (const n of list) { const i = d.interfaces[n]; if (v === 'auto') delete i.speed; else { if (v === '1000' && /^FastEthernet/.test(n)) throw new Error('FastEthernet ports top out at 100 Mbps.'); i.speed = v; } }
      ev({ type: 'phy', dev: d.id });
      return [];
    };
    const setDuplex = (d, list, v) => {
      if (!['full', 'half', 'auto'].includes(v)) throw new Error('Duplex is full, half or auto.');
      for (const n of list) { const i = d.interfaces[n]; if (v === 'auto') delete i.duplex; else i.duplex = v; }
      ev({ type: 'phy', dev: d.id });
      return [];
    };
    const genRsa = (d, bits) => {
      if (!d.hostname || d.hostname === 'Router') throw new Error('Please define a hostname other than Router.');
      if (!d.domain) throw new Error('Please define a domain-name first.');
      if (bits < 360 || bits > 4096) throw new Error('Modulus must be between 360 and 4096 bits.');
      d.rsa = bits;
      ev({ type: 'rsa', dev: d.id });
      return [`The name for the keys will be: ${d.hostname}.${d.domain}`, `% The key modulus size is ${bits} bits`, `% Generating ${bits} bit RSA keys, keys will be non-exportable...`, '[OK] (elapsed time was 1 seconds)', '%SSH-5-ENABLED: SSH 1.99 has been enabled'];
    };
    const routerIf = build([
      ...sub,
      ['ip address <ip> <mask>', (d, [ip, mask]) => {
        const i = d.interfaces[d.ctx];
        const p = maskToPrefix(mask);
        const ipi = ipToInt(ip);
        if (p < 31 && (ipi === netOf(ipi, p) || ipi === (netOf(ipi, p) | (~prefixToMaskInt(p) >>> 0)) >>> 0)) {
          throw new Error('Bad mask /' + p + ' for address ' + ip);
        }
        for (const [n, o] of Object.entries(d.interfaces)) {
          if (n !== d.ctx && o.ip && o.mask && netOf(ipToInt(o.ip), maskToPrefix(o.mask)) === netOf(ipi, p) && !o.shutdown) {
            throw new Error(`${intToIp(netOf(ipi, p))} overlaps with ${n}`);
          }
        }
        i.ip = ip;
        i.mask = mask;
        ev({ type: 'ip', dev: d.id, if: d.ctx });
        return [];
      }, 'Set the IP address of an interface'],
      ['no ip address', (d) => { const i = d.interfaces[d.ctx]; delete i.ip; delete i.mask; delete i.dhcp; delete i.dhcpGw; return []; }, 'Negate a command'],
      ['encapsulation dot1q <vlan>', (d, [v]) => setEncap(d, v, false), 'Set encapsulation type for an interface'],
      ['ipv6 address <v6p>', (d, [pf]) => {
        const x = v6pfx(pf);
        const i = d.interfaces[d.ctx];
        i.ipv6 = (i.ipv6 || []).filter((y) => v6net(v6parse(y.addr), y.p) !== v6net(x.addr, x.p));
        i.ipv6.push({ addr: v6fmt(x.addr), p: x.p });
        ev({ type: 'v6', dev: d.id });
        return [];
      }, 'Configure IPv6 address on interface'],
      ['no ipv6 address', (d) => { delete d.interfaces[d.ctx].ipv6; return []; }, 'Negate a command'],
      ['ipv6 address <v6p> eui-64', (d, [pf]) => {
        const x = v6pfx(pf);
        if (x.p !== 64) throw new Error('EUI-64 needs a /64 prefix.');
        const i = d.interfaces[d.ctx];
        const mac = ifMac(d, d.ctx).replace(/\./g, '');
        const b = mac.match(/../g).map((h) => parseInt(h, 16));
        const id = [b[0] ^ 2, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
        let iid = 0n;
        for (const v of id) iid = (iid << 8n) | BigInt(v);
        const addr = v6net(x.addr, 64) | iid;
        i.ipv6 = (i.ipv6 || []).filter((y) => v6net(v6parse(y.addr), y.p) !== v6net(x.addr, 64));
        i.ipv6.push({ addr: v6fmt(addr), p: 64, eui: true });
        ev({ type: 'v6', dev: d.id });
        return [];
      }, 'Use eui-64 interface identifier'],
      ['ipv6 address autoconfig', (d) => { d.interfaces[d.ctx].v6auto = true; return ['(SLAAC needs a router sending Router Advertisements on this link.)']; }, 'Obtain address using autoconfiguration'],
      ['ipv6 address <v6> link-local', (d, [a]) => { if (!/^fe[89ab]/i.test(a)) throw new Error('A link-local address must be in FE80::/10.'); d.interfaces[d.ctx].ll = v6fmt(v6parse(a)); return []; }, 'Use link-local address'],
      ['ipv6 enable', (d) => { d.interfaces[d.ctx].v6enable = true; return []; }, 'Enable IPv6 on interface (link-local only)'],
      ['standby version <num>', (d, [v]) => { if (v !== '1' && v !== '2') throw new Error('HSRP version is 1 or 2.'); d.interfaces[d.ctx].hsrpVer = Number(v); return []; }, 'HSRP version'],
      ['speed <word>', (d, [v]) => setSpeed(d, [d.ctx], v), 'Configure speed operation'],
      ['duplex <word>', (d, [v]) => setDuplex(d, [d.ctx], v), 'Configure duplex operation'],
      ['no speed', (d) => { delete d.interfaces[d.ctx].speed; ev({ type: 'phy', dev: d.id }); return []; }, 'Negate a command'],
      ['no duplex', (d) => { delete d.interfaces[d.ctx].duplex; ev({ type: 'phy', dev: d.id }); return []; }, 'Negate a command'],
      ['standby <num> ip <ip>', (d, [g, ip]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { ip }); ev({ type: 'hsrp', dev: d.id }); return [`%HSRP-5-STATECHANGE: ${d.ctx} Grp ${g} state Speak -> Standby`]; }, 'HSRP interface configuration commands'],
      ['standby <num> priority <num>', (d, [g, pr]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { prio: Number(pr) }); ev({ type: 'hsrp', dev: d.id }); return []; }, 'Priority level'],
      ['standby <num> preempt', (d, [g]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { preempt: true }); ev({ type: 'hsrp', dev: d.id }); return []; }, 'Overthrow lower priority Active routers'],
      ['no standby <num> preempt', (d, [g]) => { const i = d.interfaces[d.ctx]; if (i.standby && i.standby[g]) delete i.standby[g].preempt; return []; }, 'Negate a command'],
      ['no standby <num>', (d, [g]) => { const i = d.interfaces[d.ctx]; if (i.standby) delete i.standby[g]; ev({ type: 'hsrp', dev: d.id }); return []; }, 'Negate a command'],
      ['encapsulation dot1q <vlan> native', (d, [v]) => setEncap(d, v, true), 'Set encapsulation type for an interface'],
      ['ip access-group <word> in', (d, [n]) => { d.interfaces[d.ctx].aclIn = /^\d+$/.test(n) ? Number(n) : n; ev({ type: 'acl', dev: d.id }); return []; }, 'Specify access control for packets'],
      ['ip access-group <word> out', (d, [n]) => { d.interfaces[d.ctx].aclOut = /^\d+$/.test(n) ? Number(n) : n; ev({ type: 'acl', dev: d.id }); return []; }, 'Specify access control for packets'],
      ['no ip access-group <word> in', (d) => { delete d.interfaces[d.ctx].aclIn; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['no ip access-group <word> out', (d) => { delete d.interfaces[d.ctx].aclOut; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['ip nat inside', (d) => { d.interfaces[d.ctx].nat = 'inside'; ev({ type: 'nat', dev: d.id }); return []; }, 'Inside interface for address translation'],
      ['ip nat outside', (d) => { d.interfaces[d.ctx].nat = 'outside'; ev({ type: 'nat', dev: d.id }); return []; }, 'Outside interface for address translation'],
      ['no ip nat inside', (d) => { delete d.interfaces[d.ctx].nat; return []; }, 'Negate a command'],
      ['no ip nat outside', (d) => { delete d.interfaces[d.ctx].nat; return []; }, 'Negate a command'],
      ['ip helper-address <ip>', (d, [h]) => { const i = d.interfaces[d.ctx]; i.helpers = i.helpers || []; if (!i.helpers.includes(h)) i.helpers.push(h); ev({ type: 'helper', dev: d.id }); return []; }, 'Specify a destination address for UDP broadcasts'],
      ['no ip helper-address <ip>', (d, [h]) => { const i = d.interfaces[d.ctx]; i.helpers = (i.helpers || []).filter((x) => x !== h); return []; }, 'Negate a command'],
      ['shutdown', (d) => { d.interfaces[d.ctx].shutdown = true; ev({ type: 'shut', dev: d.id }); return linkMsgs(d, d.ctx); }, 'Shutdown the selected interface'],
      ['no shutdown', (d) => {
        const i = d.interfaces[d.ctx];
        i.shutdown = false;
        ev({ type: 'noshut', dev: d.id });
        const L = linkMsgs(d, d.ctx);
        if (i.dhcp) { const r = routerDhcp(w, d.id, d.ctx); if (r) L.push(`%DHCP-6-ADDRESS_ASSIGN: Interface ${d.ctx} assigned DHCP address ${r.ip}, mask ${r.mask}, hostname ${d.hostname}`); }
        return L;
      }, 'Negate a command'],
      ['description <rest>', (d, [t]) => { d.interfaces[d.ctx].desc = t; return []; }, 'Interface specific description'],
      ['ip ospf priority <num>', (d, [n]) => { const v = Number(n); if (v > 255) throw new Error('Priority is 0-255.'); d.interfaces[d.ctx].ospfPrio = v; ev({ type: 'ospf', dev: d.id }); return []; }, 'Router priority (0 = never DR or BDR)'],
      ['no ip ospf priority', (d) => { delete d.interfaces[d.ctx].ospfPrio; return []; }, 'Negate a command'],
      ['ip ospf network point-to-point', (d) => { d.interfaces[d.ctx].ospfNet = 'p2p'; ev({ type: 'ospf', dev: d.id }); return []; }, 'Specify OSPF point-to-point network'],
      ['ip ospf network broadcast', (d) => { delete d.interfaces[d.ctx].ospfNet; ev({ type: 'ospf', dev: d.id }); return []; }, 'Specify OSPF broadcast multi-access network'],
      ['no ip ospf network', (d) => { delete d.interfaces[d.ctx].ospfNet; ev({ type: 'ospf', dev: d.id }); return []; }, 'Negate a command'],
      ['ip address dhcp', (d) => {
        const i = d.interfaces[d.ctx];
        delete i.ip; delete i.mask; delete i.dhcpGw;
        i.dhcp = true;
        ev({ type: 'dhcpc', dev: d.id });
        const r = routerDhcp(w, d.id, d.ctx);
        return r ? [`%DHCP-6-ADDRESS_ASSIGN: Interface ${d.ctx} assigned DHCP address ${r.ip}, mask ${r.mask}, hostname ${d.hostname}`] : [];
      }, 'IP Address negotiated via DHCP'],
      ['cdp enable', (d) => { delete d.interfaces[d.ctx].cdpOff; return []; }, 'Enable CDP on interface'],
      ['no lldp transmit', (d) => { d.interfaces[d.ctx].lldpTx = false; return []; }, 'Stop sending LLDP on this interface'],
      ['lldp transmit', (d) => { delete d.interfaces[d.ctx].lldpTx; return []; }, 'Send LLDP on this interface'],
      ['no lldp receive', (d) => { d.interfaces[d.ctx].lldpRx = false; return []; }, 'Ignore LLDP on this interface'],
      ['lldp receive', (d) => { delete d.interfaces[d.ctx].lldpRx; return []; }, 'Accept LLDP on this interface'],
      ['no cdp enable', (d) => { d.interfaces[d.ctx].cdpOff = true; ev({ type: 'cdp', dev: d.id }); return []; }, 'Negate a command'],
      ['ip ospf <num> area <num>', (d, [pid, area]) => {
        if (!d.ospf) d.ospf = { pid: Number(pid), networks: [], passive: [] };
        const i = d.interfaces[d.ctx];
        if (!i.ip) throw new Error('Configure an IP address on this interface first.');
        const exists = d.ospf.networks.some((n) => n.net === i.ip && n.wild === '0.0.0.0');
        if (!exists) d.ospf.networks.push({ net: i.ip, wild: '0.0.0.0', area: Number(area) });
        return [];
      }, 'OSPF interface commands'],
    ]);

    const each = (d, fn) => { const list = Array.isArray(d.ctx) ? d.ctx : [d.ctx]; for (const n of list) fn(d.interfaces[n], n); };
    const switchIf = build([
      ...sub,
      ['shutdown', (d) => { const L = []; each(d, (i, n) => { i.shutdown = true; i.errdis = false; L.push(...linkMsgs(d, n)); }); ev({ type: 'shut', dev: d.id }); return L; }, 'Shutdown the selected interface'],
      ['no shutdown', (d) => { const L = []; each(d, (i, n) => { i.shutdown = false; L.push(...linkMsgs(d, n)); }); ev({ type: 'noshut', dev: d.id }); return L; }, 'Negate a command'],
      ['description <rest>', (d, [t]) => { each(d, (i) => { i.desc = t; }); return []; }, 'Interface specific description'],
      ['ip address <ip> <mask>', (d, [ip, mask]) => {
        each(d, (i, n) => {
          if (!/^Vlan\d+$/.test(n) && !i.routed) throw new Error(`${n} is a Layer 2 port. Use "no switchport" to make it a routed port, or put the address on an SVI with "interface vlan N".`);
          const p = maskToPrefix(mask);
          const ipi = ipToInt(ip);
          if (p < 31 && (ipi === netOf(ipi, p) || ipi === (netOf(ipi, p) | (~prefixToMaskInt(p) >>> 0)) >>> 0)) throw new Error('Bad mask /' + p + ' for address ' + ip);
          i.ip = ip; i.mask = mask;
        });
        ev({ type: 'ip', dev: d.id });
        return [];
      }, 'Set the IP address of an interface'],
      ['no ip address', (d) => { each(d, (i) => { delete i.ip; delete i.mask; }); return []; }, 'Negate a command'],
      ['no switchport', (d) => {
        each(d, (i, n) => {
          if (/^Vlan/.test(n)) throw new Error('An SVI is already a Layer 3 interface.');
          i.routed = true;
          delete i.ps;
        });
        ev({ type: 'routed', dev: d.id });
        return d.ipRouting ? [] : ['% Routed port created. Remember: the switch only routes between interfaces after "ip routing".'];
      }, 'Make this a routed (Layer 3) port'],
      ['switchport', (d) => { each(d, (i) => { delete i.routed; delete i.ip; delete i.mask; }); ev({ type: 'routed', dev: d.id }); return []; }, 'Set switching mode characteristics'],
      ['spanning-tree guard root', (d) => { each(d, (i) => { i.rootGuard = true; delete i.loopGuard; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Set guard mode to root guard on interface'],
      ['spanning-tree guard loop', (d) => { each(d, (i) => { i.loopGuard = true; delete i.rootGuard; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Set guard mode to loop guard on interface'],
      ['spanning-tree guard none', (d) => { each(d, (i) => { delete i.loopGuard; delete i.rootGuard; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Set guard mode to none'],
      ['no spanning-tree guard', (d) => { each(d, (i) => { delete i.loopGuard; delete i.rootGuard; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Negate a command'],
      ['spanning-tree bpdufilter enable', (d) => { each(d, (i) => { i.bpdufilter = true; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Enable BPDU filtering for this interface'],
      ['spanning-tree bpdufilter disable', (d) => { each(d, (i) => { delete i.bpdufilter; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Disable BPDU filtering for this interface'],
      ['no spanning-tree bpdufilter', (d) => { each(d, (i) => { delete i.bpdufilter; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Negate a command'],
      ['cdp enable', (d) => { each(d, (i) => { delete i.cdpOff; }); return []; }, 'Enable CDP on interface'],
      ['no cdp enable', (d) => { each(d, (i) => { i.cdpOff = true; }); return []; }, 'Negate a command'],
      ['switchport mode access', (d) => { each(d, (i) => { i.mode = 'access'; i.modeSet = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set trunking mode of the interface'],
      ['switchport mode trunk', (d) => { each(d, (i) => { i.mode = 'trunk'; i.modeSet = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set trunking mode of the interface'],
      ['switchport mode dynamic desirable', (d) => { each(d, (i) => { i.mode = 'dynamic-desirable'; i.modeSet = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Actively try to form a trunk with DTP'],
      ['switchport mode dynamic auto', (d) => { each(d, (i) => { i.mode = 'dynamic-auto'; i.modeSet = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Form a trunk only if the neighbor asks'],
      ['switchport nonegotiate', (d) => { each(d, (i) => { i.nonegotiate = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Stop sending DTP frames'],
      ['no switchport nonegotiate', (d) => { each(d, (i) => { delete i.nonegotiate; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Negate a command'],
      ['switchport trunk encapsulation dot1q', () => [], 'Set trunking encapsulation (802.1Q)'],
      ['switchport trunk native vlan <vlan>', (d, [v]) => { each(d, (i) => { i.nativeVlan = Number(v); }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set the native VLAN on a trunk'],
      ['no switchport trunk native vlan', (d) => { each(d, (i) => { delete i.nativeVlan; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Negate a command'],
      ['switchport voice vlan <vlan>', (d, [v]) => { each(d, (i) => { i.voiceVlan = Number(v); }); ev({ type: 'sw', dev: d.id }); return d.vlans[Number(v)] ? [] : [`% Voice VLAN does not exist. Creating vlan ${v}`]; }, 'Voice appliance attributes'],
      ['no switchport voice vlan', (d) => { each(d, (i) => { delete i.voiceVlan; }); return []; }, 'Negate a command'],
      ['spanning-tree portfast edge', (d) => { each(d, (i) => { i.portfast = true; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Enable PortFast (edge port)'],
      ['mdix auto', (d) => { each(d, (i) => { delete i.mdixOff; }); return []; }, 'Automatic MDI/MDIX (needs speed and duplex on auto)'],
      ['no mdix auto', (d) => { each(d, (i) => { i.mdixOff = true; }); return []; }, 'Negate a command'],
      ['no lldp transmit', (d) => { each(d, (i) => { i.lldpTx = false; }); return []; }, 'Stop sending LLDP on this port'],
      ['lldp transmit', (d) => { each(d, (i) => { delete i.lldpTx; }); return []; }, 'Send LLDP on this port'],
      ['no lldp receive', (d) => { each(d, (i) => { i.lldpRx = false; }); return []; }, 'Ignore LLDP on this port'],
      ['lldp receive', (d) => { each(d, (i) => { delete i.lldpRx; }); return []; }, 'Accept LLDP on this port'],
      ['spanning-tree portfast disable', (d) => { each(d, (i) => { i.portfast = false; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Disable PortFast on this port'],
      ['speed <word>', (d, [v]) => setSpeed(d, Array.isArray(d.ctx) ? d.ctx : [d.ctx], v), 'Configure speed operation'],
      ['duplex <word>', (d, [v]) => setDuplex(d, Array.isArray(d.ctx) ? d.ctx : [d.ctx], v), 'Configure duplex operation'],
      ['switchport access vlan <vlan>', (d, [v]) => {
        const n = Number(v);
        const L = [];
        if (!d.vlans[n]) {
          d.vlans[n] = 'VLAN' + String(n).padStart(4, '0');
          L.push('% Access VLAN does not exist. Creating vlan ' + n);
        }
        each(d, (i) => { i.accessVlan = n; });
        ev({ type: 'sw', dev: d.id });
        return L;
      }, 'Set access mode characteristics of the interface'],
      ['switchport trunk allowed vlan all', (d) => { each(d, (i) => { i.trunkAllowed = 'all'; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set allowed VLAN characteristics when interface is in trunking mode'],
      ['switchport trunk allowed vlan add <vlist>', (d, [l]) => {
        const add = parseVlist(l);
        each(d, (i) => { if (i.trunkAllowed !== 'all') i.trunkAllowed = [...new Set([...i.trunkAllowed, ...add])].sort((a, b) => a - b); });
        ev({ type: 'sw', dev: d.id });
        return [];
      }, 'add VLANs to the current list'],
      ['switchport trunk allowed vlan remove <vlist>', (d, [l]) => {
        const rem = new Set(parseVlist(l));
        each(d, (i) => { const cur = i.trunkAllowed === 'all' ? range(1, 4094) : i.trunkAllowed; i.trunkAllowed = cur.filter((v) => !rem.has(v)); });
        ev({ type: 'sw', dev: d.id });
        return [];
      }, 'remove VLANs from the current list'],
      ['switchport trunk allowed vlan <vlist>', (d, [l]) => { const v = parseVlist(l); each(d, (i) => { i.trunkAllowed = v.slice(); }); ev({ type: 'sw', dev: d.id }); return []; }, 'VLAN IDs of the allowed VLANs'],
      ['channel-group <num> mode <word>', (d, [g, m]) => {
        const mode = String(m).toLowerCase();
        if (!['active', 'passive', 'desirable', 'auto', 'on'].includes(mode)) throw new Error('Mode must be active, passive, desirable, auto or on.');
        const L = [];
        if (!d.interfaces['Port-channel' + g]) {
          const first = d.interfaces[Array.isArray(d.ctx) ? d.ctx[0] : d.ctx] || {};
          d.interfaces['Port-channel' + g] = first.routed ? { routed: true, shutdown: false } : { mode: first.mode || 'access', accessVlan: first.accessVlan || 1, trunkAllowed: first.trunkAllowed || 'all', shutdown: false, modeSet: !!first.modeSet };
          L.push(`Creating a port-channel interface Port-channel ${g}`);
        }
        each(d, (i, n) => {
          if (/^Port-channel/.test(n)) throw new Error('channel-group goes on the physical member interfaces.');
          i.channel = { group: Number(g), mode };
        });
        ev({ type: 'ec', dev: d.id });
        return L;
      }, 'Etherchannel / port bundling configuration'],
      ['no channel-group', (d) => { each(d, (i) => { delete i.channel; }); ev({ type: 'ec', dev: d.id }); return []; }, 'Negate a command'],
      ['switchport port-security', (d) => {
        each(d, (i, n) => {
          if (i.mode !== 'trunk' && !i.modeSet) throw new Error(`Command rejected: ${n} is a dynamic port.`);
          i.ps = Object.assign(i.ps || { max: 1, macs: [] }, { on: true });
        });
        ev({ type: 'ps', dev: d.id });
        return [];
      }, 'Security related command'],
      ['no switchport port-security', (d) => { each(d, (i) => { if (i.ps) i.ps.on = false; }); return []; }, 'Negate a command'],
      ['switchport port-security maximum <num>', (d, [m]) => { each(d, (i) => { i.ps = i.ps || { on: false, macs: [] }; i.ps.max = Number(m); }); ev({ type: 'ps', dev: d.id }); return []; }, 'Max secure addresses'],
      ['switchport port-security violation <word>', (d, [v]) => {
        const mode = v.toLowerCase();
        if (!['shutdown', 'restrict', 'protect'].includes(mode)) throw new Error('Violation mode must be shutdown, restrict or protect.');
        each(d, (i) => { i.ps = i.ps || { on: false, macs: [], max: 1 }; i.ps.viol = mode; });
        return [];
      }, 'Security violation mode'],
      ['switchport port-security mac-address sticky', (d) => { each(d, (i) => { i.ps = i.ps || { on: false, macs: [], max: 1 }; i.ps.sticky = true; }); ev({ type: 'ps', dev: d.id }); return []; }, 'Configure dynamic secure addresses as sticky'],
      ['no switchport port-security mac-address sticky', (d) => { each(d, (i) => { if (i.ps) { i.ps.sticky = false; i.ps.macs = []; } }); return []; }, 'Negate a command'],
      ['switchport port-security mac-address sticky <mac>', (d, [m]) => { each(d, (i) => { i.ps = i.ps || { on: false, macs: [], max: 1 }; if (!i.ps.macs.includes(m.toLowerCase())) i.ps.macs.push(m.toLowerCase()); }); return []; }, 'Configure a sticky secure MAC address'],
      ['no switchport port-security mac-address sticky <mac>', (d, [m]) => { each(d, (i) => { if (i.ps) i.ps.macs = (i.ps.macs || []).filter((x) => x !== m.toLowerCase()); }); ev({ type: 'ps', dev: d.id }); return []; }, 'Negate a command'],
      ['ip dhcp snooping trust', (d) => { each(d, (i) => { i.snoopTrust = true; }); ev({ type: 'snoop', dev: d.id }); return []; }, 'DHCP Snooping trust config'],
      ['no ip dhcp snooping trust', (d) => { each(d, (i) => { delete i.snoopTrust; }); return []; }, 'Negate a command'],
      ['ip dhcp snooping limit rate <num>', (d, [r]) => { each(d, (i) => { i.snoopRate = Number(r); }); return []; }, 'DHCP Snooping rate limit'],
      ['ip arp inspection trust', (d) => { each(d, (i) => { i.daiTrust = true; }); ev({ type: 'dai', dev: d.id }); return []; }, 'Configure Trust state'],
      ['no ip arp inspection trust', (d) => { each(d, (i) => { delete i.daiTrust; }); return []; }, 'Negate a command'],
      ['spanning-tree portfast', (d) => { each(d, (i) => { i.portfast = true; }); ev({ type: 'stp', dev: d.id }); return ['%Warning: portfast should only be enabled on ports connected to a single', ' host. Connecting hubs, concentrators, switches, bridges, etc... to this', ' interface  when portfast is enabled, can cause temporary bridging loops.', ' Use with CAUTION']; }, 'Spanning tree portfast options'],
      ['no spanning-tree portfast', (d) => { each(d, (i) => { delete i.portfast; }); return []; }, 'Negate a command'],
      ['spanning-tree bpduguard enable', (d) => { each(d, (i) => { i.bpduguard = true; }); ev({ type: 'stp', dev: d.id }); return []; }, 'Enable BPDU guard for this interface'],
      ['spanning-tree bpduguard disable', (d) => { each(d, (i) => { delete i.bpduguard; }); return []; }, 'Disable BPDU guard for this interface'],
    ]);

    const vlanMode = build([
      ...sub,
      ['name <word>', (d, [n]) => { d.vlans[d.ctx] = n.slice(0, 32); ev({ type: 'vlanname', dev: d.id }); return []; }, 'Ascii name of the VLAN'],
    ]);

    const routerMode = build([
      ...sub,
      ['network <ip> <wild> area <num>', (d, [net, wild, area]) => {
        const o = d.ospf;
        const same = o.networks.find((n) => n.net === net && n.wild === wild);
        if (same && String(same.area) !== area) {
          throw new Error(`OSPF: network ${net} ${wild} is already in area ${same.area}. Remove it with "no network ${net} ${wild} area ${same.area}" first.`);
        }
        if (!same) o.networks.push({ net, wild, area: Number(area) });
        ev({ type: 'ospfnet', dev: d.id });
        return [];
      }, 'Enable routing on an IP network'],
      ['no network <ip> <wild> area <num>', (d, [net, wild, area]) => {
        const o = d.ospf;
        const before = o.networks.length;
        o.networks = o.networks.filter((n) => !(n.net === net && n.wild === wild && String(n.area) === area));
        if (o.networks.length === before) return ['% No matching network statement'];
        ev({ type: 'ospfnet', dev: d.id });
        return [];
      }, 'Negate a command'],
      ['passive-interface default', (d) => { d.ospf.passiveDefault = true; d.ospf.nonPassive = []; ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Suppress routing updates on all interfaces'],
      ['no passive-interface default', (d) => { d.ospf.passiveDefault = false; ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Negate a command'],
      ['default-information originate', (d) => { d.ospf.defOrig = true; ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Distribute a default route'],
      ['default-information originate always', (d) => { d.ospf.defOrig = 'always'; ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Always advertise a default route'],
      ['no default-information originate', (d) => { delete d.ospf.defOrig; ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Negate a command'],
      ['auto-cost reference-bandwidth <num>', (d, [n]) => { d.ospf.refBw = Number(n); return ['% OSPF: Reference bandwidth is changed.', '        Please ensure reference bandwidth is consistent across all routers.']; }, 'Use reference bandwidth method to assign OSPF cost'],
      ['router-id <ip>', (d, [rid]) => { d.ospf.routerId = rid; return ['% OSPF: Reload or use "clear ip ospf process" command, for this to take effect']; }, 'router-id for this OSPF process'],
      ['passive-interface <if>', (d, [n]) => { const c = canonIf(n); if (!d.ospf.passive.includes(c)) d.ospf.passive.push(c); ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Suppress routing updates on an interface'],
      ['no passive-interface <if>', (d, [n]) => { const c = canonIf(n); if (d.ospf.passiveDefault) { d.ospf.nonPassive = [...new Set([...(d.ospf.nonPassive || []), c])]; } else d.ospf.passive = d.ospf.passive.filter((x) => x !== c); ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Negate a command'],
    ]);

    const eigrpMode = build([
      ...sub,
      ['network <ip>', (d, [net]) => addEigrpNet(d, net, null), 'Enable routing on an IP network'],
      ['network <ip> <wild>', (d, [net, wild]) => addEigrpNet(d, net, wild), 'Enable routing on an IP network'],
      ['no network <ip>', (d, [net]) => { d.eigrp.networks = d.eigrp.networks.filter((n) => n.net !== net); ev({ type: 'eigrp', dev: d.id }); return []; }, 'Negate a command'],
      ['no network <ip> <wild>', (d, [net, wild]) => { d.eigrp.networks = d.eigrp.networks.filter((n) => !(n.net === net && n.wild === wild)); ev({ type: 'eigrp', dev: d.id }); return []; }, 'Negate a command'],
      ['passive-interface <if>', (d, [n]) => { const c = canonIf(n); if (!d.eigrp.passive.includes(c)) d.eigrp.passive.push(c); ev({ type: 'eigrp', dev: d.id }); return []; }, 'Suppress routing updates on an interface'],
      ['no passive-interface <if>', (d, [n]) => { const c = canonIf(n); d.eigrp.passive = d.eigrp.passive.filter((x) => x !== c); ev({ type: 'eigrp', dev: d.id }); return []; }, 'Negate a command'],
      ['no auto-summary', () => [], 'Disable automatic network number summarization'],
      ['eigrp router-id <ip>', (d, [r]) => { d.eigrp.routerId = r; return []; }, 'Router ID for this EIGRP process'],
    ]);
    const addEigrpNet = (d, net, wild) => {
      if (!d.eigrp.networks.some((n) => n.net === net && (n.wild || null) === wild)) d.eigrp.networks.push(wild ? { net, wild } : { net });
      ev({ type: 'eigrp', dev: d.id });
      const L = [];
      for (const a of computeEigrp(w).adj.filter((x) => x.a === d.id)) {
        L.push(`%DUAL-5-NBRCHANGE: EIGRP-IPv4 ${d.eigrp.as}: Neighbor ${intToIp(ipOf(w, a.b, a.bIf))} (${a.aIf}) is up: new adjacency`);
      }
      return L.slice(-1);
    };
    const lineMode = build([
      ...sub,
      ['transport input <rest>', (d, [t]) => {
        if (d.ctx === 'con') throw new Error('transport input applies to VTY lines. The console is a physical port.');
        const words = t.toLowerCase().split(/\s+/);
        for (const x of words) if (!['ssh', 'telnet', 'all', 'none'].includes(x)) throw new Error('transport input takes ssh, telnet, all or none.');
        d.vty.transport = words.includes('none') ? [] : words;
        ev({ type: 'vty', dev: d.id });
        return [];
      }, 'Define which protocols to use when connecting to the terminal server'],
      ['login local', (d) => { lineOf(d).login = 'local'; ev({ type: 'vty', dev: d.id }); return []; }, 'Local password checking'],
      ['login', (d) => { const L = lineOf(d); L.login = 'password'; ev({ type: 'vty', dev: d.id }); return L.password ? [] : [`% Login disabled on line ${d.ctx === 'con' ? 0 : 1}, until 'password' is set`]; }, 'Enable password checking'],
      ['no login', (d) => { lineOf(d).login = null; return []; }, 'Negate a command'],
      ['password <word>', (d, [pw]) => { lineOf(d).password = pw; ev({ type: 'vty', dev: d.id }); return []; }, 'Set a password'],
      ['exec-timeout <num> <num>', (d, [m, sec]) => { lineOf(d).timeout = [Number(m), Number(sec)]; ev({ type: 'vty', dev: d.id }); return []; }, 'Set the EXEC timeout'],
      ['logging synchronous', (d) => { lineOf(d).logsync = true; return []; }, 'Synchronized message output'],
      ['access-class <word> in', (d, [n]) => { if (d.ctx === 'con') throw new Error('access-class filters VTY (remote) logins.'); lineOf(d).accessClass = /^\d+$/.test(n) ? Number(n) : n; ev({ type: 'vty', dev: d.id }); return []; }, 'Filter connections by source address'],
      ['no access-class <word> in', (d) => { delete lineOf(d).accessClass; return []; }, 'Negate a command'],
    ]);

    const aclMode = build([
      ...sub,
      ['permit <rest>', (d, [r]) => addNamed(d, 'permit ' + r), 'Specify packets to forward'],
      ['deny <rest>', (d, [r]) => addNamed(d, 'deny ' + r), 'Specify packets to reject'],
      ['remark <rest>', () => [], 'Access list entry comment'],
      ['no <num>', (d, [n]) => { const k = Number(n) / 10 - 1; const list = d.acls[d.ctx] || []; if (Number.isInteger(k) && list[k]) list.splice(k, 1); ev({ type: 'acl', dev: d.id }); return []; }, 'Delete an entry by sequence number'],
    ]);
    const addNamed = (d, text) => {
      const e = parseAce(d.aclStd ? 1 : 100, text);
      e.named = true;
      (d.acls[d.ctx] = d.acls[d.ctx] || []).push(e);
      ev({ type: 'acl', dev: d.id });
      return [];
    };
    const dhcpMode = build([
      ...sub,
      ['network <ip> <mask>', (d, [n, m]) => { d.dhcpPools[d.ctx].network = n; d.dhcpPools[d.ctx].mask = m; ev({ type: 'dhcps', dev: d.id }); return []; }, 'Network number and mask'],
      ['default-router <ip>', (d, [g]) => { d.dhcpPools[d.ctx].gw = g; ev({ type: 'dhcps', dev: d.id }); return []; }, 'Default routers'],
      ['dns-server <ip>', (d, [g]) => { d.dhcpPools[d.ctx].dns = g; return []; }, 'DNS servers'],
      ['domain-name <word>', (d, [n]) => { d.dhcpPools[d.ctx].domain = n; return []; }, 'Domain name'],
      ['lease <num>', (d, [n]) => { d.dhcpPools[d.ctx].lease = Number(n); return []; }, 'Address lease time (days)'],
      ['lease <num> <num>', (d, [a, b]) => { d.dhcpPools[d.ctx].lease = Number(a) + Number(b) / 24; return []; }, 'Address lease time (days hours)'],
    ]);

    const pcTree = build([
      ['ipconfig', (d) => [
        '',
        'FastEthernet0 Connection:(default port)',
        '',
        '   IPv4 Address......................: ' + (d.pc.ip || '0.0.0.0'),
        '   Subnet Mask.......................: ' + (d.pc.mask || '0.0.0.0'),
        '   Default Gateway...................: ' + (d.pc.gw || '0.0.0.0'),
        ...(d.pc.ip6 ? ['   IPv6 Address......................: ' + d.pc.ip6 + '/' + (d.pc.p6 || 64), '   IPv6 Default Gateway..............: ' + (d.pc.gw6 || '::')] : []),
        '   Physical Address..................: ' + pcMac(d).toUpperCase(),
        '',
      ], 'Show this PC\'s IP settings'],
      ['ssh -l <word> <ip>', (d, [u, t]) => {
        const r = remoteLogin(w, d.id, t, 'ssh', u);
        w.events.push({ type: 'ssh', from: d.id, to: t, ok: r.ok });
        d.flags = d.flags || {};
        if (r.ok) d.flags.sshOk = u + '@' + t;
        return r.ok ? ['Password: ********', '', r.dev.hostname + '>', `(SSH session to ${r.dev.hostname} as ${u} works. Configure it from its own console tab.)`, `[Connection to ${t} closed by foreign host]`] : [r.msg];
      }, 'Open an SSH session'],
      ['telnet <ip>', (d, [t]) => {
        const r = remoteLogin(w, d.id, t, 'telnet');
        w.events.push({ type: 'telnet', from: d.id, to: t, ok: r.ok });
        return r.ok ? [`Trying ${t} ...Open`, '', 'User Access Verification', '', 'Password: ', r.dev.hostname + '>', '(Telnet sends everything, passwords included, in clear text.)', `[Connection to ${t} closed by foreign host]`] : [`Trying ${t} ...`, r.msg];
      }, 'Open a Telnet session'],
      ['ping <ipany>', (d, [t]) => {
        const r = v6parse(t) !== null ? ping6(w, d.id, t) : ping(w, d.id, t, { record: true });
        w.events.push({ type: 'ping', from: d.id, to: t, ok: r.ok });
        const L = ['', `Pinging ${t} with 32 bytes of data:`, ''];
        for (let k = 0; k < 4; k++) {
          if (r.ok) {
            const dstDev = r.there && w.devices[r.there.dstDev];
            const hopsBack = r.back && r.back.hops ? r.back.hops.length - 1 : 0;
            const base = dstDev && dstDev.kind === 'router' ? 255 : 128;
            L.push(`Reply from ${t}: bytes=32 time<1ms TTL=${base - Math.max(0, hopsBack - 1)}`);
          } else L.push('Request timed out.');
        }
        L.push('', `Ping statistics for ${t}:`, `    Packets: Sent = 4, Received = ${r.ok ? 4 : 0}, Lost = ${r.ok ? 0 : 4} (${r.ok ? 0 : 100}% loss),`);
        return L;
      }, 'Test reachability'],
      ['ipconfig /renew', (d) => {
        if (!d.pc.dhcp) return ['This PC uses a static address. DHCP is not enabled on it.'];
        const r = dhcpRenew(w, d.id);
        w.events.push({ type: 'dhcp', dev: d.id, ok: r.ok });
        return r.ok
          ? ['', 'Windows IP Configuration', '', '   IPv4 Address......................: ' + d.pc.ip, '   Subnet Mask.......................: ' + d.pc.mask, '   Default Gateway...................: ' + d.pc.gw, '']
          : ['', 'An error occurred while renewing interface Ethernet: unable to contact your DHCP server.', 'Autoconfiguration IPv4 Address....: ' + d.pc.ip + ' (APIPA)', ''];
      }, 'Ask a DHCP server for an address'],
      ['leases', (d) => {
        if (!d.pc.server) return ['This device is not a DHCP server.'];
        const L = ['DHCP pools on ' + d.hostname + ':'];
        for (const p of d.pc.pools || []) L.push(`  ${p.name}  ${p.network}/${maskToPrefix(p.mask)}  range ${p.start}-${p.end}  gateway ${p.gw}`);
        const ls = Object.entries(d.pc.leases || {});
        L.push('Leases:');
        if (!ls.length) L.push('  (none)');
        for (const [cid, ip] of ls) L.push(`  ${ip}  ${w.devices[cid].hostname}`);
        return L;
      }, 'Show DHCP pools and leases (servers only)'],
      ['help', (d) => ['Commands on this ' + (d.pc.server ? 'server' : 'PC') + ':', '  ipconfig                 show IP address, mask, gateway and MAC', '  ipconfig /renew          request an address from DHCP', '  ping <address>           test reachability (IPv4 or IPv6)', '  ssh -l <user> <address>  open an SSH session', '  telnet <address>         open a Telnet session', ...(d.pc.server ? ['  leases                   show DHCP pools and leases'] : [])], 'List commands'],
    ]);

    return {
      'router:user': userTree('router'),
      'router:priv': privTree('router'),
      'router:config': routerConfig,
      'router:if': routerIf,
      'router:router': routerMode,
      'router:eigrp': eigrpMode,
      'router:line': lineMode,
      'router:dhcp': dhcpMode,
      'router:acl': aclMode,
      'switch:acl': aclMode,
      'switch:user': userTree('switch'),
      'switch:priv': privTree('switch'),
      'switch:config': switchConfig,
      'switch:if': switchIf,
      'switch:vlan': vlanMode,
      'switch:line': lineMode,
      pc: pcTree,
    };
  }

  function parseAddr(toks) {
    const t = toks.shift();
    if (!t) throw new Error('% Incomplete command.');
    if (t === 'any') return { spec: { any: true }, text: 'any' };
    if (t === 'host') {
      const h = toks.shift();
      if (ipToInt(h) === null) throw new Error('Expected an address after host.');
      return { spec: { net: h, wild: '0.0.0.0' }, text: 'host ' + h };
    }
    if (ipToInt(t) === null) throw new Error(`Invalid address: ${t}`);
    const wl = toks[0] && ipToInt(toks[0]) !== null ? toks.shift() : '0.0.0.0';
    const net = intToIp((ipToInt(t) & ~ipToInt(wl)) >>> 0);
    return { spec: { net, wild: wl }, text: wl === '0.0.0.0' ? 'host ' + t : `${net} ${wl}` };
  }
  function parseAce(num, rest) {
    const toks = rest.trim().split(/\s+/).map((x) => x.toLowerCase());
    const action = toks.shift();
    if (action !== 'permit' && action !== 'deny') throw new Error('An entry starts with permit or deny.');
    const std = (num >= 1 && num <= 99) || (num >= 1300 && num <= 1999);
    if (std) {
      const a = parseAddr(toks);
      return { std: true, action, src: a.spec, text: `${action} ${a.text === 'any' ? 'any' : a.text.replace(/^host /, '')}` };
    }
    const proto = toks.shift();
    if (!['ip', 'icmp', 'tcp', 'udp'].includes(proto)) throw new Error('Protocol must be ip, icmp, tcp or udp.');
    const src = parseAddr(toks);
    const dst = parseAddr(toks);
    let tail = '';
    if (toks[0] === 'eq' && toks[1]) { tail = ` eq ${toks[1]}`; toks.splice(0, 2); }
    return { std: false, action, proto, src: src.spec, dst: dst.spec, text: `${action} ${proto} ${src.text} ${dst.text}${tail}` };
  }

  function cfgSnapshot(d) {
    return { hostname: d.hostname, interfaces: d.interfaces, vlans: d.vlans, routes: d.routes, ospf: d.ospf, acls: d.acls, nat: d.nat, stp: d.stp };
  }
  function ifSort(a, b) {
    const pa = String(a).match(/\d+/g) || [];
    const pb = String(b).match(/\d+/g) || [];
    const ta = String(a).replace(/[\d/.]+$/, '');
    const tb = String(b).replace(/[\d/.]+$/, '');
    if (ta !== tb) return ta < tb ? -1 : 1;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = Number(pa[i] || 0) - Number(pb[i] || 0);
      if (x) return x;
    }
    return 0;
  }
  function parseVlist(s) {
    const out = [];
    for (const part of s.split(',')) {
      const [a, b] = part.split('-').map(Number);
      if (b) for (let v = a; v <= b; v++) out.push(v);
      else out.push(a);
    }
    return [...new Set(out)].sort((x, y) => x - y);
  }
  function range(a, b) {
    const r = [];
    for (let i = a; i <= b; i++) r.push(i);
    return r;
  }
  function fmtVlans(list) {
    if (list === 'all') return '1-4094';
    if (!list.length) return 'none';
    const out = [];
    let s = list[0];
    let p = list[0];
    for (let i = 1; i <= list.length; i++) {
      const v = list[i];
      if (v === p + 1) { p = v; continue; }
      out.push(s === p ? String(s) : `${s}-${p}`);
      s = p = v;
    }
    return out.join(',');
  }

  TT.Session = Session;
  TT.util = { ifSort, fmtVlans, parseVlist, cfgSnapshot };
})(typeof globalThis !== 'undefined' ? globalThis : window);
