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
    if (/^Port-channel/.test(ifn)) return poUp(w, id, ifn);
    if (isSub(ifn)) return linkUp(w, id, parentIf(ifn));
    const p = linkPeer(w, id, ifn);
    if (!p) return false;
    return adminUp(w, p[0], p[1]);
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
  function vlanAllowed(port, v) {
    if (port.trunkAllowed === 'all') return true;
    return Array.isArray(port.trunkAllowed) && port.trunkAllowed.includes(v);
  }

  /**
   * Starting at an L3 endpoint (router interface or PC NIC), return every L3 endpoint
   * reachable at layer 2 (same VLAN / broadcast domain), including the start.
   */
  function l2Domain(w, id, ifn) {
    const out = [[id, ifn]];
    if (!linkUp(w, id, ifn)) return out;
    const seen = new Set();
    const firstHop = linkPeer(w, id, ifn);
    if (!firstHop) return out;
    let startTag = null;
    if (isSub(ifn)) {
      const si = w.devices[id].interfaces[ifn];
      if (!si.encap) return out; // a subinterface without encapsulation sends nothing
      startTag = si.native ? null : si.encap;
    }

    if (w.devices[id].kind === 'pc' && !psAllows(w, firstHop[0], firstHop[1], id)) return out;
    const stack = [[firstHop[0], firstHop[1], startTag]]; // [device, port, tagVlan|null]
    while (stack.length) {
      const [dev, port, tag] = stack.pop();
      const d = w.devices[dev];
      if (!d) continue;
      if (d.kind !== 'switch') {
        const ep = endpointFor(d, port, tag);
        if (ep && adminUp(w, dev, ep) && !out.some(([a, b]) => a === dev && b === ep)) out.push([dev, ep]);
        continue;
      }
      const p = d.interfaces[port];
      if (!p || p.shutdown) continue;
      let vlan;
      if (p.mode === 'trunk') {
        vlan = tag === null ? 1 : tag; // untagged on a trunk = native VLAN 1
        if (!vlanAllowed(p, vlan)) continue;
      } else {
        if (tag !== null && tag !== 1) continue; // tagged frame arriving on an access port is dropped
        vlan = p.accessVlan;
      }
      if (!d.vlans[vlan]) continue; // VLAN missing from the database: port is inactive
      const key = dev + '|' + vlan;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [pn, pp] of Object.entries(d.interfaces)) {
        if (pp.shutdown) continue;
        let egressTag;
        if (pp.mode === 'trunk') {
          if (!vlanAllowed(pp, vlan)) continue;
          egressTag = vlan === 1 ? null : vlan;
        } else {
          if (pp.accessVlan !== vlan) continue;
          egressTag = null;
        }
        const peer = linkPeer(w, dev, pn);
        if (!peer || !adminUp(w, peer[0], peer[1])) continue;
        if (w.devices[peer[0]].kind === 'pc' && !psAllows(w, dev, pn, peer[0])) continue;
        stack.push([peer[0], peer[1], egressTag]);
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
        const passive = (d.ospf.passive || []).includes(ifn);
        enabled[d.id].push({ ifn, area, passive });
      }
    }
    // adjacencies
    const adj = [];
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
          adj.push({ a: d.id, aIf: e.ifn, b: oid, bIf: oif });
        }
      }
    }
    // shortest paths (each hop costs 1: gigabit links with the 100 Mbps reference)
    const learned = {};
    for (const src of routers) {
      const dist = { [src.id]: 0 };
      const first = {}; // router -> {nhIp, outIf}
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

  function ownsIp(w, id, dst) {
    const d = w.devices[id];
    if (d.kind === 'pc') return d.pc.ip && ipToInt(d.pc.ip) === dst;
    return Object.keys(d.interfaces).some((n) => l3Up(w, id, n) && (ipOf(w, id, n) === dst || vipsOf(w, id, n).includes(dst)));
  }

  /** Forward a packet hop by hop, applying ACLs and NAT. Returns {ok, dstDev, srcIp, pktSrc, nat, reason, hops}. */
  function forward(w, startId, dst, ospfCache, opts) {
    let cur = startId;
    let srcIp = null; // source address as first sent
    let pktSrc = null; // source address as it travels (changes after NAT)
    let inIf = null;
    let nat = null;
    const hops = [startId];
    for (let n = 0; n < 16; n++) {
      const d = w.devices[cur];
      if (ownsIp(w, cur, dst)) return { ok: true, dstDev: cur, srcIp, pktSrc, nat, hops };
      let egress;
      let nextIp;
      if (d.kind === 'pc') {
        if (!d.pc.ip) return { ok: false, reason: 'no-ip', hops };
        const p = maskToPrefix(d.pc.mask);
        egress = 'NIC';
        if (netOf(dst, p) === netOf(ipToInt(d.pc.ip), p)) nextIp = dst;
        else if (d.pc.gw) nextIp = ipToInt(d.pc.gw);
        else return { ok: false, reason: 'no-gateway', hops };
      } else if (d.kind === 'router') {
        const r = lookup(routingTable(w, cur, ospfCache), dst);
        if (!r) return { ok: false, reason: 'no-route', at: cur, hops };
        egress = r.if;
        nextIp = r.type === 'C' || r.exitIf ? dst : ipToInt(r.nh);
      } else {
        return { ok: false, reason: 'switch', hops };
      }
      if (srcIp === null) { srcIp = ipOf(w, cur, egress); pktSrc = srcIp; }
      if (d.kind === 'router') {
        const ei = d.interfaces[egress] || {};
        const ii = (inIf && d.interfaces[inIf]) || {};
        // NAT: inside -> outside, source matches the NAT ACL
        if (d.nat && d.nat.list && ii.nat === 'inside' && ei.nat === 'outside' && aclPermits(d, d.nat.list, pktSrc, dst)) {
          const global = ipOf(w, cur, d.nat.outIf || egress);
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
        if (ei.aclOut !== undefined && !aclPermits(d, ei.aclOut, pktSrc, dst)) return { ok: false, reason: 'acl', at: cur, hops };
      }
      const dom = l2Domain(w, cur, egress);
      const hit = dom.find(([oid, oif]) => oid !== cur && l3Up(w, oid, oif) && (ipOf(w, oid, oif) === nextIp || vipsOf(w, oid, oif).includes(nextIp)));
      if (!hit) return { ok: false, reason: nextIp === dst ? 'host-unreachable' : 'next-hop-unreachable', at: cur, hops };
      if (!arpOk(w, cur, egress) || !arpOk(w, hit[0], hit[1])) return { ok: false, reason: 'dai', at: cur, hops };
      const nd = w.devices[hit[0]];
      if (nd.kind === 'router') {
        const ni = nd.interfaces[hit[1]] || {};
        if (ni.aclIn !== undefined && !aclPermits(nd, ni.aclIn, pktSrc, dst)) return { ok: false, reason: 'acl', at: hit[0], hops };
        // un-NAT on the way back in
        if (nd.nat && nd.natTable && ni.nat === 'outside' && ownsIp(w, hit[0], dst)) {
          /* handled by ping(): delivery to the router's outside address */
        }
      }
      inIf = hit[1];
      cur = hit[0];
      hops.push(cur);
    }
    return { ok: false, reason: 'ttl', hops };
  }

  /** Full ping: there and back, following NAT translations. */
  function ping(w, srcId, dstIpStr, opts) {
    const dst = ipToInt(dstIpStr);
    if (dst === null) return { ok: false, reason: 'bad-ip' };
    const cache = computeOspf(w);
    const there = forward(w, srcId, dst, cache, opts);
    if (!there.ok) return there;
    if (there.srcIp === null) return { ok: true, local: true }; // pinged own address
    const back = forward(w, there.dstDev, there.pktSrc, cache);
    if (!back.ok) return { ok: false, reason: 'no-return-path', at: back.at, there, back };
    if (there.nat) {
      // the reply reached the NAT router's outside address; translate and continue inside
      if (back.dstDev !== there.nat.router) return { ok: false, reason: 'no-return-path', there, back };
      const inside = forward(w, there.nat.router, there.nat.inside, cache);
      if (!inside.ok || inside.dstDev !== srcId) return { ok: false, reason: 'no-return-path', there, back: inside };
      return { ok: true, there, back: { hops: back.hops.concat(inside.hops.slice(1)) } };
    }
    if (back.dstDev !== srcId && !ownsIp(w, srcId, there.srcIp)) return { ok: false, reason: 'no-return-path', there, back };
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
      if (p.mode === 'trunk') { vlan = tag === null ? 1 : tag; if (!vlanAllowed(p, vlan)) continue; }
      else { if (tag !== null && tag !== 1) continue; vlan = p.accessVlan; }
      if (!d.vlans[vlan]) continue;
      const key = dev + '|' + vlan;
      if (seen.has(key)) continue;
      seen.add(key);
      const np = path.concat([{ sw: dev, port, vlan }]);
      for (const [pn, pp] of Object.entries(d.interfaces)) {
        if (pn === port || pp.shutdown || pp.errdis) continue;
        let et;
        if (pp.mode === 'trunk') { if (!vlanAllowed(pp, vlan)) continue; et = vlan === 1 ? null : vlan; }
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
  function forward6(w, startId, dst) {
    let cur = startId;
    let src = null;
    for (let n = 0; n < 16; n++) {
      const d = w.devices[cur];
      const mine = d.kind === 'pc' ? v6addrs(w, cur, 'NIC') : Object.keys(d.interfaces).filter((k) => linkUp(w, cur, k)).flatMap((k) => v6addrs(w, cur, k));
      if (mine.some((x) => x.a === dst)) return { ok: true, dstDev: cur, src };
      if (n > 0 && d.kind === 'router' && !d.v6routing) return { ok: false, reason: 'v6-routing-off', at: cur };
      let egress;
      let next;
      if (d.kind === 'pc') {
        const me = v6addrs(w, cur, 'NIC')[0];
        if (!me) return { ok: false, reason: 'no-ip' };
        egress = 'NIC';
        if (v6net(dst, me.p) === v6net(me.a, me.p)) next = dst;
        else if (d.pc.gw6) next = v6parse(d.pc.gw6);
        else return { ok: false, reason: 'no-gateway' };
      } else if (d.kind === 'router') {
        let best = null;
        for (const r of routingTable6(w, cur)) if (r.type !== 'L' && v6net(dst, r.p) === r.net && (!best || r.p > best.p)) best = r;
        if (!best) return { ok: false, reason: 'no-route', at: cur };
        egress = best.if;
        next = best.type === 'C' ? dst : v6parse(best.nh);
      } else return { ok: false, reason: 'switch' };
      if (src === null) {
        const a = v6addrs(w, cur, egress)[0];
        src = a ? a.a : null;
      }
      const hit = l2Domain(w, cur, egress).find(([oid, oif]) => oid !== cur && v6addrs(w, oid, oif).some((x) => x.a === next) && linkUp(w, oid, oif));
      if (!hit) return { ok: false, reason: next === dst ? 'host-unreachable' : 'next-hop-unreachable', at: cur };
      cur = hit[0];
    }
    return { ok: false, reason: 'ttl' };
  }
  function ping6(w, srcId, dstStr) {
    const dst = v6parse(dstStr);
    if (dst === null) return { ok: false, reason: 'bad-ip' };
    const there = forward6(w, srcId, dst);
    if (!there.ok) return there;
    if (there.src === null) return { ok: true, local: true };
    const back = forward6(w, there.dstDev, there.src);
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
    if (!i || !linkUp(w, d.id, ifn) || !d.vlans[vlan]) return false;
    return i.mode === 'trunk' ? vlanAllowed(i, vlan) : i.accessVlan === vlan;
  }
  function computeStp(w, vlan) {
    const sws = Object.values(w.devices).filter((d) => d.kind === 'switch' && d.vlans[vlan]);
    if (!sws.length) return null;
    let root = null;
    for (const d of sws) { const b = bid(d, vlan); if (!root || bidLess(b, root)) root = b; }
    // switch-to-switch segments
    const segs = [];
    for (const d of sws) {
      for (const n of Object.keys(d.interfaces)) {
        if (/^Port-channel/.test(n) || !carries(w, d, n, vlan)) continue;
        const p = linkPeer(w, d.id, n);
        if (!p) continue;
        const o = w.devices[p[0]];
        if (o.kind !== 'switch' || !carries(w, o, p[1], vlan)) continue;
        segs.push({ a: d.id, aIf: n, b: o.id, bIf: p[1] });
      }
    }
    const cost = { [root.dev]: 0 };
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
      if (d.id === root.dev || cost[d.id] === undefined) continue;
      let best = null;
      for (const g of segs.filter((x) => x.a === d.id && cost[x.b] !== undefined)) {
        const cand = { c: cost[g.b] + portCost(g.aIf), nb: bid(w.devices[g.b], vlan), np: ids[g.b][g.bIf], lp: ids[d.id][g.aIf], ifn: g.aIf };
        const better = !best || cand.c < best.c || (cand.c === best.c && (bidLess(cand.nb, best.nb) || (cand.nb.mac === best.nb.mac && (cand.np < best.np || (cand.np === best.np && cand.lp < best.lp)))));
        if (better) best = cand;
      }
      if (best) rootPort[d.id] = best.ifn;
    }
    const ports = {};
    for (const d of sws) {
      ports[d.id] = {};
      for (const n of Object.keys(d.interfaces)) {
        if (/^Port-channel/.test(n) || !carries(w, d, n, vlan)) continue;
        const seg = segs.find((g) => g.a === d.id && g.aIf === n);
        if (!seg) { ports[d.id][n] = { role: 'Desg', sts: 'FWD', cost: portCost(n) }; continue; }
        if (rootPort[d.id] === n) { ports[d.id][n] = { role: 'Root', sts: 'FWD', cost: portCost(n) }; continue; }
        const me = { c: cost[d.id], b: bid(d, vlan), p: ids[d.id][n] };
        const th = { c: cost[seg.b], b: bid(w.devices[seg.b], vlan), p: ids[seg.b][seg.bIf] };
        const iWin = me.c < th.c || (me.c === th.c && (bidLess(me.b, th.b) || (me.b.mac === th.b.mac && me.p < th.p)));
        ports[d.id][n] = iWin ? { role: 'Desg', sts: 'FWD', cost: portCost(n) } : { role: 'Altn', sts: 'BLK', cost: portCost(n) };
      }
    }
    return { root, cost, rootPort, ports, ids };
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
  const sameL2 = (x, y) => x.mode === y.mode && (x.mode === 'trunk' ? JSON.stringify(x.trunkAllowed) === JSON.stringify(y.trunkAllowed) : x.accessVlan === y.accessVlan);
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
        if (!o || o.kind !== 'switch' || !oi || !oi.channel) { g.members[n] = 'I'; continue; }
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
    for (const [id] of dom) {
      const d = w.devices[id];
      if (id === clientId) continue;
      if (d.kind === 'pc' && d.pc.server && d.pc.ip && passes(id, 'NIC')) { got = offer(d, ipToInt(d.pc.ip)); if (got) { via = id; break; } }
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
          const srv = Object.values(w.devices).find((x) => x.kind === 'pc' && x.pc.server && x.pc.ip === h);
          if (!srv) continue;
          const go = forward(w, id, ipToInt(h), cache);
          if (!go.ok || go.dstDev !== srv.id) continue;
          const back = forward(w, srv.id, gi, cache);
          if (!back.ok || back.dstDev !== id) continue;
          got = offer(srv, gi);
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

  TT.net = { computeStp, computeEc, dhcpRenew, aclPermits, computeEigrp, vipsOf, ping6, routingTable6, psTick, pcMac, remoteLogin, arpOk, l2Path, makeWorld, linkPeer, linkUp, adminUp, l2Domain, computeOspf, routingTable, routerId, ping, ipOf, prefixOf, l3Up, clone };

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
      if (/^[a-z-]+$/i.test(t) && raw[i + 1] && /^\d+(\/\d+)+(\.\d+)?$/.test(raw[i + 1]) && canonIf(t + raw[i + 1])) {
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

      const tokens = tokenize(text);
      const tree = this.treeFor(d);
      let res = match(tree, tokens);

      // IOS lets you type global config commands from a sub-mode.
      if (res.error && ['if', 'vlan', 'router', 'eigrp', 'line'].includes(d.mode)) {
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
      if (!node && ['if', 'vlan', 'router', 'eigrp', 'line'].includes(d.mode)) node = walk(this.trees[d.kind + ':config'], tokens);
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
          n.padEnd(23) + (i.ip || 'unassigned').padEnd(16) + 'YES ' + (i.ip ? 'manual ' : 'unset  ') + status.padEnd(22) + proto
        );
      }
      return lines;
    };

    const showRun = (d) => {
      const L = ['Building configuration...', '', 'Current configuration : ' + (900 + Object.keys(d.interfaces).length * 60) + ' bytes', '!', 'version 15.2', d.pwEnc ? 'service password-encryption' : 'no service password-encryption', '!', 'hostname ' + d.hostname, '!'];
      if (d.enableSecret) L.push('enable secret 5 $1$mERr$' + hex4(d.enableSecret) + 'Qk1rP0tT9vD/', '!');
      if (d.domain) L.push('ip domain-name ' + d.domain);
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
        if (d.kind === 'switch') {
          if (i.channel) L.push(` channel-group ${i.channel.group} mode ${i.channel.mode}`);
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
          if (i.mode === 'trunk') {
            if (i.trunkAllowed !== 'all') L.push(' switchport trunk allowed vlan ' + fmtVlans(i.trunkAllowed));
            L.push(' switchport mode trunk');
          } else {
            if (i.accessVlan !== 1) L.push(' switchport access vlan ' + i.accessVlan);
            if (i.modeSet) L.push(' switchport mode access');
          }
        } else {
          L.push(i.ip ? ` ip address ${i.ip} ${i.mask}` : ' no ip address');
          for (const x of i.ipv6 || []) L.push(` ipv6 address ${x.addr}/${x.p}`);
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
        for (const p of d.ospf.passive || []) L.push(' passive-interface ' + p);
        for (const n of d.ospf.networks || []) L.push(` network ${n.net} ${n.wild} area ${n.area}`);
        L.push('!');
      }
      if (d.eigrp) {
        L.push('router eigrp ' + d.eigrp.as);
        for (const p of d.eigrp.passive || []) L.push(' passive-interface ' + p);
        for (const n of d.eigrp.networks || []) L.push(' network ' + n.net + (n.wild ? ' ' + n.wild : ''));
        L.push('!');
      }
      if (d.nat && d.nat.list) L.push(`ip nat inside source list ${d.nat.list} interface ${d.nat.outIf} overload`);
      for (const r of d.routes6 || []) L.push(`ipv6 route ${r.pfx} ${r.nh}`);
      for (const r of d.routes || []) L.push(`ip route ${r.net} ${r.mask} ${r.nh || r.exitIf}`);
      for (const [num, list] of Object.entries(d.acls || {})) for (const e of list) L.push(`access-list ${num} ${e.text}`);
      if (d.stp && d.stp.prio) for (const [v, pr] of Object.entries(d.stp.prio)) L.push(`spanning-tree vlan ${v} priority ${pr}`);
      if ((d.routes || []).length) L.push('!');
      const vty = d.vty || { transport: ['telnet'], login: null };
      L.push('line con 0', '!', 'line vty 0 15');
      if (vty.password) L.push(' password ' + (d.pwEnc ? '7 0822455D0A16' : vty.password));
      if (vty.login === 'local') L.push(' login local');
      else if (vty.login === 'password') L.push(' login');
      L.push(' transport input ' + ((vty.transport || []).length ? vty.transport.join(' ') : 'none'), '!', 'end');
      return L;
    };

    const showIpRoute = (d) => {
      const cache = computeOspf(w);
      const rt = routingTable(w, d.id, cache);
      const L = [
        'Codes: L - local, C - connected, S - static, O - OSPF, D - EIGRP',
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
          L.push(r.nh ? `${star}       ${pfx} [${r.ad}/0] via ${r.nh}` : `${star}       ${pfx} is directly connected, ${r.if}`);
        } else if (r.type === 'O') L.push(`O        ${pfx} [110/${r.cost + 1}] via ${r.nh}, 00:01:12, ${r.if}`);
        else if (r.type === 'D') L.push(`D        ${pfx} [90/${r.metric}] via ${r.nh}, 00:02:41, ${r.if}`);
      }
      return L;
    };

    const showVlanBrief = (d) => {
      const L = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
      for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
        const ports = Object.entries(d.interfaces)
          .filter(([, i]) => i.mode !== 'trunk' && i.accessVlan === v)
          .map(([n]) => shortIf(n))
          .sort(ifSort);
        L.push(String(v).padEnd(5) + d.vlans[v].padEnd(33) + 'active    ' + ports.join(', '));
      }
      return L;
    };

    const showIntTrunk = (d) => {
      const trunks = Object.entries(d.interfaces).filter(([, i]) => i.mode === 'trunk');
      if (!trunks.length) return [''];
      const L = ['', 'Port        Mode             Encapsulation  Status        Native vlan'];
      for (const [n] of trunks) L.push(shortIf(n).padEnd(12) + 'on'.padEnd(17) + '802.1q'.padEnd(15) + (linkUp(w, d.id, n) ? 'trunking' : 'not-trunking').padEnd(14) + '1');
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
        const state = ipToInt(rid) > ipToInt(me) ? 'FULL/DR' : 'FULL/BDR';
        L.push(rid.padEnd(16) + '1'.padEnd(6) + state.padEnd(16) + '00:00:3' + (a.b.length % 10) + '    ' + intToIp(ipOf(w, a.b, a.bIf)).padEnd(16) + a.aIf);
      }
      return L;
    };

    const showOspfIntBrief = (d) => {
      if (!d.ospf) return ['% OSPF: No router process is configured'];
      const L = ['Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C'];
      const { adj } = computeOspf(w);
      for (const n of Object.keys(d.interfaces).sort(ifSort)) {
        const area = ospfIfArea(d, n);
        if (area === null) continue;
        const i = d.interfaces[n];
        const nb = adj.filter((x) => x.a === d.id && x.aIf === n).length;
        const st = !linkUp(w, d.id, n) ? 'DOWN' : (d.ospf.passive || []).includes(n) ? 'DR' : nb ? 'DR' : 'WAIT';
        L.push(shortIf(n).padEnd(13) + String(d.ospf.pid).padEnd(6) + area.padEnd(16) + (i.ip + '/' + maskToPrefix(i.mask)).padEnd(19) + '1'.padEnd(6) + st.padEnd(6) + `${nb}/${nb}`);
      }
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
        const rootDev = w.devices[st.root.dev];
        const rp = st.rootPort[d.id];
        L.push('', 'VLAN' + String(vlan).padStart(4, '0'), '  Spanning tree enabled protocol ieee');
        L.push(`  Root ID    Priority    ${st.root.pr}`, `             Address     ${st.root.mac}`);
        if (st.root.dev === d.id) L.push('             This bridge is the root');
        else L.push(`             Cost        ${st.cost[d.id]}`, `             Port        ${st.ids[d.id][rp]} (${rp})`);
        L.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '');
        L.push(`  Bridge ID  Priority    ${me.pr}  (priority ${me.pr - vlan} sys-id-ext ${vlan})`, `             Address     ${me.mac}`, '');
        L.push('Interface           Role Sts Cost      Prio.Nbr Type', '------------------- ---- --- --------- -------- --------------------------------');
        for (const [n, pp] of Object.entries(st.ports[d.id] || {}).sort((a, b) => ifSort(a[0], b[0]))) {
          const ii = d.interfaces[n];
          L.push(shortIf(n).padEnd(20) + pp.role.padEnd(5) + pp.sts.padEnd(4) + String(pp.cost).padEnd(10) + ('128.' + st.ids[d.id][n]).padEnd(9) + 'P2p' + (ii.portfast ? ' Edge' : ''));
        }
        rootDev && 0;
      }
      return L;
    };
    const showEc = (d) => {
      const groups = computeEc(w, d.id);
      const L = ['Flags:  D - down        P - bundled in port-channel', '        I - stand-alone s - suspended', '        S - Layer2      U - in use', '', `Number of channel-groups in use: ${Object.keys(groups).length}`, `Number of aggregators:           ${Object.keys(groups).length}`, '', 'Group  Port-channel  Protocol    Ports', '------+-------------+-----------+-----------------------------------------------'];
      for (const [num, g] of Object.entries(groups)) {
        const ports = Object.entries(g.members).sort((a, b) => ifSort(a[0], b[0])).map(([n, f]) => `${shortIf(n)}(${f})`).join('  ');
        L.push(String(num).padEnd(7) + `Po${num}(S${g.up ? 'U' : 'D'})`.padEnd(14) + g.proto.padEnd(12) + ports);
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
        L.push(shortIf(n).padEnd(10) + (i.desc || '').slice(0, 18).padEnd(19) + st.padEnd(13) + (i.mode === 'trunk' ? 'trunk' : String(i.accessVlan)).padEnd(11) + (st === 'connected' ? 'a-full' : 'auto').padEnd(8) + (st === 'connected' ? (/^Gi/.test(n) ? 'a-1000' : 'a-100') : 'auto').padEnd(6) + (/^Gig/.test(n) ? '10/100/1000BaseTX' : '10/100BaseTX'));
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
        if (kind === 'switch') return !/ip route|ospf|access-lists|nat|ipv6|standby|eigrp|ip ssh/.test(p);
        if (kind === 'router') return !/vlan brief|interfaces trunk|spanning|etherchannel|port-security|interfaces status|snooping|arp inspection/.test(p);
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
        const m = /^([a-z-]+)(\d+\/)(\d+)(?:-(\d+))?$/i.exec(part);
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

    const routerConfig = build([
      ...configCommon('router'),
      ['ip route <ip> <mask> <nhop>', (d, [net, mask, nh]) => {
        const r = { net, mask };
        if (ipToInt(nh) !== null) r.nh = nh; else r.exitIf = canonIf(nh);
        if (netOf(ipToInt(net), maskToPrefix(mask)) !== ipToInt(net)) throw new Error('Inconsistent address and mask');
        if (!d.routes.some((x) => x.net === net && x.mask === mask && (x.nh || x.exitIf) === (r.nh || r.exitIf))) d.routes.push(r);
        ev({ type: 'route', dev: d.id });
        return [];
      }, 'Establish static routes'],
      ['no ip route <ip> <mask> <nhop>', (d, [net, mask, nh]) => {
        const before = d.routes.length;
        const nhC = ipToInt(nh) !== null ? nh : canonIf(nh);
        d.routes = d.routes.filter((x) => !(x.net === net && x.mask === mask && (x.nh || x.exitIf) === nhC));
        if (d.routes.length === before) return ['%No matching route to delete'];
        return [];
      }, 'Negate a command'],
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
      ['ip domain-name <word>', (d, [n]) => { d.domain = n; return []; }, 'Define the default domain name'],
      ['ip domain name <word>', (d, [n]) => { d.domain = n; return []; }, 'Define the default domain name'],
      ['crypto key generate rsa', (d) => genRsa(d, 1024), 'Generate RSA keys'],
      ['crypto key generate rsa modulus <num>', (d, [m]) => genRsa(d, Number(m)), 'Generate RSA keys'],
      ['username <word> secret <word>', (d, [u, pw]) => { d.users = d.users || {}; d.users[u] = { secret: pw }; ev({ type: 'user', dev: d.id }); return []; }, 'Establish User Name Authentication'],
      ['username <word> password <word>', (d, [u, pw]) => { d.users = d.users || {}; d.users[u] = { password: pw }; ev({ type: 'user', dev: d.id }); return []; }, 'Establish User Name Authentication'],
      ['enable secret <word>', (d, [pw]) => { d.enableSecret = pw; return []; }, 'Assign the privileged level secret'],
      ['service password-encryption', (d) => { d.pwEnc = true; return []; }, 'Encrypt system passwords'],
      ['ip ssh version <num>', (d, [v]) => {
        if (v !== '1' && v !== '2') throw new Error('SSH version must be 1 or 2.');
        if (v === '2' && (!d.rsa || d.rsa < 768)) return ['Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).'];
        d.sshver = Number(v);
        ev({ type: 'ssh', dev: d.id });
        return [];
      }, 'Specify protocol version supported'],
      ['line vty <num> <num>', (d) => { d.vty = d.vty || { transport: ['telnet'], login: null }; d.mode = 'line'; d.ctx = 'vty'; return []; }, 'Configure a terminal line'],
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
      ['no ip address', (d) => { const i = d.interfaces[d.ctx]; delete i.ip; delete i.mask; return []; }, 'Negate a command'],
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
      ['standby <num> ip <ip>', (d, [g, ip]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { ip }); ev({ type: 'hsrp', dev: d.id }); return [`%HSRP-5-STATECHANGE: ${d.ctx} Grp ${g} state Speak -> Standby`]; }, 'HSRP interface configuration commands'],
      ['standby <num> priority <num>', (d, [g, pr]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { prio: Number(pr) }); ev({ type: 'hsrp', dev: d.id }); return []; }, 'Priority level'],
      ['standby <num> preempt', (d, [g]) => { const i = d.interfaces[d.ctx]; i.standby = i.standby || {}; i.standby[g] = Object.assign(i.standby[g] || {}, { preempt: true }); ev({ type: 'hsrp', dev: d.id }); return []; }, 'Overthrow lower priority Active routers'],
      ['no standby <num> preempt', (d, [g]) => { const i = d.interfaces[d.ctx]; if (i.standby && i.standby[g]) delete i.standby[g].preempt; return []; }, 'Negate a command'],
      ['no standby <num>', (d, [g]) => { const i = d.interfaces[d.ctx]; if (i.standby) delete i.standby[g]; ev({ type: 'hsrp', dev: d.id }); return []; }, 'Negate a command'],
      ['encapsulation dot1q <vlan> native', (d, [v]) => setEncap(d, v, true), 'Set encapsulation type for an interface'],
      ['ip access-group <num> in', (d, [n]) => { d.interfaces[d.ctx].aclIn = Number(n); ev({ type: 'acl', dev: d.id }); return []; }, 'Specify access control for packets'],
      ['ip access-group <num> out', (d, [n]) => { d.interfaces[d.ctx].aclOut = Number(n); ev({ type: 'acl', dev: d.id }); return []; }, 'Specify access control for packets'],
      ['no ip access-group <num> in', (d) => { delete d.interfaces[d.ctx].aclIn; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['no ip access-group <num> out', (d) => { delete d.interfaces[d.ctx].aclOut; ev({ type: 'acl', dev: d.id }); return []; }, 'Negate a command'],
      ['ip nat inside', (d) => { d.interfaces[d.ctx].nat = 'inside'; ev({ type: 'nat', dev: d.id }); return []; }, 'Inside interface for address translation'],
      ['ip nat outside', (d) => { d.interfaces[d.ctx].nat = 'outside'; ev({ type: 'nat', dev: d.id }); return []; }, 'Outside interface for address translation'],
      ['no ip nat inside', (d) => { delete d.interfaces[d.ctx].nat; return []; }, 'Negate a command'],
      ['no ip nat outside', (d) => { delete d.interfaces[d.ctx].nat; return []; }, 'Negate a command'],
      ['ip helper-address <ip>', (d, [h]) => { const i = d.interfaces[d.ctx]; i.helpers = i.helpers || []; if (!i.helpers.includes(h)) i.helpers.push(h); ev({ type: 'helper', dev: d.id }); return []; }, 'Specify a destination address for UDP broadcasts'],
      ['no ip helper-address <ip>', (d, [h]) => { const i = d.interfaces[d.ctx]; i.helpers = (i.helpers || []).filter((x) => x !== h); return []; }, 'Negate a command'],
      ['shutdown', (d) => { d.interfaces[d.ctx].shutdown = true; ev({ type: 'shut', dev: d.id }); return linkMsgs(d, d.ctx); }, 'Shutdown the selected interface'],
      ['no shutdown', (d) => { d.interfaces[d.ctx].shutdown = false; ev({ type: 'noshut', dev: d.id }); return linkMsgs(d, d.ctx); }, 'Negate a command'],
      ['description <rest>', (d, [t]) => { d.interfaces[d.ctx].desc = t; return []; }, 'Interface specific description'],
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
      ['switchport mode access', (d) => { each(d, (i) => { i.mode = 'access'; i.modeSet = true; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set trunking mode of the interface'],
      ['switchport mode trunk', (d) => { each(d, (i) => { i.mode = 'trunk'; }); ev({ type: 'sw', dev: d.id }); return []; }, 'Set trunking mode of the interface'],
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
          d.interfaces['Port-channel' + g] = { mode: 'access', accessVlan: 1, trunkAllowed: 'all', shutdown: false };
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
      ['router-id <ip>', (d, [rid]) => { d.ospf.routerId = rid; return ['% OSPF: Reload or use "clear ip ospf process" command, for this to take effect']; }, 'router-id for this OSPF process'],
      ['passive-interface <if>', (d, [n]) => { const c = canonIf(n); if (!d.ospf.passive.includes(c)) d.ospf.passive.push(c); ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Suppress routing updates on an interface'],
      ['no passive-interface <if>', (d, [n]) => { const c = canonIf(n); d.ospf.passive = d.ospf.passive.filter((x) => x !== c); ev({ type: 'ospfnet', dev: d.id }); return []; }, 'Negate a command'],
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
        const words = t.toLowerCase().split(/\s+/);
        for (const x of words) if (!['ssh', 'telnet', 'all', 'none'].includes(x)) throw new Error('transport input takes ssh, telnet, all or none.');
        d.vty.transport = words.includes('none') ? [] : words;
        ev({ type: 'vty', dev: d.id });
        return [];
      }, 'Define which protocols to use when connecting to the terminal server'],
      ['login local', (d) => { d.vty.login = 'local'; ev({ type: 'vty', dev: d.id }); return []; }, 'Local password checking'],
      ['login', (d) => { d.vty.login = 'password'; ev({ type: 'vty', dev: d.id }); return d.vty.password ? [] : ['% Login disabled on line 2, until \'password\' is set']; }, 'Enable password checking'],
      ['no login', (d) => { d.vty.login = null; return []; }, 'Negate a command'],
      ['password <word>', (d, [pw]) => { d.vty.password = pw; return []; }, 'Set a password'],
      ['exec-timeout <num> <num>', (d, [m, sec]) => { d.vty.timeout = [Number(m), Number(sec)]; return []; }, 'Set the EXEC timeout'],
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
      'switch:user': userTree('switch'),
      'switch:priv': privTree('switch'),
      'switch:config': switchConfig,
      'switch:if': switchIf,
      'switch:vlan': vlanMode,
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
