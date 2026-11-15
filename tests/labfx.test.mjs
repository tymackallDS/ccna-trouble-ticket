// Diagram effects (labfx): TT.net.tracePath follows the simulator's own forwarding cable by cable.
// Run with: node --test tests/labfx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/engine.js');
await import('../src/scenarios.js');
await import('../src/sandbox.js');
await import('../src/projects.js');
const { TT } = globalThis;

const ticket = (id) => TT.tickets.byId[id];
const fresh = (id) => TT.net.makeWorld(ticket(id).world);
function solved(id) {
  const t = ticket(id);
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const [dev, cmds] of Object.entries(t.solution)) for (const c of cmds) s.run(dev, c);
  return w;
}
const hasLink = (w, k) => w.links.some(([a, ai, b, bi]) => (a === k.a && ai === k.ai && b === k.b && bi === k.bi) || (a === k.b && ai === k.bi && b === k.a && bi === k.ai));
/** Every cable is a real cable, and each one starts where the last one ended. */
function assertChain(w, leg, from) {
  let at = from;
  for (const k of leg.cables) {
    assert.ok(hasLink(w, k), `not a cable: ${JSON.stringify(k)}`);
    assert.equal(k.a, at, `cable ${k.a} ${k.ai} does not start at ${at}`);
    at = k.b;
  }
  return at;
}

test('success: the echo and the reply follow real cables end to end (t19 solved)', () => {
  const w = solved('t19');
  const r = TT.net.tracePath(w, 'PC', '10.40.0.10');
  assert.equal(r.ok, true);
  assert.equal(r.fail, null);
  assert.deepEqual(r.there.devs, ['PC', 'R3', 'SW', 'R1', 'R4', 'SRV']);
  assert.deepEqual(r.back.devs, ['SRV', 'R4', 'R1', 'SW', 'R3', 'PC']);
  assert.equal(assertChain(w, r.there, 'PC'), 'SRV');
  assert.equal(assertChain(w, r.back, 'SRV'), 'PC');
  // the routed hops, with the address each one received the packet on
  assert.deepEqual(r.there.l3.map((h) => h.dev), ['R3', 'R1', 'R4', 'SRV']);
  assert.ok(r.there.l3.every((h) => /^\d+\.\d+\.\d+\.\d+$/.test(h.ip)));
  assert.equal(r.there.l3[3].ip, '10.40.0.10');
});

test('failure point: no route stops the packet at the router that has no route (t19 start)', () => {
  const w = fresh('t19');
  const r = TT.net.tracePath(w, 'PC', '10.40.0.10');
  assert.equal(r.ok, false);
  assert.deepEqual(r.fail, { at: 'R3', leg: 'there', reason: 'no-route' });
  assert.deepEqual(r.there.devs, ['PC', 'R3']);
  assert.equal(r.back, null);
});

test('failure point: an ACL drop is placed on the router that applies it, on the right leg (t11 solved)', () => {
  const w = solved('t11');
  const a = TT.net.tracePath(w, 'GUEST', '10.0.30.10');
  assert.equal(a.ok, false);
  assert.deepEqual(a.fail, { at: 'R1', leg: 'there', reason: 'acl', dir: 'in', ip: '10.0.20.1' });
  assert.deepEqual(a.there.devs, ['GUEST', 'R1']);
  // the echo gets through, the reply is the one that dies
  const b = TT.net.tracePath(w, 'FIN', '10.0.20.10');
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'no-return-path');
  assert.equal(b.fail.at, 'R1');
  assert.equal(b.fail.leg, 'back');
  assert.equal(b.fail.reason, 'acl');
  assert.deepEqual(b.there.devs, ['FIN', 'SW', 'R1', 'GUEST']);
  assert.deepEqual(b.back.devs, ['GUEST', 'R1']);
});

test('failure point: wrong VLAN or a shut link means no ARP reply, so the sender never sends', () => {
  const w = fresh('t03'); // the printer port is in the wrong VLAN
  const r = TT.net.tracePath(w, 'PCS1', '10.10.10.50');
  assert.deepEqual(r.fail, { at: 'PCS1', leg: 'there', reason: 'host-unreachable' });
  assert.deepEqual(r.there.cables, []);
  const w2 = solved('t19');
  const s = new TT.Session(w2);
  for (const c of ['enable', 'configure terminal', 'interface g0/1', 'shutdown']) s.run('R4', c);
  const r2 = TT.net.tracePath(w2, 'PC', '10.40.0.10');
  assert.equal(r2.ok, false);
  // OSPF withdraws the data-center route once the link is down, so the first router drops it
  assert.deepEqual(r2.fail, { at: 'R3', leg: 'there', reason: 'no-route' });
  assert.deepEqual(r2.there.devs, ['PC', 'R3']);
});

test('Layer 2 paths avoid the port Spanning Tree blocks (t08 solved)', () => {
  const w = solved('t08');
  const blocked = Object.values(w.devices).filter((d) => d.kind === 'switch').flatMap((d) => Object.keys(d.interfaces).filter((n) => TT.net.stpBlockedVlans(w, d.id, n).length).map((n) => d.id + ' ' + n));
  assert.ok(blocked.length >= 1, 'a redundant triangle blocks one port');
  const r = TT.net.tracePath(w, 'PC1', '10.10.10.12');
  assert.equal(r.ok, true);
  assert.deepEqual(r.there.devs, ['PC1', 'ACC1', 'CORE', 'ACC2', 'PC2']);
  for (const k of r.there.cables.concat(r.back.cables)) {
    assert.ok(!blocked.includes(k.a + ' ' + k.ai) && !blocked.includes(k.b + ' ' + k.bi), 'crossed a blocked port');
  }
});

test('tracePath agrees with ping everywhere and never changes the world', () => {
  let n = 0;
  for (const t of TT.tickets) {
    for (const w of [fresh(t.id), solved(t.id)]) {
      const before = JSON.stringify(w);
      const hosts = Object.values(w.devices).filter((d) => d.kind === 'pc' && d.pc.ip);
      for (const a of hosts) for (const b of hosts) {
        const r = TT.net.tracePath(w, a.id, b.pc.ip);
        const p = TT.net.ping(TT.net.clone(w), a.id, b.pc.ip);
        assert.equal(r.ok, !!p.ok, `${t.id} ${a.id} -> ${b.pc.ip}`);
        if (!p.ok) assert.ok(r.fail && w.devices[r.fail.at], `${t.id} ${a.id} -> ${b.pc.ip}: failure has a device`);
        else if (a !== b) { assertChain(w, r.there, a.id); assertChain(w, r.back, r.there.devs[r.there.devs.length - 1]); }
        n++;
      }
      assert.equal(JSON.stringify(w), before, `${t.id}: tracePath changed the world`);
    }
  }
  assert.ok(n > 100);
});

test('NAT: the reply path is traced back through the translating router (t12 solved)', () => {
  const w = solved('t12');
  const before = JSON.stringify(w);
  const r = TT.net.tracePath(w, 'PC', '198.51.100.10');
  assert.equal(r.ok, true);
  assert.deepEqual(r.back.devs, ['WEB', 'ISP', 'R1', 'PC']);
  assert.equal(JSON.stringify(w), before, 'no NAT entry leaked into the real world');
});

test('pinging your own address is local, and IPv6 is traced too', () => {
  const w = solved('t19');
  const r = TT.net.tracePath(w, 'PC', '10.30.0.10');
  assert.equal(r.ok, true);
  assert.equal(r.local, true);
  const w6 = solved('t13');
  const pcs = Object.values(w6.devices).filter((d) => d.kind === 'pc' && d.pc.ip6);
  assert.ok(pcs.length >= 2);
  const r6 = TT.net.tracePath(w6, pcs[0].id, pcs[1].pc.ip6);
  assert.equal(r6.v6, true);
  assert.equal(r6.ok, TT.net.ping6(w6, pcs[0].id, pcs[1].pc.ip6).ok);
  if (r6.ok) assertChain(w6, r6.there, pcs[0].id);
});

test('every guided lab project: tracePath matches ping on the reference solution', () => {
  const SB = TT.sandbox;
  let n = 0;
  for (const p of TT.labProjects) {
    let w = SB.worldFromSpec(p.start);
    let s = new TT.Session(w);
    for (const [dev, cmds] of SB.solutionSteps(p)) {
      for (const c of cmds) {
        if (dev === '_build') { w = SB.applyBuild(w, c).w; s = new TT.Session(w); continue; }
        SB.run(s, dev, c);
      }
    }
    const hosts = Object.values(w.devices).filter((d) => d.kind === 'pc' && d.pc.ip);
    for (const a of hosts) for (const b of hosts) {
      if (a === b) continue;
      const r = TT.net.tracePath(w, a.id, b.pc.ip);
      assert.equal(r.ok, !!TT.net.ping(TT.net.clone(w), a.id, b.pc.ip).ok, `${p.id} ${a.id} -> ${b.pc.ip}`);
      if (r.ok) assertChain(w, r.there, a.id);
      n++;
    }
  }
  assert.ok(n > 20);
});

test('traceroute and tracert read the traced path (t19)', () => {
  const SB = TT.sandbox;
  let w = solved('t19');
  let s = new TT.Session(w);
  const pc = SB.run(s, 'PC', 'tracert 10.40.0.10');
  assert.ok(pc.some((l) => /^\s+1\s.*10\.30\.0\.1$/.test(l)), pc.join('\n'));
  assert.ok(pc.some((l) => /^\s+4\s.*10\.40\.0\.10$/.test(l)), pc.join('\n'));
  assert.ok(pc.includes('Trace complete.'));
  SB.run(s, 'R3', 'enable');
  const ios = SB.run(s, 'R3', 'traceroute 10.40.0.10');
  assert.equal(ios[1], 'Tracing the route to 10.40.0.10');
  assert.match(ios[ios.length - 1], /^\s+3 10\.40\.0\.10 /);
  assert.ok(w.events.some((e) => e.type === 'traceroute' && e.from === 'R3' && e.ok));
  // broken: the edge router answers, then reports it has no route
  w = fresh('t19');
  s = new TT.Session(w);
  const bad = SB.run(s, 'PC', 'tracert 10.40.0.10');
  assert.ok(bad.some((l) => /10\.30\.0\.1\s+reports: Destination net unreachable\./.test(l)), bad.join('\n'));
  // not in configuration mode without "do"
  assert.equal(TT.labfx.traceTarget(Object.assign({}, w.devices.R3, { mode: 'config' }), 'traceroute 10.0.0.1'), null);
  assert.equal(TT.labfx.traceTarget(Object.assign({}, w.devices.R3, { mode: 'config' }), 'do traceroute 10.0.0.1'), '10.0.0.1');
});

test('labfx layout keeps port labels clear of device names (geometry helper)', () => {
  const L = TT.labfx && TT.labfx.layout;
  assert.equal(typeof L, 'function');
  const nodes = [
    { id: 'A', x: 100, y: 60, shape: { l: -21, r: 21, t: -21, b: 21 }, lines: [{ text: 'HPL-EDGE', w: 60, h: 13 }] },
    { id: 'B', x: 100, y: 200, shape: { l: -19, r: 19, t: -16, b: 15 }, lines: [{ text: 'PC-EDGE', w: 52, h: 13 }, { text: '10.30.0.10/24', w: 80, h: 12 }] },
    { id: 'C', x: 300, y: 90, shape: { l: -28, r: 28, t: -15, b: 15 }, lines: [{ text: 'HPL-CORE-LAN', w: 84, h: 13 }] },
  ];
  const links = [{ a: 'A', b: 'B', la: { text: 'Gi0/1', w: 32, h: 12 }, lb: null }, { a: 'A', b: 'C', la: { text: 'Gi0/0', w: 32, h: 12 }, lb: { text: 'Gi0/2', w: 32, h: 12 } }];
  const out = L(nodes, links);
  const boxes = [];
  for (const n of nodes) boxes.push(out.nodes[n.id].label, out.nodes[n.id].glyph);
  for (const k of out.links) for (const p of [k.pa, k.pb]) if (p) {
    for (const b of boxes) assert.ok(!TT.labfx.overlap(p.box, b), `${p.text} overlaps ${JSON.stringify(b)}`);
  }
});
